'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Linea, TipoOportunidad } from 'motor-sales-agent';
import type { Ficha } from 'agente-sales-agent';
import { etiquetaEtapa, ETAPAS, formatearMonto, LINEAS, leerTcv, MONEDAS, PAISES, TIPOS } from '../lib/catalogos';

/** Lo que captura el formulario; el servidor pone `fechaCreacion` y `vendedor`. */
export type DatosFicha = Omit<Ficha, 'fechaCreacion' | 'vendedor'>;

interface Props {
  ocupado: boolean;
  /** IDs del CRM que ya existen en este navegador (guardados o de escenarios): no se pueden repetir. */
  idsExistentes: readonly string[];
  onEnviar: (ficha: DatosFicha) => void;
}

/** Valor del selector de tipo cuando el vendedor no lo sabe: se envía `tipo: null` y el agente lo averigua. */
const TIPO_NO_SE = 'nose';

const hoyLocal = (): string => {
  const d = new Date();
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Revisión ligera en el navegador; la validación que manda es la del servidor. */
function revisar(v: {
  idCRM: string; cliente: string; oportunidad: string; lineas: Linea[]; tipo: string; tcv: string; fechaCierre: string; etapa: number;
  idsExistentes: readonly string[];
}): string[] {
  const errores: string[] = [];
  if (v.idCRM.trim() === '') errores.push('Escribe el ID del CRM.');
  else if (v.idsExistentes.includes(v.idCRM.trim())) {
    errores.push('Ya existe una oportunidad con ese ID del CRM. Elige otro, o ábrela desde la lista de oportunidades.');
  }
  if (v.cliente.trim() === '') errores.push('Escribe el nombre del cliente.');
  if (v.oportunidad.trim() === '') errores.push('Escribe el nombre de la oportunidad.');
  if (v.lineas.length === 0) errores.push('Elige al menos una línea.');
  if (v.tipo === '') errores.push('Elige el tipo de oportunidad (o "No sé").');
  const tcv = leerTcv(v.tcv);
  if (tcv.error !== null) errores.push(tcv.error);
  if (v.fechaCierre === '') errores.push('Elige la fecha de cierre del CRM.');
  else if (v.etapa <= 4 && v.fechaCierre < hoyLocal()) errores.push('La fecha de cierre no puede ser anterior a hoy.');
  return errores;
}

export default function FichaNueva({ ocupado, idsExistentes, onEnviar }: Props) {
  const [idCRM, setIdCRM] = useState('');
  const [cliente, setCliente] = useState('');
  const [oportunidad, setOportunidad] = useState('');
  const [pais, setPais] = useState('MX');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [tipo, setTipo] = useState('');
  const [etapa, setEtapa] = useState(1);
  const [esRFP, setEsRFP] = useState<'si' | 'no' | 'nose'>('nose');
  const [tcv, setTcv] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [fechaCierre, setFechaCierre] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const lecturaTcv = leerTcv(tcv);

  function alternarLinea(l: Linea): void {
    setLineas((actuales) => (actuales.includes(l) ? actuales.filter((x) => x !== l) : [...actuales, l]));
  }

  function enviar(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fallos = revisar({ idCRM, cliente, oportunidad, lineas, tipo, tcv, fechaCierre, etapa, idsExistentes });
    setErrores(fallos);
    if (fallos.length > 0) return;
    onEnviar({
      idCRM: idCRM.trim(),
      cliente: cliente.trim(),
      oportunidad: oportunidad.trim(),
      pais,
      lineas,
      tipo: tipo === TIPO_NO_SE ? null : (tipo as TipoOportunidad),
      etapaCRM: etapa,
      tcv: lecturaTcv.monto as number,
      moneda,
      fechaCierreCRM: fechaCierre,
      probabilidadCRM: null,
      esRFP: esRFP === 'si' ? true : esRFP === 'no' ? false : null,
      ultimaActualizacionCRM: null,
    });
  }

  return (
    <form className="ficha" onSubmit={enviar} noValidate>
      <h2>Nueva oportunidad</h2>
      <p className="suave">Captura la ficha tal como está en el CRM.</p>

      <label>
        ID del CRM
        <input value={idCRM} onChange={(e) => setIdCRM(e.target.value)} autoComplete="off" maxLength={40} />
      </label>
      <label>
        Cliente
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoComplete="off" maxLength={120} />
      </label>
      <label>
        Oportunidad
        <input value={oportunidad} onChange={(e) => setOportunidad(e.target.value)} autoComplete="off" maxLength={160} />
      </label>

      <div className="ficha-fila">
        <label>
          País
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre} ({p.codigo})</option>)}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Elige un tipo</option>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            <option value={TIPO_NO_SE}>No sé</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Líneas</legend>
        <div className="ficha-lineas">
          {LINEAS.map((l) => (
            <label key={l.valor} className="casilla">
              <input type="checkbox" checked={lineas.includes(l.valor)} onChange={() => alternarLinea(l.valor)} />
              {l.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        Etapa en el CRM
        <select value={etapa} onChange={(e) => setEtapa(Number(e.target.value))}>
          {ETAPAS.map((_, i) => <option key={i} value={i}>{etiquetaEtapa(i)}</option>)}
        </select>
      </label>

      <label>
        ¿Es RFP?
        <select value={esRFP} onChange={(e) => setEsRFP(e.target.value as 'si' | 'no' | 'nose')}>
          <option value="si">Sí</option>
          <option value="no">No</option>
          <option value="nose">No sé</option>
        </select>
        <span className="ayuda">Con "No sé" se trata como "No".</span>
      </label>

      <div className="ficha-fila">
        <label>
          TCV
          <input value={tcv} onChange={(e) => setTcv(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="450000" />
          <span className="ayuda" aria-live="polite">
            {lecturaTcv.monto !== null ? `= ${formatearMonto(lecturaTcv.monto)} ${moneda}` : 'Solo dígitos (450000) o con comas de miles (450,000).'}
          </span>
        </label>
        <label>
          Moneda
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="ayuda">Por ahora solo USD.</span>
        </label>
      </div>

      <label>
        Fecha de cierre en el CRM
        <input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} />
      </label>

      {errores.length > 0 && (
        <ul className="ficha-errores" role="alert">
          {errores.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      <button type="submit" className="boton boton-principal" disabled={ocupado}>
        {ocupado ? 'Iniciando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
