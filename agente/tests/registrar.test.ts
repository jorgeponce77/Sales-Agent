import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from 'motor-sales-agent';
import {
  CAMPOS_REGISTRABLES,
  actualizarCadenaCierre,
  actualizarFicha,
  registrarAlternativa,
  registrarCriterioArgano,
  registrarDato,
  registrarInfluencia,
} from '../src/herramientas/registrar.js';
import { aplicarEscritura } from '../src/herramientas/escritura.js';
import { estadoBase } from './fabrica.js';

const errores = (r: { ok: boolean; errores?: string[] }): string[] => (r.ok ? [] : (r.errores ?? []));

describe('aplicarEscritura', () => {
  it('excepcion_en_mutar_se_convierte_en_error', () => {
    const e = estadoBase();
    const antes = structuredClone(e.oportunidad.expediente);
    const r = aplicarEscritura(e, 'prueba', () => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    expect(e.oportunidad.expediente).toEqual(antes);
    expect(e.eventos.map((x) => x.tipo)).toEqual(['rechazo']);
  });

  it('escritura_valida_reemplaza_y_registra_evento', () => {
    const e = estadoBase();
    const r = aplicarEscritura(e, 'Se marcó mercado nuevo', (exp) => {
      exp.esMercadoNuevo = true;
    });
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.esMercadoNuevo).toBe(true);
    expect(e.eventos).toEqual([{ tipo: 'dato', descripcion: 'Se marcó mercado nuevo', fecha: '2026-11-02' }]);
  });
});

