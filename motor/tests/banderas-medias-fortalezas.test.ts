import { describe, expect, it } from 'vitest';
import { posicionGeneral } from '../src/competencia.js';
import { CONFIG_DEFAULT } from '../src/config.js';
import { construirContexto } from '../src/contexto.js';
import { REGLAS_ALTAS } from '../src/reglas/altas.js';
import { REGLAS_CRITICAS } from '../src/reglas/criticas.js';
import { CATALOGO_BANDERAS, evaluarBanderas, evaluarFortalezas } from '../src/reglas/index.js';
import { REGLAS_FORTALEZAS } from '../src/reglas/fortalezas.js';
import { REGLAS_MEDIAS } from '../src/reglas/medias.js';
import { aplicaLente, type Regla } from '../src/reglas/tipos.js';
import type { Alternativa, Expediente } from '../src/tipos.js';
import { expedienteBase, influenciaBase, type DeepPartial } from './fabrica.js';

const HOY = '2026-11-02'; // el trimestre en curso termina el 2026-12-31

const confirmado = (valor: string, fecha?: string) => ({ valor, nivel: 'confirmado' as const, ...(fecha ? { fecha } : {}) });
const supuesto = (valor: string, fecha?: string) => ({ valor, nivel: 'supuesto' as const, ...(fecha ? { fecha } : {}) });
const alt = (posicion: Alternativa['posicion']): Alternativa => ({ tipo: 'proveedor', nombre: null, posicion });

function ctxDe(exp: Expediente) {
  return construirContexto(exp, HOY, CONFIG_DEFAULT);
}

function regla(id: string): Regla {
  const r = REGLAS_MEDIAS.find((x) => x.id === id);
  if (!r) throw new Error(`regla desconocida: ${id}`);
  return r;
}

/** Evalúa una media como lo hará el orquestador: primero la lente, luego la condición. */
function evaluar(id: string, exp: Expediente): string | null {
  const ctx = ctxDe(exp);
  const r = regla(id);
  return aplicaLente(r, ctx.lente) ? r.evaluar(ctx) : null;
}

function fortaleza(id: string, exp: Expediente): string | null {
  const r = REGLAS_FORTALEZAS.find((x) => x.id === id);
  if (!r) throw new Error(`fortaleza desconocida: ${id}`);
  return r.evaluar(ctxDe(exp));
}

/** Expediente sin ninguna bandera crítica ni alta (lente gerente). */
function expedienteLimpio(over: DeepPartial<Expediente> = {}): Expediente {
  return expedienteBase({
    influencias: [
      influenciaBase({ personaId: 'e1', roles: ['E'], grado: 'A', modo: 'P', calificacion: 3 }),
      influenciaBase({ personaId: 'c1', roles: ['C'], grado: 'M', modo: 'C', calificacion: 4 }),
    ],
    bant: {
      budget: confirmado('Presupuesto 2027'), authority: confirmado('Director de operaciones'),
      need: confirmado('Reducir errores de inventario'), time: confirmado('Q2 2027'),
    },
    compellingEvent: {
      descripcion: 'Cierre de bodega actual',
      fecha: confirmado('2027-06-30'), dueno: confirmado('Dirección general'), costoInaccion: confirmado('USD 2 M al año'),
    },
    contribucionDiferenciadora: confirmado('Implementación en 90 días'),
    preguntaCompetenciaHecha: true,
    alternativas: [alt('dominante')],
    ...over,
  });
}

interface Caso { id: string; activa: Expediente; noActiva: Expediente }

