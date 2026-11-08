import type { Evidencia, Nivel } from 'motor-sales-agent';
import type { Oportunidad } from 'agente-sales-agent';
import { avisoTipoCambio } from '../lib/avisos';
import { etiquetaEtapa } from '../lib/catalogos';

export const SEMAFORO = {
  verde: 'Verde',
  ambar: 'Ámbar',
  rojo: 'Rojo',
} as const;

const COMPARACION = { al_dia: 'al día', inflada: 'inflada', rezagada: 'rezagada' } as const;

export const VEREDICTO = {
  creible: 'Creíble',
  en_riesgo: 'En riesgo',
  no_cierra_fecha: 'No cierra en la fecha',
  no_cierra_periodo: 'No cierra en el periodo',
} as const;

const SEVERIDAD = { critica: 'Crítica', alta: 'Alta', media: 'Media' } as const;

const NIVEL: Record<Nivel, string> = { confirmado: 'Confirmado', supuesto: 'Supuesto', ausente: 'Ausente' };

const BANT: ReadonlyArray<{ clave: 'budget' | 'authority' | 'need' | 'time'; nombre: string }> = [
  { clave: 'budget', nombre: 'Presupuesto' },
  { clave: 'authority', nombre: 'Autoridad' },
  { clave: 'need', nombre: 'Necesidad' },
  { clave: 'time', nombre: 'Tiempo' },
];

const MAX_BANDERAS = 5;

function Punto({ nivel }: { nivel: Nivel }) {
  return <span className={`punto punto-${nivel}`} aria-hidden="true" />;
}

function Elemento({ nombre, ev }: { nombre: string; ev: Evidencia<string> }) {
  return (
    <li className="elemento">
      <Punto nivel={ev.nivel} />
      <span>
        <strong>{nombre}:</strong> {ev.valor ?? 'sin dato'} <span className="suave">({NIVEL[ev.nivel]})</span>
      </span>
    </li>
  );
}

/** Resultado del motor sobre la oportunidad: semáforo, etapa, probabilidad, fecha, BANT, compelling event y banderas. */
export default function PanelDiagnostico({ oportunidad }: { oportunidad: Oportunidad | null }) {
  const d = oportunidad?.ultimoDiagnostico ?? null;
  const aviso = avisoTipoCambio(oportunidad);
  const avisoMoneda = aviso === null ? null : <p className="panel-aviso" role="note">{aviso}</p>;
  if (oportunidad === null || d === null) {
    return <>{avisoMoneda}<p className="vacio">Aún sin diagnóstico</p></>;
  }
  const { expediente, ficha } = oportunidad;
  const ce = expediente.compellingEvent;
  const banderas = d.banderas.slice(0, MAX_BANDERAS);
  const semaforo = d.indice.semaforo;

  return (
    <div className="diagnostico">
      {avisoMoneda}
      <div className={`semaforo semaforo-${semaforo}`} role="status">
        <span className="semaforo-luz" aria-hidden="true" />
        <span className="semaforo-texto">
          <strong>{SEMAFORO[semaforo]}</strong>
          <span>Índice {d.indice.total} de 100{d.indice.topado ? ' (topado por una bandera crítica)' : ''}</span>
        </span>
      </div>

      <dl className="datos">
        <div>
          <dt>Etapa</dt>
          <dd>
            CRM: {etiquetaEtapa(ficha.etapaCRM)}
            <br />
            Recomendada: {etiquetaEtapa(d.etapaRecomendada)} <span className="suave">({COMPARACION[d.comparacionEtapa]})</span>
          </dd>
        </div>
        <div>
          <dt>Probabilidad</dt>
          <dd>
            Declarada: {d.probabilidadDeclarada}%
            <br />
            Ajustada: {d.probabilidadAjustada}%
          </dd>
        </div>
        <div>
          <dt>Fecha de cierre</dt>
          <dd>
            CRM: {ficha.fechaCierreCRM}
            <br />
            {d.fecha === null ? (
              'Creíble: sin cálculo'
            ) : (
              <>
                Creíble: {d.fecha.fechaCreible ?? 'sin fecha'} <span className="suave">({VEREDICTO[d.fecha.veredicto]})</span>
              </>
            )}
            {d.fechaOptimista && <><br /><span className="suave">La fecha del CRM es optimista para la etapa.</span></>}
          </dd>
        </div>
      </dl>

      <h3>BANT</h3>
      <ul className="bant">
        {BANT.map(({ clave, nombre }) => {
          const nivel = expediente.bant[clave].nivel;
          return (
            <li key={clave}>
              <Punto nivel={nivel} />
              <span>{nombre}: <strong>{NIVEL[nivel]}</strong></span>
            </li>
          );
        })}
      </ul>

      <h3>Compelling event</h3>
      <p className="ce-descripcion">{ce.descripcion ?? 'Sin definir'}</p>
      <ul className="elementos">
        <Elemento nombre="Fecha" ev={ce.fecha} />
        <Elemento nombre="Dueño" ev={ce.dueno} />
        <Elemento nombre="Costo de la inacción" ev={ce.costoInaccion} />
      </ul>

      <h3>Banderas</h3>
      {banderas.length === 0 ? (
        <p className="vacio">Sin banderas</p>
      ) : (
        <ul className="banderas">
          {banderas.map((b) => (
            <li key={b.id}>
              <span className={`sev sev-${b.severidad}`}>{SEVERIDAD[b.severidad]}</span>
              <span>{b.texto}</span>
            </li>
          ))}
        </ul>
      )}
      {d.banderas.length > MAX_BANDERAS && (
        <p className="suave">y {d.banderas.length - MAX_BANDERAS} más</p>
      )}
    </div>
  );
}
