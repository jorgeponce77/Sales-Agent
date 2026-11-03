import type { Oportunidad } from './tipos.js';

export type Idioma = 'es' | 'en';

// Heurística: listas cortas de palabras frecuentes que no se escriben igual en el otro idioma.
// La comparten los textos fijos del agente y la verificación de idioma de las evaluaciones.
const PALABRAS_ES = new Set(
  'el la los las de que y en un una es por con para se su lo como más pero del al está son hay qué cuál esto muy ya también tiene tienes cuándo quién cómo'.split(' '),
);
const PALABRAS_EN = new Set(
  'the and of to is in that for with are was your you have this it be what not on will can do who when how has there their'.split(' '),
);

/** Idioma de un texto (es o en), o null si no hay señal suficiente o hay empate. */
export function idiomaDe(texto: string): Idioma | null {
  let es = 0;
  let en = 0;
  for (const p of texto.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (PALABRAS_ES.has(p)) es += 1;
    if (PALABRAS_EN.has(p)) en += 1;
  }
  if (es === en) return null;
  return es > en ? 'es' : 'en';
}

/**
 * Idioma del vendedor para los textos fijos del agente: el del mensaje actual si se reconoce; si no, el del
 * mensaje reconocible más reciente del vendedor (sesión en curso y luego sesiones archivadas). Por defecto, español.
 */
export function idiomaDelVendedor(op: Oportunidad, mensajeActual?: string): Idioma {
  const textos: string[] = [];
  if (mensajeActual !== undefined) textos.push(mensajeActual);
  const delVendedor = (t: readonly { rol: string; texto: string }[] | undefined): string[] =>
    (t ?? []).filter((m) => m.rol === 'vendedor').map((m) => m.texto).reverse();
  textos.push(...delVendedor(op.sesionActual?.transcripcion));
  for (const s of [...op.sesiones].reverse()) textos.push(...delVendedor(s.transcripcion));
  for (const t of textos) {
    const idioma = idiomaDe(t);
    if (idioma !== null) return idioma;
  }
  return 'es';
}
