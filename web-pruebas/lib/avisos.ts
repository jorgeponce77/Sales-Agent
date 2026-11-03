import type { Oportunidad } from 'agente-sales-agent';

/** Aviso cuando el monto no se pudo convertir a USD (moneda sin tipo de cambio); null si no aplica. */
export function avisoTipoCambio(op: Oportunidad | null): string | null {
  if (op === null || op.expediente.montoUSD !== null) return null;
  return `Sin tipo de cambio para ${op.ficha.moneda}: el monto no cuenta para escalar a análisis completo.`;
}
