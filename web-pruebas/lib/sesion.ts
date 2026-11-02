import { createHmac, timingSafeEqual } from 'node:crypto';

/** Nombre de la cookie que prueba que el visitante conoce la contraseña de la página de pruebas. */
export const COOKIE_ACCESO = 'sa_acceso';

/** HMAC-SHA256 (hex) del texto fijo `acceso-sales-agent`, con la contraseña como clave. */
export function firmarAcceso(clave: string): string {
  return createHmac('sha256', clave).update('acceso-sales-agent').digest('hex');
}

/** Compara dos textos en tiempo constante; de distinta longitud nunca coinciden. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** ¿La cookie corresponde a la contraseña configurada? Sin contraseña configurada, nadie entra. */
export function verificarAcceso(cookie: string | undefined, clave: string | undefined): boolean {
  if (!clave || !cookie) return false;
  return igualesEnTiempoConstante(cookie, firmarAcceso(clave));
}

/**
 * ¿La contraseña enviada es la configurada? Se comparan las firmas (de longitud fija) en tiempo constante,
 * así que no se filtra ni el contenido ni la longitud de la contraseña real.
 */
export function claveCoincide(enviada: unknown, clave: string | undefined): boolean {
  if (!clave || typeof enviada !== 'string' || enviada === '') return false;
  return igualesEnTiempoConstante(firmarAcceso(enviada), firmarAcceso(clave));
}
