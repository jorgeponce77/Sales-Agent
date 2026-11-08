/**
 * Evaluaciones con vendedores simulados. Consume saldo de la API: se corre a mano, no forma parte de `npm test`.
 *   npm run evals -w agente-sales-agent -- --escenario E1 --turnos 6
 * Opciones: --escenario E1|E2|E3|E4|E5|todos (default todos) · --turnos N (default 15) · --hoy AAAA-MM-DD (default: hoy en America/Mexico_City)
 * Variables: ANTHROPIC_API_KEY (o /home/claude/.secrets/anthropic_key) · MODELO_AGENTE · MODELO_VENDEDOR · DEBUG_AGENTE=1 (metadatos de cada llamada a stderr)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crearClienteAnthropic, crearOportunidad, ejecutarTurno, ESCENARIOS, horaLocalPorPais, hoyEnMexico, iniciarSesion,
  MODELO_DEFAULT,
} from '../src/index.js';
import type { ClienteModelo, Escenario, Mensaje, Oportunidad, OpcionesTurno, ResultadoTurno, Uso } from '../src/index.js';
import { interpretarRespuestaVendedor, responderComoVendedor } from './vendedorSimulado.js';
import { verificar } from './verificaciones.js';
import type { Verificacion } from './verificaciones.js';

const RUTA_CLAVE = '/home/claude/.secrets/anthropic_key';
const MODELO_VENDEDOR_DEFAULT = 'claude-haiku-5-5';
const TURNOS_DEFAULT = 15;

/**
 * USD por millón de tokens por modelo: entrada, salida, lectura de caché y escritura de caché, cada uno con su
 * tarifa. Hay que verificarlos en la documentación oficial antes de llenar esta tabla; un modelo sin precio se
 * reporta solo en tokens.
 */
interface Precios { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }
const PRECIOS_USD_POR_MTOK: Record<string, Precios> = {};

const usoCero = (): Uso => ({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });
const sumar = (a: Uso, b: Uso): void => {
  a.entrada += b.entrada; a.salida += b.salida; a.cacheLectura += b.cacheLectura; a.cacheEscritura += b.cacheEscritura;
};

/** Texto de uso: tokens y, si el modelo tiene precio en la tabla, el costo aproximado. */
function describirUso(u: Uso, modelo: string): string {
  const tokens = `entrada ${u.entrada} · salida ${u.salida} · caché leída ${u.cacheLectura} · caché escrita ${u.cacheEscritura}`;
  const p = PRECIOS_USD_POR_MTOK[modelo];
  if (p === undefined) return `${tokens} (sin precio configurado para ${modelo}: solo tokens)`;
  const usd =
    (u.entrada * p.entrada + u.salida * p.salida + u.cacheLectura * p.cacheLectura + u.cacheEscritura * p.cacheEscritura) /
    1_000_000;
  return `${tokens} (≈ ${usd.toFixed(3)} USD, caché incluida)`;
}

interface Argumentos { escenarios: Escenario[]; turnos: number; hoy: string }

function leerArgumentos(argv: string[]): Argumentos {
  let id = 'todos';
  let turnos = TURNOS_DEFAULT;
  let hoy = hoyEnMexico();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const valor = argv[i + 1];
    if (a === '--escenario' && valor !== undefined) { id = valor; i += 1; }
    else if (a === '--turnos' && valor !== undefined) { turnos = Number(valor); i += 1; }
    else if (a === '--hoy' && valor !== undefined) { hoy = valor; i += 1; }
    else throw new Error(`Argumento no reconocido: ${a ?? ''}`);
  }
  if (!Number.isInteger(turnos) || turnos < 1) throw new Error('--turnos debe ser un entero mayor o igual a 1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) throw new Error('--hoy debe tener el formato AAAA-MM-DD');
  const escenarios = id === 'todos' ? [...ESCENARIOS] : ESCENARIOS.filter((e) => e.id === id.toUpperCase());
  if (escenarios.length === 0) throw new Error(`Escenario desconocido: ${id}`);
  return { escenarios, turnos, hoy };
}

