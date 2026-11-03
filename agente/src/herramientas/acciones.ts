import { CONFIG_DEFAULT, calcularDiagnostico, validarAcciones } from 'motor-sales-agent';
import type { AccionPropuesta } from 'motor-sales-agent';
import { aplicarEscritura, normalizar, rechazar, segura } from './escritura.js';
import type { EstadoTurno, ResultadoHerramienta } from './escritura.js';

type Obj = Record<string, unknown>;
const esObjeto = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function entradaInvalida(estado: EstadoTurno, nombre: string, detalle: string): ResultadoHerramienta {
  return rechazar(estado, nombre, [`entrada: ${detalle}`]);
}

/**
 * Valida las acciones con el motor (contra las banderas y fortalezas del diagnóstico vigente)
 * y guarda las aceptadas en `accionesPrevias` como abiertas.
 */
export const proponerAcciones = segura('proponer_acciones', (estado, input) => {
  if (!esObjeto(input) || !Array.isArray(input['acciones'])) {
    return entradaInvalida(estado, 'proponer_acciones', 'se esperaba un objeto con el arreglo "acciones"');
  }
  const propuestas = input['acciones'] as unknown[];

  // Lo que no es un objeto no llega al motor: se rechaza aquí.
  const malformadas: { accion: unknown; motivo: string }[] = [];
  const aValidar: AccionPropuesta[] = [];
  for (const p of propuestas) {
    if (esObjeto(p)) aValidar.push(p as unknown as AccionPropuesta);
    else malformadas.push({ accion: p, motivo: 'accion_malformada' });
  }

  const abiertas = estado.oportunidad.expediente.accionesPrevias.filter((a) => a.estado === 'abierta');
  const clave = (a: { atiende: unknown; que: unknown }): string =>
    `${typeof a.atiende === 'string' ? normalizar(a.atiende) : ''}|${typeof a.que === 'string' ? normalizar(a.que) : ''}`;
  const yaAbiertas = new Set(abiertas.map(clave));

  // Una propuesta idéntica (mismo "atiende" y "que" normalizados) a una acción abierta no se repite.
  const duplicadasDeAbiertas: { accion: AccionPropuesta; motivo: string }[] = [];
  const nuevas: AccionPropuesta[] = [];
  for (const p of aValidar) {
    if (yaAbiertas.has(clave(p))) duplicadasDeAbiertas.push({ accion: p, motivo: 'ya_abierta' });
    else nuevas.push(p);
  }

  // El motor valida y ordena por severidad; el tope y los duplicados se aplican después,
  // para que una propuesta inválida no desplace a una válida.
  const diag = calcularDiagnostico(estado.oportunidad.expediente, estado.hoy);
  const config = { ...CONFIG_DEFAULT, maxAcciones: Math.max(nuevas.length, 1) };
  const validadas = validarAcciones(nuevas, diag.banderas, diag.fortalezas, estado.hoy, config);

  const vistas = new Set<string>();
  const aceptadasUnicas: AccionPropuesta[] = [];
  const repetidas: { accion: AccionPropuesta; motivo: string }[] = [];
  for (const a of validadas.aceptadas) {
    const k = clave(a);
    if (vistas.has(k)) repetidas.push({ accion: a, motivo: 'ya_abierta' });
    else {
      vistas.add(k);
      aceptadasUnicas.push(a);
    }
  }

  // Las abiertas cuentan para el tope: abiertas + nuevas no pueden pasar de maxAcciones.
  const cupo = Math.max(0, CONFIG_DEFAULT.maxAcciones - abiertas.length);
  const r = {
    aceptadas: aceptadasUnicas.slice(0, cupo),
    rechazadas: [
      ...validadas.rechazadas,
      ...repetidas,
      ...aceptadasUnicas.slice(cupo).map((accion) => ({ accion, motivo: 'excede_maximo' })),
    ],
  };
  const rechazadas = [...r.rechazadas, ...duplicadasDeAbiertas, ...malformadas];

  if (r.aceptadas.length > 0) {
    const descripcion =
      'Acciones propuestas: ' + r.aceptadas.map((a) => `${a.que} (${a.quien}, ${a.cuando})`).join('; ');
    const guardado = aplicarEscritura(
      estado,
      descripcion,
      (exp) => {
        for (const a of r.aceptadas) {
          exp.accionesPrevias.push({ que: a.que, quien: a.quien, cuando: a.cuando, atiende: a.atiende, estado: 'abierta' });
        }
      },
      'accion',
    );
    if (!guardado.ok) return guardado;
  }
  return { ok: true, datos: { aceptadas: r.aceptadas, rechazadas } };
});

/** Marca una acción previa (por su índice en `accionesPrevias`) como cumplida o no cumplida. */
export const marcarAccion = segura('marcar_accion', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'marcar_accion', 'se esperaba un objeto con "indice" y "estado"');
  const { indice, estado: nuevo } = input;
  const acciones = estado.oportunidad.expediente.accionesPrevias;
  if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0 || indice >= acciones.length) {
    return rechazar(estado, 'marcar acción', [
      acciones.length === 0
        ? 'indice: no hay acciones previas que marcar'
        : `indice: debe ser un entero entre 0 y ${acciones.length - 1} (acciones previas: ${acciones.length})`,
    ]);
  }
  if (nuevo !== 'cumplida' && nuevo !== 'no_cumplida') {
    return rechazar(estado, 'marcar acción', ['estado: debe ser "cumplida" o "no_cumplida"']);
  }
  const que = acciones[indice]?.que ?? '';
  const etiqueta = nuevo === 'cumplida' ? 'cumplida' : 'no cumplida';
  return aplicarEscritura(
    estado,
    `Acción ${indice} "${que}" marcada como ${etiqueta}`,
    (exp) => {
      const accion = exp.accionesPrevias[indice];
      if (!accion) throw new Error(`indice: no existe la acción ${indice}`);
      accion.estado = nuevo;
    },
    'accion',
  );
});

const MAX_RESUMEN = 600;

/** Guarda el resumen de la sesión y la da por cerrada (sin tocar el expediente). */
export const cerrarSesion = segura('cerrar_sesion', (estado, input) => {
  if (!esObjeto(input)) return entradaInvalida(estado, 'cerrar_sesion', 'se esperaba un objeto con "resumen"');
  const { resumen } = input;
  if (typeof resumen !== 'string' || resumen.trim() === '') {
    return rechazar(estado, 'cierre de sesión', ['resumen: debe ser un texto no vacío']);
  }
  const limpio = resumen.trim();
  if (limpio.length > MAX_RESUMEN) {
    return rechazar(estado, 'cierre de sesión', [
      `resumen: máximo ${MAX_RESUMEN} caracteres (recibidos ${limpio.length}); resúmelo en 2 a 4 líneas`,
    ]);
  }
  estado.sesionCerrada = { resumen: limpio };
  estado.eventos.push({ tipo: 'sesion', descripcion: `Sesión cerrada: ${limpio}`, fecha: estado.hoy });
  return { ok: true };
});