const CASOS: Caso[] = [
  {
    id: 'influencia_nueva_puesto',
    activa: expedienteBase({ influencias: [influenciaBase({ nuevaEnPuesto: true })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ nuevaEnPuesto: false })] }),
  },
  {
    id: 'reorganizacion',
    activa: expedienteBase({ reorganizacion: { valor: true, nivel: 'confirmado' } }),
    noActiva: expedienteBase({ reorganizacion: { valor: false, nivel: 'confirmado' } }),
  },
  {
    id: 'informacion_incierta',
    activa: expedienteBase({ influencias: [influenciaBase({ personaId: 'a' }), influenciaBase({ personaId: 'b' })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ personaId: 'a' }), influenciaBase({ personaId: 'b', roles: ['U'] })] }),
  },
  {
    id: 'modo_calificacion_inconsistente',
    activa: expedienteBase({ influencias: [influenciaBase({ modo: 'E', calificacion: 2 })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ modo: 'E', calificacion: -2 })] }),
  },
  {
    id: 'modo_no_determinado',
    activa: expedienteBase({ influencias: [influenciaBase({ modo: null, contactada: true })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ modo: null, contactada: false })] }),
  },
  {
    id: 'nula_sin_criterios',
    activa: expedienteBase({ preguntaCompetenciaHecha: true, criteriosCompraDefinidos: false }),
    noActiva: expedienteBase({ preguntaCompetenciaHecha: true, criteriosCompraDefinidos: true }),
  },
  {
    id: 'euforia_con_banderas',
    activa: expedienteBase({ sensacion: 'euforico' }), // sin Económico ni Budget: críticas activas
    noActiva: expedienteLimpio({ sensacion: 'euforico' }),
  },
  {
    id: 'prioridad_incongruente',
    activa: expedienteBase({
      prioridad: { valor: 'postergable', nivel: 'confirmado' },
      influencias: [influenciaBase({ roles: ['E'], modo: 'P' })],
    }),
    noActiva: expedienteBase({
      prioridad: { valor: 'postergable', nivel: 'confirmado' },
      influencias: [influenciaBase({ roles: ['E'], modo: 'C' })],
    }),
  },
  {
    id: 'tr_no_redactado',
    activa: expedienteBase({ influencias: [influenciaBase({ grado: 'A', trDeclaracion: null })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ grado: 'A', trDeclaracion: 'Reducir costo' })] }),
  },
  {
    id: 'dato_caduco',
    activa: expedienteBase({ bant: { budget: confirmado('Presupuesto 2027', '2026-06-01') } }),
    noActiva: expedienteBase({ bant: { budget: confirmado('Presupuesto 2027', '2026-10-01') } }),
  },
  {
    id: 'influencia_sin_contacto',
    activa: expedienteBase({ influencias: [influenciaBase({ ultimoContacto: '2026-08-01' })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ ultimoContacto: '2026-10-15' })] }),
  },
  {
    id: 'crm_desactualizado',
    activa: expedienteBase({ higieneCRM: { valores: false, actividades: true, etapas: true } }),
    noActiva: expedienteBase({ higieneCRM: { valores: true, actividades: null, etapas: true } }),
  },
  {
    id: 'grado_bajo_ignorado',
    activa: expedienteBase({ influencias: [influenciaBase({ grado: 'B', contactada: false })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ grado: 'B', contactada: true })] }),
  },
  {
    id: 'fecha_optimista',
    // Etapa 1, WMS: 50 % × 240 = 120 días desde hoy → 2027-03-02; cierre 2027-01-15 es optimista (lente gerente).
    activa: expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-01-15' }),
    noActiva: expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-04-15' }),
  },
];

describe('catálogo de banderas medias', () => {
  it('tiene_las_14_medias_con_severidad_media', () => {
    expect(REGLAS_MEDIAS.map((r) => r.id)).toEqual(CASOS.map((c) => c.id));
    expect(REGLAS_MEDIAS.every((r) => r.severidad === 'media')).toBe(true);
  });

  it('solo_fecha_optimista_es_de_la_lente_gerente', () => {
    for (const r of REGLAS_MEDIAS) expect(r.lente).toBe(r.id === 'fecha_optimista' ? 'gerente' : 'ambas');
  });

  it.each(CASOS)('$id se activa con su condición', ({ id, activa }) => {
    const texto = evaluar(id, activa);
    expect(texto).not.toBeNull();
    expect(texto!.length).toBeGreaterThan(10);
  });

  it.each(CASOS)('$id no se activa sin su condición', ({ id, noActiva }) => {
    expect(evaluar(id, noActiva)).toBeNull();
  });
});

