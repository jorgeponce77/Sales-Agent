'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Mensaje } from 'agente-sales-agent';

export interface BloqueConversacion {
  clave: string;
  encabezado: string;
  mensajes: Mensaje[];
}

interface Props {
  bloques: BloqueConversacion[];
  /** Mensaje enviado que aún no regresa del servidor. */
  pendiente: string | null;
  pensando: boolean;
  /** Si es false el campo queda deshabilitado y `motivo` explica por qué. */
  puedeEscribir: boolean;
  motivo: string;
  /** Envía el mensaje; devuelve true si el servidor lo aceptó (si no, el texto vuelve al campo). */
  onEnviar: (texto: string) => Promise<boolean>;
}

const MAX_MENSAJE = 4000;

function Burbuja({ m }: { m: Mensaje }) {
  const propio = m.rol === 'vendedor';
  return (
    <li className={`burbuja ${propio ? 'burbuja-propia' : 'burbuja-agente'}`}>
      <span className="solo-lectores">{propio ? 'Tú: ' : 'Agente: '}</span>
      {m.texto}
    </li>
  );
}

const esTactil = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export default function Chat({ bloques, pendiente, pensando, puedeEscribir, motivo, onEnviar }: Props) {
  const [borrador, setBorrador] = useState('');
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const deshabilitado = !puedeEscribir || pensando;
  const totalMensajes = bloques.reduce((n, b) => n + b.mensajes.length, 0);

  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [totalMensajes, pendiente, pensando, bloques.length]);

  // Al volver la respuesta, el cursor regresa al campo si el usuario no fue a otro lado.
  const esperabaAntes = useRef(false);
  useEffect(() => {
    const volvio = esperabaAntes.current && !pensando;
    esperabaAntes.current = pensando;
    if (volvio && puedeEscribir && (document.activeElement === document.body || document.activeElement === null)) {
      campo.current?.focus({ preventScroll: true });
    }
  }, [pensando, puedeEscribir]);

  async function enviar(): Promise<void> {
    const texto = borrador.trim();
    if (texto === '' || deshabilitado) return;
    setBorrador('');
    const ok = await onEnviar(texto);
    if (!ok) setBorrador((actual) => (actual === '' ? texto : actual));
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !esTactil()) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <section className="chat" aria-label="Conversación">
      <div className="chat-lista" ref={lista} tabIndex={0} role="log" aria-live="polite">
        {bloques.map((b) => (
          <div key={b.clave} className="chat-sesion">
            <p className="chat-encabezado">{b.encabezado}</p>
            {b.mensajes.length === 0 ? (
              <p className="vacio">Sin transcripción guardada.</p>
            ) : (
              <ul className="burbujas">
                {b.mensajes.map((m, i) => <Burbuja key={i} m={m} />)}
              </ul>
            )}
          </div>
        ))}
        {(pendiente !== null || pensando) && (
          <ul className="burbujas">
            {pendiente !== null && <Burbuja m={{ rol: 'vendedor', texto: pendiente, fecha: '' }} />}
            {pensando && <li className="burbuja burbuja-agente burbuja-pensando">pensando…</li>}
          </ul>
        )}
        {!puedeEscribir && !pensando && <p className="chat-nota">{motivo}</p>}
      </div>
      <form
        className="chat-entrada"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <label className="solo-lectores" htmlFor="mensaje-vendedor">Tu mensaje</label>
        <textarea
          id="mensaje-vendedor"
          ref={campo}
          rows={2}
          maxLength={MAX_MENSAJE}
          value={borrador}
          disabled={deshabilitado}
          placeholder={puedeEscribir ? 'Escribe tu mensaje' : 'Sin sesión abierta'}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={alTeclear}
        />
        <button type="submit" className="boton boton-principal" disabled={deshabilitado || borrador.trim() === ''}>
          Enviar
        </button>
      </form>
    </section>
  );
}
