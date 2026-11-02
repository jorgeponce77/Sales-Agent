import { CONFIG_DEFAULT } from 'motor-sales-agent';
import type { Alternativa, Expediente, Influencia } from 'motor-sales-agent';
import { convertirAUSD, validarFicha } from '../ficha.js';
import type { Ficha } from '../tipos.js';
import { aplicarEscritura, rechazar } from './escritura.js';
import type { EstadoTurno, ResultadoHerramienta } from './escritura.js';

type Herramienta = (estado: EstadoTurno, input: unknown) => ResultadoHerramienta;
type Obj = Record<string, unknown>;

const esObjeto = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const esTexto = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const presente = (o: Obj, k: string): boolean => o[k] !== undefined;

/** Minúsculas, sin acentos y con espacios colapsados. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Envuelve una herramienta para que nunca lance: cualquier excepción se vuelve `{ ok: false }`. */
function segura(nombre: string, fn: (estado: EstadoTurno, input: unknown) => ResultadoHerramienta): Herramienta {
  return (estado, input) => {
    try {
      return fn(estado, input);
    } catch (e) {
      const mensaje = `error interno: ${e instanceof Error ? e.message : String(e)}`;
      try {
        estado.eventos.push({ tipo: 'error', descripcion: `Falló ${nombre}. ${mensaje}`, fecha: estado.hoy });
      } catch {
        // el estado mismo es inutilizable: solo devolvemos el error
      }
      return { ok: false, errores: [mensaje] };
    }
  };
}

/** Entrada que no es un objeto: rechazo con evento. */
function entradaInvalida(estado: EstadoTurno, nombre: string): ResultadoHerramienta {
  return rechazar(estado, nombre, ['entrada: se esperaba un objeto con los campos de la herramienta']);
}

// ---------------------------------------------------------------------------
// registrarDato
// ---------------------------------------------------------------------------

type Tipo = 'evTexto' | 'evBool' | 'evNum' | 'bool' | 'boolNull' | 'textoNull';

/** Lista blanca (anexo §5) con el tipo de cada campo. */
const TIPOS_CAMPO: Record<string, Tipo> = {
  'bant.budget': 'evTexto',
  'bant.authority': 'evTexto',
  'bant.need': 'evTexto',
  'bant.time': 'evTexto',
  'compellingEvent.fecha': 'evTexto',
  'compellingEvent.dueno': 'evTexto',
  'compellingEvent.costoInaccion': 'evTexto',
  'compellingEvent.descripcion': 'textoNull',
  'compellingEvent.urgenciaFalsa': 'bool',
  prioridad: 'evTexto',
  contribucionDiferenciadora: 'evTexto',
  reorganizacion: 'evBool',
  criteriosCompraDefinidos: 'bool',
  preguntaCompetenciaHecha: 'bool',
  esRFP: 'bool',
  contactoPrevioRFP: 'boolNull',
  sensacion: 'textoNull',
  'higieneCRM.valores': 'boolNull',
  'higieneCRM.actividades': 'boolNull',
  'higieneCRM.etapas': 'boolNull',
  'cuenta.clienteIdeal.0': 'evNum',
  'cuenta.clienteIdeal.1': 'evNum',
  'cuenta.clienteIdeal.2': 'evNum',
  'cuenta.clienteIdeal.3': 'evNum',
  'cuenta.clienteIdeal.4': 'evNum',
  'cuenta.esClienteNetlogistik': 'bool',
  'cuenta.esClienteOtraTowerArgano': 'bool',
  esChangeOrder: 'bool',
  cambioDeDueno: 'bool',
  esMercadoNuevo: 'bool',
  revisionGerenteProxima: 'bool',
};

export const CAMPOS_REGISTRABLES: readonly string[] = Object.freeze(Object.keys(TIPOS_CAMPO));

const NOMBRE_TIPO: Record<Tipo, string> = {
  evTexto: 'texto',
  evBool: 'verdadero o falso',
  evNum: 'un número',
  bool: 'verdadero o falso',
  boolNull: 'verdadero, falso o null',
  textoNull: 'texto o null',
};

