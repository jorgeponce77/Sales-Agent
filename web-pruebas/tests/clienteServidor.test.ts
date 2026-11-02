import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarTurno, iniciarSesion } from 'agente-sales-agent';
import { obtenerCliente } from '../lib/clienteServidor';
import { oportunidadBase } from './fabrica';

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
});
