import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { construirContexto, type Contexto } from '../src/contexto.js';
import { calcularIndice } from '../src/indice.js';
import { evaluarBanderas } from '../src/reglas/index.js';
import type { Bandera, Config, Evidencia, Expediente, Nivel, ResultadoFecha, VeredictoFecha } from '../src/tipos.js';
import { expedienteBase, influenciaBase, type DeepPartial } from './fabrica.js';

const HOY = '2026-11-02';

const ev = <T>(valor: T, nivel: Nivel = 'confirmado'): Evidencia<T> => ({ valor, nivel });
const ausente = { valor: null, nivel: 'ausente' as const };

const SANO: DeepPartial<Expediente> = {
  influencias: [
    influenciaBase({ personaId: 'e', roles: ['E'] }),
    influenciaBase({ personaId: 'c', roles: ['C', 'U'], modo: 'C' }),
    influenciaBase({ personaId: 't', roles: ['T'], modo: 'C' }),
  ],
  bant: { budget: ev('b'), authority: ev('a'), need: ev('n'), time: ev('t') },
  compellingEvent: { fecha: ev('2026-12-15'), dueno: ev('Dueño'), costoInaccion: ev('Costo') },
  preguntaCompetenciaHecha: true,
  contribucionDiferenciadora: ev('Diferenciador'),
  cuenta: { clienteIdeal: [5, 5, 5, 5, 5].map((v) => ev(v)) },
};

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Fusión profunda: los objetos se mezclan; arreglos y primitivos reemplazan. */
function fundir(base: unknown, over: unknown): unknown {
  if (!esObjeto(base) || !esObjeto(over)) return over;
  const salida: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) salida[k] = k in base ? fundir(base[k], over[k]) : over[k];
  return salida;
}

/** Expediente con lente gerente, sin banderas críticas y con todos los componentes completos (índice 100). */
function expedienteSano(over: DeepPartial<Expediente> = {}): Expediente {
  return expedienteBase(fundir(SANO, over) as DeepPartial<Expediente>);
}

function calcular(exp: Expediente, config: Config = CONFIG_DEFAULT) {
  const ctx = construirContexto(exp, HOY, config);
  return calcularIndice(ctx, evaluarBanderas(ctx));
}

function configConPesos(pesos: Partial<Config['pesos']>): Config {
  const c = structuredClone(CONFIG_DEFAULT);
  Object.assign(c.pesos, pesos);
  return c;
}

const fechaConVeredicto = (veredicto: VeredictoFecha): ResultadoFecha => ({
  veredicto, fechaCreible: null, diasPendientes: null, rutaUsada: null, acelerador: null,
});

/** Contexto real al que se le fuerzan las derivaciones de coherencia. */
function ctxCon(exp: Expediente, forzar: Partial<Contexto>): Contexto {
  return { ...construirContexto(exp, HOY, CONFIG_DEFAULT), ...forzar };
}

const critica: Bandera = { id: 'x', severidad: 'critica', texto: 'x' };

describe('índice de madurez: casos base', () => {
  it('expediente sano suma 100, verde y sin tope', () => {
    const r = calcular(expedienteSano());
    expect(r.total).toBe(100);
    expect(r.topado).toBe(false);
    expect(r.semaforo).toBe('verde');
    expect(r.componentes).toEqual({
      influencias: 20, bant: 20, compellingEvent: 20, triunfoResultados: 10,
      competencia: 10, clienteIdeal: 10, coherencia: 10,
    });
  });

  it('expediente_vacio_no_lanza: el total queda entre 0 y 15', () => {
    const r = calcular(expedienteBase());
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(15);
  });
});

describe('índice: BANT', () => {
  it('bant_completo_suma_20', () => {
    expect(calcular(expedienteSano()).componentes.bant).toBe(20);
  });

  it('bant_mixto: confirmado, supuesto, ausente, confirmado → 12', () => {
    const exp = expedienteSano({ bant: { budget: ev('b'), authority: ev('a', 'supuesto'), need: ausente, time: ev('t') } });
    expect(calcular(exp).componentes.bant).toBe(12);
  });
});

describe('índice: compelling event', () => {
  it('ce_supuesto_mitad: los 3 supuestos → 10', () => {
    const exp = expedienteSano({
      compellingEvent: { fecha: ev('2026-12-15', 'supuesto'), dueno: ev('D', 'supuesto'), costoInaccion: ev('C', 'supuesto') },
    });
    expect(calcular(exp).componentes.compellingEvent).toBe(10);
  });

  it('pondera fecha 7, dueño 7 y costo 6', () => {
    const exp = expedienteSano({ compellingEvent: { dueno: ausente, costoInaccion: ausente } });
    expect(calcular(exp).componentes.compellingEvent).toBe(7);
    const exp2 = expedienteSano({ compellingEvent: { fecha: ausente, dueno: ausente } });
    expect(calcular(exp2).componentes.compellingEvent).toBe(6);
  });

  it('ce_urgencia_falsa_cero', () => {
    const exp = expedienteSano({ compellingEvent: { urgenciaFalsa: true } });
    expect(calcular(exp).componentes.compellingEvent).toBe(0);
  });
});

