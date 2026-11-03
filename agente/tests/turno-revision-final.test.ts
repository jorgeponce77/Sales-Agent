import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { calcularDiagnostico } from 'motor-sales-agent';
import type { ClienteModelo } from '../src/conversacion/cliente.js';
import { formatearTranscripcion } from '../src/conversacion/transcripcion.js';
import { ejecutarTurno, iniciarSesion } from '../src/conversacion/turno.js';
import { crearOportunidad } from '../src/ficha.js';
import { VERSION_INSTRUCCIONES } from '../src/instrucciones/base.js';
import { construirInstrucciones } from '../src/instrucciones/construir.js';
import type { Oportunidad, SesionActual } from '../src/tipos.js';
import { crearClienteFalso, texto, usarHerramienta, usarHerramientas } from './clienteFalso.js';
import { fichaBase } from './fabrica.js';

type Message = Anthropic.Messages.Message;
type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;

const HOY = '2026-11-02';
const FALLBACK = 'Perdón, se me cortó la respuesta. ¿Me lo repites en pocas palabras?';
const INTERRUMPIDA = 'Sesión interrumpida sin cierre del agente.';
const RECHAZO = 'No puedo ayudar con eso; sigamos con la oportunidad.';
const BUDGET = { campo: 'bant.budget', valor: '300 mil USD aprobados', nivel: 'confirmado', fuente: 'CFO' };

const opNueva = (): Oportunidad => crearOportunidad(fichaBase({ cliente: 'Distribuidora Gamma Ficticia', idCRM: 'OPP-GAMMA-1' }));

const sesionCon = (over: Partial<SesionActual> = {}): SesionActual => ({
  modo: 'calificar', inicio: HOY, turnosVendedor: 0, versionInstrucciones: VERSION_INSTRUCCIONES,
  historial: [], transcripcion: [], ...over,
});

type Bloque = { type: string; id?: string; tool_use_id?: string; text?: string };
type MensajeApi = { role: 'user' | 'assistant'; content: string | Bloque[] };
const bloques = (m: MensajeApi | undefined): Bloque[] =>
  m === undefined ? [] : typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;

/** Empieza con usuario, alterna roles, sin vacíos, y cada tool_use con su tool_result en el siguiente. */
function esperarHistorialValido(historial: unknown[]): void {
  const ms = historial as MensajeApi[];
  expect(ms[0]?.role).toBe('user');
  ms.forEach((m, i) => {
    if (i > 0) expect(m.role).not.toBe(ms[i - 1]?.role);
    expect(bloques(m).length).toBeGreaterThan(0);
    if (m.role !== 'assistant') return;
    const ids = bloques(m).filter((b) => b.type === 'tool_use').map((b) => b.id);
    if (ids.length === 0) return;
    expect(bloques(ms[i + 1]).filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id)).toEqual(ids);
  });
}

/** Cliente falso que adelanta un reloj inyectado `paso` ms en cada llamada. */
function clienteConReloj(guion: Array<Partial<Message> | Error>, paso: number): { cliente: ClienteModelo & { llamadas: Params[] }; ahora: () => number } {
  let t = 0;
  const base = crearClienteFalso(guion);
  return {
    ahora: () => t,
    cliente: {
      llamadas: base.llamadas,
      async crear(p) {
        const r = await base.crear(p);
        t += paso;
        return r;
      },
    },
  };
}

