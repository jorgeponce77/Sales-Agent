/** Fecha de hoy (AAAA-MM-DD) en la zona America/Mexico_City, sin importar la zona del servidor. */
export function hoyEnMexico(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}
