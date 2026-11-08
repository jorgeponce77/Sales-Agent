import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { construirContexto } from '../src/contexto.js';
import { REGLAS_ALTAS } from '../src/reglas/altas.js';
import { REGLAS_CRITICAS } from '../src/reglas/criticas.js';
import { esCoachValido } from '../src/reglas/helpers.js';
import { aplicaLente, type Regla } from '../src/reglas/tipos.js';
import type { Expediente, Lente } from '../src/tipos.js';
import { expedienteBase, influenciaBase, type DeepPartial } from './fabrica.js';

const HOY = '2026-11-02'; // el trimestre en curso termina el 2026-12-31
const TODAS: Regla[] = [...REGLAS_CRITICAS, ...REGLAS_ALTAS];

function regla(id: string): Regla {
  const r = TODAS.find((x) => x.id === id);
  if (!r) throw new Error(`regla desconocida: ${id}`);
  return r;
}

/** Evalúa una regla como lo hará el orquestador: primero la lente, luego la condición. */
function evaluar(id: string, exp: Expediente): string | null {
  const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
  const r = regla(id);
  return aplicaLente(r, ctx.lente) ? r.evaluar(ctx) : null;
}

const DIRECTOR: DeepPartial<Expediente> = { etapaCRM: 3 };

interface Caso { id: string; activa: Expediente; noActiva: Expediente }

const confirmado = (valor: string) => ({ valor, nivel: 'confirmado' as const });
const supuesto = (valor: string) => ({ valor, nivel: 'supuesto' as const });

