import { crearOportunidad } from 'agente-sales-agent';
import type { Ficha, Oportunidad } from 'agente-sales-agent';
import { firmarAcceso } from '../lib/sesion';

export const CLAVE = 'clave-de-prueba';
export const URL_TURNO = 'http://localhost/api/turno';

/** Ficha mínima y válida: WMS en MX, etapa 2, TCV 450000 USD. Solo para pruebas. */
export function fichaBase(over: Partial<Ficha> = {}): Ficha {
  return {
    idCRM: 'OPP-0001',
    cliente: 'Cliente de prueba',
    oportunidad: 'Implementación WMS',
    pais: 'MX',
    lineas: ['WMS'],
    tipo: null,
    etapaCRM: 2,
    tcv: 450000,
    moneda: 'USD',
    fechaCreacion: '2026-10-01',
    fechaCierreCRM: '2027-03-31',
    vendedor: 'prueba@netlogistik.test',
    probabilidadCRM: null,
    esRFP: null,
    ultimaActualizacionCRM: null,
    ...over,
  };
}

export const oportunidadBase = (over: Partial<Ficha> = {}): Oportunidad => crearOportunidad(fichaBase(over));

/** Solicitud POST al endpoint; con `cookie` pone la cookie de acceso válida (o el texto dado). */
export function solicitud(
  cuerpo: unknown,
  opciones: { cookie?: boolean | string; url?: string; encabezados?: Record<string, string> } = {},
): Request {
  const { cookie = true, url = URL_TURNO, encabezados = {} } = opciones;
  const headers: Record<string, string> = { 'content-type': 'application/json', ...encabezados };
  if (cookie === true) headers['cookie'] = `sa_acceso=${firmarAcceso(CLAVE)}`;
  else if (typeof cookie === 'string') headers['cookie'] = cookie;
  return new Request(url, {
    method: 'POST',
    headers,
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}
