import type Anthropic from '@anthropic-ai/sdk';
import { calcularDiagnostico } from 'motor-sales-agent';
import type { Expediente } from 'motor-sales-agent';
import { DEFINICIONES_HERRAMIENTAS } from '../herramientas/definiciones.js';
import { ejecutarHerramienta } from '../herramientas/ejecutar.js';
import type { EstadoTurno } from '../herramientas/escritura.js';
import { VERSION_INSTRUCCIONES } from '../instrucciones/base.js';
import { construirInstrucciones } from '../instrucciones/construir.js';
import { idiomaDelVendedor } from '../idioma.js';
import type { Idioma } from '../idioma.js';
import { TIPOS_CAMBIO_DEFAULT } from '../tipos.js';
import type { Evento, FotoSesion, ModoSesion, Oportunidad, ResultadoTurno, SesionActual, TiposCambio, Uso } from '../tipos.js';
import { MODELO_DEFAULT } from './cliente.js';
import type { ClienteModelo } from './cliente.js';
import { depurarFinTurno, depurarLlamada, depurarResultados } from './depuracion.js';
import { agregarUsuario, conCacheEnUltimo, quitarThinking } from './historial.js';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

export interface OpcionesTurno {
  cliente: ClienteModelo;
  hoy: string;
  modelo?: string;
  tiposCambio?: TiposCambio;
  /** Recibe la excepción del cliente cuando falla la API (para logs del servidor); nunca llega al resultado. */
  registrarError?: (e: unknown) => void;
  /**
   * Presupuesto de tiempo del turno (ms). Al pasarlo, la siguiente llamada al modelo es la final sin herramientas;
   * si se vuelve a pasar, el turno se detiene tras los resultados ya obtenidos, con el texto de respaldo.
   */
  limiteMs?: number;
  /** Reloj en ms (por defecto Date.now); se inyecta en las pruebas. */
  ahora?: () => number;
}

// El spec fijaba 1024, pero claude-sonnet-5-5 piensa por defecto (thinking adaptativo) y el thinking cuenta
// contra max_tokens: con 1024 casi todas las respuestas se cortaban antes de terminar las herramientas.
const MAX_TOKENS = 8192;
const TOPE_HERRAMIENTAS = 8;      // ejecuciones de herramientas por mensaje del vendedor
const REINTENTOS_CORTE = 1;       // reintentos por turno tras una respuesta cortada sin herramientas completas
const TOPE_TURNOS = 40;           // mensajes del vendedor por sesión
const MAX_MENSAJE = 4000;         // caracteres por mensaje del vendedor

const TOPE_EVENTOS = 300;         // eventos que conserva una oportunidad (los más recientes)
const MAX_RESUMEN = 600;          // caracteres del resumen de una sesión (como en cerrar_sesion)

const textoInicio = (modo: ModoSesion): string => `[Inicio de sesión — modo: ${modo}]`;
const TEXTO_CIERRE = '[El vendedor pidió terminar la sesión: haz el cierre completo]';
const PREFIJO_VENDEDOR = '(texto del vendedor) ';
const AVISO_CORTE =
  '[Tu respuesta anterior se cortó por longitud: solo se ejecutaron las herramientas completas. Repite lo que falte, en partes más cortas.]';
const TOPE_ALCANZADO = 'tope de herramientas del turno alcanzado';
const RESUMEN_INTERRUMPIDA = 'Sesión interrumpida sin cierre del agente.';
const RESUMEN_CERRADA_CRM = 'Oportunidad cerrada en el CRM durante la sesión.';

/** Textos fijos que ve el vendedor, en su idioma (por defecto español). Lo que se registra va siempre en español. */
interface Textos {
  errorApi: string;
  errorLargo: string;
  respaldo: string;
  rechazo: string;
  cerrada: (etapa: number) => string;
}

const TEXTOS: Record<Idioma, Textos> = {
  es: {
    errorApi: 'No pude comunicarme con el asistente. Intenta de nuevo en un momento.',
    errorLargo: `Tu mensaje es muy largo (máx. ${MAX_MENSAJE} caracteres). Resume o divídelo.`,
    respaldo: 'Perdón, se me cortó la respuesta. ¿Me lo repites en pocas palabras?',
    rechazo: 'No puedo ayudar con eso; sigamos con la oportunidad.',
    cerrada: (etapa) => `Esta oportunidad está cerrada en el CRM (etapa ${etapa}); no hay nada que calificar.`,
  },
  en: {
    errorApi: "I couldn't reach the assistant. Please try again in a moment.",
    errorLargo: `Your message is too long (max. ${MAX_MENSAJE} characters). Summarize it or split it.`,
    respaldo: 'Sorry, my answer got cut off. Could you repeat that briefly?',
    rechazo: "I can't help with that; let's get back to the opportunity.",
    cerrada: (etapa) => `This opportunity is closed in the CRM (stage ${etapa}); there is nothing to qualify.`,
  },
};

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

