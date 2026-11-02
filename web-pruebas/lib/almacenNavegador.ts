import type { Oportunidad } from 'agente-sales-agent';

export const CLAVE_ALMACEN = 'sa_oportunidades_v1';

export type EstadoAlmacen = 'ok' | 'formato_incompatible' | 'sin_almacen';
type StorageMinimo = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Almacen {
  listar(): Oportunidad[];
  guardar(op: Oportunidad): void;
  obtener(id: string): Oportunidad | null;
  borrar(id: string): void;
  /** Borra todo lo guardado (también lo incompatible) y vuelve a usar el storage. */
  reiniciar(): void;
  readonly estado: EstadoAlmacen;
}

const esOportunidadGuardada = (x: unknown): boolean =>
  typeof x === 'object' && x !== null && (x as { formato?: unknown }).formato === 1;

/**
 * Oportunidades de prueba en el navegador (solo cliente). Todo acceso al storage va en try/catch: sin storage
 * o si lanza, se trabaja en memoria (`sin_almacen`). Si lo guardado no se entiende, queda `formato_incompatible`,
 * se trabaja en memoria y no se pisa lo que había hasta que se llame a `reiniciar`.
 */
export function crearAlmacen(storage: StorageMinimo | null): Almacen {
  let estado: EstadoAlmacen = storage === null ? 'sin_almacen' : 'ok';
  let enMemoria = storage === null;
  let memoria: Oportunidad[] = [];

  const pasarAMemoria = (motivo: EstadoAlmacen): void => {
    enMemoria = true;
    estado = motivo;
    memoria = [];
  };

  const cargar = (): Oportunidad[] => {
    if (enMemoria || storage === null) return memoria;
    let crudo: string | null;
    try {
      crudo = storage.getItem(CLAVE_ALMACEN);
    } catch {
      pasarAMemoria('sin_almacen');
      return memoria;
    }
    if (crudo === null) return [];
    let dato: unknown;
    try {
      dato = JSON.parse(crudo);
    } catch {
      pasarAMemoria('formato_incompatible');
      return memoria;
    }
    if (!Array.isArray(dato) || !dato.every(esOportunidadGuardada)) {
      pasarAMemoria('formato_incompatible');
      return memoria;
    }
    return dato as Oportunidad[];
  };

  const persistir = (lista: Oportunidad[]): void => {
    if (enMemoria || storage === null) {
      memoria = lista;
      return;
    }
    try {
      storage.setItem(CLAVE_ALMACEN, JSON.stringify(lista));
    } catch {
      pasarAMemoria('sin_almacen');
      memoria = lista;
    }
  };

  cargar(); // fija el estado desde el inicio

  return {
    listar: () => [...cargar()],
    guardar(op) {
      const lista = cargar();
      const i = lista.findIndex((o) => o.id === op.id);
      persistir(i < 0 ? [...lista, op] : lista.map((o, j) => (j === i ? op : o)));
    },
    obtener: (id) => cargar().find((o) => o.id === id) ?? null,
    borrar(id) {
      persistir(cargar().filter((o) => o.id !== id));
    },
    reiniciar() {
      memoria = [];
      if (storage === null) return;
      try {
        storage.removeItem(CLAVE_ALMACEN);
        enMemoria = false;
        estado = 'ok';
      } catch {
        pasarAMemoria('sin_almacen');
      }
    },
    get estado() {
      return estado;
    },
  };
}
