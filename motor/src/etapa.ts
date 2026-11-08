import type { Config, CriterioCumplido, Etapa, Expediente } from './tipos.js';

/**
 * Hay entregable de cierre si existe contrato firmado u OC, y la OC sola no basta
 * cuando el cierre requiere SOW (entonces hace falta la firma).
 */
export function entregableCierre(exp: Expediente): boolean {
  const { pasos, requiereSOW } = exp.cadena;
  return (pasos.eFirmado || pasos.hOC) && (requiereSOW !== true || pasos.eFirmado);
}

/**
 * ¿Un criterio registrado contradice la etapa `d` (ya presumida por el CRM)? Solo un `ausente` registrado con
 * el CRM ya pasada esa etapa (`etapaRegistro` > d), o sin `etapaRegistro` (datos anteriores a ese campo).
 */
export function esContradiccion(c: CriterioCumplido, d: number): boolean {
  return c.nivel === 'ausente' && (c.etapaRegistro === undefined || c.etapaRegistro > d);
}

/** Claves de criterios de etapas anteriores a la del CRM que el vendedor contradijo (ver `esContradiccion`). */
export function contradiccionesPrevias(exp: Expediente, config: Config): string[] {
  const registrados = new Map(exp.criteriosArgano.map((c) => [c.clave, c]));
  return config.criteriosArgano
    .filter((c) => c.etapaDesde < exp.etapaCRM && (!c.soloRFP || exp.esRFP))
    .filter((c) => {
      const r = registrados.get(c.clave);
      return r !== undefined && esContradiccion(r, c.etapaDesde);
    })
    .map((c) => c.clave);
}

/**
 * Etapa que sostienen los criterios de Argano: se avanza etapa por etapa mientras los
 * criterios requeridos de cada etapa se den por cumplidos.
 *
 * Presunción por etapa (George, 8-nov-2026): la etapa del CRM implica que lo de las etapas
 * anteriores ya ocurrió. Para cada etapa d < etapaCRM, sus criterios se **presumen cumplidos**
 * salvo que alguno esté registrado en `ausente` (contradicción dicha por el vendedor); un
 * `supuesto` también cuenta como presumido. Un `ausente` solo es contradicción de la etapa d si se
 * registró con el CRM ya pasada esa etapa (`etapaRegistro` > d) o si no trae `etapaRegistro`
 * (datos anteriores): un "no sé" de la etapa en curso no infla la etapa cuando el CRM sube.
 * Para d ≥ etapaCRM (la actual y las siguientes) se exige `confirmado`, así que solo se recomienda
 * por encima del CRM con evidencia del cliente.
 * Se mantienen las compuertas duras: pasar a ≥4 exige proveedor elegido (paso a; un contrato firmado
 * o una OC lo implican) y la 5 exige entregable de cierre, también por debajo de la etapa del CRM.
 */
export function etapaRecomendada(exp: Expediente, config: Config): Etapa {
  return detalleEtapa(exp, config).etapa;
}

/**
 * Qué detuvo la etapa recomendada: `criterios` (un criterio no cumplido, o se llegó al tope), `elegido`
 * (la compuerta del paso a, para pasar a ≥4) o `entregable` (sin OC ni contrato firmado para la 5).
 */
export type LimiteEtapa = 'criterios' | 'elegido' | 'entregable';

/** Etapa recomendada (ver `etapaRecomendada`) y qué la limitó, para explicar una etapa inflada. */
export function detalleEtapa(exp: Expediente, config: Config): { etapa: Etapa; limite: LimiteEtapa } {
  const confirmados = new Set(
    exp.criteriosArgano.filter((c) => c.nivel === 'confirmado').map((c) => c.clave),
  );
  const registrados = new Map(exp.criteriosArgano.map((c) => [c.clave, c]));
  const contradice = (clave: string, d: number): boolean => {
    const r = registrados.get(clave);
    return r !== undefined && esContradiccion(r, d);
  };
  const { pasos } = exp.cadena;
  const elegido = pasos.aElegido || pasos.eFirmado || pasos.hOC;
  let k = 0;
  for (let d = 0; d <= 4; d++) {
    const requeridos = config.criteriosArgano.filter(
      (c) => c.etapaDesde === d && (!c.soloRFP || exp.esRFP),
    );
    const cumplido =
      d < exp.etapaCRM
        ? (clave: string) => !contradice(clave, d)
        : (clave: string) => confirmados.has(clave);
    if (!requeridos.every((c) => cumplido(c.clave))) return { etapa: k as Etapa, limite: 'criterios' };
    // Pasar a ≥4 exige proveedor elegido.
    if (d === 3 && !elegido) return { etapa: k as Etapa, limite: 'elegido' };
    k = d + 1;
  }
  if (!entregableCierre(exp)) return { etapa: 4, limite: 'entregable' };
  return { etapa: 5, limite: 'criterios' };
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
