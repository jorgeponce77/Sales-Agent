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

// Heurística: listas cortas de palabras frecuentes que no se escriben igual en el otro idioma.
const PALABRAS_ES = new Set(
  'el la los las de que y en un una es por con para se su lo como más pero del al está son hay qué cuál esto muy ya también tiene tienes cuándo quién cómo'.split(' '),
);
const PALABRAS_EN = new Set(
  'the and of to is in that for with are was your you have this it be what not on will can do who when how has there their'.split(' '),
);

function idiomaDe(texto: string): 'es' | 'en' | null {
  let es = 0;
  let en = 0;
  for (const p of texto.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (PALABRAS_ES.has(p)) es += 1;
    if (PALABRAS_EN.has(p)) en += 1;
  }
  if (es === en) return null;
  return es > en ? 'es' : 'en';
}

function unaPregunta(op: Oportunidad): Verificacion {
  const malos = mensajesDelAgente(op).filter((m) => (m.texto.match(/\?/g) ?? []).length > 2);
  return malos.length === 0
    ? { nombre: 'una_pregunta', ok: true, detalle: 'Ningún mensaje del agente tiene más de 2 "?".' }
    : { nombre: 'una_pregunta', ok: false, detalle: `${malos.length} mensaje(s) con más de 2 "?"; el primero: "${recorte(malos[0]?.texto ?? '')}"` };
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
  const hechos = normalizar(esc.hechosOcultos);
  const inventadas = op.expediente.influencias.map((i) => i.nombre).filter((n) => !hechos.includes(normalizar(n)));
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