describe('medias: casos de borde', () => {
  it('informacion_incierta_no_se_activa_con_un_solo_economico', () => {
    expect(evaluar('informacion_incierta', expedienteBase({ influencias: [influenciaBase()] }))).toBeNull();
  });

  it('modo_calificacion_inconsistente_aplica_a_E_y_EC_pero_no_a_C_ni_P', () => {
    const con = (modo: 'C' | 'P' | 'E' | 'EC') => expedienteBase({ influencias: [influenciaBase({ modo, calificacion: 3 })] });
    expect(evaluar('modo_calificacion_inconsistente', con('EC'))).not.toBeNull();
    expect(evaluar('modo_calificacion_inconsistente', con('C'))).toBeNull();
    expect(evaluar('modo_calificacion_inconsistente', con('P'))).toBeNull();
    expect(evaluar('modo_calificacion_inconsistente', expedienteBase({ influencias: [influenciaBase({ modo: 'E', calificacion: null })] }))).toBeNull();
  });

  it('nula_sin_criterios_requiere_posicion_nula', () => {
    const exp = expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('alternativa')], criteriosCompraDefinidos: false });
    expect(evaluar('nula_sin_criterios', exp)).toBeNull();
    expect(evaluar('nula_sin_criterios', expedienteBase({ preguntaCompetenciaHecha: false }))).toBeNull();
  });

  it('euforia_se_activa_con_excelente_pero_no_con_seguro', () => {
    expect(evaluar('euforia_con_banderas', expedienteBase({ sensacion: 'excelente' }))).not.toBeNull();
    expect(evaluar('euforia_con_banderas', expedienteBase({ sensacion: 'seguro' }))).toBeNull();
    expect(evaluar('euforia_con_banderas', expedienteBase({ sensacion: null }))).toBeNull();
  });

  it('euforia_ignora_banderas_de_otra_lente', () => {
    // Con lente gerente, 'sow_requerido_solo_oc' (director) no cuenta: el expediente limpio sigue limpio.
    const exp = expedienteLimpio({ sensacion: 'euforico', cadena: { requiereSOW: true, ruta: 'oc' } });
    expect(ctxDe(exp).lente).toBe('gerente');
    expect(evaluar('euforia_con_banderas', exp)).toBeNull();
    // Con lente director esa misma alta sí cuenta.
    expect(evaluar('euforia_con_banderas', { ...exp, etapaCRM: 3 })).not.toBeNull();
  });

  it('euforia_no_cuenta_banderas_medias', () => {
    const exp = expedienteLimpio({ sensacion: 'euforico', reorganizacion: { valor: true, nivel: 'confirmado' } });
    expect(evaluar('reorganizacion', exp)).not.toBeNull();
    expect(evaluar('euforia_con_banderas', exp)).toBeNull();
  });

  it('expediente_limpio_no_tiene_criticas_ni_altas', () => {
    const banderas = evaluarBanderas(ctxDe(expedienteLimpio()));
    expect(banderas.filter((b) => b.severidad !== 'media')).toEqual([]);
  });

  describe('prioridad_incongruente', () => {
    const post = { valor: 'postergable' as const, nivel: 'confirmado' as const };
    const urg = { valor: 'urgente' as const, nivel: 'confirmado' as const };

    it('postergable_con_economico_en_modo_problema', () => {
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: post, influencias: [influenciaBase({ modo: 'P' })] }))).not.toBeNull();
    });

    it('postergable_con_lente_director', () => {
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: post, etapaCRM: 3 }))).not.toBeNull();
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: post }))).toBeNull();
    });

    it('urgente_con_todos_los_economicos_en_E_o_EC', () => {
      const e = (modo: 'E' | 'EC' | 'P') => influenciaBase({ modo });
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: urg, influencias: [e('E'), influenciaBase({ personaId: 'b', modo: 'EC' })] }))).not.toBeNull();
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: urg, influencias: [e('E'), influenciaBase({ personaId: 'b', modo: 'P' })] }))).toBeNull();
    });

    it('urgente_sin_economicos_no_se_activa', () => {
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: urg }))).toBeNull();
    });

    it('otras_prioridades_no_se_activan', () => {
      const act = { valor: 'activa' as const, nivel: 'confirmado' as const };
      expect(evaluar('prioridad_incongruente', expedienteBase({ prioridad: act, etapaCRM: 3, influencias: [influenciaBase({ modo: 'E' })] }))).toBeNull();
    });
  });

  describe('tr_no_redactado', () => {
    it('aplica_a_grado_M_pero_no_a_B', () => {
      expect(evaluar('tr_no_redactado', expedienteBase({ influencias: [influenciaBase({ grado: 'M', trDeclaracion: null })] }))).not.toBeNull();
      expect(evaluar('tr_no_redactado', expedienteBase({ influencias: [influenciaBase({ grado: 'B', trDeclaracion: null })] }))).toBeNull();
      expect(evaluar('tr_no_redactado', expedienteBase({ influencias: [influenciaBase({ grado: null, trDeclaracion: null })] }))).toBeNull();
    });

    it('una_declaracion_vacia_cuenta_como_no_redactada', () => {
      expect(evaluar('tr_no_redactado', expedienteBase({ influencias: [influenciaBase({ grado: 'A', trDeclaracion: '  ' })] }))).not.toBeNull();
    });
  });

  describe('dato_caduco', () => {
    it('exactamente_90_dias_no_caduca_pero_91_si', () => {
      // hoy − 90 días = 2026-08-04
      expect(evaluar('dato_caduco', expedienteBase({ bant: { need: confirmado('x', '2026-08-04') } }))).toBeNull();
      expect(evaluar('dato_caduco', expedienteBase({ bant: { need: confirmado('x', '2026-08-03') } }))).not.toBeNull();
    });

    it('solo_cuentan_los_datos_confirmados_con_fecha', () => {
      expect(evaluar('dato_caduco', expedienteBase({ bant: { budget: supuesto('x', '2026-01-01') } }))).toBeNull();
      expect(evaluar('dato_caduco', expedienteBase({ bant: { budget: confirmado('x') } }))).toBeNull();
    });

    it('revisa_ce_prioridad_contribucion_reorganizacion_y_cliente_ideal', () => {
      const vieja = '2026-01-01';
      const casos: DeepPartial<Expediente>[] = [
        { compellingEvent: { fecha: confirmado('2027-01-01', vieja) } },
        { compellingEvent: { dueno: confirmado('x', vieja) } },
        { compellingEvent: { costoInaccion: confirmado('x', vieja) } },
        { prioridad: { valor: 'activa', nivel: 'confirmado', fecha: vieja } },
        { contribucionDiferenciadora: confirmado('x', vieja) },
        { reorganizacion: { valor: false, nivel: 'confirmado', fecha: vieja } },
        { cuenta: { clienteIdeal: [{ valor: 3, nivel: 'ausente' }, { valor: 3, nivel: 'confirmado', fecha: vieja }] } },
        { bant: { authority: confirmado('x', vieja) } },
        { bant: { time: confirmado('x', vieja) } },
      ];
      for (const c of casos) expect(evaluar('dato_caduco', expedienteBase(c))).not.toBeNull();
    });

    it('respeta_config_caducidadDatoDias', () => {
      const config = structuredClone(CONFIG_DEFAULT);
      config.caducidadDatoDias = 10;
      const exp = expedienteBase({ bant: { budget: confirmado('x', '2026-10-01') } });
      const ctx = construirContexto(exp, HOY, config);
      expect(regla('dato_caduco').evaluar(ctx)).not.toBeNull();
    });
  });

  describe('influencia_sin_contacto', () => {
    it('exactamente_60_dias_no_se_activa_pero_61_si', () => {
      // hoy − 60 días = 2026-09-03
      expect(evaluar('influencia_sin_contacto', expedienteBase({ influencias: [influenciaBase({ ultimoContacto: '2026-09-03' })] }))).toBeNull();
      expect(evaluar('influencia_sin_contacto', expedienteBase({ influencias: [influenciaBase({ ultimoContacto: '2026-09-02' })] }))).not.toBeNull();
    });

    it('sin_ultimo_contacto_no_se_activa', () => {
      expect(evaluar('influencia_sin_contacto', expedienteBase({ influencias: [influenciaBase()] }))).toBeNull();
    });
  });

  it('fecha_optimista_no_aplica_con_lente_director', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2026-12-15' }); // dentro del trimestre → director
    expect(ctxDe(exp).lente).toBe('director');
    expect(evaluar('fecha_optimista', exp)).toBeNull();
  });
});

