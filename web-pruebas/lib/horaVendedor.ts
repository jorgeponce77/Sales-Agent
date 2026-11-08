/** Zona horaria del navegador del vendedor, validada: string de hasta 64 caracteres que `Intl.DateTimeFormat` acepta. */
export const MAX_ZONA = 64;

export function zonaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || valor === '' || valor.length > MAX_ZONA) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

/** Hora local (entero 0–23) en la zona dada; `ahora` se inyecta en las pruebas. */
export function horaEnZona(zona: string, ahora: Date = new Date()): number {
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(ahora)
    .find((p) => p.type === 'hour')?.value;
  return Number(hora) % 24;
}
