import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { esFechaOptimista, evaluarFechaCierre } from '../src/fechaCierre.js';
import { expedienteBase } from './fabrica.js';

const HOY = '2026-11-02';
const ACELERADOR = 'Inicia en paralelo el alta de proveedor y la OC desde hoy';

describe('evaluarFechaCierre', () => {
  it('fecha_contrato_ejemplo_george', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: { ruta: 'contrato', pasos: { aElegido: true, bContratoEnviado: true } },
    });
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT)).toEqual({
      veredicto: 'no_cierra_fecha',
      diasPendientes: 15,
      fechaCreible: '2026-11-24',
      rutaUsada: 'contrato',
      acelerador: ACELERADOR,
    });
  });

  it('sin_acelerador_si_altas_y_oc_listas', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: {
        ruta: 'contrato',
        pasos: { aElegido: true, bContratoEnviado: true, fAltaProveedor: true, hOC: true },
      },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.acelerador).toBeNull();
    expect(r.diasPendientes).toBe(15);
    expect(r.fechaCreible).toBe('2026-11-24');
  });

  it('ruta_oc_6_dias', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: { ruta: 'oc', pasos: { aElegido: true } },
    });
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT)).toEqual({
      veredicto: 'creible',
      diasPendientes: 6,
      fechaCreible: '2026-11-10',
      rutaUsada: 'oc',
      acelerador: null,
    });
  });

  it('oc_con_sow_requerido_usa_contrato', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: { ruta: 'oc', requiereSOW: true, pasos: { aElegido: true } },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.rutaUsada).toBe('contrato');
    expect(r.diasPendientes).toBe(20);
  });

  it('en_riesgo_por_holgura', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-13',
      cadena: { ruta: 'oc', pasos: { aElegido: true } },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.fechaCreible).toBe('2026-11-10');
    expect(r.veredicto).toBe('en_riesgo');
  });

  it('sin_eleccion_no_cierra_periodo', () => {
    const exp = expedienteBase({ fechaCierreCRM: '2026-11-20', cadena: { ruta: 'contrato' } });
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT)).toEqual({
      veredicto: 'no_cierra_periodo',
      fechaCreible: null,
      diasPendientes: null,
      rutaUsada: null,
      acelerador: null,
    });
  });

  it('fecha_crm_pasada', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-10-15',
      cadena: { ruta: 'oc', pasos: { aElegido: true } },
    });
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT).veredicto).toBe('no_cierra_fecha');
  });

  it('fecha_crm_nula_no_cierra_fecha', () => {
    const exp = expedienteBase({ cadena: { ruta: 'oc', pasos: { aElegido: true } } });
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT).veredicto).toBe('no_cierra_fecha');
  });

  it('fecha_crm_en_sabado', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-21',
      cadena: { ruta: 'oc', pasos: { aElegido: true } },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.fechaCreible).toBe('2026-11-10');
    expect(r.veredicto).toBe('creible');
  });

  it('ambas_independientes_sin_sow_usa_la_menor', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: { ruta: 'ambas_independientes', requiereSOW: false, pasos: { aElegido: true } },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.rutaUsada).toBe('oc');
    expect(r.diasPendientes).toBe(6);
  });

  it('ambas_independientes_empate_usa_contrato', () => {
    // Todo hecho: contrato 0 días y OC 0 días -> empate, gana contrato.
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-20',
      cadena: {
        ruta: 'ambas_independientes',
        pasos: {
          aElegido: true, bContratoEnviado: true, cComentariosRecibidos: true,
          dEnFirma: true, eFirmado: true, fAltaProveedor: true, hOC: true,
        },
      },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.rutaUsada).toBe('contrato');
    expect(r.diasPendientes).toBe(0);
    expect(r.fechaCreible).toBe(HOY);
  });

  it('ambas_oc_tras_contrato_usa_contrato', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-11-30',
      cadena: { ruta: 'ambas_oc_tras_contrato', pasos: { aElegido: true } },
    });
    const r = evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT);
    expect(r.rutaUsada).toBe('contrato');
    expect(r.diasPendientes).toBe(20);
  });

  it('usa_los_festivos_del_pais_de_la_cuenta', () => {
    const exp = expedienteBase({
      cuenta: { pais: 'ZZ' },
      fechaCierreCRM: '2026-11-30',
      cadena: { ruta: 'contrato', pasos: { aElegido: true, bContratoEnviado: true } },
    });
    // Sin festivos: 15 días hábiles desde el lunes 2-nov terminan el 23-nov.
    expect(evaluarFechaCierre(exp, HOY, CONFIG_DEFAULT).fechaCreible).toBe('2026-11-23');
  });
});

describe('esFechaOptimista', () => {
  const base = { cadena: { ruta: 'contrato' as const } };

  it('fecha_optimista', () => {
    expect(esFechaOptimista(expedienteBase({ ...base, fechaCierreCRM: '2027-01-15' }), HOY, CONFIG_DEFAULT)).toBe(true);
    expect(esFechaOptimista(expedienteBase({ ...base, fechaCierreCRM: '2027-04-15' }), HOY, CONFIG_DEFAULT)).toBe(false);
  });

  it('sin_fecha_crm_no_es_optimista', () => {
    expect(esFechaOptimista(expedienteBase(), HOY, CONFIG_DEFAULT)).toBe(false);
  });

  it('etapa_1_usa_50_por_ciento', () => {
    expect(esFechaOptimista(expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-03-01' }), HOY, CONFIG_DEFAULT)).toBe(true);
    expect(esFechaOptimista(expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-03-02' }), HOY, CONFIG_DEFAULT)).toBe(false);
  });

  it('etapa_2_usa_25_por_ciento', () => {
    // WMS: 8 x 30 x 0.25 = 60 días -> hoy + 60 = 2027-01-01
    expect(esFechaOptimista(expedienteBase({ etapaCRM: 2, fechaCierreCRM: '2026-12-31' }), HOY, CONFIG_DEFAULT)).toBe(true);
    expect(esFechaOptimista(expedienteBase({ etapaCRM: 2, fechaCierreCRM: '2027-01-01' }), HOY, CONFIG_DEFAULT)).toBe(false);
  });

  it('etapas_3_o_mas_nunca_optimista', () => {
    expect(esFechaOptimista(expedienteBase({ etapaCRM: 3, fechaCierreCRM: '2026-11-05' }), HOY, CONFIG_DEFAULT)).toBe(false);
  });
});
