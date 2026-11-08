import { describe, expect, it } from 'vitest';
import { horaLocalPorPais, hoyEnMexico, saludoPorHora } from '../src/index.js';

describe('hoyEnMexico', () => {
  it('usa la fecha de America/Mexico_City, no la del reloj del servidor', () => {
    // 03:30 UTC del 3 de noviembre = 21:30 del 2 de noviembre en la Ciudad de México (UTC-6).
    expect(hoyEnMexico(new Date('2026-11-03T03:30:00Z'))).toBe('2026-11-02');
    expect(hoyEnMexico(new Date('2026-11-03T06:30:00Z'))).toBe('2026-11-03');
    expect(hoyEnMexico(new Date('2027-01-05T12:00:00Z'))).toBe('2027-01-05');
  });
});

describe('horaLocalPorPais', () => {
  // 15:30 UTC del 8 de noviembre de 2026 (sin horario de verano en México).
  const AHORA = new Date('2026-11-08T15:30:00Z');

  it('usa la zona del país de la ficha', () => {
    expect(horaLocalPorPais('MX', AHORA)).toBe(9);   // America/Mexico_City, UTC-6
    expect(horaLocalPorPais('CO', AHORA)).toBe(10);  // America/Bogota, UTC-5
    expect(horaLocalPorPais('PE', AHORA)).toBe(10);  // America/Lima, UTC-5
    expect(horaLocalPorPais('EC', AHORA)).toBe(10);  // America/Guayaquil, UTC-5
    expect(horaLocalPorPais('PA', AHORA)).toBe(10);  // America/Panama, UTC-5
    expect(horaLocalPorPais('GT', AHORA)).toBe(9);   // America/Guatemala, UTC-6
    expect(horaLocalPorPais('CR', AHORA)).toBe(9);   // America/Costa_Rica, UTC-6
    expect(horaLocalPorPais('CL', AHORA)).toBe(12);  // America/Santiago, UTC-3 en noviembre (horario de verano)
    expect(horaLocalPorPais('AR', AHORA)).toBe(12);  // America/Argentina/Buenos_Aires, UTC-3
    expect(horaLocalPorPais('US', AHORA)).toBe(9);   // America/Chicago, UTC-6 en noviembre
  });

  it('un país sin zona configurada usa America/Mexico_City', () => {
    expect(horaLocalPorPais('BR', AHORA)).toBe(9);
    expect(horaLocalPorPais('', AHORA)).toBe(9);
  });

  it('acepta el código en minúsculas', () => {
    expect(horaLocalPorPais('co', AHORA)).toBe(10);
  });

  it('la medianoche es 0, no 24', () => {
    expect(horaLocalPorPais('MX', new Date('2026-11-08T06:15:00Z'))).toBe(0);
  });

  it('devuelve un entero de 0 a 23', () => {
    for (let h = 0; h < 24; h++) {
      const hora = horaLocalPorPais('MX', new Date(Date.UTC(2026, 10, 8, h, 5)));
      expect(Number.isInteger(hora)).toBe(true);
      expect(hora).toBeGreaterThanOrEqual(0);
      expect(hora).toBeLessThanOrEqual(23);
    }
  });
});

describe('saludoPorHora', () => {
  it('5–11 días, 12–18 tardes, resto noches', () => {
    expect(saludoPorHora(5)).toBe('buenos días');
    expect(saludoPorHora(11)).toBe('buenos días');
    expect(saludoPorHora(12)).toBe('buenas tardes');
    expect(saludoPorHora(18)).toBe('buenas tardes');
    expect(saludoPorHora(19)).toBe('buenas noches');
    expect(saludoPorHora(0)).toBe('buenas noches');
    expect(saludoPorHora(4)).toBe('buenas noches');
  });
});
