import { crearOportunidad, ejecutarTurno, ESCENARIOS, horaLocalPorPais, iniciarSesion, validarFicha } from 'agente-sales-agent';
import type { Ficha, ModoSesion, Oportunidad, OpcionesTurno } from 'agente-sales-agent';
import { validarExpediente } from 'motor-sales-agent';
import { obtenerCliente } from '../../../lib/clienteServidor';
import { hoyMexico } from '../../../lib/hoy';
import { ERROR_GENERICO, leerOportunidad, leerSolicitud, rechazar, recalcularDiagnostico, responder } from '../../../lib/leerSolicitud';
import { horaEnZona, zonaValida } from '../../../lib/horaVendedor';
import { resumenError } from '../../../lib/resumenError';
import { esObjeto, MODOS } from '../../../lib/validarOportunidad';

// Con razonamiento, un turno puede hacer hasta ~9 llamadas al modelo.
export const runtime = 'nodejs';
export const maxDuration = 300;

const ACCIONES = ['iniciar', 'mensaje', 'cerrar'];
// Presupuesto del turno: al pasarlo, el agente responde sin más herramientas; deja margen antes de maxDuration.
const LIMITE_TURNO_MS = 240_000;
const VENDEDOR_PRUEBAS = 'prueba';

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
    const solicitud = await leerSolicitud(req);
    if (!solicitud.ok) return solicitud.respuesta;
    const cuerpo = solicitud.valor;

    const accion = cuerpo['accion'];
    if (typeof accion !== 'string' || !ACCIONES.includes(accion)) {
      return rechazar(`accion: debe ser ${ACCIONES.join(', ')}.`);
    }
    const modo = cuerpo['modo'];
    if (modo !== undefined && (typeof modo !== 'string' || !(MODOS as readonly string[]).includes(modo))) {
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

    // Toda respuesta (incluso la de un turno sin cambios o la de una oportunidad cerrada) trae un diagnóstico
    // calculado por el servidor: `leerOportunidad` y las ramas de oportunidad nueva lo recalculan.
    const hoy = hoyMexico();
    let oportunidad: Oportunidad;
    if (cuerpo['oportunidad'] !== undefined && cuerpo['oportunidad'] !== null) {
      const leida = leerOportunidad(cuerpo['oportunidad'], hoy);
      if (!leida.ok) return leida.respuesta;
      oportunidad = leida.valor;
    } else if (accion !== 'iniciar') {
      return rechazar('oportunidad: es obligatoria para esta acción.');
    } else if (escenario !== undefined) {
      // La ficha del escenario se arma aquí, con la fecha del servidor.
      const nueva = oportunidadNueva(escenario.construirFicha(hoy));
      if (typeof nueva === 'string') throw new Error(`escenario ${escenario.id}: ${nueva}`);
      oportunidad = recalcularDiagnostico(nueva, hoy);
    } else if (esObjeto(cuerpo['ficha'])) {
      const nueva = oportunidadNueva({ ...(cuerpo['ficha'] as unknown as Ficha), fechaCreacion: hoy, vendedor: VENDEDOR_PRUEBAS });
      if (typeof nueva === 'string') return rechazar(nueva);
      oportunidad = recalcularDiagnostico(nueva, hoy);
    } else {
      return rechazar('Falta la oportunidad, la ficha o el escenario para iniciar.');
    }

    const opciones: OpcionesTurno = {
      cliente: obtenerCliente(),
      hoy,
      modelo: process.env.MODELO_AGENTE || undefined,
      limiteMs: LIMITE_TURNO_MS,
      // Hora del vendedor para el saludo: la de su navegador si manda una zona válida; si no, la del país de la ficha.
      horaLocal: zonaValida(cuerpo['zonaHoraria']) ? horaEnZona(cuerpo['zonaHoraria']) : horaLocalPorPais(oportunidad.ficha.pais),
      registrarError: (e) => console.error('[api/turno] fallo de la API', resumenError(e)),
    };
    const resultado = accion === 'iniciar'
      ? await iniciarSesion(oportunidad, (modo as ModoSesion | undefined) ?? 'calificar', opciones)
      : await ejecutarTurno(oportunidad, (mensaje as string | undefined) ?? '', { ...opciones, cerrar: accion === 'cerrar' });
    return responder(200, resultado);
  } catch (e) {
    console.error('[api/turno] error interno', resumenError(e));
    return responder(500, { error: ERROR_GENERICO });
  }
}
