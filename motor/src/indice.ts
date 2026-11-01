import { posicionGeneral } from './competencia.js';
import type { Contexto } from './contexto.js';
import { esCoachValido, tieneTR } from './reglas/helpers.js';
import type { Bandera, Config, Evidencia, Grado, Nivel, Posicion, ResultadoIndice } from './tipos.js';

/** Puntos máximos de cada componente antes de escalar por `config.pesos` (spec §7.7). */
const PESO_BASE: Config['pesos'] = {
  influencias: 20, bant: 20, compellingEvent: 20, triunfoResultados: 10,
  competencia: 10, clienteIdeal: 10, coherencia: 10,
};

const PUNTOS_BANT: Record<Nivel, number> = { confirmado: 5, supuesto: 2, ausente: 0 };
const FACTOR_CE: Record<Nivel, number> = { confirmado: 1, supuesto: 0.5, ausente: 0 };
const PESO_GRADO: Record<Grado, number> = { A: 2, M: 1, B: 0.5 };
const PUNTOS_POSICION: Record<Posicion, number> = { dominante: 5, nula: 5, compartida: 3, alternativa: 1 };
const PUNTOS_CONTRIBUCION: Record<Nivel, number> = { confirmado: 2, supuesto: 1, ausente: 0 };

function puntosInfluencias(ctx: Contexto, banderas: Bandera[]): number {
  const { influencias } = ctx.exp;
  const contactadas = influencias.filter((i) => i.contactada).length;
  let puntos = 0;
  if (ctx.economicos.length > 0) puntos += 5;
  if (ctx.economicos.some((e) => e.contactada)) puntos += 4;
  if (influencias.some(esCoachValido)) puntos += 4;
  if (influencias.some((i) => i.roles.includes('U')) && influencias.some((i) => i.roles.includes('T'))) puntos += 3;
  if (influencias.length > 0) puntos += (contactadas / influencias.length) * 2;
  if (!banderas.some((b) => b.id === 'modo_calificacion_inconsistente')) puntos += 2;
  return puntos;
}

function puntosBant(ctx: Contexto): number {
  const { budget, authority, need, time } = ctx.exp.bant;
  return [budget, authority, need, time].reduce((suma, e) => suma + (PUNTOS_BANT[e.nivel] ?? 0), 0);
}

function puntosCompellingEvent(ctx: Contexto): number {
  const { fecha, dueno, costoInaccion, urgenciaFalsa } = ctx.exp.compellingEvent;
  if (urgenciaFalsa) return 0;
  const parte = (e: Evidencia<string>, puntos: number): number => puntos * (FACTOR_CE[e.nivel] ?? 0);
  return parte(fecha, 7) + parte(dueno, 7) + parte(costoInaccion, 6);
}

function puntosTriunfoResultados(ctx: Contexto): number {
  const peso = (grado: Grado | null): number => (grado === null ? 1 : (PESO_GRADO[grado] ?? 0));
  const { influencias } = ctx.exp;
  const total = influencias.reduce((suma, i) => suma + peso(i.grado), 0);
  if (total === 0) return 0;
  const conTR = influencias.filter(tieneTR).reduce((suma, i) => suma + peso(i.grado), 0);
  return (conTR / total) * 10;
}

function puntosCompetencia(ctx: Contexto): number {
  const posicion = posicionGeneral(ctx.exp);
  return (
    (ctx.exp.preguntaCompetenciaHecha ? 3 : 0) +
    (posicion === null ? 0 : (PUNTOS_POSICION[posicion] ?? 0)) +
    (PUNTOS_CONTRIBUCION[ctx.exp.contribucionDiferenciadora.nivel] ?? 0)
  );
}

function puntosClienteIdeal(ctx: Contexto): number {
  const valores = ctx.exp.cuenta.clienteIdeal.map((e) => e.valor).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length + 5;
}

function puntosCoherencia(ctx: Contexto): number {
  const etapa = { al_dia: 5, rezagada: 4, inflada: 0 }[ctx.comparacion.resultado];
  let fecha: number;
  if (ctx.lente === 'director') {
    const veredicto = ctx.fecha?.veredicto;
    fecha = veredicto === 'creible' ? 5 : veredicto === 'en_riesgo' ? 2 : 0;
  } else {
    fecha = ctx.fechaOptimista ? 2 : 5;
  }
  return etapa + fecha;
}

/**
 * Índice de madurez 0–100 (spec §7.7). Cada componente se calcula sobre sus puntos
 * base y se escala por `config.pesos`; una bandera crítica topa el total y fuerza el rojo.
 */
export function calcularIndice(ctx: Contexto, banderas: Bandera[]): ResultadoIndice {
  const { config } = ctx;
  const crudo: Record<keyof Config['pesos'], number> = {
    influencias: puntosInfluencias(ctx, banderas),
    bant: puntosBant(ctx),
    compellingEvent: puntosCompellingEvent(ctx),
    triunfoResultados: puntosTriunfoResultados(ctx),
    competencia: puntosCompetencia(ctx),
    clienteIdeal: puntosClienteIdeal(ctx),
    coherencia: puntosCoherencia(ctx),
  };
  const claves = Object.keys(PESO_BASE) as (keyof Config['pesos'])[];
  const componentes = Object.fromEntries(
    claves.map((k) => [k, (crudo[k] * config.pesos[k]) / PESO_BASE[k]]),
  ) as Record<keyof Config['pesos'], number>;

  const suma = claves.reduce((acc, k) => acc + componentes[k], 0);
  const sinTope = Math.min(100, Math.max(0, Math.round(suma)));
  const hayCritica = banderas.some((b) => b.severidad === 'critica');
  const total = hayCritica ? Math.min(sinTope, config.topeConCritica) : sinTope;
  const topado = hayCritica && sinTope > config.topeConCritica;

  const semaforo =
    hayCritica || total < config.umbralRojo ? 'rojo' : total >= config.umbralVerde ? 'verde' : 'ambar';
  return { total, componentes, topado, semaforo };
}