describe('tope de 40 mensajes (Importante 1)', () => {
  it('cierre forzado sin cerrar_sesion: archiva como interrumpida y no cuenta más allá de 40', async () => {
    const cliente = crearClienteFalso([texto('Vamos a cerrar.')]);
    const op = opNueva();
    op.sesionActual = sesionCon({ turnosVendedor: 40 });
    const r = await ejecutarTurno(op, 'una cosa más', { cliente, hoy: HOY });
    expect(r.error).toBeNull();
    expect(r.oportunidad.sesionActual).toBeNull();
    const archivada = r.oportunidad.sesiones.at(-1);
    expect(archivada?.resumen).toBe(INTERRUMPIDA);
    expect(archivada?.transcripcion.map((m) => m.texto)).toEqual(['una cosa más', 'Vamos a cerrar.']);
    expect(archivada?.foto?.expediente).toEqual(r.oportunidad.expediente);
    expect(archivada?.foto?.diagnostico).toEqual(r.oportunidad.ultimoDiagnostico);
    expect(r.eventos.filter((e) => e.tipo === 'sesion')).toHaveLength(1);
    expect(r.eventos[0]?.descripcion).toContain(INTERRUMPIDA);
    expect(r.oportunidad.eventos).toEqual(r.eventos);
  });

  it('cierre forzado con cerrar_sesion: se archiva con el resumen del agente', async () => {
    const cliente = crearClienteFalso([usarHerramienta('cerrar_sesion', { resumen: 'Resumen al tope.' }), texto('Cerramos.')]);
    const op = opNueva();
    op.sesionActual = sesionCon({ turnosVendedor: 40 });
    const r = await ejecutarTurno(op, 'otra', { cliente, hoy: HOY });
    expect(r.oportunidad.sesionActual).toBeNull();
    expect(r.oportunidad.sesiones.map((s) => s.resumen)).toEqual(['Resumen al tope.']);
  });

  it('el mensaje 40 todavía no fuerza el cierre y deja el contador en 40', async () => {
    const cliente = crearClienteFalso([texto('Sigue.')]);
    const op = opNueva();
    op.sesionActual = sesionCon({ turnosVendedor: 39 });
    const r = await ejecutarTurno(op, 'el mensaje 40', { cliente, hoy: HOY });
    expect(JSON.stringify(cliente.llamadas[0]?.messages)).not.toContain('terminar la sesión');
    expect(r.oportunidad.sesionActual?.turnosVendedor).toBe(40);
  });

  it('Terminar sesión sin texto no cuenta como mensaje del vendedor (Menor 11)', async () => {
    const cliente = crearClienteFalso([texto('¿Seguro? Antes dime quién firma.')]);
    const op = opNueva();
    op.sesionActual = sesionCon({ turnosVendedor: 3 });
    const r = await ejecutarTurno(op, '   ', { cliente, hoy: HOY, cerrar: true });
    expect(r.oportunidad.sesionActual?.turnosVendedor).toBe(3);
  });
});

