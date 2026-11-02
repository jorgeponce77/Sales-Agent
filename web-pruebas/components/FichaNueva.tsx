'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Linea, TipoOportunidad } from 'motor-sales-agent';
import type { Ficha } from 'agente-sales-agent';
import { etiquetaEtapa, ETAPAS, LINEAS, MONEDAS, PAISES, TIPOS } from '../lib/catalogos';

/** Lo que captura el formulario; el servidor pone `fechaCreacion` y `vendedor`. */
export type DatosFicha = Omit<Ficha, 'fechaCreacion' | 'vendedor'>;

interface Props {
  ocupado: boolean;
  onEnviar: (ficha: DatosFicha) => void;
}

const hoyLocal = (): string => {
  const d = new Date();
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Revisión ligera en el navegador; la validación que manda es la del servidor. */
function revisar(v: {
  idCRM: string; cliente: string; oportunidad: string; lineas: Linea[]; tipo: string; tcv: string; fechaCierre: string; etapa: number;
}): string[] {
  const errores: string[] = [];
  if (v.idCRM.trim() === '') errores.push('Escribe el ID del CRM.');
  if (v.cliente.trim() === '') errores.push('Escribe el nombre del cliente.');
  if (v.oportunidad.trim() === '') errores.push('Escribe el nombre de la oportunidad.');
  if (v.lineas.length === 0) errores.push('Elige al menos una línea.');
  if (v.tipo === '') errores.push('Elige el tipo de oportunidad.');
  const monto = Number(v.tcv);
  if (v.tcv.trim() === '' || !Number.isFinite(monto) || monto <= 0) errores.push('El TCV debe ser un número mayor que 0.');
  if (v.fechaCierre === '') errores.push('Elige la fecha de cierre del CRM.');
  else if (v.etapa <= 4 && v.fechaCierre < hoyLocal()) errores.push('La fecha de cierre no puede ser anterior a hoy.');
  return errores;
}

export default function FichaNueva({ ocupado, onEnviar }: Props) {
  const [idCRM, setIdCRM] = useState('');
  const [cliente, setCliente] = useState('');
  const [oportunidad, setOportunidad] = useState('');
  const [pais, setPais] = useState('MX');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [tipo, setTipo] = useState('');
  const [etapa, setEtapa] = useState(1);
  const [tcv, setTcv] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [fechaCierre, setFechaCierre] = useState('');
  const [errores, setErrores] = useState<string[]>([]);

  function alternarLinea(l: Linea): void {
    setLineas((actuales) => (actuales.includes(l) ? actuales.filter((x) => x !== l) : [...actuales, l]));
  }

  function enviar(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fallos = revisar({ idCRM, cliente, oportunidad, lineas, tipo, tcv, fechaCierre, etapa });
    setErrores(fallos);
    if (fallos.length > 0) return;
    onEnviar({
      idCRM: idCRM.trim(),
      cliente: cliente.trim(),
      oportunidad: oportunidad.trim(),
      pais,
      lineas,
      tipo: tipo as TipoOportunidad,
      etapaCRM: etapa,
      tcv: Number(tcv),
      moneda,
      fechaCierreCRM: fechaCierre,
      probabilidadCRM: null,
      esRFP: null,
      ultimaActualizacionCRM: null,
    });
  }

  return (
    <form className="ficha" onSubmit={enviar} noValidate>
      <h2>Nueva oportunidad</h2>
      <p className="suave">Captura la ficha tal como está en el CRM.</p>

      <label>
        ID del CRM
        <input value={idCRM} onChange={(e) => setIdCRM(e.target.value)} autoComplete="off" />
      </label>
      <label>
        Cliente
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoComplete="off" />
      </label>
      <label>
        Oportunidad
        <input value={oportunidad} onChange={(e) => setOportunidad(e.target.value)} autoComplete="off" />
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

      <div className="ficha-fila">
        <label>
          TCV
          <input value={tcv} onChange={(e) => setTcv(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="450000" />
        </label>
        <label>
          Moneda
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
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
