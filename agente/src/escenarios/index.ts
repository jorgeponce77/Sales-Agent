import type { Ficha } from '../tipos.js';
import { E1 } from './E1.js';
import { E2 } from './E2.js';
import { E3 } from './E3.js';
import { E4 } from './E4.js';
import { E5 } from './E5.js';

/** Caso simulado de Netlogistik: ficha del CRM, papel para George y hechos para el vendedor simulado. */
export interface Escenario {
  id: 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
  titulo: string;
  /** Ficha del CRM; todas las fechas se calculan a partir de `hoy` (AAAA-MM-DD) para que el caso no caduque. */
  construirFicha(hoy: string): Ficha;
  /** Tarjeta "Tu papel" para George: de 5 a 8 líneas, en segunda persona. */
  tarjetaPapel: string;
  /** Los mismos hechos en tercera persona y con más detalle, para el vendedor simulado de las evaluaciones. */
  hechosOcultos: string;
  /** Cómo habla el vendedor simulado. */
  persona: string;
  /** Ids de `CATALOGO_REGLAS` que deben poder activarse si el vendedor cuenta los hechos. */
  banderasEsperadas: string[];
}

export const ESCENARIOS: readonly Escenario[] = [E1, E2, E3, E4, E5];
