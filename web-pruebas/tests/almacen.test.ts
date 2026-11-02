import { describe, expect, it } from 'vitest';
import { CLAVE_ALMACEN, crearAlmacen } from '../lib/almacenNavegador';
import { oportunidadBase } from './fabrica';

type Storage3 = NonNullable<Parameters<typeof crearAlmacen>[0]>;

/** Storage falso en memoria; `fallos` hace que la operación indicada lance. */
function storageFalso(
  inicial: Record<string, string> = {},
  fallos: Partial<Record<'getItem' | 'setItem' | 'removeItem', boolean>> = {},
): Storage3 & { datos: Record<string, string> } {
  const datos = { ...inicial };
  return {
    datos,
    getItem(k) {
      if (fallos.getItem) throw new Error('acceso denegado');
      return Object.prototype.hasOwnProperty.call(datos, k) ? (datos[k] as string) : null;
    },
    setItem(k, v) {
      if (fallos.setItem) throw new Error('cuota excedida');
      datos[k] = v;
    },
    removeItem(k) {
      if (fallos.removeItem) throw new Error('acceso denegado');
      delete datos[k];
    },
  };
}

const opA = () => oportunidadBase({ idCRM: 'OPP-A', cliente: 'Cliente A' });
const opB = () => oportunidadBase({ idCRM: 'OPP-B', cliente: 'Cliente B' });

describe('almacén del navegador', () => {
  it('guardar_y_listar', () => {
    const s = storageFalso();
    const a = crearAlmacen(s);
    expect(a.listar()).toEqual([]);
    a.guardar(opA());
    a.guardar(opB());
    expect(a.listar().map((o) => o.id)).toEqual(['OPP-A', 'OPP-B']);
    expect(a.obtener('OPP-B')?.ficha.cliente).toBe('Cliente B');
    expect(a.obtener('NO-EXISTE')).toBeNull();
    expect(a.estado).toBe('ok');
    expect(JSON.parse(s.datos[CLAVE_ALMACEN] as string)).toHaveLength(2);
    expect(CLAVE_ALMACEN).toBe('sa_oportunidades_v1');
  });

  it('guardar con el mismo id reemplaza la oportunidad', () => {
    const a = crearAlmacen(storageFalso());
    a.guardar(opA());
    const cambiada = opA();
    cambiada.ficha.cliente = 'Otro nombre';
    a.guardar(cambiada);
    expect(a.listar()).toHaveLength(1);
    expect(a.obtener('OPP-A')?.ficha.cliente).toBe('Otro nombre');
  });

  it('lo guardado sobrevive a un almacén nuevo sobre el mismo storage', () => {
    const s = storageFalso();
    crearAlmacen(s).guardar(opA());
    expect(crearAlmacen(s).obtener('OPP-A')).not.toBeNull();
  });

  it('borrar quita solo esa oportunidad', () => {
    const a = crearAlmacen(storageFalso());
    a.guardar(opA());
    a.guardar(opB());
    a.borrar('OPP-A');
    expect(a.listar().map((o) => o.id)).toEqual(['OPP-B']);
    a.borrar('NO-EXISTE');
    expect(a.listar()).toHaveLength(1);
  });

  it('storage_null_usa_memoria', () => {
    const a = crearAlmacen(null);
    expect(a.estado).toBe('sin_almacen');
    a.guardar(opA());
    expect(a.listar().map((o) => o.id)).toEqual(['OPP-A']);
    a.borrar('OPP-A');
    expect(a.listar()).toEqual([]);
  });

  it('storage_que_lanza: getItem lanza, estado sin_almacen y sigue en memoria', () => {
    const a = crearAlmacen(storageFalso({}, { getItem: true }));
    expect(() => a.listar()).not.toThrow();
    expect(a.estado).toBe('sin_almacen');
    a.guardar(opA());
    expect(a.obtener('OPP-A')).not.toBeNull();
    expect(a.listar()).toHaveLength(1);
  });

  it('setItem que lanza (cuota): conserva lo guardado en memoria y marca sin_almacen', () => {
    const a = crearAlmacen(storageFalso({}, { setItem: true }));
    expect(() => a.guardar(opA())).not.toThrow();
    expect(a.estado).toBe('sin_almacen');
    expect(a.listar().map((o) => o.id)).toEqual(['OPP-A']);
    a.guardar(opB());
    expect(a.listar()).toHaveLength(2);
  });

  it.each([
    ['un objeto que no es lista', '{"x":1}'],
    ['una lista con formato 0', '[{"formato":0}]'],
    ['una lista con un elemento que no es objeto', '[null]'],
    ['texto que no es JSON', '{no es json'],
  ])('formato_incompatible: %s', (_nombre, contenido) => {
    const s = storageFalso({ [CLAVE_ALMACEN]: contenido });
    let a!: ReturnType<typeof crearAlmacen>;
    expect(() => { a = crearAlmacen(s); }).not.toThrow();
    expect(a.estado).toBe('formato_incompatible');
    expect(a.listar()).toEqual([]);
    expect(a.obtener('OPP-A')).toBeNull();
  });

  it('formato_incompatible: guardar no pisa lo que había; reiniciar lo limpia', () => {
    const s = storageFalso({ [CLAVE_ALMACEN]: '[{"formato":0}]' });
    const a = crearAlmacen(s);
    a.guardar(opA());
    expect(a.estado).toBe('formato_incompatible');
    expect(a.listar().map((o) => o.id)).toEqual(['OPP-A']);
    expect(s.datos[CLAVE_ALMACEN]).toBe('[{"formato":0}]');
    a.reiniciar();
    expect(a.estado).toBe('ok');
    expect(a.listar()).toEqual([]);
    expect(s.datos[CLAVE_ALMACEN]).toBeUndefined();
    a.guardar(opA());
    expect(JSON.parse(s.datos[CLAVE_ALMACEN] as string)).toHaveLength(1);
  });

  it('reiniciar no lanza aunque removeItem lance', () => {
    const s = storageFalso({ [CLAVE_ALMACEN]: '{"x":1}' }, { removeItem: true });
    const a = crearAlmacen(s);
    expect(() => a.reiniciar()).not.toThrow();
    expect(a.listar()).toEqual([]);
  });
});
