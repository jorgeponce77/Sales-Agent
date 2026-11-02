import type Anthropic from '@anthropic-ai/sdk';
import { calcularDiagnostico } from 'motor-sales-agent';
import { describe, expect, it } from 'vitest';
import { ESCENARIOS } from '../src/index.js';
import type { Escenario, Mensaje, Oportunidad } from '../src/index.js';
import { crearOportunidad } from '../src/ficha.js';
import { verificar } from '../evals/verificaciones.js';
import { interpretarRespuestaVendedor, responderComoVendedor } from '../evals/vendedorSimulado.js';
import { crearClienteFalso, texto } from './clienteFalso.js';
import { fichaBase } from './fabrica.js';

type Message = Anthropic.Messages.Message;

const HOY = '2026-11-02';
const E1 = ESCENARIOS.find((e) => e.id === 'E1') as Escenario;
const E5 = ESCENARIOS.find((e) => e.id === 'E5') as Escenario;

const msg = (rol: Mensaje['rol'], t: string): Mensaje => ({ rol, texto: t, fecha: HOY });

/** Oportunidad armada a mano: una sesión cerrada con los mensajes dados y un diagnóstico con las banderas dadas. */
function opCon(mensajes: Mensaje[], banderas: string[] = []): Oportunidad {
  const op = crearOportunidad(fichaBase());
  const diag = calcularDiagnostico(op.expediente, HOY);
  op.sesiones.push({ fecha: HOY, modo: 'calificar', resumen: 'r', versionInstrucciones: 'v', transcripcion: mensajes });
  op.ultimoDiagnostico = { ...diag, banderas: banderas.map((id) => ({ id, severidad: 'alta' as const, texto: id })) };
  return op;
}

const por = (esc: Escenario, op: Oportunidad, nombre: string) => {
  const v = verificar(esc, op).find((x) => x.nombre === nombre);
  if (v === undefined) throw new Error(`no existe la verificación ${nombre}`);
  return v;
};

const ES = 'Cuéntame cómo va la oportunidad con el cliente y qué le falta para cerrar en la fecha.';
const EN = 'Tell me how the opportunity is going and what is missing for the client to sign.';

describe('verificar: una_pregunta', () => {
  it('pregunta_doble_falla: un mensaje "¿A? ¿B? ¿C?" falla', () => {
    const op = opCon([msg('agente', '¿A? ¿B? ¿C?')]);
    expect(por(E1, op, 'una_pregunta').ok).toBe(false);
  });

  it('dos signos de interrogación o menos pasan, también en la sesión en curso', () => {
    const op = opCon([msg('agente', `${ES} ¿Quién decide? ¿Cuándo?`)]);
    expect(por(E1, op, 'una_pregunta').ok).toBe(true);
    op.sesionActual = {
      modo: 'calificar', inicio: HOY, turnosVendedor: 1, versionInstrucciones: 'v', historial: [],
      transcripcion: [msg('agente', '¿A? ¿B? ¿C?')],
    };
    expect(por(E1, op, 'una_pregunta').ok).toBe(false);
  });

  it('los mensajes del vendedor no cuentan', () => {
    const op = opCon([msg('vendedor', '¿A? ¿B? ¿C?'), msg('agente', ES)]);
    expect(por(E1, op, 'una_pregunta').ok).toBe(true);
  });
});

describe('verificar: idioma', () => {
  it('idioma_ingles_ok: E5 con mensajes en inglés pasa', () => {
    expect(por(E5, opCon([msg('agente', EN), msg('agente', EN)]), 'idioma').ok).toBe(true);
  });

  it('idioma_espanol_en_e5_falla', () => {
    expect(por(E5, opCon([msg('agente', ES), msg('agente', ES)]), 'idioma').ok).toBe(false);
  });

  it('un escenario distinto de E5 exige español', () => {
    expect(por(E1, opCon([msg('agente', ES)]), 'idioma').ok).toBe(true);
    expect(por(E1, opCon([msg('agente', EN)]), 'idioma').ok).toBe(false);
  });

  it('sin mensajes del agente no se puede comprobar: falla', () => {
    expect(por(E1, opCon([]), 'idioma').ok).toBe(false);
  });
});

