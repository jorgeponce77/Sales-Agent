# Agente conversacional — Resultado del Plan 3 (3-nov-2026)

Rama `feat/agente-conversacional`, fusionada a `main` en el PR #1. Fueron 10 tareas, cada una con revisión independiente, más una revisión final de toda la rama con una ronda de correcciones.

**Pruebas:** pasan 409 del motor, 220 del agente y 146 de la web, más la prueba de humo de punta a punta con Playwright.

## Qué quedó construido

- **`agente/`**
  - La ficha y la conversión a expediente.
  - 12 herramientas con lista blanca de campos.
  - Instrucciones del sistema, versión `2026-11-02.4`.
  - El ciclo de conversación con la API de Claude, que incluye:
    - razonamiento del modelo;
    - tope de 8 herramientas por turno y de 40 mensajes por sesión;
    - recuperación cuando una respuesta se corta;
    - caché entre turnos;
    - foto del expediente y del diagnóstico al cerrar cada sesión;
    - presupuesto de 240 s por turno;
    - mensajes fijos en el idioma del vendedor.
  - Los escenarios E1 a E5.
  - Evaluaciones con un vendedor simulado: `npm run evals -w agente-sales-agent`.
- **`web-pruebas/`**
  - Acceso con contraseña mediante cookie firmada.
  - `/api/turno` y `/api/transcripcion`, sin estado y con validación completa de lo que manda el navegador.
  - El laboratorio para celular: chat, tarjeta "Tu papel", ficha nueva y panel de diagnóstico en vivo.
- **Despliegue:** proyecto de Vercel `sales-agent` (equipo *Plan B*), publicado desde `main`, en https://sales-agent-black-two.vercel.app. La contraseña se entregó a George por chat y no está en el repositorio.
- **Verificación del despliegue:**
  - Sin cookie, la página manda a `/acceso` y `/api/turno` responde 401.
  - Con una clave incorrecta, el acceso responde 401; con la correcta, 200.
  - Iniciar E1 respondió en 3 s con un saludo real en español que pide el estatus del negocio, con semáforo rojo.

## Primera corrida completa de evaluaciones (12 turnos por escenario)

| Escenario | Una pregunta a la vez | Idioma | Sin personas inventadas | Cierra con diagnóstico | Banderas esperadas | Diagnóstico final |
|---|---|---|---|---|---|---|
| E1 Retail, etapa 4, no nos eligen | ❌ (5 mensajes) | ✅ | ✅ | ✅ | ✅ | Rojo 21/100 |
| E2 Manufactura, solo el gerente de tráfico | ❌ (2) | ✅ | ✅ | ✅ | ✅ | Rojo 24/100 |
| E3 RFP sin contacto previo | ✅ | ✅ | ✅ | ✅ | ✅ | Rojo 24/100 |
| E4 3PL contra TI interno | ❌ (1) | ✅ | ✅ | ✅ | ❌ falta `sin_contribucion_diferenciadora` | Rojo 40/100 |
| E5 Cliente existente sano (en inglés) | ❌ (1) | ✅ | ✅ | ✅ | ✅ (ninguna esperada) | Rojo 40/100, se esperaba verde |

**Tokens de la corrida:**
- Agente (`claude-sonnet-5-5`): 72 mil de salida, 3.7 millones leídos de caché y 214 mil escritos en caché.
- Vendedor simulado (`claude-haiku-5-5`): 381 mil de entrada y 27 mil de salida.
- Costo: unos cuantos dólares en total. La cifra exacta está en la consola de Anthropic.

## Lista de calibración, para revisar con George

1. **Más de una pregunta por mensaje.** Pasa en 4 de 5 escenarios. Suele ocurrir cuando el agente resume lo registrado y luego pregunta. Es lo que más hace sentir que se llena un formulario.
2. **12 mensajes no alcanzan para los criterios de etapa de Argano.** En E2, E3 y E5 la etapa recomendada quedó en 0 porque el agente no llegó a preguntar esos criterios. Por eso E5, que es un negocio sano, salió rojo por etapa muy inflada (`etapa_inflada_grave`). Hay que decidir dos cosas:
   - si el agente pregunta antes los criterios de la etapa del CRM;
   - si el motor distingue "inflada" de "aún no verificada".
3. **E4: el agente nunca preguntó por la contribución diferenciadora,** y por eso la bandera esperada no apareció. La pregunta debe tener más prioridad cuando la alternativa es interna.
4. **Cuánto razona el modelo.** Hoy usa el nivel que trae la API por defecto. Hay que decidir el equilibrio entre la calidad del diagnóstico y el tiempo y costo por turno, después de que George lo pruebe en el celular.
5. **Definiciones de trabajo por validar:**
   - las posiciones Dominante, Compartida y Alternativa;
   - las prioridades urgente, importante, postergable y activo.
6. **Pendientes de la revisión de instrucciones:**
   - la política del CRO sobre bajar la etapa;
   - los roles sin nombre;
   - las omisiones de las fuentes: el Coach como dueño del compelling event, el quinto factor del Económico, "no contactado = en contra" y el extremo de pánico.
7. **Revisión rápida:** en la primera sesión siempre escala a análisis completo. Es un comportamiento del motor y hay que decidir si se queda así.
8. **Tipos de cambio:** mientras George no los defina, la ficha solo ofrece USD.

