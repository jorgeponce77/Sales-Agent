import { describe, expect, it, vi } from 'vitest';

const construido = vi.hoisted(() => ({ opciones: [] as unknown[] }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
    constructor(opciones: unknown) {
      construido.opciones.push(opciones);
    }
  },
}));

const { crearClienteAnthropic } = await import('../src/conversacion/cliente.js');

describe('crearClienteAnthropic (Importante 4)', () => {
  it('pasa maxRetries y timeout al SDK cuando se dan; sin ellos, solo la clave', () => {
    construido.opciones.length = 0;
    crearClienteAnthropic('clave-x', { maxRetries: 2, timeout: 120_000 });
    crearClienteAnthropic('clave-y');
    expect(construido.opciones).toEqual([
      { apiKey: 'clave-x', maxRetries: 2, timeout: 120_000 },
      { apiKey: 'clave-y' },
    ]);
  });
});
