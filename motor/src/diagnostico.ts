import { motivosAnalisisCompleto } from './analisisCompleto.js';
import { CONFIG_DEFAULT } from './config.js';
import { construirContexto } from './contexto.js';
import { entregableCierre } from './etapa.js';
import { huecosPriorizados } from './huecos.js';
import { calcularIndice } from './indice.js';
import { probabilidad } from './oportunidad.js';
import { evaluarBanderas, evaluarFortalezas } from './reglas/index.js';
import type { Config, Diagnostico, Expediente } from './tipos.js';

/**
 * Diagnóstico completo de una oportunidad a la fecha `hoy`. Una oportunidad cerrada
 * (etapa 5 con entregable de cierre) no lleva banderas, huecos ni análisis completo,
 * y su índice se calcula sin banderas para que no quede topado.
 */
export function calcularDiagnostico(exp: Expediente, hoy: string, config: Config = CONFIG_DEFAULT): Diagnostico {
  const ctx = construirContexto(exp, hoy, config);
  const cerrada = exp.etapaCRM === 5 && entregableCierre(exp);
  const banderasActivas = evaluarBanderas(ctx);
  const banderas = cerrada ? [] : banderasActivas;

  return {
    cerrada,
    lente: ctx.lente,
    tipo: ctx.tipo,
    etapaCRM: exp.etapaCRM,
    etapaRecomendada: ctx.etapaRec,
    comparacionEtapa: ctx.comparacion.resultado,
    probabilidadDeclarada: probabilidad(exp.etapaCRM, ctx.tipo, config),
    probabilidadAjustada: probabilidad(ctx.etapaRec, ctx.tipo, config),
    fecha: ctx.fecha,
    fechaOptimista: ctx.fechaOptimista,
    embudo: ctx.embudo,
    atorada: ctx.atorada,
    banderas,
    fortalezas: evaluarFortalezas(ctx),
    indice: calcularIndice(ctx, banderas),
    huecos: cerrada ? [] : huecosPriorizados(ctx, banderas),
    analisisCompleto: cerrada ? [] : motivosAnalisisCompleto(ctx, banderas),
  };
}
