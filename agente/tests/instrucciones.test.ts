import { describe, expect, it } from 'vitest';
import { CATALOGO_REGLAS, CONFIG_DEFAULT, calcularDiagnostico } from 'motor-sales-agent';
import { crearOportunidad } from '../src/ficha.js';
import { DEFINICIONES_HERRAMIENTAS } from '../src/herramientas/definiciones.js';
import { CRITERIOS_INTERNOS, VERSION_INSTRUCCIONES } from '../src/instrucciones/base.js';
import { construirInstrucciones } from '../src/instrucciones/construir.js';
import type { ModoSesion, Oportunidad } from '../src/tipos.js';
import { fichaBase } from './fabrica.js';

const HOY = '2026-11-02';

function construir(op: Oportunidad, modo: ModoSesion = 'calificar') {
  return construirInstrucciones(op, modo, HOY, calcularDiagnostico(op.expediente, HOY));
}

const opAlfa = (): Oportunidad =>
  crearOportunidad(
    fichaBase({ idCRM: 'OPP-ALFA-77', cliente: 'Comercializadora Alfa Ficticia', tcv: 987654, etapaCRM: 2 }),
  );

const opBeta = (): Oportunidad =>
  crearOportunidad(
    fichaBase({
      idCRM: 'OPP-BETA-88', cliente: 'Grupo Beta Ficticio', oportunidad: 'TMS regional',
      tcv: 123456, etapaCRM: 3, lineas: ['TMS'], pais: 'CO', tipo: 'EN',
    }),
  );

describe('construirInstrucciones', () => {
  it('fijo_estable', () => {
    const a = construir(opAlfa(), 'calificar');
    const b = construir(opBeta(), 'revision_rapida');
    expect(a.fijo).toBe(b.fijo);
    expect(a.variable).not.toBe(b.variable);
  });

  it('fijo_sin_datos_de_oportunidad', () => {
    const { fijo, variable } = construir(opAlfa());
    for (const dato of ['Comercializadora Alfa Ficticia', '987654', 'OPP-ALFA-77']) {
      expect(fijo).not.toContain(dato);
      expect(variable).toContain(dato);
    }
  });

  it('fijo_incluye_catalogo', () => {
    const { fijo } = construir(opAlfa());
    expect(CATALOGO_REGLAS.length).toBeGreaterThan(0);
    for (const { id } of CATALOGO_REGLAS) expect(fijo).toContain(`\`${id}\``);
  });

  it('fijo_incluye_herramientas', () => {
    const { fijo } = construir(opAlfa());
    expect(DEFINICIONES_HERRAMIENTAS).toHaveLength(12);
    for (const { name } of DEFINICIONES_HERRAMIENTAS) expect(fijo).toContain(name);
  });

  it('variable_retorno', () => {
    const nueva = construir(opAlfa());
    expect(nueva.variable).toContain('Sesión nueva');

    const op = opAlfa();
    op.sesiones.push({
      fecha: '2026-10-28',
      modo: 'calificar',
      resumen: 'Se identificó a la directora de finanzas como Económica; falta confirmar el presupuesto.',
      versionInstrucciones: VERSION_INSTRUCCIONES,
      transcripcion: [{ rol: 'vendedor', texto: 'Texto literal de la sesión pasada Z3', fecha: '2026-10-28' }],
    });
    const { variable } = construir(op);
    expect(variable).toContain('Retorno desde 2026-10-28');
    expect(variable).toContain('Se identificó a la directora de finanzas como Económica; falta confirmar el presupuesto.');
    expect(variable).not.toContain('Sesión nueva');
    expect(variable).not.toContain('Z3'); // R13: la memoria usa solo el resumen
  });

  it('variable_lente_director', () => {
    expect(construir(opBeta()).variable).toContain('Lente: director');
    expect(construir(opAlfa()).variable).toContain('Lente: gerente');
  });

  it('fijo_definiciones_y_excepcion_r7', () => {
    const { fijo } = construir(opAlfa());
    expect(fijo).not.toContain('definiciones del director');
    expect(fijo).not.toContain('Logisoft');
    expect(fijo).toContain('Excepción para hechos internos de Argano o Netlogistik');
    expect(fijo).toContain('fuente: "vendedor: <referencia>"');
    expect(fijo).toContain('registra los criterios de una etapa en una sola llamada con `criterios: [...]`');
    const claves = CONFIG_DEFAULT.criteriosArgano.map((c) => c.clave);
    for (const clave of CRITERIOS_INTERNOS) {
      expect(claves).toContain(clave);
      expect(fijo).toMatch(new RegExp(`\`${clave}\` \\((solo RFP, )?interno\\)`));
    }
  });

  it('mensajes_internos_listados (Menor 7)', () => {
    const { fijo } = construir(opAlfa());
    const seccion = fijo.slice(fijo.indexOf('**Mensajes internos.**'), fijo.indexOf('## 2. Reglas de conversación'));
    expect(seccion).toContain('"[Contexto de esta sesión]"');
    expect(seccion).toContain('"[Tu respuesta anterior se cortó por longitud');
    expect(seccion).toContain('"(texto del vendedor) "');
  });

  it('variable_sin_encabezado_propio (Menor 7)', () => {
    expect(construir(opAlfa()).variable.startsWith('Hoy: ')).toBe(true);
  });

  it('cierre_solo_si_lo_pide_o_acepta_la_propuesta (Menor 4)', () => {
    const { fijo } = construir(opAlfa());
    expect(fijo).toContain('Nunca cierres por tu cuenta sin proponerlo');
    expect(fijo).not.toContain('Cierra cuando el vendedor lo pida, cuando ya cubriste');
    const cerrar = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'cerrar_sesion')?.description ?? '';
    expect(cerrar).toContain('acepte');
    expect(cerrar).toContain('propusiste');
    expect(cerrar).toContain('Nunca cierres por tu cuenta sin proponerlo');
  });

  it('siguiente_paso_va_a_acciones_y_resumen (Menor 5)', () => {
    const { fijo } = construir(opAlfa());
    expect(fijo).not.toContain('pasos de la cadena y siguiente paso');
    expect(fijo).toContain('El siguiente paso no tiene campo en el expediente');
    const proponer = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'proponer_acciones')?.description ?? '';
    expect(proponer).toContain('siguiente paso');
    const cerrar = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'cerrar_sesion')?.description ?? '';
    expect(cerrar).toContain('siguiente paso');
  });

  it('sin_competencia_pregunta_primero_las_otras_alternativas (Menor 3)', () => {
    const alt = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'registrar_alternativa')?.description ?? '';
    expect(alt).not.toContain('incluso si dice que no hay competencia (entonces registra "no_hacer_nada")');
    for (const t of ['solución interna', 'presupuesto', 'no hacer nada', '"no_hacer_nada" con posición "nula"', 'solo si']) expect(alt).toContain(t);
    const { fijo } = construir(opAlfa());
    expect(fijo).toContain('Para el motor, la posición es Nula');
  });

  it('etapa_cerrada_archiva_la_sesion (Menor 6)', () => {
    expect(construir(opAlfa()).fijo).toContain('Si con `actualizar_ficha` la etapa pasa a 6, 7 u 8');
  });

  it('nombre_de_influencia_con_maximo (Menor 10)', () => {
    const inf = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'registrar_influencia');
    expect((inf?.input_schema.properties['nombre'] as { maxLength?: number }).maxLength).toBe(120);
  });

  it('version', () => {
    expect(VERSION_INSTRUCCIONES).toBe('2026-11-02.4');
    expect(construir(opAlfa()).version).toBe(VERSION_INSTRUCCIONES);
  });
});
