import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ejecutarTurno, horaLocalPorPais, iniciarSesion, MODELO_DEFAULT } from 'agente-sales-agent';
import type { ResultadoTurno } from 'agente-sales-agent';
import { calcularDiagnostico } from 'motor-sales-agent';
import { obtenerCliente } from '../lib/clienteServidor';
import { hoyMexico } from '../lib/hoy';
import { maxDuration, POST, runtime } from '../app/api/turno/route';
import { CLAVE, fichaBase, oportunidadBase, solicitud } from './fabrica';

vi.mock('../lib/clienteServidor', () => ({ obtenerCliente: vi.fn() }));
vi.mock('../lib/hoy', () => ({ hoyMexico: vi.fn() }));
vi.mock('agente-sales-agent', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('agente-sales-agent')>();
  return {
    ...original,
    iniciarSesion: vi.fn(original.iniciarSesion),
    ejecutarTurno: vi.fn(original.ejecutarTurno),
    horaLocalPorPais: vi.fn(original.horaLocalPorPais),
  };
});

const GENERICO = 'Error interno, intenta de nuevo.';
const TEXTO_CLIENTE = 'Hola desde el cliente falso';

const mensajeModelo = (texto: string): unknown => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'm',
  content: [{ type: 'text', text: texto, citations: null }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

let crear: ReturnType<typeof vi.fn>;
let consola: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('CLAVE_PRUEBAS', CLAVE);
  vi.stubEnv('MODELO_AGENTE', '');
  vi.mocked(hoyMexico).mockReturnValue('2026-11-02');
  crear = vi.fn(async () => mensajeModelo(TEXTO_CLIENTE));
  vi.mocked(obtenerCliente).mockReturnValue({ crear } as never);
  consola = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  consola.mockRestore();
});

async function llamar(cuerpo: unknown, opciones?: Parameters<typeof solicitud>[1]): Promise<{ estado: number; json: any }> {
  const r = await POST(solicitud(cuerpo, opciones));
  return { estado: r.status, json: await r.json() };
}

describe('configuración de la ruta', () => {
  it('corre en Node con tiempo de sobra para varias llamadas al modelo', () => {
    expect(runtime).toBe('nodejs');
    expect(maxDuration).toBe(300);
  });
});

describe('acceso', () => {
  it('sin_cookie_401', async () => {
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase() }, { cookie: false });
    expect(estado).toBe(401);
    expect(json.error).toEqual(expect.any(String));
    expect(crear).not.toHaveBeenCalled();
  });

  it('cookie de otra contraseña: 401', async () => {
    const { estado } = await llamar({ accion: 'iniciar', ficha: fichaBase() }, { cookie: 'sa_acceso=abc123' });
    expect(estado).toBe(401);
  });

  it('sin CLAVE_PRUEBAS configurada nadie entra', async () => {
    vi.stubEnv('CLAVE_PRUEBAS', '');
    const { estado } = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(estado).toBe(401);
  });
});

