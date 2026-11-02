'use client';

import { useEffect, useRef, useState } from 'react';
import type { ModoSesion, Oportunidad, ResultadoTurno, Uso } from 'agente-sales-agent';
import { crearAlmacen } from '../lib/almacenNavegador';
import type { Almacen, EstadoAlmacen } from '../lib/almacenNavegador';
import { etiquetaModo, MODOS_SESION } from '../lib/catalogos';
import Chat from './Chat';
import type { BloqueConversacion } from './Chat';
import FichaNueva from './FichaNueva';
import type { DatosFicha } from './FichaNueva';
import PanelDiagnostico from './PanelDiagnostico';
import TarjetaPapel from './TarjetaPapel';

/** Lo que la página de servidor le pasa al laboratorio de cada escenario (nunca los hechos ocultos). */
export interface EscenarioVista {
  id: string;
  titulo: string;
  tarjetaPapel: string;
  /** ID de CRM de la oportunidad que arma el servidor para este escenario. */
  idCRM: string;
}

const GENERICO = 'Error interno, intenta de nuevo.';
const SIN_CONEXION = 'Sin conexión, intenta de nuevo.';
const NUEVA = 'nueva';

type Respuesta = { ok: true; datos: unknown } | { ok: false; mensaje: string };

/** Error con un mensaje que ya se puede mostrar al usuario. */
class ErrorVisible extends Error {}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** POST JSON a la API: 401 lleva a /acceso; los fallos de red y de servidor regresan un mensaje en español. */
async function llamar(ruta: string, cuerpo: unknown): Promise<Respuesta> {
  let r: Response;
  try {
    r = await fetch(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (r.status === 401) {
    window.location.href = '/acceso';
    return { ok: false, mensaje: 'Necesitas la contraseña para usar esta página.' };
  }
  let datos: unknown = null;
  try {
    datos = await r.json();
  } catch {
    // respuesta sin JSON: se usa el mensaje genérico
  }
  if (!r.ok) {
    return { ok: false, mensaje: esObjeto(datos) && typeof datos['error'] === 'string' ? datos['error'] : GENERICO };
  }
  return { ok: true, datos };
}

const esResultadoTurno = (x: unknown): x is ResultadoTurno =>
  esObjeto(x) && esObjeto(x['oportunidad']) && x['oportunidad']['formato'] === 1 && esObjeto(x['uso']);

const totalTokens = (u: Uso): number => u.entrada + u.salida + u.cacheLectura + u.cacheEscritura;
const miles = (n: number): string => n.toLocaleString('es-MX');

/** Copia al portapapeles; el texto llega de la red, así que se entrega como promesa (Safari exige el gesto del clic). */
async function copiarAlPortapapeles(obtener: () => Promise<string>): Promise<void> {
  let texto: string | null = null;
  const conTexto = async (): Promise<string> => (texto ??= await obtener());
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': conTexto().then((t) => new Blob([t], { type: 'text/plain' })) }),
      ]);
      return;
    } catch (e) {
      if (e instanceof ErrorVisible) throw e;
    }
  }
  await navigator.clipboard.writeText(await conTexto());
}

interface Aviso { tipo: 'error' | 'info'; texto: string }