describe('registrarDato', () => {
  it('dato_bant_confirmado', () => {
    const e = estadoBase();
    const r = registrarDato(e, { campo: 'bant.budget', valor: 'USD 500k aprobados', nivel: 'confirmado', fuente: 'CFO' });
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.bant.budget).toEqual({
      valor: 'USD 500k aprobados',
      nivel: 'confirmado',
      fuente: 'CFO',
      fecha: '2026-11-02',
    });
    expect(e.eventos.filter((x) => x.tipo === 'dato')).toHaveLength(1);
  });

  it('dato_supuesto_no_lleva_fecha', () => {
    const e = estadoBase();
    expect(registrarDato(e, { campo: 'bant.need', valor: 'Reducir errores de surtido', nivel: 'supuesto' }).ok).toBe(true);
    expect(e.oportunidad.expediente.bant.need.fecha).toBeUndefined();
    expect(e.oportunidad.expediente.bant.need.nivel).toBe('supuesto');
  });

  it('dato_reemplaza', () => {
    const e = estadoBase();
    registrarDato(e, { campo: 'bant.need', valor: 'primero', nivel: 'supuesto' });
    registrarDato(e, { campo: 'bant.need', valor: 'segundo', nivel: 'confirmado', fuente: 'Gerente de CD' });
    expect(e.oportunidad.expediente.bant.need.valor).toBe('segundo');
    expect(e.oportunidad.expediente.bant.need.nivel).toBe('confirmado');
  });

  it('campo_fuera_de_lista', () => {
    const e = estadoBase();
    const r = registrarDato(e, { campo: 'montoUSD', valor: 1 });
    expect(r.ok).toBe(false);
    expect(errores(r)[0]).toContain('campo no registrable');
    expect(errores(r)[0]).toContain('montoUSD');
  });

  it('nivel_invalido_rechazado', () => {
    const e = estadoBase();
    const antes = structuredClone(e.oportunidad.expediente);
    const r = registrarDato(e, { campo: 'bant.budget', valor: 'x', nivel: 'Confirmado' });
    expect(r.ok).toBe(false);
    expect(e.oportunidad.expediente).toEqual(antes);
    expect(e.eventos.some((x) => x.tipo === 'rechazo')).toBe(true);
  });

  it('nivel_obligatorio_en_evidencias', () => {
    const e = estadoBase();
    const antes = structuredClone(e.oportunidad.expediente);
    const r = registrarDato(e, { campo: 'bant.budget', valor: 'x' });
    expect(r.ok).toBe(false);
    expect(errores(r).join(' ')).toContain('nivel');
    expect(e.oportunidad.expediente).toEqual(antes);
  });

  it('booleanos_ignoran_nivel_y_fuente', () => {
    const e = estadoBase();
    const r = registrarDato(e, { campo: 'esRFP', valor: true, nivel: 'confirmado', fuente: 'x' });
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.esRFP).toBe(true);
  });

  it('booleano_con_valor_de_otro_tipo_se_rechaza', () => {
    const e = estadoBase();
    expect(registrarDato(e, { campo: 'esRFP', valor: 'sí' }).ok).toBe(false);
    expect(e.oportunidad.expediente.esRFP).toBe(false);
  });

  it('escalares_y_anidados', () => {
    const e = estadoBase();
    expect(registrarDato(e, { campo: 'sensacion', valor: 'seguro' }).ok).toBe(true);
    expect(registrarDato(e, { campo: 'higieneCRM.valores', valor: true }).ok).toBe(true);
    expect(registrarDato(e, { campo: 'compellingEvent.descripcion', valor: 'Cierre de contrato actual' }).ok).toBe(true);
    expect(registrarDato(e, { campo: 'compellingEvent.fecha', valor: '2027-01-15', nivel: 'confirmado' }).ok).toBe(true);
    const exp = e.oportunidad.expediente;
    expect(exp.sensacion).toBe('seguro');
    expect(exp.higieneCRM.valores).toBe(true);
    expect(exp.compellingEvent.descripcion).toBe('Cierre de contrato actual');
    expect(exp.compellingEvent.fecha.valor).toBe('2027-01-15');
    expect(registrarDato(e, { campo: 'sensacion', valor: 'contento' }).ok).toBe(false);
    expect(exp.sensacion).toBe('seguro');
  });

  it('cliente_ideal_indices_0_a_4', () => {
    const e = estadoBase();
    expect(registrarDato(e, { campo: 'cuenta.clienteIdeal.4', valor: 3, nivel: 'supuesto' }).ok).toBe(true);
    expect(e.oportunidad.expediente.cuenta.clienteIdeal[4]?.valor).toBe(3);
    expect(registrarDato(e, { campo: 'cuenta.clienteIdeal.5', valor: 3, nivel: 'supuesto' }).ok).toBe(false);
    expect(registrarDato(e, { campo: 'cuenta.clienteIdeal.0', valor: 9, nivel: 'supuesto' }).ok).toBe(false);
    expect(e.oportunidad.expediente.cuenta.clienteIdeal[0]?.valor).toBeNull();
  });

  it('lista_blanca_exacta', () => {
    expect([...CAMPOS_REGISTRABLES]).toEqual([
      'bant.budget', 'bant.authority', 'bant.need', 'bant.time',
      'compellingEvent.fecha', 'compellingEvent.dueno', 'compellingEvent.costoInaccion',
      'compellingEvent.descripcion', 'compellingEvent.urgenciaFalsa',
      'prioridad', 'contribucionDiferenciadora', 'reorganizacion', 'criteriosCompraDefinidos',
      'preguntaCompetenciaHecha', 'esRFP', 'contactoPrevioRFP', 'sensacion',
      'higieneCRM.valores', 'higieneCRM.actividades', 'higieneCRM.etapas',
      'cuenta.clienteIdeal.0', 'cuenta.clienteIdeal.1', 'cuenta.clienteIdeal.2',
      'cuenta.clienteIdeal.3', 'cuenta.clienteIdeal.4',
      'cuenta.esClienteNetlogistik', 'cuenta.esClienteOtraTowerArgano',
      'esChangeOrder', 'cambioDeDueno', 'esMercadoNuevo', 'revisionGerenteProxima',
    ]);
  });

  it('input_basura', () => {
    const e = estadoBase();
    for (const input of [null, undefined, 5, 'x', [], { campo: 5 }, {}, { campo: 'bant.budget', nivel: 'confirmado' }]) {
      const r = registrarDato(e, input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
    }
  });
});

describe('registrarCriterioArgano', () => {
  const clave = CONFIG_DEFAULT.criteriosArgano[0]?.clave as string;

  it('criterio_reemplaza_no_duplica', () => {
    const e = estadoBase();
    expect(registrarCriterioArgano(e, { clave, nivel: 'supuesto' }).ok).toBe(true);
    expect(registrarCriterioArgano(e, { clave, nivel: 'confirmado' }).ok).toBe(true);
    const lista = e.oportunidad.expediente.criteriosArgano.filter((c) => c.clave === clave);
    expect(lista).toEqual([{ clave, nivel: 'confirmado' }]);
  });

  it('criterio_clave_inexistente', () => {
    const e = estadoBase();
    const r = registrarCriterioArgano(e, { clave: 'no_existe', nivel: 'confirmado' });
    expect(r.ok).toBe(false);
    expect(e.oportunidad.expediente.criteriosArgano).toEqual([]);
  });

  it('criterio_nivel_invalido', () => {
    const e = estadoBase();
    expect(registrarCriterioArgano(e, { clave, nivel: 'quizás' }).ok).toBe(false);
    expect(e.oportunidad.expediente.criteriosArgano).toEqual([]);
  });
});

