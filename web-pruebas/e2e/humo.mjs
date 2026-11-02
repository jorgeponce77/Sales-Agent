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
    await pagina.getByLabel('Oportunidad').selectOption({ index: 0 });
    await pagina.getByText('Tu papel', { exact: true }).waitFor();
    await pagina.getByText('Eres Mariana Beltrán').waitFor();
    await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
    await pagina.locator('.burbuja-agente', { hasText: MARCA_MODELO_FALSO }).first().waitFor({ timeout: 20_000 });
    paso('E1 inició y el agente saludó');

    // Un mensaje del vendedor y la segunda respuesta
    await pagina.getByLabel('Tu mensaje').fill('Hola');
    await pagina.getByRole('button', { name: 'Enviar' }).click();
    await pagina.locator('.burbuja-agente', { hasText: MARCA_MODELO_FALSO }).nth(1).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).count() === 1, 'el mensaje del vendedor aparece una vez');
    paso('segunda respuesta recibida');

    // Panel con semáforo
    const semaforo = pagina.locator('.semaforo');
    await semaforo.waitFor();
    afirmar(/Verde|Ámbar|Rojo/.test(await semaforo.innerText()), 'el semáforo dice Verde, Ámbar o Rojo');
    afirmar((await pagina.locator('.diagnostico').innerText()).includes('BANT'), 'el panel muestra BANT');
    paso(`panel con semáforo (${(await semaforo.innerText()).split('\n')[0]})`);

    // Terminar sesión: la conversación sigue visible
    await pagina.getByRole('button', { name: 'Terminar sesión' }).click();
    await pagina.locator('.burbuja-agente', { hasText: MARCA_MODELO_FALSO }).nth(2).waitFor({ timeout: 20_000 });
    afirmar(await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).count() === 1, 'la conversación sigue visible tras terminar');
    afirmar(await pagina.locator('.burbuja-agente', { hasText: MARCA_MODELO_FALSO }).count() >= 3, 'las respuestas previas siguen visibles');
    paso('terminar sesión conserva la conversación');

    // Lo guardado sobrevive a una recarga
    await pagina.reload();
    await pagina.locator('.burbuja-propia', { hasText: 'Hola' }).waitFor();
    paso('la oportunidad se recupera tras recargar');

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