describe('índice: influencias', () => {
  it('suma 5 + 4 + 4 + 3 + 2 + 2 con todo cubierto', () => {
    expect(calcular(expedienteSano()).componentes.influencias).toBe(20);
  });

  it('Económico identificado pero sin contactar: 5 + 2 (sin inconsistencia) = 7', () => {
    const exp = expedienteBase({ influencias: [influenciaBase({ roles: ['E'], contactada: false })] });
    expect(calcular(exp).componentes.influencias).toBe(7);
  });

  it('sin influencias solo suma los 2 de la ausencia de inconsistencia', () => {
    expect(calcular(expedienteBase()).componentes.influencias).toBe(2);
  });

  it('el Coach cuenta solo si es válido (calificación ≥ 3 y modo C o P)', () => {
    const coach = (over: Parameters<typeof influenciaBase>[0]) =>
      expedienteBase({ influencias: [influenciaBase({ roles: ['C'], ...over })] });
    // válido: 4 + (1/1)×2 + 2 = 8
    expect(calcular(coach({})).componentes.influencias).toBe(8);
    // calificación 2: 0 + 2 + 2 = 4
    expect(calcular(coach({ calificacion: 2 })).componentes.influencias).toBe(4);
    // modo Equilibrio con calificación positiva: no es Coach válido y además activa la inconsistencia: 0 + 2 + 0 = 2
    expect(calcular(coach({ modo: 'E', calificacion: 3 })).componentes.influencias).toBe(2);
  });

  it('exige al menos un U y un T para los 3 puntos', () => {
    const solo = (roles: ('U' | 'T')[]) =>
      expedienteBase({ influencias: roles.map((r, i) => influenciaBase({ personaId: `p${i}`, roles: [r], modo: 'C' })) });
    // 2 contactadas de 2 → 2 + 2 = 4, más 3 si hay U y T
    expect(calcular(solo(['U'])).componentes.influencias).toBe(4);
    expect(calcular(solo(['U', 'T'])).componentes.influencias).toBe(7);
  });

  it('proporción de contactadas por 2', () => {
    const exp = expedienteBase({
      influencias: [
        influenciaBase({ personaId: 'a', roles: ['U'], modo: 'C' }),
        influenciaBase({ personaId: 'b', roles: ['U'], modo: 'C', contactada: false }),
      ],
    });
    expect(calcular(exp).componentes.influencias).toBe(1 + 2);
  });

  it('la bandera modo_calificacion_inconsistente quita los 2 puntos', () => {
    const exp = expedienteSano();
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    const con = calcularIndice(ctx, [{ id: 'modo_calificacion_inconsistente', severidad: 'media', texto: 'x' }]);
    expect(con.componentes.influencias).toBe(18);
  });
});

describe('índice: triunfo-resultados', () => {
  it('pondera por grado: A con TR y M sin TR → 2/3 × 10', () => {
    const exp = expedienteSano({
      influencias: [
        influenciaBase({ personaId: 'a', grado: 'A' }),
        influenciaBase({ personaId: 'm', grado: 'M', trDeclaracion: null }),
      ],
    });
    expect(calcular(exp).componentes.triunfoResultados).toBeCloseTo((2 / 3) * 10, 10);
  });

  it('grado B pesa 0.5 y grado null pesa 1', () => {
    const exp = expedienteSano({
      influencias: [
        influenciaBase({ personaId: 'b', grado: 'B' }),
        influenciaBase({ personaId: 'n', grado: null, trDeclaracion: null }),
      ],
    });
    expect(calcular(exp).componentes.triunfoResultados).toBeCloseTo((0.5 / 1.5) * 10, 10);
  });

  it('una declaración de solo espacios no cuenta', () => {
    const exp = expedienteSano({ influencias: [influenciaBase({ trDeclaracion: '   ' })] });
    expect(calcular(exp).componentes.triunfoResultados).toBe(0);
  });

  it('sin influencias es 0', () => {
    expect(calcular(expedienteBase()).componentes.triunfoResultados).toBe(0);
  });
});

