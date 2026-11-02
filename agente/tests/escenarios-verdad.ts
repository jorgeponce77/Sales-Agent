import { CONFIG_DEFAULT, sumarDiasNaturales } from 'motor-sales-agent';
import type { CriterioCumplido, Evidencia, Expediente, Influencia, Nivel } from 'motor-sales-agent';
import { fichaAExpediente } from '../src/ficha.js';
import type { Ficha } from '../src/tipos.js';
import { TIPOS_CAMBIO_DEFAULT } from '../src/tipos.js';

/**
 * Expediente que armaría un agente que entrevista al vendedor simulado de cada escenario
 * y registra lo que dicen sus `hechosOcultos` (la versión veraz, con el nivel de cada dato).
 * Sirve para comprobar que los hechos permiten activar las banderas esperadas. Solo para pruebas.
 */

const ev = <T>(valor: T | null, nivel: Nivel, fecha?: string): Evidencia<T> =>
  fecha === undefined ? { valor, nivel } : { valor, nivel, fecha };

const ausente = <T>(): Evidencia<T> => ev<T>(null, 'ausente');

function inf(base: Partial<Influencia> & Pick<Influencia, 'personaId' | 'nombre' | 'roles'>): Influencia {
  return {
    grado: null, modo: null, calificacion: null, contactada: false, nuevaEnPuesto: false,
    trDeclaracion: null, prioridad: null, ...base,
  };
}

/** Criterios de Argano confirmados de las etapas anteriores a `hasta`, menos los de `excepto`. */
function criteriosHasta(hasta: number, esRFP: boolean, excepto: string[] = [], extra: string[] = []): CriterioCumplido[] {
  const claves = CONFIG_DEFAULT.criteriosArgano
    .filter((c) => c.etapaDesde < hasta && (!c.soloRFP || esRFP) && !excepto.includes(c.clave))
    .map((c) => c.clave);
  return [...claves, ...extra].map((clave) => ({ clave, nivel: 'confirmado', fuente: 'vendedor: referencia del escenario' }));
}

function criterios(claves: string[]): CriterioCumplido[] {
  return claves.map((clave) => ({ clave, nivel: 'confirmado', fuente: 'vendedor: referencia del escenario' }));
}

type Id = 'E1' | 'E2' | 'E3' | 'E4' | 'E5';

