import { fechaValida } from 'motor-sales-agent';
import type { Etapa, Evidencia, Expediente } from 'motor-sales-agent';
import { TIPOS_CAMBIO_DEFAULT } from './tipos.js';
import type { Ficha, Oportunidad, TiposCambio } from './tipos.js';

const LINEAS = ['WMS', 'TMS', 'PLANEACION_DEMANDA', 'VOICE'];

const TIPOS = ['NN', 'ENxT', 'EN', 'EE'];

const esTextoNoVacio = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';

/** Largo máximo de los textos libres de la ficha. */
export const MAX_TEXTO_FICHA = { idCRM: 40, cliente: 120, oportunidad: 160, vendedor: 80 } as const;

/** Error de largo de un texto libre de la ficha, o null si cabe (o si no es texto: eso lo reporta otra regla). */
function errorLargo(o: Record<string, unknown>, campo: keyof typeof MAX_TEXTO_FICHA): string | null {
  const v = o[campo];
  const max = MAX_TEXTO_FICHA[campo];
  return typeof v === 'string' && v.length > max ? `${campo}: máximo ${max} caracteres.` : null;
}

/** Errores en español de una ficha de CRM; lista vacía si es válida. Nunca lanza. */
export function validarFicha(f: unknown): string[] {
  if (typeof f !== 'object' || f === null || Array.isArray(f)) return ['La ficha debe ser un objeto.'];
  const o = f as Record<string, unknown>;
  const errores: string[] = [];

  if (!esTextoNoVacio(o['idCRM'])) errores.push('idCRM: es obligatorio.');
  if (!esTextoNoVacio(o['cliente'])) errores.push('cliente: es obligatorio.');
  if (!esTextoNoVacio(o['oportunidad'])) errores.push('oportunidad: es obligatoria.');
  if (typeof o['pais'] !== 'string' || !/^[A-Z]{2}$/.test(o['pais'])) {
    errores.push('pais: debe ser un código de 2 letras mayúsculas (por ejemplo, MX).');
  }
  const tipo = o['tipo'];
  if (tipo !== null && (typeof tipo !== 'string' || !TIPOS.includes(tipo))) {
    errores.push(`tipo: debe ser ${TIPOS.join(', ')} o null.`);
  }
  const lineas = o['lineas'];
  if (!Array.isArray(lineas) || lineas.length < 1) {
    errores.push('lineas: debe incluir al menos una línea.');
  } else if (lineas.some((l) => typeof l !== 'string' || !LINEAS.includes(l))) {
    errores.push(`lineas: solo se permiten ${LINEAS.join(', ')}.`);
  }
  const tcv = o['tcv'];
  if (typeof tcv !== 'number' || !Number.isFinite(tcv) || tcv < 0) {
    errores.push('tcv: debe ser un número mayor o igual a 0.');
  }
  if (typeof o['moneda'] !== 'string' || !/^[A-Z]{3}$/.test(o['moneda'])) {
    errores.push('moneda: debe ser un código de 3 letras mayúsculas (por ejemplo, USD).');
  }
  const etapa = o['etapaCRM'];
  if (typeof etapa !== 'number' || !Number.isInteger(etapa) || etapa < 0 || etapa > 8) {
    errores.push('etapaCRM: debe ser un entero entre 0 y 8.');
  }
  if (!fechaValida(o['fechaCierreCRM'])) errores.push('fechaCierreCRM: debe ser una fecha válida con formato AAAA-MM-DD.');
  if (!fechaValida(o['fechaCreacion'])) errores.push('fechaCreacion: debe ser una fecha válida con formato AAAA-MM-DD.');
  if (!esTextoNoVacio(o['vendedor'])) errores.push('vendedor: es obligatorio.');
  for (const campo of ['idCRM', 'cliente', 'oportunidad', 'vendedor'] as const) {
    const e = errorLargo(o, campo);
    if (e !== null) errores.push(e);
  }

  return errores;
}

/** Monto en USD, o null si no hay tipo de cambio para la moneda. */
export function convertirAUSD(tcv: number, moneda: string, tc: TiposCambio): number | null {
  if (!Object.prototype.hasOwnProperty.call(tc, moneda)) return null;
  const tasa = tc[moneda];
  if (typeof tasa !== 'number' || !Number.isFinite(tasa)) return null;
  return tcv * tasa;
}

const ausente = <T>(): Evidencia<T> => ({ valor: null, nivel: 'ausente' });

/** Expediente vacío: evidencias ausentes, booleanos en false, sin influencias. */
function expedienteVacio(): Expediente {
  return {
    id: '',
    cuenta: {
      nombre: '',
      pais: '',
      esClienteNetlogistik: false,
      esClienteOtraTowerArgano: false,
      clienteIdeal: [0, 1, 2, 3, 4].map(() => ausente<number>()),
    },
    lineas: [],
    montoUSD: null,
    etapaCRM: 0,
    fechaCierreCRM: null,
    fechaCreacion: '',
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
}

/** Traduce la ficha del CRM a un expediente nuevo (sin influencias ni evidencias). */
export function fichaAExpediente(f: Ficha, tc: TiposCambio): Expediente {
  const exp = expedienteVacio();
  exp.id = f.idCRM;
  exp.cuenta.nombre = f.cliente;
  exp.cuenta.pais = f.pais;
  exp.lineas = [...f.lineas];
  exp.montoUSD = convertirAUSD(f.tcv, f.moneda, tc);
  exp.etapaCRM = Math.min(f.etapaCRM, 5) as Etapa;
  exp.fechaCierreCRM = f.fechaCierreCRM;
  exp.fechaCreacion = f.fechaCreacion;
  exp.esRFP = f.esRFP ?? false;
  switch (f.tipo) {
    case 'EE':
      exp.esChangeOrder = true;
      exp.cuenta.esClienteNetlogistik = true;
      break;
    case 'EN':
      exp.cuenta.esClienteNetlogistik = true;
      break;
    case 'ENxT':
      exp.cuenta.esClienteOtraTowerArgano = true;
      break;
    default:
      break;
  }
  return exp;
}

/** Oportunidad nueva a partir de la ficha: sin sesiones ni diagnóstico. */
export function crearOportunidad(f: Ficha, tc: TiposCambio = TIPOS_CAMBIO_DEFAULT): Oportunidad {
  return {
    formato: 1,
    id: f.idCRM,
    ficha: f,
    cerrada: f.etapaCRM >= 6,
    expediente: fichaAExpediente(f, tc),
    sesiones: [],
    sesionActual: null,
    ultimoDiagnostico: null,
    eventos: [],
  };
}
