import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULT } from '../src/config.js';

/** Recorre todo el árbol y devuelve las rutas de los objetos o arreglos que no están congelados. */
function noCongelados(valor: unknown, ruta = 'CONFIG_DEFAULT'): string[] {
  if (typeof valor !== 'object' || valor === null) return [];
  const aqui = Object.isFrozen(valor) ? [] : [ruta];
  return aqui.concat(Object.entries(valor).flatMap(([k, v]) => noCongelados(v, `${ruta}.${k}`)));
}

describe('CONFIG_DEFAULT (M6)', () => {
  it('está congelado a todo lo profundo: objetos y arreglos anidados', () => {
    expect(noCongelados(CONFIG_DEFAULT)).toEqual([]);
  });

  it('mutarlo lanza en lugar de contaminar a los demás', () => {
    expect(() => { CONFIG_DEFAULT.maxAcciones = 99; }).toThrow(TypeError);
    expect(() => { CONFIG_DEFAULT.probabilidades.NN[2] = 99; }).toThrow(TypeError);
    expect(() => { CONFIG_DEFAULT.festivos['MX']?.push('2026-12-31'); }).toThrow(TypeError);
    expect(() => { CONFIG_DEFAULT.criteriosArgano.push({ etapaDesde: 0, clave: 'x', texto: 'x' }); }).toThrow(TypeError);
    expect(CONFIG_DEFAULT.maxAcciones).toBe(5);
  });

  it('structuredClone devuelve una copia mutable para las pruebas', () => {
    const copia = structuredClone(CONFIG_DEFAULT);
    copia.maxAcciones = 3;
    copia.probabilidades.NN[2] = 1;
    expect(copia.maxAcciones).toBe(3);
    expect(CONFIG_DEFAULT.maxAcciones).toBe(5);
    expect(CONFIG_DEFAULT.probabilidades.NN[2]).toBe(20);
  });
});