describe('posicionGeneral', () => {
  it('toma_la_peor_posicion_entre_las_alternativas', () => {
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante'), alt('alternativa')] }))).toBe('alternativa');
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante'), alt('compartida')] }))).toBe('compartida');
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante')] }))).toBe('dominante');
  });

  it('pregunta_hecha_sin_alternativas_es_nula', () => {
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [] }))).toBe('nula');
  });

  it('pregunta_no_hecha_sin_alternativas_es_null', () => {
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: false, alternativas: [] }))).toBeNull();
  });

  it('ignora_las_posiciones_null', () => {
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt(null), alt('compartida')] }))).toBe('compartida');
    expect(posicionGeneral(expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt(null)] }))).toBeNull();
  });
});

describe('evaluarBanderas', () => {
  it('catalogo_es_criticas_altas_medias_en_ese_orden', () => {
    expect(CATALOGO_BANDERAS).toEqual([...REGLAS_CRITICAS, ...REGLAS_ALTAS, ...REGLAS_MEDIAS]);
    const ids = CATALOGO_BANDERAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('evaluarBanderas_ordena_por_severidad', () => {
    const exp = expedienteBase({
      sensacion: 'euforico',
      reorganizacion: { valor: true, nivel: 'confirmado' },
      higieneCRM: { valores: false, actividades: null, etapas: null },
      influencias: [influenciaBase({ nuevaEnPuesto: true })],
    });
    const banderas = evaluarBanderas(ctxDe(exp));
    const orden = { critica: 0, alta: 1, media: 2 } as const;
    const rangos = banderas.map((b) => orden[b.severidad]);
    expect(rangos).toEqual([...rangos].sort((a, b) => a - b));
    expect(new Set(rangos)).toEqual(new Set([0, 1, 2]));
    // Dentro de cada severidad se respeta el orden del catálogo.
    const posicion = (id: string) => CATALOGO_BANDERAS.findIndex((r) => r.id === id);
    const posiciones = banderas.map((b) => posicion(b.id));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
  });

  it('cada_bandera_trae_id_severidad_y_texto_del_catalogo', () => {
    const banderas = evaluarBanderas(ctxDe(expedienteBase()));
    const sinEconomico = banderas.find((b) => b.id === 'sin_economico');
    expect(sinEconomico).toEqual({
      id: 'sin_economico',
      severidad: 'critica',
      texto: 'No hay Influencia Económica identificada para este objetivo de venta.',
    });
  });

  it('excluye_reglas_de_director_con_lente_gerente_e_incluye_con_director', () => {
    const exp = expedienteBase({ etapaCRM: 2, cadena: { requiereSOW: true, ruta: 'oc' } });
    const gerente = ctxDe(exp);
    expect(gerente.lente).toBe('gerente');
    expect(evaluarBanderas(gerente).map((b) => b.id)).not.toContain('sow_requerido_solo_oc');
    const director = ctxDe({ ...exp, etapaCRM: 3 });
    expect(director.lente).toBe('director');
    expect(evaluarBanderas(director).map((b) => b.id)).toContain('sow_requerido_solo_oc');
  });

  it('excluye_reglas_de_gerente_con_lente_director', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-01-15' });
    expect(evaluarBanderas(ctxDe(exp)).map((b) => b.id)).toContain('fecha_optimista');
    const director = ctxDe({ ...exp, etapaCRM: 3 });
    expect(evaluarBanderas(director).map((b) => b.id)).not.toContain('fecha_optimista');
  });

  it('expediente_limpio_no_devuelve_banderas_activas_de_mas', () => {
    expect(evaluarBanderas(ctxDe(expedienteLimpio())).map((b) => b.id)).toEqual([]);
  });
});

interface CasoFortaleza { id: string; activa: Expediente; noActiva: Expediente }

const CASOS_FORTALEZA: CasoFortaleza[] = [
  {
    id: 'coach_valido',
    activa: expedienteBase({ influencias: [influenciaBase({ roles: ['C'], calificacion: 4, modo: 'C' })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ roles: ['C'], calificacion: 2, modo: 'C' })] }),
  },
  {
    id: 'economico_a_favor',
    activa: expedienteBase({ influencias: [influenciaBase({ roles: ['E'], contactada: true, calificacion: 3 })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ roles: ['E'], contactada: true, calificacion: 2 })] }),
  },
  {
    id: 'bant_confirmado',
    activa: expedienteBase({ bant: { budget: confirmado('a'), authority: confirmado('b'), need: confirmado('c'), time: confirmado('d') } }),
    noActiva: expedienteBase({ bant: { budget: confirmado('a'), authority: confirmado('b'), need: confirmado('c'), time: supuesto('d') } }),
  },
  {
    id: 'ce_completo',
    activa: expedienteBase({ compellingEvent: { fecha: confirmado('2027-01-01'), dueno: confirmado('x'), costoInaccion: confirmado('y'), urgenciaFalsa: false } }),
    noActiva: expedienteBase({ compellingEvent: { fecha: confirmado('2027-01-01'), dueno: confirmado('x'), costoInaccion: supuesto('y'), urgenciaFalsa: false } }),
  },
  {
    id: 'dominante_con_contribucion',
    activa: expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante')], contribucionDiferenciadora: supuesto('x') }),
    noActiva: expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante')] }),
  },
  {
    id: 'cliente_ideal_alto',
    activa: expedienteBase({ cuenta: { clienteIdeal: [4, 3, 2, 3, 3].map((valor) => ({ valor, nivel: 'confirmado' as const })) } }),
    noActiva: expedienteBase({ cuenta: { clienteIdeal: [4, 3, 2, 1, 3].map((valor) => ({ valor, nivel: 'confirmado' as const })) } }),
  },
  {
    id: 'tr_completos',
    activa: expedienteBase({ influencias: [influenciaBase({ grado: 'A', trDeclaracion: 'Reducir costo' })] }),
    noActiva: expedienteBase({ influencias: [influenciaBase({ grado: 'A', trDeclaracion: null })] }),
  },
  {
    id: 'varios_a_favor',
    activa: expedienteBase({
      influencias: [
        influenciaBase({ personaId: 'a', modo: 'C', calificacion: 2 }),
        influenciaBase({ personaId: 'b', modo: 'P', calificacion: 1 }),
      ],
    }),
    noActiva: expedienteBase({
      influencias: [
        influenciaBase({ personaId: 'a', modo: 'C', calificacion: 2 }),
        influenciaBase({ personaId: 'b', modo: 'P', calificacion: -1 }),
      ],
    }),
  },
];

