import { validarFicha } from 'agente-sales-agent';
import type { ModoSesion } from 'agente-sales-agent';
import { validarExpediente } from 'motor-sales-agent';

export const MODOS: readonly ModoSesion[] = ['calificar', 'revision_rapida'];
const esModo = (x: unknown): x is ModoSesion => (MODOS as readonly unknown[]).includes(x);
const ROLES_MENSAJE = ['vendedor', 'agente'];
const TIPOS_BLOQUE = ['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking'];
const MAX_ERRORES_EXPEDIENTE = 5;
const TOPE_TURNOS = 40;

type Obj = Record<string, unknown>;
export const esObjeto = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const esTexto = (x: unknown): x is string => typeof x === 'string';

/** Errores de una transcripción (lista de `{rol, texto, fecha}`). */
function validarTranscripcion(t: unknown, ruta: string): string[] {
  if (!Array.isArray(t)) return [`${ruta}: debe ser una lista de mensajes.`];
  for (let i = 0; i < t.length; i++) {
    const m: unknown = t[i];
    if (!esObjeto(m) || !ROLES_MENSAJE.includes(m['rol'] as string) || !esTexto(m['texto']) || !esTexto(m['fecha'])) {
      return [`${ruta}[${i}]: cada mensaje debe tener rol (vendedor o agente), texto y fecha.`];
    }
  }
  return [];
}

/** Errores de un mensaje del historial de la API de Anthropic (solo la forma, no el contenido). */
function validarMensajeHistorial(m: unknown, ruta: string): string[] {
  if (!esObjeto(m)) return [`${ruta}: debe ser un objeto.`];
  if (m['role'] !== 'user' && m['role'] !== 'assistant') return [`${ruta}: role debe ser user o assistant.`];
  const c = m['content'];
  if (esTexto(c)) return [];
  if (!Array.isArray(c)) return [`${ruta}: content debe ser texto o una lista de bloques.`];
  if (c.some((b: unknown) => !esObjeto(b) || !TIPOS_BLOQUE.includes(b['type'] as string))) {
    return [`${ruta}: content tiene un bloque que no es de un tipo permitido (${TIPOS_BLOQUE.join(', ')}).`];
  }
  return [];
}

function validarSesionActual(s: unknown): string[] {
  if (s === null) return [];
  if (!esObjeto(s)) return ['sesionActual: debe ser null o un objeto.'];
  const errores: string[] = [];
  if (!esModo(s['modo'])) errores.push('sesionActual.modo: debe ser calificar o revision_rapida.');
  if (!esTexto(s['inicio'])) errores.push('sesionActual.inicio: debe ser texto.');
  const turnos = s['turnosVendedor'];
  if (typeof turnos !== 'number' || !Number.isInteger(turnos) || turnos < 0 || turnos > TOPE_TURNOS) {
    errores.push(`sesionActual.turnosVendedor: debe ser un entero entre 0 y ${TOPE_TURNOS}.`);
  }
  const h = s['historial'];
  if (!Array.isArray(h)) {
    errores.push('sesionActual.historial: debe ser una lista de mensajes.');
  } else {
    for (let i = 0; i < h.length; i++) {
      const e = validarMensajeHistorial(h[i], `sesionActual.historial[${i}]`);
      if (e.length > 0) {
        errores.push(...e);
        break;
      }
    }
  }
  errores.push(...validarTranscripcion(s['transcripcion'], 'sesionActual.transcripcion'));
  return errores;
}

function validarSesiones(sesiones: unknown): string[] {
  if (!Array.isArray(sesiones)) return ['sesiones: debe ser una lista.'];
  for (let i = 0; i < sesiones.length; i++) {
    const s: unknown = sesiones[i];
    const ruta = `sesiones[${i}]`;
    if (!esObjeto(s)) return [`${ruta}: debe ser un objeto.`];
    if (!esTexto(s['fecha'])) return [`${ruta}.fecha: debe ser texto.`];
    if (!esTexto(s['resumen'])) return [`${ruta}.resumen: debe ser texto.`];
    if (!esModo(s['modo'])) return [`${ruta}.modo: debe ser calificar o revision_rapida.`];
    // Las sesiones guardadas antes de que existiera la transcripción no la traen: se tratan como vacías.
    if (s['transcripcion'] !== undefined) {
      const e = validarTranscripcion(s['transcripcion'], `${ruta}.transcripcion`);
      if (e.length > 0) return e;
    }
  }
  return [];
}

function validarExpedienteSeguro(exp: unknown): string[] {
  try {
    const errores = validarExpediente(exp as Parameters<typeof validarExpediente>[0]);
    return errores.slice(0, MAX_ERRORES_EXPEDIENTE).map((e) => `expediente.${e.campo}: ${e.mensaje}`);
  } catch {
    return ['expediente: la estructura no es válida.'];
  }
}

/**
 * Errores en español de una oportunidad que llega del navegador; lista vacía si es válida. Nunca lanza.
 * Revisa la forma completa (ficha, expediente, sesiones, historial, eventos): una oportunidad con una forma
 * rota no debe llegar al ciclo del agente.
 */
export function validarOportunidad(op: unknown): string[] {
  if (!esObjeto(op)) return ['oportunidad: debe ser un objeto.'];
  if (op['formato'] !== 1) {
    return ['oportunidad: el formato no es compatible (se esperaba formato 1). Empieza una oportunidad nueva.'];
  }
  const errores: string[] = [];
  if (!esTexto(op['id']) || op['id'] === '') errores.push('oportunidad.id: es obligatorio.');
  if (typeof op['cerrada'] !== 'boolean') errores.push('oportunidad.cerrada: debe ser verdadero o falso.');
  errores.push(...validarFicha(op['ficha']).map((e) => `ficha: ${e}`));
  errores.push(...validarExpedienteSeguro(op['expediente']));
  errores.push(...validarSesiones(op['sesiones']));
  errores.push(...validarSesionActual(op['sesionActual']));
  if (!Array.isArray(op['eventos'])) errores.push('eventos: debe ser una lista.');
  return errores;
}
