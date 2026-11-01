import type { Contexto } from './contexto.js';
import { CATALOGO_BANDERAS } from './reglas/index.js';
import type { Bandera, Hueco, Severidad } from './tipos.js';

/** Banderas que no son falta de dato: reflejan una conclusión del motor, no información por recabar. */
const IDS_NO_SON_FALTA_DE_DATO: ReadonlySet<string> = new Set([
  'etapa_inflada_grave', 'etapa_inflada', 'atorada', 'no_cierra_fecha',
  'euforia_con_banderas', 'cierre_despues_ce', 'fecha_optimista',
]);

const ORDEN_SEVERIDAD: Record<Severidad, number> = { critica: 0, alta: 1, media: 2 };

/**
 * Huecos de información: una entrada por bandera activa que se debe a un dato faltante,
 * por severidad y, dentro de cada una, primero las reglas de la lente activa y luego las de ambas lentes.
 */
export function huecosPriorizados(ctx: Contexto, banderas: Bandera[]): Hueco[] {
  const lenteDe = new Map(CATALOGO_BANDERAS.map((r) => [r.id, r.lente]));
  const rango = (b: Bandera): number => ORDEN_SEVERIDAD[b.severidad] * 2 + (lenteDe.get(b.id) === ctx.lente ? 0 : 1);
  return banderas
    .filter((b) => !IDS_NO_SON_FALTA_DE_DATO.has(b.id))
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rango(x.b) - rango(y.b) || x.i - y.i)
    .map(({ b }) => ({ reglaId: b.id, severidad: b.severidad, motivo: b.texto }));
}
