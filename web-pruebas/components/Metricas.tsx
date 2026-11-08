import type { Oportunidad } from 'agente-sales-agent';
import { SEMAFORO, VEREDICTO } from './PanelDiagnostico';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-11-30" → "30 nov" (con año corto si no es el año en curso). */
export function fechaCorta(iso: string, anioActual: number = new Date().getFullYear()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const mes = m === null ? undefined : MESES[Number(m[2]) - 1];
  if (m === null || mes === undefined) return iso;
  const dia = `${Number(m[3])} ${mes}`;
  return Number(m[1]) === anioActual ? dia : `${dia} ${(m[1] ?? '').slice(2)}`;
}

type Tono = 'rojo' | 'ambar' | 'verde' | 'neutro';

const TONO_VEREDICTO = { creible: 'verde', en_riesgo: 'ambar', no_cierra_fecha: 'rojo', no_cierra_periodo: 'rojo' } as const;

function Metrica({ etiqueta, valor, nota, tono = 'neutro' }: { etiqueta: string; valor: string; nota: string; tono?: Tono }) {
  return (
    <span className={`metrica metrica-${tono}`}>
      <span className="metrica-etiqueta">{etiqueta}</span>
      <span className="metrica-valor">{valor}</span>
      <span className="metrica-nota">{nota}</span>
    </span>
  );
}

/** Fila de tres métricas siempre visibles (semáforo, etapa, cierre); al tocarla se abre el panel completo. */
export default function Metricas({ oportunidad, onAbrir }: { oportunidad: Oportunidad | null; onAbrir: () => void }) {
  const d = oportunidad?.ultimoDiagnostico ?? null;
  const ficha = oportunidad?.ficha ?? null;
  const veredicto = d?.fecha?.veredicto;
  return (
    <button type="button" className="metricas" onClick={onAbrir} aria-label="Ver el diagnóstico completo">
      <Metrica
        etiqueta="Semáforo"
        valor={d === null ? '—' : String(d.indice.total)}
        nota={d === null ? 'Sin dato' : SEMAFORO[d.indice.semaforo]}
        tono={d === null ? 'neutro' : d.indice.semaforo}
      />
      <Metrica
        etiqueta="Etapa"
        valor={d === null || ficha === null ? '—' : `${ficha.etapaCRM} → ${d.etapaRecomendada}`}
        nota="CRM → recomendada"
      />
      <Metrica
        etiqueta="Cierre"
        valor={ficha === null ? '—' : fechaCorta(ficha.fechaCierreCRM)}
        nota={veredicto === undefined ? 'Sin veredicto' : VEREDICTO[veredicto]}
        tono={veredicto === undefined ? 'neutro' : TONO_VEREDICTO[veredicto]}
      />
    </button>
  );
}
