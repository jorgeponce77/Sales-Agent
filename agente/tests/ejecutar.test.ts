import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from 'motor-sales-agent';
import { DEFINICIONES_HERRAMIENTAS } from '../src/herramientas/definiciones.js';
import { ejecutarHerramienta } from '../src/herramientas/ejecutar.js';
import { CAMPOS_REGISTRABLES } from '../src/herramientas/registrar.js';
import { estadoBase } from './fabrica.js';

const NOMBRES = [
  'leer_expediente', 'registrar_dato', 'registrar_criterio_argano', 'registrar_influencia',
  'registrar_alternativa', 'actualizar_cadena_cierre', 'actualizar_ficha', 'obtener_huecos_priorizados',
  'calcular_diagnostico', 'proponer_acciones', 'marcar_accion', 'cerrar_sesion',
];

type Esquema = { type?: unknown; enum?: unknown[]; properties?: Record<string, Esquema>; items?: Esquema; required?: string[] };
const esquema = (nombre: string): Esquema => {
  const d = DEFINICIONES_HERRAMIENTAS.find((x) => x.name === nombre);
  expect(d).toBeDefined();
  return d?.input_schema as Esquema;
};

describe('definiciones', () => {
  it('definiciones_completas', () => {
    expect(DEFINICIONES_HERRAMIENTAS).toHaveLength(12);
    const nombres = DEFINICIONES_HERRAMIENTAS.map((d) => d.name);
    expect(new Set(nombres).size).toBe(12);
    expect([...nombres].sort()).toEqual([...NOMBRES].sort());
    for (const d of DEFINICIONES_HERRAMIENTAS) {
      expect(d.input_schema.type).toBe('object');
      expect(d.description.length).toBeGreaterThan(20);
      const r = ejecutarHerramienta(d.name, undefined, estadoBase());
      expect(r).toBeDefined();
      if (!r.ok) expect(r.errores.join(' ')).not.toContain('herramienta desconocida');
    }
  });

  it('enums espejo de los tipos del motor', () => {
    expect(esquema('registrar_dato').properties?.['campo']?.enum).toEqual([...CAMPOS_REGISTRABLES]);
    expect(esquema('registrar_dato').properties?.['nivel']?.enum).toEqual(['confirmado', 'supuesto', 'ausente']);
    expect(esquema('registrar_criterio_argano').properties?.['nivel']?.enum).toEqual(['confirmado', 'supuesto', 'ausente']);
    expect(esquema('registrar_criterio_argano').properties?.['clave']?.enum).toEqual(
      CONFIG_DEFAULT.criteriosArgano.map((c) => c.clave),
    );
    // R6: forma de lote {criterios: [...]} con los mismos enums, de 1 a 30 elementos.
    const lote = esquema('registrar_criterio_argano').properties?.['criterios'] as any;
    expect(lote?.type).toBe('array');
    expect(lote?.minItems).toBe(1);
    expect(lote?.maxItems).toBe(30);
    expect(lote?.items?.properties?.clave?.enum).toEqual(CONFIG_DEFAULT.criteriosArgano.map((c) => c.clave));
    expect(lote?.items?.properties?.nivel?.enum).toEqual(['confirmado', 'supuesto', 'ausente']);
    expect(lote?.items?.properties?.fuente?.type).toBe('string');
    expect(esquema('registrar_criterio_argano').properties?.['fuente']).toBeDefined();
    expect(esquema('registrar_criterio_argano').required ?? []).toEqual([]);
    const inf = esquema('registrar_influencia').properties ?? {};
    expect(inf['roles']?.items?.enum).toEqual(['E', 'U', 'T', 'C']);
    expect(inf['grado']?.enum).toEqual(['A', 'M', 'B', null]);
    expect(inf['modo']?.enum).toEqual(['C', 'P', 'E', 'EC', null]);
    expect(inf['prioridad']?.enum).toEqual(['urgente', 'activa', 'importante', 'postergable', null]);
    const alt = esquema('registrar_alternativa').properties ?? {};
    expect(alt['tipo']?.enum).toEqual(['proveedor', 'interna', 'presupuesto', 'no_hacer_nada']);
    expect(alt['posicion']?.enum).toEqual(['dominante', 'nula', 'compartida', 'alternativa', null]);
    const cad = esquema('actualizar_cadena_cierre').properties ?? {};
    expect(cad['ruta']?.enum).toEqual(['contrato', 'oc', 'ambas_oc_tras_contrato', 'ambas_independientes', 'desconocida']);
    expect(Object.keys(cad['pasos']?.properties ?? {})).toEqual([
      'aElegido', 'bContratoEnviado', 'cComentariosRecibidos', 'dEnFirma', 'eFirmado', 'fAltaProveedor', 'hOC',
    ]);
    expect(esquema('marcar_accion').properties?.['estado']?.enum).toEqual(['cumplida', 'no_cumplida']);
    expect(esquema('actualizar_ficha').properties?.['campo']?.enum).toEqual(['etapaCRM', 'fechaCierreCRM', 'tcv', 'moneda']);
    expect(esquema('proponer_acciones').required).toEqual(['acciones']);
  });
});

describe('ejecutarHerramienta', () => {
  it('dispatcher_desconocida', () => {
    const e = estadoBase();
    const r = ejecutarHerramienta('borrar_todo', {}, e);
    expect(r).toEqual({ ok: false, errores: ['herramienta desconocida: borrar_todo'] });
    for (const n of ['toString', 'constructor', '__proto__']) expect(ejecutarHerramienta(n, {}, e).ok).toBe(false);
  });

  it('dispatcher_no_lanza', () => {
    for (const nombre of NOMBRES) {
      for (const input of [undefined, null, 5, 'x', [], {}, { campo: {} }]) {
        const e = estadoBase();
        expect(() => ejecutarHerramienta(nombre, input, e)).not.toThrow();
      }
    }
  });

  it('despacha a la herramienta correcta', () => {
    const e = estadoBase();
    const r = ejecutarHerramienta('registrar_dato', { campo: 'esMercadoNuevo', valor: true }, e);
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.esMercadoNuevo).toBe(true);
    expect(ejecutarHerramienta('cerrar_sesion', { resumen: 'listo' }, e).ok).toBe(true);
    expect(e.sesionCerrada).toEqual({ resumen: 'listo' });
  });

  it('no lanza aunque el estado esté roto', () => {
    const roto = { hoy: '2026-11-02' } as unknown as Parameters<typeof ejecutarHerramienta>[2];
    for (const nombre of NOMBRES) expect(() => ejecutarHerramienta(nombre, {}, roto)).not.toThrow();
  });
});
