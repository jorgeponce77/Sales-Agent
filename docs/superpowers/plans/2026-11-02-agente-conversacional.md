# Agente Conversacional y Página de Prueba — Plan de Implementación (Plan 3 de la v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el agente de ventas (Claude + herramientas conectadas al motor de reglas), sus 5 escenarios simulados y sus evaluaciones con vendedores simulados, más una página web de prueba protegida con contraseña y desplegada en Vercel, donde George conversa con el agente y ve el diagnóstico en vivo.

**Architecture:** Monorepo con npm workspaces: `motor/` (ya existe), `agente/` (librería TypeScript) y `web-pruebas/` (Next.js). El servidor no guarda estado. El navegador conserva la `Oportunidad` (ficha, expediente, sesiones) en `localStorage` y la envía en cada turno a `/api/turno`. El servidor la revalida, ejecuta el turno del agente con un ciclo de herramientas acotado y devuelve la oportunidad actualizada junto con el diagnóstico del motor. El agente nunca calcula: todo número, veredicto o bandera sale del motor.

**Tech Stack:** Node 22 · TypeScript 5 (strict) · npm workspaces · Vitest · `@anthropic-ai/sdk` ^1.3.0 · Next.js ^16.4 + React ^19.3 · Playwright (ya instalado en el entorno, solo para la prueba de humo) · Vercel.

**Spec:** `docs/superpowers/specs/2026-11-02-agente-conversacional-design.md` (anexo del Plan 3, manda en este plan), complementado por `docs/superpowers/specs/2026-10-31-sales-agent-design.md` §4, §5 y §8 y por `docs/conocimiento/01..03`.

## Global Constraints

- Paquetes: `motor-sales-agent` (existente, en `motor/`), `agente-sales-agent` (`agente/`) y `web-pruebas-sales-agent` (`web-pruebas/`). La raíz `package.json` declara `"workspaces": ["motor", "agente", "web-pruebas"]`.
- `motor` y `agente` se compilan a `dist/` con `tsc`. Su `package.json` declara `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }`, y los demás paquetes los consumen por nombre, nunca por ruta relativa.
- Modelo por defecto `claude-sonnet-5-5`, configurable con la variable `MODELO_AGENTE` · `max_tokens` 1024 por llamada · máximo **8 llamadas a herramientas** por mensaje del vendedor · máximo **40 mensajes del vendedor** por sesión · mensaje del vendedor de **4000 caracteres** como máximo.
- Fechas en ISO `YYYY-MM-DD`. "Hoy" lo pone el servidor en la zona `America/Mexico_City`. Nunca se toma del navegador.
- El agente responde en el idioma del vendedor. Todo lo que registra (declaraciones, resúmenes, textos de eventos) va en **español**.
- La clave de la API vive solo en el servidor (`ANTHROPIC_API_KEY`): nunca va al navegador, nunca se escribe en logs y nunca entra al repositorio. `.env*` y `.secrets/` van en `.gitignore`.
- El servidor no persiste nada. No hay base de datos.
- Ninguna herramienta lanza excepciones hacia el modelo: los errores vuelven como `{ ok: false, errores: string[] }` en español.
- Toda escritura al expediente se aplica sobre una copia y se valida con `validarExpediente` del motor antes de conservarse.
- Escenarios con empresas y personas **ficticias**.
- Las evaluaciones con la API real consumen saldo. **No** forman parte de `npm test`; se corren con `npm run evals -w agente-sales-agent`.
- Commits con `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit` y los trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01XncV6pCTZjoWBQUjhixeXW`.

## Review Focus

1. **El navegador envía una `Oportunidad` corrupta, de un formato viejo o incompleta.** `/api/turno` responde 400 con un mensaje claro en español y nunca 500. La página ofrece "Reiniciar" cuando el formato guardado no coincide → tests en Task 8 y Task 9.
2. **La API de Anthropic falla a media conversación** (error de red, 429, 529 o saldo insuficiente). El vendedor recibe un mensaje amable, la oportunidad queda **exactamente igual** que antes del turno (sin escrituras parciales de herramientas) y el texto no expone detalles internos → test en Task 5.
3. **El modelo llama una herramienta con datos mal formados** (tipos incorrectos, campo fuera de la lista blanca, herramienta inexistente, `nivel: "Confirmado"`). La herramienta devuelve un error y el ciclo continúa sin romperse → tests en Task 2, Task 3 y Task 5.
4. **El vendedor manda un mensaje vacío o enorme** (pega un correo de 20 mil caracteres). Un mensaje vacío se ignora; uno de más de 4000 caracteres se rechaza con un aviso y no gasta saldo → tests en Task 5 y Task 8.
5. **La sesión se cierra sin datos** (el vendedor pide terminar al primer mensaje, o se llega al tope de 40 mensajes). El cierre produce el resumen y el diagnóstico de un expediente casi vacío sin fallar → test en Task 5.

---

## File Structure

```
package.json                      # raíz: workspaces + scripts build:paquetes, test
motor/                            # existente; Task 1 agrega build a dist/ y exports
agente/
  package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts
  src/
    tipos.ts                      # Ficha, Oportunidad, Evento, ModoSesion, ResultadoTurno…
    ficha.ts                      # crearOportunidad, fichaAExpediente, convertirAUSD
    herramientas/
      escritura.ts                # aplicarEscritura (copia + validar + evento)
      registrar.ts                # registrar_dato, _criterio_argano, _influencia, _alternativa, actualizar_cadena_cierre, actualizar_ficha
      consulta.ts                 # leer_expediente, obtener_huecos_priorizados, calcular_diagnostico
      acciones.ts                 # proponer_acciones, marcar_accion, cerrar_sesion
      deQuien.ts                  # tabla reglaId → "de quién"
      definiciones.ts             # esquemas JSON de las 12 herramientas para la API
      ejecutar.ts                 # ejecutarHerramienta (dispatcher)
    instrucciones/
      base.ts                     # texto fijo (rol, metodología, reglas de conversación)
      construir.ts                # construirInstrucciones → {fijo, variable, version}
    conversacion/
      cliente.ts                  # interfaz ClienteModelo + crearClienteAnthropic
      turno.ts                    # iniciarSesion, ejecutarTurno
      transcripcion.ts            # formatearTranscripcion
    escenarios/
      E1.ts … E5.ts  index.ts     # ESCENARIOS
    index.ts
  evals/
    vendedorSimulado.ts  verificaciones.ts  correr.ts
    informes/                     # (gitignored)
  tests/  *.test.ts  fabrica.ts  clienteFalso.ts
