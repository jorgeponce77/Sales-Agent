/** Fecha de hoy (AAAA-MM-DD) en la zona America/Mexico_City, sin importar la zona del servidor. */
export function hoyEnMexico(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/** Zona horaria por país de la ficha (código ISO-2). Un país sin zona aquí usa America/Mexico_City. */
const ZONA_POR_PAIS: Readonly<Record<string, string>> = Object.freeze({
  MX: 'America/Mexico_City',
  CO: 'America/Bogota',
  PE: 'America/Lima',
  CL: 'America/Santiago',
  EC: 'America/Guayaquil',
  GT: 'America/Guatemala',
  CR: 'America/Costa_Rica',
  PA: 'America/Panama',
  AR: 'America/Argentina/Buenos_Aires',
  US: 'America/Chicago',
});

/**
 * Hora local (entero 0–23) en la zona del país de la ficha, para que el agente salude según la hora
 * del vendedor. La usan la web y los evals; `ahora` se inyecta en las pruebas.
 */
export function horaLocalPorPais(pais: string, ahora: Date = new Date()): number {
  const zona = ZONA_POR_PAIS[pais.trim().toUpperCase()] ?? 'America/Mexico_City';
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(ahora)
    .find((p) => p.type === 'hour')?.value;
  // Algunos motores de Intl devuelven "24" para la medianoche aun con h23.
  return Number(hora) % 24;
}

/** Saludo según la hora local: 5–11 buenos días, 12–18 buenas tardes, el resto buenas noches. */
export function saludoPorHora(hora: number): 'buenos días' | 'buenas tardes' | 'buenas noches' {
  if (hora >= 5 && hora <= 11) return 'buenos días';
  if (hora >= 12 && hora <= 18) return 'buenas tardes';
  return 'buenas noches';
}
