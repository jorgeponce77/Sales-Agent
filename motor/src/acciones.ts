import { sumarDiasNaturales } from './fechas.js';
import type { AccionPropuesta, Bandera, Config, Fortaleza, ResultadoAcciones } from './tipos.js';

/** Severidad de lo que atiende la acción; las fortalezas van al final. */
const RANGO_BANDERA = { critica: 0, alta: 1, media: 2 } as const;
const RANGO_FORTALEZA = 3;

/**
 * Valida las acciones propuestas: deben atender una bandera o fortaleza activa, tener responsable
 * y caer dentro del horizonte. Las válidas se ordenan por la severidad de lo que atienden
 * y se cortan en `config.maxAcciones`; las sobrantes se rechazan con `excede_maximo`.
 */
export function validarAcciones(
  propuestas: AccionPropuesta[],
  banderas: Bandera[],
  fortalezas: Fortaleza[],
  hoy: string,
  config: Config,
): ResultadoAcciones {
  const rangoPorId = new Map<string, number>();
  for (const f of fortalezas) rangoPorId.set(f.id, RANGO_FORTALEZA);
  for (const b of banderas) rangoPorId.set(b.id, RANGO_BANDERA[b.severidad]);
  const fin = sumarDiasNaturales(hoy, config.horizonteAccionesDias);

  const validas: { accion: AccionPropuesta; rango: number; i: number }[] = [];
  const rechazadas: ResultadoAcciones['rechazadas'] = [];

  propuestas.forEach((accion, i) => {
    const rango = rangoPorId.get(accion.atiende);
    if (rango === undefined) {
      rechazadas.push({ accion, motivo: 'no_atiende_bandera_ni_fortaleza' });
    } else if (accion.quien.trim() === '') {
      rechazadas.push({ accion, motivo: 'sin_responsable' });
    } else if (accion.cuando < hoy || accion.cuando > fin) {
      rechazadas.push({ accion, motivo: 'fuera_de_horizonte' });
    } else {
      validas.push({ accion, rango, i });
    }
  });

  validas.sort((a, b) => a.rango - b.rango || a.i - b.i);
  const aceptadas = validas.slice(0, config.maxAcciones).map((v) => v.accion);
  for (const { accion } of validas.slice(config.maxAcciones)) rechazadas.push({ accion, motivo: 'excede_maximo' });
  return { aceptadas, rechazadas };
}