describe('índice: competencia', () => {
  const conCompetencia = (over: DeepPartial<Expediente>) => calcular(expedienteBase(over)).componentes.competencia;

  it('pregunta hecha 3 + posición + contribución', () => {
    expect(conCompetencia({ preguntaCompetenciaHecha: true, contribucionDiferenciadora: ev('x') })).toBe(10); // nula 5, conf 2
    expect(
      conCompetencia({
        preguntaCompetenciaHecha: true,
        alternativas: [{ tipo: 'proveedor', nombre: null, posicion: 'compartida' }],
        contribucionDiferenciadora: ev('x', 'supuesto'),
      }),
    ).toBe(3 + 3 + 1);
    expect(
      conCompetencia({
        preguntaCompetenciaHecha: false,
        alternativas: [{ tipo: 'proveedor', nombre: null, posicion: 'alternativa' }],
      }),
    ).toBe(1);
  });

  it('sin pregunta ni alternativas ni contribución es 0', () => {
    expect(conCompetencia({})).toBe(0);
  });
});

describe('índice: cliente ideal', () => {
  const conValores = (valores: (number | null)[]) =>
    calcular(
      expedienteBase({
        cuenta: { clienteIdeal: valores.map((v) => (v === null ? ausente : ev(v))) },
      }),
    ).componentes.clienteIdeal;

  it('cliente_ideal: valores [3, 3, 3, null, null] → 8', () => {
    expect(conValores([3, 3, 3, null, null])).toBe(8);
  });

  it('cubre el rango completo de −5 a +5', () => {
    expect(conValores([-5, -5, -5, -5, -5])).toBe(0);
    expect(conValores([5, 5, 5, 5, 5])).toBe(10);
  });

  it('todos null → 0', () => {
    expect(conValores([null, null, null, null, null])).toBe(0);
  });
});

describe('índice: coherencia', () => {
  const exp = expedienteBase();
  const coherencia = (forzar: Partial<Contexto>) => calcularIndice(ctxCon(exp, forzar), []).componentes.coherencia;
  const dif = (resultado: 'al_dia' | 'inflada' | 'rezagada') => ({ resultado, diferencia: resultado === 'inflada' ? 1 : 0 });

  it('lente gerente: etapa + fecha no optimista 5 / optimista 2', () => {
    expect(coherencia({ lente: 'gerente', comparacion: dif('al_dia'), fechaOptimista: false })).toBe(10);
    expect(coherencia({ lente: 'gerente', comparacion: dif('al_dia'), fechaOptimista: true })).toBe(7);
    expect(coherencia({ lente: 'gerente', comparacion: dif('rezagada'), fechaOptimista: false })).toBe(9);
    expect(coherencia({ lente: 'gerente', comparacion: dif('inflada'), fechaOptimista: false })).toBe(5);
  });

  it('lente director: usa el veredicto de la prueba de fecha', () => {
    const base = { lente: 'director' as const, comparacion: dif('al_dia') };
    expect(coherencia({ ...base, fecha: fechaConVeredicto('creible') })).toBe(10);
    expect(coherencia({ ...base, fecha: fechaConVeredicto('en_riesgo') })).toBe(7);
    expect(coherencia({ ...base, fecha: fechaConVeredicto('no_cierra_fecha') })).toBe(5);
    expect(coherencia({ ...base, fecha: fechaConVeredicto('no_cierra_periodo') })).toBe(5);
    expect(coherencia({ ...base, fecha: null })).toBe(5);
  });

  it('lente director ignora fechaOptimista', () => {
    expect(coherencia({ lente: 'director', comparacion: dif('al_dia'), fecha: fechaConVeredicto('creible'), fechaOptimista: true })).toBe(10);
  });
});