export function expedienteDeVerdad(id: Id, ficha: Ficha, hoy: string): Expediente {
  const exp = fichaAExpediente(ficha, TIPOS_CAMBIO_DEFAULT);
  const hace = (dias: number): string => sumarDiasNaturales(hoy, -dias);

  switch (id) {
    case 'E1': {
      exp.sensacion = 'euforico';
      exp.prioridad = ev('urgente', 'supuesto', hace(1));
      exp.influencias = [
        inf({ personaId: 'hector-salgado', nombre: 'Héctor Salgado Villanueva', roles: ['U', 'C'], grado: 'A', modo: 'P', calificacion: 4,
          contactada: true, ultimoContacto: hace(3), trDeclaracion: 'Llegar a la temporada alta con los 3 CD en el nuevo sistema y recortar a la mitad los errores de surtido' }),
        inf({ personaId: 'patricia-dominguez', nombre: 'Patricia Domínguez Rueda', roles: ['E'], grado: 'A', contactada: true, ultimoContacto: hace(40) }),
        inf({ personaId: 'raul-ibarra', nombre: 'Raúl Ibarra Cantú', roles: ['T'], grado: 'M', modo: 'E', calificacion: -1,
          contactada: true, ultimoContacto: hace(20), trDeclaracion: 'Que la integración no tumbe su operación' }),
      ];
      exp.preguntaCompetenciaHecha = true;
      exp.alternativas = [{ tipo: 'proveedor', nombre: 'Axioma Logística', posicion: 'compartida' }];
      exp.contribucionDiferenciadora = ev('Implementación previa en otra cadena de autoservicio de la región', 'confirmado', hace(5));
      exp.bant = {
        budget: ev('Presupuesto aprobado (correo de Héctor)', 'confirmado', hace(60)),
        authority: ev('Comité de adquisiciones; Patricia firmaría', 'supuesto', hace(1)),
        need: ev('CD saturados, horas extra y errores de surtido de cerca del 4%', 'confirmado', hace(30)),
        time: ev('Decidir este mes', 'supuesto', hace(1)),
      };
      exp.compellingEvent = {
        descripcion: 'Descuento por firmar antes de fin de mes (urgencia propia del vendedor)',
        fecha: ausente(), dueno: ausente(), costoInaccion: ausente(), urgenciaFalsa: true,
      };
      exp.cadena = {
        ruta: 'contrato', requiereSOW: true,
        pasos: { aElegido: false, bContratoEnviado: false, cComentariosRecibidos: false, dEnFirma: false, eFirmado: false, fAltaProveedor: false, hOC: false },
      };
      exp.criteriosArgano = [
        ...criteriosHasta(2, false),
        ...criterios(['propuesta_desarrollada', 'requerimientos_refinados', 'recursos_presupuesto_evaluados', 'propuesta_entregada', 'forecast_actualizado']),
      ];
      exp.higieneCRM = { valores: false, actividades: false, etapas: false };
      break;
    }
    case 'E2': {
      exp.sensacion = 'bien';
      exp.prioridad = ev('importante', 'supuesto', hace(1));
      exp.influencias = [
        inf({ personaId: 'jhon-fredy-quintero', nombre: 'Jhon Fredy Quintero Ayala', roles: ['U'], grado: 'M', modo: 'P', calificacion: 3,
          contactada: true, ultimoContacto: hace(21), trDeclaracion: 'Entregas a tiempo y menor costo de flete' }),
      ];
      exp.preguntaCompetenciaHecha = true;
      exp.alternativas = [{ tipo: 'no_hacer_nada', nombre: 'Excel y un proveedor local de GPS', posicion: null }];
      exp.contribucionDiferenciadora = ev('Buen producto con varias implementaciones', 'supuesto', hace(1));
      exp.bant = {
        budget: ev('Creo que hay presupuesto', 'supuesto', hace(1)),
        authority: ev('Quintero con la gerencia', 'supuesto', hace(1)),
        need: ev('Fletes caros, rutas en Excel, sin trazabilidad', 'confirmado', hace(21)),
        time: ev('Cierre según el ciclo', 'supuesto', hace(1)),
      };
      exp.criteriosArgano = [
        ...criteriosHasta(1, false),
        ...criterios(['confirma_recibir_propuesta', 'propuesta_desarrollada']),
      ];
      exp.higieneCRM = { valores: true, actividades: null, etapas: false };
      break;
    }
    case 'E3': {
      exp.sensacion = 'bien';
      exp.prioridad = ev('activa', 'supuesto', hace(1));
      exp.contactoPrevioRFP = false;
      exp.criteriosCompraDefinidos = true;
      exp.influencias = [
        inf({ personaId: 'rosario-villasenor', nombre: 'Rosario Villaseñor Meza', roles: ['U'], grado: 'A' }),
        inf({ personaId: 'salvador-orozco', nombre: 'Salvador Orozco Ibarra', roles: ['E'], grado: 'A' }),
      ];
      exp.preguntaCompetenciaHecha = true;
      exp.alternativas = [{ tipo: 'proveedor', nombre: 'Infotrack del Bajío', posicion: 'alternativa' }];
      exp.contribucionDiferenciadora = ev('Experiencia en almacenes de alto volumen', 'supuesto', hace(1));
      exp.bant = {
        budget: ev('Suficiencia presupuestal en las bases', 'confirmado', hace(25)),
        authority: ev('Comité presidido por Salvador Orozco', 'supuesto', hace(25)),
        need: ev('Inventarios descuadrados y software viejo (anexo técnico)', 'supuesto', hace(25)),
        time: ev('Calendario de la licitación', 'confirmado', hace(25)),
      };
      exp.criteriosArgano = criterios([
        'fuente_creible', 'cliente_confirma_real', 'alineada_estrategia_argano',
        'volumen_presupuesto_aprox', 'aprobacion_calificacion_presupuesto_cliente', 'rfp_analizado', 'confirma_recibir_propuesta',
      ]);
      exp.cadena = { ...exp.cadena, ruta: 'contrato', requiereSOW: true };
      exp.higieneCRM = { valores: true, actividades: true, etapas: true };
      break;
    }
    case 'E4': {
      exp.sensacion = 'preocupado';
      exp.prioridad = ev('importante', 'confirmado', hace(2));
      exp.influencias = [
        inf({ personaId: 'sergio-paredes', nombre: 'Sergio Paredes Chávez', roles: ['E'], grado: 'A', modo: 'E', calificacion: -1,
          contactada: true, ultimoContacto: hace(90), trDeclaracion: 'No perder a los dos clientes grandes en las renovaciones' }),
        inf({ personaId: 'marco-huaman', nombre: 'Marco Antonio Huamán Rojas', roles: ['T'], grado: 'A', modo: 'C', calificacion: -3,
          contactada: true, ultimoContacto: hace(30), trDeclaracion: 'Poner en producción el modelo propio de su equipo' }),
        inf({ personaId: 'karina-salazar', nombre: 'Karina Salazar Tapia', roles: ['U'], grado: 'M', modo: 'P', calificacion: 2,
          contactada: true, ultimoContacto: hace(14), trDeclaracion: 'Dejar de planear a mano y bajar el error de pronóstico' }),
      ];
      exp.preguntaCompetenciaHecha = true;
      exp.alternativas = [{ tipo: 'interna', nombre: 'Equipo de TI del cliente (modelo propio)', posicion: 'alternativa' }];
      // El vendedor solo dice "somos más grandes y tenemos experiencia": sin articular, queda ausente.
      exp.contribucionDiferenciadora = ausente();
      exp.bant = {
        budget: ev('Partida de transformación digital asignada al piloto de TI', 'supuesto', hace(2)),
        authority: ev('Paredes con la recomendación de Huamán', 'supuesto', hace(14)),
        need: ev('Error de pronóstico cercano al 35%, sobrepersonal y multas', 'confirmado', hace(14)),
        time: ev('Al terminar la evaluación del piloto de TI', 'supuesto', hace(2)),
      };
      exp.compellingEvent = {
        descripcion: 'Renovación de dos clientes grandes del 3PL que exigen 95% de nivel de servicio',
        fecha: ausente(), dueno: ev('Sergio Paredes', 'supuesto', hace(2)), costoInaccion: ev('Cerca del 30% de los ingresos', 'supuesto', hace(14)),
        urgenciaFalsa: false,
      };
      exp.criteriosArgano = [
        ...criteriosHasta(2, false),
        ...criterios(['propuesta_desarrollada']),
      ];
      exp.higieneCRM = { valores: true, actividades: false, etapas: true };
      break;
    }
    case 'E5': {
      exp.sensacion = 'seguro';
      exp.prioridad = ev('urgente', 'confirmado', hace(14));
      exp.reorganizacion = ev(false, 'confirmado', hace(14));
      exp.criteriosCompraDefinidos = true;
      exp.cuenta.clienteIdeal = [4, 4, 5, 4, 3].map((v) => ev(v, 'confirmado', hace(10)));
      exp.influencias = [
        inf({ personaId: 'fernando-aguirre', nombre: 'Fernando Aguirre Zubiría', roles: ['E'], grado: 'A', modo: 'P', calificacion: 4,
          contactada: true, ultimoContacto: hace(6), trDeclaracion: 'Aprobar la verificación de seguimiento sin observaciones ni multa' }),
        inf({ personaId: 'alejandra-montes', nombre: 'Alejandra Montes Ledesma', roles: ['U', 'C'], grado: 'A', modo: 'P', calificacion: 5,
          contactada: true, ultimoContacto: hace(2), trDeclaracion: 'Surtir sin errores de lote y caducidad sin frenar la operación' }),
        inf({ personaId: 'tomas-beltran', nombre: 'Tomás Beltrán Cuevas', roles: ['T'], grado: 'M', modo: 'C', calificacion: 3,
          contactada: true, ultimoContacto: hace(9), trDeclaracion: 'Integrar sin middleware ni nuevas interfaces que mantener' }),
        inf({ personaId: 'isabel-cano', nombre: 'Isabel Cano Rentería', roles: ['U'], grado: 'M', modo: 'P', calificacion: 3,
          contactada: true, ultimoContacto: hace(12), trDeclaracion: 'Presentar a la autoridad evidencia de trazabilidad en el picking' }),
      ];
      exp.preguntaCompetenciaHecha = true;
      exp.alternativas = [{ tipo: 'proveedor', nombre: 'TalkPick Systems', posicion: 'dominante' }];
      exp.contribucionDiferenciadora = ev('Integración nativa con el WMS instalado y arranque en unas 8 semanas', 'confirmado', hace(21));
      exp.bant = {
        budget: ev('Partida aprobada en el presupuesto 2026 (correo de Aguirre)', 'confirmado', hace(14)),
        authority: ev('Aguirre decide; el comité de inversiones ratificó', 'confirmado', hace(21)),
        need: ev('Observación de la autoridad sanitaria sobre trazabilidad de lote y caducidad', 'confirmado', hace(35)),
        time: ev('Firma pronto para operar antes de la fecha regulatoria', 'confirmado', hace(14)),
      };
      exp.compellingEvent = {
        descripcion: 'Verificación de seguimiento de la autoridad sanitaria en el CD de Toluca',
        fecha: ev(sumarDiasNaturales(hoy, 135), 'confirmado', hace(14)),
        dueno: ev('Fernando Aguirre', 'confirmado', hace(14)),
        costoInaccion: ev('Multa y suspensión de productos controlados (unos 3.5 millones de dólares de ventas al mes)', 'confirmado', hace(14)),
        urgenciaFalsa: false,
      };
      exp.cadena = {
        ruta: 'ambas_oc_tras_contrato', requiereSOW: true,
        pasos: { aElegido: true, bContratoEnviado: false, cComentariosRecibidos: false, dEnFirma: false, eFirmado: false, fAltaProveedor: true, hOC: false },
      };
      exp.criteriosArgano = [
        ...criteriosHasta(3, false),
        ...criterios(['aprobacion_interna_recursos_margen', 'pr_aprobado', 'propuesta_entregada', 'forecast_actualizado']),
      ];
      exp.higieneCRM = { valores: true, actividades: true, etapas: true };
      break;
    }
  }
  return exp;
}
