import type Anthropic from '@anthropic-ai/sdk';
import { calcularDiagnostico } from 'motor-sales-agent';
import { DEFINICIONES_HERRAMIENTAS } from '../herramientas/definiciones.js';
import { ejecutarHerramienta } from '../herramientas/ejecutar.js';
import type { EstadoTurno } from '../herramientas/escritura.js';
import { VERSION_INSTRUCCIONES } from '../instrucciones/base.js';
import { construirInstrucciones } from '../instrucciones/construir.js';
import { TIPOS_CAMBIO_DEFAULT } from '../tipos.js';
import type { ModoSesion, Oportunidad, ResultadoTurno, SesionActual, TiposCambio, Uso } from '../tipos.js';
import { MODELO_DEFAULT } from './cliente.js';
import type { ClienteModelo } from './cliente.js';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

export interface OpcionesTurno {
  cliente: ClienteModelo;
  hoy: string;
  modelo?: string;
  tiposCambio?: TiposCambio;
}

const MAX_TOKENS = 1024;
const TOPE_HERRAMIENTAS = 8;      // ejecuciones de herramientas por mensaje del vendedor
const TOPE_TURNOS = 40;           // mensajes del vendedor por sesión
const MAX_MENSAJE = 4000;         // caracteres por mensaje del vendedor

const textoInicio = (modo: ModoSesion): string => `[Inicio de sesión — modo: ${modo}]`;
const TEXTO_CIERRE = '[El vendedor pidió terminar la sesión: haz el cierre completo]';
const PREFIJO_VENDEDOR = '(texto del vendedor) ';
const ERROR_API = 'No pude comunicarme con el asistente. Intenta de nuevo en un momento.';
const ERROR_LARGO = `Tu mensaje es muy largo (máx. ${MAX_MENSAJE} caracteres). Resume o divídelo.`;
const RESPALDO = 'Registré lo que me dijiste. ¿Seguimos?';
const TOPE_ALCANZADO = 'tope de herramientas del turno alcanzado';

/** Las 12 herramientas, con cache_control en la última para cachear todo el bloque de herramientas. */
const HERRAMIENTAS: Anthropic.Messages.Tool[] = DEFINICIONES_HERRAMIENTAS.map((d, i, todas) =>
  i === todas.length - 1 ? { ...d, cache_control: { type: 'ephemeral' } } : { ...d },
);

/** Falla del cliente del modelo; se distingue de cualquier otro error. */
class FalloApi extends Error {}

const usoCero = (): Uso => ({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });

function sumarUso(uso: Uso, u: Partial<Anthropic.Messages.Usage> | null | undefined): void {
  if (!u) return;
  uso.entrada += u.input_tokens ?? 0;
  uso.salida += u.output_tokens ?? 0;
  uso.cacheLectura += u.cache_read_input_tokens ?? 0;
  uso.cacheEscritura += u.cache_creation_input_tokens ?? 0;
}

const nuevaSesion = (modo: ModoSesion, hoy: string): SesionActual => ({
  modo,
  inicio: hoy,
  turnosVendedor: 0,
  versionInstrucciones: VERSION_INSTRUCCIONES,
  historial: [],
  transcripcion: [],
});

/** Agrega bloques como mensaje de usuario; si el último ya es de usuario, se unen (los roles siempre alternan). */
function agregarUsuario(historial: MessageParam[], bloques: ContentBlockParam[]): void {
  const ultimo = historial[historial.length - 1];
  if (ultimo?.role === 'user') {
    const previo: ContentBlockParam[] =
      typeof ultimo.content === 'string' ? [{ type: 'text', text: ultimo.content }] : ultimo.content;
    ultimo.content = [...previo, ...bloques];
  } else {
    historial.push({ role: 'user', content: bloques });
  }
}

const sinCambios = (op: Oportunidad, error: string | null = null): ResultadoTurno => ({
  respuestas: [],
  oportunidad: op,
  diagnostico: op.ultimoDiagnostico,
  eventos: [],
  uso: usoCero(),
  error,
});

const respuestaCerrada = (op: Oportunidad): ResultadoTurno => ({
  ...sinCambios(op),
  respuestas: [`Esta oportunidad está cerrada en el CRM (etapa ${op.ficha.etapaCRM}); no hay nada que calificar.`],
});

/**
 * Ciclo de llamadas al modelo sobre `trabajo` (copia): ejecuta herramientas hasta que el modelo
 * responde con texto o se llega al tope; la última llamada tras el tope va con tool_choice none.
 * Lanza FalloApi si el cliente falla.
 */
