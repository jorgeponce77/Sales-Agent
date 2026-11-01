import { cicloMeses } from './oportunidad.js';
import { diasHabilesEntre, sumarDiasHabiles, sumarDiasNaturales } from './fechas.js';
import type { Config, Expediente, ResultadoFecha } from './tipos.js';

const ACELERADOR = 'Inicia en paralelo el alta de proveedor y la OC desde hoy';

/**
 * Prueba de la fecha de cierre (spec §7.3): ¿cuándo podría cerrar de forma creíble,
 * contando los pasos pendientes de la cadena de cierre en días hábiles?
 */
export function evaluarFechaCierre(exp: Expediente, hoy: string, config: Config): ResultadoFecha {
  const { pasos, ruta, requiereSOW } = exp.cadena;
  if (!pasos.aElegido) {
    return { veredicto: 'no_cierra_periodo', fechaCreible: null, diasPendientes: null, rutaUsada: null, acelerador: null };
  }

  const pendientesContrato = [pasos.bContratoEnviado, pasos.cComentariosRecibidos, pasos.dEnFirma, pasos.eFirmado]
    .filter((hecho) => !hecho).length;
  const diasContrato = config.diasPasoContrato * pendientesContrato;
  const diasOC = (pasos.fAltaProveedor ? 0 : config.diasAltaProveedor) + (pasos.hOC ? 0 : config.diasOC);

  let rutaUsada: 'contrato' | 'oc' = 'contrato';
  let diasPendientes = diasContrato;
  if (requiereSOW !== true) {
    if (ruta === 'oc') {
      rutaUsada = 'oc';
      diasPendientes = diasOC;
    } else if (ruta === 'ambas_independientes' && diasOC < diasContrato) {
      rutaUsada = 'oc';
      diasPendientes = diasOC;
    }
  }

  const festivos = config.festivos[exp.cuenta.pais] ?? [];
  const fechaCreible = sumarDiasHabiles(hoy, diasPendientes, festivos);

  let veredicto: ResultadoFecha['veredicto'];
  if (exp.fechaCierreCRM === null || exp.fechaCierreCRM < fechaCreible) {
    veredicto = 'no_cierra_fecha';
  } else if (diasHabilesEntre(fechaCreible, exp.fechaCierreCRM, festivos) < config.holguraEnRiesgo) {
    veredicto = 'en_riesgo';
  } else {
    veredicto = 'creible';
  }

  const acelerador =
    rutaUsada === 'contrato' && (!pasos.fAltaProveedor || !pasos.hOC) ? ACELERADOR : null;

  return { veredicto, fechaCreible, diasPendientes, rutaUsada, acelerador };
}

/**
 * La fecha del CRM es optimista si cae antes de la fracción del ciclo normal que
 * corresponde a la etapa (etapas 0–1: 50 %, etapa 2: 25 %); desde la etapa 3 no aplica.
 */
export function esFechaOptimista(exp: Expediente, hoy: string, config: Config): boolean {
  if (exp.fechaCierreCRM === null) return false;
  if (exp.etapaCRM >= 3) return false;
  const pct = exp.etapaCRM <= 1 ? config.fechaOptimistaPct.etapas01 : config.fechaOptimistaPct.etapa2;
  const dias = Math.round(cicloMeses(exp, config) * 30 * pct);
  return exp.fechaCierreCRM < sumarDiasNaturales(hoy, dias);
}
