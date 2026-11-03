/** Solo `name`, `status` y `message` de una excepción: nada de encabezados, cuerpos, claves ni stack. */
export function resumenError(e: unknown): { name: string; status?: number; message: string } {
  if (typeof e !== 'object' || e === null) return { name: typeof e, message: 'valor no es un error' };
  const o = e as { name?: unknown; status?: unknown; message?: unknown };
  return {
    name: typeof o.name === 'string' ? o.name : 'Error',
    ...(typeof o.status === 'number' ? { status: o.status } : {}),
    message: typeof o.message === 'string' ? o.message : '',
  };
}
