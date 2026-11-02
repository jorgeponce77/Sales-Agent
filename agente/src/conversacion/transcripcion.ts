import type { Diagnostico } from 'motor-sales-agent';
import type { Mensaje, Oportunidad } from '../tipos.js';

const ROL: Record<Mensaje['rol'], string> = { vendedor: 'Vendedor', agente: 'Agente' };

function bloqueDiagnostico(d: Diagnostico | null): string[] {
  if (d === null) return ['Último diagnóstico', 'Sin diagnóstico todavía.'];
  const banderas = d.banderas.map((b) => `${b.id} (${b.severidad})`);
  const fortalezas = d.fortalezas.map((f) => f.id);
  return [
    'Último diagnóstico',
    `Semáforo: ${d.indice.semaforo} · Índice: ${d.indice.total}/100${d.indice.topado ? ' (topado por crítica)' : ''}`,
    `Etapa CRM ${d.etapaCRM} vs. recomendada ${d.etapaRecomendada} (${d.comparacionEtapa}) · Probabilidad ${d.probabilidadDeclarada}% declarada vs. ${d.probabilidadAjustada}% ajustada`,
    `Banderas: ${banderas.length > 0 ? banderas.join(', ') : 'ninguna'}`,
    `Fortalezas: ${fortalezas.length > 0 ? fortalezas.join(', ') : 'ninguna'}`,
  ];
}

/** Ficha + sesiones anteriores + transcripción de la sesión en curso + último diagnóstico, en texto plano. */
export function formatearTranscripcion(op: Oportunidad): string {
  const f = op.ficha;
  const lineas = [
    `Oportunidad ${f.idCRM} · ${f.cliente} · ${f.oportunidad}`,
    `País ${f.pais} · Líneas ${f.lineas.join(', ')} · Etapa CRM ${f.etapaCRM}${op.cerrada ? ' (cerrada)' : ''} · TCV ${f.tcv} ${f.moneda} · Cierre CRM ${f.fechaCierreCRM} · Vendedor ${f.vendedor}`,
    '',
  ];
  if (op.sesiones.length > 0) {
    lineas.push('Sesiones anteriores', ...op.sesiones.map((s) => `- ${s.fecha} (${s.modo}): ${s.resumen}`), '');
  }
  const s = op.sesionActual;
  if (s === null) {
    lineas.push('Sin sesión en curso.');
  } else {
    lineas.push(`Conversación (sesión del ${s.inicio}, modo ${s.modo})`);
    for (const m of s.transcripcion) lineas.push(`${ROL[m.rol]}: ${m.texto}`);
  }
  lineas.push('', ...bloqueDiagnostico(op.ultimoDiagnostico));
  return lineas.join('\n');
}