const CASOS: Caso[] = [
  {
    id: 'sin_economico',
    activa: expedienteBase(),
    noActiva: expedienteBase({ influencias: [influenciaBase()] }),
  },
  {
    id: 'economico_sin_cubrir',
    activa: expedienteBase({ ...DIRECTOR, influencias: [influenciaBase({ contactada: false })] }),
    noActiva: expedienteBase({ ...DIRECTOR, influencias: [influenciaBase({ contactada: true })] }),
  },
  {
    id: 'budget_ausente',
    activa: expedienteBase(),
    noActiva: expedienteBase({ bant: { budget: supuesto('Presupuesto 2027') } }),
  },
  {
    id: 'no_elegidos_cierre_periodo',
    activa: expedienteBase({ fechaCierreCRM: '2026-12-15' }),
    noActiva: expedienteBase({ fechaCierreCRM: '2026-12-15', cadena: { pasos: { aElegido: true } } }),
  },
  {
    id: 'etapa_inflada_grave',
    // Presunción por etapa: solo una contradicción (criterio anterior en ausente) baja la recomendada.
    activa: expedienteBase({ etapaCRM: 2, criteriosArgano: [{ clave: 'cliente_confirma_real', nivel: 'ausente' }] }),
    noActiva: expedienteBase({ etapaCRM: 2 }),
  },
  {
    id: 'bant_supuesto',
    activa: expedienteBase({ bant: { budget: supuesto('x'), time: supuesto('y') } }),
    noActiva: expedienteBase({ bant: { budget: confirmado('x'), need: confirmado('y') } }),
  },
  {
    id: 'bant_ausente',
    activa: expedienteBase({ bant: { budget: confirmado('x') } }),
    noActiva: expedienteBase({
      bant: { authority: confirmado('a'), need: supuesto('n'), time: confirmado('t') },
    }),
  },
  {
    id: 'ce_incompleto',
    activa: expedienteBase({
      compellingEvent: { fecha: confirmado('2026-12-01'), dueno: confirmado('CFO'), costoInaccion: supuesto('USD 1M') },
    }),
    noActiva: expedienteBase({
      compellingEvent: { fecha: confirmado('2026-12-01'), dueno: confirmado('CFO'), costoInaccion: confirmado('USD 1M') },
    }),
  },
  {
    id: 'ce_urgencia_falsa',
    activa: expedienteBase({ compellingEvent: { urgenciaFalsa: true } }),
    noActiva: expedienteBase({ compellingEvent: { urgenciaFalsa: false } }),
  },
  {
    id: 'sin_coach_valido',
    activa: expedienteBase({ influencias: [influenciaBase({ roles: ['E'] })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ roles: ['C'], calificacion: 4, modo: 'C' })] }),
  },
  {
    id: 'etapa_inflada',
    activa: expedienteBase({ etapaCRM: 1, criteriosArgano: [{ clave: 'cliente_confirma_real', nivel: 'ausente' }] }),
    noActiva: expedienteBase({ etapaCRM: 1 }),
  },
  {
    id: 'banco_una_pata',
    activa: expedienteBase({
      influencias: [influenciaBase({ personaId: 'p1' }), influenciaBase({ personaId: 'p2', contactada: false })],
    }),
    noActiva: expedienteBase({
      influencias: [influenciaBase({ personaId: 'p1' }), influenciaBase({ personaId: 'p2' })],
    }),
  },
  {
    id: 'rfp_sin_contacto_previo',
    activa: expedienteBase({ esRFP: true, contactoPrevioRFP: false }),
    noActiva: expedienteBase({ esRFP: true, contactoPrevioRFP: true }),
  },
  {
    id: 'atorada',
    activa: expedienteBase({ fechaCreacion: '2026-01-01' }),
    noActiva: expedienteBase({ fechaCreacion: '2026-06-01' }),
  },
  {
    id: 'sow_requerido_solo_oc',
    activa: expedienteBase({ ...DIRECTOR, cadena: { requiereSOW: true, ruta: 'oc' } }),
    noActiva: expedienteBase({ ...DIRECTOR, cadena: { requiereSOW: true, ruta: 'contrato' } }),
  },
  {
    id: 'no_cierra_fecha',
    activa: expedienteBase({ fechaCierreCRM: '2026-11-03', cadena: { pasos: { aElegido: true } } }),
    noActiva: expedienteBase({
      fechaCierreCRM: '2026-12-30',
      cadena: { pasos: { aElegido: true, bContratoEnviado: true, cComentariosRecibidos: true, dEnFirma: true, eFirmado: true } },
    }),
  },
  {
    id: 'influencia_alta_no_contactada',
    activa: expedienteBase({ influencias: [influenciaBase({ grado: 'A', contactada: false })] }),
    noActiva: expedienteBase({
      influencias: [influenciaBase({ grado: 'A', contactada: true }), influenciaBase({ personaId: 'p2', grado: 'B', contactada: false })],
    }),
  },
  {
    id: 'sin_contribucion_diferenciadora',
    activa: expedienteBase(),
    noActiva: expedienteBase({ contribucionDiferenciadora: supuesto('Visibilidad de inventario en tiempo real') }),
  },
  {
    id: 'alternativas_no_identificadas',
    activa: expedienteBase({ preguntaCompetenciaHecha: false }),
    noActiva: expedienteBase({ preguntaCompetenciaHecha: true }),
  },
  {
    id: 'cierre_despues_ce',
    activa: expedienteBase({ fechaCierreCRM: '2026-12-20', compellingEvent: { fecha: confirmado('2026-11-30') } }),
    noActiva: expedienteBase({ fechaCierreCRM: '2026-11-20', compellingEvent: { fecha: confirmado('2026-11-30') } }),
  },
  {
    id: 'urgente_sin_ce',
    activa: expedienteBase({ prioridad: { valor: 'urgente', nivel: 'confirmado' } }),
    noActiva: expedienteBase({
      prioridad: { valor: 'urgente', nivel: 'confirmado' },
      compellingEvent: { fecha: supuesto('2026-12-01') },
    }),
  },
];

describe('catálogo de banderas', () => {
  it('ids_unicos_y_severidad_por_arreglo', () => {
    const ids = TODAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGLAS_CRITICAS.every((r) => r.severidad === 'critica')).toBe(true);
    expect(REGLAS_ALTAS.every((r) => r.severidad === 'alta')).toBe(true);
    expect(REGLAS_CRITICAS).toHaveLength(5);
    expect(REGLAS_ALTAS).toHaveLength(16);
  });

  it('cada_regla_tiene_un_caso_de_prueba', () => {
    expect(CASOS.map((c) => c.id).sort()).toEqual(TODAS.map((r) => r.id).sort());
  });

  it.each([
    ['sin_economico', 'ambas'], ['economico_sin_cubrir', 'director'], ['budget_ausente', 'ambas'],
    ['no_elegidos_cierre_periodo', 'director'], ['etapa_inflada_grave', 'ambas'],
    ['rfp_sin_contacto_previo', 'gerente'], ['sow_requerido_solo_oc', 'director'], ['no_cierra_fecha', 'director'],
    ['bant_supuesto', 'ambas'], ['atorada', 'ambas'], ['urgente_sin_ce', 'ambas'],
  ] as const)('lente_de_%s_es_%s', (id, lente) => {
    expect(regla(id).lente).toBe(lente);
  });
});