/** Error de tipo del valor para el campo, o null si es del tipo esperado. */
function errorDeValor(tipo: Tipo, valor: unknown, nivel: unknown): string | null {
  const vacioPermitido = tipo.startsWith('ev') && nivel === 'ausente' && valor === null;
  if (vacioPermitido) return null;
  switch (tipo) {
    case 'evTexto':
      return typeof valor === 'string' ? null : 'debe ser texto';
    case 'evBool':
    case 'bool':
      return typeof valor === 'boolean' ? null : 'debe ser verdadero o falso';
    case 'evNum':
      return typeof valor === 'number' && Number.isFinite(valor) ? null : 'debe ser un número';
    case 'boolNull':
      return valor === null || typeof valor === 'boolean' ? null : 'debe ser verdadero, falso o null';
    case 'textoNull':
      return valor === null || typeof valor === 'string' ? null : 'debe ser texto o null';
  }
}

/** Contenedor y clave final de una ruta de la lista blanca dentro del expediente. */
function destino(exp: Expediente, campo: string): { padre: Record<string, unknown>; clave: string } {
  const partes = campo.split('.');
  const clave = partes.pop() as string;
  let padre: unknown = exp;
  for (const p of partes) padre = (padre as Record<string, unknown>)[p];
  return { padre: padre as Record<string, unknown>, clave };
}

export const registrarDato: Herramienta = segura('registrar_dato', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'registrar_dato');
  const { campo, valor, nivel, fuente } = input;
  if (typeof campo !== 'string') return rechazar(estado, 'registrar_dato', ['campo: debe ser texto']);
  if (!Object.prototype.hasOwnProperty.call(TIPOS_CAMPO, campo)) {
    return rechazar(estado, `dato de "${campo}"`, [`campo no registrable: ${campo}`]);
  }
  const tipo = TIPOS_CAMPO[campo] as Tipo;
  const esEvidencia = tipo.startsWith('ev');
  const descripcion =
    `Dato registrado: ${campo} = ${JSON.stringify(valor) ?? 'null'}` +
    (esEvidencia ? ` (${String(nivel)}${typeof fuente === 'string' && fuente !== '' ? `, fuente: ${fuente}` : ''})` : '');

  return aplicarEscritura(estado, descripcion, (exp) => {
    if (!presente(input, 'valor')) throw new Error('valor: es obligatorio');
    const errorValor = errorDeValor(tipo, valor, nivel);
    if (errorValor !== null) throw new Error(`valor: ${errorValor} (${campo} espera ${NOMBRE_TIPO[tipo]})`);
    const { padre, clave } = destino(exp, campo);
    if (!esEvidencia) {
      padre[clave] = valor;
      return;
    }
    if (nivel === undefined || nivel === null) {
      throw new Error('nivel: es obligatorio para este campo (confirmado, supuesto o ausente)');
    }
    if (fuente !== undefined && fuente !== null && typeof fuente !== 'string') {
      throw new Error('fuente: debe ser texto');
    }
    padre[clave] = {
      valor,
      nivel,
      ...(typeof fuente === 'string' && fuente !== '' ? { fuente } : {}),
      ...(nivel === 'confirmado' ? { fecha: estado.hoy } : {}),
    };
  });
});

// ---------------------------------------------------------------------------
// registrarCriterioArgano
// ---------------------------------------------------------------------------

export const registrarCriterioArgano: Herramienta = segura('registrar_criterio_argano', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'registrar_criterio_argano');
  const { clave, nivel } = input;
  if (typeof clave !== 'string' || !CONFIG_DEFAULT.criteriosArgano.some((c) => c.clave === clave)) {
    return rechazar(estado, 'criterio de Argano', [`clave: criterio de Argano inexistente: ${String(clave)}`]);
  }
  return aplicarEscritura(estado, `Criterio de Argano "${clave}": ${String(nivel)}`, (exp) => {
    if (nivel === undefined || nivel === null) throw new Error('nivel: es obligatorio (confirmado, supuesto o ausente)');
    const nuevo = { clave, nivel } as Expediente['criteriosArgano'][number];
    const i = exp.criteriosArgano.findIndex((c) => c.clave === clave);
    if (i >= 0) exp.criteriosArgano[i] = nuevo;
    else exp.criteriosArgano.push(nuevo);
  });
});

