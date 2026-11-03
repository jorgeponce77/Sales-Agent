import type { Expediente, Influencia } from 'motor-sales-agent';

/** Nombres de las influencias que cumplen el filtro, separados por coma. */
function nombres(exp: Expediente, filtro: (i: Influencia) => boolean): string {
  return exp.influencias.filter(filtro).map((i) => i.nombre).join(', ');
}

/** Triunfo-Resultado redactado (no vacío ni solo espacios), igual que en el motor. */
const tieneTR = (i: Influencia): boolean => i.trDeclaracion !== null && i.trDeclaracion.trim() !== '';

/** "del Económico" y, si se conocen, el nombre de las influencias con rol E. */
function delEconomico(exp: Expediente): string | null {
  const n = nombres(exp, (i) => i.roles.includes('E'));
  return n === '' ? null : `del Económico (${n})`;
}

/**
 * "¿De quién?" de un hueco (anexo §6): a quién pedirle el dato que falta.
 * Las reglas que no están en la tabla devuelven null.
 */
export function deQuien(reglaId: string, exp: Expediente): string | null {
  switch (reglaId) {
    case 'budget_ausente':
    case 'bant_supuesto':
    case 'bant_ausente':
      return delEconomico(exp) ?? 'de tu Coach';
    case 'sin_economico':
      return 'de tu Coach o de quien ya conoces en la cuenta';
    case 'economico_sin_cubrir':
      return delEconomico(exp) ?? 'del Económico';
    case 'tr_no_redactado': {
      const n = nombres(exp, (i) => (i.grado === 'A' || i.grado === 'M') && !tieneTR(i));
      return n === '' ? null : `de ${n}`;
    }
    case 'ce_incompleto':
      return 'del dueño del compelling event o del Económico';
    case 'alternativas_no_identificadas':
      return 'pregunta directa al cliente: ¿estamos compitiendo con otro proveedor?';
    default:
      return null;
  }
}
