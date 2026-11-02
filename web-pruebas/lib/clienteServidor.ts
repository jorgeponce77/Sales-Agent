import { crearClienteAnthropic } from 'agente-sales-agent';
import type { ClienteModelo } from 'agente-sales-agent';

type Respuesta = Awaited<ReturnType<ClienteModelo['crear']>>;

export const TEXTO_INICIO_FALSO = '¿Cuál es el estatus del negocio? (modo de prueba)';
export const TEXTO_MENSAJE_FALSO = 'Gracias, anotado. (modo de prueba)';

/** ¿El último mensaje que recibe el modelo es el aviso interno de inicio de sesión? */
function esInicio(mensajes: Array<{ content: unknown }>): boolean {
  const contenido = mensajes[mensajes.length - 1]?.content;
  const textos = typeof contenido === 'string'
    ? [contenido]
    : Array.isArray(contenido)
      ? contenido.map((b) => (typeof b === 'object' && b !== null && 'text' in b ? String((b as { text: unknown }).text) : ''))
      : [];
  return textos.some((t) => t.startsWith('[Inicio de sesión'));
}

/** Cliente determinista para la prueba de humo (`MODELO_FALSO=1`): sin red, con mensajes bien formados. */
export function crearClienteFalso(): ClienteModelo {
  return {
    async crear(p): Promise<Respuesta> {
      const texto = esInicio(p.messages) ? TEXTO_INICIO_FALSO : TEXTO_MENSAJE_FALSO;
      return {
        id: 'msg_modo_de_prueba',
        type: 'message',
        role: 'assistant',
        model: p.model,
        content: [{ type: 'text', text: texto, citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      } as unknown as Respuesta;
    },
  };
}

/** Cliente del modelo para el servidor: el falso con `MODELO_FALSO=1`; si no, el real con `ANTHROPIC_API_KEY`. */
export function obtenerCliente(): ClienteModelo {
  if (process.env.MODELO_FALSO === '1') return crearClienteFalso();
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY en el servidor.');
  return crearClienteAnthropic(clave);
}
