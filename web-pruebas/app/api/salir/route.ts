import { NextResponse } from 'next/server';
import { COOKIE_ACCESO } from '../../../lib/sesion';

export async function POST(): Promise<NextResponse> {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_ACCESO, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return respuesta;
}
