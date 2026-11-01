import type { Contexto } from '../contexto.js';
import type { Bandera, Fortaleza, Lente, Severidad } from '../tipos.js';
import { REGLAS_ALTAS } from './altas.js';
import { REGLAS_CRITICAS } from './criticas.js';
import { REGLAS_FORTALEZAS } from './fortalezas.js';
import { REGLAS_MEDIAS } from './medias.js';
import { aplicaLente, type Regla } from './tipos.js';

export { REGLAS_CRITICAS, REGLAS_ALTAS, REGLAS_MEDIAS, REGLAS_FORTALEZAS };
export type { ReglaFortaleza } from './fortalezas.js';

/** Catálogo completo, ya ordenado por severidad: críticas, altas y medias. */
export const CATALOGO_BANDERAS: Regla[] = [...REGLAS_CRITICAS, ...REGLAS_ALTAS, ...REGLAS_MEDIAS];

/** Catálogo público de solo lectura: id, severidad y lente de cada bandera (sin la lógica de evaluación). */
export const CATALOGO_REGLAS: ReadonlyArray<{ readonly id: string; readonly severidad: Severidad; readonly lente: Lente | 'ambas' }> =
  Object.freeze(CATALOGO_BANDERAS.map((r) => Object.freeze({ id: r.id, severidad: r.severidad, lente: r.lente })));

/** Ids de las fortalezas del catálogo, en el orden en que se evalúan. */
export const CATALOGO_FORTALEZAS_IDS: readonly string[] = Object.freeze(REGLAS_FORTALEZAS.map((r) => r.id));

/** Banderas activas para la lente del contexto, en el orden del catálogo. */
export function evaluarBanderas(ctx: Contexto): Bandera[] {
  const banderas: Bandera[] = [];
  for (const regla of CATALOGO_BANDERAS) {
    if (!aplicaLente(regla, ctx.lente)) continue;
    const texto = regla.evaluar(ctx);
    if (texto !== null) banderas.push({ id: regla.id, severidad: regla.severidad, texto });
  }
  return banderas;
}

/** Fortalezas que se cumplen, en el orden del catálogo. */
export function evaluarFortalezas(ctx: Contexto): Fortaleza[] {
  const fortalezas: Fortaleza[] = [];
  for (const regla of REGLAS_FORTALEZAS) {
    const texto = regla.evaluar(ctx);
    if (texto !== null) fortalezas.push({ id: regla.id, texto });
  }
  return fortalezas;
}
