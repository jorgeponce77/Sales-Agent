import { describe, expect, it } from 'vitest';
import type { Oportunidad } from 'agente-sales-agent';
import { CLAVE_USO, claveDelTurno, claveSesion, crearAlmacenUso } from '../lib/usoSesion';
import { oportunidadBase } from './fabrica';

type StorageMin = NonNullable<Parameters<typeof crearAlmacenUso>[0]>;
function storageFalso(fallaSet?: Error): StorageMin & { datos: Record<string, string> } {
  const datos: Record<string, string> = {};
  return {
    datos,
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => {
      if (fallaSet) throw fallaSet;
      datos[k] = v;
    },
    removeItem: (k) => {
      delete datos[k];
    },
  };
}

const conSesion = (id: string, inicio: string, archivadas = 0): Oportunidad => {
  const op = oportunidadBase({ idCRM: id });
  op.sesiones = Array.from({ length: archivadas }, () => ({ fecha: inicio, modo: 'calificar' as const, resumen: 'x', versionInstrucciones: 'v', transcripcion: [] }));
  op.sesionActual = { modo: 'calificar', inicio, turnosVendedor: 0, versionInstrucciones: 'v', historial: [], transcripcion: [] };
  return op;
};

const uso = (n: number) => ({ entrada: n, salida: n, cacheLectura: n, cacheEscritura: n });

describe('uso de tokens por sesión (Menor 8)', () => {
  it('la clave distingue oportunidad, inicio y número de sesión', () => {
    expect(claveSesion(conSesion('A', '2026-11-02'))).toBe('A|2026-11-02|0');
    expect(claveSesion(conSesion('A', '2026-11-02', 1))).toBe('A|2026-11-02|1');
    expect(claveSesion(oportunidadBase())).toBeNull();
    expect(claveSesion(null)).toBeNull();
  });

  it('un turno que cierra la sesión se carga a la que estaba abierta', () => {
    const antes = conSesion('A', '2026-11-02');
    const despues = { ...structuredClone(antes), sesionActual: null };
    expect(claveDelTurno(antes, despues)).toBe('A|2026-11-02|0');
    const nueva = conSesion('A', '2026-11-03', 1);
    expect(claveDelTurno(antes, nueva)).toBe('A|2026-11-03|1');
    expect(claveDelTurno(undefined, nueva)).toBe('A|2026-11-03|1');
  });

  it('suma por sesión, sobrevive a recargar y no mezcla oportunidades', () => {
    const s = storageFalso();
    const a = crearAlmacenUso(s);
    const opA = conSesion('A', '2026-11-02');
    const opB = conSesion('B', '2026-11-02');
    a.sumar(claveSesion(opA) as string, 'A', uso(10));
    a.sumar(claveSesion(opA) as string, 'A', uso(5));
    a.sumar(claveSesion(opB) as string, 'B', uso(1));
    const recargado = crearAlmacenUso(s);
    expect(recargado.deOportunidad(opA)).toEqual(uso(15));
    expect(recargado.deOportunidad(opB)).toEqual(uso(1));
    expect(JSON.parse(s.datos[CLAVE_USO] as string)).toBeTruthy();
  });

  it('sin sesión abierta muestra la última sesión con uso; una sesión nueva empieza en cero', () => {
    const a = crearAlmacenUso(storageFalso());
    const abierta = conSesion('A', '2026-11-02');
    a.sumar(claveSesion(abierta) as string, 'A', uso(7));
    expect(a.deOportunidad({ ...structuredClone(abierta), sesionActual: null })).toEqual(uso(7));
    expect(a.deOportunidad(conSesion('A', '2026-11-03', 1))).toEqual(uso(0));
    expect(a.deOportunidad(null)).toEqual(uso(0));
  });

  it('borrar una oportunidad quita sus contadores', () => {
    const a = crearAlmacenUso(storageFalso());
    const op = conSesion('A', '2026-11-02');
    a.sumar(claveSesion(op) as string, 'A', uso(3));
    a.borrarOportunidad('A');
    expect(a.deOportunidad(op)).toEqual(uso(0));
  });

  it('datos guardados ilegibles o un storage que falla no rompen nada; la cuota llena se avisa', () => {
    const s = storageFalso();
    s.datos[CLAVE_USO] = '{no es json';
    expect(crearAlmacenUso(s).deOportunidad(conSesion('A', '2026-11-02'))).toEqual(uso(0));
    const cuota = Object.assign(new Error('lleno'), { name: 'QuotaExceededError' });
    const lleno = crearAlmacenUso(storageFalso(cuota));
    const op = conSesion('A', '2026-11-02');
    expect(() => lleno.sumar(claveSesion(op) as string, 'A', uso(2))).not.toThrow();
    expect(lleno.lleno).toBe(true);
    expect(lleno.deOportunidad(op)).toEqual(uso(2));
    expect(crearAlmacenUso(null).deOportunidad(op)).toEqual(uso(0));
  });
});
