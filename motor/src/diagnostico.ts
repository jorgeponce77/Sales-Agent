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
 * (etapa 5 con entregable de cierre) ya no lleva señales de pronóstico: etapa recomendada 5,
 * al día, sin prueba de fecha, ni banderas, huecos o análisis completo (no se evalúan),
 * y su índice se calcula sin banderas para que no quede topado.
 */
export function calcularDiagnostico(exp: Expediente, hoy: string, config: Config = CONFIG_DEFAULT): Diagnostico {
  const ctx = construirContexto(exp, hoy, config);
  const cerrada = exp.etapaCRM === 5 && entregableCierre(exp);
  const banderas = cerrada ? [] : evaluarBanderas(ctx);
  const etapaRecomendada = cerrada ? 5 : ctx.etapaRec;

  return {
    cerrada,
    lente: ctx.lente,
    tipo: ctx.tipo,
    etapaCRM: exp.etapaCRM,
    etapaRecomendada,
    comparacionEtapa: cerrada ? 'al_dia' : ctx.comparacion.resultado,
    probabilidadDeclarada: probabilidad(exp.etapaCRM, ctx.tipo, config),
    probabilidadAjustada: probabilidad(etapaRecomendada, ctx.tipo, config),
    fecha: cerrada ? null : ctx.fecha,
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
