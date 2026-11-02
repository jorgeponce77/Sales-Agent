# Sales Agent — Anexo de diseño: Agente conversacional y página de prueba (Plan 3)

**Fecha:** 2-nov-2026 · **Estado:** diseño aprobado por George en la conversación; pendiente de su revisión por escrito.
**Complementa a:** `2026-10-31-sales-agent-design.md` (especificación principal, §4, §5 y §8). Si este anexo y la especificación principal difieren, manda este anexo para el Plan 3.
**Se apoya en:** el motor de reglas (`motor/`, API pública en `motor/src/index.ts`) y en los documentos `docs/conocimiento/01..03`.

## 1. Alcance

**Incluye:**
- El agente con los modos **Calificar o actualizar** y **Revisión rápida** (especificación §4.1, §4.2, §4.5, §4.6 y §5).
- Las herramientas del agente, conectadas al motor.
- La **página web de prueba**, protegida con contraseña.
- **5 escenarios simulados** de Netlogistik.
- **Evaluaciones con vendedores simulados.**
- El despliegue en Vercel.

**No incluye:**
- Los modos Preparar reunión y Debrief (v1.1).
- La base de datos, el acceso por correo y los roles (Plan 2).
- La importación de Excel (Plan 2).
- El tablero y la app final (Plan 4).

## 2. Decisiones de George que este anexo fija

| Decisión | Valor |
|---|---|
| Dónde se prueba | Página web en Vercel, protegida con contraseña (George y, si quiere, 1 o 2 gerentes) |
| Cuenta de la API | La cuenta personal de George. La clave es exclusiva del proyecto y se revoca al terminar el piloto |
| Datos de prueba | Escenarios combinados: 5 simulados que crea Claude, más oportunidades reales anonimizadas que George agregue después |
| Inicio de cada oportunidad | **Ficha mínima con los datos duros del CRM; todo lo cualitativo sale de la conversación** |
| Formato estándar de datos | Los 15 encabezados de §4. Sirven para la ficha, para la importación del Plan 2 y para los dashboards de George |

## 3. Arquitectura

Monorepo con *npm workspaces*:

```
motor/          (existente) reglas deterministas
agente/         librería TypeScript: instrucciones, herramientas, ciclo de conversación, ficha, escenarios, evaluaciones
web-pruebas/    app Next.js: página de prueba + endpoint /api/turno
```

- **Servidor sin estado.** El navegador guarda la oportunidad: ficha, expediente, mensajes de la sesión, resúmenes de sesiones anteriores y el último diagnóstico. Lo guarda en `localStorage`, con su versión de formato.
  - En cada turno, el navegador envía `{ oportunidad, mensajeVendedor, modo }` a `/api/turno`.
  - El servidor **revalida el expediente con `validarExpediente`** antes de usarlo, ejecuta el turno del agente y devuelve `{ respuestas, oportunidadActualizada, diagnostico, eventos, uso }`.
  - El servidor no persiste nada. En el Plan 2 este almacén se reemplaza por la base de datos, detrás de la interfaz `Almacen`, sin tocar el agente.
- **Modelo.** Claude por API. Por defecto `claude-sonnet-5-5`, configurable con `MODELO_AGENTE`. Respuesta máxima de 1024 tokens.
- **Instrucciones del sistema** (versionadas con un identificador `version` que se guarda en cada sesión):
  1. **Parte fija, en caché (prompt caching):**
     - El rol y el estilo: coaching y no auditoría, una pregunta a la vez con la razón en una línea, responder en el idioma del vendedor y registrar en español.
     - La metodología condensada de los documentos 02 y 03.
     - Las reglas de conversación de la especificación §5.
     - El catálogo de banderas (`CATALOGO_REGLAS`).
  2. **Parte variable:**
     - La fecha de hoy, el modo y la lente.
     - La ficha y el expediente resumido.
     - El último diagnóstico y las acciones abiertas.
     - Los resúmenes de sesiones anteriores.
     - Los huecos priorizados.
