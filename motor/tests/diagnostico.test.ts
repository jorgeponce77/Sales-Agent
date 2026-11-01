import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { calcularDiagnostico } from '../src/diagnostico.js';
import type { Evidencia, Nivel } from '../src/tipos.js';
import { expedienteBase } from './fabrica.js';

const ev = <T>(valor: T, nivel: Nivel = 'confirmado'): Evidencia<T> => ({ valor, nivel });

const HOY = '2026-11-02';

describe('calcularDiagnostico', () => {
  it('diagnostico_expediente_vacio: no lanza y marca los huecos', () => {
    const exp = expedienteBase();
    expect(() => calcularDiagnostico(exp, HOY)).not.toThrow();
    const d = calcularDiagnostico(exp, HOY);
    expect(d.cerrada).toBe(false);
    expect(d.etapaCRM).toBe(0);
    expect(d.etapaRecomendada).toBe(0);
    expect(d.lente).toBe('gerente');
    const ids = d.banderas.map((b) => b.id);
    expect(ids).toContain('sin_economico');
    expect(ids).toContain('budget_ausente');
    expect(d.indice.semaforo).toBe('rojo');
    expect(d.huecos.map((h) => h.reglaId)).toContain('sin_economico');
    expect(d.analisisCompleto).toContain('falta_info_esencial');
  });

  it('diagnostico_cerrada: etapa 5 con entregable -> cerrada, sin banderas/huecos/análisis ni tope', () => {
    // Sin influencia económica (bandera crítica si se evaluara), pero con BANT y CE completos:
    // el índice sin tope supera el tope de 40, así que un índice con banderas quedaría topado.
    const exp = expedienteBase({
      etapaCRM: 5,
      cadena: { pasos: { hOC: true } },
      bant: { budget: ev('b'), authority: ev('a'), need: ev('n'), time: ev('t') },
      compellingEvent: { fecha: ev('2026-12-15'), dueno: ev('D'), costoInaccion: ev('C') },
    });
    const d = calcularDiagnostico(exp, HOY);
    expect(d.cerrada).toBe(true);
    expect(d.banderas).toEqual([]);
    expect(d.huecos).toEqual([]);
    expect(d.analisisCompleto).toEqual([]);
    expect(d.indice.topado).toBe(false);
    expect(d.indice.total).toBeGreaterThan(CONFIG_DEFAULT.topeConCritica);
    // La misma oportunidad sin cerrar sí queda topada por la crítica.
    const abierta = calcularDiagnostico({ ...exp, etapaCRM: 4 }, HOY);
    expect(abierta.banderas.some((b) => b.severidad === 'critica')).toBe(true);
    expect(abierta.indice.total).toBeLessThanOrEqual(CONFIG_DEFAULT.topeConCritica);
  });

  it('etapa 5 sin entregable de cierre no es cerrada', () => {
    const d = calcularDiagnostico(expedienteBase({ etapaCRM: 5 }), HOY);
    expect(d.cerrada).toBe(false);
    expect(d.banderas.length).toBeGreaterThan(0);
  });

  it('diagnostico_ejemplo_completo: WMS etapa 3, ENxT, ruta contrato, pendientes c, d, e', () => {
    const exp = expedienteBase({
      etapaCRM: 3,
      cuenta: { esClienteOtraTowerArgano: true },
      cadena: { ruta: 'contrato', pasos: { aElegido: true, bContratoEnviado: true } },
    });
    const d = calcularDiagnostico(exp, HOY);
    expect(d.tipo).toBe('ENxT');
    expect(d.probabilidadDeclarada).toBe(65);
    expect(d.lente).toBe('director');
    expect(d.fecha?.diasPendientes).toBe(15);
    expect(d.probabilidadAjustada).toBe(CONFIG_DEFAULT.probabilidades.ENxT[d.etapaRecomendada]);
    expect(d.comparacionEtapa).toBe(d.etapaCRM > d.etapaRecomendada ? 'inflada' : d.etapaCRM < d.etapaRecomendada ? 'rezagada' : 'al_dia');
  });

  it('con lente gerente fecha es null y fechaOptimista viene del contexto', () => {
    const d = calcularDiagnostico(expedienteBase(), HOY);
    expect(d.fecha).toBeNull();
    expect(d.fechaOptimista).toBe(false);
  });

  it('usa CONFIG_DEFAULT por omisión y acepta otra configuración', () => {
    const config = structuredClone(CONFIG_DEFAULT);
    config.probabilidades.NN = [1, 2, 3, 4, 5, 6];
    const d = calcularDiagnostico(expedienteBase({ etapaCRM: 2 }), HOY, config);
    expect(d.probabilidadDeclarada).toBe(3);
  });
});
