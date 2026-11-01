import { describe, expect, it } from 'vitest';
import { lenteActiva } from '../src/lente.js';
import { expedienteBase } from './fabrica.js';

describe('lenteActiva', () => {
  it('etapa 1 con cierre en otro trimestre → gerente', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-02-15' });
    expect(lenteActiva(exp, '2026-11-01')).toBe('gerente');
  });

  it('etapa 1 con cierre dentro del trimestre en curso → director', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2026-12-20' });
    expect(lenteActiva(exp, '2026-11-01')).toBe('director');
  });

  it('cierre exactamente el último día del trimestre → director', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2026-12-31' });
    expect(lenteActiva(exp, '2026-11-01')).toBe('director');
  });

  it('cierre ya vencido (antes de hoy) → director', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2026-10-15' });
    expect(lenteActiva(exp, '2026-11-01')).toBe('director');
  });

  it('etapa 3 sin fecha de cierre → director', () => {
    const exp = expedienteBase({ etapaCRM: 3, fechaCierreCRM: null });
    expect(lenteActiva(exp, '2026-11-01')).toBe('director');
  });

  it('etapa 2 sin fecha de cierre → gerente (solo aplica la regla de etapa)', () => {
    const exp = expedienteBase({ etapaCRM: 2, fechaCierreCRM: null });
    expect(lenteActiva(exp, '2026-11-01')).toBe('gerente');
  });

  it('etapa 3 con cierre lejano → director (la etapa basta)', () => {
    const exp = expedienteBase({ etapaCRM: 3, fechaCierreCRM: '2027-06-30' });
    expect(lenteActiva(exp, '2026-11-01')).toBe('director');
  });

  it('hoy a fin de trimestre con cierre en el siguiente → gerente', () => {
    const exp = expedienteBase({ etapaCRM: 1, fechaCierreCRM: '2027-01-10' });
    expect(lenteActiva(exp, '2026-12-28')).toBe('gerente');
  });
});