- **Ciclo de herramientas.** Por cada mensaje del vendedor hay como máximo **8 llamadas a herramientas**. Si se llega al tope, el agente responde con lo que tenga.
- **Límites de costo.**
  - Una sesión permite como máximo **40 mensajes del vendedor**.
  - Cada respuesta incluye el consumo de tokens, y la página muestra el acumulado de la sesión.

## 4. Ficha mínima y formato estándar de datos

**Los 15 encabezados:**

| # | Columna | Formato |
|---|---|---|
| 1 | ID Oportunidad CRM | texto |
| 2 | Cliente | texto |
| 3 | Oportunidad | texto |
| 4 | País | ISO-2 |
| 5 | Línea de producto | WMS · TMS · Planeación de la demanda · Voice, separadas por `;` si son varias |
| 6 | Tipo de oportunidad | NN · ENxT · EN · EE (opcional) |
| 7 | Etapa CRM | número 0–8 |
| 8 | TCV | número |
| 9 | Moneda | ISO-4217 |
| 10 | Fecha de creación | AAAA-MM-DD |
| 11 | Fecha de cierre CRM | AAAA-MM-DD |
| 12 | Vendedor | correo |
| 13 | Probabilidad CRM % | 0–100 (opcional) |
| 14 | Es RFP | Sí/No (opcional) |
| 15 | Última actualización CRM | AAAA-MM-DD (opcional) |

**Ficha de "Nueva oportunidad" en la página de prueba.** Tiene 8 campos obligatorios: Cliente, Oportunidad, País, Línea, TCV, Moneda, Etapa CRM y Fecha de cierre CRM.
- El ID se genera automáticamente.
- La fecha de creación es hoy.
- El vendedor es quien está probando.

**Conversión a USD.**
- Se hace con `tiposCambio` configurables. Por defecto solo `USD: 1`.
- Si la moneda no tiene tipo de cambio, `montoUSD` queda en `null` y la página muestra un aviso.
- **No se inventan tipos de cambio.**

**Tipo de oportunidad.**
- Si viene en la ficha, se registra directamente.
- Si no viene, el agente lo obtiene con las preguntas del árbol de la especificación §7.1: ¿change order? ¿cliente de Netlogistik? ¿cliente de otra Tower?

**La etapa 6–8 (cerrada)** se acepta en la ficha. El agente informa que la oportunidad está cerrada y no inicia la calificación.

## 5. Herramientas del agente

Todas operan sobre **una copia** del expediente. Cada escritura se aplica, se valida con `validarExpediente` y:
- **si es válida**, se conserva;
- **si es inválida**, se descarta y la herramienta devuelve los errores en español, para que el agente repregunte.

Ninguna herramienta lanza excepciones hacia el modelo.

| Herramienta | Qué hace |
|---|---|
| `leer_expediente` | Devuelve el expediente y la ficha en un formato legible. |
| `registrar_dato` `{campo, valor, nivel, fuente}` | Escribe un dato escalar de una **lista blanca** de campos (abajo). **Reemplaza** el valor anterior; nunca duplica. |
| `registrar_criterio_argano` `{clave, nivel}` | Reemplaza el nivel de un criterio de Argano (resuelve el pendiente del motor: no se acumulan duplicados). Las claves válidas son las de `CONFIG_DEFAULT.criteriosArgano`. |
| `registrar_influencia` `{nombre, …campos de Influencia}` | Crea la influencia o actualiza la existente, buscando por `personaId` o, si no lo hay, por el nombre normalizado. |
| `registrar_alternativa` `{tipo, nombre, posicion}` | Crea la alternativa o actualiza la existente, buscando por `tipo` + nombre normalizado. |
| `actualizar_cadena_cierre` `{ruta?, requiereSOW?, pasos?}` | Actualiza parcialmente la ruta, el requisito de SOW y los pasos a–h. |
| `actualizar_ficha` `{campo, valor}` | Actualiza solo `etapaCRM`, `fechaCierreCRM`, TCV o moneda, y únicamente cuando el vendedor dice que ya cambió en el CRM. Queda registrado como evento visible. |
| `obtener_huecos_priorizados` | Devuelve los `huecos` del motor, **enriquecidos con `deQuien`** (resuelve la decisión F2; ver §6). |
| `calcular_diagnostico` | Devuelve el `Diagnostico` completo del motor. |
| `proponer_acciones` `{acciones[]}` | Valida con `validarAcciones`. Las aceptadas se guardan en `accionesPrevias` con estado `abierta`, y se devuelven también las rechazadas con su motivo. |
| `marcar_accion` `{indice, estado}` | Marca una acción previa como `cumplida` o `no_cumplida` (resuelve el pendiente "acciones previas" del motor). |
| `cerrar_sesion` `{resumen}` | Guarda el resumen corto de la sesión (2 a 4 líneas, en español) y la foto del expediente y del diagnóstico. |

