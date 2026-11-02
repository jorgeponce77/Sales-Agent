import { describe, expect, it } from 'vitest';
import {
  CATALOGO_FORTALEZAS_IDS,
  CATALOGO_REGLAS,
  calcularDiagnostico,
  construirContexto,
  CONFIG_DEFAULT,
  evaluarBanderas,
  diasHabilesEntre,
  esHabil,
  evaluarFortalezas,
  finDeTrimestre,
  sumarDiasHabiles,
  sumarDiasNaturales,
  type Contexto,
} from '../src/index.js';
import { REGLAS_FORTALEZAS } from '../src/reglas/index.js';
import { CATALOGO_BANDERAS } from '../src/reglas/index.js';
import { expedienteBase, influenciaBase } from './fabrica.js';

describe('API pública (I4)', () => {
  it('construirContexto + evaluarBanderas/evaluarFortalezas coinciden con calcularDiagnostico', () => {
    const exp = expedienteBase({ influencias: [influenciaBase()] });
    const ctx: Contexto = construirContexto(exp, '2026-11-02', CONFIG_DEFAULT);
    const d = calcularDiagnostico(exp, '2026-11-02');
    expect(evaluarBanderas(ctx)).toEqual(d.banderas);
    expect(evaluarFortalezas(ctx)).toEqual(d.fortalezas);
  });

  it('CATALOGO_REGLAS lista id, severidad y lente de cada bandera, en el orden del catálogo', () => {
    expect(CATALOGO_REGLAS.length).toBe(CATALOGO_BANDERAS.length);
    expect(CATALOGO_REGLAS.map((r) => r.id)).toEqual(CATALOGO_BANDERAS.map((r) => r.id));
    for (const r of CATALOGO_REGLAS) {
      expect(Object.keys(r).sort()).toEqual(['id', 'lente', 'severidad']);
      expect(['critica', 'alta', 'media']).toContain(r.severidad);
      expect(['gerente', 'director', 'ambas']).toContain(r.lente);
    }
    const sinEconomico = CATALOGO_REGLAS.find((r) => r.id === 'sin_economico');
    expect(sinEconomico).toEqual({ id: 'sin_economico', severidad: 'critica', lente: 'ambas' });
    const fechaOptimista = CATALOGO_REGLAS.find((r) => r.id === 'fecha_optimista');
    expect(fechaOptimista).toEqual({ id: 'fecha_optimista', severidad: 'media', lente: 'gerente' });
  });

  it('CATALOGO_FORTALEZAS_IDS lista los ids de las fortalezas', () => {
    expect(CATALOGO_FORTALEZAS_IDS).toEqual(REGLAS_FORTALEZAS.map((r) => r.id));
    expect(CATALOGO_FORTALEZAS_IDS.length).toBeGreaterThan(0);
  });

  it('los catálogos son de solo lectura', () => {
    expect(Object.isFrozen(CATALOGO_REGLAS)).toBe(true);
    expect(Object.isFrozen(CATALOGO_REGLAS[0])).toBe(true);
    expect(Object.isFrozen(CATALOGO_FORTALEZAS_IDS)).toBe(true);
    expect(() => { (CATALOGO_REGLAS as unknown as unknown[]).push({}); }).toThrow();
    expect(() => { (CATALOGO_FORTALEZAS_IDS as unknown as string[]).push('x'); }).toThrow();
  });

  it('exporta los ayudantes de fechas para los consumidores del motor (R18)', () => {
    const festivos = CONFIG_DEFAULT.festivos['MX'] ?? [];
    expect(esHabil('2026-11-16', festivos)).toBe(false);
    expect(esHabil('2026-11-17', festivos)).toBe(true);
    expect(sumarDiasNaturales('2026-11-02', 28)).toBe('2026-11-30');
    expect(sumarDiasHabiles('2026-11-13', 1, festivos)).toBe('2026-11-17');
    expect(diasHabilesEntre('2026-11-13', '2026-11-17', festivos)).toBe(1);
    expect(finDeTrimestre('2026-11-02')).toBe('2026-12-31');
  });
});
