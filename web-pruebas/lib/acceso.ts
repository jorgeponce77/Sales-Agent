import { COOKIE_ACCESO, verificarAcceso } from './sesion';

/** Lo mínimo que se necesita de `cookies()` de Next para leer una cookie. */
export interface LectorCookies {
  get(nombre: string): { value: string } | undefined;
}

/** ¿Este visitante ya pasó por la página de acceso? Para componentes de servidor y rutas. La contraseña se lee en cada llamada. */
export function tieneAcceso(cookies: LectorCookies): boolean {
  return verificarAcceso(cookies.get(COOKIE_ACCESO)?.value, process.env.CLAVE_PRUEBAS);
}

/** Valor de una cookie en el encabezado `Cookie` de una solicitud. */
export function leerCookie(encabezado: string | null, nombre: string): string | undefined {
  if (!encabezado) return undefined;
  for (const par of encabezado.split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) return par.slice(i + 1).trim();
  }
  return undefined;
}

/** ¿La solicitud trae la cookie de acceso correcta? */
export function solicitudConAcceso(req: Request): boolean {
  return verificarAcceso(leerCookie(req.headers.get('cookie'), COOKIE_ACCESO), process.env.CLAVE_PRUEBAS);
}