describe('foto por sesión (Importante 3)', () => {
  it('cerrar_sesion guarda la foto del expediente y del diagnóstico', async () => {
    const cliente = crearClienteFalso([
      usarHerramientas([{ name: 'registrar_dato', input: BUDGET }, { name: 'cerrar_sesion', input: { resumen: 'Cierre con foto.' } }]),
      texto('Listo.'),
    ]);
    const r = await ejecutarTurno(opNueva(), 'El CFO aprobó 300 mil', { cliente, hoy: HOY, cerrar: true });
    const foto = r.oportunidad.sesiones[0]?.foto;
    expect(foto?.expediente.bant.budget.nivel).toBe('confirmado');
    expect(foto?.expediente).toEqual(r.oportunidad.expediente);
    expect(foto?.diagnostico).toEqual(calcularDiagnostico(r.oportunidad.expediente, HOY));
    // Es una copia: no comparte referencias con el expediente vivo.
    expect(foto?.expediente).not.toBe(r.oportunidad.expediente);
  });

  it('la sesión abierta archivada por iniciarSesion (R14) también lleva foto', async () => {
    const cliente = crearClienteFalso([texto('Hola.'), usarHerramienta('registrar_dato', BUDGET), texto('Anotado.'), texto('Nueva.')]);
    const a = await iniciarSesion(opNueva(), 'calificar', { cliente, hoy: HOY });
    const b = await ejecutarTurno(a.oportunidad, 'presupuesto', { cliente, hoy: HOY });
    const c = await iniciarSesion(b.oportunidad, 'calificar', { cliente, hoy: '2026-11-03' });
    const foto = c.oportunidad.sesiones[0]?.foto;
    expect(foto?.expediente).toEqual(b.oportunidad.expediente);
    expect(foto?.diagnostico).toEqual(calcularDiagnostico(b.oportunidad.expediente, '2026-11-03'));
  });

  it('la memoria del agente usa solo el resumen, no la foto', () => {
    const op = opNueva();
    const fotoExp = structuredClone(op.expediente);
    fotoExp.influencias.push({
      personaId: 'p-x', nombre: 'Persona Solo En La Foto K4', roles: ['E'], grado: null, modo: null, calificacion: null,
      contactada: false, nuevaEnPuesto: false, trDeclaracion: null, prioridad: null,
    });
    op.sesiones.push({
      fecha: '2026-10-30', modo: 'calificar', resumen: 'Resumen visible.', versionInstrucciones: VERSION_INSTRUCCIONES,
      transcripcion: [], foto: { expediente: fotoExp, diagnostico: calcularDiagnostico(fotoExp, '2026-10-30') },
    });
    const { variable } = construirInstrucciones(op, 'calificar', HOY, calcularDiagnostico(op.expediente, HOY));
    expect(variable).toContain('Resumen visible.');
    expect(variable).not.toContain('K4');
  });

  it('formatearTranscripcion muestra la tendencia: semáforo e índice de cada sesión pasada', () => {
    const op = opNueva();
    const d = calcularDiagnostico(op.expediente, '2026-10-30');
    op.sesiones.push(
      { fecha: '2026-10-30', modo: 'calificar', resumen: 'Uno.', versionInstrucciones: VERSION_INSTRUCCIONES, transcripcion: [], foto: { expediente: op.expediente, diagnostico: d } },
      { fecha: '2026-10-31', modo: 'calificar', resumen: 'Dos (formato viejo, sin foto).', versionInstrucciones: VERSION_INSTRUCCIONES, transcripcion: [] },
      { fecha: '2026-11-01', modo: 'calificar', resumen: 'Tres.', versionInstrucciones: VERSION_INSTRUCCIONES, transcripcion: [], foto: { expediente: op.expediente, diagnostico: null } },
    );
    const t = formatearTranscripcion(op);
    expect(t).toContain(`Al cierre: semáforo ${d.indice.semaforo} · índice ${d.indice.total}/100`);
    expect(t).toContain('Al cierre: sin diagnóstico');
    expect(t.match(/Al cierre:/g)).toHaveLength(2);
    expect(t.indexOf('Uno.')).toBeLessThan(t.indexOf('Al cierre: semáforo'));
  });
});

describe('presupuesto de tiempo del turno (Importante 4)', () => {
  it('al pasar limiteMs, la siguiente llamada es la final sin herramientas', async () => {
    const { cliente, ahora } = clienteConReloj([
      usarHerramienta('registrar_dato', BUDGET),
      usarHerramienta('registrar_influencia', { nombre: 'Laura Méndez' }),
      texto('Anotado todo.'),
    ], 150_000);
    const r = await ejecutarTurno(opNueva(), 'te cuento', { cliente, hoy: HOY, limiteMs: 240_000, ahora });
    expect(cliente.llamadas).toHaveLength(3);
    expect(cliente.llamadas[0]?.tool_choice).toBeUndefined();
    expect(cliente.llamadas[1]?.tool_choice).toBeUndefined();
    expect(cliente.llamadas[2]?.tool_choice).toEqual({ type: 'none' });
    expect(r.oportunidad.expediente.influencias).toHaveLength(1);
    expect(r.respuestas).toEqual(['Anotado todo.']);
  });

  it('si vuelve a pasarse (reintento tras corte), se detiene tras los resultados con el respaldo', async () => {
    const cortada: Partial<Message> = {
      role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }] as unknown as Message['content'], stop_reason: 'max_tokens',
    };
    const { cliente, ahora } = clienteConReloj([
      usarHerramienta('registrar_dato', BUDGET),
      cortada,
      texto('no debería usarse'),
    ], 300_000);
    const r = await ejecutarTurno(opNueva(), 'te cuento', { cliente, hoy: HOY, limiteMs: 240_000, ahora });
    expect(cliente.llamadas).toHaveLength(2);
    expect(cliente.llamadas[1]?.tool_choice).toEqual({ type: 'none' });
    expect(r.oportunidad.expediente.bant.budget.nivel).toBe('confirmado');
    expect(r.respuestas).toEqual([FALLBACK]);
    esperarHistorialValido(r.oportunidad.sesionActual?.historial ?? []);
    expect((r.oportunidad.sesionActual?.historial.at(-1) as MensajeApi).role).toBe('assistant');
  });

  it('sin limiteMs no hay corte por tiempo', async () => {
    const { cliente, ahora } = clienteConReloj([usarHerramienta('registrar_dato', BUDGET), texto('Ok.')], 10_000_000);
    await ejecutarTurno(opNueva(), 'x', { cliente, hoy: HOY, ahora });
    expect(cliente.llamadas[1]?.tool_choice).toBeUndefined();
  });
});

