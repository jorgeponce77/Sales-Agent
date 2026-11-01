import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';
import { construirContexto } from '../src/contexto.js';
import { motivosAnalisisCompleto } from '../src/analisisCompleto.js';
import { huecosPriorizados } from '../src/huecos.js';
import type { Bandera, Config, Expediente } from '../src/tipos.js';
import { expedienteBase, influenciaBase, type DeepPartial } from './fabrica.js';

const HOY = '2026-11-02';

const bandera = (id: string, severidad: Bandera['severidad']): Bandera => ({ id, severidad, texto: `texto ${id}` });

function ctxDe(over: DeepPartial<Expediente> = {}, config: Config = CONFIG_DEFAULT) {
  return construirContexto(expedienteBase(over), HOY, config);
}

describe('huecosPriorizados', () => {
  it('huecos_criticas_primero: críticas, luego altas, luego medias', () => {
    const ctx = ctxDe();
    const banderas = [bandera('tr_no_redactado', 'media'), bandera('bant_supuesto', 'alta'), bandera('sin_economico', 'critica')];
    const huecos = huecosPriorizados(ctx, banderas);
    expect(huecos.map((h) => h.reglaId)).toEqual(['sin_economico', 'bant_supuesto', 'tr_no_redactado']);
    expect(huecos[0]).toEqual({ reglaId: 'sin_economico', severidad: 'critica', motivo: 'texto sin_economico' });
  });

  it('huecos_excluyen_no_datos: las banderas que no son falta de dato no aparecen', () => {
    const ctx = ctxDe();
    const excluidas = [
      'etapa_inflada_grave', 'etapa_inflada', 'atorada', 'no_cierra_fecha',
      'euforia_con_banderas', 'cierre_despues_ce', 'fecha_optimista',
      // F3: hechos del cliente, no datos por recabar
      'reorganizacion', 'influencia_nueva_puesto', 'ce_urgencia_falsa',
    ];
    const banderas = [...excluidas.map((id) => bandera(id, 'alta')), bandera('sin_economico', 'critica')];
    expect(huecosPriorizados(ctx, banderas).map((h) => h.reglaId)).toEqual(['sin_economico']);
  });

  it('dentro de la misma severidad va primero la regla de la lente activa y luego las de ambas', () => {
    // Etapa 3 -> lente director. economico_sin_cubrir es director; sin_economico es ambas.
    const ctx = ctxDe({ etapaCRM: 3 });
    expect(ctx.lente).toBe('director');
    const banderas = [bandera('sin_economico', 'critica'), bandera('economico_sin_cubrir', 'critica')];
    expect(huecosPriorizados(ctx, banderas).map((h) => h.reglaId)).toEqual(['economico_sin_cubrir', 'sin_economico']);
  });

  it('es estable dentro de la misma severidad y lente', () => {
    const ctx = ctxDe();
    const banderas = [bandera('bant_ausente', 'alta'), bandera('ce_incompleto', 'alta'), bandera('sin_coach_valido', 'alta')];
    expect(huecosPriorizados(ctx, banderas).map((h) => h.reglaId)).toEqual(['bant_ausente', 'ce_incompleto', 'sin_coach_valido']);
  });
});

describe('motivosAnalisisCompleto', () => {
  it('cuenta_heredada con cambio de dueño', () => {
    const ctx = ctxDe({ cambioDeDueno: true });
    expect(motivosAnalisisCompleto(ctx, [])).toContain('cuenta_heredada');
  });

  it('monto_alto: umbral null nunca aplica', () => {
    const ctx = ctxDe({ montoUSD: 1e7 });
    expect(motivosAnalisisCompleto(ctx, [])).not.toContain('monto_alto');
  });

  it('monto_alto: monto sobre el umbral aplica; en el umbral también; bajo el umbral no', () => {
    const config = structuredClone(CONFIG_DEFAULT);
    config.umbralMontoAltoUSD = 500_000;
    expect(motivosAnalisisCompleto(ctxDe({ montoUSD: 1e6 }, config), [])).toContain('monto_alto');
    expect(motivosAnalisisCompleto(ctxDe({ montoUSD: 500_000 }, config), [])).toContain('monto_alto');
    expect(motivosAnalisisCompleto(ctxDe({ montoUSD: 499_999 }, config), [])).not.toContain('monto_alto');
    expect(motivosAnalisisCompleto(ctxDe({ montoUSD: null }, config), [])).not.toContain('monto_alto');
  });

  it('competencia_desconocida cuando no se preguntó por la competencia', () => {
    expect(motivosAnalisisCompleto(ctxDe(), [])).toContain('competencia_desconocida');
    expect(motivosAnalisisCompleto(ctxDe({ preguntaCompetenciaHecha: true }), [])).not.toContain('competencia_desconocida');
  });

  it('competencia_fuerte cuando la posición general es alternativa', () => {
    const ctx = ctxDe({
      preguntaCompetenciaHecha: true,
      alternativas: [{ tipo: 'proveedor', nombre: 'X', posicion: 'alternativa' }],
    });
    expect(motivosAnalisisCompleto(ctx, [])).toContain('competencia_fuerte');
  });

  it('mercado_nuevo y revision_gerente', () => {
    const ctx = ctxDe({ esMercadoNuevo: true, revisionGerenteProxima: true });
    const motivos = motivosAnalisisCompleto(ctx, []);
    expect(motivos).toContain('mercado_nuevo');
    expect(motivos).toContain('revision_gerente');
  });

  it('atorada cuando el contexto la marca como atorada', () => {
    const ctx = { ...ctxDe(), atorada: true };
    expect(motivosAnalisisCompleto(ctx, [])).toContain('atorada');
  });

  it('fecha_vencida: cierre 2026-10-15 con hoy 2026-11-02', () => {
    const ctx = ctxDe({ fechaCierreCRM: '2026-10-15' });
    expect(motivosAnalisisCompleto(ctx, [])).toContain('fecha_vencida');
    expect(motivosAnalisisCompleto(ctxDe({ fechaCierreCRM: HOY }), [])).not.toContain('fecha_vencida');
    expect(motivosAnalisisCompleto(ctxDe({ fechaCierreCRM: null }), [])).not.toContain('fecha_vencida');
  });

  it('falta_info_esencial con una bandera crítica', () => {
    const ctx = ctxDe();
    expect(motivosAnalisisCompleto(ctx, [bandera('sin_economico', 'critica')])).toContain('falta_info_esencial');
    expect(motivosAnalisisCompleto(ctx, [bandera('bant_ausente', 'alta')])).not.toContain('falta_info_esencial');
  });

  it('conserva el orden del brief', () => {
    const config = structuredClone(CONFIG_DEFAULT);
    config.umbralMontoAltoUSD = 1;
    const ctx = {
      ...ctxDe({
        cambioDeDueno: true, montoUSD: 10, esMercadoNuevo: true, revisionGerenteProxima: true,
        fechaCierreCRM: '2026-10-15', influencias: [influenciaBase()],
      }, config),
      atorada: true,
    };
    expect(motivosAnalisisCompleto(ctx, [bandera('sin_economico', 'critica')])).toEqual([
      'cuenta_heredada', 'monto_alto', 'competencia_desconocida', 'mercado_nuevo',
      'atorada', 'fecha_vencida', 'revision_gerente', 'falta_info_esencial',
    ]);
  });
});