describe('registrarInfluencia', () => {
  it('influencia_merge_por_nombre', () => {
    const e = estadoBase();
    expect(registrarInfluencia(e, { nombre: 'José Pérez', roles: ['E'], calificacion: 3 }).ok).toBe(true);
    expect(registrarInfluencia(e, { nombre: 'jose  perez', contactada: true }).ok).toBe(true);
    const inf = e.oportunidad.expediente.influencias;
    expect(inf).toHaveLength(1);
    expect(inf[0]?.contactada).toBe(true);
    expect(inf[0]?.roles).toEqual(['E']);
    expect(inf[0]?.calificacion).toBe(3);
    expect(inf[0]?.nombre).toBe('José Pérez');
  });

  it('influencia_nueva_con_defaults', () => {
    const e = estadoBase();
    registrarInfluencia(e, { nombre: 'Ana Ruiz' });
    expect(e.oportunidad.expediente.influencias[0]).toEqual({
      personaId: 'p-ana ruiz',
      nombre: 'Ana Ruiz',
      roles: [],
      grado: null,
      modo: null,
      calificacion: null,
      contactada: false,
      nuevaEnPuesto: false,
      trDeclaracion: null,
      prioridad: null,
    });
  });

  it('influencia_busca_primero_por_persona_id', () => {
    const e = estadoBase();
    registrarInfluencia(e, { nombre: 'Ana Ruiz' });
    const id = e.oportunidad.expediente.influencias[0]?.personaId;
    registrarInfluencia(e, { personaId: id, nombre: 'Otra Escritura', grado: 'A' });
    expect(e.oportunidad.expediente.influencias).toHaveLength(1);
    expect(e.oportunidad.expediente.influencias[0]?.grado).toBe('A');
  });

  it('influencia_calificacion_cero', () => {
    const e = estadoBase();
    const r = registrarInfluencia(e, { nombre: 'Ana Ruiz', calificacion: 0 });
    expect(r.ok).toBe(false);
    expect(errores(r).join(' ')).toContain('calificacion');
    expect(e.oportunidad.expediente.influencias).toEqual([]);
  });

  it('influencia_sin_nombre', () => {
    const e = estadoBase();
    expect(registrarInfluencia(e, { contactada: true }).ok).toBe(false);
    expect(registrarInfluencia(e, null).ok).toBe(false);
  });
});

describe('registrarAlternativa', () => {
  it('alternativa_marca_pregunta', () => {
    const e = estadoBase();
    expect(e.oportunidad.expediente.preguntaCompetenciaHecha).toBe(false);
    const r = registrarAlternativa(e, { tipo: 'proveedor', nombre: 'SAP EWM', posicion: 'dominante' });
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.preguntaCompetenciaHecha).toBe(true);
    expect(e.oportunidad.expediente.alternativas).toEqual([{ tipo: 'proveedor', nombre: 'SAP EWM', posicion: 'dominante' }]);
  });

  it('alternativa_actualiza_por_tipo_y_nombre', () => {
    const e = estadoBase();
    registrarAlternativa(e, { tipo: 'proveedor', nombre: 'SAP EWM', posicion: 'dominante' });
    registrarAlternativa(e, { tipo: 'proveedor', nombre: 'sap  ewm', posicion: 'compartida' });
    registrarAlternativa(e, { tipo: 'no_hacer_nada' });
    registrarAlternativa(e, { tipo: 'no_hacer_nada', posicion: 'nula' });
    const alts = e.oportunidad.expediente.alternativas;
    expect(alts).toHaveLength(2);
    expect(alts[0]?.posicion).toBe('compartida');
    expect(alts[1]).toEqual({ tipo: 'no_hacer_nada', nombre: null, posicion: 'nula' });
  });

  it('alternativa_tipo_invalido', () => {
    const e = estadoBase();
    expect(registrarAlternativa(e, { tipo: 'otro' }).ok).toBe(false);
    expect(e.oportunidad.expediente.alternativas).toEqual([]);
    expect(e.oportunidad.expediente.preguntaCompetenciaHecha).toBe(false);
  });
});

