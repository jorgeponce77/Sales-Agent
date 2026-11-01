import { describe, expect, it } from 'vitest';
import { validarExpediente } from '../src/validar.js';
import type { Evidencia, Influencia } from '../src/tipos.js';
import { expedienteBase } from './fabrica.js';

const influencia = (calificacion: number | null): Influencia => ({
  personaId: 'p1', nombre: 'Persona Uno', roles: ['E'],
  grado: 'A', modo: 'C', calificacion,
  contactada: true, nuevaEnPuesto: false, trDeclaracion: null, prioridad: null,
});

const clienteIdealCon = (indice: number, valor: number): Evidencia<number>[] =>
  [0, 1, 2, 3, 4].map((i) =>
    i === indice ? { valor, nivel: 'confirmado' as const } : { valor: null, nivel: 'ausente' as const });

describe('validarExpediente', () => {
  it('calificacion_cero_es_invalida', () => {
    const errores = validarExpediente(expedienteBase({ influencias: [influencia(0)] }));
    expect(errores.map((e) => e.campo)).toContain('influencias[0].calificacion');
  });

  it('calificacion_fuera_de_rango', () => {
    const errores = validarExpediente(expedienteBase({ influencias: [influencia(-7)] }));
    expect(errores.map((e) => e.campo)).toContain('influencias[0].calificacion');
  });

  it('calificaciones_validas_no_generan_error', () => {
    const exp = expedienteBase({
      influencias: [-5, -1, 1, 5, null].map(influencia),
    });
    expect(validarExpediente(exp)).toEqual([]);
  });

  it('cliente_ideal_fuera_de_rango', () => {
    const exp = expedienteBase({ cuenta: { clienteIdeal: clienteIdealCon(2, 6) } });
    const errores = validarExpediente(exp);
    expect(errores.map((e) => e.campo)).toContain('cuenta.clienteIdeal[2].valor');
  });

  it('cliente_ideal_acepta_los_extremos', () => {
    const exp = expedienteBase({ cuenta: { clienteIdeal: clienteIdealCon(0, -5) } });
    expect(validarExpediente(exp)).toEqual([]);
  });

  it('fecha_mal_formada', () => {
    const errores = validarExpediente(expedienteBase({ fechaCierreCRM: '31/12/2026' }));
    expect(errores.map((e) => e.campo)).toContain('fechaCierreCRM');
  });

  it('fecha_inexistente_en_calendario', () => {
    const errores = validarExpediente(expedienteBase({ fechaCierreCRM: '2026-02-30' }));
    expect(errores.map((e) => e.campo)).toContain('fechaCierreCRM');
  });

  it('fecha_dentro_de_una_evidencia_mal_formada', () => {
    const exp = expedienteBase({
      compellingEvent: { fecha: { valor: '15-12-2026', nivel: 'supuesto' } },
    });
    expect(validarExpediente(exp).map((e) => e.campo)).toContain('compellingEvent.fecha.valor');
  });

  it('expediente_base_es_valido', () => {
    expect(validarExpediente(expedienteBase())).toEqual([]);
  });

  describe('valores de lista (I1)', () => {
    /** Aplica `mutar` a un expediente válido y devuelve los campos con error. */
    const camposConError = (mutar: (e: Record<string, any>) => void): string[] => {
      const exp = structuredClone(expedienteBase({
        influencias: [{ ...influencia(3), prioridad: 'activa' }],
        alternativas: [{ tipo: 'proveedor', nombre: 'X', posicion: 'dominante' }],
        criteriosArgano: [{ clave: 'fuente_creible', nivel: 'confirmado' }],
      })) as unknown as Record<string, any>;
      mutar(exp);
      return validarExpediente(exp as never).map((x) => x.campo);
    };

    it('el expediente con todos los valores de lista correctos no da errores', () => {
      expect(camposConError(() => {})).toEqual([]);
    });

    it.each([
      ['nivel de evidencia (bant)', (e: any) => { e.bant.budget.nivel = 'confirmdo'; }, 'bant.budget.nivel'],
      ['nivel de evidencia (clienteIdeal)', (e: any) => { e.cuenta.clienteIdeal[1].nivel = 'x'; }, 'cuenta.clienteIdeal[1].nivel'],
      ['nivel de evidencia (compellingEvent)', (e: any) => { e.compellingEvent.dueno.nivel = 'alto'; }, 'compellingEvent.dueno.nivel'],
      ['nivel de criterio Argano', (e: any) => { e.criteriosArgano[0].nivel = 'si'; }, 'criteriosArgano[0].nivel'],
      ['modo de influencia', (e: any) => { e.influencias[0].modo = 'X'; }, 'influencias[0].modo'],
      ['grado de influencia', (e: any) => { e.influencias[0].grado = 'a'; }, 'influencias[0].grado'],
      ['rol de influencia', (e: any) => { e.influencias[0].roles = ['E', 'Z']; }, 'influencias[0].roles[1]'],
      ['roles que no es lista', (e: any) => { e.influencias[0].roles = 'E'; }, 'influencias[0].roles'],
      ['prioridad de influencia', (e: any) => { e.influencias[0].prioridad = 'alta'; }, 'influencias[0].prioridad'],
      ['valor de prioridad', (e: any) => { e.prioridad.valor = 'alta'; }, 'prioridad.valor'],
      ['sensación', (e: any) => { e.sensacion = 'contento'; }, 'sensacion'],
      ['tipo de alternativa', (e: any) => { e.alternativas[0].tipo = 'otro'; }, 'alternativas[0].tipo'],
      ['posición de alternativa', (e: any) => { e.alternativas[0].posicion = 'fuerte'; }, 'alternativas[0].posicion'],
      ['ruta de cadena', (e: any) => { e.cadena.ruta = 'OC'; }, 'cadena.ruta'],
      ['línea', (e: any) => { e.lineas = ['WMS', 'ERP']; }, 'lineas[1]'],
      ['etapa fuera de rango', (e: any) => { e.etapaCRM = 6; }, 'etapaCRM'],
      ['etapa no entera', (e: any) => { e.etapaCRM = 2.5; }, 'etapaCRM'],
    ])('rechaza %s inválido', (_nombre, mutar, campo) => {
      expect(camposConError(mutar)).toContain(campo);
    });

    it('acepta los valores null permitidos', () => {
      expect(camposConError((e) => {
        e.sensacion = null;
        e.influencias[0].modo = null;
        e.influencias[0].grado = null;
        e.influencias[0].prioridad = null;
        e.alternativas[0].posicion = null;
      })).toEqual([]);
    });

    it('el mensaje de error está en español y nombra los valores válidos', () => {
      const exp = expedienteBase({ cadena: { ruta: 'OC' as never } });
      const err = validarExpediente(exp).find((x) => x.campo === 'cadena.ruta');
      expect(err?.mensaje).toContain('debe ser uno de');
      expect(err?.mensaje).toContain('ambas_independientes');
    });
  });

  describe('nunca lanza (I1)', () => {
    it('elementos nulos en las listas se reportan como errores', () => {
      const exp = expedienteBase() as any;
      exp.influencias = [null];
      exp.alternativas = [null];
      exp.accionesPrevias = [null];
      exp.cuenta.clienteIdeal = [null];
      exp.criteriosArgano = [null];
      exp.lineas = [null];
      let campos: string[] = [];
      expect(() => { campos = validarExpediente(exp).map((x) => x.campo); }).not.toThrow();
      expect(campos).toEqual(expect.arrayContaining([
        'influencias[0]', 'alternativas[0]', 'accionesPrevias[0]',
        'cuenta.clienteIdeal[0]', 'criteriosArgano[0]', 'lineas[0]',
      ]));
    });

    it.each(['cuenta', 'bant', 'compellingEvent', 'cadena', 'prioridad', 'contribucionDiferenciadora',
      'reorganizacion', 'influencias', 'alternativas', 'lineas', 'accionesPrevias', 'criteriosArgano'])(
      'falta el bloque %s: error, no excepción', (bloque) => {
        const exp = expedienteBase() as any;
        delete exp[bloque];
        let campos: string[] = [];
        expect(() => { campos = validarExpediente(exp).map((x) => x.campo); }).not.toThrow();
        expect(campos).toContain(bloque);
      });

    it('falta cadena.pasos y bant.budget: error, no excepción', () => {
      const exp = expedienteBase() as any;
      delete exp.cadena.pasos;
      delete exp.bant.budget;
      const campos = validarExpediente(exp).map((x) => x.campo);
      expect(campos).toEqual(expect.arrayContaining(['cadena.pasos', 'bant.budget']));
    });

    it('expediente null o undefined: un error, no excepción', () => {
      expect(validarExpediente(null as never).map((x) => x.campo)).toEqual(['expediente']);
      expect(validarExpediente(undefined as never).map((x) => x.campo)).toEqual(['expediente']);
    });
  });
});