web-pruebas/
  package.json  next.config.ts  tsconfig.json  vitest.config.ts
  app/layout.tsx  app/page.tsx  app/globals.css
  app/acceso/page.tsx  app/api/acceso/route.ts  app/api/turno/route.ts
  lib/sesion.ts  lib/clienteServidor.ts  lib/almacenNavegador.ts  lib/hoy.ts
  components/Laboratorio.tsx  Chat.tsx  PanelDiagnostico.tsx  FichaNueva.tsx  TarjetaPapel.tsx
  tests/*.test.ts  e2e/humo.mjs
```

---

### Task 1: Monorepo, compilación del motor y modelo de datos del agente

**Files:**
- Create: `package.json` (raíz), `agente/package.json`, `agente/tsconfig.json`, `agente/tsconfig.build.json`, `agente/vitest.config.ts`, `agente/src/tipos.ts`, `agente/src/ficha.ts`, `agente/src/index.ts`, `agente/tests/fabrica.ts`, `agente/tests/ficha.test.ts`
- Modify: `motor/package.json` (script `build`, `exports`, `files`), `motor/tsconfig.build.json` (nuevo), `motor/src/index.ts` (exportar también `fechaValida`), `.gitignore` (agregar `dist/`, `.env*`, `.secrets/`, `agente/evals/informes/`, `.next/`)

**Interfaces:**
- Consumes (motor): `Expediente`, `Linea`, `TipoOportunidad`, `Etapa`, `Diagnostico`, `Config`, `CONFIG_DEFAULT`, `validarExpediente`, `fechaValida`.
- Produces (`agente/src/tipos.ts`):

```ts
import type { Expediente, Linea, TipoOportunidad, Diagnostico } from 'motor-sales-agent';
export type ModoSesion = 'calificar' | 'revision_rapida';
export interface Ficha {
  idCRM: string; cliente: string; oportunidad: string; pais: string; lineas: Linea[];
  tipo: TipoOportunidad | null; etapaCRM: number;            // 0..8
  tcv: number; moneda: string; fechaCreacion: string; fechaCierreCRM: string; vendedor: string;
  probabilidadCRM: number | null; esRFP: boolean | null; ultimaActualizacionCRM: string | null;
}
export interface Evento { tipo: 'dato' | 'rechazo' | 'ficha' | 'accion' | 'sesion' | 'error'; descripcion: string; fecha: string }
export interface Mensaje { rol: 'vendedor' | 'agente'; texto: string; fecha: string }
export interface ResumenSesion { fecha: string; modo: ModoSesion; resumen: string; versionInstrucciones: string }
export interface SesionActual {
  modo: ModoSesion; inicio: string; turnosVendedor: number; versionInstrucciones: string;
  historial: unknown[];        // MessageParam[] de la API, tal cual (incluye bloques tool_use/tool_result)
  transcripcion: Mensaje[];    // lo que ve el usuario
}
export interface Oportunidad {
  formato: 1; id: string; ficha: Ficha; cerrada: boolean;    // cerrada = ficha.etapaCRM >= 6
  expediente: Expediente; sesiones: ResumenSesion[]; sesionActual: SesionActual | null;
  ultimoDiagnostico: Diagnostico | null; eventos: Evento[];
}
export interface Uso { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }
export interface ResultadoTurno { respuestas: string[]; oportunidad: Oportunidad; diagnostico: Diagnostico | null; eventos: Evento[]; uso: Uso; error: string | null }
export type TiposCambio = Record<string, number>;          // moneda → USD por unidad; por defecto { USD: 1 }
export const TIPOS_CAMBIO_DEFAULT: TiposCambio;            // { USD: 1 }
```

- Produces (`agente/src/ficha.ts`):
  - `validarFicha(f: unknown): string[]`: errores en español. Se exigen los 8 obligatorios: cliente, oportunidad, pais (2 letras mayúsculas), lineas (≥1, valores válidos), tcv (número ≥0), moneda (3 letras mayúsculas), etapaCRM (entero 0..8) y fechaCierreCRM (`fechaValida`). `fechaCreacion` y `vendedor` también deben ser válidos.
  - `convertirAUSD(tcv: number, moneda: string, tc: TiposCambio): number | null`: null si no hay tipo de cambio.
  - `fichaAExpediente(f: Ficha, tc: TiposCambio): Expediente`:
    - Parte de un expediente vacío equivalente a la fábrica del motor: evidencias ausentes, booleanos en false, `clienteIdeal` con 5 elementos ausentes y `cadena.ruta` `'desconocida'`.
    - `etapaCRM = min(f.etapaCRM, 5)`; `montoUSD = convertirAUSD(...)`; `esRFP = f.esRFP ?? false`.
    - `tipo` EE → `esChangeOrder: true` y `esClienteNetlogistik: true` · EN → `esClienteNetlogistik: true` · ENxT → `esClienteOtraTowerArgano: true` · null o NN → todo en false.
  - `crearOportunidad(f: Ficha, tc: TiposCambio = TIPOS_CAMBIO_DEFAULT): Oportunidad`: `id = f.idCRM`, `cerrada = f.etapaCRM >= 6`, sin sesiones.

- [ ] **Step 1: Raíz y motor compilable.** Crear la raíz `package.json` (`private`, workspaces, scripts `build:paquetes`: `npm run build -w motor-sales-agent -w agente-sales-agent`, `test`: `npm run build:paquetes && npm test --workspaces --if-present`). Agregar a `motor/`: `tsconfig.build.json` (extiende `tsconfig.json`, `outDir dist`, `declaration true`, `include ["src"]`), el script `"build": "tsc -p tsconfig.build.json"`, `exports` y `"files": ["dist"]`. Exportar `fechaValida` en `motor/src/index.ts`. Ejecutar `npm install` en la raíz y después `npm run build -w motor-sales-agent` → Expected: `motor/dist/index.js` y `index.d.ts` existen. Los 407 tests del motor siguen pasando.
- [ ] **Step 2: Esqueleto de `agente/`** con las mismas convenciones que `motor/` (`type: module`, TS strict, `noUncheckedIndexedAccess`, NodeNext, Vitest), con dependencia `"motor-sales-agent": "*"` y dependencia de runtime `@anthropic-ai/sdk@^1.3.0` (se usa a partir de Task 5).
- [ ] **Step 3: Tests que fallan** en `agente/tests/ficha.test.ts`, con la fábrica `fichaBase(over?)` en `agente/tests/fabrica.ts` (WMS, MX, etapa 2, TCV 450000 USD, cierre `2027-03-31`, creación `2026-10-01`, vendedor `prueba@netlogistik.test`):
  - `ficha_valida_sin_errores`: `validarFicha(fichaBase())` → `[]`.
  - `ficha_rechaza_campos`: `pais 'Mexico'`, `lineas []`, `etapaCRM 9`, `fechaCierreCRM '31/03/2027'` y `moneda 'usd'` → un error por cada campo, en español.
  - `convertir_sin_tipo_de_cambio`: `convertirAUSD(100,'MXN',{USD:1}) === null` · `convertirAUSD(100,'MXN',{USD:1, MXN:0.05}) === 5`.
  - `tipo_a_banderas`: EE → `esChangeOrder` y `esClienteNetlogistik` en true · ENxT → solo `esClienteOtraTowerArgano` · null → todo en false.
  - `etapa_cerrada`: `crearOportunidad(fichaBase({etapaCRM:7}))` → `cerrada true` y `expediente.etapaCRM 5`.
  - `expediente_resultante_valido`: `validarExpediente(fichaAExpediente(fichaBase(), TIPOS_CAMBIO_DEFAULT))` → `[]`.
- [ ] **Step 4: Ejecutar** `npm test -w agente-sales-agent` → FAIL (no existe `ficha.ts`). **Step 5: Implementar.** **Step 6:** `npm run build:paquetes && npm test --workspaces` → PASS. `tsc --noEmit` sin errores en ambos paquetes.
- [ ] **Step 7: Commit** `feat(agente): monorepo, motor compilable y modelo de datos de la oportunidad`

---

### Task 2: Herramientas de escritura

**Files:**
- Create: `agente/src/herramientas/escritura.ts`, `agente/src/herramientas/registrar.ts`, `agente/tests/registrar.test.ts`

**Interfaces:**
- Consumes: `Oportunidad`, `Evento`, `validarExpediente`, `CONFIG_DEFAULT.criteriosArgano`, `validarFicha`, `fichaAExpediente` (para recalcular `montoUSD` en `actualizar_ficha`).
- Produces:

```ts
export interface EstadoTurno { oportunidad: Oportunidad; hoy: string; eventos: Evento[]; tiposCambio: TiposCambio; sesionCerrada: { resumen: string } | null }
export type ResultadoHerramienta = { ok: true; datos?: unknown; mensaje?: string } | { ok: false; errores: string[] };
export function aplicarEscritura(estado: EstadoTurno, descripcion: string, mutar: (exp: Expediente) => void): ResultadoHerramienta;
// registrar.ts — todas con firma (estado: EstadoTurno, input: unknown) => ResultadoHerramienta
export const registrarDato, registrarCriterioArgano, registrarInfluencia, registrarAlternativa, actualizarCadenaCierre, actualizarFicha;
export const CAMPOS_REGISTRABLES: readonly string[];   // lista blanca del anexo §5, exacta
```

- `aplicarEscritura`:
  - Hace `structuredClone` del expediente, aplica `mutar` y ejecuta `validarExpediente`.
  - Si hay errores: **no** conserva nada, agrega un evento `rechazo` y devuelve `{ok:false, errores}` con el formato `"campo: mensaje"`.
  - Si es válido: reemplaza `estado.oportunidad.expediente`, agrega un evento `dato` con `descripcion` y `fecha = estado.hoy`.
  - Si `mutar` lanza una excepción: la convierte en `{ok:false}`.
- `registrarDato {campo, valor, nivel?, fuente?}`:
  - `campo` debe estar en `CAMPOS_REGISTRABLES`; si no, el error es `"campo no registrable: X"`.
  - Para campos `Evidencia`, `nivel` es obligatorio y se escribe `{valor, nivel, fuente, fecha: nivel==='confirmado' ? hoy : undefined}`. Para booleanos y escalares, `nivel` y `fuente` se ignoran.
  - `cuenta.clienteIdeal.N` acepta N de 0 a 4.
- `registrarCriterioArgano {clave, nivel}`: la clave debe existir en `CONFIG_DEFAULT.criteriosArgano`. Si ya hay una entrada con la misma `clave`, se **reemplaza**; si no, se agrega.
- `registrarInfluencia {personaId?, nombre, ...}`:
  - Busca primero por `personaId`; si no lo hay, por `normalizar(nombre)` (minúsculas, sin acentos, espacios colapsados).
  - Si la encuentra, hace un merge de los campos presentes. Si es nueva, crea `personaId = 'p-' + normalizar(nombre)` con defaults: `roles [], grado null, modo null, calificacion null, contactada false, nuevaEnPuesto false, trDeclaracion null, prioridad null`.
- `registrarAlternativa {tipo, nombre?, posicion?}`: crea o actualiza buscando por `tipo` + `normalizar(nombre ?? '')`. Además pone `preguntaCompetenciaHecha = true`.
- `actualizarCadenaCierre {ruta?, requiereSOW?, pasos?}`: merge parcial. Las claves de `pasos` válidas son `aElegido`, `bContratoEnviado`, `cComentariosRecibidos`, `dEnFirma`, `eFirmado`, `fAltaProveedor` y `hOC`; cualquier otra → error.
- `actualizarFicha {campo, valor}`:
  - Solo acepta `etapaCRM`, `fechaCierreCRM`, `tcv` y `moneda`.
  - Valida la ficha resultante con `validarFicha`, sincroniza el expediente (etapa ≤5, fecha, `montoUSD`) y valida.
  - Agrega un evento `ficha` con el valor anterior y el nuevo, por ejemplo `"Etapa CRM 3 → 4 (dicho por el vendedor)"`.

- [ ] **Step 1: Tests que fallan** (fábrica: `estadoBase()` con la oportunidad de `fichaBase()` y hoy `2026-11-02`):
  - `dato_bant_confirmado`: `registrarDato({campo:'bant.budget', valor:'USD 500k aprobados', nivel:'confirmado', fuente:'CFO'})` → ok; la evidencia tiene `fecha '2026-11-02'` y hay un evento `dato`.
  - `dato_reemplaza`: registrar dos veces `bant.need` → queda un solo valor, el último.
  - `campo_fuera_de_lista`: `campo 'montoUSD'` → `{ok:false}` con `"campo no registrable"`.
  - `nivel_invalido_rechazado` (Review Focus 3): `nivel 'Confirmado'` → `{ok:false}`; el expediente queda igual (comparación profunda) y hay un evento `rechazo`.
  - `criterio_reemplaza_no_duplica`: `fuente_creible` en supuesto y luego en confirmado → una sola entrada, confirmada.
  - `criterio_clave_inexistente` → error.
  - `influencia_merge_por_nombre`: "José Pérez" y luego "jose  perez" con `contactada:true` → una sola influencia con `contactada true`.
  - `influencia_calificacion_cero` → rechazada por el motor.
  - `alternativa_marca_pregunta`: después de registrar → `preguntaCompetenciaHecha true`.
  - `cadena_paso_desconocido` → error.
  - `ficha_actualiza_etapa_y_evento`: etapa 2 → 3 → `expediente.etapaCRM 3` y evento `ficha` con `"2 → 3"`.
  - `ficha_campo_no_permitido`: `campo 'cliente'` → error.
  - `input_basura` (Review Focus 3): `registrarDato(estado, null)` y `registrarDato(estado, {campo: 5})` → `{ok:false}` sin excepción.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(agente): herramientas de escritura con validación del motor`

---

### Task 3: Herramientas de consulta, acciones, "de quién", definiciones y dispatcher

**Files:**
- Create: `agente/src/herramientas/consulta.ts`, `acciones.ts`, `deQuien.ts`, `definiciones.ts`, `ejecutar.ts`, `agente/tests/consulta-acciones.test.ts`, `agente/tests/ejecutar.test.ts`

**Interfaces:**
- Consumes: `EstadoTurno`, `ResultadoHerramienta`, el registro de Task 2, y del motor `calcularDiagnostico`, `validarAcciones`, `CATALOGO_REGLAS`.
- Produces:
  - `leerExpediente(estado)` → `{ok:true, datos:{ficha, expediente, accionesAbiertas}}`.
  - `obtenerHuecos(estado)` → `{ok:true, datos: HuecoConDeQuien[]}`, con `interface HuecoConDeQuien { reglaId; severidad; motivo; deQuien: string | null }`.
  - `calcularDiagnosticoHerramienta(estado)` → `{ok:true, datos: Diagnostico}` (llama `calcularDiagnostico(exp, hoy)`).
  - `proponerAcciones(estado, input)`: valida con `validarAcciones` usando las banderas y fortalezas del diagnóstico vigente. Agrega las aceptadas a `accionesPrevias` con estado `'abierta'` (por `aplicarEscritura`) y devuelve `{aceptadas, rechazadas}`.
  - `marcarAccion(estado, {indice, estado:'cumplida'|'no_cumplida'})`: el índice se refiere a `accionesPrevias`.
  - `cerrarSesion(estado, {resumen})`: el resumen debe ser texto no vacío de 600 caracteres como máximo. Pone `estado.sesionCerrada = {resumen}` y agrega un evento `sesion`.
  - `deQuien(reglaId: string, exp: Expediente): string | null`, con la tabla del anexo §6 exacta. Donde dice "+ su nombre", agrega los nombres de las influencias con rol E. `tr_no_redactado` lista los nombres de las de grado A/M sin declaración.
  - `DEFINICIONES_HERRAMIENTAS`: arreglo de 12 objetos `{name, description, input_schema}` con los nombres exactos del anexo §5 (`leer_expediente`, `registrar_dato`, `registrar_criterio_argano`, `registrar_influencia`, `registrar_alternativa`, `actualizar_cadena_cierre`, `actualizar_ficha`, `obtener_huecos_priorizados`, `calcular_diagnostico`, `proponer_acciones`, `marcar_accion`, `cerrar_sesion`). Las `description` van en español y dicen cuándo usar cada herramienta. Los `enum` del esquema coinciden con los tipos del motor y `registrar_dato.campo` usa `enum: CAMPOS_REGISTRABLES`.
  - `ejecutarHerramienta(nombre: string, input: unknown, estado: EstadoTurno): ResultadoHerramienta`. Un nombre desconocido devuelve `{ok:false, errores:['herramienta desconocida: X']}`. Nunca lanza.

- [ ] **Step 1: Tests que fallan:**
  - `huecos_con_de_quien`: un expediente con un E "Ana Ruiz" y budget ausente → el hueco `budget_ausente` tiene `deQuien` que contiene "Ana Ruiz".
  - `de_quien_tr`: 2 influencias A sin declaración → ambos nombres aparecen · `deQuien('fecha_optimista', exp) === null`.
  - `proponer_acepta_y_guarda`: una acción que atiende `sin_economico`, con quién y cuándo `2026-11-10` → aceptada y guardada en `accionesPrevias` como `abierta`.
  - `proponer_rechaza_malformada` (Review Focus 3): una acción con `quien: null` → en `rechazadas`, sin excepción.
  - `marcar_accion_indice_invalido` → error.
  - `cerrar_sesion_requiere_resumen`: `''` → error; con texto → `estado.sesionCerrada` puesto.
  - `definiciones_completas`: 12 nombres únicos, todos despachables. Cada `input_schema.type === 'object'`.
  - `dispatcher_desconocida`: `ejecutarHerramienta('borrar_todo', {}, e)` → `{ok:false}`.
  - `dispatcher_no_lanza`: un `input` de `undefined` para cada una de las 12 herramientas → ninguna lanza.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(agente): consulta, acciones, de quién y dispatcher de herramientas`

---

### Task 4: Instrucciones del sistema

**Files:**
- Create: `agente/src/instrucciones/base.ts`, `agente/src/instrucciones/construir.ts`, `agente/tests/instrucciones.test.ts`

**Interfaces:**
- Consumes: `Oportunidad`, `ModoSesion`, `Diagnostico`, y del motor `CATALOGO_REGLAS`, `construirContexto`, `CONFIG_DEFAULT`.
- Produces:
  - `VERSION_INSTRUCCIONES = '2026-11-02.1'`
  - `INSTRUCCIONES_BASE: string`
  - `construirInstrucciones(op: Oportunidad, modo: ModoSesion, hoy: string, diag: Diagnostico): { fijo: string; variable: string; version: string }`

**Contenido de `INSTRUCCIONES_BASE`** (en español, sin datos de ninguna oportunidad). Secciones, en este orden:
1. **Rol.** Eres el coach comercial de Netlogistik (Argano) y entrevistas al ejecutivo de ventas como lo haría su director en un pipeline review. El tono es de coaching, no de auditoría.
2. **Reglas de conversación,** de la especificación principal §5 (las 8 reglas):
   - Una pregunta por mensaje (dos como máximo si van ligadas), con el "por qué" en una línea.
   - El orden de las preguntas lo dicta `obtener_huecos_priorizados`.
   - Sin fuente del cliente, el nivel es `supuesto`. "No sé" se registra como ausente.
   - Nunca inventar datos.
   - Nunca recalcular: explicar lo que devuelve `calcular_diagnostico`.
   - Detectar euforia.
   - Responder en el idioma del vendedor y registrar en español.
   - Ser breve: es un celular.
3. **Flujo de sesión** (anexo §7):
   - La apertura nueva y la de retorno, con la revisión de acciones abiertas mediante `marcar_accion`.
   - El aviso de visibilidad en la primera sesión: "esta conversación la verán tu gerente y la dirección".
   - La extracción en cada respuesta.
   - La revisión rápida: 4 preguntas del libro + BANT + compelling event. Si hay motivos de análisis completo, pasar a calificar.
   - El cierre: "Esto es lo que entendí", el diagnóstico, 4 o 5 acciones vía `proponer_acciones` y `cerrar_sesion`.
4. **Metodología condensada** (de `docs/conocimiento/02` y `03`):
   - Los 4 roles con la pregunta para encontrar a cada uno.
   - El grado de influencia y sus 5 factores.
   - Los modos y el axioma "Problema antes que Crecimiento".
   - La escala −5..+5 sin 0, con sus reglas de consistencia.
   - Triunfo-Resultado con su fórmula de declaración.
   - La competencia como cualquier alternativa, incluido "no hacer nada", con las definiciones de George para Dominante, Nula, Compartida y Alternativa.
   - La prioridad y sus señales.
   - BANT con sus 3 niveles.
   - El compelling event con sus 3 elementos.
   - La cadena de cierre: rutas contrato y OC, y la regla de que, sin proveedor elegido, no cierra en el periodo.
   - Las 3 preguntas de higiene de CRM.
   - Si la ficha no trae el tipo de oportunidad, obtenerlo con el árbol: ¿change order? → ¿ya es cliente de Netlogistik? → ¿es cliente de otra Tower de Argano? Registrarlo con `registrar_dato` (`esChangeOrder`, `cuenta.esClienteNetlogistik`, `cuenta.esClienteOtraTowerArgano`).
   - Cómo mapear lo que dice el vendedor a cada herramienta.
5. **Catálogo de banderas:** una línea por id de `CATALOGO_REGLAS`, con su severidad. Se genera del catálogo dentro de `construir.ts` y forma parte de `fijo`.

**`variable`** contiene:
- `Hoy`, `Modo` y `Lente` (de `construirContexto`).
- La ficha en una línea.
- Un resumen del expediente: influencias con rol, grado, modo y calificación; BANT con nivel; compelling event; competencia; cadena.
- Del último diagnóstico: semáforo, índice, etapa CRM vs. recomendada, veredicto de fecha y banderas críticas y altas.
- Las acciones abiertas con su índice.
- Los resúmenes de sesiones anteriores, con su fecha.
- `Sesión nueva` o `Retorno desde <fecha>`.

- [ ] **Step 1: Tests que fallan:**
  - `fijo_estable`: dos oportunidades distintas en modos distintos → `fijo` idéntico. Este es el requisito de la caché.
  - `fijo_sin_datos_de_oportunidad`: `fijo` no contiene el nombre del cliente ni el TCV de la ficha.
  - `fijo_incluye_catalogo`: contiene todos los ids de `CATALOGO_REGLAS`.
  - `fijo_incluye_herramientas`: menciona los 12 nombres de herramientas.
  - `variable_retorno`: una oportunidad con 1 sesión previa del `2026-10-28` → `variable` contiene "Retorno desde 2026-10-28" y el resumen.
  - `variable_lente_director`: etapa CRM 3 → contiene "Lente: director".
  - `version` = `VERSION_INSTRUCCIONES`.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(agente): instrucciones del sistema con parte fija cacheable`

---

### Task 5: Ciclo de conversación

**Files:**
- Create: `agente/src/conversacion/cliente.ts`, `turno.ts`, `transcripcion.ts`, `agente/tests/clienteFalso.ts`, `agente/tests/turno.test.ts`
- Modify: `agente/src/index.ts` (exportar la API pública: tipos, `crearOportunidad`, `validarFicha`, `iniciarSesion`, `ejecutarTurno`, `crearClienteAnthropic`, `formatearTranscripcion`, `ESCENARIOS` en Task 6 y `TIPOS_CAMBIO_DEFAULT`)

**Interfaces:**
- Consumes: Tasks 1 a 4.
- Produces:

```ts
// cliente.ts
import type Anthropic from '@anthropic-ai/sdk';
export interface ClienteModelo { crear(p: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message> }
export function crearClienteAnthropic(apiKey: string): ClienteModelo;
export const MODELO_DEFAULT = 'claude-sonnet-5-5';
// turno.ts
export interface OpcionesTurno { cliente: ClienteModelo; hoy: string; modelo?: string; tiposCambio?: TiposCambio }
export function iniciarSesion(op: Oportunidad, modo: ModoSesion, o: OpcionesTurno): Promise<ResultadoTurno>;
export function ejecutarTurno(op: Oportunidad, mensaje: string, o: OpcionesTurno & { cerrar?: boolean }): Promise<ResultadoTurno>;
// transcripcion.ts
export function formatearTranscripcion(op: Oportunidad): string;  // ficha + transcripción + último diagnóstico, en texto plano
```

**Reglas de `iniciarSesion`:**
- Si `op.cerrada`, no se llama al modelo. Se responde con `respuestas: ['Esta oportunidad está cerrada en el CRM (etapa N); no hay nada que calificar.']`.
- Si no, se crea `sesionActual` (modo, `inicio = hoy`, versión) y se envía el mensaje interno de usuario `"[Inicio de sesión — modo: <modo>]"`. Este mensaje entra al `historial`, pero no a la `transcripcion`.

**Reglas de `ejecutarTurno`:**
1. Validaciones previas, **sin llamar al modelo:**
   - Si se recibe un mensaje recortado vacío y sin `cerrar`, se devuelve el resultado sin cambios.
   - Si el mensaje pasa de 4000 caracteres, se devuelve `error: 'Tu mensaje es muy largo (máx. 4000 caracteres). Resume o divídelo.'`.
   - Si no hay `sesionActual`, se inicia una implícitamente en modo `calificar`.
   - Si `turnosVendedor >= 40`, se fuerza `cerrar`.
2. Se trabaja sobre `const trabajo = structuredClone(op)`:
   - Se agrega el mensaje de usuario. Si `cerrar` es verdadero, se usa el texto `"[El vendedor pidió terminar la sesión: haz el cierre completo]"`.
   - El texto del vendedor va a la `transcripcion`.
3. Ciclo de llamadas al modelo:
   - Cada llamada es `crear({ model, max_tokens: 1024, system: [{type:'text', text: fijo, cache_control:{type:'ephemeral'}}, {type:'text', text: variable}], tools: DEFINICIONES_HERRAMIENTAS (cache_control en la última), messages: historial })`.
   - Si `stop_reason === 'tool_use'`, se ejecuta cada bloque con `ejecutarHerramienta` sobre `EstadoTurno{oportunidad: trabajo,…}`, se agregan los `tool_result` (JSON del resultado; `is_error: true` si `ok:false`) y se repite.
   - **Tope: 8 llamadas a herramientas por turno.** Al llegar a él se hace una última llamada **sin** `tools` para obtener texto.
   - Los bloques de texto del asistente van a `respuestas` y a la `transcripcion`.
4. Al terminar:
   - Se recalcula `ultimoDiagnostico = calcularDiagnostico(trabajo.expediente, hoy)` y se incrementa `turnosVendedor`.
   - Si `estado.sesionCerrada` está puesto, se agrega un `ResumenSesion` a `sesiones` y `sesionActual` pasa a `null`.
   - El uso se suma desde `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`; los ausentes cuentan 0).
5. **Si la API falla en cualquier llamada** (excepción del cliente), se devuelve `{ oportunidad: op /* el original sin tocar */, error: 'No pude comunicarme con el asistente. Intenta de nuevo en un momento.', respuestas: [] }`. Se agrega un evento `error` sin detalles técnicos.

`clienteFalso.ts`: `crearClienteFalso(guion: Array<Partial<Message> | Error>): ClienteModelo & { llamadas: unknown[] }`. Cada `crear` devuelve el siguiente elemento del guion (o lo lanza, si es un `Error`) y registra los parámetros recibidos.

- [ ] **Step 1: Tests que fallan** (usan `crearClienteFalso`):
  - `inicio_saluda`: el guion es un texto "¿Cuál es el estatus del negocio?" → `respuestas[0]` igual a ese texto, `sesionActual` creada, `transcripcion` con 1 mensaje del agente.
  - `cerrada_no_llama_modelo`: `llamadas.length === 0`.
  - `turno_con_herramienta`: el guion es `tool_use(registrar_dato bant.budget confirmado)` y luego un texto → el expediente tiene budget confirmado, `ultimoDiagnostico` no es null y el segundo `crear` recibió un `tool_result`.
  - `herramienta_con_error_continua` (Review Focus 3): `tool_use(registrar_dato campo:'xyz')` y luego un texto → el `tool_result` tiene `is_error: true` y el turno termina normal.
  - `tope_8_herramientas`: el guion da 9 `tool_use` seguidos y luego un texto → se ejecutan exactamente 8 herramientas y la llamada final va sin `tools`.
  - `api_falla_sin_cambios` (Review Focus 2): `tool_use(registrar_dato válido)` y luego `new Error('529 overloaded')` → `error` tiene el texto amable, la oportunidad devuelta es profundamente igual a la original (sin el dato) y el error no contiene "529".
  - `mensaje_largo_no_gasta` (Review Focus 4): 4001 caracteres → `error` puesto y `llamadas.length === 0` · un mensaje vacío → sin llamadas.
  - `cierre_sin_datos` (Review Focus 5): en una sesión recién iniciada, `ejecutarTurno(op,'',{cerrar:true})` con el guion `tool_use(cerrar_sesion resumen)` y luego un texto → `sesiones.length === 1`, `sesionActual === null` y `ultimoDiagnostico` con semáforo `rojo`.
  - `tope_40_fuerza_cierre`: con `turnosVendedor = 40` → el mensaje enviado al modelo contiene "terminar la sesión".
  - `cache_control_en_fijo`: el primer bloque de `system` lleva `cache_control`.
  - `transcripcion_texto`: `formatearTranscripcion` incluye el cliente, cada mensaje con su rol y el semáforo.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(agente): ciclo de conversación con herramientas, topes y recuperación de errores`

