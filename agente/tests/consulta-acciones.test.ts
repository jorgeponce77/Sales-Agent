import { describe, expect, it } from 'vitest';
import { calcularDiagnostico } from 'motor-sales-agent';
import { calcularDiagnosticoHerramienta, leerExpediente, obtenerHuecos } from '../src/herramientas/consulta.js';
import type { HuecoConDeQuien } from '../src/herramientas/consulta.js';
import { cerrarSesion, marcarAccion, proponerAcciones } from '../src/herramientas/acciones.js';
import { deQuien } from '../src/herramientas/deQuien.js';
import { registrarInfluencia } from '../src/herramientas/registrar.js';
import { estadoBase } from './fabrica.js';

const errores = (r: { ok: boolean; errores?: string[] }): string[] => (r.ok ? [] : (r.errores ?? []));
const datos = <T>(r: { ok: boolean; datos?: unknown }): T => {
  expect(r.ok).toBe(true);
  return r.datos as T;
};

describe('leer_expediente', () => {
  it('devuelve ficha, expediente y acciones abiertas con su índice', () => {
    const e = estadoBase();
    e.oportunidad.expediente.accionesPrevias = [
      { que: 'a', quien: 'Ana', cuando: '2026-11-05', atiende: 'sin_economico', estado: 'cumplida' },
      { que: 'b', quien: 'Beto', cuando: '2026-11-06', atiende: 'sin_economico', estado: 'abierta' },
    ];
    const d = datos<{ ficha: unknown; expediente: unknown; accionesAbiertas: unknown[] }>(leerExpediente(e, undefined));
    expect(d.ficha).toEqual(e.oportunidad.ficha);
    expect(d.expediente).toEqual(e.oportunidad.expediente);
    expect(d.accionesAbiertas).toEqual([
      { indice: 1, que: 'b', quien: 'Beto', cuando: '2026-11-06', atiende: 'sin_economico' },
    ]);
  });
});

describe('obtener_huecos_priorizados', () => {
  it('huecos_con_de_quien', () => {
    const e = estadoBase();
    registrarInfluencia(e, { nombre: 'Ana Ruiz', roles: ['E'], grado: 'A' });
    const huecos = datos<HuecoConDeQuien[]>(obtenerHuecos(e, {}));
    const h = huecos.find((x) => x.reglaId === 'budget_ausente');
    expect(h).toBeDefined();
    expect(h?.deQuien).toContain('Ana Ruiz');
    expect(h?.severidad).toBeTruthy();
    expect(h?.motivo).toBeTruthy();
  });

  it('coincide con los huecos del motor, en el mismo orden', () => {
    const e = estadoBase();
    const huecos = datos<HuecoConDeQuien[]>(obtenerHuecos(e, {}));
    const esperado = calcularDiagnostico(e.oportunidad.expediente, e.hoy).huecos;
    expect(huecos.map((h) => h.reglaId)).toEqual(esperado.map((h) => h.reglaId));
  });
});

describe('calcular_diagnostico', () => {
  it('devuelve el diagnóstico del motor', () => {
    const e = estadoBase();
    const d = datos<{ huecos: unknown }>(calcularDiagnosticoHerramienta(e, {}));
    expect(d).toEqual(calcularDiagnostico(e.oportunidad.expediente, e.hoy));
  });
});

describe('deQuien', () => {
  it('de_quien_tr', () => {
    const e = estadoBase();
    registrarInfluencia(e, { nombre: 'Luis Mora', roles: ['U'], grado: 'A' });
    registrarInfluencia(e, { nombre: 'Marta Paz', roles: ['T'], grado: 'A' });
    registrarInfluencia(e, { nombre: 'Rosa Baja', roles: ['U'], grado: 'B' });
    registrarInfluencia(e, { nombre: 'Tere Media', roles: ['U'], grado: 'M', trDeclaracion: '   ' });
    registrarInfluencia(e, { nombre: 'Con Tr', roles: ['U'], grado: 'A', trDeclaracion: 'Quiere reducir mermas' });
    const t = deQuien('tr_no_redactado', e.oportunidad.expediente) ?? '';
    expect(t).toContain('Luis Mora');
    expect(t).toContain('Marta Paz');
    expect(t).toContain('Tere Media');
    expect(t).not.toContain('Rosa Baja');
    expect(t).not.toContain('Con Tr');
    expect(deQuien('fecha_optimista', e.oportunidad.expediente)).toBeNull();
  });

  it('tabla del anexo §6', () => {
    const e = estadoBase();
    const exp = e.oportunidad.expediente;
    for (const id of ['budget_ausente', 'bant_supuesto', 'bant_ausente']) {
      expect(deQuien(id, exp)).toBe('de tu Coach');
    }
    expect(deQuien('sin_economico', exp)).toBe('de tu Coach o de quien ya conoces en la cuenta');
    expect(deQuien('ce_incompleto', exp)).toBe('del dueño del compelling event o del Económico');
    expect(deQuien('alternativas_no_identificadas', exp)).toBe(
      'pregunta directa al cliente: ¿estamos compitiendo con otro proveedor?',
    );
    expect(deQuien('tr_no_redactado', exp)).toBeNull();
    registrarInfluencia(e, { nombre: 'Ana Ruiz', roles: ['E'] });
    registrarInfluencia(e, { nombre: 'Pedro Gil', roles: ['E', 'U'] });
    registrarInfluencia(e, { nombre: 'Otro', roles: ['U'] });
    const conE = e.oportunidad.expediente;
    for (const id of ['budget_ausente', 'bant_supuesto', 'bant_ausente', 'economico_sin_cubrir']) {
      const t = deQuien(id, conE) ?? '';
      expect(t).toContain('del Económico');
      expect(t).toContain('Ana Ruiz, Pedro Gil');
      expect(t).not.toContain('Otro');
    }
    expect(deQuien('regla_inexistente', conE)).toBeNull();
    expect(deQuien('constructor', conE)).toBeNull();
  });
});

