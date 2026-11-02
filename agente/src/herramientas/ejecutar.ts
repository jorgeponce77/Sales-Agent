import { cerrarSesion, marcarAccion, proponerAcciones } from './acciones.js';
import { calcularDiagnosticoHerramienta, leerExpediente, obtenerHuecos } from './consulta.js';
import type { EstadoTurno, Herramienta, ResultadoHerramienta } from './escritura.js';
import {
  actualizarCadenaCierre,
  actualizarFicha,
  registrarAlternativa,
  registrarCriterioArgano,
  registrarDato,
  registrarInfluencia,
} from './registrar.js';

const HERRAMIENTAS: ReadonlyMap<string, Herramienta> = new Map<string, Herramienta>([
  ['leer_expediente', leerExpediente],
  ['registrar_dato', registrarDato],
  ['registrar_criterio_argano', registrarCriterioArgano],
  ['registrar_influencia', registrarInfluencia],
  ['registrar_alternativa', registrarAlternativa],
  ['actualizar_cadena_cierre', actualizarCadenaCierre],
  ['actualizar_ficha', actualizarFicha],
  ['obtener_huecos_priorizados', obtenerHuecos],
  ['calcular_diagnostico', calcularDiagnosticoHerramienta],
  ['proponer_acciones', proponerAcciones],
  ['marcar_accion', marcarAccion],
  ['cerrar_sesion', cerrarSesion],
]);

/** Único punto de entrada de las herramientas del agente. Nunca lanza. */
export function ejecutarHerramienta(nombre: string, input: unknown, estado: EstadoTurno): ResultadoHerramienta {
  try {
    const herramienta = HERRAMIENTAS.get(nombre);
    if (!herramienta) return { ok: false, errores: [`herramienta desconocida: ${String(nombre)}`] };
    return herramienta(estado, input);
  } catch (e) {
    return { ok: false, errores: [`error interno: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
