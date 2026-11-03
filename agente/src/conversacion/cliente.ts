import Anthropic from '@anthropic-ai/sdk';

/** Lo único que el ciclo de conversación necesita del modelo: crear un mensaje (sin streaming). */
export interface ClienteModelo {
  crear(p: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message>;
}

export const MODELO_DEFAULT = 'claude-sonnet-5-5';

/** Reintentos y tiempo máximo (ms) por llamada del SDK; sin ellos, los valores por defecto del SDK. */
export interface OpcionesCliente { maxRetries?: number; timeout?: number }

/** Cliente real de la API de Anthropic. La clave vive solo en el servidor. */
export function crearClienteAnthropic(apiKey: string, opciones: OpcionesCliente = {}): ClienteModelo {
  const anthropic = new Anthropic({ apiKey, ...opciones });
  return { crear: (p) => anthropic.messages.create(p) };
}
