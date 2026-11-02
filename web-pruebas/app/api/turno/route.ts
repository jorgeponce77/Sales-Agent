import { crearOportunidad, ejecutarTurno, ESCENARIOS, iniciarSesion, validarFicha } from 'agente-sales-agent';
import type { Ficha, ModoSesion, Oportunidad, OpcionesTurno } from 'agente-sales-agent';
import { validarExpediente } from 'motor-sales-agent';
import { solicitudConAcceso } from '../../../lib/acceso';
import { obtenerCliente } from '../../../lib/clienteServidor';
import { hoyMexico } from '../../../lib/hoy';
import { resumenError } from '../../../lib/resumenError';
import { validarOportunidad } from '../../../lib/validarOportunidad';

// Con razonamiento, un turno puede hacer hasta ~9 llamadas al modelo.
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CUERPO = 1024 * 1024; // 1 MB
const ACCIONES = ['iniciar', 'mensaje', 'cerrar'];
const MODOS: ModoSesion[] = ['calificar', 'revision_rapida'];
const VENDEDOR_PRUEBAS = 'prueba';

const GENERICO = 'Error interno, intenta de nuevo.';

const responder = (estado: number, cuerpo: unknown): Response => Response.json(cuerpo, { status: estado });
const rechazar = (error: string): Response => responder(400, { error });

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Oportunidad nueva desde una ficha; la valida y devuelve el error en español si no sirve. */
function oportunidadNueva(ficha: Ficha): Oportunidad | string {
  const errores = validarFicha(ficha);
  if (errores.length > 0) return `La ficha no es válida: ${errores.join(' ')}`;
  const op = crearOportunidad(ficha);
  const erroresExp = validarExpediente(op.expediente);
  if (erroresExp.length > 0) {
    return `La ficha no produce un expediente válido: ${erroresExp.slice(0, 3).map((e) => `${e.campo}: ${e.mensaje}`).join(' ')}`;
  }
  return op;
}

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

    const accion = cuerpo['accion'];
    if (typeof accion !== 'string' || !ACCIONES.includes(accion)) {
      return rechazar(`accion: debe ser ${ACCIONES.join(', ')}.`);
    }
    const modo = cuerpo['modo'];
    if (modo !== undefined && (typeof modo !== 'string' || !MODOS.includes(modo as ModoSesion))) {
      return rechazar(`modo: debe ser ${MODOS.join(' o ')}.`);
    }
    const mensaje = cuerpo['mensaje'];
    if (mensaje !== undefined && typeof mensaje !== 'string') return rechazar('mensaje: debe ser texto.');
    if (accion === 'mensaje' && mensaje === undefined) return rechazar('mensaje: es obligatorio.');
    const escenarioId = cuerpo['escenarioId'];
    const escenario = escenarioId === undefined ? undefined : ESCENARIOS.find((e) => e.id === escenarioId);
    if (escenarioId !== undefined && escenario === undefined) {
      return rechazar(`escenarioId: debe ser ${ESCENARIOS.map((e) => e.id).join(', ')}.`);
    }

    const hoy = hoyMexico();
    let oportunidad: Oportunidad;
    if (cuerpo['oportunidad'] !== undefined && cuerpo['oportunidad'] !== null) {
      const errores = validarOportunidad(cuerpo['oportunidad']);
      if (errores.length > 0) return rechazar(`La oportunidad no es válida. ${errores.slice(0, 3).join(' ')}`);
      oportunidad = cuerpo['oportunidad'] as Oportunidad;
    } else if (accion !== 'iniciar') {
      return rechazar('oportunidad: es obligatoria para esta acción.');
    } else if (escenario !== undefined) {
      // La ficha del escenario se arma aquí, con la fecha del servidor.
      const nueva = oportunidadNueva(escenario.construirFicha(hoy));
      if (typeof nueva === 'string') throw new Error(`escenario ${escenario.id}: ${nueva}`);
      oportunidad = nueva;
    } else if (esObjeto(cuerpo['ficha'])) {
      const nueva = oportunidadNueva({ ...(cuerpo['ficha'] as unknown as Ficha), fechaCreacion: hoy, vendedor: VENDEDOR_PRUEBAS });
      if (typeof nueva === 'string') return rechazar(nueva);
      oportunidad = nueva;
    } else {
      return rechazar('Falta la oportunidad, la ficha o el escenario para iniciar.');
    }

    const opciones: OpcionesTurno = {
      cliente: obtenerCliente(),
      hoy,
      modelo: process.env.MODELO_AGENTE || undefined,
      registrarError: (e) => console.error('[api/turno] fallo de la API', resumenError(e)),
    };
    const resultado = accion === 'iniciar'
      ? await iniciarSesion(oportunidad, (modo as ModoSesion | undefined) ?? 'calificar', opciones)
      : await ejecutarTurno(oportunidad, (mensaje as string | undefined) ?? '', { ...opciones, cerrar: accion === 'cerrar' });
    return responder(200, resultado);
  } catch (e) {
    console.error('[api/turno] error interno', resumenError(e));
    return responder(500, { error: GENERICO });
  }
}
