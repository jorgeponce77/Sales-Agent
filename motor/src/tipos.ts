export type Nivel = 'confirmado' | 'supuesto' | 'ausente';
export interface Evidencia<T> { valor: T | null; nivel: Nivel; fuente?: string; fecha?: string }
export type Etapa = 0 | 1 | 2 | 3 | 4 | 5;
export type TipoOportunidad = 'NN' | 'ENxT' | 'EN' | 'EE';
export type Linea = 'WMS' | 'TMS' | 'PLANEACION_DEMANDA' | 'VOICE';
export type Rol = 'E' | 'U' | 'T' | 'C';
export type Grado = 'A' | 'M' | 'B';
export type Modo = 'C' | 'P' | 'E' | 'EC';           // Crecimiento, Problema, Equilibrio, Exceso de confianza
export type Prioridad = 'urgente' | 'activa' | 'importante' | 'postergable';
export type Posicion = 'dominante' | 'nula' | 'compartida' | 'alternativa';
export type TipoAlternativa = 'proveedor' | 'interna' | 'presupuesto' | 'no_hacer_nada';
export type Sensacion = 'euforico'|'excelente'|'seguro'|'comodo'|'bien'|'preocupado'|'molesto'|'inquieto'|'con_miedo'|'con_panico';
export type Severidad = 'critica' | 'alta' | 'media';
export type Lente = 'gerente' | 'director';
export type RutaCierre = 'contrato' | 'oc' | 'ambas_oc_tras_contrato' | 'ambas_independientes' | 'desconocida';

export interface Cuenta {
  nombre: string; pais: string;                       // código ISO-2, p.ej. 'MX'
  esClienteNetlogistik: boolean; esClienteOtraTowerArgano: boolean;
  clienteIdeal: Evidencia<number>[];                  // 5 criterios, valor −5..+5
}
export interface Influencia {
  personaId: string; nombre: string; roles: Rol[];
  grado: Grado | null; modo: Modo | null; calificacion: number | null;
  contactada: boolean; ultimoContacto?: string; nuevaEnPuesto: boolean;
  trDeclaracion: string | null; prioridad: Prioridad | null;
}
export interface Alternativa { tipo: TipoAlternativa; nombre: string | null; posicion: Posicion | null }
export interface CompellingEvent {
  descripcion: string | null; fecha: Evidencia<string>; dueno: Evidencia<string>;
  costoInaccion: Evidencia<string>; urgenciaFalsa: boolean;
}
export interface CadenaCierre {
  ruta: RutaCierre; requiereSOW: boolean | null;
  pasos: { aElegido: boolean; bContratoEnviado: boolean; cComentariosRecibidos: boolean;
           dEnFirma: boolean; eFirmado: boolean; fAltaProveedor: boolean; hOC: boolean };
}
export interface CriterioCumplido {
  clave: string; nivel: Nivel; fuente?: string;
  /** Etapa del CRM (0–8) cuando se registró; con ella un `ausente` previo a esa etapa no cuenta como contradicción. */
  etapaRegistro?: number;
}
export interface AccionPrevia { que: string; quien: string; cuando: string; atiende: string; estado: 'abierta'|'cumplida'|'no_cumplida' }

export interface Expediente {
  id: string; cuenta: Cuenta; lineas: Linea[]; montoUSD: number | null;
  etapaCRM: Etapa; fechaCierreCRM: string | null; fechaCreacion: string;
  esChangeOrder: boolean; cambioDeDueno: boolean; esMercadoNuevo: boolean; revisionGerenteProxima: boolean;
  sensacion: Sensacion | null; prioridad: Evidencia<Prioridad>;
  influencias: Influencia[];
  preguntaCompetenciaHecha: boolean; alternativas: Alternativa[];
  contribucionDiferenciadora: Evidencia<string>; criteriosCompraDefinidos: boolean;
  esRFP: boolean; contactoPrevioRFP: boolean | null;
  reorganizacion: Evidencia<boolean>;
  bant: { budget: Evidencia<string>; authority: Evidencia<string>; need: Evidencia<string>; time: Evidencia<string> };
  compellingEvent: CompellingEvent;
  cadena: CadenaCierre;
  criteriosArgano: CriterioCumplido[];
  higieneCRM: { valores: boolean | null; actividades: boolean | null; etapas: boolean | null };
  accionesPrevias: AccionPrevia[];
}

export interface CriterioArgano { etapaDesde: 0|1|2|3|4; clave: string; texto: string; soloRFP?: boolean }
export interface Config {
  probabilidades: Record<TipoOportunidad, [number,number,number,number,number,number]>;
  ciclosMeses: Record<Linea, number>;
  diasPasoContrato: number;            // 5
  diasAltaProveedor: number;           // 3
  diasOC: number;                      // 3
  holguraEnRiesgo: number;             // 5 días hábiles
  festivos: Record<string, string[]>;  // pais -> fechas ISO
  criteriosArgano: CriterioArgano[];
  pesos: { influencias: number; bant: number; compellingEvent: number; triunfoResultados: number; competencia: number; clienteIdeal: number; coherencia: number };
  topeConCritica: number;              // 40
  umbralVerde: number; umbralRojo: number;   // 70, 40
  fechaOptimistaPct: { etapas01: number; etapa2: number };  // 0.5, 0.25
  umbralMontoAltoUSD: number | null;   // null = no aplica (George lo define)
  caducidadDatoDias: number;           // 90
  caducidadContactoDias: number;       // 60
  horizonteAccionesDias: number;       // 30
  maxAcciones: number;                 // 5
}

export interface Bandera { id: string; severidad: Severidad; texto: string }
export interface Fortaleza { id: string; texto: string }
export interface Hueco { reglaId: string; severidad: Severidad; motivo: string }
export type VeredictoFecha = 'creible' | 'en_riesgo' | 'no_cierra_fecha' | 'no_cierra_periodo';
export interface ResultadoFecha { veredicto: VeredictoFecha; fechaCreible: string | null; diasPendientes: number | null; rutaUsada: 'contrato' | 'oc' | null; acelerador: string | null }
export type NivelEmbudo = 'universo' | 'arriba' | 'en_embudo' | 'pocos_selectos';
export interface ResultadoIndice { total: number; componentes: Record<keyof Config['pesos'], number>; topado: boolean; semaforo: 'verde' | 'ambar' | 'rojo' }
export interface AccionPropuesta { que: string; quien: string; cuando: string; atiende: string }
export interface ResultadoAcciones { aceptadas: AccionPropuesta[]; rechazadas: { accion: AccionPropuesta; motivo: string }[] }
export interface Diagnostico {
  cerrada: boolean; lente: Lente; tipo: TipoOportunidad;
  etapaCRM: Etapa; etapaRecomendada: Etapa; comparacionEtapa: 'al_dia' | 'inflada' | 'rezagada';
  probabilidadDeclarada: number; probabilidadAjustada: number;
  fecha: ResultadoFecha | null; fechaOptimista: boolean;
  embudo: NivelEmbudo; atorada: boolean;
  banderas: Bandera[]; fortalezas: Fortaleza[]; indice: ResultadoIndice;
  huecos: Hueco[]; analisisCompleto: string[];
}
export interface ErrorValidacion { campo: string; mensaje: string }