const sinCambios = (op: Oportunidad, error: string | null = null): ResultadoTurno => ({
  respuestas: [],
  oportunidad: op,
  diagnostico: op.ultimoDiagnostico,
  eventos: [],
  uso: usoCero(),
  error,
});

const respuestaCerrada = (op: Oportunidad, t: Textos): ResultadoTurno => ({
  ...sinCambios(op),
  respuestas: [t.cerrada(op.ficha.etapaCRM)],
});

/** Foto del expediente y de su diagnóstico al cerrar una sesión (copia: no comparte referencias). */
const fotoDe = (exp: Expediente, hoy: string): FotoSesion => ({
  expediente: structuredClone(exp),
  diagnostico: calcularDiagnostico(exp, hoy),
});

/** Archiva la sesión abierta de `trabajo` con su resumen, transcripción y foto, y la deja sin sesión. */
function archivar(trabajo: Oportunidad, sesion: SesionActual, resumen: string, hoy: string): void {
  trabajo.sesiones.push({
    fecha: hoy,
    modo: sesion.modo,
    resumen,
    versionInstrucciones: sesion.versionInstrucciones,
    transcripcion: sesion.transcripcion,
    foto: fotoDe(trabajo.expediente, hoy),
  });
  trabajo.sesionActual = null;
}

const eventoInterrumpida = (sesion: SesionActual, hoy: string): Evento => ({
  tipo: 'sesion',
  descripcion: `${RESUMEN_INTERRUMPIDA} Iniciada el ${sesion.inicio} (${sesion.modo}).`,
  fecha: hoy,
});

const recortarResumen = (t: string): string => (t.length > MAX_RESUMEN ? `${t.slice(0, MAX_RESUMEN - 1)}…` : t);

interface Conversacion {
  respuestas: string[];
  estado: EstadoTurno;
  /** El turno terminó con el texto de respaldo (sin respuesta útil del modelo o cortado por tiempo). */
  respaldo: boolean;
  /** Último texto escrito por el modelo en el turno (no un texto fijo), o null. */
  ultimoTextoModelo: string | null;
}

/**
 * Ciclo de llamadas al modelo sobre `trabajo` (copia): ejecuta herramientas hasta que el modelo
 * responde con texto o se llega al tope (de herramientas o de tiempo); la última llamada tras el tope
 * va con tool_choice none. Lanza FalloApi si el cliente falla.
 */
