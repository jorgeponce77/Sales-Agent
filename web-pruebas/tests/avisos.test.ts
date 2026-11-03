import { describe, expect, it } from 'vitest';
import { avisoTipoCambio } from '../lib/avisos';
import { oportunidadBase } from './fabrica';

describe('avisoTipoCambio (Importante 2)', () => {
  it('sin tipo de cambio para la moneda: aviso con la moneda', () => {
    const op = oportunidadBase({ moneda: 'MXN' });
    expect(op.expediente.montoUSD).toBeNull();
    expect(avisoTipoCambio(op)).toBe('Sin tipo de cambio para MXN: el monto no cuenta para escalar a análisis completo.');
  });

  it('con monto en USD o sin oportunidad: sin aviso', () => {
    expect(avisoTipoCambio(oportunidadBase())).toBeNull();
    expect(avisoTipoCambio(null)).toBeNull();
  });
});
