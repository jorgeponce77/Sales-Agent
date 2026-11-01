import type { Evidencia, Expediente } from '../src/tipos.js';

/** Parcial profundo: los objetos se fusionan campo a campo; los arreglos se reemplazan completos. */
export type DeepPartial<T> =
  T extends readonly unknown[] ? T :
  T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } :
  T;

const ausente = <T>(): Evidencia<T> => ({ valor: null, nivel: 'ausente' });

function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function fusionar(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (esObjetoPlano(base) && esObjetoPlano(over)) {
    const salida: Record<string, unknown> = { ...base };
    for (const k of Object.keys(over)) salida[k] = fusionar(base[k], over[k]);
    return salida;
  }
  return over; // primitivos, null y arreglos reemplazan
}

/**
 * Expediente mínimo y válido: oportunidad WMS en MX, etapa 0, sin influencias,
 * todas las evidencias ausentes y todos los booleanos en false. Solo para pruebas.
 */
export function expedienteBase(over: DeepPartial<Expediente> = {}): Expediente {
  const base: Expediente = {
    id: 'exp-base',
    cuenta: {
      nombre: 'Cuenta de prueba',
      pais: 'MX',
      esClienteNetlogistik: false,
      esClienteOtraTowerArgano: false,
      clienteIdeal: [0, 1, 2, 3, 4].map(() => ausente<number>()),
    },
    lineas: ['WMS'],
    montoUSD: null,
    etapaCRM: 0,
    fechaCierreCRM: null,
    fechaCreacion: '2026-10-01',
    esChangeOrder: false,
    cambioDeDueno: false,
    esMercadoNuevo: false,
    revisionGerenteProxima: false,
    sensacion: null,
    prioridad: ausente(),
    influencias: [],
    preguntaCompetenciaHecha: false,
    alternativas: [],
    contribucionDiferenciadora: ausente(),
    criteriosCompraDefinidos: false,
    esRFP: false,
    contactoPrevioRFP: null,
    reorganizacion: ausente(),
    bant: { budget: ausente(), authority: ausente(), need: ausente(), time: ausente() },
    compellingEvent: {
      descripcion: null,
      fecha: ausente(),
      dueno: ausente(),
      costoInaccion: ausente(),
      urgenciaFalsa: false,
    },
    cadena: {
      ruta: 'desconocida',
      requiereSOW: null,
      pasos: {
        aElegido: false, bContratoEnviado: false, cComentariosRecibidos: false,
        dEnFirma: false, eFirmado: false, fAltaProveedor: false, hOC: false,
      },
    },
    criteriosArgano: [],
    higieneCRM: { valores: null, actividades: null, etapas: null },
    accionesPrevias: [],
  };
  return fusionar(base, over) as Expediente;
}
