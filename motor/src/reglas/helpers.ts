import type { Contexto } from '../contexto.js';
import type { Influencia } from '../tipos.js';

/** Coach válido: rol C, calificación ≥ 3 y modo Crecimiento o Problema. */
export function esCoachValido(inf: Influencia): boolean {
  return (
    inf.roles.includes('C') &&
    inf.calificacion !== null &&
    inf.calificacion >= 3 &&
    (inf.modo === 'C' || inf.modo === 'P')
  );
}

/** La Influencia tiene su Triunfo-Resultado redactado (no vacío ni solo espacios). */
export function tieneTR(inf: Influencia): boolean {
  return inf.trDeclaracion !== null && inf.trDeclaracion.trim() !== '';
}

/** Influencia de grado alto o medio. */
export function esAltaOMedia(inf: Influencia): boolean {
  return inf.grado === 'A' || inf.grado === 'M';
}

/**
 * Por qué la etapa del CRM está por encima de la recomendada, para el texto de `etapa_inflada*`:
 * los criterios, la compuerta de proveedor elegido (paso a) o la falta de entregable de cierre.
 */
export function causaEtapaInflada(ctx: Contexto): string {
  if (ctx.limiteEtapa === 'elegido') {
    return `de la recomendada (etapa ${ctx.etapaRec}): el cliente todavía no nos ha elegido (paso a), y Finalizing lo exige`;
  }
  if (ctx.limiteEtapa === 'entregable') {
    return `de la recomendada (etapa ${ctx.etapaRec}): no hay orden de compra ni contrato firmado para marcarla Won`;
  }
  return `de lo que sostienen los criterios (etapa ${ctx.etapaRec})`;
}
