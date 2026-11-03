import { validarExpediente } from 'motor-sales-agent';
import type { Expediente } from 'motor-sales-agent';
import type { Evento, Oportunidad, TiposCambio } from '../tipos.js';

export interface EstadoTurno {
  oportunidad: Oportunidad;
  hoy: string;
  eventos: Evento[];
  tiposCambio: TiposCambio;
  sesionCerrada: { resumen: string } | null;
}

export type ResultadoHerramienta =
  | { ok: true; datos?: unknown; mensaje?: string }
  | { ok: false; errores: string[] };

export type Herramienta = (estado: EstadoTurno, input: unknown) => ResultadoHerramienta;

/** Registra el rechazo en los eventos del turno y devuelve el resultado de error. */
export function rechazar(estado: EstadoTurno, descripcion: string, errores: string[]): ResultadoHerramienta {
  estado.eventos.push({
    tipo: 'rechazo',
    descripcion: `No se registró: ${descripcion}. ${errores.join('; ')}`,
    fecha: estado.hoy,
  });
  return { ok: false, errores };
}

/**
 * Aplica `mutar` sobre una copia del expediente y la valida con el motor.
 * Si es válida, reemplaza el expediente y registra el evento; si no, no conserva nada.
 * Nunca lanza.
 */
export function aplicarEscritura(
  estado: EstadoTurno,
  descripcion: string,
  mutar: (exp: Expediente) => void,
  tipoEvento: 'dato' | 'ficha' | 'accion' = 'dato',
): ResultadoHerramienta {
  try {
    const copia = structuredClone(estado.oportunidad.expediente);
    try {
      mutar(copia);
    } catch (e) {
      return rechazar(estado, descripcion, [e instanceof Error ? e.message : String(e)]);
    }
    const errores = validarExpediente(copia).map((x) => `${x.campo}: ${x.mensaje}`);
    if (errores.length > 0) return rechazar(estado, descripcion, errores);
    estado.oportunidad.expediente = copia;
    estado.eventos.push({ tipo: tipoEvento, descripcion, fecha: estado.hoy });
    return { ok: true };
  } catch (e) {
    return rechazar(estado, descripcion, [`error interno: ${e instanceof Error ? e.message : String(e)}`]);
  }
}

/** Envuelve una herramienta para que nunca lance: cualquier excepción se vuelve `{ ok: false }`. */
export function segura(nombre: string, fn: (estado: EstadoTurno, input: unknown) => ResultadoHerramienta): Herramienta {
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

/** Minúsculas, sin acentos y con espacios colapsados. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
