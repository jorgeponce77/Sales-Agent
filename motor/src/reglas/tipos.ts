import type { Contexto } from '../contexto.js';
import type { Lente, Severidad } from '../tipos.js';

/** Una bandera del catálogo: `evaluar` devuelve el texto si se activa, o null. */
export interface Regla {
  id: string;
  severidad: Severidad;
  lente: Lente | 'ambas';
  evaluar(ctx: Contexto): string | null;
}

/** La regla se evalúa solo si es para ambas lentes o coincide con la lente activa. */
export function aplicaLente(regla: Regla, lente: Lente): boolean {
  return regla.lente === 'ambas' || regla.lente === lente;
}
