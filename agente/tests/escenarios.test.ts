import { describe, expect, it } from 'vitest';
import {
  CATALOGO_REGLAS, CONFIG_DEFAULT, calcularDiagnostico, diasHabilesEntre, esHabil, finDeTrimestre, sumarDiasHabiles,
} from 'motor-sales-agent';
import { validarFicha } from '../src/ficha.js';
import { ESCENARIOS } from '../src/escenarios/index.js';
import { expedienteDeVerdad } from './escenarios-verdad.js';

const HOY = '2026-11-02';
const FESTIVOS_MX = CONFIG_DEFAULT.festivos['MX'] ?? [];
const porId = (id: string) => {
  const e = ESCENARIOS.find((x) => x.id === id);
  if (e === undefined) throw new Error(`Falta el escenario ${id}`);
  return e;
};

describe('escenarios simulados', () => {
  it('cinco_escenarios', () => {
    expect(ESCENARIOS.map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
    expect(new Set(ESCENARIOS.map((e) => e.id)).size).toBe(5);
    for (const e of ESCENARIOS) expect(e.titulo.trim()).not.toBe('');
  });

  it('fichas_validas', () => {
    for (const hoy of ['2026-11-02', '2026-12-29', '2027-02-26']) {
      for (const e of ESCENARIOS) {
        const ficha = e.construirFicha(hoy);
        expect(validarFicha(ficha), `${e.id} con hoy ${hoy}`).toEqual([]);
        expect(ficha.fechaCierreCRM >= hoy, `${e.id} cierre ${ficha.fechaCierreCRM} con hoy ${hoy}`).toBe(true);
        expect(ficha.fechaCreacion < hoy, `${e.id} creación`).toBe(true);
      }
    }
  });

  it('fichas_con_el_contenido_del_anexo', () => {
    const f = Object.fromEntries(ESCENARIOS.map((e) => [e.id, e.construirFicha(HOY)]));
    expect(f['E1']).toMatchObject({ lineas: ['WMS'], pais: 'MX', etapaCRM: 4, tcv: 520000, moneda: 'USD', tipo: 'NN', esRFP: false });
    expect(f['E2']).toMatchObject({ lineas: ['TMS'], pais: 'CO', etapaCRM: 2, tcv: 380000, moneda: 'USD', tipo: 'NN', esRFP: false });
    expect(f['E3']).toMatchObject({ lineas: ['WMS'], pais: 'MX', etapaCRM: 1, tcv: 900000, moneda: 'USD', tipo: 'NN', esRFP: true });
    expect(f['E4']).toMatchObject({ lineas: ['PLANEACION_DEMANDA'], pais: 'PE', etapaCRM: 2, tcv: 250000, moneda: 'USD', tipo: 'NN', esRFP: false });
    expect(f['E5']).toMatchObject({ lineas: ['VOICE'], pais: 'MX', etapaCRM: 3, tcv: 310000, moneda: 'USD', tipo: 'EN', esRFP: false });
    // Las fechas salen solo de `hoy`: 2026-11-02 + 200 / 120 / 150 días y creaciones a −150 / −90.
    expect(f['E1']?.fechaCreacion).toBe('2026-06-05');
    expect(f['E2']?.fechaCreacion).toBe('2026-08-04');
    expect(f['E2']?.fechaCierreCRM).toBe('2027-05-21');
    expect(f['E3']?.fechaCierreCRM).toBe('2027-03-02');
    expect(f['E4']?.fechaCierreCRM).toBe('2027-04-01');
    for (const e of ESCENARIOS) {
      const ficha = e.construirFicha(HOY);
      expect(ficha.idCRM).toMatch(/^OPP-2026-\d{4}$/);
      expect(ficha.probabilidadCRM).toBe(CONFIG_DEFAULT.probabilidades[ficha.tipo ?? 'NN'][Math.min(ficha.etapaCRM, 5)]);
      expect(ficha.ultimaActualizacionCRM).not.toBeNull();
      expect((ficha.ultimaActualizacionCRM ?? '9999') < HOY).toBe(true);
    }
  });

  it('e1_cierra_en_periodo', () => {
    const cierre = porId('E1').construirFicha(HOY).fechaCierreCRM;
    expect(cierre <= finDeTrimestre(HOY)).toBe(true);
    expect(cierre).toBe('2026-11-30');
  });

  it('e1_cierre_ultimo_dia_del_mes_o_del_siguiente_si_faltan_menos_de_5_habiles', () => {
    const e1 = porId('E1');
    // Hasta el 30-nov quedan 6 días hábiles: se queda en el mes.
    expect(e1.construirFicha('2026-11-20').fechaCierreCRM).toBe('2026-11-30');
    // 26-nov: faltan 2 días hábiles (27 y 30) → mes siguiente.
    expect(e1.construirFicha('2026-11-26').fechaCierreCRM).toBe('2026-12-31');
    expect(e1.construirFicha('2027-02-26').fechaCierreCRM).toBe('2027-03-31');
    // Nunca hay menos de 5 días hábiles hasta el cierre.
    for (let d = 0; d < 120; d++) {
      const hoy = new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10);
      const cierre = e1.construirFicha(hoy).fechaCierreCRM;
      expect(diasHabilesEntre(hoy, cierre, FESTIVOS_MX), `hoy ${hoy}`).toBeGreaterThanOrEqual(5);
      expect(cierre.slice(8), `hoy ${hoy}`).toMatch(/^(28|29|30|31)$/);
    }
  });

  it('e5_cierra_en_25_dias_habiles', () => {
    for (const hoy of ['2026-11-02', '2026-12-29', '2027-02-26']) {
      expect(porId('E5').construirFicha(hoy).fechaCierreCRM).toBe(sumarDiasHabiles(hoy, 25, FESTIVOS_MX));
      expect(esHabil(porId('E5').construirFicha(hoy).fechaCierreCRM, FESTIVOS_MX)).toBe(true);
    }
  });

  it('textos_presentes', () => {
    for (const e of ESCENARIOS) {
      expect(e.tarjetaPapel.length, `${e.id} tarjetaPapel`).toBeGreaterThanOrEqual(200);
      expect(e.hechosOcultos.length, `${e.id} hechosOcultos`).toBeGreaterThanOrEqual(200);
      expect(e.persona.trim(), `${e.id} persona`).not.toBe('');
    }
  });

  it('tarjeta_papel_de_5_a_8_lineas_en_segunda_persona', () => {
    for (const e of ESCENARIOS) {
      const lineas = e.tarjetaPapel.split('\n').filter((l) => l.trim() !== '');
      expect(lineas.length, `${e.id} líneas`).toBeGreaterThanOrEqual(5);
      expect(lineas.length, `${e.id} líneas`).toBeLessThanOrEqual(8);
      expect(e.tarjetaPapel, e.id).toMatch(/\bEres\b/);
    }
  });

  it('personas_segun_el_anexo', () => {
    const palabra: Record<string, string> = {
      E1: 'eufóric', E2: 'vag', E3: 'apurad', E4: 'contradictori', E5: 'ordenad',
    };
    for (const e of ESCENARIOS) expect(e.persona.toLowerCase(), e.id).toContain(palabra[e.id]);
    expect(porId('E5').persona).toContain('inglés');
  });

  it('hechos_cubren_los_elementos_de_la_metodologia', () => {
    const elementos = ['PERSONAS', 'COMPETENCIA', 'PRIORIDAD', 'BANT', 'COMPELLING EVENT', 'CADENA DE CIERRE', 'CRITERIOS DE ARGANO', 'HIGIENE DEL CRM'];
    for (const e of ESCENARIOS) {
      for (const el of elementos) expect(e.hechosOcultos, `${e.id} ${el}`).toContain(el);
    }
  });

  it('banderas_existen', () => {
    const ids = new Set(CATALOGO_REGLAS.map((r) => r.id));
    for (const e of ESCENARIOS) {
      for (const b of e.banderasEsperadas) expect(ids.has(b), `${e.id}: ${b}`).toBe(true);
    }
    expect(porId('E1').banderasEsperadas).toEqual(['no_elegidos_cierre_periodo']);
    expect(porId('E2').banderasEsperadas).toEqual(['sin_economico', 'banco_una_pata']);
    expect(porId('E3').banderasEsperadas).toEqual(['rfp_sin_contacto_previo']);
    expect(porId('E4').banderasEsperadas).toEqual(['sin_contribucion_diferenciadora']);
    expect(porId('E5').banderasEsperadas).toEqual([]);
  });

  it('nombres_de_personas_y_empresas_son_ficticios', () => {
    const reales = /\b(Infotrack|Aguirre|Walmart|Soriana|Chedraui|Liverpool|Oxxo|Coppel|Bimbo|Cemex|Mercado Libre|SAP|Manhattan|Blue Yonder|Oracle|COFEPRIS|IMSS|PEMEX|CFE|Diconsa|Segalmex)\b/i;
    for (const e of ESCENARIOS) {
      const f = e.construirFicha(HOY);
      expect(`${f.cliente} ${f.oportunidad} ${f.vendedor}`, e.id).not.toMatch(reales);
      expect(`${e.tarjetaPapel} ${e.hechosOcultos}`, e.id).not.toMatch(reales);
    }
  });
});