describe('etapa 6 a 8 durante la sesión (Menor 6)', () => {
  it('archiva la sesión al final del turno con el último texto del agente y foto', async () => {
    const cliente = crearClienteFalso([
      usarHerramienta('actualizar_ficha', { campo: 'etapaCRM', valor: 6 }),
      texto('Lamento la pérdida; queda registrado.'),
    ]);
    const r = await ejecutarTurno(opNueva(), 'Ya la marqué como perdida en el CRM', { cliente, hoy: HOY });
    expect(r.oportunidad.cerrada).toBe(true);
    expect(r.oportunidad.sesionActual).toBeNull();
    const s = r.oportunidad.sesiones[0];
    expect(s?.resumen).toBe('Lamento la pérdida; queda registrado.');
    expect(s?.foto?.expediente).toEqual(r.oportunidad.expediente);
    expect(s?.transcripcion.map((m) => m.rol)).toEqual(['vendedor', 'agente']);
    expect(r.eventos.some((e) => e.tipo === 'sesion')).toBe(true);
  });

  it('sin texto del agente usa el resumen por defecto', async () => {
    const cliente = crearClienteFalso([usarHerramienta('actualizar_ficha', { campo: 'etapaCRM', valor: 8 }), texto('  ')]);
    const r = await ejecutarTurno(opNueva(), 'se canceló', { cliente, hoy: HOY });
    expect(r.oportunidad.sesiones[0]?.resumen).toBe('Oportunidad cerrada en el CRM durante la sesión.');
  });

  it('si además llamó a cerrar_sesion, manda su resumen', async () => {
    const cliente = crearClienteFalso([
      usarHerramientas([
        { name: 'actualizar_ficha', input: { campo: 'etapaCRM', valor: 7 } },
        { name: 'cerrar_sesion', input: { resumen: 'No adjudicada; se pierde contra la alternativa interna.' } },
      ]),
      texto('Gracias.'),
    ]);
    const r = await ejecutarTurno(opNueva(), 'no nos adjudicaron', { cliente, hoy: HOY });
    expect(r.oportunidad.sesiones.map((s) => s.resumen)).toEqual(['No adjudicada; se pierde contra la alternativa interna.']);
  });
});

describe('eventos acotados (Menor 9)', () => {
  it('la oportunidad conserva solo los últimos 300 eventos', async () => {
    const op = opNueva();
    op.eventos = Array.from({ length: 299 }, (_, i) => ({ tipo: 'dato' as const, descripcion: `viejo ${i}`, fecha: HOY }));
    const cliente = crearClienteFalso([
      usarHerramientas([{ name: 'registrar_dato', input: BUDGET }, { name: 'registrar_influencia', input: { nombre: 'Laura Méndez' } }]),
      texto('Ok.'),
    ]);
    const r = await ejecutarTurno(op, 'datos', { cliente, hoy: HOY });
    expect(r.oportunidad.eventos).toHaveLength(300);
    expect(r.oportunidad.eventos[0]?.descripcion).toBe('viejo 1');
    expect(r.oportunidad.eventos.at(-1)?.descripcion).toContain('Laura Méndez');
    expect(r.eventos).toHaveLength(2);
  });
});

