import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calcularDiagnostico, validarExpediente } from '../../src/index.js';
import type { Etapa, Expediente, VeredictoFecha } from '../../src/index.js';

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

const carpeta = fileURLToPath(new URL('./casos/', import.meta.url));
const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.json')).sort();

describe('casos de referencia de George', () => {
  if (archivos.length === 0) {
    it.skip('no hay casos en tests/golden/casos', () => {});
    return;
  }

  for (const archivo of archivos) {
    const caso = JSON.parse(readFileSync(carpeta + archivo, 'utf-8')) as CasoReferencia;

    it(caso.nombre ?? archivo, () => {
      const errores = validarExpediente(caso.expediente);
      expect(
        errores,
        `${archivo}: el expediente no es válido:\n${errores.map((e) => `  - ${e.campo}: ${e.mensaje}`).join('\n')}`,
      ).toEqual([]);

      const d = calcularDiagnostico(caso.expediente, caso.hoy);
      const esperado = caso.esperado ?? {};
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