**Lista blanca de `registrar_dato`:**
- `bant.budget`, `bant.authority`, `bant.need`, `bant.time`
- `compellingEvent.fecha`, `compellingEvent.dueno`, `compellingEvent.costoInaccion`, `compellingEvent.descripcion`, `compellingEvent.urgenciaFalsa`
- `prioridad`, `contribucionDiferenciadora`, `reorganizacion`, `criteriosCompraDefinidos`, `preguntaCompetenciaHecha`
- `esRFP`, `contactoPrevioRFP`, `sensacion`
- `higieneCRM.valores`, `higieneCRM.actividades`, `higieneCRM.etapas`
- `cuenta.clienteIdeal.0` a `.4`, `cuenta.esClienteNetlogistik`, `cuenta.esClienteOtraTowerArgano`
- `esChangeOrder`, `cambioDeDueno`, `esMercadoNuevo`, `revisionGerenteProxima`

Los campos tipo `Evidencia` guardan `fecha = hoy` cuando el nivel es `confirmado`.

## 6. "¿De quién?" en los huecos (decisión F2)

El agente tiene una tabla `reglaId → deQuien`. Cuando se conocen nombres en el expediente, el texto los incluye. Ejemplos:
- `budget_ausente` y `bant_*` (budget) → "del Económico" + su nombre, o "de tu Coach".
- `sin_economico` → "de tu Coach o de quien ya conoces en la cuenta".
- `tr_no_redactado` → los nombres de las influencias sin Triunfo-Resultado.
- `ce_incompleto` → "del dueño del compelling event" o "del Económico".
- `alternativas_no_identificadas` → "pregunta directa al cliente: ¿estamos compitiendo con otro proveedor?".

Las reglas que no están en la tabla devuelven `deQuien: null`.

## 7. Flujo de una sesión

1. **Apertura.**
   - Si la oportunidad es nueva: "¿Cuál es el estatus del negocio?".
   - Si ya existe: un resumen de 2 líneas del último estado, luego "¿Qué cambió desde el [fecha]?", y después la revisión de cada acción abierta con `marcar_accion`.
   - En la primera sesión, el agente avisa que la conversación la verán el gerente y la dirección.
2. **Extracción.** De cada respuesta del vendedor, el agente registra todo lo que pueda con su nivel de evidencia. Sin una fuente del cliente, el nivel es `supuesto`.
3. **Preguntas.** El orden lo marca `obtener_huecos_priorizados`. Una pregunta a la vez, explicando por qué.
4. **Revisión rápida.** Cubre las 4 preguntas del libro + BANT + compelling event y entrega el semáforo y la acción principal.
   - Si `motivosAnalisisCompleto` no está vacío, el agente avisa que se requiere el análisis completo y cambia al modo Calificar.
5. **Cierre** (cuando el vendedor lo pide, o al llegar al tope de turnos):
   - "Esto es lo que entendí".
   - El diagnóstico, explicado y no recalculado.
   - El plan de 4 a 5 acciones validado con `proponer_acciones`.
   - `cerrar_sesion`.

## 8. Página de prueba (`web-pruebas/`)

- **Acceso.** Contraseña compartida en `CLAVE_PRUEBAS`. Se guarda en una cookie `httpOnly` firmada y protege tanto la página como `/api/turno`.
- **Selector.** Los 5 escenarios, las oportunidades del navegador y "Nueva oportunidad" (abre la ficha de §4).
  - Al elegir un escenario se muestra una **tarjeta "Tu papel"**: los hechos que el probador debe actuar como vendedor.