describe('rechazo del modelo (Menor 11)', () => {
  it('stop_reason refusal da un texto honesto, no el respaldo de corte', async () => {
    const rechazo: Partial<Message> = { role: 'assistant', content: [] as unknown as Message['content'], stop_reason: 'refusal' as Message['stop_reason'] };
    const r = await ejecutarTurno(opNueva(), 'algo fuera de lugar', { cliente: crearClienteFalso([rechazo]), hoy: HOY });
    expect(r.respuestas).toEqual([RECHAZO]);
    expect(r.error).toBeNull();
    esperarHistorialValido(r.oportunidad.sesionActual?.historial ?? []);
  });

  it('el contenido parcial de un rechazo no se ejecuta ni se guarda', async () => {
    const rechazo: Partial<Message> = {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_r1', name: 'registrar_dato', input: BUDGET }] as unknown as Message['content'],
      stop_reason: 'refusal' as Message['stop_reason'],
    };
    const r = await ejecutarTurno(opNueva(), 'x', { cliente: crearClienteFalso([rechazo]), hoy: HOY });
    expect(r.oportunidad.expediente.bant.budget.nivel).toBe('ausente');
    expect(JSON.stringify(r.oportunidad.sesionActual?.historial)).not.toContain('toolu_r1');
  });
});

describe('textos fijos en inglés (triage)', () => {
  const EN = 'What is the status of the deal? The client has the budget.';

  it('mensaje largo, cerrada, error de API, corte y rechazo siguen el idioma del vendedor', async () => {
    const largo = await ejecutarTurno(opNueva(), `${EN} `.repeat(80), { cliente: crearClienteFalso([]), hoy: HOY });
    expect(largo.error).toBe('Your message is too long (max. 4000 characters). Summarize it or split it.');

    const cerrada = crearOportunidad(fichaBase({ etapaCRM: 7 }));
    const rc = await ejecutarTurno(cerrada, EN, { cliente: crearClienteFalso([]), hoy: HOY });
    expect(rc.respuestas).toEqual(['This opportunity is closed in the CRM (stage 7); there is nothing to qualify.']);

    const api = await ejecutarTurno(opNueva(), EN, { cliente: crearClienteFalso([new Error('529')]), hoy: HOY });
    expect(api.error).toBe("I couldn't reach the assistant. Please try again in a moment.");
    expect(api.eventos[0]?.descripcion).toBe('No hubo comunicación con el asistente; el turno no se aplicó.');

    const corte = await ejecutarTurno(opNueva(), EN, { cliente: crearClienteFalso([texto('   ')]), hoy: HOY });
    expect(corte.respuestas).toEqual(['Sorry, my answer got cut off. Could you repeat that briefly?']);

    const rechazo: Partial<Message> = { role: 'assistant', content: [] as unknown as Message['content'], stop_reason: 'refusal' as Message['stop_reason'] };
    const rr = await ejecutarTurno(opNueva(), EN, { cliente: crearClienteFalso([rechazo]), hoy: HOY });
    expect(rr.respuestas).toEqual(["I can't help with that; let's get back to the opportunity."]);
  });

  it('iniciarSesion usa el último mensaje del vendedor guardado; sin señal, español', async () => {
    const cerrada = crearOportunidad(fichaBase({ etapaCRM: 6 }));
    expect((await iniciarSesion(cerrada, 'calificar', { cliente: crearClienteFalso([]), hoy: HOY })).respuestas[0])
      .toBe('Esta oportunidad está cerrada en el CRM (etapa 6); no hay nada que calificar.');
    cerrada.sesiones.push({
      fecha: HOY, modo: 'calificar', resumen: 'x', versionInstrucciones: VERSION_INSTRUCCIONES,
      transcripcion: [{ rol: 'vendedor', texto: EN, fecha: HOY }],
    });
    expect((await iniciarSesion(cerrada, 'calificar', { cliente: crearClienteFalso([]), hoy: HOY })).respuestas[0])
      .toBe('This opportunity is closed in the CRM (stage 6); there is nothing to qualify.');
  });
});
