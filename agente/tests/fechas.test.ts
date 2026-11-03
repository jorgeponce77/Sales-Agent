import { describe, expect, it } from 'vitest';
import { hoyEnMexico } from '../src/index.js';

describe('hoyEnMexico', () => {
  it('usa la fecha de America/Mexico_City, no la del reloj del servidor', () => {
    // 03:30 UTC del 3 de noviembre = 21:30 del 2 de noviembre en la Ciudad de México (UTC-6).
    expect(hoyEnMexico(new Date('2026-11-03T03:30:00Z'))).toBe('2026-11-02');
    expect(hoyEnMexico(new Date('2026-11-03T06:30:00Z'))).toBe('2026-11-03');
    expect(hoyEnMexico(new Date('2027-01-05T12:00:00Z'))).toBe('2027-01-05');
  });
});