async function conversar(
  trabajo: Oportunidad,
  sesion: SesionActual,
  o: OpcionesTurno,
  uso: Uso,
  eventosPrevios: Evento[],
  t: Textos,
): Promise<Conversacion> {
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
    eventos: [...eventosPrevios],
    tiposCambio: o.tiposCambio ?? TIPOS_CAMBIO_DEFAULT,
    sesionCerrada: null,
  };
  const historial = sesion.historial as MessageParam[];
  const inicioTurno = historial.length;
  const respuestas: string[] = [];
  let ultimoTextoModelo: string | null = null;
  let ejecutadas = 0;
  let llamadas = 0;
  let reintentos = 0;
  const ahora = o.ahora ?? ((): number => Date.now());
  const inicio = ahora();
  let finalPorTiempo = false;
  let detenidoPorTiempo = false;
  let rechazado = false;

  for (;;) {
    // Presupuesto de tiempo: la primera vez que se pasa, la siguiente llamada es la final; la segunda, se detiene.
    const vencido = o.limiteMs !== undefined && ahora() - inicio > o.limiteMs;
    if (vencido && finalPorTiempo) {
      detenidoPorTiempo = true;
      break;
    }
    if (vencido) finalPorTiempo = true;
    const final = ejecutadas >= TOPE_HERRAMIENTAS || finalPorTiempo;
    let msg: Anthropic.Messages.Message;
    try {
      msg = await o.cliente.crear({
        model: o.modelo ?? MODELO_DEFAULT,
        max_tokens: MAX_TOKENS,
        system,
        tools: HERRAMIENTAS,
        ...(final ? { tool_choice: { type: 'none' as const } } : {}),
        // R17: punto de caché en el último mensaje, solo en la copia enviada.
        messages: conCacheEnUltimo(historial),
      });
    } catch (e) {
      throw new FalloApi(undefined, { cause: e });
    }
    sumarUso(uso, msg.usage);
    llamadas += 1;
    depurarLlamada(llamadas, final, msg);

    // Un rechazo del modelo no se ejecuta ni se guarda (puede venir a medias): se responde con un texto honesto.
    if (msg.stop_reason === 'refusal') {
      rechazado = true;
      break;
    }

    const contenido = Array.isArray(msg.content) ? msg.content : [];
    // Con max_tokens, el último bloque quedó cortado (tool_use con input incompleto, texto a medias o thinking):
    // no se ejecuta, no se muestra y no se guarda. Los tool_use anteriores están completos y se ejecutan para que
    // el modelo pueda continuar; si no hay ninguno, se reintenta una vez por turno con el aviso de corte.
    const truncada = msg.stop_reason === 'max_tokens';
    const cortado = truncada ? contenido[contenido.length - 1] : undefined;
    const usos = contenido.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b !== cortado,
    );
    const continuar = !final && (msg.stop_reason === 'tool_use' || truncada) && usos.length > 0;
    const reintentar = truncada && !continuar && reintentos < REINTENTOS_CORTE;

    // Se guardan, en su orden: los bloques thinking sin cambios (la API exige devolverlos en el ciclo de
    // herramientas; al terminar el turno se quitan), el texto no vacío y los tool_use que se van a ejecutar
    // (R12: nunca un tool_use sin su resultado).
    const guardar: ContentBlockParam[] = [];
    for (const b of contenido) {
      if (b === cortado) continue;
      if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        guardar.push({ ...b } as ContentBlockParam);
      } else if (b.type === 'text' && b.text.trim() !== '') {
        guardar.push({ type: 'text', text: b.text });
        respuestas.push(b.text);
        ultimoTextoModelo = b.text;
      } else if (continuar && b.type === 'tool_use' && usos.includes(b)) {
        guardar.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input });
      }
    }
    // Un mensaje con solo thinking no se guarda: no aporta nada y el respaldo ocupa su lugar.
    if (guardar.some((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking')) {
      historial.push({ role: 'assistant', content: guardar });
    }
    if (reintentar) {
      reintentos += 1;
      agregarUsuario(historial, [{ type: 'text', text: AVISO_CORTE }]);
      continue;
    }
    if (!continuar) break;

    const resumen: Array<{ nombre: string; ok: boolean | 'tope' }> = [];
    const resultados: ToolResultBlockParam[] = usos.map((u) => {
      if (ejecutadas >= TOPE_HERRAMIENTAS) {
        resumen.push({ nombre: u.name, ok: 'tope' });
        return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: TOPE_ALCANZADO };
      }
      ejecutadas += 1;
      const r = ejecutarHerramienta(u.name, u.input, estado);
      resumen.push({ nombre: u.name, ok: r.ok });
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r), ...(r.ok ? {} : { is_error: true }) };
    });
    depurarResultados(resumen);
    agregarUsuario(historial, truncada ? [...resultados, { type: 'text', text: AVISO_CORTE }] : resultados);
  }

  const respaldo = !rechazado && (respuestas.length === 0 || detenidoPorTiempo);
  const textoFijo = rechazado ? t.rechazo : respaldo ? t.respaldo : null;
  if (textoFijo !== null) {
    respuestas.push(textoFijo);
    historial.push({ role: 'assistant', content: [{ type: 'text', text: textoFijo }] });
  }
  quitarThinking(historial, inicioTurno);
  depurarFinTurno(llamadas, ejecutadas, respaldo);
  return { respuestas, estado, respaldo, ultimoTextoModelo };
}

/** Cómo cuenta el turno: si fue un mensaje con texto del vendedor y si es el cierre forzado por el tope. */
interface Cuenta { esMensajeVendedor: boolean; forzado: boolean }

/**
 * Corre el ciclo y, si no falla la API, consolida el turno en `trabajo`. Si falla, devuelve `op` intacta.
 * La sesión se archiva al final del turno si el agente la cerró, si la oportunidad quedó cerrada en el CRM
 * (etapa 6 a 8) o si era el cierre forzado por el tope y el agente no la cerró; así nunca queda una sesión
 * abierta con más de 40 mensajes.
 */