describe.each(CASOS)('$id', ({ id, activa, noActiva }) => {
  it('se_activa', () => {
    const texto = evaluar(id, activa);
    expect(texto).toEqual(expect.any(String));
    expect(texto).not.toBe('');
  });

  it('no_se_activa', () => {
    expect(evaluar(id, noActiva)).toBeNull();
  });
});

describe('condiciones de borde', () => {
  it('economico_sin_cubrir_no_aplica_sin_economicos', () => {
    expect(evaluar('economico_sin_cubrir', expedienteBase({ ...DIRECTOR }))).toBeNull();
  });

  it('economico_sin_cubrir_no_se_activa_si_al_menos_un_E_esta_contactado', () => {
    const exp = expedienteBase({
      ...DIRECTOR,
      influencias: [influenciaBase({ personaId: 'p1', contactada: false }), influenciaBase({ personaId: 'p2', contactada: true })],
    });
    expect(evaluar('economico_sin_cubrir', exp)).toBeNull();
  });

  it('no_elegidos_cierre_periodo_requiere_fecha_de_cierre', () => {
    expect(evaluar('no_elegidos_cierre_periodo', expedienteBase({ ...DIRECTOR, fechaCierreCRM: null }))).toBeNull();
  });

  it('no_elegidos_cierre_periodo_requiere_cierre_dentro_del_trimestre', () => {
    expect(evaluar('no_elegidos_cierre_periodo', expedienteBase({ ...DIRECTOR, fechaCierreCRM: '2027-01-15' }))).toBeNull();
    expect(evaluar('no_elegidos_cierre_periodo', expedienteBase({ ...DIRECTOR, fechaCierreCRM: '2026-12-31' }))).not.toBeNull();
  });

  it('bant_supuesto_lista_los_elementos_en_supuesto', () => {
    const exp = expedienteBase({ bant: { budget: supuesto('x'), time: supuesto('y') } });
    expect(evaluar('bant_supuesto', exp)).toContain('BANT en supuesto: Budget, Time');
  });

  it('bant_ausente_lista_authority_need_time_y_no_budget', () => {
    const texto = evaluar('bant_ausente', expedienteBase({ bant: { need: confirmado('n') } }));
    expect(texto).toContain('Authority, Time');
    expect(texto).not.toContain('Budget');
    expect(texto).not.toContain('Need');
  });

  it('bant_ausente_ignora_budget', () => {
    const exp = expedienteBase({ bant: { authority: confirmado('a'), need: confirmado('n'), time: confirmado('t') } });
    expect(evaluar('bant_ausente', exp)).toBeNull();
  });

  it('ce_incompleto_se_activa_con_cualquier_elemento_no_confirmado', () => {
    // base: los tres ausentes
    expect(evaluar('ce_incompleto', expedienteBase())).not.toBeNull();
  });

  it('ce_incompleto_cede_ante_urgencia_falsa', () => {
    const exp = expedienteBase({ compellingEvent: { urgenciaFalsa: true } });
    expect(evaluar('ce_incompleto', exp)).toBeNull();
    expect(evaluar('ce_urgencia_falsa', exp)).not.toBeNull();
  });

  it('sin_coach_valido_rechaza_calificacion_baja_nula_o_modo_invalido', () => {
    for (const coach of [
      influenciaBase({ roles: ['C'], calificacion: 2, modo: 'C' }),
      influenciaBase({ roles: ['C'], calificacion: null, modo: 'C' }),
      influenciaBase({ roles: ['C'], calificacion: 4, modo: 'E' }),
      influenciaBase({ roles: ['C'], calificacion: -3, modo: 'P' }),
    ]) {
      expect(evaluar('sin_coach_valido', expedienteBase({ influencias: [coach] }))).not.toBeNull();
    }
  });

  it('sin_coach_valido_acepta_modo_P_y_calificacion_3', () => {
    const exp = expedienteBase({ influencias: [influenciaBase({ roles: ['C'], calificacion: 3, modo: 'P' })] });
    expect(evaluar('sin_coach_valido', exp)).toBeNull();
  });

  it('etapa_inflada_no_se_activa_con_diferencia_de_dos', () => {
    const exp = expedienteBase({ etapaCRM: 2, criteriosArgano: [{ clave: 'cliente_confirma_real', nivel: 'ausente' }] });
    expect(evaluar('etapa_inflada_grave', exp)).not.toBeNull();
    expect(evaluar('etapa_inflada', exp)).toBeNull();
  });

  it('banco_una_pata_no_se_activa_sin_contactadas', () => {
    expect(evaluar('banco_una_pata', expedienteBase({ influencias: [influenciaBase({ contactada: false })] }))).toBeNull();
  });

  it('rfp_sin_contacto_previo_se_activa_con_contacto_desconocido', () => {
    expect(evaluar('rfp_sin_contacto_previo', expedienteBase({ esRFP: true, contactoPrevioRFP: null }))).not.toBeNull();
  });

  it('rfp_sin_contacto_previo_no_aplica_si_no_es_RFP', () => {
    expect(evaluar('rfp_sin_contacto_previo', expedienteBase({ esRFP: false, contactoPrevioRFP: false }))).toBeNull();
  });

  it('sow_requerido_solo_oc_no_se_activa_si_requiereSOW_es_null', () => {
    expect(evaluar('sow_requerido_solo_oc', expedienteBase({ ...DIRECTOR, cadena: { requiereSOW: null, ruta: 'oc' } }))).toBeNull();
  });

  it('cierre_despues_ce_requiere_fecha_de_cierre', () => {
    const exp = expedienteBase({ fechaCierreCRM: null, compellingEvent: { fecha: confirmado('2026-11-30') } });
    expect(evaluar('cierre_despues_ce', exp)).toBeNull();
  });

  it('cierre_despues_ce_requiere_fecha_de_ce_confirmada_o_supuesta', () => {
    const ausente = expedienteBase({ fechaCierreCRM: '2026-12-20' });
    expect(evaluar('cierre_despues_ce', ausente)).toBeNull();
    const supuesta = expedienteBase({ fechaCierreCRM: '2026-12-20', compellingEvent: { fecha: supuesto('2026-11-30') } });
    expect(evaluar('cierre_despues_ce', supuesta)).not.toBeNull();
  });

  it('cierre_despues_ce_no_se_activa_si_cierre_igual_al_ce', () => {
    const exp = expedienteBase({ fechaCierreCRM: '2026-11-30', compellingEvent: { fecha: confirmado('2026-11-30') } });
    expect(evaluar('cierre_despues_ce', exp)).toBeNull();
  });

  it('urgente_sin_ce_no_se_activa_con_otra_prioridad', () => {
    expect(evaluar('urgente_sin_ce', expedienteBase({ prioridad: { valor: 'activa', nivel: 'confirmado' } }))).toBeNull();
  });
});

