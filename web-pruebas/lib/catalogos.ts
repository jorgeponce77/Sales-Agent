import type { Linea, TipoOportunidad } from 'motor-sales-agent';

/** Etapas del CRM de Argano, por número. */
export const ETAPAS: readonly string[] = [
  'Identifying',
  'Shaping & Discovery',
  'Developing Proposal',
  'Negotiating',
  'Finalizing',
  'Won',
  'Lost',
  'Not Awarded',
  'Cancelled',
];

export const etiquetaEtapa = (n: number): string => `${n} · ${ETAPAS[n] ?? 'Desconocida'}`;

export const PAISES: ReadonlyArray<{ codigo: string; nombre: string }> = [
  { codigo: 'MX', nombre: 'México' },
  { codigo: 'CO', nombre: 'Colombia' },
  { codigo: 'PE', nombre: 'Perú' },
  { codigo: 'EC', nombre: 'Ecuador' },
  { codigo: 'CL', nombre: 'Chile' },
  { codigo: 'GT', nombre: 'Guatemala' },
  { codigo: 'CR', nombre: 'Costa Rica' },
  { codigo: 'PA', nombre: 'Panamá' },
  { codigo: 'US', nombre: 'Estados Unidos' },
];

// Solo USD mientras George no defina los tipos de cambio (spec: un tipo de cambio fijo que actualiza el director).
// Con otra moneda el agente no puede convertir el monto (montoUSD = null) y el monto no cuenta para escalar a
// análisis completo; por eso el formulario no la ofrece. La ficha sí puede cambiar de moneda en la conversación
// (actualizar_ficha) y entonces el panel muestra un aviso.
export const MONEDAS: readonly string[] = ['USD'];

export const LINEAS: ReadonlyArray<{ valor: Linea; etiqueta: string }> = [
  { valor: 'WMS', etiqueta: 'WMS (almacenes)' },
  { valor: 'TMS', etiqueta: 'TMS (transporte)' },
  { valor: 'PLANEACION_DEMANDA', etiqueta: 'Planeación de la demanda' },
  { valor: 'VOICE', etiqueta: 'Voice' },
];

export const TIPOS: ReadonlyArray<{ valor: TipoOportunidad; etiqueta: string }> = [
  { valor: 'NN', etiqueta: 'Nuevo logo' },
  { valor: 'ENxT', etiqueta: 'Existente de otra torre Argano' },
  { valor: 'EN', etiqueta: 'Existente Netlogistik' },
  { valor: 'EE', etiqueta: 'Change order' },
];

export const MODOS_SESION: ReadonlyArray<{ valor: 'calificar' | 'revision_rapida'; etiqueta: string }> = [
  { valor: 'calificar', etiqueta: 'Calificar' },
  { valor: 'revision_rapida', etiqueta: 'Revisión rápida' },
];

export const etiquetaModo = (modo: string): string => MODOS_SESION.find((m) => m.valor === modo)?.etiqueta ?? modo;

export type LecturaTcv = { monto: number; error: null } | { monto: null; error: string };

const ERROR_TCV = 'El TCV debe ser un número mayor que 0 (por ejemplo, 450000 o 450,000).';
const ERROR_TCV_AMBIGUO =
  'El TCV es ambiguo: escribe solo dígitos (450000) o con comas de miles y punto decimal (450,000).';

/**
 * Monto escrito por una persona ("450,000", "450 000", "450000.50"), o el error en español. Se rechazan los
 * formatos ambiguos: un punto seguido de exactamente 3 dígitos ("380.000", ¿miles o decimales?) y la coma
 * decimal ("450,5"): una coma solo vale como separador de miles, seguida de exactamente 3 dígitos.
 */
export function leerTcv(texto: string): LecturaTcv {
  const t = texto.trim();
  if (/\.\d{3}(?!\d)/.test(t) || /,(?!\d{3}(?!\d))/.test(t)) return { monto: null, error: ERROR_TCV_AMBIGUO };
  const limpio = t.replace(/[,\s]/g, '');
  if (limpio === '' || !/^\d+(\.\d+)?$/.test(limpio)) return { monto: null, error: ERROR_TCV };
  const monto = Number(limpio);
  return Number.isFinite(monto) && monto > 0 ? { monto, error: null } : { monto: null, error: ERROR_TCV };
}

/** Monto o null si no es un número mayor que 0 o es ambiguo (ver `leerTcv`). */
export const parsearTcv = (texto: string): number | null => leerTcv(texto).monto;

/** Monto con comas de miles y hasta 2 decimales ("450,000"), para mostrar lo que se entendió. */
export const formatearMonto = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
