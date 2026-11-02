import { describe, expect, it } from 'vitest';
import { parsearTcv } from '../lib/catalogos';

describe('parsearTcv', () => {
  it.each([
    ['450000', 450000],
    ['450,000', 450000],
    ['450 000', 450000],
    [' 1,250,000.50 ', 1250000.5],
    ['450 000', 450000],
  ])('%s -> %s', (texto, esperado) => {
    expect(parsearTcv(texto)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', '12x', '-5', '0'])('%j no es un monto válido', (texto) => {
    expect(parsearTcv(texto)).toBeNull();
  });
});
