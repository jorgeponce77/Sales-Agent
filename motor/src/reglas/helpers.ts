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
