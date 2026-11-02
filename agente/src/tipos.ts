import type { Expediente, Linea, TipoOportunidad, Diagnostico } from 'motor-sales-agent';

export type ModoSesion = 'calificar' | 'revision_rapida';

export interface Ficha {
  idCRM: string; cliente: string; oportunidad: string; pais: string; lineas: Linea[];
  tipo: TipoOportunidad | null; etapaCRM: number;            // 0..8
  tcv: number; moneda: string; fechaCreacion: string; fechaCierreCRM: string; vendedor: string;
  probabilidadCRM: number | null; esRFP: boolean | null; ultimaActualizacionCRM: string | null;
}

export interface Evento { tipo: 'dato' | 'rechazo' | 'ficha' | 'accion' | 'sesion' | 'error'; descripcion: string; fecha: string }
export interface Mensaje { rol: 'vendedor' | 'agente'; texto: string; fecha: string }
export interface ResumenSesion { fecha: string; modo: ModoSesion; resumen: string; versionInstrucciones: string }

export interface SesionActual {
  modo: ModoSesion; inicio: string; turnosVendedor: number; versionInstrucciones: string;
  historial: unknown[];        // MessageParam[] de la API, tal cual (incluye bloques tool_use/tool_result)
  transcripcion: Mensaje[];    // lo que ve el usuario
}

export interface Oportunidad {
  formato: 1; id: string; ficha: Ficha; cerrada: boolean;    // cerrada = ficha.etapaCRM >= 6
  expediente: Expediente; sesiones: ResumenSesion[]; sesionActual: SesionActual | null;
  ultimoDiagnostico: Diagnostico | null; eventos: Evento[];
}

export interface Uso { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }

export interface ResultadoTurno {
  respuestas: string[]; oportunidad: Oportunidad; diagnostico: Diagnostico | null;
  eventos: Evento[]; uso: Uso; error: string | null;
}

/** moneda → USD por unidad; por defecto { USD: 1 } */
export type TiposCambio = Record<string, number>;
export const TIPOS_CAMBIO_DEFAULT: TiposCambio = { USD: 1 };