describe('fortalezas', () => {
  it('catalogo_tiene_las_8_fortalezas_en_orden', () => {
    expect(REGLAS_FORTALEZAS.map((r) => r.id)).toEqual(CASOS_FORTALEZA.map((c) => c.id));
  });

  it.each(CASOS_FORTALEZA)('$id se activa con su condición', ({ id, activa }) => {
    const texto = fortaleza(id, activa);
    expect(texto).not.toBeNull();
    expect(texto!.length).toBeGreaterThan(10);
  });

  it.each(CASOS_FORTALEZA)('$id no se activa sin su condición', ({ id, noActiva }) => {
    expect(fortaleza(id, noActiva)).toBeNull();
  });

  it('coach_valido_usa_la_definicion_de_esCoachValido', () => {
    expect(fortaleza('coach_valido', expedienteBase({ influencias: [influenciaBase({ roles: ['C'], calificacion: 4, modo: 'E' })] }))).toBeNull();
    expect(fortaleza('coach_valido', expedienteBase({ influencias: [influenciaBase({ roles: ['E'], calificacion: 4, modo: 'C' })] }))).toBeNull();
  });

  it('economico_a_favor_exige_contacto', () => {
    expect(fortaleza('economico_a_favor', expedienteBase({ influencias: [influenciaBase({ roles: ['E'], contactada: false, calificacion: 5 })] }))).toBeNull();
    expect(fortaleza('economico_a_favor', expedienteBase({ influencias: [influenciaBase({ roles: ['U'], contactada: true, calificacion: 5 })] }))).toBeNull();
  });

  it('ce_completo_no_aplica_con_urgencia_falsa', () => {
    const exp = expedienteBase({ compellingEvent: { fecha: confirmado('2027-01-01'), dueno: confirmado('x'), costoInaccion: confirmado('y'), urgenciaFalsa: true } });
    expect(fortaleza('ce_completo', exp)).toBeNull();
  });

  it('dominante_con_contribucion_exige_posicion_dominante', () => {
    const exp = expedienteBase({ preguntaCompetenciaHecha: true, alternativas: [alt('dominante'), alt('compartida')], contribucionDiferenciadora: confirmado('x') });
    expect(fortaleza('dominante_con_contribucion', exp)).toBeNull();
  });

  describe('cliente_ideal_alto', () => {
    it('promedio_exactamente_3_se_activa', () => {
      const exp = expedienteBase({ cuenta: { clienteIdeal: [3, 3, 3, 3, 3].map((valor) => ({ valor, nivel: 'supuesto' as const })) } });
      expect(fortaleza('cliente_ideal_alto', exp)).not.toBeNull();
    });

    it('promedia_solo_los_valores_no_nulos', () => {
      const exp = expedienteBase({
        cuenta: { clienteIdeal: [{ valor: 4, nivel: 'confirmado' }, { valor: null, nivel: 'ausente' }, { valor: 3, nivel: 'supuesto' }] },
      });
      expect(fortaleza('cliente_ideal_alto', exp)).not.toBeNull();
    });

    it('sin_valores_no_se_activa', () => {
      expect(fortaleza('cliente_ideal_alto', expedienteBase())).toBeNull();
    });
  });

  describe('tr_completos', () => {
    it('sin_influencias_A_o_M_no_se_activa', () => {
      expect(fortaleza('tr_completos', expedienteBase())).toBeNull();
      expect(fortaleza('tr_completos', expedienteBase({ influencias: [influenciaBase({ grado: 'B', trDeclaracion: null })] }))).toBeNull();
    });

    it('basta_que_una_A_o_M_no_tenga_declaracion_para_no_activarse', () => {
      const exp = expedienteBase({
        influencias: [
          influenciaBase({ personaId: 'a', grado: 'A', trDeclaracion: 'Reducir costo' }),
          influenciaBase({ personaId: 'b', grado: 'M', trDeclaracion: null }),
        ],
      });
      expect(fortaleza('tr_completos', exp)).toBeNull();
    });

    it('influencias_B_sin_declaracion_no_impiden_la_fortaleza', () => {
      const exp = expedienteBase({
        influencias: [
          influenciaBase({ personaId: 'a', grado: 'A', trDeclaracion: 'Reducir costo' }),
          influenciaBase({ personaId: 'b', grado: 'B', trDeclaracion: null }),
        ],
      });
      expect(fortaleza('tr_completos', exp)).not.toBeNull();
    });
  });

  it('varios_a_favor_exige_modo_C_o_P', () => {
    const exp = expedienteBase({
      influencias: [
        influenciaBase({ personaId: 'a', modo: 'C', calificacion: 2 }),
        influenciaBase({ personaId: 'b', modo: 'E', calificacion: 4 }),
      ],
    });
    expect(fortaleza('varios_a_favor', exp)).toBeNull();
  });

  describe('evaluarFortalezas', () => {
    it('devuelve_id_y_texto_solo_de_las_activas_en_orden_de_catalogo', () => {
      const exp = expedienteLimpio({
        bant: { budget: confirmado('a'), authority: confirmado('b'), need: confirmado('c'), time: confirmado('d') },
      });
      const fortalezas = evaluarFortalezas(ctxDe(exp));
      const ids = fortalezas.map((f) => f.id);
      expect(ids).toEqual(expect.arrayContaining(['coach_valido', 'economico_a_favor', 'bant_confirmado', 'ce_completo', 'dominante_con_contribucion', 'tr_completos']));
      expect(ids).not.toContain('cliente_ideal_alto');
      const posiciones = ids.map((id) => REGLAS_FORTALEZAS.findIndex((r) => r.id === id));
      expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
      for (const f of fortalezas) expect(f.texto.length).toBeGreaterThan(10);
    });

    it('expediente_vacio_no_tiene_fortalezas', () => {
      expect(evaluarFortalezas(ctxDe(expedienteBase()))).toEqual([]);
    });
  });
});
