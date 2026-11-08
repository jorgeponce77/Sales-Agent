import { describe, expect, it } from 'vitest';
import { CATALOGO_REGLAS, CONFIG_DEFAULT, calcularDiagnostico } from 'motor-sales-agent';
import { crearOportunidad } from '../src/ficha.js';
import { DEFINICIONES_HERRAMIENTAS } from '../src/herramientas/definiciones.js';
import { CRITERIOS_INTERNOS, INSTRUCCIONES_BASE, VERSION_INSTRUCCIONES } from '../src/instrucciones/base.js';
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

  it('hora_local_y_saludo_en_el_contexto', () => {
    const op = opAlfa();
    const diag = calcularDiagnostico(op.expediente, HOY);
    const manana = construirInstrucciones(op, 'calificar', HOY, diag, 9).variable;
    expect(manana).toContain('Hora local del vendedor: 09 h → saludo: buenos días (en inglés: Good morning)');
    expect(construirInstrucciones(op, 'calificar', HOY, diag, 15).variable).toContain('Hora local del vendedor: 15 h → saludo: buenas tardes (en inglés: Good afternoon)');
    expect(construirInstrucciones(op, 'calificar', HOY, diag, 22).variable).toContain('Hora local del vendedor: 22 h → saludo: buenas noches (en inglés: Good evening)');
    expect(construirInstrucciones(op, 'calificar', HOY, diag, 0).variable).toContain('Hora local del vendedor: 00 h → saludo: buenas noches (en inglés: Good evening)');
    // Sin hora (o con una hora inválida), saludo neutro.
    for (const hora of [undefined, 24, -1, 9.5, Number.NaN]) {
      const v = construirInstrucciones(op, 'calificar', HOY, diag, hora).variable;
      expect(v).toContain('Hora local del vendedor: desconocida → saludo neutro ("Hola, …"; en inglés, "Hi, …")');
    }
    // La hora no entra a la parte fija (cacheable).
    expect(construirInstrucciones(op, 'calificar', HOY, diag, 9).fijo).toBe(construir(op).fijo);
  });

  describe('calibración por etapa (2026-11-08)', () => {
    const fijo = (): string => construir(opAlfa()).fijo;
    const seccion = (desde: string, hasta: string): string => {
      const f = fijo();
      const i = f.indexOf(desde);
      expect(i).toBeGreaterThanOrEqual(0);
      const j = f.indexOf(hasta, i + desde.length);
      return f.slice(i, j < 0 ? undefined : j);
    };

    it('se presenta como asesor comercial, nunca de Netlogistik', () => {
      const f = fijo();
      expect(f).toContain('asesor comercial');
      expect(f).toContain('your sales advisor');
      expect(f).not.toMatch(/Eres el coach comercial/);
      const rol = seccion('## 1. Rol', '**Qué recibes.**');
      expect(rol).toContain('Eres el asesor comercial');
      // Ninguna oración junta "asesor comercial" (o "sales advisor") con Netlogistik (revisión 9).
      const oraciones = INSTRUCCIONES_BASE.split(/(?<=[.!?])\s+|\n/);
      const juntas = oraciones.filter((o) => /asesor comercial|sales advisor/i.test(o) && /Netlogistik/i.test(o));
      expect(juntas).toEqual([]);
    });

    it('apertura cordial con la hora local y aviso de visibilidad amable', () => {
      const apertura = seccion('### 3.1 Apertura', '### 3.2');
      for (const t of ['Hora local del vendedor', 'Buenos días', 'espero que tu día vaya de maravilla', 'vamos a trabajar juntos en este negocio', 'tu asesor comercial', 'Good morning', "I'm your sales advisor", 'tu gerente y la dirección', '¿Cuál es el estatus del negocio?']) {
        expect(apertura).toContain(t);
      }
      expect(apertura).toMatch(/nunca[^.]*"de Netlogistik"/i);
      expect(apertura).toMatch(/Good morning\/Good afternoon\/Good evening/);
      // Retorno: saludo cordial de una línea antes del resumen.
      expect(apertura.slice(apertura.indexOf('**Retorno**'))).toMatch(/saludo cordial/i);
    });

    it('presunción por etapa y anti-redundancia en las reglas de conversación', () => {
      const reglas = seccion('## 2. Reglas de conversación', '### Límites duros');
      expect(reglas).toContain('Presunción por etapa');
      expect(reglas).toContain('Una sola pregunta por mensaje');
      expect(reglas).not.toContain('dos como máximo');
      expect(reglas).toContain('ni con otras palabras');
      expect(reglas).toContain('No pidas pruebas');
      const preguntas = seccion('### 3.3 Preguntas', '### 3.4');
      expect(preguntas).toMatch(/revisa el expediente/);
    });

    it('4.12 reemplazada: etapas, qué se da por hecho y en qué enfocarte', () => {
      const f = fijo();
      expect(f).not.toContain('pregunta por los criterios de las etapas anteriores a la del CRM');
      const etapas = seccion('### 4.12 Etapas: qué se da por hecho y en qué enfocarte', '### 4.13');
      for (const nombre of ['Identifying', 'Shaping & Discovery', 'Developing Proposal', 'Negotiating', 'Finalizing', 'Won']) {
        expect(etapas).toContain(nombre);
      }
      for (const t of ['Se da por hecho', 'Foco', 'Coach', 'siguiente acción del cliente', 'última charla con el Coach', 'prevalida', 'Higiene de CRM']) {
        expect(etapas).toContain(t);
      }
      // La lista de criterios por etapa sigue en el texto fijo.
      expect(etapas).toContain('Para salir de 0 (Identifying)');
    });

    it('checklist de cierre de Finalizing en orden y con filtro', () => {
      const checklist = seccion('Checklist de cierre', '### 4.12');
      const pasos = [
        '¿Ya te dijeron que eres el elegido?', '¿Ya enviaste el contrato?', '¿Ya revisaron el contrato?',
        '¿Conoces el mecanismo para la Orden de Compra?', '¿Ya diste de alta al cliente?',
        '¿El cliente ya te dio de alta como proveedor?', '¿el cliente ya te entregó la OC?', '¿Ya facturaste?',
      ];
      let previo = -1;
      for (const p of pasos) {
        const i = checklist.indexOf(p);
        expect(i, p).toBeGreaterThan(previo);
        previo = i;
      }
      expect(checklist).toMatch(/primer "no"/);
      // Encuadre como afirmación y luego la pregunta 1 (revisión 5).
      expect(checklist).toContain('"Si tu cierre es el <fecha del CRM>, validemos tu checklist de cierre. ¿Ya te dijeron que eres el elegido?"');
      expect(checklist).not.toContain('¿ya hiciste el checklist');
    });

    it('4.11: con duda, pregunta solo en la etapa actual y el checklist', () => {
      const cadena = seccion('### 4.11 Cadena de cierre', 'Checklist de cierre');
      expect(cadena).not.toContain('con duda, pregunta.');
      expect(cadena).toContain('Si tienes duda sobre un paso, pregunta solo cuando sea de la etapa actual o del checklist de cierre de Finalizing');
      expect(cadena).toContain('no repreguntes un paso que el vendedor ya contestó');
      expect(cadena).toContain('se preguntan una vez, cuando toque (en Finalizing, en el punto 4 del checklist de cierre)');
    });

    it('etapa 3: Assessment presumido y propuesta entregada como momento, no como prueba (revisión 2)', () => {
      const etapas = seccion('### 4.12 Etapas', '### 4.13');
      const e3 = etapas.slice(etapas.indexOf('- **3 Negotiating'), etapas.indexOf('- **4 Finalizing'));
      expect(e3).toContain('Assessment presentado al Económico');
      expect(e3).not.toMatch(/propuesta desarrollada y presentada al Económico/);
      expect(e3).toContain('`propuesta_entregada`');
      expect(e3).toContain('"¿Cómo te fue al presentarle la propuesta al Económico?"');
      expect(e3).toMatch(/nunca[^.]*"¿Ya entregaste la propuesta\?"/i);
      const e4 = etapas.slice(etapas.indexOf('- **4 Finalizing'), etapas.indexOf('- **5 Won'));
      expect(e4).toMatch(/Se da por hecho:[^.]*propuesta entregada/);
    });

    it('nombres: una vez y, si no lo sabe, por cargo con "(nombre pendiente)"; Técnico solo ante contradicción (revisión 3)', () => {
      const reglas = seccion('## 2. Reglas de conversación', '### Límites duros');
      const r5 = reglas.slice(reglas.indexOf('5. **Nunca inventes datos.**'), reglas.indexOf('6. **'));
      expect(r5).toContain('una sola vez');
      expect(r5).toContain('"<cargo> (nombre pendiente)"');
      const e = seccion('### 4.2', '### 4.3');
      expect(e).not.toContain('¿Tú recomiendas o das el visto bueno final? ¿Alguien más puede vetarlo?');
      expect(e).toContain('Solo si algo concreto contradice al vendedor');
    });

    it('ningún ejemplo entre comillas tiene más de una pregunta (revisión 4)', () => {
      const ejemplos = [...INSTRUCCIONES_BASE.matchAll(/"([^"\n]*)"/g)].map((m) => m[1] ?? '');
      expect(ejemplos.length).toBeGreaterThan(20);
      const dobles = ejemplos.filter((t) => (t.match(/\?/g) ?? []).length > 1);
      expect(dobles).toEqual([]);
      // Tampoco listas de preguntas sueltas en una misma línea fuera de comillas (Budget, compelling event, higiene…).
      const lineas = INSTRUCCIONES_BASE.split('\n').filter((l) => !/^\d+\. /.test(l.trim()));
      const conVarias = lineas.filter((l) => (l.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length > 1);
      expect(conVarias).toEqual([]);
      const alt = DEFINICIONES_HERRAMIENTAS.find((d) => d.name === 'registrar_alternativa')?.description ?? '';
      expect(alt).toContain('una sola pregunta');
      expect(alt).not.toContain('pregunta si hay una solución interna, si el presupuesto se podría ir a otra cosa y si el cliente podría no hacer nada');
    });
  });

  it('contexto: criterios de la etapa actual y contradicciones de etapas anteriores', () => {
    const op = opBeta(); // etapa 3
    op.expediente.criteriosArgano.push(
      { clave: 'propuesta_entregada', nivel: 'confirmado', fuente: 'Laura (CFO)' },
      { clave: 'business_case_identificado', nivel: 'ausente' },
    );
    const { variable } = construir(op);
    expect(variable).not.toContain('Criterios de Argano sin confirmar (etapas anteriores a la del CRM)');
    expect(variable).toContain('Criterios de Argano de la etapa actual (3, para avanzar): ');
    expect(variable).toMatch(/propuesta_entregada confirmado/);
    expect(variable).toMatch(/pr_aprobado pendiente/);
    expect(variable).toContain('Etapas 0 a 2: se dan por hechas (no se preguntan) · contradicciones registradas: business_case_identificado');
    // Un "no sé" registrado mientras el CRM estaba en esa etapa no es contradicción (revisión 1).
    const subio = opBeta();
    subio.expediente.etapaCRM = 4;
    subio.expediente.cadena.pasos.aElegido = true;
    subio.expediente.criteriosArgano.push(
      { clave: 'staffing_request', nivel: 'ausente', etapaRegistro: 3 },
      { clave: 'entiende_cliente_dolores', nivel: 'ausente', etapaRegistro: 3 },
    );
    expect(construir(subio).variable).toContain('Etapas 0 a 3: se dan por hechas (no se preguntan) · contradicciones registradas: entiende_cliente_dolores\n');
    const sinNada = construir(opAlfa()).variable; // etapa 2
    expect(sinNada).toContain('Etapas 0 a 1: se dan por hechas (no se preguntan) · contradicciones registradas: ninguna');
  });

  it('version', () => {
    expect(VERSION_INSTRUCCIONES).toBe('2026-11-08.2');
    expect(construir(opAlfa()).version).toBe(VERSION_INSTRUCCIONES);
  });
});
