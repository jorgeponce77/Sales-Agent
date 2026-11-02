import { crearOportunidad } from '../src/ficha.js';
import type { EstadoTurno } from '../src/herramientas/escritura.js';
import { TIPOS_CAMBIO_DEFAULT } from '../src/tipos.js';
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

/** Estado de turno con la oportunidad de `fichaBase()`, hoy 2026-11-02 y sin eventos. Solo para pruebas. */
export function estadoBase(over: Partial<EstadoTurno> = {}): EstadoTurno {
  return {
    oportunidad: crearOportunidad(fichaBase()),
    hoy: '2026-11-02',
    eventos: [],
    tiposCambio: { ...TIPOS_CAMBIO_DEFAULT },
    sesionCerrada: null,
    ...over,
  };
}
