import { crearClienteAnthropic } from 'agente-sales-agent';
import type { ClienteModelo } from 'agente-sales-agent';

type Respuesta = Awaited<ReturnType<ClienteModelo['crear']>>;

export const TEXTO_INICIO_FALSO = '¿Cuál es el estatus del negocio? (modo de prueba)';
export const TEXTO_MENSAJE_FALSO = 'Gracias, anotado. (modo de prueba)';

type Bloque = { type?: unknown; text?: unknown };

/** Bloques del último mensaje que recibe el modelo (el texto suelto cuenta como un bloque de texto). */
function bloquesFinales(mensajes: Array<{ content: unknown }>): Bloque[] {
  const contenido = mensajes[mensajes.length - 1]?.content;
  if (typeof contenido === 'string') return [{ type: 'text', text: contenido }];
  return Array.isArray(contenido) ? (contenido as Bloque[]).filter((b) => typeof b === 'object' && b !== null) : [];
}

const textosDe = (bloques: Bloque[]): string[] => bloques.map((b) => (b.type === 'text' ? String(b.text ?? '') : ''));

/** ¿El último mensaje que recibe el modelo es el aviso interno de inicio de sesión? */
const esInicio = (bloques: Bloque[]): boolean => textosDe(bloques).some((t) => t.startsWith('[Inicio de sesión'));

/** ¿El último mensaje es el aviso interno de que el vendedor pidió terminar la sesión? */
const esPedidoDeCierre = (bloques: Bloque[]): boolean => textosDe(bloques).some((t) => t.startsWith('[El vendedor pidió terminar la sesión'));

/** ¿El último mensaje trae el resultado de una herramienta (aquí, el del cierre que pidió este mismo cliente)? */
const esResultadoDeHerramienta = (bloques: Bloque[]): boolean => bloques.some((b) => b.type === 'tool_result');

export const TEXTO_CIERRE_FALSO = 'Sesión cerrada. (modo de prueba)';
export const RESUMEN_CIERRE_FALSO = 'Resumen de prueba.';

/**
 * Cliente determinista para la prueba de humo (`MODELO_FALSO=1`): sin red, con mensajes bien formados.
 * Al pedir terminar la sesión llama a `cerrar_sesion` y, al recibir el resultado, responde con texto.
 */
export function crearClienteFalso(): ClienteModelo {
  return {
    async crear(p): Promise<Respuesta> {
      const finales = bloquesFinales(p.messages);
      const base = {
        id: 'msg_modo_de_prueba',
        type: 'message',
        role: 'assistant',
        model: p.model,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      };
      if (esPedidoDeCierre(finales)) {
        return {
          ...base,
          content: [{ type: 'tool_use', id: 'toolu_modo_de_prueba', name: 'cerrar_sesion', input: { resumen: RESUMEN_CIERRE_FALSO } }],
          stop_reason: 'tool_use',
        } as unknown as Respuesta;
      }
      const texto = esResultadoDeHerramienta(finales)
        ? TEXTO_CIERRE_FALSO
        : esInicio(finales) ? TEXTO_INICIO_FALSO : TEXTO_MENSAJE_FALSO;
      return {
        ...base,
        content: [{ type: 'text', text: texto, citations: null }],
        stop_reason: 'end_turn',
      } as unknown as Respuesta;
    },
  };
}

// Un turno puede hacer varias llamadas. El presupuesto del turno (240 s, ver /api/turno) solo se revisa entre
// llamadas, así que una llamada lenta con reintentos todavía puede pasar de maxDuration (300 s); en ese caso el
// navegador conserva su copia y se comporta como un error de la API. Se mide en el despliegue.
const REINTENTOS_API = 2;
const TIEMPO_POR_LLAMADA_MS = 120_000;

/** Cliente del modelo para el servidor: el falso con `MODELO_FALSO=1`; si no, el real con `ANTHROPIC_API_KEY`. */
export function obtenerCliente(): ClienteModelo {
  if (process.env.MODELO_FALSO === '1') return crearClienteFalso();
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY en el servidor.');
  return crearClienteAnthropic(clave, { maxRetries: REINTENTOS_API, timeout: TIEMPO_POR_LLAMADA_MS });
}