/** La clave viene de la variable de entorno o del archivo de secretos; nunca se imprime. */
function leerClave(): string {
  const deEntorno = process.env['ANTHROPIC_API_KEY']?.trim();
  if (deEntorno) return deEntorno;
  if (existsSync(RUTA_CLAVE)) {
    const deArchivo = readFileSync(RUTA_CLAVE, 'utf8').trim();
    if (deArchivo) return deArchivo;
  }
  throw new Error('No hay clave de API: define ANTHROPIC_API_KEY o crea el archivo de secretos.');
}

/** Carpeta del paquete (la que contiene package.json), esté el código compilado o no. */
function raizPaquete(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) {
    const padre = dirname(dir);
    if (padre === dir) throw new Error('No se encontró la raíz del paquete');
    dir = padre;
  }
  return dir;
}

interface ResultadoEscenario {
  esc: Escenario; op: Oportunidad; verificaciones: Verificacion[]; error: string | null;
  usoAgente: Uso; usoVendedor: Uso; turnosUsados: number;
}

async function correrEscenario(
  esc: Escenario, cliente: ClienteModelo, args: Argumentos, modeloAgente: string, modeloVendedor: string,
  limpiar: (s: string) => string,
): Promise<ResultadoEscenario> {
  const usoAgente = usoCero();
  const usoVendedor = usoCero();
  let op = crearOportunidad(esc.construirFicha(args.hoy));
  const opciones: OpcionesTurno = {
    cliente, hoy: args.hoy, modelo: modeloAgente,
    // Como en la web: hora del vendedor en la zona del país de la ficha, para el saludo.
    horaLocal: horaLocalPorPais(op.ficha.pais),
    registrarError: (e) => {
      const x = e as { name?: unknown; status?: unknown; message?: unknown } | null;
      console.error(limpiar(`  error de API: ${String(x?.name)} status=${String(x?.status)} ${String(x?.message)}`));
    },
  };
  let error: string | null = null;
  let turnosUsados = 0;

  const aplicar = (r: ResultadoTurno): boolean => {
    sumar(usoAgente, r.uso);
    if (r.error !== null) { error = r.error; return false; }
    op = r.oportunidad;
    return true;
  };

  if (aplicar(await iniciarSesion(op, 'calificar', opciones))) {
    for (let turno = 1; turno <= args.turnos; turno += 1) {
      const actual = op.sesionActual;
      if (actual === null) break;
      let respuesta: string;
      try {
        respuesta = await responderComoVendedor(cliente, esc, actual.transcripcion, modeloVendedor, {
          hoy: args.hoy, registrarUso: (u) => sumar(usoVendedor, u),
        });
      } catch (e) {
        const x = e as { name?: unknown; status?: unknown; message?: unknown };
        error = limpiar(`Falló el vendedor simulado: ${String(x.name)} status=${String(x.status)} ${String(x.message)}`);
        break;
      }
      if (respuesta === '') {
        error = 'El vendedor simulado no respondió (respuesta vacía tras un reintento); el escenario se detuvo.';
        break;
      }
      const { mensaje, fin } = interpretarRespuestaVendedor(respuesta);
      const cerrar = fin || turno === args.turnos;
      turnosUsados = turno;
      if (!aplicar(await ejecutarTurno(op, mensaje, { ...opciones, cerrar }))) break;
      if (cerrar) break;
    }
  }
  return { esc, op, verificaciones: verificar(esc, op), error, usoAgente, usoVendedor, turnosUsados };
}

const marca = (ok: boolean): string => (ok ? '✅' : '❌');
const fallo = (r: ResultadoEscenario): boolean => r.error !== null || r.verificaciones.some((v) => !v.ok);

function dialogo(op: Oportunidad): string[] {
  const linea = (m: Mensaje): string => `**${m.rol === 'agente' ? 'Agente' : 'Vendedor'}:** ${m.texto}`;
  const salida: string[] = [];
  op.sesiones.forEach((s, i) => {
    salida.push(`### Sesión ${i + 1} (${s.fecha}, ${s.modo})`, '', ...(s.transcripcion ?? []).map(linea).flatMap((l) => [l, '']));
    salida.push(`*Resumen del agente:* ${s.resumen}`, '');
  });
  if (op.sesionActual !== null) {
    salida.push('### Sesión en curso (sin cerrar)', '', ...op.sesionActual.transcripcion.map(linea).flatMap((l) => [l, '']));
  }
  return salida;
}

