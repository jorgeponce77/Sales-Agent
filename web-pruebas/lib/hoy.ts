import { hoyEnMexico } from 'agente-sales-agent';

/** Fecha de hoy (AAAA-MM-DD) en America/Mexico_City; la pone el servidor, nunca el navegador. */
export function hoyMexico(): string {
  return hoyEnMexico();
}
