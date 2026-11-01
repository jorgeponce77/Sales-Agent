import type { Contexto } from '../contexto.js';
import { posicionGeneral } from '../competencia.js';
import type { Influencia } from '../tipos.js';
import { esCoachValido } from './helpers.js';

/** Una fortaleza del catálogo: `evaluar` devuelve el texto si se cumple, o null. */
export interface ReglaFortaleza {
  id: string;
  evaluar(ctx: Contexto): string | null;
}

const esAltaOMedia = (i: Influencia): boolean => i.grado === 'A' || i.grado === 'M';

export const REGLAS_FORTALEZAS: ReglaFortaleza[] = [
  {
    id: 'coach_valido',
    evaluar: (ctx) => (ctx.exp.influencias.some(esCoachValido) ? 'Hay un Coach válido que respalda la oportunidad.' : null),
  },
  {
    id: 'economico_a_favor',
    evaluar: (ctx) =>
      ctx.economicos.some((e) => e.contactada && e.calificacion !== null && e.calificacion >= 3)
        ? 'Un Económico contactado está a favor (calificación de +3 o más).'
        : null,
  },
  {
    id: 'bant_confirmado',
    evaluar: (ctx) => {
      const { budget, authority, need, time } = ctx.exp.bant;
      return [budget, authority, need, time].every((e) => e.nivel === 'confirmado')
        ? 'Los cuatro elementos de BANT están confirmados.'
        : null;
    },
  },
  {
    id: 'ce_completo',
    evaluar: (ctx) => {
      const { fecha, dueno, costoInaccion, urgenciaFalsa } = ctx.exp.compellingEvent;
      return [fecha, dueno, costoInaccion].every((e) => e.nivel === 'confirmado') && !urgenciaFalsa
        ? 'El compelling event está completo: fecha, dueño y costo de la inacción confirmados.'
        : null;
    },
  },
  {
    id: 'dominante_con_contribucion',
    evaluar: (ctx) =>
      posicionGeneral(ctx.exp) === 'dominante' && ctx.exp.contribucionDiferenciadora.nivel !== 'ausente'
        ? 'Tenemos posición dominante y una contribución diferenciadora identificada.'
        : null,
  },
  {
    id: 'cliente_ideal_alto',
    evaluar: (ctx) => {
      const valores = ctx.exp.cuenta.clienteIdeal.map((e) => e.valor).filter((v): v is number => v !== null);
      if (valores.length === 0) return null;
      const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
      return promedio >= 3 ? 'La cuenta es un cliente ideal: el promedio de los criterios es alto.' : null;
    },
  },
  {
    id: 'tr_completos',
    evaluar: (ctx) => {
      const clave = ctx.exp.influencias.filter(esAltaOMedia);
      return clave.length > 0 && clave.every((i) => i.trDeclaracion !== null && i.trDeclaracion.trim() !== '')
        ? 'Todas las Influencias de grado alto y medio tienen su Triunfo-Resultado redactado.'
        : null;
    },
  },
  {
    id: 'varios_a_favor',
    evaluar: (ctx) =>
      ctx.exp.influencias.filter(
        (i) => (i.modo === 'C' || i.modo === 'P') && i.calificacion !== null && i.calificacion > 0,
      ).length >= 2
        ? 'Dos o más Influencias en modo Crecimiento o Problema están a favor.'
        : null,
  },
];