---

### Task 6: Escenarios simulados E1–E5

**Files:**
- Create: `agente/src/escenarios/E1.ts` … `E5.ts`, `agente/src/escenarios/index.ts`, `agente/tests/escenarios.test.ts`

**Interfaces:**
- Produces: `interface Escenario { id: 'E1'|'E2'|'E3'|'E4'|'E5'; titulo: string; construirFicha(hoy: string): Ficha; tarjetaPapel: string; hechosOcultos: string; persona: string; banderasEsperadas: string[] }` · `ESCENARIOS: readonly Escenario[]`.

Las fechas se **calculan desde `hoy`**, para que los escenarios no caduquen. Contenido según la tabla del anexo §9:

| # | Ficha | `banderasEsperadas` (deben poder activarse si el vendedor cuenta los hechos) |
|---|---|---|
| E1 | Retail, WMS, MX, etapa 4, TCV 520000 USD, cierre = último día del mes de `hoy` (si faltan menos de 5 días hábiles, el del mes siguiente), creación = hoy − 150 días | `no_elegidos_cierre_periodo` |
| E2 | Manufactura, TMS, CO, etapa 2, TCV 380000 USD, cierre = hoy + 200 días, creación = hoy − 90 días | `sin_economico`, `banco_una_pata` |
| E3 | Paraestatal, WMS, MX, etapa 1, `esRFP: true`, TCV 900000 USD, cierre = hoy + 120 días | `rfp_sin_contacto_previo` |
| E4 | 3PL, PLANEACION_DEMANDA, PE, etapa 2, TCV 250000 USD, cierre = hoy + 150 días | `sin_contribucion_diferenciadora` (si no la articula) |
| E5 | Cliente existente, tipo EN, VOICE, MX, etapa 3, TCV 310000 USD, cierre = hoy + 25 días hábiles | ninguna crítica (en `banderasEsperadas`: `[]`) |