describe('índice: tope por crítica y semáforo', () => {
  it('tope_por_critica: sin Económico y con lo demás completo → total 40, topado, rojo', () => {
    const exp = expedienteSano({
      influencias: [
        influenciaBase({ personaId: 'c', roles: ['C', 'U'], modo: 'C' }),
        influenciaBase({ personaId: 't', roles: ['T'], modo: 'C' }),
      ],
    });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    const banderas = evaluarBanderas(ctx);
    expect(banderas.filter((b) => b.severidad === 'critica').map((b) => b.id)).toEqual(['sin_economico']);
    const r = calcularIndice(ctx, banderas);
    const sinTope = Object.values(r.componentes).reduce((a, b) => a + b, 0);
    expect(sinTope).toBeGreaterThan(40);
    expect(r.total).toBe(40);
    expect(r.topado).toBe(true);
    expect(r.semaforo).toBe('rojo');
  });

  it('con crítica pero total por debajo del tope no queda topado', () => {
    const r = calcular(expedienteBase());
    expect(r.total).toBeLessThan(CONFIG_DEFAULT.topeConCritica);
    expect(r.topado).toBe(false);
    expect(r.semaforo).toBe('rojo');
  });

  it('el tope usa config.topeConCritica', () => {
    const exp = expedienteSano();
    const ctx = construirContexto(exp, HOY, { ...CONFIG_DEFAULT, topeConCritica: 55 });
    const r = calcularIndice(ctx, [critica]);
    expect(r.total).toBe(55);
    expect(r.topado).toBe(true);
  });

  it('semaforo_ambar: sin críticas y total entre 40 y 69', () => {
    const exp = expedienteSano({
      bant: { authority: ausente, need: ausente, time: ausente }, // solo Budget confirmado: 5
      compellingEvent: { fecha: ausente, dueno: ausente, costoInaccion: ausente },
      cuenta: { clienteIdeal: [null, null, null, null, null].map(() => ausente) },
    });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    const banderas = evaluarBanderas(ctx);
    expect(banderas.some((b) => b.severidad === 'critica')).toBe(false);
    const r = calcularIndice(ctx, banderas);
    expect(r.total).toBe(55);
    expect(r.semaforo).toBe('ambar');
  });

  it('sin críticas y total < umbralRojo es rojo', () => {
    const exp = expedienteBase({
      influencias: [influenciaBase({ roles: ['E'] })],
      bant: { budget: ev('b') },
    });
    const ctx = construirContexto(exp, HOY, CONFIG_DEFAULT);
    const banderas = evaluarBanderas(ctx);
    expect(banderas.some((b) => b.severidad === 'critica')).toBe(false);
    const r = calcularIndice(ctx, banderas);
    expect(r.total).toBeLessThan(CONFIG_DEFAULT.umbralRojo);
    expect(r.semaforo).toBe('rojo');
  });

  it('los umbrales son inclusivos para verde y exclusivos para rojo', () => {
    const exp = expedienteSano();
    const conUmbrales = (umbralVerde: number, umbralRojo: number) =>
      calcularIndice(construirContexto(exp, HOY, { ...CONFIG_DEFAULT, umbralVerde, umbralRojo }), []).semaforo;
    expect(conUmbrales(100, 40)).toBe('verde');
    expect(conUmbrales(101, 40)).toBe('ambar');
    expect(conUmbrales(101, 100)).toBe('ambar');
    expect(conUmbrales(101, 101)).toBe('rojo');
  });

  it('con una crítica nunca es verde ni ámbar', () => {
    const r = calcularIndice(construirContexto(expedienteSano(), HOY, { ...CONFIG_DEFAULT, topeConCritica: 100 }), [critica]);
    expect(r.total).toBe(100);
    expect(r.topado).toBe(false);
    expect(r.semaforo).toBe('rojo');
  });
});

describe('índice: pesos configurables', () => {
  it('pesos_configurables: con pesos.bant = 40 y BANT completo → componente bant = 40', () => {
    const r = calcular(expedienteSano(), configConPesos({ bant: 40 }));
    expect(r.componentes.bant).toBe(40);
  });

  it('escala proporcionalmente cada componente y recorta el total a 100', () => {
    const r = calcular(expedienteSano(), configConPesos({ bant: 40 }));
    expect(r.total).toBe(100);
    const r2 = calcular(expedienteSano(), configConPesos({ bant: 10, coherencia: 5 }));
    expect(r2.componentes.bant).toBe(10);
    expect(r2.componentes.coherencia).toBe(5);
    expect(r2.total).toBe(85);
  });

  it('los componentes quedan sin redondear', () => {
    const exp = expedienteSano({
      influencias: [
        influenciaBase({ personaId: 'a', grado: 'A' }),
        influenciaBase({ personaId: 'm', grado: 'M', trDeclaracion: null }),
      ],
    });
    const r = calcular(exp, configConPesos({ triunfoResultados: 7 }));
    expect(r.componentes.triunfoResultados).toBeCloseTo((2 / 3) * 7, 10);
    expect(Number.isInteger(r.componentes.triunfoResultados)).toBe(false);
  });
});

describe('índice con valores de lista desconocidos (I1)', () => {
  it('una errata en nivel, grado, posición o ruta no produce NaN', () => {
    const exp = expedienteSano({
      bant: { budget: { valor: 'b', nivel: 'confirmdo' as never } },
      compellingEvent: { fecha: { valor: '2026-12-15', nivel: 'x' as never } },
      contribucionDiferenciadora: { valor: 'd', nivel: 'x' as never },
      influencias: [influenciaBase({ grado: 'Z' as never }), influenciaBase({ personaId: 'b', grado: 'a' as never, roles: ['C'] })],
      alternativas: [{ tipo: 'proveedor', nombre: 'X', posicion: 'fuerte' as never }],
    });
    const r = calcular(exp);
    expect(Number.isFinite(r.total)).toBe(true);
    for (const v of Object.values(r.componentes)) expect(Number.isFinite(v)).toBe(true);
  });

  it('un valor de cliente ideal que no es número no produce NaN', () => {
    const exp = expedienteSano({ cuenta: { clienteIdeal: [{ valor: 'tres' as never, nivel: 'confirmado' }] } });
    expect(Number.isFinite(calcular(exp).total)).toBe(true);
  });
});