describe('actualizarCadenaCierre', () => {
  it('cadena_merge_parcial', () => {
    const e = estadoBase();
    expect(actualizarCadenaCierre(e, { ruta: 'contrato', pasos: { aElegido: true } }).ok).toBe(true);
    expect(actualizarCadenaCierre(e, { requiereSOW: false, pasos: { bContratoEnviado: true } }).ok).toBe(true);
    const c = e.oportunidad.expediente.cadena;
    expect(c.ruta).toBe('contrato');
    expect(c.requiereSOW).toBe(false);
    expect(c.pasos.aElegido).toBe(true);
    expect(c.pasos.bContratoEnviado).toBe(true);
    expect(c.pasos.eFirmado).toBe(false);
  });

  it('cadena_paso_desconocido', () => {
    const e = estadoBase();
    const r = actualizarCadenaCierre(e, { pasos: { gInventado: true } });
    expect(r.ok).toBe(false);
    expect(errores(r).join(' ')).toContain('gInventado');
  });

  it('cadena_ruta_invalida_y_paso_no_booleano', () => {
    const e = estadoBase();
    expect(actualizarCadenaCierre(e, { ruta: 'rapida' }).ok).toBe(false);
    expect(actualizarCadenaCierre(e, { pasos: { aElegido: 'sí' } }).ok).toBe(false);
    expect(e.oportunidad.expediente.cadena.ruta).toBe('desconocida');
    expect(e.oportunidad.expediente.cadena.pasos.aElegido).toBe(false);
  });
});

describe('actualizarFicha', () => {
  it('ficha_actualiza_etapa_y_evento', () => {
    const e = estadoBase();
    const r = actualizarFicha(e, { campo: 'etapaCRM', valor: 3 });
    expect(r.ok).toBe(true);
    expect(e.oportunidad.expediente.etapaCRM).toBe(3);
    expect(e.oportunidad.ficha.etapaCRM).toBe(3);
    const ev = e.eventos.find((x) => x.tipo === 'ficha');
    expect(ev?.descripcion).toBe('Etapa CRM 2 → 3 (dicho por el vendedor)');
    expect(ev?.fecha).toBe('2026-11-02');
  });

  it('ficha_campo_no_permitido', () => {
    const e = estadoBase();
    const r = actualizarFicha(e, { campo: 'cliente', valor: 'Otro' });
    expect(r.ok).toBe(false);
    expect(e.oportunidad.ficha.cliente).toBe('Cliente de prueba');
  });

  it('ficha_valor_invalido_no_cambia_nada', () => {
    const e = estadoBase();
    const antes = structuredClone(e.oportunidad);
    expect(actualizarFicha(e, { campo: 'etapaCRM', valor: 9 }).ok).toBe(false);
    expect(actualizarFicha(e, { campo: 'fechaCierreCRM', valor: '31/03/2027' }).ok).toBe(false);
    expect(e.oportunidad).toEqual(antes);
    expect(e.eventos.every((x) => x.tipo === 'rechazo')).toBe(true);
    expect(e.eventos).toHaveLength(2);
  });

  it('ficha_etapa_mayor_a_5_cierra_y_topa_el_expediente', () => {
    const e = estadoBase();
    expect(actualizarFicha(e, { campo: 'etapaCRM', valor: 7 }).ok).toBe(true);
    expect(e.oportunidad.expediente.etapaCRM).toBe(5);
    expect(e.oportunidad.ficha.etapaCRM).toBe(7);
    expect(e.oportunidad.cerrada).toBe(true);
  });

  it('ficha_tcv_y_moneda_recalculan_monto_usd', () => {
    const e = estadoBase({ tiposCambio: { USD: 1, MXN: 0.05 } });
    expect(actualizarFicha(e, { campo: 'tcv', valor: 1000000 }).ok).toBe(true);
    expect(e.oportunidad.expediente.montoUSD).toBe(1000000);
    expect(actualizarFicha(e, { campo: 'moneda', valor: 'MXN' }).ok).toBe(true);
    expect(e.oportunidad.expediente.montoUSD).toBe(50000);
    expect(e.oportunidad.ficha.moneda).toBe('MXN');
  });

  it('ficha_fecha_de_cierre', () => {
    const e = estadoBase();
    expect(actualizarFicha(e, { campo: 'fechaCierreCRM', valor: '2027-05-15' }).ok).toBe(true);
    expect(e.oportunidad.expediente.fechaCierreCRM).toBe('2027-05-15');
    expect(e.oportunidad.ficha.fechaCierreCRM).toBe('2027-05-15');
  });

  it('ficha_input_basura', () => {
    const e = estadoBase();
    expect(actualizarFicha(e, null).ok).toBe(false);
    expect(actualizarFicha(e, { campo: 7 }).ok).toBe(false);
  });
});