describe('lentes', () => {
  it('reglas_director_no_aplican_con_lente_gerente', () => {
    // Condiciones de las reglas director cumplidas, pero con lente gerente (etapa 2, sin fecha de cierre).
    const exp = expedienteBase({
      etapaCRM: 2,
      influencias: [influenciaBase({ contactada: false })],
      cadena: { requiereSOW: true, ruta: 'oc' },
    });
    expect(construirContexto(exp, HOY, CONFIG_DEFAULT).lente).toBe('gerente');
    for (const id of ['economico_sin_cubrir', 'no_elegidos_cierre_periodo', 'sow_requerido_solo_oc', 'no_cierra_fecha']) {
      expect(regla(id).lente).toBe('director');
      expect(evaluar(id, exp)).toBeNull();
    }
    // Las mismas reglas sí se activan con lente director.
    expect(evaluar('economico_sin_cubrir', { ...exp, etapaCRM: 3 })).not.toBeNull();
    expect(evaluar('sow_requerido_solo_oc', { ...exp, etapaCRM: 3 })).not.toBeNull();
  });

  it('regla_gerente_no_aplica_con_lente_director', () => {
    const exp = expedienteBase({ ...DIRECTOR, esRFP: true, contactoPrevioRFP: false });
    expect(evaluar('rfp_sin_contacto_previo', exp)).toBeNull();
  });

  it('aplicaLente_acepta_ambas_y_la_lente_propia', () => {
    const base = { id: 'x', severidad: 'alta' as const, evaluar: () => null };
    const lentes: Lente[] = ['gerente', 'director'];
    for (const l of lentes) {
      expect(aplicaLente({ ...base, lente: 'ambas' }, l)).toBe(true);
      expect(aplicaLente({ ...base, lente: l }, l)).toBe(true);
    }
    expect(aplicaLente({ ...base, lente: 'gerente' }, 'director')).toBe(false);
    expect(aplicaLente({ ...base, lente: 'director' }, 'gerente')).toBe(false);
  });
});

