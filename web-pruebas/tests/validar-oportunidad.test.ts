import { describe, expect, it } from 'vitest';
import { validarOportunidad } from '../lib/validarOportunidad';
import { oportunidadBase } from './fabrica';

type Cualquiera = Record<string, any>;
const base = (): Cualquiera => structuredClone(oportunidadBase()) as unknown as Cualquiera;
const sesionActual = (over: Cualquiera = {}): Cualquiera => ({
  modo: 'calificar',
  inicio: '2026-11-02',
  turnosVendedor: 1,
  versionInstrucciones: 'v1',
  historial: [
    { role: 'user', content: [{ type: 'text', text: 'hola' }] },
    { role: 'assistant', content: 'texto simple' },
  ],
  transcripcion: [{ rol: 'vendedor', texto: 'hola', fecha: '2026-11-02' }],
  ...over,
});

describe('validarOportunidad (R16)', () => {
  it('acepta una oportunidad nueva', () => {
    expect(validarOportunidad(base())).toEqual([]);
  });

  it('acepta una oportunidad con sesión abierta y sesiones archivadas', () => {
    const op = base();
    op.sesionActual = sesionActual({
      historial: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: [
          { type: 'thinking', thinking: 'x', signature: 's' },
          { type: 'tool_use', id: 't1', name: 'registrar', input: {} },
        ] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
      ],
    });
    op.sesiones = [{ fecha: '2026-10-30', modo: 'revision_rapida', resumen: 'ok', versionInstrucciones: 'v1', transcripcion: [] }];
    expect(validarOportunidad(op)).toEqual([]);
  });

  it('tolera sesiones archivadas sin transcripción (formato anterior)', () => {
    const op = base();
    op.sesiones = [{ fecha: '2026-10-30', modo: 'calificar', resumen: 'ok' }];
    expect(validarOportunidad(op)).toEqual([]);
  });

  it('rechaza lo que no es un objeto o tiene formato distinto de 1, mencionando "formato"', () => {
    expect(validarOportunidad(null)[0]).toMatch(/oportunidad/i);
    expect(validarOportunidad([])[0]).toMatch(/oportunidad/i);
    expect(validarOportunidad({ formato: 0 })[0]).toMatch(/formato/);
    expect(validarOportunidad({ ...base(), formato: 2 })[0]).toMatch(/formato/);
  });

  it('nombra el campo de una ficha inválida', () => {
    const op = base();
    op.ficha.pais = 'Mexico';
    expect(validarOportunidad(op).join(' ')).toMatch(/ficha.*pais/);
  });

  it('nombra el campo de un expediente corrupto', () => {
    const op = base();
    op.expediente.etapaCRM = 'tres';
    const e = validarOportunidad(op);
    expect(e.length).toBeGreaterThan(0);
    expect(e.join(' ')).toMatch(/expediente/);
  });

  it('un expediente que rompe el validador del motor también da error y no lanza', () => {
    const op = base();
    op.expediente = 'basura';
    expect(validarOportunidad(op).join(' ')).toMatch(/expediente/);
    op.expediente = { cuenta: null };
    expect(() => validarOportunidad(op)).not.toThrow();
    expect(validarOportunidad(op).join(' ')).toMatch(/expediente/);
  });

  it('rechaza id o cerrada con tipo incorrecto', () => {
    const a = base();
    a.id = 5;
    expect(validarOportunidad(a).join(' ')).toMatch(/id/);
    const b = base();
    b.cerrada = 'no';
    expect(validarOportunidad(b).join(' ')).toMatch(/cerrada/);
  });

  it('valida sesiones', () => {
    const noArreglo = base();
    noArreglo.sesiones = {};
    expect(validarOportunidad(noArreglo).join(' ')).toMatch(/sesiones/);

    const sinResumen = base();
    sinResumen.sesiones = [{ fecha: '2026-10-30', modo: 'calificar' }];
    expect(validarOportunidad(sinResumen).join(' ')).toMatch(/sesiones\[0\].*resumen/);

    const modoMalo = base();
    modoMalo.sesiones = [{ fecha: '2026-10-30', modo: 'otro', resumen: 'x' }];
    expect(validarOportunidad(modoMalo).join(' ')).toMatch(/sesiones\[0\].*modo/);

    const transcripcionMala = base();
    transcripcionMala.sesiones = [{ fecha: '2026-10-30', modo: 'calificar', resumen: 'x', transcripcion: [{ rol: 'jefe', texto: 'x', fecha: 'y' }] }];
    expect(validarOportunidad(transcripcionMala).join(' ')).toMatch(/sesiones\[0\].*transcripcion/);

    const elementoNoObjeto = base();
    elementoNoObjeto.sesiones = ['x'];
    expect(validarOportunidad(elementoNoObjeto).join(' ')).toMatch(/sesiones\[0\]/);
  });

  it('valida sesionActual', () => {
    const mal = (s: unknown, campo: RegExp): void => {
      const op = base();
      op.sesionActual = s;
      expect(validarOportunidad(op).join(' ')).toMatch(campo);
    };
    mal('x', /sesionActual/);
    mal(sesionActual({ modo: 'otro' }), /sesionActual.*modo/);
    mal(sesionActual({ inicio: 5 }), /sesionActual.*inicio/);
    mal(sesionActual({ turnosVendedor: -1 }), /sesionActual.*turnosVendedor/);
    mal(sesionActual({ turnosVendedor: 41 }), /sesionActual.*turnosVendedor/);
    mal(sesionActual({ turnosVendedor: 1.5 }), /sesionActual.*turnosVendedor/);
    mal(sesionActual({ historial: 'x' }), /sesionActual.*historial/);
    mal(sesionActual({ transcripcion: undefined }), /sesionActual.*transcripcion/);
    for (const n of [0, 40]) {
      const op = base();
      op.sesionActual = sesionActual({ turnosVendedor: n });
      expect(validarOportunidad(op)).toEqual([]);
    }
  });

  it('valida cada mensaje del historial', () => {
    const mal = (historial: unknown[]): void => {
      const op = base();
      op.sesionActual = sesionActual({ historial });
      expect(validarOportunidad(op).join(' ')).toMatch(/historial\[0\]/);
    };
    mal(['texto']);
    mal([{ role: 'system', content: 'x' }]);
    mal([{ role: 'user' }]);
    mal([{ role: 'user', content: 5 }]);
    mal([{ role: 'user', content: ['x'] }]);
    mal([{ role: 'user', content: [{ type: 'image' }] }]);
    mal([{ role: 'user', content: [{ type: 'server_tool_use' }] }]);
  });

  it('exige que eventos sea un arreglo', () => {
    const op = base();
    op.eventos = null;
    expect(validarOportunidad(op).join(' ')).toMatch(/eventos/);
  });
});
