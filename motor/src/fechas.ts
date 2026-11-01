/**
 * Aritmética de fechas ISO `YYYY-MM-DD` en UTC.
 * Se parsea a mano con Date.UTC: nunca `new Date('YYYY-MM-DD')` ni métodos de hora local.
 */

const MS_DIA = 86_400_000;

function aUtc(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
}

function aIso(ms: number): string {
  const f = new Date(ms);
  const a = String(f.getUTCFullYear()).padStart(4, '0');
  const m = String(f.getUTCMonth() + 1).padStart(2, '0');
  const d = String(f.getUTCDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** Lunes a viernes que no sea festivo. */
export function esHabil(fecha: string, festivos: string[]): boolean {
  const dia = new Date(aUtc(fecha)).getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !festivos.includes(fecha);
}

export function sumarDiasNaturales(desde: string, dias: number): string {
  return aIso(aUtc(desde) + dias * MS_DIA);
}

/** Días naturales de `a` a `b` (con signo: negativo si b < a). */
export function diasNaturalesEntre(a: string, b: string): number {
  return Math.round((aUtc(b) - aUtc(a)) / MS_DIA);
}

/** Cuenta desde el día siguiente a `desde`; con `dias <= 0` devuelve `desde` sin cambios. */
export function sumarDiasHabiles(desde: string, dias: number, festivos: string[]): string {
  let actual = desde;
  let restantes = dias;
  while (restantes > 0) {
    actual = sumarDiasNaturales(actual, 1);
    if (esHabil(actual, festivos)) restantes--;
  }
  return actual;
}

/** Días hábiles en el intervalo (a, b]; 0 si b <= a. */
export function diasHabilesEntre(a: string, b: string, festivos: string[]): number {
  let cuenta = 0;
  let actual = a;
  while (actual < b) {
    actual = sumarDiasNaturales(actual, 1);
    if (esHabil(actual, festivos)) cuenta++;
  }
  return cuenta;
}

/** Último día del trimestre calendario que contiene `fecha`. */
export function finDeTrimestre(fecha: string): string {
  const a = Number(fecha.slice(0, 4));
  const m = Number(fecha.slice(5, 7));
  const mesFin = Math.ceil(m / 3) * 3; // 3, 6, 9, 12
  // Día 0 del mes siguiente = último día de mesFin.
  return aIso(Date.UTC(a, mesFin, 0));
}