function informe(r: ResultadoEscenario, args: Argumentos, modeloAgente: string, modeloVendedor: string): string {
  const d = r.op.ultimoDiagnostico;
  const influenciasE = r.op.expediente.influencias.filter((i) => i.roles.includes('E')).map((i) => i.nombre);
  return [
    `# Evaluación ${r.esc.id}: ${r.esc.titulo}`,
    '',
    `- Fecha (hoy): ${args.hoy}`,
    `- Modelo del agente: ${modeloAgente} · Modelo del vendedor simulado: ${modeloVendedor}`,
    `- Mensajes del vendedor: ${r.turnosUsados} de máximo ${args.turnos}`,
    `- Resultado: ${marca(!fallo(r))}`,
    ...(r.error !== null ? ['', `**Error:** ${r.error}`] : []),
    '',
    '## Verificaciones',
    '',
    ...r.verificaciones.map((v) => `- ${marca(v.ok)} \`${v.nombre}\`: ${v.detalle}`),
    '',
    '## Informativo (no es una verificación)',
    '',
    `- Influencias registradas con rol E: ${influenciasE.length > 0 ? influenciasE.join(', ') : 'ninguna'}.`,
    d === null
      ? '- Diagnóstico: ninguno.'
      : `- Diagnóstico: semáforo ${d.indice.semaforo}, índice ${d.indice.total}/100, banderas: ${d.banderas.map((b) => b.id).join(', ') || 'ninguna'}.`,
    '',
    '## Uso de tokens',
    '',
    `- Agente: ${describirUso(r.usoAgente, modeloAgente)}`,
    `- Vendedor simulado: ${describirUso(r.usoVendedor, modeloVendedor)}`,
    '',
    '## Transcripción',
    '',
    ...dialogo(r.op),
  ].join('\n');
}

async function main(): Promise<number> {
  const args = leerArgumentos(process.argv.slice(2));
  const clave = leerClave();
  const limpiar = (s: string): string => s.split(clave).join('[clave]');
  const cliente = crearClienteAnthropic(clave);
  const modeloAgente = process.env['MODELO_AGENTE'] ?? MODELO_DEFAULT;
  const modeloVendedor = process.env['MODELO_VENDEDOR'] ?? MODELO_VENDEDOR_DEFAULT;
  const carpeta = join(raizPaquete(), 'evals', 'informes');
  mkdirSync(carpeta, { recursive: true });

  const totalAgente = usoCero();
  const totalVendedor = usoCero();
  let fallaron = 0;
  for (const esc of args.escenarios) {
    console.log(`\n${esc.id}: ${esc.titulo}`);
    const r = await correrEscenario(esc, cliente, args, modeloAgente, modeloVendedor, limpiar);
    const archivo = join(carpeta, `${args.hoy}-${esc.id}.md`);
    writeFileSync(archivo, limpiar(informe(r, args, modeloAgente, modeloVendedor)));
    sumar(totalAgente, r.usoAgente);
    sumar(totalVendedor, r.usoVendedor);
    if (r.error !== null) console.log(`  ❌ error: ${r.error}`);
    for (const v of r.verificaciones) console.log(`  ${marca(v.ok)} ${v.nombre}: ${v.detalle}`);
    console.log(`  informe: ${archivo}`);
    if (fallo(r)) fallaron += 1;
  }
  console.log(`\nAgente (${modeloAgente}): ${describirUso(totalAgente, modeloAgente)}`);
  console.log(`Vendedor simulado (${modeloVendedor}): ${describirUso(totalVendedor, modeloVendedor)}`);
  console.log(`${marca(fallaron === 0)} ${args.escenarios.length - fallaron} de ${args.escenarios.length} escenarios sin fallas`);
  return fallaron === 0 ? 0 : 1;
}

main().then(
  (codigo) => { process.exitCode = codigo; },
  (e: unknown) => {
    console.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    process.exitCode = 1;
  },
);
