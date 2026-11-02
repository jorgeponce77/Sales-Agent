import type { Ficha } from '../src/tipos.js';

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
