import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as acceso } from '../app/api/acceso/route';
import { POST as salir } from '../app/api/salir/route';
import { COOKIE_ACCESO, firmarAcceso } from '../lib/sesion';
import { CLAVE } from './fabrica';

const pedir = (cuerpo: unknown): Request =>
  new Request('http://localhost/api/acceso', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

beforeEach(() => {
  vi.stubEnv('CLAVE_PRUEBAS', CLAVE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/acceso', () => {
  it('con la contraseña correcta pone la cookie firmada y responde 200', async () => {
    const r = await acceso(pedir({ clave: CLAVE }));
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${COOKIE_ACCESO}=${firmarAcceso(CLAVE)}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toContain(CLAVE + ';');
  });

  it('la cookie es Secure solo en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await acceso(pedir({ clave: CLAVE }))).headers.get('set-cookie')).toMatch(/Secure/i);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await acceso(pedir({ clave: CLAVE }))).headers.get('set-cookie')).not.toMatch(/Secure/i);
  });

  it('con otra contraseña responde 401 y no pone cookie', async () => {
    const r = await acceso(pedir({ clave: 'mala' }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'Contraseña incorrecta' });
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('sin contraseña configurada, nadie entra (ni con clave vacía)', async () => {
    vi.stubEnv('CLAVE_PRUEBAS', '');
    expect((await acceso(pedir({ clave: '' }))).status).toBe(401);
    expect((await acceso(pedir({ clave: 'x' }))).status).toBe(401);
  });

  it('cuerpo inválido: 401 sin cookie, nunca 500', async () => {
    for (const c of ['no json', '[]', 'null', JSON.stringify({ clave: 5 }), JSON.stringify({})]) {
      const r = await acceso(pedir(c));
      expect(r.status).toBe(401);
      expect(r.headers.get('set-cookie')).toBeNull();
    }
  });
});

describe('POST /api/salir', () => {
  it('borra la cookie', async () => {
    const r = await salir();
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${COOKIE_ACCESO}=;`);
    expect(cookie).toMatch(/Max-Age=0/);
  });
});
