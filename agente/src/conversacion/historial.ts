import type Anthropic from '@anthropic-ai/sdk';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;

/** Agrega bloques como mensaje de usuario; si el último ya es de usuario, se unen (los roles siempre alternan). */
export function agregarUsuario(historial: MessageParam[], bloques: ContentBlockParam[]): void {
  const ultimo = historial[historial.length - 1];
  if (ultimo?.role === 'user') {
    const previo: ContentBlockParam[] =
      typeof ultimo.content === 'string' ? [{ type: 'text', text: ultimo.content }] : ultimo.content;
    ultimo.content = [...previo, ...bloques];
  } else {
    historial.push({ role: 'user', content: bloques });
  }
}

const bloquesDe = (m: MessageParam): ContentBlockParam[] =>
  typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : [...m.content];

/** Pone `cache_control` en el último bloque del mensaje `i` de `copia` (que ya es una copia superficial). */
function marcarCache(copia: MessageParam[], i: number): void {
  const m = copia[i];
  if (m === undefined) return;
  const contenido = bloquesDe(m);
  const bloque = contenido[contenido.length - 1];
  if (bloque === undefined) return;
  contenido[contenido.length - 1] = { ...bloque, cache_control: { type: 'ephemeral' } } as ContentBlockParam;
  copia[i] = { ...m, content: contenido } as MessageParam;
}

/**
 * Copia de los mensajes para enviar a la API, con `cache_control` en el último bloque del último mensaje
 * (un punto de caché; con el del sistema y el de las herramientas suman 3 de los 4 permitidos).
 * No modifica `mensajes`: la marca nunca se guarda en el historial.
 */
export function conCacheEnUltimo(mensajes: readonly MessageParam[]): MessageParam[] {
  const copia = [...mensajes];
  marcarCache(copia, copia.length - 1);
  return copia;
}

/**
 * Copia de los mensajes para la API con dos puntos de caché: al final del mensaje `previo` (el historial anterior
 * al turno, igual en el turno siguiente, para que este lo reutilice) y en el último mensaje. Con el del sistema y
 * el de las herramientas suman 4, el máximo permitido. Con `previo` < 0 o igual al último, solo el último.
 */
export function conCacheEnPrevioYUltimo(mensajes: readonly MessageParam[], previo: number): MessageParam[] {
  const copia = conCacheEnUltimo(mensajes);
  if (previo >= 0 && previo < copia.length - 1) marcarCache(copia, previo);
  return copia;
}

/**
 * Copia de los mensajes con `bloque` dentro del mensaje de usuario `i`: después de los tool_result con que empiece
 * (la API exige que vayan primero) y antes de todo lo demás. No modifica `mensajes`: el bloque nunca se guarda.
 */
export function conBloqueEnMensaje(mensajes: readonly MessageParam[], i: number, bloque: ContentBlockParam): MessageParam[] {
  const copia = [...mensajes];
  const m = copia[i];
  if (m === undefined || m.role !== 'user') return copia;
  const contenido = bloquesDe(m);
  let pos = 0;
  while (pos < contenido.length && contenido[pos]?.type === 'tool_result') pos += 1;
  contenido.splice(pos, 0, bloque);
  copia[i] = { ...m, content: contenido };
  return copia;
}

const esThinking = (b: ContentBlockParam): boolean => b.type === 'thinking' || b.type === 'redacted_thinking';

/**
 * Quita los bloques thinking de los mensajes del asistente desde `desde`. Dentro del ciclo de herramientas de un
 * turno se devuelven sin cambios (la API lo exige), pero cada bloque está firmado sobre la conversación previa,
 * y el bloque de contexto de la sesión solo va en el mensaje del turno en curso (y cambia en cada turno):
 * reenviarlos en otro turno da un 400.
 * Nunca deja un mensaje vacío (un mensaje con solo thinking no se guarda).
 */
export function quitarThinking(historial: MessageParam[], desde: number): void {
  for (let i = Math.max(desde, 0); i < historial.length; i += 1) {
    const m = historial[i];
    if (m === undefined || m.role !== 'assistant' || typeof m.content === 'string') continue;
    const sin = m.content.filter((b) => !esThinking(b));
    if (sin.length > 0) m.content = sin;
  }
}