async function conversar(
  trabajo: Oportunidad,
  sesion: SesionActual,
  o: OpcionesTurno,
  uso: Uso,
): Promise<{ respuestas: string[]; estado: EstadoTurno }> {
  // R1: diagnóstico vigente al inicio del turno; las instrucciones se construyen una vez.
  const diag = calcularDiagnostico(trabajo.expediente, o.hoy);
  const { fijo, variable } = construirInstrucciones(trabajo, sesion.modo, o.hoy, diag);
  const system: Anthropic.Messages.TextBlockParam[] = [
    { type: 'text', text: fijo, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: variable },
  ];
  const estado: EstadoTurno = {
    oportunidad: trabajo,
    hoy: o.hoy,
    eventos: [],
    tiposCambio: o.tiposCambio ?? TIPOS_CAMBIO_DEFAULT,
    sesionCerrada: null,
  };
  const historial = sesion.historial as MessageParam[];
  const respuestas: string[] = [];
  let ejecutadas = 0;

  for (;;) {
    const final = ejecutadas >= TOPE_HERRAMIENTAS;
    let msg: Anthropic.Messages.Message;
    try {
      msg = await o.cliente.crear({
        model: o.modelo ?? MODELO_DEFAULT,
        max_tokens: MAX_TOKENS,
        system,
        tools: HERRAMIENTAS,
        ...(final ? { tool_choice: { type: 'none' as const } } : {}),
        messages: [...historial],
      });
    } catch {
      throw new FalloApi();
    }
    sumarUso(uso, msg.usage);

    const contenido = Array.isArray(msg.content) ? msg.content : [];
    const usos = contenido.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
    const continuar = !final && msg.stop_reason === 'tool_use' && usos.length > 0;

    // Se guarda solo texto no vacío y, si se van a ejecutar, los tool_use (R12: nunca un tool_use sin su resultado).
    const guardar: ContentBlockParam[] = [];
    for (const b of contenido) {
      if (b.type === 'text' && b.text.trim() !== '') {
        guardar.push({ type: 'text', text: b.text });
        respuestas.push(b.text);
      } else if (continuar && b.type === 'tool_use') {
        guardar.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input });
      }
    }
    if (guardar.length > 0) historial.push({ role: 'assistant', content: guardar });
    if (!continuar) break;

    const resultados: ToolResultBlockParam[] = usos.map((u) => {
      if (ejecutadas >= TOPE_HERRAMIENTAS) {
        return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: TOPE_ALCANZADO };
      }
      ejecutadas += 1;
      const r = ejecutarHerramienta(u.name, u.input, estado);
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r), ...(r.ok ? {} : { is_error: true }) };
    });
    agregarUsuario(historial, resultados);
  }

  if (respuestas.length === 0) {
    respuestas.push(RESPALDO);
    historial.push({ role: 'assistant', content: [{ type: 'text', text: RESPALDO }] });
  }
  return { respuestas, estado };
}

/** Corre el ciclo y, si no falla la API, consolida el turno en `trabajo`. Si falla, devuelve `op` intacta. */
async function correr(
  op: Oportunidad,
  trabajo: Oportunidad,
  sesion: SesionActual,
  o: OpcionesTurno,
  esMensajeVendedor: boolean,
): Promise<ResultadoTurno> {
  const uso = usoCero();
  let resultado: { respuestas: string[]; estado: EstadoTurno };
  try {
    resultado = await conversar(trabajo, sesion, o, uso);
  } catch (e) {
    if (!(e instanceof FalloApi)) throw e;
    // R11: la oportunidad original sin tocar; el evento de error va solo en el resultado y sin detalles técnicos.
    return {
      ...sinCambios(op, ERROR_API),
      eventos: [{ tipo: 'error', descripcion: 'No hubo comunicación con el asistente; el turno no se aplicó.', fecha: o.hoy }],
      uso,
    };
  }

  const { respuestas, estado } = resultado;
  for (const texto of respuestas) sesion.transcripcion.push({ rol: 'agente', texto, fecha: o.hoy });
  trabajo.ultimoDiagnostico = calcularDiagnostico(trabajo.expediente, o.hoy);
  if (esMensajeVendedor) sesion.turnosVendedor += 1;
  trabajo.eventos.push(...estado.eventos);
  if (estado.sesionCerrada) {
    trabajo.sesiones.push({
      fecha: o.hoy,
      modo: sesion.modo,
      resumen: estado.sesionCerrada.resumen,
      versionInstrucciones: sesion.versionInstrucciones,
    });
    trabajo.sesionActual = null;
  }
  return {
    respuestas,
    oportunidad: trabajo,
    diagnostico: trabajo.ultimoDiagnostico,
    eventos: [...estado.eventos],
    uso,
    error: null,
  };
}

/** Abre una sesión nueva y obtiene el saludo del agente. Una oportunidad cerrada no llama al modelo. */
export async function iniciarSesion(op: Oportunidad, modo: ModoSesion, o: OpcionesTurno): Promise<ResultadoTurno> {
  if (op.cerrada) return respuestaCerrada(op);
  const trabajo = structuredClone(op);
  const sesion = nuevaSesion(modo, o.hoy);
  trabajo.sesionActual = sesion;
  // Mensaje interno: entra al historial, no a la transcripción.
  agregarUsuario(sesion.historial as MessageParam[], [{ type: 'text', text: textoInicio(modo) }]);
  return correr(op, trabajo, sesion, o, false);
}

/** Procesa un mensaje del vendedor (o el cierre, con `cerrar`). Nunca modifica `op`. */
export async function ejecutarTurno(
  op: Oportunidad,
  mensaje: string,
  o: OpcionesTurno & { cerrar?: boolean },
): Promise<ResultadoTurno> {
  if (op.cerrada) return respuestaCerrada(op);
  const recortado = mensaje.trim();
  let cerrar = o.cerrar === true;
  if (recortado === '' && !cerrar) return sinCambios(op);
  if (recortado.length > MAX_MENSAJE) return sinCambios(op, ERROR_LARGO);

  const trabajo = structuredClone(op);
  const sesion = trabajo.sesionActual ?? nuevaSesion('calificar', o.hoy);
  trabajo.sesionActual = sesion;
  if (sesion.turnosVendedor >= TOPE_TURNOS) cerrar = true;

  const bloques: ContentBlockParam[] = [];
  if (recortado !== '') {
    // R8: solo los textos internos pueden empezar con "[" en el historial.
    const texto = recortado.startsWith('[') ? `${PREFIJO_VENDEDOR}${recortado}` : recortado;
    bloques.push({ type: 'text', text: texto });
    sesion.transcripcion.push({ rol: 'vendedor', texto: recortado, fecha: o.hoy });
  }
  if (cerrar) bloques.push({ type: 'text', text: TEXTO_CIERRE });
  agregarUsuario(sesion.historial as MessageParam[], bloques);
  return correr(op, trabajo, sesion, o, true);
}
