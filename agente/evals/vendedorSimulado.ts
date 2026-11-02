import type Anthropic from '@anthropic-ai/sdk';
import type { ClienteModelo, Escenario, Mensaje, Uso } from '../src/index.js';

export interface OpcionesVendedor {
  /** Fecha de hoy (AAAA-MM-DD); los hechos usan fechas relativas a ella. Por defecto, la fecha de hoy en America/Mexico_City. */
  hoy?: string;
  /** Recibe el uso de tokens de la llamada al modelo. */
  registrarUso?: (uso: Uso) => void;
}

const MAX_TOKENS = 1024;
const LINEA_INICIO = '[Inicio de la conversación]';
const LINEA_CONTINUA = '[Continúa la conversación]';

/** Fecha de hoy (AAAA-MM-DD) en la zona America/Mexico_City, sin importar la zona del servidor. */
export function hoyEnMexico(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/** Prompt de sistema del vendedor simulado: persona, hechos ocultos, fecha de hoy y datos de la ficha del CRM. */
export function construirSistemaVendedor(esc: Escenario, hoy: string): string {
  const f = esc.construirFicha(hoy);
  return `Eres un vendedor simulado en una evaluación. Un asistente de IA te entrevista sobre una oportunidad de ventas y tú actúas el personaje descrito abajo. Nunca salgas del personaje ni menciones que es una simulación.

REGLAS DE ACTUACIÓN
- Responde solo lo que el asistente te pregunta, con tus palabras; no reveles todo de golpe ni sueltes datos que no te pidieron.
- Si te preguntan algo que no está en los hechos de abajo, contesta que no lo sabes (o que no lo has preguntado); nunca inventes personas, montos ni fechas.
- Escribe en el idioma de tu persona, en mensajes breves y naturales, como en un chat. Escribe solo el texto de tu mensaje, sin comillas, sin acotaciones y sin nombrar tu rol.
- Cuando el asistente cierre la conversación (se despide, resume el diagnóstico o el acuerdo de seguimiento), responde con tu despedida y termina el mensaje con la palabra FIN. Si ya no tienes nada que añadir, escribe solo FIN.

HOY: ${hoy}. Las fechas de los hechos son relativas a esta fecha.

FICHA DEL CRM (lo que figura hoy en el sistema)
- Cliente: ${f.cliente}
- Oportunidad: ${f.oportunidad} (${f.idCRM})
- Etapa en el CRM: ${f.etapaCRM}
- TCV: ${f.tcv} ${f.moneda}
- Fecha de cierre en el CRM: ${f.fechaCierreCRM}
- Vendedor: ${f.vendedor}

PERSONA
${esc.persona}

HECHOS (tu conocimiento; el asistente no los tiene)
${esc.hechosOcultos}`;
}

/** Quita la marca FIN del final de la respuesta del vendedor simulado. Solo cuenta si es la última palabra completa. */
export function interpretarRespuestaVendedor(respuesta: string): { mensaje: string; fin: boolean } {
  const t = respuesta.trim();
  const m = /(?:^|[\s.!?¡¿,;:"')\]])FIN$/.exec(t);
  if (m === null) return { mensaje: t, fin: false };
  return { mensaje: t.slice(0, t.length - 3).trim(), fin: true };
}

/**
 * Convierte la transcripción en mensajes de la API: los del agente van como `user` y los del vendedor
 * como `assistant`. Los seguidos del mismo rol se unen y la lista empieza y termina con `user`.
 */
function aMensajesApi(transcripcion: readonly Mensaje[]): Anthropic.Messages.MessageParam[] {
  const salida: Anthropic.Messages.MessageParam[] = [];
  const poner = (role: 'user' | 'assistant', texto: string): void => {
    const ultimo = salida.at(-1);
    if (ultimo !== undefined && ultimo.role === role) ultimo.content = `${String(ultimo.content)}\n\n${texto}`;
    else salida.push({ role, content: texto });
  };
  for (const m of transcripcion) poner(m.rol === 'agente' ? 'user' : 'assistant', m.texto);
  if (salida[0]?.role !== 'user') salida.unshift({ role: 'user', content: LINEA_INICIO });
  if (salida.at(-1)?.role !== 'user') salida.push({ role: 'user', content: LINEA_CONTINUA });
  return salida;
}

/** Siguiente mensaje del vendedor simulado, dado lo conversado hasta ahora. Puede terminar en FIN. */
export async function responderComoVendedor(
  cliente: ClienteModelo,
  esc: Escenario,
  transcripcion: Mensaje[],
  modelo: string,
  opciones: OpcionesVendedor = {},
): Promise<string> {
  const msg = await cliente.crear({
    model: modelo,
    max_tokens: MAX_TOKENS,
    system: construirSistemaVendedor(esc, opciones.hoy ?? hoyEnMexico()),
    messages: aMensajesApi(transcripcion),
  });
  const u = msg.usage;
  opciones.registrarUso?.({
    entrada: u?.input_tokens ?? 0,
    salida: u?.output_tokens ?? 0,
    cacheLectura: u?.cache_read_input_tokens ?? 0,
    cacheEscritura: u?.cache_creation_input_tokens ?? 0,
  });
  const contenido = Array.isArray(msg.content) ? msg.content : [];
  return contenido
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
}
