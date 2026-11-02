import { CATALOGO_REGLAS, CONFIG_DEFAULT, construirContexto } from 'motor-sales-agent';
import type { Diagnostico, Evidencia, Expediente, Influencia } from 'motor-sales-agent';
import type { ModoSesion, Oportunidad } from '../tipos.js';
import { INSTRUCCIONES_BASE, VERSION_INSTRUCCIONES } from './base.js';

/** Qué significa cada bandera del motor, para que el agente la explique sin recalcularla. */
const SIGNIFICADO: Readonly<Record<string, string>> = {
  sin_economico: 'no hay Influencia Económica identificada',
  economico_sin_cubrir: 'ningún Económico ha sido contactado',
  budget_ausente: 'no hay información de presupuesto',
  no_elegidos_cierre_periodo: 'no nos han elegido (paso a) y el cierre cae en este periodo',
  etapa_inflada_grave: 'la etapa del CRM está 2 o más etapas arriba de la recomendada',
  bant_supuesto: 'algún elemento de BANT está solo en supuesto',
  bant_ausente: 'falta Authority, Need o Time',
  ce_incompleto: 'falta confirmar la fecha, el dueño o el costo de inacción del compelling event',
  ce_urgencia_falsa: 'la urgencia no viene de un evento real del cliente',
  sin_coach_valido: 'no hay Coach con +3 o más en Crecimiento o Problema',
  etapa_inflada: 'la etapa del CRM está 1 etapa arriba de la recomendada',
  banco_una_pata: 'solo hay una influencia contactada',
  rfp_sin_contacto_previo: 'es RFP y no hay contacto previo confirmado con las influencias',
  atorada: 'la antigüedad supera el ciclo normal de la línea',
  sow_requerido_solo_oc: 'requiere SOW pero el cierre previsto es solo con OC',
  no_cierra_fecha: 'los pasos pendientes de la cadena no caben antes de la fecha del CRM',
  influencia_alta_no_contactada: 'hay una influencia de grado Alto sin contactar',
  sin_contribucion_diferenciadora: 'no se ha identificado nuestra contribución diferenciadora',
  alternativas_no_identificadas: 'no se ha preguntado por la competencia ni por las alternativas',
  cierre_despues_ce: 'la fecha de cierre es posterior a la del compelling event',
  urgente_sin_ce: 'prioridad urgente sin compelling event con fecha',
  influencia_nueva_puesto: 'hay influencias nuevas en el puesto',
  reorganizacion: 'el cliente está en reorganización',
  informacion_incierta: 'hay más de un Económico: no está claro quién decide',
  modo_calificacion_inconsistente: 'calificación positiva con modo Equilibrio o Exceso de confianza',
  modo_no_determinado: 'hay influencias contactadas sin modo',
  nula_sin_criterios: 'posición Nula sin criterios de compra definidos',
  euforia_con_banderas: 'el vendedor está eufórico o excelente y hay banderas críticas o altas',
  prioridad_incongruente: 'la prioridad no cuadra con el modo del Económico o con el cierre cercano',
  tr_no_redactado: 'falta el Triunfo-Resultado de influencias de grado A o M',
  dato_caduco: `hay datos confirmados hace más de ${CONFIG_DEFAULT.caducidadDatoDias} días`,
  influencia_sin_contacto: `hay influencias sin contacto en más de ${CONFIG_DEFAULT.caducidadContactoDias} días`,
  crm_desactualizado: 'el vendedor reconoce que el CRM no está al día',
  grado_bajo_ignorado: 'hay influencias de grado Bajo sin contactar',
  fecha_optimista: 'la fecha del CRM es optimista para la etapa y el ciclo de la línea',
};

const SEVERIDAD = { critica: 'crítica', alta: 'alta', media: 'media' } as const;

const CATALOGO_BANDERAS = [
  '## 5. Catálogo de banderas del motor',
  '',
  `Formato: id · severidad · (solo con la lente indicada; si no dice, aplica con ambas) · qué significa. Las críticas limitan el índice a ${CONFIG_DEFAULT.topeConCritica} y ponen el semáforo en rojo. Usa el id en \`atiende\` de \`proponer_acciones\`.`,
  '',
  ...CATALOGO_REGLAS.map((r) => {
    const significado = SIGNIFICADO[r.id];
    const lente = r.lente === 'ambas' ? '' : ` · solo lente ${r.lente}`;
    return `- \`${r.id}\` · ${SEVERIDAD[r.severidad]}${lente}${significado ? ` · ${significado}` : ''}`;
  }),
].join('\n');

/** Parte fija: idéntica para toda oportunidad y modo (se cachea). */
const FIJO = `${INSTRUCCIONES_BASE}\n\n${CATALOGO_BANDERAS}\n`;

// ---------------------------------------------------------------------------
// Parte variable
// ---------------------------------------------------------------------------

const MAX_TEXTO = 80;
const MAX_SESIONES = 5;

