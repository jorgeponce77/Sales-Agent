import type { Config, Etapa, Expediente } from './tipos.js';

/**
 * Hay entregable de cierre si existe contrato firmado u OC, y la OC sola no basta
 * cuando el cierre requiere SOW (entonces hace falta la firma).
 */
export function entregableCierre(exp: Expediente): boolean {
  const { pasos, requiereSOW } = exp.cadena;
  return (pasos.eFirmado || pasos.hOC) && (requiereSOW !== true || pasos.eFirmado);
}

/**
 * Etapa que sostienen los criterios de Argano: se avanza etapa por etapa mientras los
 * criterios requeridos de cada etapa se den por cumplidos.
 *
 * Presunción por etapa (George, 8-nov-2026): la etapa del CRM implica que lo de las etapas
 * anteriores ya ocurrió. Para cada etapa d < etapaCRM, sus criterios se **presumen cumplidos**
 * salvo que alguno esté registrado en `ausente` (contradicción dicha por el vendedor); un
 * `supuesto` también cuenta como presumido. Para d ≥ etapaCRM (la actual y las siguientes) se
 * exige `confirmado`, así que solo se recomienda por encima del CRM con evidencia del cliente.
 * Se mantienen las compuertas duras: pasar a ≥4 exige proveedor elegido (paso a) y la 5 exige
 * entregable de cierre, también por debajo de la etapa del CRM.
 */
export function etapaRecomendada(exp: Expediente, config: Config): Etapa {
  const confirmados = new Set(
    exp.criteriosArgano.filter((c) => c.nivel === 'confirmado').map((c) => c.clave),
  );
  const ausentes = new Set(
    exp.criteriosArgano.filter((c) => c.nivel === 'ausente').map((c) => c.clave),
  );
  let k = 0;
  for (let d = 0; d <= 4; d++) {
    const requeridos = config.criteriosArgano.filter(
      (c) => c.etapaDesde === d && (!c.soloRFP || exp.esRFP),
    );
    const cumplido =
      d < exp.etapaCRM
        ? (clave: string) => !ausentes.has(clave)
        : (clave: string) => confirmados.has(clave);
    if (!requeridos.every((c) => cumplido(c.clave))) break;
    // Pasar a ≥4 exige proveedor elegido.
    if (d === 3 && !exp.cadena.pasos.aElegido) break;
    k = d + 1;
  }
  if (k === 5 && !entregableCierre(exp)) k = 4;
  return k as Etapa;
}

/** `diferencia = crm − rec`: positiva si el CRM está inflado, negativa si está rezagado. */
export function compararEtapa(
  crm: Etapa,
  rec: Etapa,
): { resultado: 'al_dia' | 'inflada' | 'rezagada'; diferencia: number } {
  const diferencia = crm - rec;
  const resultado = diferencia > 0 ? 'inflada' : diferencia < 0 ? 'rezagada' : 'al_dia';
  return { resultado, diferencia };
}
