import type { Config, Etapa, Expediente, TipoOportunidad } from './tipos.js';

/** Change order → EE; si no, cliente Netlogistik → EN; si no, cliente de otra tower → ENxT; si no, NN. */
export function clasificarTipo(exp: Expediente): TipoOportunidad {
  if (exp.esChangeOrder) return 'EE';
  if (exp.cuenta.esClienteNetlogistik) return 'EN';
  if (exp.cuenta.esClienteOtraTowerArgano) return 'ENxT';
  return 'NN';
}

/** Probabilidad de Argano (0..100) según tipo y etapa. */
export function probabilidad(etapa: Etapa, tipo: TipoOportunidad, config: Config): number {
  return config.probabilidades[tipo][etapa];
}

/** Ciclo normal en meses: el más largo entre las líneas; sin líneas, el de WMS. */
export function cicloMeses(exp: Expediente, config: Config): number {
  if (exp.lineas.length === 0) return config.ciclosMeses.WMS;
  return Math.max(...exp.lineas.map((l) => config.ciclosMeses[l]));
}
