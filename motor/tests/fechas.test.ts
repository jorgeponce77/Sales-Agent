import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import {
  diasHabilesEntre,
  diasNaturalesEntre,
  esHabil,
  finDeTrimestre,
  sumarDiasHabiles,
  sumarDiasNaturales,
} from '../src/fechas.js';

const MX = CONFIG_DEFAULT.festivos['MX'] ?? [];

describe('esHabil', () => {
  it('festivo no es hábil', () => {
    expect(esHabil('2026-11-16', MX)).toBe(false);
  });
  it('sábado y domingo no son hábiles', () => {
    expect(esHabil('2026-11-14', MX)).toBe(false);
    expect(esHabil('2026-11-15', MX)).toBe(false);
  });
  it('lunes normal es hábil', () => {
    expect(esHabil('2026-11-02', MX)).toBe(true);
  });
});

describe('sumarDiasHabiles', () => {
  it('21 días hábiles saltando el festivo del 16-nov', () => {
    expect(sumarDiasHabiles('2026-11-02', 21, MX)).toBe('2026-12-02');
  });
  it('viernes + 1 = lunes', () => {
    expect(sumarDiasHabiles('2026-10-30', 1, MX)).toBe('2026-11-02');
  });
  it('salta el 1-ene al cruzar de año', () => {
    expect(sumarDiasHabiles('2026-12-28', 5, MX)).toBe('2027-01-05');
  });
  it('dias = 0 devuelve desde sin cambios, aunque sea fin de semana o festivo', () => {
    expect(sumarDiasHabiles('2026-11-14', 0, MX)).toBe('2026-11-14');
    expect(sumarDiasHabiles('2026-11-16', 0, MX)).toBe('2026-11-16');
  });
  it('desde en fin de semana cuenta a partir del día siguiente', () => {
    expect(sumarDiasHabiles('2026-11-14', 1, MX)).toBe('2026-11-17');
  });
});

describe('diasHabilesEntre', () => {
  it('lunes a lunes siguiente = 5', () => {
    expect(diasHabilesEntre('2026-11-02', '2026-11-09', MX)).toBe(5);
  });
  it('excluye festivos', () => {
    expect(diasHabilesEntre('2026-11-13', '2026-11-17', MX)).toBe(1);
  });
  it('b igual a a devuelve 0', () => {
    expect(diasHabilesEntre('2026-11-02', '2026-11-02', MX)).toBe(0);
  });
  it('b anterior a a devuelve 0, nunca negativo', () => {
    expect(diasHabilesEntre('2026-11-09', '2026-11-02', MX)).toBe(0);
  });
  it('es consistente con sumarDiasHabiles', () => {
    const fin = sumarDiasHabiles('2026-11-02', 21, MX);
    expect(diasHabilesEntre('2026-11-02', fin, MX)).toBe(21);
  });
});

describe('días naturales', () => {
  it('suma cruzando mes y año', () => {
    expect(sumarDiasNaturales('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('suma negativa resta', () => {
    expect(sumarDiasNaturales('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('maneja año bisiesto', () => {
    expect(sumarDiasNaturales('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('diasNaturalesEntre es b - a, con signo', () => {
    expect(diasNaturalesEntre('2026-11-01', '2026-12-01')).toBe(30);
    expect(diasNaturalesEntre('2026-12-01', '2026-11-01')).toBe(-30);
    expect(diasNaturalesEntre('2026-11-01', '2026-11-01')).toBe(0);
  });
});

describe('finDeTrimestre', () => {
  it('trimestre en curso', () => {
    expect(finDeTrimestre('2026-11-01')).toBe('2026-12-31');
    expect(finDeTrimestre('2026-12-28')).toBe('2026-12-31');
    expect(finDeTrimestre('2027-01-05')).toBe('2027-03-31');
  });
  it('último día del trimestre devuelve el mismo día', () => {
    expect(finDeTrimestre('2026-06-30')).toBe('2026-06-30');
  });
  it('trimestres 2 y 3', () => {
    expect(finDeTrimestre('2026-04-01')).toBe('2026-06-30');
    expect(finDeTrimestre('2026-08-15')).toBe('2026-09-30');
  });
});

describe('fechas inválidas (C1)', () => {
  it('diasHabilesEntre devuelve 0 si alguna fecha es inválida, sin colgarse', () => {
    expect(diasHabilesEntre('2026-11-02', 'TBD', MX)).toBe(0);
    expect(diasHabilesEntre('TBD', '2026-11-09', MX)).toBe(0);
    expect(diasHabilesEntre('2026-11-02', '31/12/2026', MX)).toBe(0);
    expect(diasHabilesEntre('2026-11-02', '2026-02-30', MX)).toBe(0);
  });
  it('sumarDiasHabiles devuelve desde sin cambios si desde es inválida', () => {
    expect(sumarDiasHabiles('TBD', 5, MX)).toBe('TBD');
  });
  it('sumarDiasHabiles devuelve desde sin cambios si dias no es un número finito >= 0', () => {
    expect(sumarDiasHabiles('2026-11-02', Number.NaN, MX)).toBe('2026-11-02');
    expect(sumarDiasHabiles('2026-11-02', Number.POSITIVE_INFINITY, MX)).toBe('2026-11-02');
    expect(sumarDiasHabiles('2026-11-02', -3, MX)).toBe('2026-11-02');
  });
});
