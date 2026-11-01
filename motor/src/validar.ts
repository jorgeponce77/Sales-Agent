import type { Expediente, ErrorValidacion } from './tipos.js';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Verdadero si `s` es una fecha ISO `YYYY-MM-DD` que existe en el calendario. */
export function fechaValida(s: unknown): boolean {
  if (typeof s !== 'string' || !PATRON_FECHA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function esEntero(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

type Obj = Record<string, unknown>;
const esObjeto = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

const NIVELES = ['confirmado', 'supuesto', 'ausente'];
const MODOS = ['C', 'P', 'E', 'EC'];
const GRADOS = ['A', 'M', 'B'];
const ROLES = ['E', 'U', 'T', 'C'];
const PRIORIDADES = ['urgente', 'activa', 'importante', 'postergable'];
const SENSACIONES = [
  'euforico', 'excelente', 'seguro', 'comodo', 'bien', 'preocupado', 'molesto', 'inquieto', 'con_miedo', 'con_panico',
];
const TIPOS_ALTERNATIVA = ['proveedor', 'interna', 'presupuesto', 'no_hacer_nada'];
const POSICIONES = ['dominante', 'nula', 'compartida', 'alternativa'];
const RUTAS = ['contrato', 'oc', 'ambas_oc_tras_contrato', 'ambas_independientes', 'desconocida'];
const LINEAS = ['WMS', 'TMS', 'PLANEACION_DEMANDA', 'VOICE'];

const lista = (valores: string[]): string => valores.join(', ');

/**
 * Revisa rangos, formas y valores de lista del expediente. Nunca lanza, ni con
 * elementos nulos ni con bloques faltantes: devuelve la lista de errores
 * (vacía si el expediente es válido).
 */
export function validarExpediente(exp: Expediente): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const error = (campo: string, mensaje: string): void => { errores.push({ campo, mensaje }); };

  if (!esObjeto(exp)) {
    error('expediente', 'El expediente debe ser un objeto');
    return errores;
  }
  const e = exp as unknown as Obj;

  const revisarFecha = (campo: string, valor: unknown): void => {
    if (valor === null || valor === undefined) return;
    if (!fechaValida(valor)) {
      error(campo, `Fecha inválida "${String(valor)}": se espera el formato YYYY-MM-DD con una fecha real`);
    }
  };

  /** Valor de lista: debe estar en `validos` (y `null` solo si `admiteNull`). */
  const revisarLista = (campo: string, valor: unknown, validos: string[], admiteNull: boolean): void => {
    if (valor === null && admiteNull) return;
    if (typeof valor !== 'string' || !validos.includes(valor)) {
      error(campo, `Valor inválido ${JSON.stringify(valor) ?? 'undefined'}: debe ser uno de ${lista(validos)}${admiteNull ? ' o null' : ''}`);
    }
  };

  const bloque = (campo: string, valor: unknown): Obj | null => {
    if (esObjeto(valor)) return valor;
    error(campo, `Falta el bloque "${campo}" o no es un objeto`);
    return null;
  };

  const arreglo = (campo: string, valor: unknown): unknown[] => {
    if (Array.isArray(valor)) return valor;
    error(campo, `"${campo}" debe ser una lista`);
    return [];
  };

  // Evidencia con fecha de captura; si el valor mismo es una fecha, `valorEsFecha`;
  // `valorValido` restringe los valores de lista (la evidencia de prioridad).
  const revisarEvidencia = (
    campo: string,
    ev: unknown,
    opciones: { valorEsFecha?: boolean; valorValido?: string[] } = {},
  ): Obj | null => {
    if (!esObjeto(ev)) {
      error(campo, `Falta la evidencia "${campo}" o no es un objeto`);
      return null;
    }
    revisarLista(`${campo}.nivel`, ev['nivel'], NIVELES, false);
    revisarFecha(`${campo}.fecha`, ev['fecha']);
    if (opciones.valorEsFecha) revisarFecha(`${campo}.valor`, ev['valor']);
    if (opciones.valorValido !== undefined) revisarLista(`${campo}.valor`, ev['valor'], opciones.valorValido, true);
    return ev;
  };

  // Fechas y etapa del expediente
  revisarFecha('fechaCierreCRM', e['fechaCierreCRM']);
  revisarFecha('fechaCreacion', e['fechaCreacion']);
  if (e['fechaCreacion'] === null || e['fechaCreacion'] === undefined) {
    error('fechaCreacion', 'La fecha de creación es obligatoria');
  }
  const etapa = e['etapaCRM'];
  if (!(esEntero(etapa) && etapa >= 0 && etapa <= 5)) {
    error('etapaCRM', `La etapa del CRM debe ser un entero de 0 a 5 (recibido ${String(etapa)})`);
  }

  // Valores de lista del expediente
  if (e['sensacion'] !== null) revisarLista('sensacion', e['sensacion'], SENSACIONES, false);
  arreglo('lineas', e['lineas']).forEach((l, i) => revisarLista(`lineas[${i}]`, l, LINEAS, false));

  // Cuenta y cliente ideal: cada criterio en [−5, +5] (el 0 sí es válido aquí)
  const cuenta = bloque('cuenta', e['cuenta']);
  if (cuenta) {
    arreglo('cuenta.clienteIdeal', cuenta['clienteIdeal']).forEach((ev, i) => {
      const campo = `cuenta.clienteIdeal[${i}]`;
      const evidencia = revisarEvidencia(campo, ev);
      const v = evidencia?.['valor'];
      if (v !== null && v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= -5 && v <= 5)) {
        error(`${campo}.valor`, `El criterio de cliente ideal debe estar entre −5 y +5 (recibido ${String(v)})`);
      }
    });
  }

  // Influencias: calificación ∈ {−5..−1, 1..5}; el 0 no existe
  arreglo('influencias', e['influencias']).forEach((raw, i) => {
    const campo = `influencias[${i}]`;
    if (!esObjeto(raw)) {
      error(campo, 'La influencia debe ser un objeto');
      return;
    }
    const c = raw['calificacion'];
    if (c !== null && c !== undefined && !(esEntero(c) && c !== 0 && c >= -5 && c <= 5)) {
      error(
        `${campo}.calificacion`,
        `La calificación debe ser un entero de −5 a −1 o de +1 a +5; el 0 no existe (recibido ${String(c)})`,
      );
    }
    revisarLista(`${campo}.modo`, raw['modo'], MODOS, true);
    revisarLista(`${campo}.grado`, raw['grado'], GRADOS, true);
    revisarLista(`${campo}.prioridad`, raw['prioridad'], PRIORIDADES, true);
    if (!Array.isArray(raw['roles'])) {
      error(`${campo}.roles`, `"roles" debe ser una lista con valores de ${lista(ROLES)}`);
    } else {
      raw['roles'].forEach((r, j) => revisarLista(`${campo}.roles[${j}]`, r, ROLES, false));
    }
    revisarFecha(`${campo}.ultimoContacto`, raw['ultimoContacto']);
  });

  // Alternativas
  arreglo('alternativas', e['alternativas']).forEach((raw, i) => {
    const campo = `alternativas[${i}]`;
    if (!esObjeto(raw)) {
      error(campo, 'La alternativa debe ser un objeto');
      return;
    }
    revisarLista(`${campo}.tipo`, raw['tipo'], TIPOS_ALTERNATIVA, false);
    revisarLista(`${campo}.posicion`, raw['posicion'], POSICIONES, true);
  });

  // Evidencias del expediente
  revisarEvidencia('prioridad', e['prioridad'], { valorValido: PRIORIDADES });
  revisarEvidencia('contribucionDiferenciadora', e['contribucionDiferenciadora']);
  revisarEvidencia('reorganizacion', e['reorganizacion']);
  const bant = bloque('bant', e['bant']);
  if (bant) {
    for (const k of ['budget', 'authority', 'need', 'time']) revisarEvidencia(`bant.${k}`, bant[k]);
  }
  const ce = bloque('compellingEvent', e['compellingEvent']);
  if (ce) {
    revisarEvidencia('compellingEvent.fecha', ce['fecha'], { valorEsFecha: true });
    revisarEvidencia('compellingEvent.dueno', ce['dueno']);
    revisarEvidencia('compellingEvent.costoInaccion', ce['costoInaccion']);
  }

  // Cadena de cierre
  const cadena = bloque('cadena', e['cadena']);
  if (cadena) {
    revisarLista('cadena.ruta', cadena['ruta'], RUTAS, false);
    bloque('cadena.pasos', cadena['pasos']);
  }

  // Criterios de Argano cumplidos
  arreglo('criteriosArgano', e['criteriosArgano']).forEach((raw, i) => {
    const campo = `criteriosArgano[${i}]`;
    if (!esObjeto(raw)) {
      error(campo, 'El criterio debe ser un objeto');
      return;
    }
    revisarLista(`${campo}.nivel`, raw['nivel'], NIVELES, false);
  });

  // Acciones previas
  arreglo('accionesPrevias', e['accionesPrevias']).forEach((raw, i) => {
    const campo = `accionesPrevias[${i}]`;
    if (!esObjeto(raw)) {
      error(campo, 'La acción previa debe ser un objeto');
      return;
    }
    revisarFecha(`${campo}.cuando`, raw['cuando']);
  });

  return errores;
}
