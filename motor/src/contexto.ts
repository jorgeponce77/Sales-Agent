import { estaAtorada, nivelEmbudo } from './embudo.js';
import { compararEtapa, etapaRecomendada } from './etapa.js';
import { esFechaOptimista, evaluarFechaCierre } from './fechaCierre.js';
import { lenteActiva } from './lente.js';
import { clasificarTipo } from './oportunidad.js';
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
  comparacion: { resultado: 'al_dia' | 'inflada' | 'rezagada'; diferencia: number };
  /** Solo con lente director; con lente gerente es null. */
  fecha: ResultadoFecha | null;
  /** Solo se calcula con lente gerente; con lente director es false. */
  fechaOptimista: boolean;
  embudo: NivelEmbudo;
  atorada: boolean;
  economicos: Influencia[];
  coaches: Influencia[];
}

export function construirContexto(exp: Expediente, hoy: string, config: Config): Contexto {
  const lente = lenteActiva(exp, hoy);
  const etapaRec = etapaRecomendada(exp, config);
  return {
    exp,
    hoy,
    config,
    lente,
    tipo: clasificarTipo(exp),
    etapaRec,
    comparacion: compararEtapa(exp.etapaCRM, etapaRec),
    fecha: lente === 'director' ? evaluarFechaCierre(exp, hoy, config) : null,
    fechaOptimista: lente === 'gerente' ? esFechaOptimista(exp, hoy, config) : false,
    embudo: nivelEmbudo(exp, hoy, config),
    atorada: estaAtorada(exp, hoy, config),
    economicos: exp.influencias.filter((i) => i.roles.includes('E')),
    coaches: exp.influencias.filter((i) => i.roles.includes('C')),
  };
}
