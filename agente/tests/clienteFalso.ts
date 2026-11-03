import type Anthropic from '@anthropic-ai/sdk';
import type { ClienteModelo } from '../src/conversacion/cliente.js';

type Message = Anthropic.Messages.Message;
type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;

/**
 * Cliente del modelo con guion: cada `crear` devuelve el siguiente elemento (o lo lanza, si es un `Error`)
 * y registra una copia de los parámetros recibidos. Solo para pruebas.
 */
export function crearClienteFalso(guion: Array<Partial<Message> | Error>): ClienteModelo & { llamadas: Params[] } {
  const pendientes = [...guion];
  const llamadas: Params[] = [];
  return {
    llamadas,
    async crear(p: Params): Promise<Message> {
      llamadas.push(structuredClone(p));
      const siguiente = pendientes.shift();
      if (siguiente === undefined) throw new Error('guion agotado');
      if (siguiente instanceof Error) throw siguiente;
      return siguiente as Message;
    },
  };
}

let contador = 0;

/** Respuesta del modelo con un bloque de texto. */
export function texto(t: string, usage?: Partial<Message['usage']>): Partial<Message> {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: t }] as unknown as Message['content'],
    stop_reason: 'end_turn',
    ...(usage ? { usage: usage as Message['usage'] } : {}),
  };
}

/** Respuesta del modelo con uno o más bloques tool_use (y texto opcional antes). */
export function usarHerramientas(
  usos: Array<{ name: string; input: unknown }>,
  textoPrevio?: string,
): Partial<Message> {
  const bloques: unknown[] = [];
  if (textoPrevio !== undefined) bloques.push({ type: 'text', text: textoPrevio });
  for (const u of usos) bloques.push({ type: 'tool_use', id: `toolu_${++contador}`, name: u.name, input: u.input });
  return { role: 'assistant', content: bloques as Message['content'], stop_reason: 'tool_use' };
}

/** Respuesta con un solo bloque tool_use. */
export const usarHerramienta = (name: string, input: unknown): Partial<Message> => usarHerramientas([{ name, input }]);
