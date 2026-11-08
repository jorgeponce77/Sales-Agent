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

describe('etapaRecomendada — presunción por etapa (George, 8-nov-2026)', () => {
  it('crm_3_sin_criterios_registrados_queda_al_dia', () => {
    expect(etapaRecomendada(expedienteBase({ etapaCRM: 3 }), CONFIG_DEFAULT)).toBe(3);
  });

  it('crm_3_con_criterio_de_etapa_1_ausente_baja_a_1', () => {
    const exp = expedienteBase({
      etapaCRM: 3,
      criteriosArgano: [{ clave: 'confirma_recibir_propuesta', nivel: 'ausente' }],
    });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(1);
  });

  it('crm_4_sin_proveedor_elegido_baja_a_3', () => {
    const exp = expedienteBase({ etapaCRM: 4, cadena: { pasos: { aElegido: false } } });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(3);
  });

  it('crm_4_con_proveedor_elegido_queda_al_dia', () => {
    const exp = expedienteBase({ etapaCRM: 4, cadena: { pasos: { aElegido: true } } });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(4);
  });

  it('criterio_supuesto_de_etapa_anterior_cuenta_como_presumido', () => {
    const exp = expedienteBase({
      etapaCRM: 2,
      criteriosArgano: [{ clave: 'business_case_identificado', nivel: 'supuesto' }],
    });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(2);
  });

  it('etapa_actual_y_siguientes_siguen_exigiendo_confirmado', () => {
    // CRM 2: los de la etapa 2 en supuesto no permiten recomendar 3.
    const supuestos = criteriosHasta(2, 'supuesto', ['rfp_analizado', 'rfp_respuesta']).filter(
      (c) => CONFIG_DEFAULT.criteriosArgano.find((k) => k.clave === c.clave)?.etapaDesde === 2,
    );
    expect(etapaRecomendada(expedienteBase({ etapaCRM: 2, criteriosArgano: supuestos }), CONFIG_DEFAULT)).toBe(2);
    // Confirmados, sí: el CRM queda rezagado.
    const confirmados = supuestos.map((c) => ({ ...c, nivel: 'confirmado' as Nivel }));
    expect(etapaRecomendada(expedienteBase({ etapaCRM: 2, criteriosArgano: confirmados }), CONFIG_DEFAULT)).toBe(3);
  });

  it('criterio_soloRFP_ausente_no_cuenta_si_no_es_rfp', () => {
    const exp = expedienteBase({
      etapaCRM: 3,
      esRFP: false,
      criteriosArgano: [{ clave: 'rfp_analizado', nivel: 'ausente' }],
    });
    expect(etapaRecomendada(exp, CONFIG_DEFAULT)).toBe(3);
  });

  it('crm_5_sin_entregable_de_cierre_baja_a_4', () => {
    const sinEntregable = expedienteBase({ etapaCRM: 5, cadena: { pasos: { aElegido: true } } });
    expect(etapaRecomendada(sinEntregable, CONFIG_DEFAULT)).toBe(4);
    const firmado = expedienteBase({ etapaCRM: 5, cadena: { pasos: { aElegido: true, eFirmado: true } } });
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
