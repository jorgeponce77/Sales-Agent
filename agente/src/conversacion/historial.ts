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

/**
 * Copia de los mensajes para enviar a la API, con `cache_control` en el último bloque del último mensaje
 * (un punto de caché; con el del sistema y el de las herramientas suman 3 de los 4 permitidos).
 * No modifica `mensajes`: la marca nunca se guarda en el historial.
 */
export function conCacheEnUltimo(mensajes: readonly MessageParam[]): MessageParam[] {
  const copia = [...mensajes];
  const ultimo = copia[copia.length - 1];
  if (ultimo === undefined) return copia;
  const contenido: ContentBlockParam[] =
    typeof ultimo.content === 'string' ? [{ type: 'text', text: ultimo.content }] : [...ultimo.content];
  const bloque = contenido[contenido.length - 1];
  if (bloque === undefined) return copia;
  contenido[contenido.length - 1] = { ...bloque, cache_control: { type: 'ephemeral' } } as ContentBlockParam;
  copia[copia.length - 1] = { ...ultimo, content: contenido } as MessageParam;
  return copia;
}