describe('verificar: sin_personas_inventadas', () => {
  const conInfluencia = (nombre: string): Oportunidad => {
    const op = opCon([msg('agente', ES)]);
    op.expediente.influencias.push({
      personaId: 'p1', nombre, roles: ['U'], grado: null, modo: null, calificacion: null,
      contactada: true, nuevaEnPuesto: false, trDeclaracion: null, prioridad: null,
    });
    return op;
  };

  it('persona_inventada: "Laura Méndez" que no está en los hechos falla y se nombra en el detalle', () => {
    const v = por(E1, conInfluencia('Laura Méndez'), 'sin_personas_inventadas');
    expect(v.ok).toBe(false);
    expect(v.detalle).toContain('Laura Méndez');
  });

  it('un nombre completo o parcial de los hechos pasa, sin importar acentos ni mayúsculas', () => {
    expect(por(E1, conInfluencia('Héctor Salgado'), 'sin_personas_inventadas').ok).toBe(true);
    expect(por(E1, conInfluencia('hector salgado villanueva'), 'sin_personas_inventadas').ok).toBe(true);
  });

  it('sin influencias pasa', () => {
    expect(por(E1, opCon([msg('agente', ES)]), 'sin_personas_inventadas').ok).toBe(true);
  });

  it('los nombres se comparan por palabras completas: "Ana" no coincide con "semana"', () => {
    const esc: Escenario = { ...E1, hechosOcultos: 'La próxima semana decide Héctor Salgado.' };
    expect(por(esc, conInfluencia('Ana'), 'sin_personas_inventadas').ok).toBe(false);
    expect(por(esc, conInfluencia('Héctor'), 'sin_personas_inventadas').ok).toBe(true);
    expect(por(esc, conInfluencia('Salgado'), 'sin_personas_inventadas').ok).toBe(true);
  });
});

describe('verificar: cierre_con_diagnostico', () => {
  it('con sesión y diagnóstico pasa', () => {
    expect(por(E1, opCon([msg('agente', ES)]), 'cierre_con_diagnostico').ok).toBe(true);
  });
  it('sin sesiones cerradas falla', () => {
    const op = opCon([msg('agente', ES)]);
    op.sesiones = [];
    expect(por(E1, op, 'cierre_con_diagnostico').ok).toBe(false);
  });
  it('sin diagnóstico falla', () => {
    const op = opCon([msg('agente', ES)]);
    op.ultimoDiagnostico = null;
    expect(por(E1, op, 'cierre_con_diagnostico').ok).toBe(false);
  });
});

describe('verificar: banderas_esperadas', () => {
  it('todas presentes pasa', () => {
    expect(por(E1, opCon([msg('agente', ES)], ['no_elegidos_cierre_periodo', 'otra']), 'banderas_esperadas').ok).toBe(true);
  });

  it('banderas_faltantes: la esperada no está → false con el id en el detalle', () => {
    const v = por(E1, opCon([msg('agente', ES)], ['otra']), 'banderas_esperadas');
    expect(v.ok).toBe(false);
    expect(v.detalle).toContain('no_elegidos_cierre_periodo');
  });

  it('sin diagnóstico todas faltan', () => {
    const op = opCon([msg('agente', ES)]);
    op.ultimoDiagnostico = null;
    expect(por(E1, op, 'banderas_esperadas').ok).toBe(false);
  });

  it('devuelve las cinco verificaciones en orden', () => {
    expect(verificar(E1, opCon([msg('agente', ES)])).map((v) => v.nombre)).toEqual([
      'una_pregunta', 'idioma', 'sin_personas_inventadas', 'cierre_con_diagnostico', 'banderas_esperadas',
    ]);
  });
});