- **`tarjetaPapel`:** de 5 a 8 líneas en español, en segunda persona ("Eres el vendedor…"). Lista los hechos que George debe interpretar: personas con su cargo, qué saben, qué no saben y el tono.
- **`hechosOcultos`:** los mismos hechos en tercera persona, más detalle, para el vendedor simulado. Incluye cómo responder si el agente pregunta por cada elemento.
- **`persona`:**
  - E1: eufórico.
  - E2: vago.
  - E3: apurado.
  - E4: contradictorio.
  - E5: ordenado, y escribe en **inglés**.
- Todos los nombres de empresas y personas son ficticios y verosímiles para LATAM.

- [ ] **Step 1: Tests que fallan:**
  - `cinco_escenarios`: ids E1..E5 únicos.
  - `fichas_validas`: para `hoy` en `'2026-11-02'`, `'2026-12-29'` y `'2027-02-26'`, cada `validarFicha(construirFicha(hoy))` → `[]` y `fechaCierreCRM ≥ hoy`.
  - `e1_cierra_en_periodo`: con hoy `2026-11-02`, la fecha de cierre de E1 es ≤ `finDeTrimestre(hoy)`.
  - `textos_presentes`: `tarjetaPapel` y `hechosOcultos` tienen al menos 200 caracteres.
  - `banderas_existen`: cada id de `banderasEsperadas` está en `CATALOGO_REGLAS`.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(agente): cinco escenarios simulados de Netlogistik`

---

### Task 7: Evaluaciones con vendedores simulados

**Files:**
- Create: `agente/evals/vendedorSimulado.ts`, `agente/evals/verificaciones.ts`, `agente/evals/correr.ts`, `agente/tests/verificaciones.test.ts`
- Modify: `agente/package.json` (script `"evals": "npm run build && node dist-evals/correr.js"`, o `tsx` como devDependency para correrlo directo; queda a elección, siempre que `npm run evals -w agente-sales-agent -- --escenario E1` funcione)

**Interfaces:**
- Produces:
  - `responderComoVendedor(cliente: ClienteModelo, esc: Escenario, transcripcion: Mensaje[], modelo: string): Promise<string>`: un prompt de sistema en español con `persona` y `hechosOcultos`. Instrucciones: responder solo lo que se pregunta, sin revelar todo de golpe; contestar "no sé" a lo que no está en los hechos; usar el idioma de la persona; escribir `FIN` cuando el agente cierre.
  - `verificar(esc: Escenario, op: Oportunidad): Verificacion[]`, con `interface Verificacion { nombre: string; ok: boolean; detalle: string }`:
    - (a) `una_pregunta`: ningún mensaje del agente tiene más de 2 "?".
    - (b) `idioma`: para E5 los mensajes del agente están mayoritariamente en inglés; para los demás, en español. Se decide con una heurística de palabras frecuentes (lista corta de cada idioma).
    - (c) `sin_personas_inventadas`: cada `nombre` de influencia aparece en `hechosOcultos` (comparación normalizada).
    - (d) `cierre_con_diagnostico`: hay al menos 1 sesión en `sesiones` y `ultimoDiagnostico` no es null.
    - (e) `banderas_esperadas`: todas las de `banderasEsperadas` están en `ultimoDiagnostico.banderas`.
  - `correr.ts` (CLI):
    - Argumentos: `--escenario E1|…|todos` (default `todos`) y `--turnos 15`.
    - Lee la clave de `ANTHROPIC_API_KEY` o de `/home/claude/.secrets/anthropic_key` si existe.
    - El vendedor simulado usa el modelo `claude-haiku-5-5`, configurable con `MODELO_VENDEDOR`.
    - Conversa con `iniciarSesion` / `ejecutarTurno`. En el último turno, o cuando el vendedor escribe `FIN`, manda `cerrar: true`.
    - Escribe `agente/evals/informes/<fecha>-<escenario>.md` con la transcripción, las verificaciones y el uso de tokens, e imprime un resumen ✅/❌.
    - Sale con código 1 si alguna verificación falla.

- [ ] **Step 1: Tests que fallan** (en `verificaciones.test.ts`, sin API, con oportunidades armadas a mano):
  - `pregunta_doble_falla`: un mensaje "¿A? ¿B? ¿C?" → `una_pregunta` en false.
  - `idioma_ingles_ok` y `idioma_espanol_en_e5_falla`.
  - `persona_inventada`: una influencia "Laura Méndez" que no está en los hechos → false.
  - `banderas_faltantes`: la esperada no está → false, con el id en `detalle`.
  - `vendedor_simulado_prompt`: con un cliente falso, el `system` enviado contiene la `persona` y los `hechosOcultos` del escenario.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** `npm test -w agente-sales-agent` → PASS.
- [ ] **Step 5: Corrida real de humo:** `npm run evals -w agente-sales-agent -- --escenario E1 --turnos 6` → termina, genera el informe y la transcripción es coherente. Las verificaciones pueden fallar en esta fase: se reporta, no se exige. Registrar en el reporte el costo aproximado en tokens.
- [ ] **Step 6: Commit** `feat(agente): evaluaciones con vendedores simulados`

---

### Task 8: Web — acceso con contraseña y endpoint de turno

**Files:**
- Create: `web-pruebas/package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/acceso/page.tsx`, `app/api/acceso/route.ts`, `app/api/turno/route.ts`, `lib/sesion.ts`, `lib/clienteServidor.ts`, `lib/hoy.ts`, `tests/sesion.test.ts`, `tests/turno-route.test.ts`

**Interfaces:**
- Consumes: de `agente-sales-agent`: `iniciarSesion`, `ejecutarTurno`, `crearClienteAnthropic`, `validarFicha`, `crearOportunidad`, tipos; del motor: `validarExpediente`.
- Produces:
  - `lib/sesion.ts`:
    - `firmarAcceso(clave: string): string` = HMAC-SHA256 hex de `'acceso-sales-agent'` con la clave.
    - `verificarAcceso(cookie: string | undefined, clave: string | undefined): boolean`: compara en tiempo constante. Si la clave está vacía o no existe → false.
    - El nombre de la cookie es `sa_acceso`.
  - `lib/hoy.ts`: `hoyMexico(): string` (con `Intl.DateTimeFormat('en-CA', {timeZone:'America/Mexico_City'})`).
  - `lib/clienteServidor.ts`: `obtenerCliente(): ClienteModelo`.
    - Si `MODELO_FALSO === '1'`, devuelve un cliente falso determinista para la prueba de humo: responde "¿Cuál es el estatus del negocio? (modo de prueba)" y, si hay mensaje, "Gracias, anotado. (modo de prueba)".
    - Si no, `crearClienteAnthropic(process.env.ANTHROPIC_API_KEY!)`.
  - `POST /api/acceso`, cuerpo `{clave}`. Si coincide con `CLAVE_PRUEBAS`, pone la cookie `httpOnly`, `secure` en producción, `sameSite lax`, 30 días, y responde 200. Si no, responde 401 `{error:'Contraseña incorrecta'}`.
  - `POST /api/turno`, cuerpo `{ accion: 'iniciar'|'mensaje'|'cerrar', oportunidad?: Oportunidad, ficha?: Ficha, escenarioId?: 'E1'|'E2'|'E3'|'E4'|'E5', modo?: ModoSesion, mensaje?: string }`:
    - 401 si no hay acceso.
    - 400 con mensaje en español si el JSON no es válido, si `oportunidad.formato !== 1`, si `validarExpediente` da errores, si la ficha es inválida, si el mensaje no es texto o si el cuerpo pesa más de 1 MB.
    - Con `escenarioId` y sin `oportunidad`, arma la ficha **en el servidor** con `ESCENARIOS[i].construirFicha(hoyMexico())` y crea la oportunidad. Con `ficha` y sin `oportunidad`, la crea con `crearOportunidad`; en ese caso, `fechaCreacion` y `vendedor` los pone el servidor (hoy y `'prueba'`).
    - Delega en `iniciarSesion` o `ejecutarTurno` con `hoy: hoyMexico()` y `modelo: process.env.MODELO_AGENTE`.
    - Responde 200 con el `ResultadoTurno`.
    - **Nunca 500 con detalles:** cualquier excepción da 500 `{error:'Error interno, intenta de nuevo.'}`.
  - `web-pruebas/package.json`:
    - Dependencias: `next@^16.4`, `react@^19.3`, `react-dom@^19.3`, `agente-sales-agent: "*"`, `motor-sales-agent: "*"`.
    - Script `"build": "npm --prefix .. run build:paquetes && next build"`.
    - Scripts `dev`, `start` y `test` (vitest).

- [ ] **Step 1: Tests que fallan:**
  - `firmar_verificar`: verifica bien con la misma clave · falla con otra clave · falla con cookie undefined · falla con clave vacía.
  - En `turno-route.test.ts`, se importa el handler `POST` y se mockea `obtenerCliente` con `vi.mock` para devolver un cliente falso:
    - `sin_cookie_401`.
    - `json_invalido_400` (Review Focus 1).
    - `formato_viejo_400` (Review Focus 1): `{formato: 0}` → 400 con un mensaje que menciona "formato".
    - `expediente_corrupto_400` (Review Focus 1): `etapaCRM: 'tres'` → 400.
    - `mensaje_largo` (Review Focus 4): 4001 caracteres → 200 con `error` en el resultado y sin llamada al cliente.
    - `iniciar_con_ficha_200`: `accion 'iniciar'` + ficha válida → 200 con `respuestas[0]` del cliente falso.
    - `iniciar_con_escenario_usa_hoy_servidor`: `accion 'iniciar'` + `escenarioId 'E1'` con `hoyMexico` mockeado a `2026-11-02` → la `fechaCierreCRM` de la oportunidad es ≤ `2026-12-31`.
    - `excepcion_500_generico`: el cliente lanza dentro de algo no capturado → 500 con el texto genérico, sin stack.
  - Para construir la `Request` con cookie se usa `new Request(url, {headers:{cookie:'sa_acceso=…'}})`.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** La página `app/acceso/page.tsx` es un formulario simple con contraseña que hace POST y redirige a `/`. **Step 4: Ejecutar** `npm test -w web-pruebas-sales-agent` → PASS. `npm run build -w web-pruebas-sales-agent` (con `CLAVE_PRUEBAS=x`) → compila sin errores.
- [ ] **Step 5: Commit** `feat(web): acceso con contraseña y endpoint de turno`

---

### Task 9: Web — laboratorio de prueba (interfaz)

**Files:**
- Create: `web-pruebas/app/page.tsx`, `components/Laboratorio.tsx`, `Chat.tsx`, `PanelDiagnostico.tsx`, `FichaNueva.tsx`, `TarjetaPapel.tsx`, `lib/almacenNavegador.ts`, `tests/almacen.test.ts`, `e2e/humo.mjs`

**Interfaces:**
- Consumes: `/api/turno` (Task 8), `ESCENARIOS`, `formatearTranscripcion` y tipos (agente).
- Produces:
  - `lib/almacenNavegador.ts`: `crearAlmacen(storage: Pick<Storage,'getItem'|'setItem'|'removeItem'> | null)` → `{ listar(): Oportunidad[]; guardar(op): void; obtener(id): Oportunidad | null; borrar(id): void; estado: 'ok' | 'formato_incompatible' | 'sin_almacen' }`.
    - La clave es `sa_oportunidades_v1`.
    - Cada acceso va en try/catch. Sin storage, o si lanza, se usa memoria.
    - Si el contenido guardado no se puede parsear, o tiene un `formato` distinto de 1, se marca `estado 'formato_incompatible'` y no se lanza.
  - `app/page.tsx` (servidor): verifica `sa_acceso` con `verificarAcceso`. Si no hay acceso, `redirect('/acceso')`; si hay, renderiza `<Laboratorio/>` (cliente).
  - **Laboratorio:**
    - Selector con los 5 escenarios (por `titulo`), las oportunidades guardadas y "Nueva oportunidad".
    - Al elegir un escenario se muestra `TarjetaPapel`. Al dar clic en "Iniciar sesión" se envía `escenarioId`; la ficha la arma el servidor y la oportunidad devuelta se guarda en el almacén.
    - Selector de modo: Calificar o Revisión rápida.
    - Botones: "Iniciar sesión", "Terminar sesión", "Copiar conversación" (`formatearTranscripcion` al portapapeles) y "Reiniciar" (borra esa oportunidad).
    - Si el estado del almacén es `formato_incompatible`, aparece un aviso con un botón "Reiniciar datos de prueba".
    - Al pie, el contador de tokens de la sesión.
  - **Chat:** mensajes en burbujas, campo de texto con `maxLength 4000`, indicador "pensando…", y deshabilitado mientras espera respuesta. Las respuestas `error` se muestran como aviso, no como mensaje del agente.
  - **PanelDiagnostico** (lee `ultimoDiagnostico`): semáforo con color e índice · etapa CRM vs. recomendada · probabilidad declarada vs. ajustada · fecha CRM vs. creíble con veredicto · BANT en 4 puntos de color por nivel · compelling event (3 elementos) · las 5 primeras banderas (severidad + texto). Si aún no hay diagnóstico, muestra "Aún sin diagnóstico".
  - **FichaNueva:** los 8 campos obligatorios del anexo §4, con selectores para País (MX, CO, PE, EC, CL, GT, CR, PA, US), Línea (multiselección), Moneda (USD, MXN, COP, PEN, CLP) y Etapa (0–8 con el nombre de Argano). Valida con `validarFicha` antes de enviar.
  - **Diseño:** una sola columna en el celular (chat y luego el panel plegable) y dos columnas desde 900 px. Margen lateral de 16 px y sin scroll horizontal. Textos en español.

- [ ] **Step 1: Tests que fallan** (`almacen.test.ts`, con un storage falso en memoria):
  - `guardar_y_listar`.
  - `storage_null_usa_memoria`.
  - `storage_que_lanza`: `getItem` lanza → `estado 'sin_almacen'` y sigue funcionando en memoria.
  - `formato_incompatible` (Review Focus 1): el contenido es `'{"x":1}'` o `[{"formato":0}]` → `estado 'formato_incompatible'`, sin lanzar.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar** los componentes y el almacén. **Step 4: Ejecutar** los tests → PASS. `npm run build -w web-pruebas-sales-agent` → OK.
- [ ] **Step 5: Prueba de humo E2E** `e2e/humo.mjs` (Playwright, Chromium del entorno):
  - Se levanta `next start` con `MODELO_FALSO=1` y `CLAVE_PRUEBAS=prueba`.
  - El script entra con la contraseña, elige E1, da clic en "Iniciar sesión" y espera el texto "(modo de prueba)".
  - Envía "Hola" y espera la segunda respuesta. Verifica que el panel muestra un semáforo.
  - Toma una captura a 390 px de ancho (`e2e/humo-movil.png`, sin commit) y verifica que no hay scroll horizontal (`document.documentElement.scrollWidth <= 390`).
  - Run: `node web-pruebas/e2e/humo.mjs` → Expected: termina con "HUMO OK".
- [ ] **Step 6: Commit** `feat(web): laboratorio de prueba con chat, ficha y panel de diagnóstico`

---

### Task 10: Despliegue en Vercel y primera corrida de evaluaciones

**Files:**
- Create: `web-pruebas/vercel.json` (solo si hace falta para el comando de build o de instalación del monorepo), `docs/superpowers/plans/2026-11-02-agente-conversacional-RESULTADO.md`

**Interfaces:**
- Consumes: todo lo anterior. Usa el conector de Vercel (`mcp__Vercel__*`) con el equipo y la cuenta de George, y el repositorio `jorgeponce77/Sales-Agent`.

- [ ] **Step 1: Subir la rama a GitHub** (`git push origin <rama>`) y abrir el Pull Request contra `main`.
- [ ] **Step 2: Crear el proyecto de Vercel `sales-agent-pruebas`:**
  - Vinculado al repositorio, con *Root Directory* `web-pruebas`, framework Next.js e instalación desde la raíz del monorepo.
  - Variables de entorno de Production y Preview: `ANTHROPIC_API_KEY` (de `/home/claude/.secrets/anthropic_key`; nunca se imprime) y `CLAVE_PRUEBAS` (una frase generada aleatoriamente, de 4 palabras en español separadas por guiones, que se entrega a George en el mensaje final).
  - Si el conector no permite vincular el repositorio, se despliega desde la rama por el medio que el conector ofrezca, y se documentan los pasos para que George lo vincule en el panel.
- [ ] **Step 3: Verificar el despliegue:**
  - `GET /` sin cookie → redirige a `/acceso`.
  - `POST /api/acceso` con una clave incorrecta → 401.
  - Con la correcta → 200.
  - `POST /api/turno` `{accion:'iniciar', ficha: E1}` → 200 con una respuesta real del agente (en español, que pide el estatus del negocio).
- [ ] **Step 4: Primera corrida completa de evaluaciones:** `npm run evals -w agente-sales-agent -- --escenario todos --turnos 12`. Guardar el informe agregado (✅/❌ por escenario y verificación, y los tokens totales) en `RESULTADO.md`. Las verificaciones fallidas se describen; **no** se corrigen en este task: se convierten en la lista de ajustes de instrucciones para la calibración con George.
- [ ] **Step 5: Commit** `docs: resultado del Plan 3 (despliegue y primera evaluación)` y push a la rama del PR.