export default function Laboratorio({ escenarios }: { escenarios: EscenarioVista[] }) {
  const almacen = useRef<Almacen | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [estadoAlmacen, setEstadoAlmacen] = useState<EstadoAlmacen>('ok');
  const [seleccion, setSeleccion] = useState<string>(`esc:${escenarios[0]?.id ?? ''}`);
  const [modo, setModo] = useState<ModoSesion>('calificar');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [uso, setUso] = useState<Uso>({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [listo, setListo] = useState(false);

  // El almacén se crea en el cliente, dentro de un efecto: el servidor no tiene localStorage.
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    almacen.current = crearAlmacen(storage);
    refrescar();
    setListo(true);
  }, []);

  function refrescar(): void {
    const a = almacen.current;
    if (a === null) return;
    setOportunidades(a.listar());
    setEstadoAlmacen(a.estado);
  }

  const escenario = seleccion.startsWith('esc:') ? escenarios.find((e) => e.id === seleccion.slice(4)) : undefined;
  const idActual = escenario !== undefined ? escenario.idCRM : seleccion.startsWith('op:') ? seleccion.slice(3) : null;
  const actual = idActual === null ? null : oportunidades.find((o) => o.id === idActual) ?? null;
  const idsEscenarios = new Set(escenarios.map((e) => e.idCRM));
  const propias = oportunidades.filter((o) => !idsEscenarios.has(o.id));
  const esNueva = seleccion === NUEVA;

  const seleccionPara = (id: string): string => {
    const e = escenarios.find((x) => x.idCRM === id);
    return e !== undefined ? `esc:${e.id}` : `op:${id}`;
  };

  /** Una llamada a /api/turno: guarda la oportunidad que regresa (también en errores) y suma los tokens. */
  async function turno(cuerpo: Record<string, unknown>): Promise<ResultadoTurno | null> {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await llamar('/api/turno', cuerpo);
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.mensaje });
        return null;
      }
      if (!esResultadoTurno(r.datos)) {
        setAviso({ tipo: 'error', texto: GENERICO });
        return null;
      }
      const res = r.datos;
      almacen.current?.guardar(res.oportunidad);
      refrescar();
      setUso((u) => ({
        entrada: u.entrada + res.uso.entrada,
        salida: u.salida + res.uso.salida,
        cacheLectura: u.cacheLectura + res.uso.cacheLectura,
        cacheEscritura: u.cacheEscritura + res.uso.cacheEscritura,
      }));
      if (res.error !== null) setAviso({ tipo: 'error', texto: res.error });
      return res;
    } finally {
      setOcupado(false);
    }
  }

  async function iniciar(): Promise<void> {
    if (actual !== null) {
      await turno({ accion: 'iniciar', oportunidad: actual, modo });
    } else if (escenario !== undefined) {
      await turno({ accion: 'iniciar', escenarioId: escenario.id, modo });
    }
  }

  async function iniciarConFicha(ficha: DatosFicha): Promise<void> {
    const res = await turno({ accion: 'iniciar', ficha, modo });
    if (res !== null && res.error === null) setSeleccion(seleccionPara(res.oportunidad.id));
  }

  async function enviarMensaje(texto: string): Promise<boolean> {
    if (actual === null) return false;
    setPendiente(texto);
    const res = await turno({ accion: 'mensaje', mensaje: texto, oportunidad: actual });
    setPendiente(null);
    return res !== null && res.error === null;
  }

  async function terminar(): Promise<void> {
    if (actual === null) return;
    const res = await turno({ accion: 'cerrar', oportunidad: actual });
    if (res !== null && res.error === null && res.oportunidad.sesionActual !== null) {
      setAviso({ tipo: 'info', texto: 'La sesión sigue abierta: el agente no la cerró. Vuelve a pulsar "Terminar sesión".' });
    }
  }

  async function copiar(): Promise<void> {
    if (actual === null) return;
    setAviso(null);
    try {
      await copiarAlPortapapeles(async () => {
        const r = await llamar('/api/transcripcion', { oportunidad: actual });
        if (!r.ok) throw new ErrorVisible(r.mensaje);
        if (!esObjeto(r.datos) || typeof r.datos['texto'] !== 'string') throw new ErrorVisible(GENERICO);
        return r.datos['texto'];
      });
      setAviso({ tipo: 'info', texto: 'Conversación copiada.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorVisible ? e.message : 'No se pudo copiar al portapapeles. Revisa los permisos del navegador.' });
    }
  }

  function reiniciar(): void {
    if (actual === null) return;
    if (!window.confirm('¿Borrar esta oportunidad y su conversación de este navegador?')) return;
    almacen.current?.borrar(actual.id);
    refrescar();
    setAviso(null);
    if (escenario === undefined) setSeleccion(`esc:${escenarios[0]?.id ?? ''}`);
  }

  function reiniciarDatos(): void {
    almacen.current?.reiniciar();
    refrescar();
  }

  const sesion = actual?.sesionActual ?? null;
  const bloques: BloqueConversacion[] = actual === null ? [] : [
    ...actual.sesiones.map((s, i) => ({
      clave: `s${i}`,
      encabezado: `Sesión del ${s.fecha} · ${etiquetaModo(s.modo)}`,
      mensajes: s.transcripcion ?? [],
    })),
    ...(sesion === null ? [] : [{
      clave: 'actual',
      encabezado: `Sesión en curso desde el ${sesion.inicio} · ${etiquetaModo(sesion.modo)}`,
      mensajes: sesion.transcripcion,
    }]),
  ];

  const cerrada = actual?.cerrada === true;
  const puedeIniciar = listo && !ocupado && !cerrada && sesion === null && (actual !== null || escenario !== undefined);
  const motivoChat = cerrada && actual !== null
    ? `Esta oportunidad está cerrada en el CRM (etapa ${actual.ficha.etapaCRM}); no hay nada que calificar.`
    : 'Pulsa "Iniciar sesión" para empezar la conversación.';

  return (
    <main className="lab">
      <header className="lab-encabezado">
        <h1>Laboratorio de pruebas</h1>
      </header>

      {estadoAlmacen === 'formato_incompatible' && (
        <div className="aviso aviso-error" role="alert">
          <span>Los datos de prueba guardados en este navegador son de otra versión y no se pueden leer.</span>
          <button type="button" className="boton" onClick={reiniciarDatos}>Reiniciar datos de prueba</button>
        </div>
      )}
      {estadoAlmacen === 'sin_almacen' && (
        <div className="aviso aviso-info" role="status">
          Este navegador no deja guardar datos: las oportunidades se perderán al cerrar o recargar la página.
        </div>
      )}
      {aviso !== null && (
        <div className={`aviso aviso-${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
          <span>{aviso.texto}</span>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>×</button>
        </div>
      )}

      <section className="lab-controles" aria-label="Controles">
        <label className="campo">
          Oportunidad
          <select value={seleccion} onChange={(e) => { setSeleccion(e.target.value); setAviso(null); }} disabled={ocupado}>
            <optgroup label="Escenarios">
              {escenarios.map((e) => (
                <option key={e.id} value={`esc:${e.id}`}>
                  {e.id} · {e.titulo}{oportunidades.some((o) => o.id === e.idCRM) ? ' (guardado)' : ''}
                </option>
              ))}
            </optgroup>
            {propias.length > 0 && (
              <optgroup label="Guardadas">
                {propias.map((o) => <option key={o.id} value={`op:${o.id}`}>{o.ficha.cliente} · {o.ficha.oportunidad}</option>)}
              </optgroup>
            )}
            <option value={NUEVA}>Nueva oportunidad</option>
          </select>
        </label>

        {!esNueva && (
          <div className="lab-acciones">
            <label className="campo campo-modo">
              Modo
              <select value={modo} onChange={(e) => setModo(e.target.value as ModoSesion)} disabled={ocupado}>
                {MODOS_SESION.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
              </select>
            </label>
            <div className="botones">
              <button type="button" className="boton boton-principal" disabled={!puedeIniciar} onClick={() => void iniciar()}>
                Iniciar sesión
              </button>
              <button type="button" className="boton" disabled={ocupado || sesion === null} onClick={() => void terminar()}>
                Terminar sesión
              </button>
              <button type="button" className="boton" disabled={ocupado || actual === null} onClick={() => void copiar()}>
                Copiar conversación
              </button>
              <button type="button" className="boton boton-peligro" disabled={ocupado || actual === null} onClick={reiniciar}>
                Reiniciar
              </button>
            </div>
          </div>
        )}
        {esNueva && (
          <label className="campo campo-modo">
            Modo de la primera sesión
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoSesion)} disabled={ocupado}>
              {MODOS_SESION.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
          </label>
        )}
      </section>

      {escenario !== undefined && <TarjetaPapel key={`${escenario.id}-${actual === null}`} titulo={escenario.titulo} texto={escenario.tarjetaPapel} abierta={actual === null} />}

      {esNueva ? (
        <FichaNueva ocupado={ocupado} onEnviar={(f) => void iniciarConFicha(f)} />
      ) : (
        <div className="lab-cuerpo">
          <Chat
            key={actual?.id ?? 'sin-oportunidad'}
            bloques={bloques}
            pendiente={pendiente}
            pensando={ocupado}
            puedeEscribir={sesion !== null && !cerrada}
            motivo={motivoChat}
            onEnviar={enviarMensaje}
          />
          <aside className="panel" data-abierto={panelAbierto} aria-label="Diagnóstico">
            <h2>
              <button
                type="button"
                className="panel-titulo"
                aria-expanded={panelAbierto}
                aria-controls="panel-cuerpo"
                onClick={() => setPanelAbierto((a) => !a)}
              >
                Diagnóstico
              </button>
            </h2>
            <div id="panel-cuerpo" className="panel-cuerpo">
              <PanelDiagnostico oportunidad={actual} />
            </div>
          </aside>
        </div>
      )}

      <footer className="lab-pie">
        <span>Tokens de esta sesión de la página: <strong>{miles(totalTokens(uso))}</strong></span>
        <span className="suave">
          entrada {miles(uso.entrada)} · salida {miles(uso.salida)} · caché leída {miles(uso.cacheLectura)} · caché escrita {miles(uso.cacheEscritura)}
        </span>
      </footer>
    </main>
  );
}
