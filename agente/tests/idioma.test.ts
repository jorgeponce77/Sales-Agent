import { describe, expect, it } from 'vitest';
import { crearOportunidad } from '../src/ficha.js';
import { idiomaDe, idiomaDelVendedor } from '../src/idioma.js';
import { VERSION_INSTRUCCIONES } from '../src/instrucciones/base.js';
import type { Oportunidad } from '../src/tipos.js';
import { fichaBase } from './fabrica.js';

const HOY = '2026-11-02';

describe('idiomaDe', () => {
  it('reconoce español e inglés por palabras frecuentes', () => {
    expect(idiomaDe('¿Cuál es el estatus del negocio?')).toBe('es');
    expect(idiomaDe('What is the status of the deal?')).toBe('en');
  });

  it('devuelve null si no hay señal o hay empate', () => {
    expect(idiomaDe('ok')).toBeNull();
    expect(idiomaDe('')).toBeNull();
    expect(idiomaDe('the el')).toBeNull();
  });
});

describe('idiomaDelVendedor', () => {
  const conTranscripcion = (textos: Array<['vendedor' | 'agente', string]>, archivada = false): Oportunidad => {
    const op = crearOportunidad(fichaBase());
    const transcripcion = textos.map(([rol, texto]) => ({ rol, texto, fecha: HOY }));
    if (archivada) {
      op.sesiones.push({ fecha: HOY, modo: 'calificar', resumen: 'x', versionInstrucciones: VERSION_INSTRUCCIONES, transcripcion });
    } else {
      op.sesionActual = {
        modo: 'calificar', inicio: HOY, turnosVendedor: 1, versionInstrucciones: VERSION_INSTRUCCIONES, historial: [], transcripcion,
      };
    }
    return op;
  };

  it('usa el mensaje actual si se reconoce', () => {
    expect(idiomaDelVendedor(crearOportunidad(fichaBase()), 'We have the budget for this')).toBe('en');
  });

  it('si el mensaje actual no se reconoce, usa el último mensaje reconocible del vendedor (no del agente)', () => {
    const op = conTranscripcion([['vendedor', 'The client is happy with the proposal'], ['agente', '¿Quién firma el contrato?']]);
    expect(idiomaDelVendedor(op, 'ok')).toBe('en');
    expect(idiomaDelVendedor(op)).toBe('en');
  });

  it('busca también en sesiones archivadas, de la más reciente a la más vieja', () => {
    expect(idiomaDelVendedor(conTranscripcion([['vendedor', 'What is the next step for the deal?']], true))).toBe('en');
  });

  it('por defecto, español', () => {
    expect(idiomaDelVendedor(crearOportunidad(fichaBase()))).toBe('es');
    expect(idiomaDelVendedor(crearOportunidad(fichaBase()), '42')).toBe('es');
  });
});