## Decisiones tomadas durante la ejecución (para validar con George)

| # | Decisión | Si estuviera mal |
|---|---|---|
| R1 | El diagnóstico se recalcula al inicio de cada turno y se le pasa a las instrucciones. | Un cálculo de más por turno. |
| R2–R3 | Orden de las exportaciones y de los mocks de prueba entre tareas. | Ninguno. |
| R4 | La ficha exige ID del CRM y un tipo válido. | Dos campos más que llenar. |
| R5 | Una sola protección para que ninguna herramienta truene. | Ninguno. |
| R6 | Los criterios de Argano se registran por lotes. | Ninguno. |
| R7 | Los hechos internos de Argano o Netlogistik (PR aprobado, forecast, staffing, "pagan a tiempo") pueden quedar confirmados si el vendedor da una referencia verificable. Sin referencia quedan como supuesto. | La etapa recomendada sale optimista si los vendedores exageran. |
| R8 | Un mensaje del vendedor que empieza con "[" se marca como texto del vendedor, para que no se haga pasar por un mensaje del sistema. | Ninguno. |
| R9 | Los criterios internos guardan la referencia en un campo propio, y se rechazan como confirmados si no la traen. | El vendedor sin referencia queda en supuesto. |
| R10–R12 | Topes de herramientas y de respuestas cortadas, y manejo de oportunidades cerradas, sin romper el historial. | Ninguno. |
| R13 | Al cerrar, cada sesión guarda su conversación completa. El agente solo recuerda los resúmenes. | El almacenamiento del navegador crece. |
| R14 | Iniciar una sesión con otra abierta archiva la abierta como interrumpida. | Queda una sesión sin resumen del agente. |
| R15 | La causa de un error de la API va al log del servidor (tipo y mensaje), nunca a la pantalla. | Ninguno. |
| R16 | El servidor valida la forma del historial. Un historial manipulado pero válido es un riesgo aceptado en la página de prueba. | Quien prueba podría falsificar turnos solo en su propia sesión. |
| R17 | Caché sobre el último mensaje de cada llamada. | Ninguno. |
| R18 | El motor exporta sus funciones de fechas hábiles. | API del motor más amplia. |
| R19 | Los hechos ocultos de los escenarios están escritos en segunda persona. | Ninguno. |
| R20 | Los informes de evaluación no se suben a GitHub; este documento los resume. | No se pueden consultar en GitHub. |
| R21 | El vendedor simulado recibe la fecha de hoy y la ficha. | Ninguno. |
| R22–R23 | **El modelo razona antes de responder, y eso consumía el límite de 1024 tokens, así que el límite subió a 8192.** El nivel de razonamiento queda en el valor por defecto hasta calibrar. | Respuestas más lentas o caras hasta calibrar. |
| R24 | Sin límite de intentos de contraseña en el piloto, porque es una frase de 4 palabras. | Intentos de fuerza bruta que solo gastan invocaciones de Vercel. Se revisa en el Plan 2. |
| R25 | Al navegador solo llega lo que ve el vendedor. Los hechos ocultos y el código del agente se quedan en el servidor. | Ninguno. |
| R26 | La ficha nueva incluye ID del CRM y Tipo. | Dos campos más. |
| R27 | El semáforo dice "Ámbar", no "Amarillo". | Una palabra. |
| R28 | "Iniciar sesión nueva" siempre está disponible, con una confirmación en la misma página. | Ninguno. |
| R29 | La revisión final se hizo antes del despliegue y de las evaluaciones pagadas. | Ninguno. |
| R30 | Ronda única de correcciones finales, que incluye:<ul><li>la oportunidad sigue usable al llegar al tope de 40 mensajes;</li><li>solo USD, con aviso cuando falta el tipo de cambio;</li><li>foto por sesión;</li><li>presupuesto de tiempo por turno;</li><li>el contexto de cada turno se movió al mensaje para aprovechar la caché.</li></ul> | Un cambio más grande justo antes de publicar. Lo cubrieron la re-revisión y la prueba en Vercel. |
| R31 | El presupuesto de 240 s se revisa solo entre llamadas al modelo, así que una llamada lenta todavía puede pasar el límite de 300 s de Vercel. | De vez en cuando, "Error interno" tras una espera larga. El navegador conserva su copia. |

## Pendientes que heredan los planes siguientes

- **Plan 2 (datos, acceso y roles):**
  - Acceso por enlace al correo, para reemplazar la contraseña compartida.
  - Almacenamiento en el servidor: hoy todo vive en el navegador, y la foto por sesión (unos 8 KB) acerca el límite de 1 MB después de algunas docenas de sesiones.
  - Límite de intentos de acceso.
  - La estrategia de datos con TI y legal de Argano. Hasta entonces, solo datos simulados o anonimizados.
- **Plan 4:** tablero para gerentes y director.
- **Seguridad del piloto:**
  - La clave anterior de Anthropic quedó visible en una captura: hay que confirmar que se revocó.
  - Cambiar `CLAVE_PRUEBAS` es la única forma de quitar el acceso.
  - Al terminar el piloto, revocar la clave de la API.
- **Mejoras menores registradas, sin urgencia:**
  - Textos de eventos más detallados.
  - Esquemas de herramientas con más restricciones.
  - Duplicaciones menores de constantes.
  - Pruebas de interfaz unitarias.
  - Formatos decimales de LATAM en el TCV.
