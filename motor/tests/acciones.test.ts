import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { validarAcciones } from '../src/acciones.js';
import type { AccionPropuesta, Bandera, Fortaleza } from '../src/tipos.js';

const HOY = '2026-11-02';

const banderas: Bandera[] = [
  { id: 'tr_no_redactado', severidad: 'media', texto: 'm' },
  { id: 'sin_economico', severidad: 'critica', texto: 'c' },
  { id: 'bant_supuesto', severidad: 'alta', texto: 'a' },
];
const fortalezas: Fortaleza[] = [{ id: 'coach_fuerte', texto: 'f' }];

const accion = (over: Partial<AccionPropuesta> = {}): AccionPropuesta => ({
  que: 'Hacer algo', quien: 'George', cuando: '2026-11-10', atiende: 'sin_economico', ...over,
});

describe('validarAcciones', () => {
  it('acepta una acción válida', () => {
    const r = validarAcciones([accion()], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas).toEqual([accion()]);
    expect(r.rechazadas).toEqual([]);
  });

  it('rechaza una acción que atiende un id inexistente', () => {
    const a = accion({ atiende: 'inventado' });
    const r = validarAcciones([a], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas).toEqual([]);
    expect(r.rechazadas).toEqual([{ accion: a, motivo: 'no_atiende_bandera_ni_fortaleza' }]);
  });

  it('acepta una acción que atiende una fortaleza', () => {
    const a = accion({ atiende: 'coach_fuerte' });
    expect(validarAcciones([a], banderas, fortalezas, HOY, CONFIG_DEFAULT).aceptadas).toEqual([a]);
  });

  it('rechaza quien vacío o en blanco', () => {
    const a = accion({ quien: '' });
    const b = accion({ quien: '   ' });
    const r = validarAcciones([a, b], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.rechazadas).toEqual([
      { accion: a, motivo: 'sin_responsable' },
      { accion: b, motivo: 'sin_responsable' },
    ]);
  });

  it('rechaza cuando fuera del horizonte: pasado o más allá de hoy + 30 días', () => {
    const pasado = accion({ cuando: '2026-11-01' });
    const lejos = accion({ cuando: '2026-12-17' }); // hoy + 45
    const r = validarAcciones([pasado, lejos], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas).toEqual([]);
    expect(r.rechazadas.map((x) => x.motivo)).toEqual(['fuera_de_horizonte', 'fuera_de_horizonte']);
  });

  it('los bordes del horizonte son válidos: hoy y hoy + 30', () => {
    const hoy = accion({ cuando: HOY });
    const fin = accion({ cuando: '2026-12-02' });
    const pasado = accion({ cuando: '2026-12-03' });
    const r = validarAcciones([hoy, fin, pasado], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas).toEqual([hoy, fin]);
    expect(r.rechazadas).toEqual([{ accion: pasado, motivo: 'fuera_de_horizonte' }]);
  });

  it('el orden de revisión es atiende, quien y cuando', () => {
    const a = accion({ atiende: 'inventado', quien: '', cuando: '2020-01-01' });
    expect(validarAcciones([a], banderas, fortalezas, HOY, CONFIG_DEFAULT).rechazadas[0]?.motivo)
      .toBe('no_atiende_bandera_ni_fortaleza');
    const b = accion({ quien: '', cuando: '2020-01-01' });
    expect(validarAcciones([b], banderas, fortalezas, HOY, CONFIG_DEFAULT).rechazadas[0]?.motivo).toBe('sin_responsable');
  });

  it('ordena por severidad: críticas, altas, medias y al final fortalezas', () => {
    const f = accion({ que: 'f', atiende: 'coach_fuerte' });
    const m = accion({ que: 'm', atiende: 'tr_no_redactado' });
    const al = accion({ que: 'a', atiende: 'bant_supuesto' });
    const c = accion({ que: 'c', atiende: 'sin_economico' });
    const r = validarAcciones([f, m, al, c], banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas.map((x) => x.que)).toEqual(['c', 'a', 'm', 'f']);
  });

  it('es estable entre acciones de la misma severidad', () => {
    const a1 = accion({ que: '1' });
    const a2 = accion({ que: '2' });
    const a3 = accion({ que: '3' });
    expect(validarAcciones([a1, a2, a3], banderas, fortalezas, HOY, CONFIG_DEFAULT).aceptadas.map((x) => x.que))
      .toEqual(['1', '2', '3']);
  });

  it('7 válidas -> 5 aceptadas y 2 excede_maximo (se cortan las de menor severidad)', () => {
    const propuestas = [
      accion({ que: 'f1', atiende: 'coach_fuerte' }),
      accion({ que: 'f2', atiende: 'coach_fuerte' }),
      accion({ que: 'm1', atiende: 'tr_no_redactado' }),
      accion({ que: 'a1', atiende: 'bant_supuesto' }),
      accion({ que: 'c1', atiende: 'sin_economico' }),
      accion({ que: 'c2', atiende: 'sin_economico' }),
      accion({ que: 'a2', atiende: 'bant_supuesto' }),
    ];
    const r = validarAcciones(propuestas, banderas, fortalezas, HOY, CONFIG_DEFAULT);
    expect(r.aceptadas.map((x) => x.que)).toEqual(['c1', 'c2', 'a1', 'a2', 'm1']);
    expect(r.rechazadas.map((x) => [x.accion.que, x.motivo])).toEqual([
      ['f1', 'excede_maximo'], ['f2', 'excede_maximo'],
    ]);
  });
});