describe('escenarios: los hechos permiten llegar a lo que debe detectar el agente', () => {
  it('cada bandera esperada se activa con el expediente que arman los hechos', () => {
    for (const e of ESCENARIOS) {
      const exp = expedienteDeVerdad(e.id, e.construirFicha(HOY), HOY);
      const d = calcularDiagnostico(exp, HOY);
      const ids = d.banderas.map((b) => b.id);
      for (const b of e.banderasEsperadas) expect(ids, `${e.id}`).toContain(b);
    }
  });

  it('E1: etapa inflada, fecha no creíble y semáforo rojo', () => {
    const f = porId('E1').construirFicha(HOY);
    const exp = expedienteDeVerdad('E1', f, HOY);
    const d = calcularDiagnostico(exp, HOY);
    expect(d.lente).toBe('director');
    // Presunción por etapa: sin contradicciones de etapas anteriores, la baja la pone el paso a (no elegidos): 4 → 3.
    expect(d.comparacionEtapa).toBe('inflada');
    expect(d.etapaRecomendada).toBe(3);
    expect(d.fecha?.veredicto).toBe('no_cierra_periodo');
    expect(d.banderas.map((b) => b.id)).toEqual(
      expect.arrayContaining(['no_elegidos_cierre_periodo', 'etapa_inflada', 'ce_urgencia_falsa']),
    );
    expect(d.indice.semaforo).toBe('rojo');
    // Si en la conversación sale que delivery no ha refinado la estrategia (etapa 2), la inflación es grave.
    exp.criteriosArgano.push({ clave: 'estrategia_delivery_refinada', nivel: 'ausente' });
    const grave = calcularDiagnostico(exp, HOY);
    expect(grave.etapaRecomendada).toBe(2);
    expect(grave.banderas.map((b) => b.id)).toContain('etapa_inflada_grave');
  });

  it('E2: sin económico, una sola pata y BANT en supuesto', () => {
    const d = calcularDiagnostico(expedienteDeVerdad('E2', porId('E2').construirFicha(HOY), HOY), HOY);
    expect(d.lente).toBe('gerente');
    expect(d.banderas.map((b) => b.id)).toEqual(expect.arrayContaining(['sin_economico', 'banco_una_pata', 'bant_supuesto']));
    expect(d.indice.semaforo).toBe('rojo');
  });

  it('E3: RFP sin contacto previo y competencia fuerte', () => {
    const d = calcularDiagnostico(expedienteDeVerdad('E3', porId('E3').construirFicha(HOY), HOY), HOY);
    expect(d.lente).toBe('gerente');
    expect(d.banderas.map((b) => b.id)).toContain('rfp_sin_contacto_previo');
    expect(d.banderas.map((b) => b.id)).not.toContain('alternativas_no_identificadas');
  });

  it('E3 sin la pregunta de competencia: alternativas no identificadas', () => {
    const exp = expedienteDeVerdad('E3', porId('E3').construirFicha(HOY), HOY);
    exp.preguntaCompetenciaHecha = false;
    exp.alternativas = [];
    expect(calcularDiagnostico(exp, HOY).banderas.map((b) => b.id)).toContain('alternativas_no_identificadas');
  });

  it('E4: alternativa interna, sin Coach válido y contribución sin articular', () => {
    const ficha = porId('E4').construirFicha(HOY);
    const exp = expedienteDeVerdad('E4', ficha, HOY);
    expect(exp.alternativas.some((a) => a.tipo === 'interna')).toBe(true);
    const ids = calcularDiagnostico(exp, HOY).banderas.map((b) => b.id);
    expect(ids).toContain('sin_contribucion_diferenciadora');
    expect(ids).toContain('sin_coach_valido');
    // Si el vendedor la articula cuando lo presionan, la bandera desaparece.
    exp.contribucionDiferenciadora = { valor: 'Modelo probado con datos de otros 3PL, listo en unos 4 meses', nivel: 'supuesto' };
    expect(calcularDiagnostico(exp, HOY).banderas.map((b) => b.id)).not.toContain('sin_contribucion_diferenciadora');
  });

  it('E4: sin presupuesto del cliente la etapa 2 está inflada (recomendada 1)', () => {
    const d = calcularDiagnostico(expedienteDeVerdad('E4', porId('E4').construirFicha(HOY), HOY), HOY);
    expect(d.etapaRecomendada).toBe(1);
    expect(d.comparacionEtapa).toBe('inflada');
    expect(d.banderas.map((b) => b.id)).toContain('etapa_inflada');
  });

  it('E5: verde, fortalezas, cadena creíble y sin banderas críticas', () => {
    const f = porId('E5').construirFicha(HOY);
    const d = calcularDiagnostico(expedienteDeVerdad('E5', f, HOY), HOY);
    expect(d.lente).toBe('director');
    expect(d.tipo).toBe('EN');
    expect(d.indice.semaforo).toBe('verde');
    expect(d.banderas.filter((b) => b.severidad === 'critica')).toEqual([]);
    expect(d.comparacionEtapa).toBe('al_dia');
    expect(d.etapaRecomendada).toBe(3);
    expect(d.banderas.map((b) => b.id).filter((id) => id.startsWith('etapa_inflada'))).toEqual([]);
    expect(d.fecha?.veredicto).toBe('creible');
    expect(d.fecha?.rutaUsada).toBe('contrato');
    expect(d.fortalezas.map((x) => x.id)).toEqual(
      expect.arrayContaining(['coach_valido', 'economico_a_favor', 'bant_confirmado', 'ce_completo', 'tr_completos', 'varios_a_favor']),
    );
  });

  it('E5 sigue verde con otras fechas de hoy', () => {
    for (const hoy of ['2026-12-29', '2027-02-26']) {
      const f = porId('E5').construirFicha(hoy);
      const d = calcularDiagnostico(expedienteDeVerdad('E5', f, hoy), hoy);
      expect(d.fecha?.veredicto, hoy).toBe('creible');
      expect(d.indice.semaforo, hoy).toBe('verde');
    }
  });
});