async function correr(
  op: Oportunidad,
  trabajo: Oportunidad,
  sesion: SesionActual,
  o: OpcionesTurno,
  t: Textos,
  cuenta: Cuenta,
  eventosPrevios: Evento[] = [],
): Promise<ResultadoTurno> {
  const uso = usoCero();
  let resultado: Conversacion;
  try {
    resultado = await conversar(trabajo, sesion, o, uso, eventosPrevios, t);
  } catch (e) {
    if (!(e instanceof FalloApi)) throw e;
    try {
      o.registrarError?.(e.cause);
    } catch {
      // un registro de errores que falla no debe romper el turno
    }
    // R11: la oportunidad original sin tocar; el evento de error va solo en el resultado y sin detalles técnicos.
    return {
      ...sinCambios(op, t.errorApi),
      eventos: [{ tipo: 'error', descripcion: 'No hubo comunicación con el asistente; el turno no se aplicó.', fecha: o.hoy }],
      uso,
    };
  }

  const { respuestas, estado, respaldo, ultimoTextoModelo } = resultado;
  for (const texto of respuestas) sesion.transcripcion.push({ rol: 'agente', texto, fecha: o.hoy });
  trabajo.ultimoDiagnostico = calcularDiagnostico(trabajo.expediente, o.hoy);
  if (cuenta.esMensajeVendedor) sesion.turnosVendedor = Math.min(sesion.turnosVendedor + 1, TOPE_TURNOS);
  const eventos = [...estado.eventos];

  if (estado.sesionCerrada) {
    archivar(trabajo, sesion, estado.sesionCerrada.resumen, o.hoy);
  } else if (trabajo.cerrada) {
    // actualizar_ficha llevó la etapa a 6-8 en este turno: no queda nada que calificar en esta sesión.
    const resumen = !respaldo && ultimoTextoModelo !== null ? recortarResumen(ultimoTextoModelo.trim()) : RESUMEN_CERRADA_CRM;
    eventos.push({
      tipo: 'sesion',
      descripcion: `Sesión cerrada: oportunidad cerrada en el CRM (etapa ${trabajo.ficha.etapaCRM}) durante la sesión.`,
      fecha: o.hoy,
    });
    archivar(trabajo, sesion, resumen, o.hoy);
  } else if (cuenta.forzado) {
    // Tope de 40 mensajes y el agente no cerró: misma salida que R14 (interrumpida, con transcripción y foto).
    eventos.push(eventoInterrumpida(sesion, o.hoy));
    archivar(trabajo, sesion, RESUMEN_INTERRUMPIDA, o.hoy);
  }
  trabajo.eventos = [...trabajo.eventos, ...eventos].slice(-TOPE_EVENTOS);
  return {
    respuestas,
    oportunidad: trabajo,
    diagnostico: trabajo.ultimoDiagnostico,
    eventos,
    uso,
    error: null,
  };
}

/** Abre una sesión nueva y obtiene el saludo del agente. Una oportunidad cerrada no llama al modelo. */
export async function iniciarSesion(op: Oportunidad, modo: ModoSesion, o: OpcionesTurno): Promise<ResultadoTurno> {
  const t = TEXTOS[idiomaDelVendedor(op)];
  if (op.cerrada) return respuestaCerrada(op, t);
  const trabajo = structuredClone(op);
  // R14: una sesión abierta no se pisa: se archiva como interrumpida, con su foto (sin llamar al modelo).
  const eventos: Evento[] = [];
  const abierta = trabajo.sesionActual;
  if (abierta !== null) {
    eventos.push(eventoInterrumpida(abierta, o.hoy));
    archivar(trabajo, abierta, RESUMEN_INTERRUMPIDA, o.hoy);
  }
  const sesion = nuevaSesion(modo, o.hoy);
  trabajo.sesionActual = sesion;
  // Mensaje interno: entra al historial, no a la transcripción.
  agregarUsuario(sesion.historial as MessageParam[], [{ type: 'text', text: textoInicio(modo) }]);
  return correr(op, trabajo, sesion, o, t, { esMensajeVendedor: false, forzado: false }, eventos);
}

/** Procesa un mensaje del vendedor (o el cierre, con `cerrar`). Nunca modifica `op`. */
export async function ejecutarTurno(
  op: Oportunidad,
  mensaje: string,
  o: OpcionesTurno & { cerrar?: boolean },
): Promise<ResultadoTurno> {
  const recortado = mensaje.trim();
  const t = TEXTOS[idiomaDelVendedor(op, recortado)];
  if (op.cerrada) return respuestaCerrada(op, t);
  let cerrar = o.cerrar === true;
  if (recortado === '' && !cerrar) return sinCambios(op);
  if (recortado.length > MAX_MENSAJE) return sinCambios(op, t.errorLargo);

  const trabajo = structuredClone(op);
  const sesion = trabajo.sesionActual ?? nuevaSesion('calificar', o.hoy);
  trabajo.sesionActual = sesion;
  const forzado = sesion.turnosVendedor >= TOPE_TURNOS;
  if (forzado) cerrar = true;

  const bloques: ContentBlockParam[] = [];
  if (recortado !== '') {
    // R8: solo los textos internos pueden empezar con "[" en el historial.
    const texto = recortado.startsWith('[') ? `${PREFIJO_VENDEDOR}${recortado}` : recortado;
    bloques.push({ type: 'text', text: texto });
    sesion.transcripcion.push({ rol: 'vendedor', texto: recortado, fecha: o.hoy });
  }
  if (cerrar) bloques.push({ type: 'text', text: TEXTO_CIERRE });
  agregarUsuario(sesion.historial as MessageParam[], bloques);
  // Un "Terminar sesión" sin texto no cuenta como mensaje del vendedor.
  return correr(op, trabajo, sesion, o, t, { esMensajeVendedor: recortado !== '', forzado });
}
