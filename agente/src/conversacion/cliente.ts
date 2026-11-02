import Anthropic from '@anthropic-ai/sdk';

/** Lo único que el ciclo de conversación necesita del modelo: crear un mensaje (sin streaming). */
export interface ClienteModelo {
  crear(p: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message>;
}

export const MODELO_DEFAULT = 'claude-sonnet-5-5';

/** Cliente real de la API de Anthropic. La clave vive solo en el servidor. */
export function crearClienteAnthropic(apiKey: string): ClienteModelo {
  const anthropic = new Anthropic({ apiKey });
  return { crear: (p) => anthropic.messages.create(p) };
}