- **Chat.** Diseño para celular. El texto se escribe o se dicta con el teclado del teléfono. Hay un botón "Terminar sesión", que dispara el cierre.
- **Panel de diagnóstico en vivo:**
  - Semáforo e índice.
  - Etapa CRM vs. recomendada.
  - Probabilidad declarada vs. ajustada.
  - Fecha CRM vs. creíble, con veredicto.
  - BANT en 4 puntos.
  - Compelling event.
  - Las 5 banderas principales.
- **"Copiar conversación"**: copia la transcripción, la ficha y el diagnóstico en texto, para enviarlos a Claude con comentarios.
- **Reiniciar escenario**: borra lo guardado en el navegador para ese escenario.
- La clave de la API vive solo en las variables de entorno de Vercel (`ANTHROPIC_API_KEY`).

## 9. Escenarios simulados

Son 5 casos típicos de Netlogistik. Cada uno tiene **ficha**, **tarjeta "Tu papel"** (para George) y **hechos ocultos + persona** (para el vendedor simulado de las evaluaciones). Los clientes son ficticios.

| # | Caso | Lo que debe detectar el agente |
|---|---|---|
| E1 | Retail, WMS, etapa 4, cierre este mes, el cliente aún no nos elige | `no_elegidos_cierre_periodo`, etapa inflada, fecha no creíble |
| E2 | Manufactura, TMS, etapa 2, el vendedor solo conoce al gerente de tráfico | `sin_economico`, `banco_una_pata`, BANT en supuesto |
| E3 | Gobierno o paraestatal, WMS, RFP publicado sin contacto previo | `rfp_sin_contacto_previo`, `alternativas_no_identificadas` o competencia fuerte |
| E4 | Logística 3PL, Planeación de la demanda, competimos contra TI interno | Alternativa `interna`, contribución diferenciadora, Coach |
| E5 | Cliente existente (EN), Voice, sano, con compelling event regulatorio | Verde, fortalezas, cadena de cierre creíble |

## 10. Pruebas y evaluación

1. **Unitarias (Vitest, sin costo):**
   - Cada herramienta: aplicar, validar, rechazar, reemplazar sin duplicar.
   - La lista blanca.
   - `deQuien`.
   - La conversión de moneda.
   - El armado de instrucciones: la parte fija es estable para la caché y la parte variable es correcta.
   - El ciclo de conversación con un **cliente de Anthropic falso**, con respuestas guionadas: uso de herramientas, tope de 8 llamadas, error de la API (se devuelve un mensaje amable y el expediente no cambia) y herramienta inexistente.
2. **Evaluaciones con vendedores simulados** (`npm run evals -w agente`). Consumen saldo, así que se ejecutan a mano y no en cada cambio.
   - Claude interpreta al vendedor con la persona y los hechos ocultos del escenario. Personas: vago, eufórico, contradictorio, apurado, en inglés.
   - Cada corrida dura hasta 15 turnos y verifica automáticamente:
     - (a) ningún mensaje del agente tiene más de 2 signos "?";
     - (b) el agente responde en el idioma del vendedor;
     - (c) todas las influencias registradas tienen nombres que aparecen en los hechos (no inventa personas);
     - (d) la sesión cierra con diagnóstico;
     - (e) aparecen las banderas esperadas del escenario.
   - El resultado es un informe en markdown con las transcripciones.
3. **Calibración de George.** Conversa con los escenarios, envía transcripciones con comentarios y Claude ajusta las instrucciones, cambiando la `version`.

## 11. Despliegue

- Proyecto de Vercel conectado al repositorio de GitHub de George, con raíz en `web-pruebas/`.
- Variables de entorno: `ANTHROPIC_API_KEY`, `CLAVE_PRUEBAS` y `MODELO_AGENTE` (opcional).
- La clave la registra Claude mediante el conector de Vercel, o George directamente en el panel, si lo prefiere.

## 12. Pendientes y supuestos

- Los tipos de cambio distintos de USD los define George. Mientras tanto, los escenarios usan USD.
- Los nombres de clientes y personas de los escenarios son ficticios.
- La corrección de la coherencia del índice en negocios ganados (pendiente del motor) se hace aquí si es necesaria para el panel. Si no, se queda para el Plan 4.