// ---------------------------------------------------------------------------
// registrarInfluencia
// ---------------------------------------------------------------------------

const CAMPOS_INFLUENCIA = [
  'roles', 'grado', 'modo', 'calificacion', 'contactada', 'ultimoContacto',
  'nuevaEnPuesto', 'trDeclaracion', 'prioridad',
] as const;

export const registrarInfluencia: Herramienta = segura('registrar_influencia', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'registrar_influencia');
  const { personaId, nombre } = input;
  if (nombre !== undefined && !esTexto(nombre)) return rechazar(estado, 'influencia', ['nombre: debe ser texto']);
  if (personaId !== undefined && typeof personaId !== 'string') {
    return rechazar(estado, 'influencia', ['personaId: debe ser texto']);
  }
  if (personaId === undefined && nombre === undefined) {
    return rechazar(estado, 'influencia', ['nombre: es obligatorio']);
  }
  const etiqueta = typeof nombre === 'string' ? nombre : (personaId as string);
  const cambios = CAMPOS_INFLUENCIA.filter((k) => presente(input, k));

  return aplicarEscritura(estado, `Influencia ${etiqueta}`, (exp) => {
    if (presente(input, 'contactada') && typeof input['contactada'] !== 'boolean') throw new Error('contactada: debe ser verdadero o falso');
    if (presente(input, 'nuevaEnPuesto') && typeof input['nuevaEnPuesto'] !== 'boolean') throw new Error('nuevaEnPuesto: debe ser verdadero o falso');
    const tr = input['trDeclaracion'];
    if (tr !== undefined && tr !== null && typeof tr !== 'string') throw new Error('trDeclaracion: debe ser texto o null');

    let existente: Influencia | undefined;
    if (typeof personaId === 'string') existente = exp.influencias.find((i) => i.personaId === personaId);
    if (!existente && typeof nombre === 'string') {
      const clave = normalizar(nombre);
      existente = exp.influencias.find((i) => normalizar(i.nombre) === clave);
    }

    if (existente) {
      for (const k of cambios) (existente as unknown as Obj)[k] = input[k];
      return;
    }
    if (typeof nombre !== 'string') throw new Error('nombre: es obligatorio para crear una influencia nueva');
    const nueva: Influencia = {
      personaId: 'p-' + normalizar(nombre),
      nombre,
      roles: [],
      grado: null,
      modo: null,
      calificacion: null,
      contactada: false,
      nuevaEnPuesto: false,
      trDeclaracion: null,
      prioridad: null,
    };
    for (const k of cambios) (nueva as unknown as Obj)[k] = input[k];
    exp.influencias.push(nueva);
  });
});

// ---------------------------------------------------------------------------
// registrarAlternativa
// ---------------------------------------------------------------------------

export const registrarAlternativa: Herramienta = segura('registrar_alternativa', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'registrar_alternativa');
  const { tipo, nombre, posicion } = input;
  if (nombre !== undefined && nombre !== null && typeof nombre !== 'string') {
    return rechazar(estado, 'alternativa', ['nombre: debe ser texto o null']);
  }
  const etiqueta = typeof nombre === 'string' && nombre !== '' ? ` "${nombre}"` : '';
  return aplicarEscritura(estado, `Alternativa ${String(tipo)}${etiqueta}`, (exp) => {
    if (typeof tipo !== 'string') throw new Error('tipo: es obligatorio');
    const clave = normalizar(typeof nombre === 'string' ? nombre : '');
    const existente = exp.alternativas.find((a) => a.tipo === tipo && normalizar(a.nombre ?? '') === clave);
    if (existente) {
      if (presente(input, 'posicion')) existente.posicion = posicion as Alternativa['posicion'];
    } else {
      exp.alternativas.push({
        tipo: tipo as Alternativa['tipo'],
        nombre: typeof nombre === 'string' && nombre !== '' ? nombre : null,
        posicion: presente(input, 'posicion') ? (posicion as Alternativa['posicion']) : null,
      });
    }
    exp.preguntaCompetenciaHecha = true;
  });
});

