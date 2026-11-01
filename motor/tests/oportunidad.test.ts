import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { cicloMeses, clasificarTipo, probabilidad } from '../src/oportunidad.js';
import { expedienteBase } from './fabrica.js';

describe('clasificarTipo', () => {
  it('cuenta nueva sin relación con Netlogistik ni Argano → NN', () => {
    expect(clasificarTipo(expedienteBase())).toBe('NN');
  });

  it('cliente de otra tower de Argano → ENxT', () => {
    const exp = expedienteBase({ cuenta: { esClienteOtraTowerArgano: true } });
    expect(clasificarTipo(exp)).toBe('ENxT');
  });

  it('cliente de Netlogistik → EN', () => {
    const exp = expedienteBase({ cuenta: { esClienteNetlogistik: true } });
    expect(clasificarTipo(exp)).toBe('EN');
  });

  it('cliente de Netlogistik y de otra tower → EN (Netlogistik gana)', () => {
    const exp = expedienteBase({ cuenta: { esClienteNetlogistik: true, esClienteOtraTowerArgano: true } });
    expect(clasificarTipo(exp)).toBe('EN');
  });

  it('change order → EE, aunque sea cliente de Netlogistik', () => {
    const exp = expedienteBase({ esChangeOrder: true, cuenta: { esClienteNetlogistik: true } });
    expect(clasificarTipo(exp)).toBe('EE');
  });
});

describe('probabilidad', () => {
  it('lee la tabla de config por tipo y etapa', () => {
    expect(probabilidad(2, 'NN', CONFIG_DEFAULT)).toBe(20);
    expect(probabilidad(4, 'ENxT', CONFIG_DEFAULT)).toBe(90);
    expect(probabilidad(0, 'EE', CONFIG_DEFAULT)).toBe(15);
  });

  it('respeta una config modificada', () => {
    const cfg = structuredClone(CONFIG_DEFAULT);
    cfg.probabilidades.EN[1] = 99;
    expect(probabilidad(1, 'EN', cfg)).toBe(99);
  });
});

describe('cicloMeses', () => {
  it('una línea usa su ciclo', () => {
    expect(cicloMeses(expedienteBase({ lineas: ['VOICE'] }), CONFIG_DEFAULT)).toBe(9);
  });

  it('varias líneas usan el más largo', () => {
    expect(cicloMeses(expedienteBase({ lineas: ['WMS', 'TMS'] }), CONFIG_DEFAULT)).toBe(10);
    expect(cicloMeses(expedienteBase({ lineas: ['PLANEACION_DEMANDA', 'WMS'] }), CONFIG_DEFAULT)).toBe(8);
  });

  it('sin líneas usa WMS', () => {
    expect(cicloMeses(expedienteBase({ lineas: [] }), CONFIG_DEFAULT)).toBe(8);
  });
});
