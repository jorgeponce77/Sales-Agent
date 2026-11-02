import { calcularDiagnostico } from 'motor-sales-agent';
import type { Severidad } from 'motor-sales-agent';
import { deQuien } from './deQuien.js';
import { segura } from './escritura.js';

export interface HuecoConDeQuien {
  reglaId: string;
  severidad: Severidad;
  motivo: string;
  deQuien: string | null;
}

/** Ficha, expediente y acciones abiertas (con su índice en `accionesPrevias`). */
export const leerExpediente = segura('leer_expediente', (estado) => {
  const { ficha, expediente } = structuredClone({
    ficha: estado.oportunidad.ficha,
    expediente: estado.oportunidad.expediente,
  });
  const accionesAbiertas = expediente.accionesPrevias
    .map((a, indice) => ({ indice, que: a.que, quien: a.quien, cuando: a.cuando, atiende: a.atiende, estado: a.estado }))
    .filter((a) => a.estado === 'abierta')
    .map(({ indice, que, quien, cuando, atiende }) => ({ indice, que, quien, cuando, atiende }));
  return { ok: true, datos: { ficha, expediente, accionesAbiertas } };
});

/** Huecos priorizados del motor, cada uno con a quién preguntarle. */
export const obtenerHuecos = segura('obtener_huecos_priorizados', (estado) => {
  const exp = estado.oportunidad.expediente;
  const huecos: HuecoConDeQuien[] = calcularDiagnostico(exp, estado.hoy).huecos.map((h) => ({
    reglaId: h.reglaId,
    severidad: h.severidad,
    motivo: h.motivo,
    deQuien: deQuien(h.reglaId, exp),
  }));
  return { ok: true, datos: huecos };
});

/** Diagnóstico completo del motor sobre el expediente vigente. */
export const calcularDiagnosticoHerramienta = segura('calcular_diagnostico', (estado) => ({
  ok: true,
  datos: calcularDiagnostico(estado.oportunidad.expediente, estado.hoy),
}));
