import { describe, expect, it } from 'vitest';
import { validarExpediente } from 'motor-sales-agent';
import { convertirAUSD, crearOportunidad, fichaAExpediente, validarFicha } from '../src/ficha.js';
import { TIPOS_CAMBIO_DEFAULT } from '../src/tipos.js';
import { fichaBase } from './fabrica.js';

describe('ficha', () => {
  it('ficha_valida_sin_errores', () => {
    expect(validarFicha(fichaBase())).toEqual([]);
  });

  it('ficha_rechaza_campos', () => {
    const casos: [string, Record<string, unknown>][] = [
      ['pais', { pais: 'Mexico' }],
      ['lineas', { lineas: [] }],
      ['etapaCRM', { etapaCRM: 9 }],
      ['fechaCierreCRM', { fechaCierreCRM: '31/03/2027' }],
      ['moneda', { moneda: 'usd' }],
    ];
    for (const [campo, over] of casos) {
      const errores = validarFicha(fichaBase(over as never));
      expect(errores, campo).toHaveLength(1);
      expect(errores[0], campo).toContain(campo);
    }
    const todos = validarFicha(
      fichaBase({ pais: 'Mexico', lineas: [], etapaCRM: 9, fechaCierreCRM: '31/03/2027', moneda: 'usd' }),
    );
    expect(todos).toHaveLength(5);
  });

  it('convertir_sin_tipo_de_cambio', () => {
    expect(convertirAUSD(100, 'MXN', { USD: 1 })).toBeNull();
    expect(convertirAUSD(100, 'MXN', { USD: 1, MXN: 0.05 })).toBe(5);
  });

  it('tipo_a_banderas', () => {
    const ee = fichaAExpediente(fichaBase({ tipo: 'EE' }), TIPOS_CAMBIO_DEFAULT);
    expect(ee.esChangeOrder).toBe(true);
    expect(ee.cuenta.esClienteNetlogistik).toBe(true);
    expect(ee.cuenta.esClienteOtraTowerArgano).toBe(false);

    const en = fichaAExpediente(fichaBase({ tipo: 'EN' }), TIPOS_CAMBIO_DEFAULT);
    expect(en.esChangeOrder).toBe(false);
    expect(en.cuenta.esClienteNetlogistik).toBe(true);
    expect(en.cuenta.esClienteOtraTowerArgano).toBe(false);

    const enxt = fichaAExpediente(fichaBase({ tipo: 'ENxT' }), TIPOS_CAMBIO_DEFAULT);
    expect(enxt.esChangeOrder).toBe(false);
    expect(enxt.cuenta.esClienteNetlogistik).toBe(false);
    expect(enxt.cuenta.esClienteOtraTowerArgano).toBe(true);

    for (const tipo of [null, 'NN'] as const) {
      const e = fichaAExpediente(fichaBase({ tipo }), TIPOS_CAMBIO_DEFAULT);
      expect(e.esChangeOrder).toBe(false);
      expect(e.cuenta.esClienteNetlogistik).toBe(false);
      expect(e.cuenta.esClienteOtraTowerArgano).toBe(false);
    }
  });

  it('etapa_cerrada', () => {
    const o = crearOportunidad(fichaBase({ etapaCRM: 7 }));
    expect(o.cerrada).toBe(true);
    expect(o.expediente.etapaCRM).toBe(5);
    expect(o.id).toBe('OPP-0001');
    expect(o.sesiones).toEqual([]);
    expect(o.sesionActual).toBeNull();
  });

  it('expediente_resultante_valido', () => {
    expect(validarExpediente(fichaAExpediente(fichaBase(), TIPOS_CAMBIO_DEFAULT))).toEqual([]);
  });
});
