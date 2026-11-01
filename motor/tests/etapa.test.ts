import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { compararEtapa, entregableCierre, etapaRecomendada } from '../src/etapa.js';
import type { CriterioCumplido, Nivel } from '../src/tipos.js';
import { expedienteBase } from './fabrica.js';

/** Criterios de Argano con `nivel` para las etapas 0..hasta (incluye los de RFP). */
function criteriosHasta(hasta: number, nivel: Nivel = 'confirmado', excepto: string[] = []): CriterioCumplido[] {
  return CONFIG_DEFAULT.criteriosArgano
    .filter((c) => c.etapaDesde <= hasta && !excepto.includes(c.clave))
    .map((c) => ({ clave: c.clave, nivel }));
}

describe('etapaRecomendada', () => {
  it('etapa_sin_criterios_es_0', () => {
    expect(etapaRecomendada(expedienteBase(), CONFIG_DEFAULT)).toBe(0);
  });

  it('etapa_2_con_criterios_0_y_1_confirmados', () => {
    const exp = expedienteBase({ criteriosArgano: criteriosHasta(1, 'confirmado', ['rfp_analizado']) });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(2);
  });

  it('criterio_supuesto_no_cuenta', () => {
    const criterios = criteriosHasta(0).map((c, i) => (i === 0 ? { ...c, nivel: 'supuesto' as Nivel } : c));
    const exp = expedienteBase({ criteriosArgano: criterios });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(0);
  });

  it('rfp_analizado_solo_si_es_rfp', () => {
    const criterios = criteriosHasta(1, 'confirmado', ['rfp_analizado']);
    expect(etapaRecomendada(expedienteBase({ criteriosArgano: criterios, esRFP: false }), CONFIG_DEFAULT)).toBe(2);
    expect(etapaRecomendada(expedienteBase({ criteriosArgano: criterios, esRFP: true }), CONFIG_DEFAULT)).toBe(1);
  });

  it('sin_proveedor_elegido_tope_en_3', () => {
    const exp = expedienteBase({
      criteriosArgano: criteriosHasta(3),
      cadena: { pasos: { aElegido: false } },
    });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(3);
  });

  it('con_proveedor_elegido_y_etapa_3_confirmada_llega_a_4', () => {
    const exp = expedienteBase({
      criteriosArgano: criteriosHasta(3),
      cadena: { pasos: { aElegido: true } },
    });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(4);
  });

  it('etapa_5_exige_entregable', () => {
    const todo = criteriosHasta(4, 'confirmado', ['rfp_analizado', 'rfp_respuesta']);
    const sinEntregable = expedienteBase({ criteriosArgano: todo, cadena: { pasos: { aElegido: true } } });
    expect(etapaRecomendada(sinEntregable, CONFIG_DEFAULT)).toBe(4);

    const ocConSow = expedienteBase({
      criteriosArgano: todo,
      cadena: { requiereSOW: true, pasos: { aElegido: true, hOC: true } },
    });
    expect(etapaRecomendada(ocConSow, CONFIG_DEFAULT)).toBe(4);

    const firmado = expedienteBase({
      criteriosArgano: todo,
      cadena: { pasos: { aElegido: true, eFirmado: true } },
    });
    expect(etapaRecomendada(firmado, CONFIG_DEFAULT)).toBe(5);
  });
});

describe('entregableCierre', () => {
  const caso = (requiereSOW: boolean | null, pasos: { eFirmado?: boolean; hOC?: boolean }) =>
    entregableCierre(expedienteBase({ cadena: { requiereSOW, pasos } }));

  it('sin firma ni OC no hay entregable', () => {
    expect(caso(null, {})).toBe(false);
  });
  it('OC sin SOW requerido basta', () => {
    expect(caso(false, { hOC: true })).toBe(true);
    expect(caso(null, { hOC: true })).toBe(true);
  });
  it('OC con SOW requerido no basta sin firma', () => {
    expect(caso(true, { hOC: true })).toBe(false);
  });
  it('firmado basta, con o sin SOW requerido', () => {
    expect(caso(true, { eFirmado: true })).toBe(true);
    expect(caso(null, { eFirmado: true })).toBe(true);
  });
});

describe('compararEtapa', () => {
  it('inflada: CRM por encima de la recomendada', () => {
    expect(compararEtapa(4, 2)).toEqual({ resultado: 'inflada', diferencia: 2 });
  });
  it('rezagada: CRM por debajo de la recomendada', () => {
    expect(compararEtapa(1, 3)).toEqual({ resultado: 'rezagada', diferencia: -2 });
  });
  it('al_dia: iguales', () => {
    expect(compararEtapa(3, 3)).toEqual({ resultado: 'al_dia', diferencia: 0 });
  });
});
