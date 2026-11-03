import type { Oportunidad } from 'agente-sales-agent';
import { calcularDiagnostico } from 'motor-sales-agent';
import { solicitudConAcceso } from './acceso';
import { esObjeto, validarOportunidad } from './validarOportunidad';

export const MAX_CUERPO = 1024 * 1024; // 1 MB
export const ERROR_GENERICO = 'Error interno, intenta de nuevo.';

export type Cuerpo = Record<string, unknown>;
/** Resultado de una lectura: el valor, o la respuesta de error que la ruta debe devolver tal cual. */
export type Lectura<T> = { ok: true; valor: T } | { ok: false; respuesta: Response };

export const responder = (estado: number, cuerpo: unknown): Response => Response.json(cuerpo, { status: estado });
export const rechazar = (error: string): Response => responder(400, { error });

/**
 * Puerta común de las rutas que reciben JSON del navegador: cookie de acceso (401), tamaño máximo de 1 MB
 * (sin leer el cuerpo si `content-length` ya lo supera), JSON válido y que sea un objeto.
 */
export async function leerSolicitud(req: Request): Promise<Lectura<Cuerpo>> {
  if (!solicitudConAcceso(req)) {
    return { ok: false, respuesta: responder(401, { error: 'Necesitas la contraseña para usar esta página.' }) };
  }
  const demasiado = (): Lectura<Cuerpo> => ({ ok: false, respuesta: rechazar('La solicitud es demasiado grande (máximo 1 MB).') });
  const declarado = Number(req.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO) return demasiado();
  const texto = await req.text();
  if (Buffer.byteLength(texto, 'utf8') > MAX_CUERPO) return demasiado();

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return { ok: false, respuesta: rechazar('La solicitud no es un JSON válido.') };
  }
  if (!esObjeto(cuerpo)) return { ok: false, respuesta: rechazar('La solicitud debe ser un objeto JSON.') };
  return { ok: true, valor: cuerpo };
}

/** El diagnóstico que manda el navegador no se usa: se recalcula con la fecha del servidor. */
export function recalcularDiagnostico(oportunidad: Oportunidad, hoy: string): Oportunidad {
  oportunidad.ultimoDiagnostico = calcularDiagnostico(oportunidad.expediente, hoy);
  return oportunidad;
}

/** Valida la oportunidad que llega del navegador (400 con el motivo) y le recalcula el diagnóstico. */
export function leerOportunidad(valor: unknown, hoy: string): Lectura<Oportunidad> {
  const errores = validarOportunidad(valor);
  if (errores.length > 0) return { ok: false, respuesta: rechazar(`La oportunidad no es válida. ${errores.slice(0, 3).join(' ')}`) };
  return { ok: true, valor: recalcularDiagnostico(valor as Oportunidad, hoy) };
}
