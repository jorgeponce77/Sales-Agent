import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGO_REGLAS, calcularDiagnostico, validarExpediente } from '../../src/index.js';
import type { Etapa, Expediente, VeredictoFecha } from '../../src/index.js';
import { fechaValida } from '../../src/validar.js';

/** Formato de cada archivo de `casos/`. Solo se comparan los campos presentes en `esperado`. */
interface CasoReferencia {
  nombre: string;
  hoy: string;
  expediente: Expediente;
  esperado: {
    etapaRecomendada?: Etapa;
    veredictoFecha?: VeredictoFecha;
    semaforo?: 'verde' | 'ambar' | 'rojo';
    banderasIncluye?: string[];
    banderasExcluye?: string[];
  };
}

const CLAVES_ESPERADO = ['etapaRecomendada', 'veredictoFecha', 'semaforo', 'banderasIncluye', 'banderasExcluye'];
const VEREDICTOS = ['creible', 'en_riesgo', 'no_cierra_fecha', 'no_cierra_periodo'];
const SEMAFOROS = ['verde', 'ambar', 'rojo'];
const IDS_BANDERA = new Set(CATALOGO_REGLAS.map((r) => r.id));

const carpeta = fileURLToPath(new URL('./casos/', import.meta.url));

function listarArchivos(): string[] {
  try {
    return readdirSync(carpeta).filter((a) => a.endsWith('.json')).sort();
  } catch {
    return []; // carpeta inexistente: se trata como carpeta vacía
  }
}

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Problemas de forma del caso (vacío si está bien). Nunca lanza. */
function problemasDeForma(caso: unknown): string[] {
  if (!esObjeto(caso)) return ['el archivo debe contener un objeto JSON con nombre, hoy, expediente y esperado'];
  const p: string[] = [];
  if (typeof caso.nombre !== 'string' || caso.nombre.trim() === '') p.push('"nombre" debe ser un texto no vacío');
  if (!fechaValida(caso.hoy)) p.push(`"hoy" debe ser una fecha real AAAA-MM-DD (recibido ${JSON.stringify(caso.hoy)})`);
  if (!esObjeto(caso.expediente)) p.push('falta "expediente" (debe ser un objeto)');

  const e = caso.esperado;
  if (!esObjeto(e)) {
    p.push('falta "esperado" (debe ser un objeto con al menos un campo a revisar)');
    return p;
  }
  const claves = Object.keys(e);
  const desconocidas = claves.filter((k) => !CLAVES_ESPERADO.includes(k));
  if (desconocidas.length > 0) {
    p.push(`"esperado" tiene campos desconocidos: ${desconocidas.join(', ')} (válidos: ${CLAVES_ESPERADO.join(', ')})`);
  }
  if (claves.filter((k) => CLAVES_ESPERADO.includes(k)).length === 0) {
    p.push('"esperado" no tiene ningún campo que revisar; el caso no comprobaría nada');
  }
  if ('etapaRecomendada' in e && !(Number.isInteger(e.etapaRecomendada) && (e.etapaRecomendada as number) >= 0 && (e.etapaRecomendada as number) <= 5)) {
    p.push('"etapaRecomendada" debe ser un número entero de 0 a 5');
  }
  if ('veredictoFecha' in e && !VEREDICTOS.includes(e.veredictoFecha as string)) {
    p.push(`"veredictoFecha" debe ser uno de: ${VEREDICTOS.join(', ')}`);
  }
  if ('semaforo' in e && !SEMAFOROS.includes(e.semaforo as string)) {
    p.push(`"semaforo" debe ser uno de: ${SEMAFOROS.join(', ')}`);
  }
  for (const campo of ['banderasIncluye', 'banderasExcluye']) {
    if (!(campo in e)) continue;
    const v = e[campo];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
      p.push(`"${campo}" debe ser una lista de textos, por ejemplo ["sin_economico"]`);
      continue;
    }
    const invalidos = (v as string[]).filter((id) => !IDS_BANDERA.has(id));
    if (invalidos.length > 0) p.push(`"${campo}" tiene ids de bandera que no existen: ${invalidos.join(', ')}`);
  }
  return p;
}

describe('casos de referencia de George', () => {
  const archivos = listarArchivos();
  if (archivos.length === 0) {
    it.skip('no hay casos en tests/golden/casos', () => {});
    return;
  }

  for (const archivo of archivos) {
    let caso: CasoReferencia | undefined;
    let errorLectura: string | null = null;
    try {
      caso = JSON.parse(readFileSync(carpeta + archivo, 'utf-8')) as CasoReferencia;
    } catch (e) {
      errorLectura = e instanceof Error ? e.message : String(e);
    }

    if (errorLectura !== null) {
      it(`${archivo}: no se pudo leer`, () => {
        expect.fail(`${archivo}: el archivo no es JSON válido: ${errorLectura}`);
      });
      continue;
    }

    const titulo = typeof caso?.nombre === 'string' ? caso.nombre : '(sin nombre)';
    it(`${archivo}: ${titulo}`, () => {
      const forma = problemasDeForma(caso);
      expect(forma, `${archivo}: el caso está mal armado:\n${forma.map((m) => `  - ${m}`).join('\n')}`).toEqual([]);
      const c = caso as CasoReferencia;

      const errores = validarExpediente(c.expediente);
      expect(
        errores,
        `${archivo}: el expediente no es válido:\n${errores.map((e) => `  - ${e.campo}: ${e.mensaje}`).join('\n')}`,
      ).toEqual([]);

      let d: ReturnType<typeof calcularDiagnostico>;
      try {
        d = calcularDiagnostico(c.expediente, c.hoy);
      } catch (e) {
        throw new Error(`${archivo}: el motor no pudo calcular el diagnóstico (¿falta o está mal algún dato del expediente?): ${e instanceof Error ? e.message : String(e)}`);
      }
      const esperado = c.esperado;
      const ids = d.banderas.map((b) => b.id);

      if (esperado.etapaRecomendada !== undefined) {
        expect(d.etapaRecomendada, `${archivo}: etapaRecomendada`).toBe(esperado.etapaRecomendada);
      }
      if (esperado.veredictoFecha !== undefined) {
        expect(d.fecha?.veredicto ?? null, `${archivo}: veredictoFecha`).toBe(esperado.veredictoFecha);
      }
      if (esperado.semaforo !== undefined) {
        expect(d.indice.semaforo, `${archivo}: semaforo (índice ${d.indice.total})`).toBe(esperado.semaforo);
      }
      for (const id of esperado.banderasIncluye ?? []) {
        expect(ids, `${archivo}: la bandera "${id}" debería estar activa`).toContain(id);
      }
      for (const id of esperado.banderasExcluye ?? []) {
        expect(ids, `${archivo}: la bandera "${id}" no debería estar activa`).not.toContain(id);
      }
    });
  }
});
