import type { Expediente, Posicion } from './tipos.js';

// De peor a mejor para nosotros. 'nula' (sin competencia) solo llega a las alternativas por captura directa.
const ORDEN: Posicion[] = ['alternativa', 'compartida', 'dominante', 'nula'];

/**
 * Posición general frente a la competencia:
 * - pregunta hecha y sin alternativas → 'nula';
 * - si no, la peor posición entre las alternativas (alternativa < compartida < dominante), ignorando las null;
 * - sin dato suficiente → null.
 */
export function posicionGeneral(exp: Expediente): Posicion | null {
  if (exp.preguntaCompetenciaHecha && exp.alternativas.length === 0) return 'nula';
  let peor: Posicion | null = null;
  for (const { posicion } of exp.alternativas) {
    if (posicion === null) continue;
    if (peor === null || ORDEN.indexOf(posicion) < ORDEN.indexOf(peor)) peor = posicion;
  }
  return peor;
}
