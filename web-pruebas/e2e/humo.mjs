// Prueba de humo del laboratorio: sirve la compilación (`npm run build -w web-pruebas-sales-agent` antes),
// con el modelo falso, y recorre el flujo principal en Chromium. Sin red hacia la API de Anthropic.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright viene preinstalado en el entorno (no es dependencia del repositorio) y se encuentra por NODE_PATH,
// que solo respeta `require`; por eso no se usa `import ... from 'playwright'`.
const { chromium } = createRequire(import.meta.url)('playwright');

const aqui = dirname(fileURLToPath(import.meta.url));
const webDir = join(aqui, '..');
const CLAVE = 'prueba';
const ANCHO_MOVIL = 390;
const MARCA_MODELO_FALSO = '(modo de prueba)';

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function esperarServidor(base, salida) {
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${base}/acceso`);
      if (r.ok) return;
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`El servidor no respondió en 60 s. Salida:\n${salida()}`);
}

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(`Falló: ${mensaje}`);
}

const paso = (texto) => console.log(`- ${texto}`);

async function main() {
  const puerto = await puertoLibre();
  const base = `http://127.0.0.1:${puerto}`;
  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  let bitacora = '';
  const servidor = spawn(process.execPath, [next, 'start', '-p', String(puerto), '-H', '127.0.0.1'], {
    cwd: webDir,
    env: { ...process.env, MODELO_FALSO: '1', CLAVE_PRUEBAS: CLAVE, ANTHROPIC_API_KEY: '', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stdout.on('data', (d) => { bitacora += d; });
  servidor.stderr.on('data', (d) => { bitacora += d; });
  const terminado = new Promise((resolve) => servidor.once('exit', resolve));

  let navegador;
  try {
    await esperarServidor(base, () => bitacora);
    paso(`servidor listo en ${base}`);

    navegador = await chromium.launch();
    const contexto = await navegador.newContext({ viewport: { width: ANCHO_MOVIL, height: 844 }, hasTouch: true, isMobile: true });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
    pagina.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

    // Acceso con contraseña
    await pagina.goto(base);
    await pagina.waitForURL('**/acceso');
    await pagina.getByLabel('Contraseña').fill(CLAVE);
    await pagina.getByRole('button', { name: 'Entrar' }).click();
    await pagina.waitForURL(`${base}/`);
    await pagina.getByRole('heading', { name: 'Laboratorio de pruebas' }).waitFor();
    paso('acceso con contraseña');

    // Escenario E1: tarjeta de papel e inicio de sesión
    const agente = pagina.locator('.burbuja-agente');
    const saludo = agente.filter({ hasText: '¿Cuál es el estatus del negocio?' });
    await pagina.getByLabel('Oportunidad').selectOption({ index: 0 });
    await pagina.getByText('Tu papel', { exact: true }).waitFor();
    await pagina.getByText('Eres Mariana Beltrán').waitFor();
    await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await agente.filter({ hasText: MARCA_MODELO_FALSO }).first().waitFor({ timeout: 20_000 });
    paso('E1 inició y el agente saludó');

    // Un mensaje del vendedor y la segunda respuesta
    await pagina.getByLabel('Tu mensaje').fill('Hola');
    await pagina.getByRole('button', { name: 'Enviar' }).click();
    await agente.filter({ hasText: MARCA_MODELO_FALSO }).nth(1).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).count() === 1, 'el mensaje del vendedor aparece una vez');
    paso('segunda respuesta recibida');

    // Panel con semáforo
    const semaforo = pagina.locator('.semaforo');
    await semaforo.waitFor();
    afirmar(/Verde|Ámbar|Rojo/.test(await semaforo.innerText()), 'el semáforo dice Verde, Ámbar o Rojo');
    afirmar((await pagina.locator('.diagnostico').innerText()).includes('BANT'), 'el panel muestra BANT');
    paso(`panel con semáforo (${(await semaforo.innerText()).split('\n')[0]})`);

    // Terminar sesión: el modelo falso cierra con cerrar_sesion; la conversación queda de solo lectura
    await pagina.getByRole('button', { name: 'Terminar sesión' }).click();
    await agente.filter({ hasText: 'Sesión cerrada. (modo de prueba)' }).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).count() === 1, 'la conversación sigue visible tras terminar');
    afirmar(await pagina.locator('.chat-encabezado').count() === 1, 'la sesión cerrada tiene su encabezado');
    afirmar(await pagina.getByLabel('Tu mensaje').isDisabled(), 'el campo queda deshabilitado sin sesión abierta');
    afirmar(await pagina.getByRole('button', { name: 'Terminar sesión' }).isDisabled(), '"Terminar sesión" queda deshabilitado');
    afirmar(await pagina.getByRole('button', { name: 'Iniciar sesión nueva' }).count() === 0, 'sin sesión abierta no se ofrece "Iniciar sesión nueva"');
    paso('terminar sesión cierra y conserva la conversación en solo lectura');

    // Iniciar sesión sobre la misma oportunidad: saludo nuevo con la sesión pasada arriba
    await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await saludo.nth(1).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.chat-encabezado').count() === 2, 'la sesión pasada sigue arriba de la nueva');
    afirmar(await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).count() === 1, 'el "Hola" de la sesión pasada sigue visible');
    afirmar(await pagina.getByLabel('Tu mensaje').isEnabled(), 'el campo se habilita con la sesión nueva');
    paso('nueva sesión sobre la misma oportunidad, con la anterior arriba');

    // Sesión abierta: "Iniciar sesión nueva" pide confirmación en la página (sin window.confirm)
    pagina.on('dialog', (d) => { throw new Error(`Apareció un diálogo del navegador: ${d.message()}`); });
    await pagina.getByRole('button', { name: 'Iniciar sesión nueva' }).click();
    const confirmacion = pagina.getByRole('group', { name: 'Confirmar nueva sesión' });
    await confirmacion.getByText('La sesión abierta se guardará como interrumpida. ¿Iniciar una nueva?').waitFor();
    await confirmacion.getByRole('button', { name: 'Cancelar' }).click();
    await confirmacion.waitFor({ state: 'detached' });
    afirmar(await saludo.count() === 2, 'cancelar no inicia otra sesión');
    await pagina.getByRole('button', { name: 'Iniciar sesión nueva' }).click();
    await confirmacion.getByRole('button', { name: 'Sí, iniciar' }).click();
    await saludo.nth(2).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.chat-encabezado').count() === 3, 'la sesión interrumpida queda archivada arriba');
    paso('confirmación en línea: cancelar no hace nada y "Sí, iniciar" archiva la abierta y empieza otra');

    // Lo guardado sobrevive a una recarga
    await pagina.reload();
    await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).waitFor();
    afirmar(await pagina.locator('.chat-encabezado').count() === 3, 'tras recargar siguen las 3 sesiones');
    paso('la oportunidad se recupera tras recargar');

    // Nueva oportunidad: no pisa un ID existente; el TCV acepta comas; la ficha completa inicia sesión
    const selector = pagina.locator('.lab-controles select').first();
    const campo = (texto) => pagina.locator('.ficha label', { hasText: texto }).locator('input, select').first();
    await selector.selectOption('nueva');
    await campo('ID del CRM').fill('OPP-2026-0412');
    await campo('Cliente').fill('Cliente de humo');
    await campo('Oportunidad').fill('WMS de humo');
    await campo('Tipo').selectOption('NN');
    await pagina.getByLabel('WMS (almacenes)').check();
    await campo('Fecha de cierre').fill('2027-12-31');
    await campo('¿Es RFP?').selectOption('no');
    await campo('TCV').fill('380.000');
    await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await pagina.getByText('El TCV es ambiguo').waitFor();
    await campo('TCV').fill('450,000');
    await pagina.getByText('= 450,000 USD').waitFor();
    afirmar(await pagina.evaluate(() => document.documentElement.scrollWidth) <= ANCHO_MOVIL, 'el formulario no desborda a 390 px');
    await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await pagina.getByText('Ya existe una oportunidad con ese ID del CRM').waitFor();
    await campo('ID del CRM').fill('OPP-HUMO-1');
    await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await pagina.getByLabel('Tu mensaje').waitFor({ timeout: 20_000 });
    await saludo.first().waitFor({ timeout: 20_000 });
    afirmar(await selector.inputValue() === 'op:OPP-HUMO-1', 'la oportunidad nueva queda seleccionada');
    paso('oportunidad nueva: TCV ambiguo rechazado, monto entendido visible, ID repetido rechazado y ficha completa aceptada');

    // Móvil: captura y sin scroll horizontal
    await pagina.screenshot({ path: join(aqui, 'humo-movil.png'), fullPage: true });
    const ancho = await pagina.evaluate(() => document.documentElement.scrollWidth);
    afirmar(ancho <= ANCHO_MOVIL, `scrollWidth ${ancho} supera ${ANCHO_MOVIL}`);
    paso(`sin scroll horizontal a ${ANCHO_MOVIL} px (scrollWidth ${ancho})`);

    // Escritorio: dos columnas
    await pagina.setViewportSize({ width: 1280, height: 800 });
    const chat = await pagina.locator('.chat').boundingBox();
    const panel = await pagina.locator('.panel').boundingBox();
    afirmar(chat !== null && panel !== null && panel.x >= chat.x + chat.width - 1, 'a 1280 px el panel queda a la derecha del chat');
    afirmar(Math.abs(chat.y - panel.y) < 40, 'a 1280 px chat y panel empiezan a la misma altura');
    afirmar(await pagina.locator('.panel [aria-expanded]').count() === 0, 'a 1280 px el título del panel no es un botón plegable');
    await pagina.getByRole('heading', { name: 'Diagnóstico' }).waitFor();
    paso('dos columnas a 1280 px');

    afirmar(errores.length === 0, `errores en la consola del navegador:\n${errores.join('\n')}`);
    console.log('HUMO OK');
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    servidor.kill('SIGTERM');
    const forzar = setTimeout(() => servidor.kill('SIGKILL'), 5000);
    await terminado;
    clearTimeout(forzar);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
