import { formatearTranscripcion } from 'agente-sales-agent';
import type { Oportunidad } from 'agente-sales-agent';
import { calcularDiagnostico } from 'motor-sales-agent';
import { solicitudConAcceso } from '../../../lib/acceso';
import { hoyMexico } from '../../../lib/hoy';
import { resumenError } from '../../../lib/resumenError';
import { esObjeto, validarOportunidad } from '../../../lib/validarOportunidad';

export const runtime = 'nodejs';

const MAX_CUERPO = 1024 * 1024; // 1 MB
const GENERICO = 'Error interno, intenta de nuevo.';

const responder = (estado: number, cuerpo: unknown): Response => Response.json(cuerpo, { status: estado });
const rechazar = (error: string): Response => responder(400, { error });

/** Texto plano de la conversación de una oportunidad (para copiarla): el navegador no importa el paquete del agente. */
export async function POST(req: Request): Promise<Response> {
  try {
    if (!solicitudConAcceso(req)) return responder(401, { error: 'Necesitas la contraseña para usar esta página.' });

    const declarado = Number(req.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > MAX_CUERPO) return rechazar('La solicitud es demasiado grande (máximo 1 MB).');
    const texto = await req.text();
    if (Buffer.byteLength(texto, 'utf8') > MAX_CUERPO) return rechazar('La solicitud es demasiado grande (máximo 1 MB).');

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return rechazar('La solicitud no es un JSON válido.');
    }
    if (!esObjeto(cuerpo)) return rechazar('La solicitud debe ser un objeto JSON.');
    if (cuerpo['oportunidad'] === undefined || cuerpo['oportunidad'] === null) return rechazar('oportunidad: es obligatoria.');

    const errores = validarOportunidad(cuerpo['oportunidad']);
    if (errores.length > 0) return rechazar(`La oportunidad no es válida. ${errores.slice(0, 3).join(' ')}`);
    const oportunidad = cuerpo['oportunidad'] as Oportunidad;

    // Igual que /api/turno: el diagnóstico del navegador no se usa, se recalcula aquí.
    oportunidad.ultimoDiagnostico = calcularDiagnostico(oportunidad.expediente, hoyMexico());
    return responder(200, { texto: formatearTranscripcion(oportunidad) });
  } catch (e) {
    console.error('[api/transcripcion] error interno', resumenError(e));
    return responder(500, { error: GENERICO });
  }
}
