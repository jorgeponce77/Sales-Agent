import { diasNaturalesEntre, sumarDiasNaturales } from './fechas.js';
import { cicloMeses } from './oportunidad.js';
import type { Config, Expediente, NivelEmbudo } from './tipos.js';

/** Atorada: lleva más días naturales desde su creación que el ciclo normal de la(s) línea(s). */
export function estaAtorada(exp: Expediente, hoy: string, config: Config): boolean {
  return diasNaturalesEntre(exp.fechaCreacion, hoy) > cicloMeses(exp, config) * 30;
}

/** Nivel del embudo; se evalúa de arriba hacia abajo y gana la primera regla que se cumple. */
export function nivelEmbudo(exp: Expediente, hoy: string, config: Config): NivelEmbudo {
  const { influencias } = exp;

  const hayEconomicoContactado = influencias.some((i) => i.roles.includes('E') && i.contactada);
  const todasContactadas = influencias.length > 0 && influencias.every((i) => i.contactada);
  const altasYMediasConTR = influencias
    .filter((i) => i.grado === 'A' || i.grado === 'M')
    .every((i) => i.trDeclaracion !== null);
  const medioCiclo = Math.round((cicloMeses(exp, config) * 30) / 2);
  const cierreCercano =
    exp.fechaCierreCRM !== null && exp.fechaCierreCRM <= sumarDiasNaturales(hoy, medioCiclo);

  if (hayEconomicoContactado && todasContactadas && altasYMediasConTR && exp.cadena.pasos.aElegido && cierreCercano) {
    return 'pocos_selectos';
  }
  if (influencias.some((i) => i.contactada && (i.modo === 'C' || i.modo === 'P'))) return 'en_embudo';
  if (exp.bant.need.nivel !== 'ausente') return 'arriba';
  return 'universo';
}
