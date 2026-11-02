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

export const MONEDAS: readonly string[] = ['USD', 'MXN', 'COP', 'PEN', 'CLP'];

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
