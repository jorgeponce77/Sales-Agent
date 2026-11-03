import type { Oportunidad, Uso } from 'agente-sales-agent';
import { esErrorDeCuota } from './almacenNavegador';
import type { StorageMinimo } from './almacenNavegador';

export const CLAVE_USO = 'sa_uso_sesiones_v1';

export const usoCero = (): Uso => ({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });

/**
 * Clave de la sesión abierta de una oportunidad: id, fecha de inicio y número de sesión (cuántas hay archivadas),
 * para que dos sesiones del mismo día no se mezclen. null si no hay sesión abierta.
 */
export function claveSesion(op: Oportunidad | null | undefined): string | null {
  if (op === null || op === undefined || op.sesionActual === null) return null;
  return `${op.id}|${op.sesionActual.inicio}|${op.sesiones.length}`;
}

/** Sesión a la que se cargan los tokens de un turno: la abierta después o, si el turno la cerró, la que estaba abierta. */
export const claveDelTurno = (antes: Oportunidad | null | undefined, despues: Oportunidad): string | null =>
  claveSesion(despues) ?? claveSesion(antes);

interface Registro { usos: Record<string, Uso>; ultima: Record<string, string> }

const esUso = (x: unknown): x is Uso =>
  typeof x === 'object' && x !== null &&
  (['entrada', 'salida', 'cacheLectura', 'cacheEscritura'] as const).every((k) => typeof (x as Record<string, unknown>)[k] === 'number');

function leerRegistro(crudo: string | null): Registro {
  const vacio: Registro = { usos: {}, ultima: {} };
  if (crudo === null) return vacio;
  try {
    const dato = JSON.parse(crudo) as Partial<Registro> | null;
    if (typeof dato !== 'object' || dato === null) return vacio;
    const usos = Object.fromEntries(Object.entries(dato.usos ?? {}).filter(([, u]) => esUso(u)));
    const ultima = Object.fromEntries(Object.entries(dato.ultima ?? {}).filter(([, c]) => typeof c === 'string'));
    return { usos, ultima };
  } catch {
    return vacio;
  }
}

export interface AlmacenUso {
  /** Suma el uso de un turno a la sesión `clave` de la oportunidad `id`. */
  sumar(clave: string, id: string, uso: Uso): void;
  /** Uso de la sesión abierta de la oportunidad o, sin sesión abierta, de su última sesión con uso. */
  deOportunidad(op: Oportunidad | null): Uso;
  borrarOportunidad(id: string): void;
  reiniciar(): void;
  /** El último intento de guardar falló por cuota llena. */
  readonly lleno: boolean;
}

/**
 * Tokens por sesión de cada oportunidad, en el navegador (sobreviven a recargar la página). Es una comodidad:
 * si el storage no existe o falla, se cuenta en memoria y nunca lanza.
 */
export function crearAlmacenUso(storage: StorageMinimo | null): AlmacenUso {
  let registro: Registro = { usos: {}, ultima: {} };
  let lleno = false;
  try {
    registro = leerRegistro(storage?.getItem(CLAVE_USO) ?? null);
  } catch {
    // sin acceso al storage: se cuenta en memoria
  }
  const persistir = (): void => {
    try {
      storage?.setItem(CLAVE_USO, JSON.stringify(registro));
      lleno = false;
    } catch (e) {
      lleno = esErrorDeCuota(e);
    }
  };
  return {
    sumar(clave, id, uso) {
      const previo = registro.usos[clave] ?? usoCero();
      registro.usos[clave] = {
        entrada: previo.entrada + uso.entrada,
        salida: previo.salida + uso.salida,
        cacheLectura: previo.cacheLectura + uso.cacheLectura,
        cacheEscritura: previo.cacheEscritura + uso.cacheEscritura,
      };
      registro.ultima[id] = clave;
      persistir();
    },
    deOportunidad(op) {
      if (op === null) return usoCero();
      const clave = claveSesion(op) ?? registro.ultima[op.id];
      const guardado = clave === undefined ? undefined : registro.usos[clave];
      return guardado === undefined ? usoCero() : { ...guardado };
    },
    borrarOportunidad(id) {
      const prefijo = `${id}|`;
      for (const clave of Object.keys(registro.usos)) if (clave.startsWith(prefijo)) delete registro.usos[clave];
      delete registro.ultima[id];
      persistir();
    },
    reiniciar() {
      registro = { usos: {}, ultima: {} };
      lleno = false;
      try {
        storage?.removeItem(CLAVE_USO);
      } catch {
        // nada que hacer: se sigue contando en memoria
      }
    },
    get lleno() {
      return lleno;
    },
  };
}
