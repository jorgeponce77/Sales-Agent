'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function PaginaAcceso() {
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/acceso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clave }),
      });
      if (r.ok) {
        window.location.href = '/';
        return;
      }
      const cuerpo: { error?: string } = await r.json().catch(() => ({}));
      setError(cuerpo.error ?? 'No se pudo entrar. Intenta de nuevo.');
    } catch {
      setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <main className="acceso">
      <form onSubmit={entrar}>
        <h1>Sales Agent · Pruebas</h1>
        <p>Escribe la contraseña para entrar.</p>
        <label>
          Contraseña
          <input
            type="password"
            name="clave"
            autoComplete="current-password"
            autoFocus
            required
            value={clave}
            onChange={(ev) => setClave(ev.target.value)}
          />
        </label>
        {error !== null && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={enviando || clave === ''}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
