import { idiomaDe } from '../src/idioma.js';
import type { Escenario, Mensaje, Oportunidad } from '../src/index.js';

export interface Verificacion { nombre: string; ok: boolean; detalle: string }

/** Todos los mensajes del agente: sesiones cerradas y sesión en curso. */
export function mensajesDelAgente(op: Oportunidad): Mensaje[] {
  const todos = [...op.sesiones.flatMap((s) => s.transcripcion ?? []), ...(op.sesionActual?.transcripcion ?? [])];
  return todos.filter((m) => m.rol === 'agente');
}

const recorte = (t: string): string => (t.length > 80 ? `${t.slice(0, 80)}…` : t);

/** Minúsculas, sin acentos ni puntuación, espacios colapsados. */
function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Una sola pregunta por mensaje (instrucciones 2026-11-08.1): más de un "?" en un mensaje del agente falla. */
function unaPregunta(op: Oportunidad): Verificacion {
  const malos = mensajesDelAgente(op).filter((m) => (m.texto.match(/\?/g) ?? []).length > 1);
  return malos.length === 0
    ? { nombre: 'una_pregunta', ok: true, detalle: 'Ningún mensaje del agente tiene más de un "?".' }
    : { nombre: 'una_pregunta', ok: false, detalle: `${malos.length} mensaje(s) con más de un "?"; el primero: "${recorte(malos[0]?.texto ?? '')}"` };
}

function idioma(esc: Escenario, op: Oportunidad): Verificacion {
  const esperado = esc.id === 'E5' ? 'en' : 'es';
  const mensajes = mensajesDelAgente(op);
  const clasificados = mensajes.map((m) => idiomaDe(m.texto)).filter((i) => i !== null);
  if (clasificados.length === 0) {
    return { nombre: 'idioma', ok: false, detalle: 'No hay mensajes del agente en los que se pueda reconocer el idioma.' };
  }
  const aciertos = clasificados.filter((i) => i === esperado).length;
  const ok = aciertos * 2 > clasificados.length;
  return {
    nombre: 'idioma',
    ok,
    detalle: `${aciertos} de ${clasificados.length} mensajes reconocibles en ${esperado === 'en' ? 'inglés' : 'español'} (de ${mensajes.length} del agente).`,
  };
}

function sinPersonasInventadas(esc: Escenario, op: Oportunidad): Verificacion {
  // Con espacios alrededor, la comparación es por palabras completas: "Ana" no coincide con "semana".
  const hechos = ` ${normalizar(esc.hechosOcultos)} `;
  // Se quita cualquier paréntesis antes de comparar: "<cargo> (nombre pendiente)" (regla 5) pasa si el cargo está
  // en los hechos, y "Karina (Planificación)" se compara como "Karina".
  const comparable = (n: string): string => n.replace(/\([^)]*\)/g, ' ');
  const inventadas = op.expediente.influencias
    .map((i) => i.nombre)
    .filter((n) => !hechos.includes(` ${normalizar(comparable(n))} `));
  return inventadas.length === 0
    ? { nombre: 'sin_personas_inventadas', ok: true, detalle: 'Todas las personas registradas aparecen en los hechos.' }
    : { nombre: 'sin_personas_inventadas', ok: false, detalle: `Personas que no están en los hechos: ${inventadas.join(', ')}.` };
}

function cierreConDiagnostico(op: Oportunidad): Verificacion {
  const ok = op.sesiones.length >= 1 && op.ultimoDiagnostico !== null;
  return {
    nombre: 'cierre_con_diagnostico',
    ok,
    detalle: ok
      ? `${op.sesiones.length} sesión(es) cerrada(s) y diagnóstico presente.`
      : `Sesiones cerradas: ${op.sesiones.length}; diagnóstico: ${op.ultimoDiagnostico === null ? 'ausente' : 'presente'}.`,
  };
}

function banderasEsperadas(esc: Escenario, op: Oportunidad): Verificacion {
  const presentes = new Set((op.ultimoDiagnostico?.banderas ?? []).map((b) => b.id));
  const faltan = esc.banderasEsperadas.filter((id) => !presentes.has(id));
  return faltan.length === 0
    ? { nombre: 'banderas_esperadas', ok: true, detalle: `Presentes: ${esc.banderasEsperadas.join(', ') || 'ninguna esperada'}.` }
    : { nombre: 'banderas_esperadas', ok: false, detalle: `Faltan: ${faltan.join(', ')}.` };
}

/** Comprobaciones automáticas sobre la oportunidad resultante de una conversación simulada. */
export function verificar(esc: Escenario, op: Oportunidad): Verificacion[] {
  return [unaPregunta(op), idioma(esc, op), sinPersonasInventadas(esc, op), cierreConDiagnostico(op), banderasEsperadas(esc, op)];
}

/** Señales del diagnóstico del motor en un mensaje del agente: el semáforo y el índice, en español o inglés. */
const SEMAFORO = /sem[aá]foro|traffic light/i;
const INDICE = /[ií]ndice|\bindex\b|\b\d{1,3}\s*\/\s*100\b/i;

/**
 * Informativo, nunca falla: cuántos mensajes del agente hubo hasta el primero que da el diagnóstico (incluido),
 * contando las sesiones en orden. Sirve para ver si la conversación se alarga por preguntas redundantes.
 * Criterio: el primer mensaje del agente que nombra el semáforo y el índice a la vez (el diagnóstico de §3.5 da
 * los dos). No se usa la llamada a `calcular_diagnostico` porque las sesiones archivadas solo guardan la
 * transcripción, sin las herramientas.
 */
export function mensajesHastaDiagnostico(op: Oportunidad): Verificacion & { mensajes: number | null } {
  const mensajes = mensajesDelAgente(op);
  const i = mensajes.findIndex((m) => SEMAFORO.test(m.texto) && INDICE.test(m.texto));
  return i < 0
    ? { nombre: 'mensajes_hasta_diagnostico', ok: true, mensajes: null, detalle: `No se encontró el diagnóstico en los ${mensajes.length} mensajes del agente.` }
    : { nombre: 'mensajes_hasta_diagnostico', ok: true, mensajes: i + 1, detalle: `${i + 1} mensaje(s) del agente hasta el diagnóstico (de ${mensajes.length}).` };
}
