import { posicionGeneral } from './competencia.js';
import type { Contexto } from './contexto.js';
import type { Bandera } from './tipos.js';

/** Motivos por los que la oportunidad merece análisis completo, en el orden de la especificación. */
export function motivosAnalisisCompleto(ctx: Contexto, banderas: Bandera[]): string[] {
  const { exp, hoy, config } = ctx;
  const umbral = config.umbralMontoAltoUSD;
  const motivos: [string, boolean][] = [
    ['cuenta_heredada', exp.cambioDeDueno],
    ['monto_alto', umbral !== null && exp.montoUSD !== null && exp.montoUSD >= umbral],
    ['competencia_desconocida', !exp.preguntaCompetenciaHecha],
    ['competencia_fuerte', posicionGeneral(exp) === 'alternativa'],
    ['mercado_nuevo', exp.esMercadoNuevo],
    ['atorada', ctx.atorada],
    ['fecha_vencida', exp.fechaCierreCRM !== null && exp.fechaCierreCRM < hoy],
    ['revision_gerente', exp.revisionGerenteProxima],
    ['falta_info_esencial', banderas.some((b) => b.severidad === 'critica')],
  ];
  return motivos.filter(([, aplica]) => aplica).map(([id]) => id);
}