describe('solicitudes inválidas', () => {
  it('json_invalido_400', async () => {
    const { estado, json } = await llamar('{no es json');
    expect(estado).toBe(400);
    expect(json.error).toMatch(/JSON/);
  });

  it('un cuerpo que no es un objeto: 400', async () => {
    expect((await llamar([])).estado).toBe(400);
    expect((await llamar('"hola"')).estado).toBe(400);
    expect((await llamar('null')).estado).toBe(400);
  });

  it('formato_viejo_400', async () => {
    const { estado, json } = await llamar({ accion: 'mensaje', mensaje: 'hola', oportunidad: { formato: 0 } });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/formato/);
    expect(crear).not.toHaveBeenCalled();
  });

  it('expediente_corrupto_400', async () => {
    const op = structuredClone(oportunidadBase()) as any;
    op.expediente.etapaCRM = 'tres';
    const { estado, json } = await llamar({ accion: 'mensaje', mensaje: 'hola', oportunidad: op });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/expediente/);
    expect(crear).not.toHaveBeenCalled();
  });

  it('historial corrupto: 400 que nombra el campo', async () => {
    const op = structuredClone(oportunidadBase()) as any;
    op.sesionActual = {
      modo: 'calificar', inicio: '2026-11-02', turnosVendedor: 0, versionInstrucciones: 'v',
      historial: [{ role: 'root', content: 'x' }], transcripcion: [],
    };
    const { estado, json } = await llamar({ accion: 'mensaje', mensaje: 'hola', oportunidad: op });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/historial/);
  });

  it('ficha inválida: 400 con el campo en español', async () => {
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase({ pais: 'Mexico' }) });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/pais/);
  });

  it('mensaje que no es texto: 400', async () => {
    const op = oportunidadBase();
    expect((await llamar({ accion: 'mensaje', oportunidad: op })).estado).toBe(400);
    expect((await llamar({ accion: 'mensaje', oportunidad: op, mensaje: 42 })).estado).toBe(400);
    const cierre = await llamar({ accion: 'cerrar', oportunidad: op, mensaje: { x: 1 } });
    expect(cierre.estado).toBe(400);
    expect(cierre.json.error).toMatch(/mensaje/);
    expect(crear).not.toHaveBeenCalled();
  });

  it('acción o escenario desconocidos: 400', async () => {
    expect((await llamar({ accion: 'borrar', oportunidad: oportunidadBase() })).estado).toBe(400);
    expect((await llamar({ oportunidad: oportunidadBase() })).estado).toBe(400);
    const e = await llamar({ accion: 'iniciar', escenarioId: 'E9' });
    expect(e.estado).toBe(400);
    expect(e.json.error).toMatch(/escenario/i);
  });

  it('modo desconocido: 400', async () => {
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase(), modo: 'turbo' });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/modo/);
  });

  it('mensaje y cerrar sin oportunidad: 400', async () => {
    expect((await llamar({ accion: 'mensaje', mensaje: 'hola' })).estado).toBe(400);
    expect((await llamar({ accion: 'cerrar' })).estado).toBe(400);
    expect((await llamar({ accion: 'mensaje', mensaje: 'hola', ficha: fichaBase() })).estado).toBe(400);
  });

  it('iniciar sin oportunidad, ficha ni escenario: 400', async () => {
    expect((await llamar({ accion: 'iniciar' })).estado).toBe(400);
  });

  it('cuerpo de más de 1 MB: 400 sin leerlo si content-length ya lo dice', async () => {
    const req = solicitud({ accion: 'iniciar' }, { encabezados: { 'content-length': String(1024 * 1024 + 1) } });
    const lector = vi.spyOn(req, 'text');
    const r = await POST(req);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/grande|1 MB/);
    expect(lector).not.toHaveBeenCalled();
  });

  it('cuerpo de más de 1 MB: 400 si content-length no viene', async () => {
    const { estado, json } = await llamar({ accion: 'mensaje', oportunidad: oportunidadBase(), mensaje: 'x'.repeat(1024 * 1024 + 1) });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/grande|1 MB/);
    expect(crear).not.toHaveBeenCalled();
  });

  it('cuerpo de más de 1 MB: 400 aunque content-length declare poco', async () => {
    const cuerpo = { accion: 'mensaje', oportunidad: oportunidadBase(), mensaje: 'x'.repeat(1024 * 1024 + 1) };
    const { estado, json } = await llamar(cuerpo, { encabezados: { 'content-length': '10' } });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/grande|1 MB/);
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('turnos', () => {
  it('mensaje_largo: 200 con error en el resultado y sin llamar al cliente', async () => {
    const { estado, json } = await llamar({ accion: 'mensaje', oportunidad: oportunidadBase(), mensaje: 'a'.repeat(4001) });
    expect(estado).toBe(200);
    expect((json as ResultadoTurno).error).toEqual(expect.stringContaining('4000'));
    expect(crear).not.toHaveBeenCalled();
  });

  it('iniciar_con_ficha_200', async () => {
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(estado).toBe(200);
    expect((json as ResultadoTurno).respuestas[0]).toBe(TEXTO_CLIENTE);
    expect(json.error).toBeNull();
    expect(json.oportunidad.sesionActual.modo).toBe('calificar');
  });

  it('con ficha, fechaCreacion y vendedor los pone el servidor', async () => {
    const { json } = await llamar({
      accion: 'iniciar',
      ficha: fichaBase({ fechaCreacion: '1999-01-01', vendedor: 'otro@x.com' }),
    });
    expect(json.oportunidad.ficha.fechaCreacion).toBe('2026-11-02');
    expect(json.oportunidad.ficha.vendedor).toBe('prueba');
    expect(json.oportunidad.expediente.fechaCreacion).toBe('2026-11-02');
  });

  it('con ficha no hace falta mandar fechaCreacion ni vendedor', async () => {
    const { fechaCreacion: _f, vendedor: _v, ...sinEsos } = fichaBase();
    const { estado } = await llamar({ accion: 'iniciar', ficha: sinEsos });
    expect(estado).toBe(200);
  });

  it('iniciar_con_escenario_usa_hoy_servidor', async () => {
    vi.mocked(hoyMexico).mockReturnValue('2026-11-02');
    const { estado, json } = await llamar({ accion: 'iniciar', escenarioId: 'E1' });
    expect(estado).toBe(200);
    const op = (json as ResultadoTurno).oportunidad;
    expect(op.ficha.fechaCierreCRM <= '2026-12-31').toBe(true);
    expect(op.ficha.fechaCierreCRM > '2026-11-02').toBe(true);
    expect(op.sesionActual?.inicio).toBe('2026-11-02');
  });

  it.each(['E1', 'E2', 'E3', 'E4', 'E5'])('el escenario %s arma una oportunidad válida', async (id) => {
    const { estado, json } = await llamar({ accion: 'iniciar', escenarioId: id });
    expect(estado).toBe(200);
    expect(json.oportunidad.id).toBeTruthy();
  });

  it('iniciar con una oportunidad existente usa el modo pedido y archiva la sesión abierta', async () => {
    const primera = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    const { estado, json } = await llamar({ accion: 'iniciar', oportunidad: primera.json.oportunidad, modo: 'revision_rapida' });
    expect(estado).toBe(200);
    expect(json.oportunidad.sesionActual.modo).toBe('revision_rapida');
    expect(json.oportunidad.sesiones).toHaveLength(1);
  });

  it('mensaje: usa la oportunidad recibida y devuelve la actualizada', async () => {
    const primera = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    crear.mockResolvedValueOnce(mensajeModelo('Anotado'));
    const { estado, json } = await llamar({ accion: 'mensaje', oportunidad: primera.json.oportunidad, mensaje: 'Va bien' });
    expect(estado).toBe(200);
    expect(json.respuestas).toEqual(['Anotado']);
    expect(json.oportunidad.sesionActual.turnosVendedor).toBe(1);
    expect(json.oportunidad.sesionActual.transcripcion.map((m: any) => m.texto)).toContain('Va bien');
  });

  it('cerrar: pide el cierre al modelo aunque no haya mensaje', async () => {
    const primera = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    crear.mockClear();
    const { estado } = await llamar({ accion: 'cerrar', oportunidad: primera.json.oportunidad });
    expect(estado).toBe(200);
    expect(crear).toHaveBeenCalledTimes(1);
    const mensajes = (crear.mock.calls[0]![0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages;
    expect(JSON.stringify(mensajes[mensajes.length - 1])).toContain('terminar la sesión');
  });

  it('el modelo sale de MODELO_AGENTE y, si no hay, el del agente por defecto', async () => {
    await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(crear.mock.calls[0]![0]).toMatchObject({ model: MODELO_DEFAULT });
    vi.stubEnv('MODELO_AGENTE', 'modelo-de-prueba');
    await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(crear.mock.calls[1]![0]).toMatchObject({ model: 'modelo-de-prueba' });
  });

  it('la fecha de hoy la pone el servidor', async () => {
    vi.mocked(hoyMexico).mockReturnValue('2026-12-15');
    const { json } = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(json.oportunidad.sesionActual.inicio).toBe('2026-12-15');
  });
});

describe('tope de 40 mensajes (Importante 1)', () => {
  it('una oportunidad en 40 con un modelo que no cierra sigue usable en la solicitud siguiente', async () => {
    const op = structuredClone(oportunidadBase()) as any;
    op.sesionActual = {
      modo: 'calificar', inicio: '2026-11-02', turnosVendedor: 40, versionInstrucciones: 'v',
      historial: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }, { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }],
      transcripcion: [{ rol: 'vendedor', texto: 'hola', fecha: '2026-11-02' }, { rol: 'agente', texto: 'ok', fecha: '2026-11-02' }],
    };
    const primera = await llamar({ accion: 'mensaje', oportunidad: op, mensaje: 'una más' });
    expect(primera.estado).toBe(200);
    expect(primera.json.oportunidad.sesionActual).toBeNull();
    expect(primera.json.oportunidad.sesiones.at(-1).resumen).toBe('Sesión interrumpida sin cierre del agente.');
    expect(primera.json.oportunidad.sesiones.at(-1).foto.expediente).toEqual(primera.json.oportunidad.expediente);

    const segunda = await llamar({ accion: 'mensaje', oportunidad: primera.json.oportunidad, mensaje: 'sigo' });
    expect(segunda.estado).toBe(200);
    expect(segunda.json.error).toBeNull();
    expect(segunda.json.oportunidad.sesionActual.turnosVendedor).toBe(1);
    const tercera = await llamar({ accion: 'iniciar', oportunidad: segunda.json.oportunidad });
    expect(tercera.estado).toBe(200);
  });
});

describe('presupuesto de tiempo (Importante 4)', () => {
  it('pasa limiteMs de 240 s al iniciar y en cada turno', async () => {
    const primera = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    await llamar({ accion: 'mensaje', oportunidad: primera.json.oportunidad, mensaje: 'hola' });
    expect(vi.mocked(iniciarSesion).mock.calls[0]?.[2]).toMatchObject({ limiteMs: 240_000 });
    expect(vi.mocked(ejecutarTurno).mock.calls[0]?.[2]).toMatchObject({ limiteMs: 240_000 });
  });
});

describe('hora local para el saludo', () => {
  it('calcula la hora con la zona del país de la ficha y la pasa al iniciar y en cada turno', async () => {
    vi.mocked(horaLocalPorPais).mockReturnValue(7);
    const primera = await llamar({ accion: 'iniciar', ficha: fichaBase({ pais: 'CO' }) });
    expect(primera.estado).toBe(200);
    expect(vi.mocked(horaLocalPorPais)).toHaveBeenCalledWith('CO');
    expect(vi.mocked(iniciarSesion).mock.calls[0]?.[2]).toMatchObject({ horaLocal: 7 });
    vi.mocked(horaLocalPorPais).mockReturnValue(20);
    await llamar({ accion: 'mensaje', oportunidad: primera.json.oportunidad, mensaje: 'hola' });
    expect(vi.mocked(ejecutarTurno).mock.calls[0]?.[2]).toMatchObject({ horaLocal: 20 });
  });
});

describe('diagnóstico', () => {
  const falso = { ...structuredClone(calcularDiagnostico(oportunidadBase().expediente, '2026-11-02')), nivelMadurez: 'FALSIFICADO' };

  it('el ultimoDiagnostico del navegador se reemplaza por el calculado en el servidor', async () => {
    const op = { ...structuredClone(oportunidadBase()), ultimoDiagnostico: falso };
    const esperado = calcularDiagnostico(op.expediente, '2026-11-02');
    const { estado, json } = await llamar({ accion: 'mensaje', oportunidad: op, mensaje: 'Hola' });
    expect(estado).toBe(200);
    expect(json.oportunidad.ultimoDiagnostico).toEqual(esperado);
    expect(json.diagnostico).toEqual(esperado);
    expect(JSON.stringify(json)).not.toContain('FALSIFICADO');
  });

  it('también en un turno sin cambios (mensaje vacío)', async () => {
    const op = { ...structuredClone(oportunidadBase()), ultimoDiagnostico: falso };
    const { json } = await llamar({ accion: 'mensaje', oportunidad: op, mensaje: '   ' });
    expect(crear).not.toHaveBeenCalled();
    expect(json.diagnostico).toEqual(calcularDiagnostico(op.expediente, '2026-11-02'));
    expect(JSON.stringify(json)).not.toContain('FALSIFICADO');
  });

  it('también en una oportunidad cerrada', async () => {
    const cerrada = oportunidadBase({ etapaCRM: 7 });
    const op = { ...structuredClone(cerrada), ultimoDiagnostico: falso };
    const { json } = await llamar({ accion: 'mensaje', oportunidad: op, mensaje: 'Hola' });
    expect(crear).not.toHaveBeenCalled();
    expect(json.diagnostico).toEqual(calcularDiagnostico(op.expediente, '2026-11-02'));
    expect(JSON.stringify(json)).not.toContain('FALSIFICADO');
  });

  it('usa la fecha de hoy del servidor', async () => {
    vi.mocked(hoyMexico).mockReturnValue('2027-02-01');
    const op = { ...structuredClone(oportunidadBase()), ultimoDiagnostico: falso };
    const { json } = await llamar({ accion: 'mensaje', oportunidad: op, mensaje: '' });
    expect(json.diagnostico).toEqual(calcularDiagnostico(op.expediente, '2027-02-01'));
  });
});

describe('errores', () => {
  it('falla de la API: 200 con error en español y solo un resumen en el log', async () => {
    crear.mockRejectedValueOnce(Object.assign(new Error('límite'), { status: 429, headers: { authorization: 'secreto' } }));
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(estado).toBe(200);
    expect((json as ResultadoTurno).error).toEqual(expect.any(String));
    expect(consola).toHaveBeenCalledWith('[api/turno] fallo de la API', { name: 'Error', status: 429, message: 'límite' });
  });

  it('excepcion_500_generico: sin detalles, sin stack', async () => {
    vi.mocked(iniciarSesion).mockRejectedValueOnce(new Error('explotó con sk-ant-SECRETO'));
    const r = await POST(solicitud({ accion: 'iniciar', ficha: fichaBase() }));
    expect(r.status).toBe(500);
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ error: GENERICO });
    expect(texto).not.toMatch(/explotó|SECRETO|stack|\bat\b.*\.ts/);
  });

  it('el 500 se registra con name, status y message; nunca el cuerpo, la cookie ni el entorno', async () => {
    vi.mocked(iniciarSesion).mockRejectedValueOnce(new Error('falló algo'));
    await llamar({ accion: 'iniciar', ficha: fichaBase({ cliente: 'Cliente-Secreto-XYZ' }) });
    expect(consola).toHaveBeenCalled();
    const registrado = JSON.stringify(consola.mock.calls);
    expect(registrado).toContain('falló algo');
    expect(registrado).not.toContain('Cliente-Secreto-XYZ');
    expect(registrado).not.toContain(CLAVE);
    expect(registrado).not.toContain('sa_acceso');
  });

  it('si no se puede crear el cliente: 500 genérico', async () => {
    vi.mocked(obtenerCliente).mockImplementation(() => {
      throw new Error('Falta ANTHROPIC_API_KEY en el servidor.');
    });
    const { estado, json } = await llamar({ accion: 'iniciar', ficha: fichaBase() });
    expect(estado).toBe(500);
    expect(json).toEqual({ error: GENERICO });
  });
});

