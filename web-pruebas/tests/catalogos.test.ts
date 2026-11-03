import { describe, expect, it } from 'vitest';
import { formatearMonto, leerTcv, MONEDAS, parsearTcv } from '../lib/catalogos';

describe('parsearTcv', () => {
  it.each([
    ['450000', 450000],
    ['450,000', 450000],
    ['450 000', 450000],
    [' 1,250,000.50 ', 1250000.5],
    ['450 000', 450000],
    ['450.5', 450.5],
  ])('%s -> %s', (texto, esperado) => {
    expect(parsearTcv(texto)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', '12x', '-5', '0'])('%j no es un monto válido', (texto) => {
    expect(parsearTcv(texto)).toBeNull();
  });
});

describe('leerTcv (Menor 2)', () => {
  it.each(['380.000', '1.250.000', '450,5', '450,50', '4,50,000', '450,0000'])('%j es ambiguo: pide dígitos o "450,000"', (texto) => {
    const r = leerTcv(texto);
    expect(r.monto).toBeNull();
    expect(r.error).toContain('solo dígitos');
    expect(r.error).toContain('450,000');
  });

  it('un monto inválido no ambiguo da el mensaje general', () => {
    expect(leerTcv('abc').error).toBe('El TCV debe ser un número mayor que 0 (por ejemplo, 450000 o 450,000).');
  });

  it('un monto válido no trae error', () => {
    expect(leerTcv('1,250,000.50')).toEqual({ monto: 1250000.5, error: null });
  });
});

describe('formatearMonto', () => {
  it('usa comas de miles y hasta 2 decimales', () => {
    expect(formatearMonto(450000)).toBe('450,000');
    expect(formatearMonto(1250000.5)).toBe('1,250,000.5');
    expect(formatearMonto(1.239)).toBe('1.24');
  });
});

describe('monedas (Importante 2)', () => {
  it('solo USD hasta que haya tipos de cambio', () => {
    expect(MONEDAS).toEqual(['USD']);
  });
});
