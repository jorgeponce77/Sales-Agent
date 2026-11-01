import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { construirContexto } from '../src/contexto.js';
import { estaAtorada, nivelEmbudo } from '../src/embudo.js';
import { expedienteBase, influenciaBase } from './fabrica.js';

const HOY = '2026-11-02';

describe('estaAtorada', () => {
  it('atorada_si_supera_el_ciclo', () => {
    const exp = expedienteBase({ fechaCreacion: '2026-01-01' });
    expect(estaAtorada(exp, HOY, CONFIG_DEFAULT)).toBe(true);
  });

  it('no_atorada_dentro_del_ciclo', () => {
    const exp = expedienteBase({ fechaCreacion: '2026-06-01' });
    expect(estaAtorada(exp, HOY, CONFIG_DEFAULT)).toBe(false);
  });
});

describe('nivelEmbudo', () => {
  it('base_es_universo', () => {
    expect(nivelEmbudo(expedienteBase(), HOY, CONFIG_DEFAULT)).toBe('universo');
  });

  it('need_supuesto_es_arriba', () => {
    const exp = expedienteBase({ bant: { need: { valor: 'Reducir mermas', nivel: 'supuesto' } } });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('arriba');
  });

  it('influencia_contactada_en_P_es_en_embudo', () => {
    const exp = expedienteBase({
      bant: { need: { valor: 'Reducir mermas', nivel: 'supuesto' } },
      influencias: [influenciaBase({ roles: ['U'], modo: 'P', grado: 'B', trDeclaracion: null })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('influencia_contactada_en_modo_E_no_basta_para_en_embudo', () => {
    const exp = expedienteBase({
      influencias: [influenciaBase({ roles: ['U'], modo: 'E', grado: 'B', trDeclaracion: null })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('universo');
  });

  it('completo_con_cierre_dentro_de_medio_ciclo_es_pocos_selectos', () => {
    // WMS: 8 meses × 30 / 2 = 120 días → hoy + 120 = 2027-03-02
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase()],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('pocos_selectos');
  });

  it('completo_con_cierre_lejano_es_en_embudo', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-06-01',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase()],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('un_dia_despues_de_medio_ciclo_no_califica', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-03',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase()],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('sin_influencias_nunca_es_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2026-12-01',
      cadena: { pasos: { aElegido: true } },
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('universo');
  });

  it('sin_fecha_de_cierre_no_es_pocos_selectos', () => {
    const exp = expedienteBase({
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase()],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('sin_economico_contactado_no_es_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase({ roles: ['U'] })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('una_influencia_no_contactada_impide_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase(), influenciaBase({ personaId: 'p2', roles: ['U'], contactada: false })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('grado_A_o_M_sin_TR_impide_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase({ trDeclaracion: null })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('grado_B_sin_TR_no_impide_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase(), influenciaBase({ personaId: 'p2', roles: ['U'], grado: 'B', trDeclaracion: null })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('pocos_selectos');
  });

  it('TR_en_blanco_en_grado_A_impide_pocos_selectos (M1)', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase({ trDeclaracion: '   ' })],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });

  it('fecha_de_cierre_vencida_nunca_es_pocos_selectos (M2)', () => {
    const base = {
      cadena: { pasos: { aElegido: true } },
      influencias: [influenciaBase()],
    };
    expect(nivelEmbudo(expedienteBase({ ...base, fechaCierreCRM: '2026-10-01' }), HOY, CONFIG_DEFAULT)).toBe('en_embudo');
    expect(nivelEmbudo(expedienteBase({ ...base, fechaCierreCRM: '2026-11-01' }), HOY, CONFIG_DEFAULT)).toBe('en_embudo');
    // hoy mismo sí cuenta
    expect(nivelEmbudo(expedienteBase({ ...base, fechaCierreCRM: HOY }), HOY, CONFIG_DEFAULT)).toBe('pocos_selectos');
  });

  it('proveedor_no_elegido_impide_pocos_selectos', () => {
    const exp = expedienteBase({
      fechaCierreCRM: '2027-03-02',
      influencias: [influenciaBase()],
    });
    expect(nivelEmbudo(exp, HOY, CONFIG_DEFAULT)).toBe('en_embudo');
  });
});

describe('construirContexto', () => {
  it('contexto_gerente_sin_fecha', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-06-01' });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    expect(ctx.lente).toBe('gerente');
    expect(ctx.fecha).toBeNull();
  });

  it('contexto_gerente_calcula_fecha_optimista', () => {
    // Etapa 1, WMS: 50 % × 240 = 120 días → 2027-03-02; cierre 2027-02-01 (fuera del trimestre, lente gerente) es optimista.
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-02-01' });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    expect(ctx.lente).toBe('gerente');
    expect(ctx.fechaOptimista).toBe(true);
  });

  it('contexto_director_calcula_fecha_y_no_optimista', () => {
    const exp = expedienteBase({
      etapaCRM: 3,
      fechaCierreCRM: '2026-11-10',
      cadena: { ruta: 'contrato', pasos: { aElegido: true } },
    });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    expect(ctx.lente).toBe('director');
    expect(ctx.fecha).not.toBeNull();
    expect(ctx.fecha?.veredicto).toBe('no_cierra_fecha');
    expect(ctx.fechaOptimista).toBe(false);
  });

  it('contexto_deriva_economicos_y_demas_campos', () => {
    const e = influenciaBase({ personaId: 'e1', roles: ['E'] });
    const c = influenciaBase({ personaId: 'c1', roles: ['C'] });
    const ec = influenciaBase({ personaId: 'ec1', roles: ['E', 'C'] });
    const u = influenciaBase({ personaId: 'u1', roles: ['U'] });
    const exp = expedienteBase({
      fechaCreacion: '2026-01-01',
      cuenta: { esClienteNetlogistik: true },
      etapaCRM: 2,
      influencias: [e, c, ec, u],
    });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    expect(ctx.exp).toBe(exp);
    expect(ctx.hoy).toBe(HOY);
    expect(ctx.config).toBe(CONFIG_DEFAULT);
    expect(ctx.tipo).toBe('EN');
    expect(ctx.etapaRec).toBe(0);
    expect(ctx.comparacion).toEqual({ resultado: 'inflada', diferencia: 2 });
    expect(ctx.atorada).toBe(true);
    expect(ctx.embudo).toBe('en_embudo');
    expect(ctx.economicos.map((i) => i.personaId)).toEqual(['e1', 'ec1']);
    expect('coaches' in ctx).toBe(false); // M5: el contexto ya no lleva el campo sin uso
  });
});
