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
});
