import { finDeTrimestre } from './fechas.js';
import type { Expediente, Lente } from './tipos.js';

/**
 * `director` si la etapa en CRM es ≥ 3 o si la fecha de cierre cae a más tardar
 * al final del trimestre en curso (`hoy`); si no, `gerente`.
 * Sin fecha de cierre solo aplica la regla de etapa.
 */
export function lenteActiva(exp: Expediente, hoy: string): Lente {
  if (exp.etapaCRM >= 3) return 'director';
  if (exp.fechaCierreCRM !== null && exp.fechaCierreCRM <= finDeTrimestre(hoy)) return 'director';
  return 'gerente';
}
