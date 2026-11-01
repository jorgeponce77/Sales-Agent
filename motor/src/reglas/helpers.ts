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
