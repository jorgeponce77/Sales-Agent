import { CONFIG_DEFAULT } from 'motor-sales-agent';
import { CAMPOS_REGISTRABLES } from './registrar.js';

/** Definición de una herramienta para la API de mensajes de Anthropic. */
export interface DefinicionHerramienta {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

// Los enum espejan los tipos de `motor/src/tipos.ts`.
const NIVEL = ['confirmado', 'supuesto', 'ausente'];
const ROLES = ['E', 'U', 'T', 'C'];
const GRADO = ['A', 'M', 'B'];
const MODO = ['C', 'P', 'E', 'EC'];
const PRIORIDAD = ['urgente', 'activa', 'importante', 'postergable'];
const POSICION = ['dominante', 'nula', 'compartida', 'alternativa'];
const TIPO_ALTERNATIVA = ['proveedor', 'interna', 'presupuesto', 'no_hacer_nada'];
const RUTA = ['contrato', 'oc', 'ambas_oc_tras_contrato', 'ambas_independientes', 'desconocida'];
const ESTADO_ACCION = ['cumplida', 'no_cumplida'];
const CAMPOS_FICHA = ['etapaCRM', 'fechaCierreCRM', 'tcv', 'moneda'];
const CLAVES_CRITERIOS = CONFIG_DEFAULT.criteriosArgano.map((c) => c.clave);

const SIN_PARAMETROS = { type: 'object' as const, properties: {} };

export const DEFINICIONES_HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    name: 'leer_expediente',
    description:
      'Devuelve la ficha del CRM, el expediente completo de la oportunidad y las acciones abiertas (con su índice). ' +
      'Úsala al abrir la sesión o cuando necesites recordar qué ya se registró antes de preguntar o de escribir; no repreguntes lo que ya está ahí.',
    input_schema: SIN_PARAMETROS,
  },
  {
    name: 'registrar_dato',
    description:
      'Registra un dato escalar del expediente (BANT, compelling event, prioridad, banderas de la cuenta, etc.) y reemplaza el valor anterior. ' +
      'Úsala cada vez que el vendedor te dé un dato nuevo o corrija uno. En los campos con evidencia indica el nivel: ' +
      '"confirmado" si lo dijo el cliente, "supuesto" si es una suposición del vendedor, "ausente" si no se sabe (entonces el valor es null). ' +
      'Los campos de tipo verdadero/falso no llevan nivel. Valores: texto, número, verdadero/falso o null según el campo; ' +
      'prioridad usa urgente, activa, importante o postergable; sensacion usa euforico, excelente, seguro, comodo, bien, preocupado, molesto, inquieto, con_miedo o con_panico. ' +
      'Si la herramienta devuelve errores, corrige y vuelve a preguntar al vendedor.',
    input_schema: {
      type: 'object',
      properties: {
        campo: { type: 'string', enum: [...CAMPOS_REGISTRABLES], description: 'Campo del expediente a escribir.' },
        valor: {
          type: ['string', 'number', 'boolean', 'null'],
          description: 'Nuevo valor, del tipo que pide el campo. Con nivel "ausente" va null.',
        },
        nivel: { type: 'string', enum: NIVEL, description: 'Nivel de evidencia (obligatorio en los campos con evidencia).' },
        fuente: { type: 'string', description: 'Quién del cliente lo dijo, o de dónde sale el dato (opcional).' },
      },
      required: ['campo', 'valor'],
    },
  },
  {
    name: 'registrar_criterio_argano',
    description:
      'Registra el nivel de cumplimiento de criterios de Argano; cada clave reemplaza su nivel anterior, no acumula. ' +
      'Úsala con los criterios de la etapa actual del CRM cuando el vendedor confirme, suponga o desconozca si se cumplen. ' +
      'Los de etapas anteriores se dan por cumplidos: no los preguntes y regístralos (en "ausente") solo si el vendedor los contradice. Dos formas: un criterio {clave, nivel, fuente?} ' +
      'o un lote {criterios: [{clave, nivel, fuente?}, ...]} de 1 a 30 (registra los criterios de una etapa en una sola llamada). ' +
      'El lote es atómico: si un elemento es inválido no se registra ninguno y vuelven todos los errores. ' +
      'Los criterios internos de Argano/Netlogistik con nivel "confirmado" exigen fuente con la referencia verificable del vendedor ' +
      '("vendedor: <quién lo aprobó / número de PR / fecha>"); sin referencia, regístralos como "supuesto".',
    input_schema: {
      type: 'object',
      properties: {
        clave: { type: 'string', enum: CLAVES_CRITERIOS, description: 'Criterio de Argano (forma individual).' },
        nivel: { type: 'string', enum: NIVEL, description: 'Nivel de cumplimiento (forma individual).' },
        fuente: { type: 'string', maxLength: 200, description: 'Quién lo confirmó o la referencia verificable (forma individual, opcional).' },
        criterios: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          description: 'Lote de criterios (en lugar de clave/nivel/fuente).',
          items: {
            type: 'object',
            properties: {
              clave: { type: 'string', enum: CLAVES_CRITERIOS },
              nivel: { type: 'string', enum: NIVEL },
              fuente: { type: 'string', maxLength: 200 },
            },
            required: ['clave', 'nivel'],
          },
        },
      },
    },
  },
  {
    name: 'registrar_influencia',
    description:
      'Crea o actualiza una Influencia (persona del cliente) con su rol, grado, modo, calificación, contacto y Triunfo-Resultado. ' +
      'Úsala cuando el vendedor mencione a una persona de la cuenta o cambie algo de ella. Si ya existe (mismo personaId o nombre), solo se actualizan los campos que envíes; con personaId, un nombre nuevo reemplaza al anterior. ' +
      'Si el vendedor no sabe el nombre, regístrala por cargo: "<cargo> (nombre pendiente)". ' +
      'Roles: E Económico, U Usuario, T Técnico, C Coach. Grado: A alto, M medio, B bajo. Modo: C Crecimiento, P Problema, E Equilibrio, EC Exceso de confianza. ' +
      'La calificación es un entero de -5 a -1 o de 1 a 5 (el 0 no existe).',
    input_schema: {
      type: 'object',
      properties: {
        personaId: { type: 'string', description: 'Identificador de una influencia ya registrada (opcional).' },
        nombre: { type: 'string', maxLength: 120, description: 'Nombre de la persona (máximo 120 caracteres).' },
        roles: { type: 'array', items: { type: 'string', enum: ROLES }, description: 'Roles que cumple en la compra.' },
        grado: { type: ['string', 'null'], enum: [...GRADO, null], description: 'Grado de influencia.' },
        modo: { type: ['string', 'null'], enum: [...MODO, null], description: 'Modo de la persona.' },
        calificacion: { type: ['integer', 'null'], minimum: -5, maximum: 5, description: 'De -5 a -1 o de 1 a 5; sin cero.' },
        contactada: { type: 'boolean', description: 'Si el vendedor ya habló con ella.' },
        ultimoContacto: { type: 'string', description: 'Fecha del último contacto, AAAA-MM-DD.' },
        nuevaEnPuesto: { type: 'boolean', description: 'Si es nueva en el puesto.' },
        trDeclaracion: { type: ['string', 'null'], description: 'Triunfo-Resultado de la persona, en sus palabras.' },
        prioridad: { type: ['string', 'null'], enum: [...PRIORIDAD, null], description: 'Prioridad que la persona le da al tema.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'registrar_alternativa',
    description:
      'Registra una alternativa a la compra (otro proveedor, solución interna, presupuesto en otra cosa o no hacer nada) y su posición; ' +
      'también marca que la pregunta de competencia ya se hizo. Úsala cuando el vendedor diga contra qué o quién compite la oportunidad. ' +
      'Si dice que no hay competencia, antes de registrar haz una sola pregunta por las demás alternativas (solución interna, presupuesto en otra cosa, no hacer nada): ' +
      '"¿El cliente podría resolverlo en casa, usar ese dinero en otro proyecto o no hacer nada?"; ' +
      'registra la que exista con su tipo y posición. Registra "no_hacer_nada" con posición "nula" solo si de verdad no hay alternativa de ningún tipo. ' +
      'Para el motor la posición general es la peor de las alternativas registradas, y es Nula si no hay ninguna (con la pregunta hecha) o si todas están en nula. ' +
      'Si ya existe (mismo tipo y nombre), actualiza su posición.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: TIPO_ALTERNATIVA },
        nombre: { type: ['string', 'null'], description: 'Nombre del proveedor o de la alternativa, si lo hay.' },
        posicion: { type: ['string', 'null'], enum: [...POSICION, null], description: 'Qué tan fuerte es frente a nuestra propuesta.' },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'actualizar_cadena_cierre',
    description:
      'Actualiza parcialmente la cadena de cierre: la ruta (contrato u OC), si requiere SOW y los pasos a-h ya cumplidos. ' +
      'Úsala cuando el vendedor cuente cómo se cerrará la compra o avance en un paso. Envía solo lo que cambió.',
    input_schema: {
      type: 'object',
      properties: {
        ruta: { type: 'string', enum: RUTA },
        requiereSOW: { type: ['boolean', 'null'] },
        pasos: {
          type: 'object',
          description: 'Pasos cumplidos (true) o no (false); envía solo los que cambiaron.',
          properties: {
            aElegido: { type: 'boolean', description: 'a. Nos eligieron.' },
            bContratoEnviado: { type: 'boolean', description: 'b. Contrato enviado.' },
            cComentariosRecibidos: { type: 'boolean', description: 'c. Comentarios recibidos.' },
            dEnFirma: { type: 'boolean', description: 'd. En firma.' },
            eFirmado: { type: 'boolean', description: 'e. Firmado.' },
            fAltaProveedor: { type: 'boolean', description: 'f. Alta de proveedor.' },
            hOC: { type: 'boolean', description: 'h. Orden de compra.' },
          },
        },
      },
    },
  },
  {
    name: 'actualizar_ficha',
    description:
      'Actualiza la etapa del CRM, la fecha de cierre del CRM, el TCV o la moneda. Úsala SOLO cuando el vendedor diga que ya cambió en el CRM; ' +
      'nunca por inferencia tuya. Queda registrado como un evento visible para el gerente.',
    input_schema: {
      type: 'object',
      properties: {
        campo: { type: 'string', enum: CAMPOS_FICHA },
        valor: {
          type: ['string', 'number'],
          description: 'etapaCRM: entero 0 a 8. fechaCierreCRM: AAAA-MM-DD. tcv: número. moneda: código como USD o MXN.',
        },
      },
      required: ['campo', 'valor'],
    },
  },
  {
    name: 'obtener_huecos_priorizados',
    description:
      'Devuelve los huecos de información del expediente en el orden en que conviene preguntarlos (severidad y lente), ' +
      'cada uno con "deQuien" cuando se sabe a quién preguntarle. Úsala para decidir la siguiente pregunta: una a la vez, explicando por qué la haces.',
    input_schema: SIN_PARAMETROS,
  },
  {
    name: 'calcular_diagnostico',
    description:
      'Calcula el diagnóstico completo del motor: etapa recomendada, probabilidad ajustada, veredicto de fecha, banderas, fortalezas e índice. ' +
      'Úsala al cerrar la sesión o cuando el vendedor pida el diagnóstico; explícalo, no lo recalcules ni lo contradigas.',
    input_schema: SIN_PARAMETROS,
  },
  {
    name: 'proponer_acciones',
    description:
      'Propone las acciones siguientes (máximo 5, a 30 días). Cada una debe atender una bandera o fortaleza del diagnóstico (campo "atiende" = su id), ' +
      'con qué se hará, quién y para cuándo. El motor las valida: las aceptadas se guardan como abiertas y las rechazadas vuelven con su motivo para que las corrijas. ' +
      'El siguiente paso que mencione el vendedor no tiene otro campo: entra aquí como acción. Úsala después de calcular el diagnóstico.',
    input_schema: {
      type: 'object',
      properties: {
        acciones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              que: { type: 'string', description: 'Qué se va a hacer.' },
              quien: { type: 'string', description: 'Quién lo hace (nombre).' },
              cuando: { type: 'string', description: 'Fecha límite AAAA-MM-DD, dentro de los próximos 30 días.' },
              atiende: { type: 'string', description: 'Id de la bandera o fortaleza del diagnóstico que atiende.' },
            },
            required: ['que', 'quien', 'cuando', 'atiende'],
          },
        },
      },
      required: ['acciones'],
    },
  },
  {
    name: 'marcar_accion',
    description:
      'Marca una acción de sesiones anteriores como cumplida o no cumplida. Úsala al abrir una sesión, revisando una por una las acciones abiertas ' +
      'que devuelve leer_expediente (usa su "indice").',
    input_schema: {
      type: 'object',
      properties: {
        indice: { type: 'integer', minimum: 0, description: 'Índice de la acción, tal como lo da leer_expediente.' },
        estado: { type: 'string', enum: ESTADO_ACCION },
      },
      required: ['indice', 'estado'],
    },
  },
  {
    name: 'cerrar_sesion',
    description:
      'Cierra la sesión con un resumen corto en español (2 a 4 líneas, máximo 600 caracteres): qué cambió, el diagnóstico en una frase, el siguiente paso y las acciones acordadas. ' +
      'Úsala solo cuando el vendedor pida terminar, cuando acepte después de que tú propusiste cerrar (revisión rápida completa o huecos críticos cubiertos) ' +
      'o al llegar el mensaje interno de cierre (botón Terminar sesión o tope de mensajes); siempre después de dar el diagnóstico. ' +
      'Nunca cierres por tu cuenta sin proponerlo antes.',
    input_schema: {
      type: 'object',
      properties: { resumen: { type: 'string', maxLength: 600, description: 'Resumen de 2 a 4 líneas, en español.' } },
      required: ['resumen'],
    },
  },
];
