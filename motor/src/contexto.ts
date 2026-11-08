import { estaAtorada, nivelEmbudo } from './embudo.js';
import { compararEtapa, detalleEtapa } from './etapa.js';
import type { LimiteEtapa } from './etapa.js';
import { esFechaOptimista, evaluarFechaCierre } from './fechaCierre.js';
import { lenteActiva } from './lente.js';
import { clasificarTipo } from './oportunidad.js';
import { fechaValida } from './validar.js';
import type {
  Config, Etapa, Expediente, Influencia, Lente, NivelEmbudo, ResultadoFecha, TipoOportunidad,
} from './tipos.js';

/** Datos derivados una sola vez y compartidos por todos los módulos de reglas. */
export interface Contexto {
  exp: Expediente;
  hoy: string;
  config: Config;
  lente: Lente;
  tipo: TipoOportunidad;
  etapaRec: Etapa;
  /** Qué limitó la etapa recomendada: criterios, proveedor elegido (paso a) o entregable de cierre. */
  limiteEtapa: LimiteEtapa;
  comparacion: { resultado: 'al_dia' | 'inflada' | 'rezagada'; diferencia: number };
  /** Solo con lente director; con lente gerente es null. */
  fecha: ResultadoFecha | null;
  /** Solo se calcula con lente gerente; con lente director es false. */
  fechaOptimista: boolean;
  embudo: NivelEmbudo;
  atorada: boolean;
  economicos: Influencia[];
}

/**
 * Las fechas del expediente que no son fechas reales se tratan como ausentes (null).
 * Devuelve el mismo expediente si no hay nada que corregir; si no, una copia superficial.
 */
function sanearFechas(exp: Expediente): Expediente {
  const cierreMala = exp.fechaCierreCRM !== null && !fechaValida(exp.fechaCierreCRM);
  const creacionMala = !fechaValida(exp.fechaCreacion);
  if (!cierreMala && !creacionMala) return exp;
  return {
    ...exp,
    fechaCierreCRM: cierreMala ? null : exp.fechaCierreCRM,
    // El tipo exige string, pero una fecha de creación inutilizable se trata como ausente (null).
    fechaCreacion: creacionMala ? (null as unknown as string) : exp.fechaCreacion,
  };
}

export function construirContexto(original: Expediente, hoy: string, config: Config): Contexto {
  const exp = sanearFechas(original);
  const lente = lenteActiva(exp, hoy);
  const { etapa: etapaRec, limite: limiteEtapa } = detalleEtapa(exp, config);
  return {
    exp,
    hoy,
    config,
    lente,
    tipo: clasificarTipo(exp),
    etapaRec,
    limiteEtapa,
    comparacion: compararEtapa(exp.etapaCRM, etapaRec),
    fecha: lente === 'director' ? evaluarFechaCierre(exp, hoy, config) : null,
    fechaOptimista: lente === 'gerente' ? esFechaOptimista(exp, hoy, config) : false,
    embudo: nivelEmbudo(exp, hoy, config),
    atorada: estaAtorada(exp, hoy, config),
    economicos: exp.influencias.filter((i) => i.roles.includes('E')),
  };
}
