import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { calcularDiagnostico } from '../src/diagnostico.js';
import type { Evidencia, Nivel } from '../src/tipos.js';
import { expedienteBase, influenciaBase } from './fabrica.js';

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
      influencias: [influenciaBase({ roles: ['U'], modo: 'C' })],
      bant: { budget: ev('b'), authority: ev('a'), need: ev('n'), time: ev('t') },
      compellingEvent: { fecha: ev('2026-12-15'), dueno: ev('D'), costoInaccion: ev('C') },
    });
    const d = calcularDiagnostico(exp, HOY);
    expect(d.cerrada).toBe(true);
    // Una oportunidad cerrada no lleva señales de pronóstico (ruling F1).
    expect(d.etapaRecomendada).toBe(5);
    expect(d.comparacionEtapa).toBe('al_dia');
    expect(d.probabilidadDeclarada).toBe(100);
    expect(d.probabilidadAjustada).toBe(100);
    expect(d.fecha).toBeNull();
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
    // Sin criterios de Argano confirmados la etapa recomendada es 0: ENxT[0] = 0 y el CRM está inflado.
    expect(d.etapaRecomendada).toBe(0);
    expect(d.probabilidadAjustada).toBe(0);
    expect(d.comparacionEtapa).toBe('inflada');
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

  describe('fechas de cierre inválidas (C1)', () => {
    const director = (fechaCierreCRM: string) => expedienteBase({
      etapaCRM: 3,
      fechaCierreCRM,
      cadena: { ruta: 'contrato', pasos: { aElegido: true } },
    });

    it.each(['TBD', '31/12/2026', '2026-02-30', ''])('fechaCierreCRM %j no cuelga ni da creíble: no_cierra_fecha', (malo) => {
      const exp = director(malo);
      const antes = Date.now();
      const d = calcularDiagnostico(exp, HOY);
      expect(Date.now() - antes).toBeLessThan(1000);
      expect(d.fecha?.veredicto).toBe('no_cierra_fecha');
      expect(exp.fechaCierreCRM).toBe(malo); // no se muta el expediente del llamador
    });

    it('fechaCreacion inválida: no está atorada y no lanza', () => {
      const exp = expedienteBase({ fechaCreacion: 'ayer' });
      const d = calcularDiagnostico(exp, HOY);
      expect(d.atorada).toBe(false);
      expect(exp.fechaCreacion).toBe('ayer');
    });
  });
});
