interface Props {
  titulo: string;
  texto: string;
  /** Abierta al empezar; con la sesión en marcha se pliega para dejar lugar al chat. */
  abierta: boolean;
}

/** "Tu papel": lo que George sabe y cómo actúa al hacer de vendedor en el escenario. */
export default function TarjetaPapel({ titulo, texto, abierta }: Props) {
  return (
    <details className="tarjeta-papel" open={abierta} aria-label="Tu papel en este escenario">
      <summary>
        <strong>Tu papel</strong>
        <span className="suave"> · {titulo}</span>
      </summary>
      {texto.split('\n').filter((p) => p.trim() !== '').map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </details>
  );
}
