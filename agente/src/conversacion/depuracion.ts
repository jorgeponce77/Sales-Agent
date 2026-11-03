import type Anthropic from '@anthropic-ai/sdk';

/**
 * Instrumentación opcional del ciclo de conversación (DEBUG_AGENTE=1): una línea a stderr por llamada al modelo
 * y otra al terminar el turno. Solo metadatos (tipos de bloque, nombres de herramientas, tokens); nunca el
 * contenido de los mensajes ni la clave.
 */
const activa = (): boolean => process.env['DEBUG_AGENTE'] === '1';

let llamadasTotales = 0;

const describirBloque = (b: Anthropic.Messages.ContentBlock): string => {
  if (b.type === 'tool_use') {
    const campos = b.input !== null && typeof b.input === 'object' ? Object.keys(b.input).length : 0;
    return `tool_use:${b.name}(${campos} campos)`;
  }
  if (b.type === 'text') return `text(${b.text.length} car.)`;
  return b.type;
};

export function depurarLlamada(indiceEnTurno: number, final: boolean, msg: Anthropic.Messages.Message): void {
  if (!activa()) return;
  llamadasTotales += 1;
  const contenido = Array.isArray(msg.content) ? msg.content : [];
  const bloques = contenido.map(describirBloque).join(', ') || '(sin bloques)';
  process.stderr.write(
    `[agente] llamada #${llamadasTotales} (turno: ${indiceEnTurno}${final ? ', final sin herramientas' : ''}) stop_reason=${String(msg.stop_reason)} ` +
      `salida=${String(msg.usage?.output_tokens)} thinking=${String(msg.usage?.output_tokens_details?.thinking_tokens)} ` +
      `bloques=[${bloques}]\n`,
  );
}

export function depurarResultados(resultados: Array<{ nombre: string; ok: boolean | 'tope' }>): void {
  if (!activa()) return;
  const lista = resultados.map((r) => `${r.nombre}:${r.ok === 'tope' ? 'tope' : r.ok ? 'ok' : 'error'}`).join(', ');
  process.stderr.write(`[agente]   resultados=[${lista}]\n`);
}

export function depurarFinTurno(llamadas: number, ejecutadas: number, respaldo: boolean): void {
  if (!activa()) return;
  process.stderr.write(
    `[agente] fin de turno: ${llamadas} llamadas, ${ejecutadas} herramientas ejecutadas, respaldo=${respaldo ? 'sí' : 'no'}\n`,
  );
}