// ---------------------------------------------------------------------------
// actualizarCadenaCierre
// ---------------------------------------------------------------------------

const PASOS_CADENA = ['aElegido', 'bContratoEnviado', 'cComentariosRecibidos', 'dEnFirma', 'eFirmado', 'fAltaProveedor', 'hOC'];

export const actualizarCadenaCierre: Herramienta = segura('actualizar_cadena_cierre', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'actualizar_cadena_cierre');
  const { ruta, requiereSOW, pasos } = input;
  const partes: string[] = [];
  if (presente(input, 'ruta')) partes.push(`ruta ${String(ruta)}`);
  if (presente(input, 'requiereSOW')) partes.push(`requiere SOW ${String(requiereSOW)}`);
  if (pasos !== undefined && esObjeto(pasos)) {
    for (const [k, v] of Object.entries(pasos)) partes.push(`paso ${k} ${String(v)}`);
  }
  return aplicarEscritura(estado, `Cadena de cierre: ${partes.join(', ')}`, (exp) => {
    if (!presente(input, 'ruta') && !presente(input, 'requiereSOW') && pasos === undefined) {
      throw new Error('cadena: no se indicó ningún cambio (ruta, requiereSOW o pasos)');
    }
    if (presente(input, 'requiereSOW') && requiereSOW !== null && typeof requiereSOW !== 'boolean') {
      throw new Error('requiereSOW: debe ser verdadero, falso o null');
    }
    if (pasos !== undefined) {
      if (!esObjeto(pasos)) throw new Error('pasos: debe ser un objeto');
      for (const [k, v] of Object.entries(pasos)) {
        if (!PASOS_CADENA.includes(k)) throw new Error(`pasos.${k}: paso desconocido (válidos: ${PASOS_CADENA.join(', ')})`);
        if (typeof v !== 'boolean') throw new Error(`pasos.${k}: debe ser verdadero o falso`);
      }
    }
    if (presente(input, 'ruta')) exp.cadena.ruta = ruta as Expediente['cadena']['ruta'];
    if (presente(input, 'requiereSOW')) exp.cadena.requiereSOW = requiereSOW as boolean | null;
    if (pasos !== undefined) Object.assign(exp.cadena.pasos, pasos);
  });
});

// ---------------------------------------------------------------------------
// actualizarFicha
// ---------------------------------------------------------------------------

const CAMPOS_FICHA: Record<string, string> = {
  etapaCRM: 'Etapa CRM',
  fechaCierreCRM: 'Fecha de cierre CRM',
  tcv: 'TCV',
  moneda: 'Moneda',
};

export const actualizarFicha: Herramienta = segura('actualizar_ficha', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'actualizar_ficha');
  const { campo, valor } = input;
  if (typeof campo !== 'string' || !Object.prototype.hasOwnProperty.call(CAMPOS_FICHA, campo)) {
    return rechazar(estado, 'actualización de la ficha', [
      `campo no permitido: ${String(campo)} (solo ${Object.keys(CAMPOS_FICHA).join(', ')})`,
    ]);
  }
  const clave = campo as 'etapaCRM' | 'fechaCierreCRM' | 'tcv' | 'moneda';
  const anterior = estado.oportunidad.ficha[clave];
  const descripcion = `${CAMPOS_FICHA[clave]} ${String(anterior)} → ${String(valor)} (dicho por el vendedor)`;

  const nueva: Ficha = { ...estado.oportunidad.ficha, [clave]: valor };
  const erroresFicha = validarFicha(nueva);
  if (erroresFicha.length > 0) return rechazar(estado, descripcion, erroresFicha);

  const r = aplicarEscritura(
    estado,
    descripcion,
    (exp) => {
      exp.etapaCRM = Math.min(nueva.etapaCRM, 5) as Expediente['etapaCRM'];
      exp.fechaCierreCRM = nueva.fechaCierreCRM;
      exp.montoUSD = convertirAUSD(nueva.tcv, nueva.moneda, estado.tiposCambio);
    },
    'ficha',
  );
  if (r.ok) {
    estado.oportunidad.ficha = nueva;
    estado.oportunidad.cerrada = nueva.etapaCRM >= 6;
  }
  return r;
});
