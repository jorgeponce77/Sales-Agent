import type { Config, CriterioArgano } from './tipos.js';

// Criterios obligatorios de Argano para avanzar de etapa (doc 01 §1, columna
// "Completar para avanzar"). `etapaDesde` es la etapa que se está completando.
const CRITERIOS_ARGANO: CriterioArgano[] = [
  // Etapa 0 — Identifying (Suspect)
  { etapaDesde: 0, clave: 'fuente_creible', texto: 'La fuente del lead es creíble' },
  { etapaDesde: 0, clave: 'cliente_confirma_real', texto: 'El cliente confirma que la oportunidad es real' },
  { etapaDesde: 0, clave: 'alineada_estrategia_argano', texto: 'La oportunidad está alineada con la estrategia de Argano' },
  // Etapa 1 — Shaping & Discovery
  { etapaDesde: 1, clave: 'entiende_cliente_dolores', texto: 'Se entienden el cliente, sus dolores y su estrategia' },
  { etapaDesde: 1, clave: 'volumen_presupuesto_aprox', texto: 'Se conoce el volumen y el presupuesto aproximados' },
  { etapaDesde: 1, clave: 'aprobacion_calificacion_presupuesto_cliente', texto: 'Pasó la revisión de calificación y la aprobación de presupuesto del lado del cliente' },
  { etapaDesde: 1, clave: 'rfp_analizado', texto: 'RFP: la información fue analizada y las preguntas están armadas', soloRFP: true },
  { etapaDesde: 1, clave: 'business_case_identificado', texto: 'Se identificó el business case interno del cliente' },
  { etapaDesde: 1, clave: 'confirma_recibir_propuesta', texto: 'El cliente confirmó que quiere recibir una propuesta' },
  // Etapa 2 — Developing Proposal
  { etapaDesde: 2, clave: 'propuesta_desarrollada', texto: 'La propuesta está desarrollada' },
  { etapaDesde: 2, clave: 'requerimientos_refinados', texto: 'Los requerimientos están refinados' },
  { etapaDesde: 2, clave: 'recursos_presupuesto_evaluados', texto: 'Se evaluaron los recursos y el presupuesto' },
  { etapaDesde: 2, clave: 'estrategia_delivery_refinada', texto: 'La estrategia de delivery está refinada con los SMEs' },
  { etapaDesde: 2, clave: 'rfp_respuesta', texto: 'RFP: la respuesta está elaborada', soloRFP: true },
  { etapaDesde: 2, clave: 'revenue_equipo_calendario', texto: 'Están definidos el revenue, el equipo y el calendario antes de Deal Approval' },
  // Etapa 3 — Negotiating
  { etapaDesde: 3, clave: 'aprobacion_interna_recursos_margen', texto: 'Hay revisión interna y aprobación de recursos, tiempos y margen bruto' },
  { etapaDesde: 3, clave: 'pr_aprobado', texto: 'El proceso PR está aprobado' },
  { etapaDesde: 3, clave: 'propuesta_entregada', texto: 'La propuesta o el RFP fue entregado' },
  { etapaDesde: 3, clave: 'sow_precios_finalizados', texto: 'El SOW, la lista de precios (descuentos) y la asignación están finalizados con el cliente' },
  { etapaDesde: 3, clave: 'staffing_request', texto: 'Se levantó el staffing request para delivery' },
  { etapaDesde: 3, clave: 'forecast_actualizado', texto: 'El forecast de revenue está actualizado' },
  // Etapa 4 — Finalizing (Closing)
  { etapaDesde: 4, clave: 'acuerdo_cliente', texto: 'Hay acuerdo verbal o escrito del cliente' },
  { etapaDesde: 4, clave: 'fecha_inicio_confirmada', texto: 'La fecha de inicio está confirmada' },
  { etapaDesde: 4, clave: 'demand_signal_confirmado', texto: 'El demand signal (Resource Request) está confirmado con delivery' },
  { etapaDesde: 4, clave: 'sow_enviado_firma', texto: 'El SOW fue enviado a firma' },
];

/** Congela el valor y todo lo que contiene (objetos y arreglos anidados). */
function congelarProfundo<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelarProfundo);
    Object.freeze(valor);
  }
  return valor;
}

/** Configuración por defecto, de solo lectura: para modificarla, clónala con `structuredClone`. */
export const CONFIG_DEFAULT: Config = congelarProfundo({
  probabilidades: {
    NN: [0, 0, 20, 45, 85, 100],
    ENxT: [0, 0, 40, 65, 90, 100],
    EN: [0, 15, 50, 70, 90, 100],
    EE: [15, 40, 65, 85, 95, 100],
  },
  ciclosMeses: { WMS: 8, TMS: 10, PLANEACION_DEMANDA: 6, VOICE: 9 },
  diasPasoContrato: 5,
  diasAltaProveedor: 3,
  diasOC: 3,
  holguraEnRiesgo: 5,                  // días hábiles
  festivos: {
    MX: [
      '2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-09-16',
      '2026-11-16', '2026-12-25',
      '2027-01-01', '2027-02-01', '2027-03-15', '2027-05-01', '2027-09-16',
      '2027-11-15', '2027-12-25',
    ],
    // Los demás países quedan vacíos; George los configura después.
  },
  criteriosArgano: CRITERIOS_ARGANO,
  pesos: {
    influencias: 20, bant: 20, compellingEvent: 20, triunfoResultados: 10,
    competencia: 10, clienteIdeal: 10, coherencia: 10,
  },
  topeConCritica: 40,
  umbralVerde: 70,
  umbralRojo: 40,
  fechaOptimistaPct: { etapas01: 0.5, etapa2: 0.25 },
  umbralMontoAltoUSD: null,            // no aplica hasta que George lo defina
  caducidadDatoDias: 90,
  caducidadContactoDias: 60,
  horizonteAccionesDias: 30,
  maxAcciones: 5,
});