const recortar = (t: string): string => (t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1)}…` : t);
const siNo = (b: boolean | null): string => (b === null ? '?' : b ? 'sí' : 'no');
const firmar = (n: number): string => (n > 0 ? `+${n}` : String(n));

/** "nivel «valor» (fuente)" de una evidencia, sin el valor si está ausente. */
function ev(e: Evidencia<unknown>): string {
  if (e.nivel === 'ausente' || e.valor === null) return 'ausente';
  const fuente = e.fuente ? ` (${recortar(e.fuente)})` : '';
  return `${e.nivel} «${recortar(String(e.valor))}»${fuente}`;
}

function lineaInfluencia(i: Influencia): string {
  const partes = [
    `${i.nombre} [id ${i.personaId}]`,
    i.roles.length > 0 ? i.roles.join(',') : 'sin rol',
    `grado ${i.grado ?? '?'}`,
    `modo ${i.modo ?? '?'}`,
    `calif. ${i.calificacion === null ? '?' : firmar(i.calificacion)}`,
    i.contactada ? `contactada${i.ultimoContacto ? ` ${i.ultimoContacto}` : ''}` : 'no contactada',
    `TR ${i.trDeclaracion && i.trDeclaracion.trim() !== '' ? 'sí' : 'no'}`,
  ];
  if (i.prioridad) partes.push(`prioridad ${i.prioridad}`);
  if (i.nuevaEnPuesto) partes.push('nueva en el puesto');
  return `- ${partes.join(' · ')}`;
}

/** Criterios de Argano aún no confirmados en las etapas que el CRM ya dice haber pasado. */
function criteriosPendientes(exp: Expediente): string {
  const confirmados = new Set(exp.criteriosArgano.filter((c) => c.nivel === 'confirmado').map((c) => c.clave));
  const pendientes = CONFIG_DEFAULT.criteriosArgano
    .filter((c) => c.etapaDesde < exp.etapaCRM && (!c.soloRFP || exp.esRFP) && !confirmados.has(c.clave))
    .map((c) => c.clave);
  if (exp.etapaCRM === 0) return 'no aplica (etapa 0)';
  return pendientes.length === 0 ? 'todos confirmados' : pendientes.join(', ');
}

function bloqueExpediente(exp: Expediente, diag: Diagnostico): string[] {
  const { bant, compellingEvent: ce, cadena } = exp;
  const pasos = Object.entries(cadena.pasos)
    .filter(([, hecho]) => hecho)
    .map(([k]) => k.charAt(0));
  const alternativas = exp.alternativas.map((a) => `${a.tipo}${a.nombre ? ` ${a.nombre}` : ''} (${a.posicion ?? '?'})`);
  const marcas = [
    exp.esChangeOrder && 'change order',
    exp.cuenta.esClienteNetlogistik && 'cliente Netlogistik',
    exp.cuenta.esClienteOtraTowerArgano && 'cliente de otra Tower',
    exp.cambioDeDueno && 'cuenta heredada',
    exp.esMercadoNuevo && 'mercado nuevo',
    exp.revisionGerenteProxima && 'revisión con gerente próxima',
    exp.esRFP && `RFP (contacto previo ${siNo(exp.contactoPrevioRFP)})`,
  ].filter((m): m is string => typeof m === 'string');

  return [
    '## Expediente',
    `Tipo según el motor: ${diag.tipo}${marcas.length > 0 ? ` · ${marcas.join(' · ')}` : ''}`,
    exp.influencias.length === 0 ? 'Influencias: ninguna registrada' : 'Influencias:',
    ...exp.influencias.map(lineaInfluencia),
    `BANT: Budget ${ev(bant.budget)} · Authority ${ev(bant.authority)} · Need ${ev(bant.need)} · Time ${ev(bant.time)}`,
    `Compelling event: ${ce.descripcion ? `«${recortar(ce.descripcion)}»` : 'sin descripción'} · fecha ${ev(ce.fecha)} · dueño ${ev(ce.dueno)} · costo de inacción ${ev(ce.costoInaccion)}${ce.urgenciaFalsa ? ' · URGENCIA FALSA' : ''}`,
    `Prioridad: ${ev(exp.prioridad)} · Sensación del vendedor: ${exp.sensacion ?? '?'} · Reorganización: ${ev(exp.reorganizacion)}`,
    `Competencia: pregunta hecha ${siNo(exp.preguntaCompetenciaHecha)} · alternativas: ${alternativas.length > 0 ? alternativas.join('; ') : 'ninguna'} · contribución diferenciadora ${ev(exp.contribucionDiferenciadora)} · criterios de compra definidos ${siNo(exp.criteriosCompraDefinidos)}`,
    `Cadena de cierre: ruta ${cadena.ruta} · requiere SOW ${siNo(cadena.requiereSOW)} · pasos cumplidos: ${pasos.length > 0 ? pasos.join(', ') : 'ninguno'}`,
    `Criterios de Argano sin confirmar (etapas anteriores a la del CRM): ${criteriosPendientes(exp)}`,
    `Higiene de CRM: valores ${siNo(exp.higieneCRM.valores)} · actividades ${siNo(exp.higieneCRM.actividades)} · etapas ${siNo(exp.higieneCRM.etapas)}`,
  ];
}

function bloqueDiagnostico(diag: Diagnostico): string[] {
  const ids = (sev: 'critica' | 'alta'): string => {
    const lista = diag.banderas.filter((b) => b.severidad === sev).map((b) => b.id);
    return lista.length > 0 ? lista.join(', ') : 'ninguna';
  };
  const fecha = diag.fecha
    ? `Fecha: ${diag.fecha.veredicto} · fecha creíble ${diag.fecha.fechaCreible ?? '—'}`
    : `Fecha: prueba de cierre no aplica (lente gerente) · fecha optimista ${siNo(diag.fechaOptimista)}`;
  const lineas = [
    '## Diagnóstico vigente (motor)',
    `Semáforo ${diag.indice.semaforo} · índice ${diag.indice.total}/100${diag.indice.topado ? ' (topado por crítica)' : ''} · etapa CRM ${diag.etapaCRM} vs. recomendada ${diag.etapaRecomendada} (${diag.comparacionEtapa}) · probabilidad ${diag.probabilidadDeclarada}% declarada vs. ${diag.probabilidadAjustada}% ajustada · embudo ${diag.embudo}`,
    fecha,
    `Banderas críticas: ${ids('critica')}`,
    `Banderas altas: ${ids('alta')}`,
  ];
  if (diag.analisisCompleto.length > 0) lineas.push(`Análisis completo requerido por: ${diag.analisisCompleto.join(', ')}`);
  return lineas;
}

function bloqueAcciones(exp: Expediente): string[] {
  const abiertas = exp.accionesPrevias
    .map((a, indice) => ({ a, indice }))
    .filter(({ a }) => a.estado === 'abierta');
  if (abiertas.length === 0) return ['## Acciones abiertas', 'ninguna'];
  return [
    '## Acciones abiertas',
    ...abiertas.map(({ a, indice }) => `- [${indice}] ${a.que} · ${a.quien} · ${a.cuando} · atiende ${a.atiende}`),
  ];
}

function bloqueSesiones(op: Oportunidad): string[] {
  if (op.sesiones.length === 0) return [];
  const recientes = op.sesiones.slice(-MAX_SESIONES);
  const omitidas = op.sesiones.length - recientes.length;
  return [
    '## Sesiones anteriores',
    ...(omitidas > 0 ? [`(${omitidas} sesiones más antiguas omitidas)`] : []),
    ...recientes.map((s) => `- ${s.fecha} (${s.modo}): ${s.resumen}`),
  ];
}

/**
 * Instrucciones del sistema para un turno: `fijo` (cacheable, igual para toda oportunidad)
 * y `variable` (hoy, modo, lente, ficha, expediente resumido, diagnóstico y memoria).
 * `diag` es el diagnóstico vigente, calculado al inicio del turno.
 */
export function construirInstrucciones(
  op: Oportunidad,
  modo: ModoSesion,
  hoy: string,
  diag: Diagnostico,
): { fijo: string; variable: string; version: string } {
  const { lente } = construirContexto(op.expediente, hoy, CONFIG_DEFAULT);
  const f = op.ficha;
  const ultima = op.sesiones[op.sesiones.length - 1];
  const sesion = ultima ? `Retorno desde ${ultima.fecha}` : 'Sesión nueva (primera sesión de esta oportunidad)';
  const mensajes = op.sesionActual ? ` · mensajes del vendedor en esta sesión: ${op.sesionActual.turnosVendedor} de 40` : '';

  const lineas = [
    '# Contexto de esta sesión',
    `Hoy: ${hoy} · Modo: ${modo} · Lente: ${lente}`,
    `Sesión: ${sesion}${mensajes}`,
    `Ficha (CRM): ${f.idCRM} · ${f.cliente} · ${f.oportunidad} · ${f.pais} · ${f.lineas.join('+')} · tipo ${f.tipo ?? 'sin dato'} · etapa ${f.etapaCRM} · TCV ${f.tcv} ${f.moneda} · creada ${f.fechaCreacion} · cierre ${f.fechaCierreCRM} · RFP ${siNo(f.esRFP)} · prob. CRM ${f.probabilidadCRM === null ? '?' : `${f.probabilidadCRM}%`} · últ. act. CRM ${f.ultimaActualizacionCRM ?? '?'}`,
    '',
    ...bloqueExpediente(op.expediente, diag),
    '',
    ...bloqueDiagnostico(diag),
    '',
    ...bloqueAcciones(op.expediente),
  ];
  const sesiones = bloqueSesiones(op);
  if (sesiones.length > 0) lineas.push('', ...sesiones);

  return { fijo: FIJO, variable: lineas.join('\n'), version: VERSION_INSTRUCCIONES };
}