describe('expediente vacío', () => {
  it('expediente_vacio_activa_sin_economico_y_budget_ausente', () => {
    const exp = expedienteBase();
    expect(evaluar('sin_economico', exp)).toBe('No hay Influencia Económica identificada para este objetivo de venta.');
    expect(evaluar('budget_ausente', exp)).not.toBeNull();
    const criticasActivas = REGLAS_CRITICAS.filter((r) => evaluar(r.id, exp) !== null).map((r) => r.id);
    expect(criticasActivas).toEqual(['sin_economico', 'budget_ausente']);
  });
});

describe('esCoachValido', () => {
  it('requiere_rol_C', () => {
    expect(esCoachValido(influenciaBase({ roles: ['E'], calificacion: 5, modo: 'C' }))).toBe(false);
    expect(esCoachValido(influenciaBase({ roles: ['E', 'C'], calificacion: 5, modo: 'C' }))).toBe(true);
  });

  it('requiere_calificacion_mayor_o_igual_a_3', () => {
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 3, modo: 'C' }))).toBe(true);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 2, modo: 'C' }))).toBe(false);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: -4, modo: 'C' }))).toBe(false);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: null, modo: 'C' }))).toBe(false);
  });

  it('requiere_modo_C_o_P', () => {
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 4, modo: 'C' }))).toBe(true);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 4, modo: 'P' }))).toBe(true);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 4, modo: 'E' }))).toBe(false);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 4, modo: 'EC' }))).toBe(false);
    expect(esCoachValido(influenciaBase({ roles: ['C'], calificacion: 4, modo: null }))).toBe(false);
  });
});

describe('redacción de los textos (M7)', () => {
  const textoDe = (id: string): string => {
    const caso = CASOS.find((c) => c.id === id);
    if (!caso) throw new Error(`sin caso para ${id}`);
    return evaluar(id, caso.activa) ?? '';
  };

  it.each(['ce_incompleto', 'cierre_despues_ce', 'urgente_sin_ce'])(
    '%s dice "compelling event", no "evento convincente"', (id) => {
      const texto = textoDe(id);
      expect(texto).toContain('compelling event');
      expect(texto).not.toContain('evento convincente');
    });

  it('rfp_sin_contacto_previo habla de confirmación de contacto previo con las influencias', () => {
    expect(textoDe('rfp_sin_contacto_previo')).toContain('no hay confirmación de contacto previo con las influencias');
  });

  it('ni el código ni el LEEME de los casos de George dicen "evento convincente"', () => {
    const rutas = ['../src/reglas/altas.ts', '../src/reglas/medias.ts', '../src/reglas/criticas.ts', '../src/reglas/fortalezas.ts',
      './golden/LEEME.md', './golden/casos/ejemplo-01-cierre-inflado.json', './golden/casos/ejemplo-02-sano.json'];
    for (const ruta of rutas) {
      const contenido = readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf-8');
      expect(contenido, ruta).not.toMatch(/evento convincente/i);
    }
  });
});
