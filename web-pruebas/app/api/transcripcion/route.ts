import { formatearTranscripcion } from 'agente-sales-agent';
import { hoyMexico } from '../../../lib/hoy';
import { ERROR_GENERICO, leerOportunidad, leerSolicitud, rechazar, responder } from '../../../lib/leerSolicitud';
import { resumenError } from '../../../lib/resumenError';

export const runtime = 'nodejs';

/** Texto plano de la conversación de una oportunidad (para copiarla): el navegador no importa el paquete del agente. */
export async function POST(req: Request): Promise<Response> {
  try {
    const solicitud = await leerSolicitud(req);
    if (!solicitud.ok) return solicitud.respuesta;
    const bruta = solicitud.valor['oportunidad'];
    if (bruta === undefined || bruta === null) return rechazar('oportunidad: es obligatoria.');

    const oportunidad = leerOportunidad(bruta, hoyMexico());
    if (!oportunidad.ok) return oportunidad.respuesta;
    return responder(200, { texto: formatearTranscripcion(oportunidad.valor) });
  } catch (e) {
    console.error('[api/transcripcion] error interno', resumenError(e));
    return responder(500, { error: ERROR_GENERICO });
  }
}
