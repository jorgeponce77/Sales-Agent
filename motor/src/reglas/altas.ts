import type { Contexto } from '../contexto.js';
import type { Evidencia } from '../tipos.js';
import { esCoachValido } from './helpers.js';
import type { Regla } from './tipos.js';

type ElementoBant = 'budget' | 'authority' | 'need' | 'time';

const NOMBRE_BANT: Record<ElementoBant, string> = {
  budget: 'Budget', authority: 'Authority', need: 'Need', time: 'Time',
};

function bantCon(ctx: Contexto, nivel: Evidencia<string>['nivel'], elementos: ElementoBant[]): string[] {
  return elementos.filter((e) => ctx.exp.bant[e].nivel === nivel).map((e) => NOMBRE_BANT[e]);
}

const ceTieneElementosSinConfirmar = (ctx: Contexto): boolean => {
  const { fecha, dueno, costoInaccion } = ctx.exp.compellingEvent;
  return [fecha, dueno, costoInaccion].some((e) => e.nivel !== 'confirmado');
};

/** Banderas altas (spec §7.5). */
export const REGLAS_ALTAS: Regla[] = [
  {
    id: 'bant_supuesto',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) => {
      const nombres = bantCon(ctx, 'supuesto', ['budget', 'authority', 'need', 'time']);
      return nombres.length > 0 ? `BANT en supuesto: ${nombres.join(', ')}.` : null;
    },
  },
  {
    id: 'bant_ausente',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) => {
      const nombres = bantCon(ctx, 'ausente', ['authority', 'need', 'time']);
      return nombres.length > 0 ? `BANT sin información: ${nombres.join(', ')}.` : null;
    },
  },
  {
    id: 'ce_incompleto',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ceTieneElementosSinConfirmar(ctx) && !ctx.exp.compellingEvent.urgenciaFalsa
        ? 'El evento convincente no está completo: falta confirmar fecha, dueño o costo de la inacción.'
        : null,
  },
  {
    id: 'ce_urgencia_falsa',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.compellingEvent.urgenciaFalsa ? 'La urgencia del cliente parece falsa: no hay un evento real que la respalde.' : null,
  },
  {
    id: 'sin_coach_valido',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.influencias.some(esCoachValido)
        ? null
        : 'No hay un Coach válido (calificación de +3 o más, en modo Crecimiento o Problema).',
  },
  {
    id: 'etapa_inflada',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.comparacion.diferencia === 1
        ? `La etapa del CRM está una etapa por encima de lo que sostienen los criterios (etapa ${ctx.etapaRec}).`
        : null,
  },
  {
    id: 'banco_una_pata',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.influencias.filter((i) => i.contactada).length === 1
        ? 'Solo hay una Influencia contactada: el banco tiene una sola pata.'
        : null,
  },
  {
    id: 'rfp_sin_contacto_previo',
    severidad: 'alta',
    lente: 'gerente',
    evaluar: (ctx) =>
      ctx.exp.esRFP && ctx.exp.contactoPrevioRFP !== true
        ? 'Es un RFP y no hubo contacto previo con el cliente antes de recibirlo.'
        : null,
  },
  {
    id: 'atorada',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) => (ctx.atorada ? 'La oportunidad está atorada: superó el ciclo normal de venta.' : null),
  },
  {
    id: 'sow_requerido_solo_oc',
    severidad: 'alta',
    lente: 'director',
    evaluar: (ctx) =>
      ctx.exp.cadena.requiereSOW === true && ctx.exp.cadena.ruta === 'oc'
        ? 'El cierre requiere SOW, pero la ruta prevista es solo con orden de compra.'
        : null,
  },
  {
    id: 'no_cierra_fecha',
    severidad: 'alta',
    lente: 'director',
    evaluar: (ctx) =>
      ctx.fecha?.veredicto === 'no_cierra_fecha'
        ? 'Los pasos pendientes de la cadena de cierre no caben antes de la fecha de cierre del CRM.'
        : null,
  },
  {
    id: 'influencia_alta_no_contactada',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.influencias.some((i) => i.grado === 'A' && !i.contactada)
        ? 'Hay una Influencia de grado alto que no ha sido contactada.'
        : null,
  },
  {
    id: 'sin_contribucion_diferenciadora',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.contribucionDiferenciadora.nivel === 'ausente'
        ? 'No se ha identificado nuestra contribución diferenciadora.'
        : null,
  },
  {
    id: 'alternativas_no_identificadas',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      !ctx.exp.preguntaCompetenciaHecha
        ? 'No se ha preguntado por la competencia ni por las alternativas del cliente.'
        : null,
  },
  {
    id: 'cierre_despues_ce',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) => {
      const { fechaCierreCRM } = ctx.exp;
      const { fecha } = ctx.exp.compellingEvent;
      return fechaCierreCRM !== null &&
        fecha.valor !== null &&
        (fecha.nivel === 'confirmado' || fecha.nivel === 'supuesto') &&
        fechaCierreCRM > fecha.valor
        ? `La fecha de cierre (${fechaCierreCRM}) es posterior a la fecha del evento convincente (${fecha.valor}).`
        : null;
    },
  },
  {
    id: 'urgente_sin_ce',
    severidad: 'alta',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.prioridad.valor === 'urgente' && ctx.exp.compellingEvent.fecha.nivel === 'ausente'
        ? 'El cliente dice que es urgente, pero no hay un evento convincente con fecha.'
        : null,
  },
];