const ACCION = { que: 'Pedir presentación al Económico', quien: 'George', cuando: '2026-11-10', atiende: 'sin_economico' };

describe('proponer_acciones', () => {
  it('proponer_acepta_y_guarda', () => {
    const e = estadoBase();
    const d = datos<{ aceptadas: unknown[]; rechazadas: unknown[] }>(proponerAcciones(e, { acciones: [ACCION] }));
    expect(d.aceptadas).toEqual([ACCION]);
    expect(d.rechazadas).toEqual([]);
    expect(e.oportunidad.expediente.accionesPrevias).toEqual([{ ...ACCION, estado: 'abierta' }]);
    expect(e.eventos.map((x) => x.tipo)).toEqual(['accion']);
  });

  it('proponer_rechaza_malformada', () => {
    const e = estadoBase();
    const r = proponerAcciones(e, { acciones: [{ ...ACCION, quien: null }, null, 'texto'] });
    const d = datos<{ aceptadas: unknown[]; rechazadas: { motivo: string }[] }>(r);
    expect(d.aceptadas).toEqual([]);
    expect(d.rechazadas).toHaveLength(3);
    expect(d.rechazadas[0]?.motivo).toBe('sin_responsable');
    expect(e.oportunidad.expediente.accionesPrevias).toEqual([]);
  });

  it('mezcla aceptadas y rechazadas; las rechazadas no se guardan', () => {
    const e = estadoBase();
    const r = proponerAcciones(e, { acciones: [ACCION, { ...ACCION, cuando: '2027-06-01' }] });
    const d = datos<{ aceptadas: unknown[]; rechazadas: { motivo: string }[] }>(r);
    expect(d.aceptadas).toHaveLength(1);
    expect(d.rechazadas.map((x) => x.motivo)).toEqual(['fuera_de_horizonte']);
    expect(e.oportunidad.expediente.accionesPrevias).toHaveLength(1);
  });

  it('entrada sin arreglo de acciones es error', () => {
    const e = estadoBase();
    expect(errores(proponerAcciones(e, {})).length).toBeGreaterThan(0);
    expect(errores(proponerAcciones(e, { acciones: 'x' })).length).toBeGreaterThan(0);
    expect(errores(proponerAcciones(e, undefined)).length).toBeGreaterThan(0);
  });
});

describe('marcar_accion', () => {
  const conAccion = () => {
    const e = estadoBase();
    proponerAcciones(e, { acciones: [ACCION] });
    e.eventos.length = 0;
    return e;
  };

  it('marca cumplida y registra evento', () => {
    const e = conAccion();
    expect(marcarAccion(e, { indice: 0, estado: 'cumplida' }).ok).toBe(true);
    expect(e.oportunidad.expediente.accionesPrevias[0]?.estado).toBe('cumplida');
    expect(e.eventos.map((x) => x.tipo)).toEqual(['accion']);
  });

  it('marcar_accion_indice_invalido', () => {
    const e = conAccion();
    for (const indice of [1, -1, 0.5, '0', null, undefined]) {
      const r = marcarAccion(e, { indice, estado: 'cumplida' });
      expect(r.ok).toBe(false);
      expect(errores(r).length).toBeGreaterThan(0);
    }
    expect(e.oportunidad.expediente.accionesPrevias[0]?.estado).toBe('abierta');
  });

  it('estado inválido es error', () => {
    const e = conAccion();
    expect(marcarAccion(e, { indice: 0, estado: 'abierta' }).ok).toBe(false);
    expect(marcarAccion(e, { indice: 0, estado: 'otra' }).ok).toBe(false);
    expect(e.oportunidad.expediente.accionesPrevias[0]?.estado).toBe('abierta');
  });
});

describe('cerrar_sesion', () => {
  it('cerrar_sesion_requiere_resumen', () => {
    const e = estadoBase();
    expect(cerrarSesion(e, { resumen: '' }).ok).toBe(false);
    expect(cerrarSesion(e, { resumen: '   ' }).ok).toBe(false);
    expect(cerrarSesion(e, { resumen: 'x'.repeat(601) }).ok).toBe(false);
    expect(cerrarSesion(e, { resumen: 5 }).ok).toBe(false);
    expect(cerrarSesion(e, undefined).ok).toBe(false);
    expect(e.sesionCerrada).toBeNull();
    const r = cerrarSesion(e, { resumen: 'Se confirmó el presupuesto. Falta contactar al Económico.' });
    expect(r.ok).toBe(true);
    expect(e.sesionCerrada).toEqual({ resumen: 'Se confirmó el presupuesto. Falta contactar al Económico.' });
    expect(e.eventos.at(-1)?.tipo).toBe('sesion');
  });

  it('acepta exactamente 600 caracteres', () => {
    const e = estadoBase();
    expect(cerrarSesion(e, { resumen: 'x'.repeat(600) }).ok).toBe(true);
  });
});
