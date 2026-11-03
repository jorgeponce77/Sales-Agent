import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearClienteAnthropic, ejecutarTurno, iniciarSesion } from 'agente-sales-agent';
import { obtenerCliente } from '../lib/clienteServidor';
import { oportunidadBase } from './fabrica';

vi.mock('agente-sales-agent', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('agente-sales-agent')>();
  return { ...original, crearClienteAnthropic: vi.fn(original.crearClienteAnthropic) };
});

describe('obtenerCliente', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('con MODELO_FALSO=1 el ciclo real de turnos corre sin red y sin clave', async () => {
    vi.stubEnv('MODELO_FALSO', '1');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const cliente = obtenerCliente();

    const inicio = await iniciarSesion(oportunidadBase(), 'calificar', { cliente, hoy: '2026-11-02' });
    expect(inicio.error).toBeNull();
    expect(inicio.respuestas).toEqual(['¿Cuál es el estatus del negocio? (modo de prueba)']);

    const turno = await ejecutarTurno(inicio.oportunidad, 'Va bien', { cliente, hoy: '2026-11-02' });
    expect(turno.error).toBeNull();
    expect(turno.respuestas).toEqual(['Gracias, anotado. (modo de prueba)']);
    expect(turno.uso).toEqual({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });
  });

  it('el cliente falso devuelve un mensaje bien formado', async () => {
    vi.stubEnv('MODELO_FALSO', '1');
    const msg = await obtenerCliente().crear({
      model: 'm',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hola' }],
    });
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.role).toBe('assistant');
    expect(msg.content).toEqual([expect.objectContaining({ type: 'text', text: 'Gracias, anotado. (modo de prueba)' })]);
    expect(msg.usage.input_tokens).toBe(0);
    expect(msg.usage.output_tokens).toBe(0);
  });

  it('al pedir terminar, el cliente falso cierra la sesión con la herramienta cerrar_sesion', async () => {
    vi.stubEnv('MODELO_FALSO', '1');
    const cliente = obtenerCliente();
    const opciones = { cliente, hoy: '2026-11-02' };
    const inicio = await iniciarSesion(oportunidadBase(), 'calificar', opciones);
    const hablado = await ejecutarTurno(inicio.oportunidad, 'Hola', opciones);

    const cierre = await ejecutarTurno(hablado.oportunidad, '', { ...opciones, cerrar: true });
    expect(cierre.error).toBeNull();
    expect(cierre.respuestas).toEqual(['Sesión cerrada. (modo de prueba)']);
    expect(cierre.oportunidad.sesionActual).toBeNull();
    expect(cierre.oportunidad.sesiones).toHaveLength(1);
    expect(cierre.oportunidad.sesiones[0]?.resumen).toBe('Resumen de prueba.');
    expect(cierre.oportunidad.sesiones[0]?.transcripcion.map((m) => m.texto)).toEqual([
      '¿Cuál es el estatus del negocio? (modo de prueba)',
      'Hola',
      'Gracias, anotado. (modo de prueba)',
      'Sesión cerrada. (modo de prueba)',
    ]);

    // La misma oportunidad admite una sesión nueva, con el saludo de siempre.
    const nueva = await iniciarSesion(cierre.oportunidad, 'calificar', opciones);
    expect(nueva.respuestas).toEqual(['¿Cuál es el estatus del negocio? (modo de prueba)']);
    expect(nueva.oportunidad.sesiones).toHaveLength(1);
  });

  it('el cierre falso responde con un tool_use bien formado y luego con texto al recibir el resultado', async () => {
    vi.stubEnv('MODELO_FALSO', '1');
    const cliente = obtenerCliente();
    const pedido = await cliente.crear({
      model: 'm',
      max_tokens: 10,
      messages: [{ role: 'user', content: [{ type: 'text', text: '[El vendedor pidió terminar la sesión: haz el cierre completo]' }] }],
    });
    expect(pedido.stop_reason).toBe('tool_use');
    const uso = pedido.content.find((b) => b.type === 'tool_use');
    expect(uso).toEqual(expect.objectContaining({ name: 'cerrar_sesion', input: { resumen: 'Resumen de prueba.' } }));

    const final = await cliente.crear({
      model: 'm',
      max_tokens: 10,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '[El vendedor pidió terminar la sesión: haz el cierre completo]' }] },
        { role: 'assistant', content: pedido.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: (uso as { id: string }).id, content: '{"ok":true}' }] },
      ],
    });
    expect(final.stop_reason).toBe('end_turn');
    expect(final.content).toEqual([expect.objectContaining({ type: 'text', text: 'Sesión cerrada. (modo de prueba)' })]);
  });

  it('sin MODELO_FALSO y sin clave de API falla con un mensaje claro y sin filtrar valores', () => {
    vi.stubEnv('MODELO_FALSO', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(() => obtenerCliente()).toThrow('ANTHROPIC_API_KEY');
  });

  it('con clave de API crea el cliente real sin llamar a la red', () => {
    vi.stubEnv('MODELO_FALSO', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'clave-falsa-solo-prueba');
    expect(typeof obtenerCliente().crear).toBe('function');
  });

  it('el cliente real reintenta 2 veces y espera hasta 120 s por llamada (Importante 4)', () => {
    vi.stubEnv('MODELO_FALSO', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'clave-falsa-solo-prueba');
    obtenerCliente();
    expect(vi.mocked(crearClienteAnthropic)).toHaveBeenLastCalledWith('clave-falsa-solo-prueba', { maxRetries: 2, timeout: 120_000 });
  });
});
