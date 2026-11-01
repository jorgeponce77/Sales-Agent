import { finDeTrimestre } from '../fechas.js';
import type { Regla } from './tipos.js';

/** Banderas críticas (spec §7.5): cualquiera de ellas limita el índice. */
export const REGLAS_CRITICAS: Regla[] = [
  {
    id: 'sin_economico',
    severidad: 'critica',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.economicos.length === 0
        ? 'No hay Influencia Económica identificada para este objetivo de venta.'
        : null,
  },
  {
    id: 'economico_sin_cubrir',
    severidad: 'critica',
    lente: 'director',
    evaluar: (ctx) =>
      ctx.economicos.length > 0 && ctx.economicos.every((e) => !e.contactada)
        ? 'Ninguna Influencia Económica ha sido contactada.'
        : null,
  },
  {
    id: 'budget_ausente',
    severidad: 'critica',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.bant.budget.nivel === 'ausente' ? 'No hay información de presupuesto (Budget).' : null,
  },
  {
    id: 'no_elegidos_cierre_periodo',
    severidad: 'critica',
    lente: 'director',
    evaluar: (ctx) =>
      ctx.fecha?.veredicto === 'no_cierra_periodo' &&
      ctx.exp.fechaCierreCRM !== null &&
      ctx.exp.fechaCierreCRM <= finDeTrimestre(ctx.hoy)
        ? 'No hemos sido elegidos y la fecha de cierre cae dentro de este periodo.'
        : null,
  },
  {
    id: 'etapa_inflada_grave',
    severidad: 'critica',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.comparacion.diferencia >= 2
        ? `La etapa del CRM está inflada ${ctx.comparacion.diferencia} etapas respecto a lo que sostienen los criterios (etapa ${ctx.etapaRec}).`
        : null,
  },
];