describe('responderComoVendedor', () => {
  it('vendedor_simulado_prompt: el system contiene persona, hechosOcultos, hoy y los campos de la ficha', async () => {
    const cliente = crearClienteFalso([texto('Hola, todo va excelente.')]);
    const respuesta = await responderComoVendedor(cliente, E1, [msg('agente', 'Hola, ¿cómo vas?')], 'modelo-x', { hoy: HOY });
    expect(respuesta).toBe('Hola, todo va excelente.');
    const llamada = cliente.llamadas[0];
    expect(llamada?.model).toBe('modelo-x');
    const system = typeof llamada?.system === 'string' ? llamada.system : JSON.stringify(llamada?.system);
    expect(system).toContain(E1.persona);
    expect(system).toContain(E1.hechosOcultos);
    const ficha = E1.construirFicha(HOY);
    expect(system).toContain(HOY);
    expect(system).toContain(ficha.cliente);
    expect(system).toContain(ficha.oportunidad);
    expect(system).toContain(String(ficha.tcv));
    expect(system).toContain(ficha.fechaCierreCRM);
    expect(system).toContain('FIN');
  });

  it('el agente va como user y el vendedor como assistant; los mensajes seguidos del mismo rol se unen', async () => {
    const cliente = crearClienteFalso([texto('ok')]);
    await responderComoVendedor(
      cliente, E1,
      [msg('agente', 'Uno'), msg('agente', 'Dos'), msg('vendedor', 'Tres'), msg('agente', 'Cuatro')],
      'm', { hoy: HOY },
    );
    const mensajes = cliente.llamadas[0]?.messages ?? [];
    expect(mensajes.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(mensajes[0]?.content).toBe('Uno\n\nDos');
    expect(mensajes[1]?.content).toBe('Tres');
    expect(mensajes[2]?.content).toBe('Cuatro');
  });

  it('si la transcripción no empieza con el agente se antepone una línea interna de usuario', async () => {
    const cliente = crearClienteFalso([texto('ok'), texto('ok')]);
    await responderComoVendedor(cliente, E1, [], 'm', { hoy: HOY });
    await responderComoVendedor(cliente, E1, [msg('vendedor', 'Hola'), msg('agente', 'Qué tal')], 'm', { hoy: HOY });
    for (const l of cliente.llamadas) {
      expect(l.messages[0]?.role).toBe('user');
      expect(l.messages.at(-1)?.role).toBe('user');
      l.messages.forEach((m, i) => i > 0 && expect(m.role).not.toBe(l.messages[i - 1]?.role));
    }
    expect(cliente.llamadas[1]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('usa max_tokens 2048 y reintenta una vez si la respuesta se cortó', async () => {
    const cortada: Partial<Message> = { ...texto('Mira, te cuento que el comi'), stop_reason: 'max_tokens' };
    const cliente = crearClienteFalso([cortada, texto('El comité decide en diciembre.')]);
    const usos: unknown[] = [];
    const r = await responderComoVendedor(cliente, E1, [msg('agente', 'Hola')], 'm', { hoy: HOY, registrarUso: (u) => usos.push(u) });
    expect(r).toBe('El comité decide en diciembre.');
    expect(cliente.llamadas).toHaveLength(2);
    expect(cliente.llamadas.map((l) => l.max_tokens)).toEqual([2048, 2048]);
    expect(usos).toHaveLength(2);
  });

  it('reintenta una vez si la respuesta viene vacía', async () => {
    const cliente = crearClienteFalso([texto('  '), texto('Todo bien.')]);
    expect(await responderComoVendedor(cliente, E1, [msg('agente', 'Hola')], 'm', { hoy: HOY })).toBe('Todo bien.');
    expect(cliente.llamadas).toHaveLength(2);
  });

  it('si sigue vacía tras el reintento devuelve "" sin un tercer intento', async () => {
    const cliente = crearClienteFalso([texto(''), texto(''), texto('no debería usarse')]);
    expect(await responderComoVendedor(cliente, E1, [msg('agente', 'Hola')], 'm', { hoy: HOY })).toBe('');
    expect(cliente.llamadas).toHaveLength(2);
  });

  it('si se cortó y el reintento viene vacío, se queda con el texto cortado', async () => {
    const cortada: Partial<Message> = { ...texto('Mira, te cuento'), stop_reason: 'max_tokens' };
    const cliente = crearClienteFalso([cortada, texto('')]);
    expect(await responderComoVendedor(cliente, E1, [msg('agente', 'Hola')], 'm', { hoy: HOY })).toBe('Mira, te cuento');
  });

  it('una respuesta completa no se reintenta', async () => {
    const cliente = crearClienteFalso([texto('Hola.'), texto('no debería usarse')]);
    expect(await responderComoVendedor(cliente, E1, [msg('agente', 'Hola')], 'm', { hoy: HOY })).toBe('Hola.');
    expect(cliente.llamadas).toHaveLength(1);
  });

  it('reporta el uso del vendedor y no muta la transcripción', async () => {
    const cliente = crearClienteFalso([
      texto('ok', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 }),
    ]);
    const transcripcion = [msg('agente', 'Hola')];
    const usos: unknown[] = [];
    await responderComoVendedor(cliente, E1, transcripcion, 'm', { hoy: HOY, registrarUso: (u) => usos.push(u) });
    expect(usos).toEqual([{ entrada: 10, salida: 5, cacheLectura: 2, cacheEscritura: 1 }]);
    expect(transcripcion).toEqual([msg('agente', 'Hola')]);
  });
});

describe('interpretarRespuestaVendedor', () => {
  it('texto normal: sin FIN', () => {
    expect(interpretarRespuestaVendedor('  Todo bien  ')).toEqual({ mensaje: 'Todo bien', fin: false });
  });
  it('termina en FIN: se quita y marca fin', () => {
    expect(interpretarRespuestaVendedor('Gracias, eso es todo. FIN')).toEqual({ mensaje: 'Gracias, eso es todo.', fin: true });
  });
  it('solo FIN: mensaje vacío', () => {
    expect(interpretarRespuestaVendedor('FIN\n')).toEqual({ mensaje: '', fin: true });
  });
  it('FIN con puntuación o markdown al final también cuenta', () => {
    expect(interpretarRespuestaVendedor('Gracias, nos vemos. FIN.')).toEqual({ mensaje: 'Gracias, nos vemos.', fin: true });
    expect(interpretarRespuestaVendedor('¡Gracias! FIN!')).toEqual({ mensaje: '¡Gracias!', fin: true });
    expect(interpretarRespuestaVendedor('Hasta luego.\n\n**FIN**')).toEqual({ mensaje: 'Hasta luego.', fin: true });
    expect(interpretarRespuestaVendedor('*FIN*')).toEqual({ mensaje: '', fin: true });
    expect(interpretarRespuestaVendedor('Listo.FIN')).toEqual({ mensaje: 'Listo.', fin: true });
  });
  it('FIN en medio de una palabra o del texto no cuenta', () => {
    expect(interpretarRespuestaVendedor('FINALMENTE sí')).toEqual({ mensaje: 'FINALMENTE sí', fin: false });
    expect(interpretarRespuestaVendedor('El FIN de mes')).toEqual({ mensaje: 'El FIN de mes', fin: false });
  });
});
