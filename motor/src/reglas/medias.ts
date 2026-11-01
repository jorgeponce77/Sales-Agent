import type { Contexto } from '../contexto.js';
import { posicionGeneral } from '../competencia.js';
import { diasNaturalesEntre } from '../fechas.js';
import type { Evidencia, Influencia } from '../tipos.js';
import { REGLAS_ALTAS } from './altas.js';
import { REGLAS_CRITICAS } from './criticas.js';
import { esAltaOMedia, tieneTR } from './helpers.js';
import { aplicaLente, type Regla } from './tipos.js';


/** Evidencias que pueden caducar, con el nombre que se muestra al usuario. */
function evidenciasConFecha(ctx: Contexto): { nombre: string; ev: Evidencia<unknown> }[] {
  const { bant, compellingEvent, prioridad, contribucionDiferenciadora, reorganizacion, cuenta } = ctx.exp;
  return [
    { nombre: 'Budget', ev: bant.budget },
    { nombre: 'Authority', ev: bant.authority },
    { nombre: 'Need', ev: bant.need },
    { nombre: 'Time', ev: bant.time },
    { nombre: 'fecha del compelling event', ev: compellingEvent.fecha },
    { nombre: 'dueño del compelling event', ev: compellingEvent.dueno },
    { nombre: 'costo de la inacción', ev: compellingEvent.costoInaccion },
    { nombre: 'prioridad', ev: prioridad },
    { nombre: 'contribución diferenciadora', ev: contribucionDiferenciadora },
    { nombre: 'reorganización', ev: reorganizacion },
    ...cuenta.clienteIdeal.map((ev, i) => ({ nombre: `cliente ideal (criterio ${i + 1})`, ev })),
  ];
}

const nombres = (influencias: Influencia[]): string => influencias.map((i) => i.nombre).join(', ');

/** Banderas medias (spec §7.5). */
export const REGLAS_MEDIAS: Regla[] = [
  {
    id: 'influencia_nueva_puesto',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const nuevas = ctx.exp.influencias.filter((i) => i.nuevaEnPuesto);
      return nuevas.length > 0 ? `Hay Influencias nuevas en el puesto: ${nombres(nuevas)}.` : null;
    },
  },
  {
    id: 'reorganizacion',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.exp.reorganizacion.valor === true ? 'El cliente está en una reorganización que puede cambiar a los participantes.' : null,
  },
  {
    id: 'informacion_incierta',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) =>
      ctx.economicos.length > 1
        ? `Hay ${ctx.economicos.length} Influencias Económicas: no está claro quién decide el presupuesto.`
        : null,
  },
  {
    id: 'modo_calificacion_inconsistente',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const incoherentes = ctx.exp.influencias.filter(
        (i) => (i.modo === 'E' || i.modo === 'EC') && i.calificacion !== null && i.calificacion > 0,
      );
      return incoherentes.length > 0
        ? `Calificación positiva con modo Equilibrio o Exceso de confianza: ${nombres(incoherentes)}.`
        : null;
    },
  },
  {
    id: 'modo_no_determinado',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const sinModo = ctx.exp.influencias.filter((i) => i.contactada && i.modo === null);
      return sinModo.length > 0 ? `Influencias contactadas sin modo determinado: ${nombres(sinModo)}.` : null;
    },
  },
  {
    id: 'nula_sin_criterios',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) =>
      posicionGeneral(ctx.exp) === 'nula' && !ctx.exp.criteriosCompraDefinidos
        ? 'No hay alternativas, pero tampoco hay criterios de compra definidos.'
        : null,
  },
  {
    id: 'euforia_con_banderas',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const { sensacion } = ctx.exp;
      if (sensacion !== 'euforico' && sensacion !== 'excelente') return null;
      const hay = [...REGLAS_CRITICAS, ...REGLAS_ALTAS].some(
        (r) => aplicaLente(r, ctx.lente) && r.evaluar(ctx) !== null,
      );
      return hay ? 'El vendedor se siente muy bien con la oportunidad, pero hay banderas críticas o altas.' : null;
    },
  },
  {
    id: 'prioridad_incongruente',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const { valor } = ctx.exp.prioridad;
      const { economicos } = ctx;
      if (valor === 'postergable' && economicos.some((e) => e.modo === 'P')) {
        return 'La prioridad es postergable, pero un Económico está en modo Problema.';
      }
      if (valor === 'postergable' && ctx.lente === 'director') {
        return 'La prioridad es postergable, pero la oportunidad ya está cerca del cierre.';
      }
      if (valor === 'urgente' && economicos.length > 0 && economicos.every((e) => e.modo === 'E' || e.modo === 'EC')) {
        return 'La prioridad es urgente, pero todos los Económicos están en modo Equilibrio o Exceso de confianza.';
      }
      return null;
    },
  },
  {
    id: 'tr_no_redactado',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const sinTR = ctx.exp.influencias.filter((i) => esAltaOMedia(i) && !tieneTR(i));
      return sinTR.length > 0 ? `Falta redactar el Triunfo-Resultado de: ${nombres(sinTR)}.` : null;
    },
  },
  {
    id: 'dato_caduco',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const caducos = evidenciasConFecha(ctx).filter(
        ({ ev }) =>
          ev.nivel === 'confirmado' &&
          ev.fecha !== undefined &&
          diasNaturalesEntre(ev.fecha, ctx.hoy) > ctx.config.caducidadDatoDias,
      );
      return caducos.length > 0
        ? `Datos confirmados hace más de ${ctx.config.caducidadDatoDias} días: ${caducos.map((c) => c.nombre).join(', ')}.`
        : null;
    },
  },
  {
    id: 'influencia_sin_contacto',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const olvidadas = ctx.exp.influencias.filter(
        (i) =>
          i.ultimoContacto !== undefined &&
          diasNaturalesEntre(i.ultimoContacto, ctx.hoy) > ctx.config.caducidadContactoDias,
      );
      return olvidadas.length > 0
        ? `Sin contacto en más de ${ctx.config.caducidadContactoDias} días: ${nombres(olvidadas)}.`
        : null;
    },
  },
  {
    id: 'crm_desactualizado',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) =>
      Object.values(ctx.exp.higieneCRM).some((v) => v === false)
        ? 'El CRM está desactualizado: valores, actividades o etapas no reflejan la realidad.'
        : null,
  },
  {
    id: 'grado_bajo_ignorado',
    severidad: 'media',
    lente: 'ambas',
    evaluar: (ctx) => {
      const ignoradas = ctx.exp.influencias.filter((i) => i.grado === 'B' && !i.contactada);
      return ignoradas.length > 0 ? `Influencias de grado bajo sin contactar: ${nombres(ignoradas)}.` : null;
    },
  },
  {
    id: 'fecha_optimista',
    severidad: 'media',
    lente: 'gerente',
    evaluar: (ctx) =>
      ctx.fechaOptimista ? 'La fecha de cierre del CRM es optimista para el ciclo normal de esta venta.' : null,
  },
];
