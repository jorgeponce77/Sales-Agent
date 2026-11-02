import { NextResponse } from 'next/server';
import { claveCoincide, COOKIE_ACCESO, firmarAcceso } from '../../../lib/sesion';

const TREINTA_DIAS = 60 * 60 * 24 * 30;

export async function POST(req: Request): Promise<NextResponse> {
  let enviada: unknown;
  try {
    const cuerpo: unknown = await req.json();
    enviada = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { clave?: unknown }).clave : undefined;
  } catch {
    enviada = undefined;
  }
  // La contraseña se lee en cada solicitud, no al cargar el módulo.
  const clave = process.env.CLAVE_PRUEBAS;
  if (!clave || !claveCoincide(enviada, clave)) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_ACCESO, firmarAcceso(clave), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TREINTA_DIAS,
  });
  return respuesta;
}
