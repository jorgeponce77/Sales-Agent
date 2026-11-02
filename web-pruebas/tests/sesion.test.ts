import { afterEach, describe, expect, it } from 'vitest';
import { tieneAcceso, leerCookie } from '../lib/acceso';
import { claveCoincide, COOKIE_ACCESO, firmarAcceso, verificarAcceso } from '../lib/sesion';

describe('firmar_verificar', () => {
  it('verifica bien con la misma clave', () => {
    expect(verificarAcceso(firmarAcceso('secreta'), 'secreta')).toBe(true);
  });

  it('falla con otra clave', () => {
    expect(verificarAcceso(firmarAcceso('secreta'), 'otra')).toBe(false);
  });

  it('falla con cookie undefined', () => {
    expect(verificarAcceso(undefined, 'secreta')).toBe(false);
  });

  it('falla con clave vacía o inexistente, aunque la cookie sea la firma de la clave vacía', () => {
    expect(verificarAcceso(firmarAcceso(''), '')).toBe(false);
    expect(verificarAcceso(firmarAcceso(''), undefined)).toBe(false);
    expect(verificarAcceso('abc', '')).toBe(false);
  });

  it('falla con una cookie de otra longitud sin lanzar', () => {
    expect(verificarAcceso('corta', 'secreta')).toBe(false);
    expect(verificarAcceso(firmarAcceso('secreta') + '00', 'secreta')).toBe(false);
  });

  it('la firma es HMAC-SHA256 en hexadecimal (64 caracteres) y depende de la clave', () => {
    expect(firmarAcceso('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(firmarAcceso('a')).not.toBe(firmarAcceso('b'));
  });

  it('la cookie se llama sa_acceso', () => {
    expect(COOKIE_ACCESO).toBe('sa_acceso');
  });
});

describe('claveCoincide', () => {
  it('acepta solo la clave exacta', () => {
    expect(claveCoincide('secreta', 'secreta')).toBe(true);
    expect(claveCoincide('secret', 'secreta')).toBe(false);
    expect(claveCoincide('secretaa', 'secreta')).toBe(false);
  });

  it('rechaza lo que no es texto, lo vacío y la clave no configurada', () => {
    expect(claveCoincide(undefined, 'secreta')).toBe(false);
    expect(claveCoincide(123, 'secreta')).toBe(false);
    expect(claveCoincide('', '')).toBe(false);
    expect(claveCoincide('x', undefined)).toBe(false);
  });
});

describe('tieneAcceso y leerCookie', () => {
  const original = process.env.CLAVE_PRUEBAS;
  afterEach(() => {
    if (original === undefined) delete process.env.CLAVE_PRUEBAS;
    else process.env.CLAVE_PRUEBAS = original;
  });

  it('lee la contraseña al llamar, no al cargar el módulo', () => {
    const cookies = { get: (n: string) => (n === COOKIE_ACCESO ? { value: firmarAcceso('uno') } : undefined) };
    process.env.CLAVE_PRUEBAS = 'uno';
    expect(tieneAcceso(cookies)).toBe(true);
    process.env.CLAVE_PRUEBAS = 'dos';
    expect(tieneAcceso(cookies)).toBe(false);
    delete process.env.CLAVE_PRUEBAS;
    expect(tieneAcceso(cookies)).toBe(false);
  });

  it('sin cookie no hay acceso', () => {
    process.env.CLAVE_PRUEBAS = 'uno';
    expect(tieneAcceso({ get: () => undefined })).toBe(false);
  });

  it('encuentra la cookie entre varias y devuelve undefined si no está', () => {
    expect(leerCookie('a=1; sa_acceso=abc; b=2', 'sa_acceso')).toBe('abc');
    expect(leerCookie('a=1; xsa_acceso=abc', 'sa_acceso')).toBeUndefined();
    expect(leerCookie(null, 'sa_acceso')).toBeUndefined();
  });
});
