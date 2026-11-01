import type { Evidencia, Expediente, ErrorValidacion } from './tipos.js';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Verdadero si `s` es una fecha ISO `YYYY-MM-DD` que existe en el calendario. */
function fechaValida(s: unknown): boolean {
  if (typeof s !== 'string' || !PATRON_FECHA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function esEntero(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * Revisa rangos y formas del expediente. Nunca lanza: devuelve la lista de
 * errores (vacía si el expediente es válido).
 */
export function validarExpediente(exp: Expediente): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  const revisarFecha = (campo: string, valor: string | null | undefined): void => {
    if (valor === null || valor === undefined) return;
    if (!fechaValida(valor)) {
      errores.push({ campo, mensaje: `Fecha inválida "${valor}": se espera el formato YYYY-MM-DD con una fecha real` });
    }
  };

  // Evidencia con fecha de captura; si el valor mismo es una fecha, `valorEsFecha`.
  const revisarEvidencia = (campo: string, ev: Evidencia<unknown> | undefined, valorEsFecha = false): void => {
    if (!ev) return;
    revisarFecha(`${campo}.fecha`, ev.fecha);
    if (valorEsFecha) revisarFecha(`${campo}.valor`, ev.valor as string | null);
  };

  // Fechas del expediente
  revisarFecha('fechaCierreCRM', exp.fechaCierreCRM);
  revisarFecha('fechaCreacion', exp.fechaCreacion);
  if (exp.fechaCreacion === null || exp.fechaCreacion === undefined) {
    errores.push({ campo: 'fechaCreacion', mensaje: 'La fecha de creación es obligatoria' });
  }

  // Cliente ideal: cada criterio en [−5, +5] (el 0 sí es válido aquí)
  (exp.cuenta?.clienteIdeal ?? []).forEach((ev, i) => {
    const campo = `cuenta.clienteIdeal[${i}]`;
    const v = ev?.valor;
    if (v !== null && v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= -5 && v <= 5)) {
      errores.push({ campo: `${campo}.valor`, mensaje: `El criterio de cliente ideal debe estar entre −5 y +5 (recibido ${String(v)})` });
    }
    revisarEvidencia(campo, ev);
  });

  // Influencias: calificación ∈ {−5..−1, 1..5}; el 0 no existe
  (exp.influencias ?? []).forEach((inf, i) => {
    const c = inf.calificacion;
    if (c !== null && c !== undefined && !(esEntero(c) && c !== 0 && c >= -5 && c <= 5)) {
      errores.push({
        campo: `influencias[${i}].calificacion`,
        mensaje: `La calificación debe ser un entero de −5 a −1 o de +1 a +5; el 0 no existe (recibido ${String(c)})`,
      });
    }
    revisarFecha(`influencias[${i}].ultimoContacto`, inf.ultimoContacto);
  });

  // Fechas en evidencias
  revisarEvidencia('prioridad', exp.prioridad);
  revisarEvidencia('contribucionDiferenciadora', exp.contribucionDiferenciadora);
  revisarEvidencia('reorganizacion', exp.reorganizacion);
  if (exp.bant) {
    revisarEvidencia('bant.budget', exp.bant.budget);
    revisarEvidencia('bant.authority', exp.bant.authority);
    revisarEvidencia('bant.need', exp.bant.need);
    revisarEvidencia('bant.time', exp.bant.time);
  }
  if (exp.compellingEvent) {
    revisarEvidencia('compellingEvent.fecha', exp.compellingEvent.fecha, true);
    revisarEvidencia('compellingEvent.dueno', exp.compellingEvent.dueno);
    revisarEvidencia('compellingEvent.costoInaccion', exp.compellingEvent.costoInaccion);
  }

  // Acciones previas
  (exp.accionesPrevias ?? []).forEach((a, i) => revisarFecha(`accionesPrevias[${i}].cuando`, a.cuando));

  return errores;
}
