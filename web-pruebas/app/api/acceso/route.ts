import { NextResponse } from 'next/server';
import { claveCoincide, COOKIE_ACCESO, firmarAcceso } from '../../../lib/sesion';

const TREINTA_DIAS = 60 * 60 * 24 * 30;
const MAX_CUERPO = 4 * 1024; // 4 KB: una contraseña no necesita más

const solicitudInvalida = (): NextResponse => NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });

export async function POST(req: Request): Promise<NextResponse> {
  const declarado = Number(req.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO) return solicitudInvalida();
  const texto = await req.text();
  if (Buffer.byteLength(texto, 'utf8') > MAX_CUERPO) return solicitudInvalida();

  let enviada: unknown;
  try {
    const cuerpo: unknown = JSON.parse(texto);
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
