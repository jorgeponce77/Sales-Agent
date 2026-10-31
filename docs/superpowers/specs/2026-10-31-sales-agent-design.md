# Sales Agent — Especificación de diseño (v1)

**Fecha:** 31-oct-2026 · **Autor del criterio comercial:** George López (Sr. Sales Director LATAM, Netlogistik / Argano) · **Estado:** borrador para revisión de George

**Documentos de conocimiento que esta especificación usa como fuente de reglas** (viven en el Proyecto "Sales Agent" y en `docs/conocimiento/`):

| Doc | Contenido |
|---|---|
| 01-inventario-fuentes | Campos de Hojas Azul, Verde y Dorada · etapas y probabilidades de Argano · definiciones de George (competencia, prioridades) · ciclos de venta · tipos de oportunidad · compuertas |
| 02-metodologia-reglas | *The New Strategic Selling* convertido en reglas: influencias, grado, banderas rojas, modos, escala −5..+5, Triunfo-Resultados, competencia, embudo, cliente ideal, plan de acción |
| 03-reglas-pipeline-review-george | Pregunta de apertura · lentes gerente y director · prueba de fecha de cierre · criterio de cierre (OC o contrato) · BANT · compelling event · higiene de CRM |

Si esta especificación y un documento de conocimiento se contradicen en el detalle de una regla, manda el documento de conocimiento. Esta especificación define el producto; los documentos definen el criterio.

---

## 1. Objetivo

Construir una plataforma donde un agente de IA entreviste a los ejecutivos de ventas sobre sus oportunidades, como lo harían George o sus gerentes. El agente califica la madurez de cada oportunidad, detecta riesgos y contradicciones, y recomienda la estrategia y las siguientes acciones. Se apoya en la metodología Miller Heiman (Strategic Selling y Conceptual Selling), en las etapas oficiales de Argano y en las reglas de pipeline review de George.

**Criterios de éxito**
1. El diagnóstico del agente coincide con lo que George concluiría en un pipeline review de la misma oportunidad.
2. Los vendedores lo usan sin sentir que llenan un formulario.

## 2. Usuarios, roles y visibilidad

| Rol | Ve | Puede |
|---|---|---|
| **Vendedor** | Sus oportunidades | Conversar con el agente, corregir datos de sus expedientes |
| **Gerente** | Las oportunidades de su equipo | Todo lo del vendedor sobre su equipo; comentar; aprobar o rechazar solicitudes de compuerta |
| **Director** (George) | Todo | Todo lo anterior; dar de alta usuarios, equipos y roles; editar la configuración |

- **Visibilidad total:** gerentes y director ven expediente, diagnóstico **y la conversación completa** (decisión de George).
- **Transparencia hacia el vendedor:** desde la primera sesión, el agente informa que la conversación la verán su gerente y la dirección. El tono es de coaching, no de auditoría.
- **Acceso:** enlace mágico por correo, sin contraseñas. El director da de alta cada usuario con su rol y su equipo.
- **Idiomas:** el agente responde en el idioma del vendedor (español o inglés). Expedientes, diagnósticos y tablero quedan siempre en español.

## 3. Alcance por fases

| Fase | Incluye |
|---|---|
| **v1 — Piloto** | Acceso y roles · cuentas, oportunidades y personas · modos **Calificar/actualizar** y **Revisión rápida** · motor de reglas completo · expediente con historial · vista **Forecast** · panel de configuración |
| **v1.1** | Modos **Preparar reunión** (Hoja Verde) y **Debrief** · vistas **Pipeline/Embudo** y **Equipo/Coaching** · **Solicitudes de revisión de compuerta** |
| **Fase 2** | **Hoja Dorada** (plan de cuenta, LAMP) · integración con **Salesforce** (higiene de CRM automática) · avisos y resumen semanal por correo |

**Fuera de alcance de v1:** integración con CRM, uso sin conexión, notificaciones push, app nativa iOS/Android y modelos de IA locales.

## 4. Modos de uso y flujo de sesión

**Entrada:** el vendedor ve la lista de sus oportunidades con semáforo y un botón "Nueva oportunidad". Puede escribir o usar el dictado del teléfono.

### 4.1 Calificar o actualizar (v1, modo por defecto)

1. **Si la oportunidad es nueva**, el agente abre con "¿Cuál es el estatus del negocio?" y espera un resumen ejecutivo.
2. **Si la oportunidad ya existe**, el agente resume en dos líneas el último estado (etapa, fecha creíble, banderas críticas) y pregunta "¿Qué cambió desde el [fecha]?". Después **revisa cada acción abierta del plan anterior**: "Quedaste de hablar con el CFO el viernes, ¿cómo te fue?".
3. **Extrae** de la narración todo lo que pueda y lo registra en el expediente con su nivel de evidencia.
4. Le pide al motor la lista de **huecos y contradicciones priorizados** y pregunta en ese orden (ver §5).
5. **Cierre de sesión:** "Esto es lo que entendí" (el vendedor confirma o corrige) → diagnóstico (§7.9) → plan de acción → se guarda una foto del expediente y se actualiza el tablero.

### 4.2 Revisión rápida (v1)

Dura unos 5 minutos. Cubre las 4 preguntas del libro (¿conozco a todos mis compradores, o al menos al Económico? · ¿conozco sus Triunfo-Resultados? · ¿me apalanco en fortalezas y ataco banderas rojas? · ¿tengo un Coach confiable?) más BANT y compelling event. Entrega un semáforo y la acción más importante.

### 4.3 Preparar reunión (v1.1, Hoja Verde)

El agente pregunta con quién es la reunión (de entre las influencias del expediente), cuál es el Concepto de esa persona, la Razón Válida de Negocio y la credibilidad. Con eso arma las preguntas a usar (confirmación, nueva información, actitud, compromiso, problemas básicos), los valores únicos ("¿y qué?", "pruébelo") y el compromiso máximo y mínimo. Entrega un plan de reunión de una página.

### 4.4 Debrief después de la reunión (v1.1)

Recorre las 8 preguntas de valoración de la Hoja Verde y pregunta qué se aprendió. Actualiza el expediente: personas nuevas, modos, calificaciones, BANT, compelling event y cadena de cierre.

### 4.5 Lentes

- **Lente gerente:** etapas 0 a 2. Pregunta por estrategia, cobertura de influencias y Hoja Azul.
- **Lente director:** etapas 3 y 4, **o** fecha de cierre dentro del mes o trimestre en curso. Aplica la prueba de fecha de cierre (doc 03 §3).
- La lente se elige sola, según la etapa en CRM y la fecha de cierre.

### 4.6 Análisis completo obligatorio

El agente no permite la revisión rápida (y la sesión completa no se puede saltar temas) cuando aplica alguno de estos casos:
- Cuenta heredada o cambio de dueño de la oportunidad.
- Monto alto (umbral configurable).
- Competencia fuerte o desconocida.
- Mercado o cliente nuevo importante.
- Oportunidad atorada: su antigüedad supera el ciclo normal de su línea.
- La fecha de cierre ya pasó.
- Revisión próxima con el gerente.
- Falta información esencial.

## 5. Reglas de conversación del agente

1. **Una pregunta a la vez**, dos como máximo si están ligadas. Siempre explica en una línea **por qué** pregunta.
2. **Orden de preguntas:** primero huecos que generarían banderas **críticas**, luego **altas**, luego **medias**. Dentro de cada nivel manda la lente activa. Nunca pregunta algo que el vendedor ya dijo.
3. **Repregunta lo vago.** Toda afirmación sin fuente del cliente se registra como **Supuesto**. Por ejemplo, ante "sí hay presupuesto" el agente pregunta "¿quién del cliente te lo confirmó?".
4. **"No sé" es válido.** Se registra como **Ausente**, prende bandera y se agrega a "Información que necesitamos — ¿de quién?".
5. **Nunca inventa datos** ni infiere nombres, montos o fechas.
6. **No contradice al motor.** Etapas, fechas, probabilidades, banderas e índice vienen del motor; el agente los explica, no los recalcula.
7. **Cuida el tiempo.** Una sesión completa dura 15 a 20 minutos como máximo; si se excede, el agente propone pausar. Las sesiones se pueden retomar.
8. **Detecta euforia.** Si el vendedor se declara Eufórico o Excelente pero la oportunidad tiene banderas altas o críticas, el agente lo señala.

## 6. Modelo de datos

Todo dato capturado del negocio lleva **evidencia**: `valor`, `nivel` (Confirmado / Supuesto / Ausente), `fuente` (persona del cliente que lo dijo, o "vendedor"), `fecha`, `sesión`.

| Entidad | Campos principales |
|---|---|
| **Usuario** | nombre, correo, rol, equipo, gerente, idioma |
| **Equipo** | nombre, gerente, país(es) |
| **Cuenta** | nombre, país, industria, ¿cliente de Netlogistik?, ¿cliente de otra Tower de Argano?, **5 criterios de cliente ideal** (−5..+5 con evidencia) |
| **Persona** (a nivel cuenta) | nombre, puesto, ubicación, ¿nueva en el puesto?, fecha de último contacto |
| **Oportunidad** = un SSO | dueño, cuenta, SSO redactado, línea de producto (WMS / TMS / Planeación de la demanda / Voice; si son varias, ver §13), monto + moneda + monto en USD, **etapa CRM**, **fecha de cierre CRM**, tipo (NN/ENxT/EN/EE), fecha de creación, nivel de embudo, sensación del vendedor (Eufórico…Pánico), estado de higiene de CRM (3 preguntas) |
| **Influencia en oportunidad** | persona, rol(es) E/U/T/Coach, grado A/M/B, modo C/P/E/EC, calificación −5..+5 (sin 0), ¿contactada? y por quién, Triunfo-Resultado (Resultado, Triunfo, declaración), prioridad que expresa |
| **Alternativa competitiva** | tipo (proveedor / interna / presupuesto en otra cosa / no hacer nada), nombre, nuestra posición (Dominante / Nula / Compartida / Alternativa), ¿se hizo la pregunta directa?, ventajas y debilidades |
| **BANT** | 4 elementos × evidencia |
| **Compelling event** | descripción, fecha fija, dueño, costo de inacción (cada uno con evidencia), ¿urgencia falsa? |
| **Cadena de cierre** | ruta (contrato / OC / ambas, con orden), ¿requiere SOW?, pasos a–h (doc 03) con estado y fecha |
| **Criterios Argano** | checklist de "completar para avanzar" por etapa (doc 01 §1) con evidencia |
| **Fortaleza / Bandera roja** | generadas por el motor: id de regla, severidad, texto, fecha de apertura y cierre |
| **Acción** | qué, quién, cuándo, bandera o fortaleza que atiende, estado (abierta / cumplida / no cumplida), verificada en la sesión |
| **Sesión** | modo, lente, fecha, transcripción completa, resumen corto (para la memoria del agente) |
| **Foto** | copia completa del expediente y del diagnóstico al cerrar cada sesión (para el historial) |
| **Comentario** | autor (gerente o director), texto, fecha |
| **Solicitud de compuerta** (v1.1) | tipo (Qualification / Deal Approval), evidencia, estado, aprobador, comentario |
| **Bitácora de cambios** | entidad, campo, valor anterior y nuevo, quién, cuándo. Nada se borra |

**Memoria entre sesiones:** el agente recibe el expediente estructurado, el último diagnóstico, las acciones abiertas y los resúmenes cortos de sesiones anteriores. No recibe transcripciones completas.

**Caducidad (valores configurables):**
- Un dato Confirmado con más de 90 días se marca para revalidar.
- Una influencia sin contacto en 60 días se marca.

## 7. Motor de reglas

Es código determinista: la misma entrada siempre da la misma salida. Lee el expediente y la configuración, y produce el diagnóstico.

### 7.1 Tipo de oportunidad y probabilidad oficial

- Árbol de clasificación: ¿change order? → **EE** · si no, ¿ya es cliente de Netlogistik? → **EN** · si no, ¿es cliente de otra Tower de Argano? → **ENxT** · si no → **NN**.
- **Probabilidad declarada** = tabla de Argano (etapa CRM × tipo).
- **Probabilidad ajustada** = tabla de Argano (etapa recomendada × tipo).

### 7.2 Etapa recomendada

- Es la etapa más alta *k* tal que todos los criterios obligatorios ("completar para avanzar") de las etapas 0 a *k*−1 están **Confirmados**.
- Reglas adicionales de George:
  - Etapa ≥4 exige el paso a (el cliente nos eligió) Confirmado.
  - Etapa 5 exige el entregable de cierre: OC **o** contrato firmado. Si el negocio requiere SOW, exige además el SOW firmado.
- Comparación contra la etapa del CRM:
  - **Inflada** si CRM > recomendada.
  - **Rezagada** si CRM < recomendada.
  - **Al día** si son iguales.
- El motor solo recomienda: el cambio de etapa en CRM lo hace el vendedor, y las compuertas las aprueban el gerente o George.

### 7.3 Fecha de cierre creíble (lente director)

1. Si el paso a no se cumple → veredicto **"No cierra en el periodo"**. Fin.
2. Se determina la ruta:
   - **Contrato:** pasos b–e, 5 días hábiles por cada paso pendiente.
   - **OC:** alta de proveedor (3) + OC (3).
   - Si se requiere SOW, si la OC depende del contrato o si la ruta es desconocida → se usa la ruta contrato.
3. **Fecha creíble** = hoy + suma de días hábiles pendientes, sin contar fines de semana ni festivos del **país de la cuenta**.
4. Veredicto:
   - **Creíble** si fecha CRM ≥ creíble + 5 días hábiles.
   - **En riesgo** si fecha CRM ≥ creíble con menos de 5 días hábiles de holgura.
   - **No cierra en la fecha** si fecha CRM < creíble; en ese caso se sugiere la fecha creíble.
5. **Acelerador sugerido:** iniciar el alta de proveedor y la OC en paralelo desde el paso a. Se muestra como recomendación; no cambia el cálculo.

**Lente gerente (regla de fecha optimista):**
- En etapas 0–1, la fecha del CRM debe ser ≥ hoy + 50% del ciclo de su línea.
- En etapa 2, debe ser ≥ hoy + 25% del ciclo.
- Si no se cumple, se marca la bandera media "Fecha optimista para la etapa".
- Los porcentajes son configurables y se calibran en el piloto.

### 7.4 Embudo

- El nivel se deriva de los requisitos del doc 02 §6:
  - **Universo:** solo hay ajuste con el perfil de cliente ideal.
  - **Arriba:** hay datos de una necesidad inmediata.
  - **En el embudo:** al menos una influencia contactada y una discrepancia de Crecimiento o Problema verificada.
  - **Pocos selectos:** todo cubierto y cierre en ≤ ½ ciclo de su línea con ≥90%.
- **Atorada:** la antigüedad supera el ciclo de su línea (WMS 8 · TMS 10 · Planeación de la demanda 6 · Voice 9 meses).

### 7.5 Catálogo de banderas rojas (v1)

| Severidad | Reglas |
|---|---|
| **Crítica** (limita el índice a 40) | Sin Económico identificado · Económico sin cubrir con lente director · Budget Ausente · Paso a no cumplido con cierre en el periodo · Etapa inflada ≥2 niveles |
| **Alta** | Cualquier elemento de BANT en Supuesto · Authority, Need o Time Ausente · Compelling event incompleto o urgencia falsa · Sin Coach válido (Coach con < +3, o en Equilibrio o Exceso de confianza) · Etapa inflada 1 nivel · Una sola persona de contacto ("banco de una pata") · RFP sin contacto previo con influencias · Oportunidad atorada · Requiere SOW y el cierre es solo con OC · Fecha "No cierra en la fecha" · Influencia de grado Alto no contactada · Sin contribución diferenciadora · Alternativas competitivas no identificadas · Fecha de cierre posterior a la fecha del compelling event · Prioridad "Urgente" sin compelling event |
| **Media** | Las 5 banderas automáticas del libro no cubiertas arriba (persona nueva en el puesto, reorganización, información incierta) · Inconsistencia modo–calificación (Equilibrio o Exceso de confianza con calificación positiva) · Modo no determinado · Posición Nula sin criterios de compra ni caso de negocio · Vendedor eufórico con banderas altas o críticas · Prioridad incongruente con el modo o la fecha · Triunfo-Resultado no redactado en influencias A/M · Datos caducos · CRM sin actualizar · Influencia de grado Bajo ignorada · Fecha optimista para la etapa |

### 7.6 Fortalezas

Coach válido · Económico cubierto con calificación ≥+3 · BANT 4/4 Confirmado · compelling event con sus 3 elementos Confirmados · posición Dominante con contribución diferenciadora · perfil de cliente ideal con promedio ≥+3 · Triunfo-Resultados redactados en todas las influencias A/M · varias influencias en Crecimiento o Problema con calificación positiva.

### 7.7 Índice de madurez (0–100)

Los pesos los fijó George; el detalle de cada componente es una propuesta inicial a calibrar en el piloto. Todos los valores son editables en la configuración.

| Componente | Peso | Cálculo propuesto |
|---|---|---|
| Influencias y cobertura | 20 | Económico identificado 5 · Económico cubierto 4 · Coach válido 4 · al menos un U y un T con nombre 3 · % de influencias contactadas × 2 · sin inconsistencias modo–calificación 2 |
| BANT | 20 | 5 por elemento: Confirmado 5 · Supuesto 2 · Ausente 0 |
| Compelling event | 20 | Fecha fija 7 · dueño 7 · costo de inacción 6. Confirmado = 100%, Supuesto = 50%, Ausente = 0. Urgencia falsa = 0 en todo el componente |
| Triunfo-Resultados | 10 | % de influencias con declaración, ponderado por grado (A = 2, M = 1, B = 0.5) × 10 |
| Competencia y posición | 10 | Alternativas identificadas y pregunta directa hecha 3 · posición (Dominante 5, Nula 5, Compartida 3, Alternativa 1) · contribución diferenciadora 2 |
| Perfil de cliente ideal | 10 | (promedio de los 5 criterios + 5), en escala 0–10 |
| Coherencia de etapa y fecha | 10 | Etapa: al día 5 · rezagada 4 · inflada 0. Fecha con lente director: Creíble 5 · En riesgo 2 · No cierra 0. Fecha con lente gerente: sin bandera de fecha optimista 5 · con bandera 2 |

- Si un componente no tiene datos, vale 0. Así se incentiva completar el expediente.
- Cualquier bandera **crítica** limita el índice a un máximo de **40**.
- **Semáforo:**
  - **Verde:** ≥70 sin críticas.
  - **Ámbar:** 40–69.
  - **Rojo:** <40 o con alguna crítica.

### 7.8 Validación del plan de acción

- El agente propone de 4 a 5 acciones. El motor acepta solo las que cumplen todo esto:
  - Atienden una bandera o se apalancan en una fortaleza (regla de oro).
  - Tienen **quién** y **cuándo**.
  - El "cuándo" cae dentro de los próximos 30 días (configurable).
- Las acciones se ordenan por la severidad de la bandera que atienden.
- En la siguiente sesión, cada acción abierta se marca como cumplida o no cumplida.

### 7.9 Diagnóstico (salida del motor)

- Índice y semáforo.
- Etapa CRM vs. recomendada.
- Probabilidad declarada vs. ajustada.
- Fecha CRM vs. creíble, con veredicto.
- Nivel de embudo.
- BANT (4 × nivel).
- Compelling event.
- Banderas rojas por severidad y fortalezas.
- Información que necesitamos (qué y de quién).
- Plan de acción validado.

El agente redacta encima un resumen ejecutivo de 3 a 5 líneas, sin cambiar ningún valor.

## 8. Agente de IA

- **Modelo:** Claude por API (familia Sonnet para la conversación, por latencia y costo; el modelo es configurable).
- **Instrucciones del sistema:** se arman a partir de los documentos 01–03, la configuración vigente, la lente y el modo. Están versionadas: cada sesión guarda con qué versión de instrucciones se hizo.
- **Herramientas que el agente puede usar** (todas pasan por el backend; la IA nunca escribe directo en la base de datos):
  - `leer_expediente`
  - `registrar_dato` (campo, valor, nivel, fuente)
  - `registrar_persona` y `registrar_influencia`
  - `registrar_alternativa`
  - `actualizar_cadena_cierre`
  - `obtener_huecos_priorizados`
  - `calcular_diagnostico`
  - `proponer_acciones`
  - `cerrar_sesion`
- **Errores:** si falla la API, la sesión se guarda en el punto en que iba y el vendedor puede reintentar o retomar después. Si una herramienta rechaza un dato (por ejemplo, una calificación 0 o una fecha inválida), el agente repregunta.

## 9. Tablero

Todas las vistas se filtran por país, gerente, vendedor, línea de producto y periodo. Los montos se consolidan en **USD**, con un tipo de cambio fijo que el director actualiza.

1. **Forecast** (v1):
   - Oportunidades con cierre en el mes o trimestre, mostrando por cada una: monto, etapa CRM vs. recomendada, probabilidad declarada vs. ajustada, fecha CRM vs. creíble con veredicto, compelling event, BANT en 4 puntos y semáforo.
   - Totales arriba: **forecast ponderado declarado vs. ajustado**.
2. **Pipeline y embudo** (v1.1): distribución por nivel de embudo y por etapa de Argano. Alertas de embudo que se seca, oportunidades atoradas y etapas infladas.
3. **Expediente** (v1): diagnóstico actual, evolución del índice, la etapa y la fecha creíble, mapa de influencias, plan de acción y su cumplimiento, conversación completa y comentarios.
4. **Equipo y coaching** (v1.1): por vendedor, índice promedio, banderas críticas abiertas, % de acciones cumplidas, CRM al día y sesiones del mes. Detecta patrones, por ejemplo: "no llega al Económico en 4 de 6".
5. **Solicitudes de compuerta** (v1.1): bandeja del gerente para aprobar o rechazar con comentario. El agente verifica en la siguiente sesión que el vendedor haya actualizado la etapa en el CRM.

## 10. Panel de configuración (director)

Editable sin programar: pesos y fórmulas del índice · umbrales del semáforo · ciclos por línea · días por paso de la cadena de cierre · festivos por país · tipos de cambio · probabilidades de Argano · criterios de cliente ideal · umbral de "monto alto" · caducidades · horizonte del plan de acción · usuarios, equipos y roles.

## 11. Arquitectura técnica

| Pieza | Tecnología propuesta |
|---|---|
| App | Next.js como PWA instalable, enfocada en celular y también usable en laptop |
| Despliegue | Vercel (cuenta de George ya conectada) |
| Base de datos | Postgres con seguridad por fila según rol y equipo |
| Acceso | Enlace mágico por correo; alta controlada por el director |
| Motor de reglas | Módulo TypeScript de funciones puras, sin dependencias de la IA |
| Agente | Claude API con uso de herramientas |

**Datos y alojamiento:** la estrategia de manejo de datos se definirá después con George y con TI o legal de Argano. Opciones en evaluación:
- (b) nube administrada.
- (c) nube de Argano (por ejemplo AWS, donde Claude también está disponible).
- b para el piloto y c para producción.

El diseño no depende de esta decisión. Mientras tanto, el piloto usa **datos de prueba o anonimizados**.

## 12. Pruebas y validación

1. **Motor de reglas con desarrollo guiado por pruebas.** Cada regla de los documentos 01–03 tiene al menos un caso de prueba. Ejemplos: el de 21 días hábiles de la cadena de cierre, el de etapa inflada sin "proveedor elegido" y el de Coach con +2.
2. **Casos de referencia ("golden set").** George califica de 10 a 15 oportunidades, reales anonimizadas o simuladas, con el diagnóstico que él daría. El agente debe llegar a la misma etapa recomendada, al mismo veredicto de fecha y a las mismas banderas críticas y altas.
3. **Vendedores simulados.** Conversaciones de prueba con respuestas vagas, contradictorias o eufóricas, para verificar que el agente repregunta y no inventa datos.
4. **Piloto:** un equipo de 3 a 5 vendedores durante 4 semanas. Mide:
   - (a) coincidencia con el pipeline review de George.
   - (b) uso: sesiones por vendedor por semana y abandono.
   - (c) percepción de los vendedores sobre si se siente como un formulario.
   - Calibra el índice y los umbrales.

## 13. Supuestos y decisiones pendientes

- **Oportunidad con varias líneas** (por ejemplo, WMS + TMS): se usa el ciclo **más largo**. Supuesto pendiente de confirmar.
- **Dominante:** hay alternativas, pero somos claramente la opción preferida. Supuesto pendiente de confirmar.
- **"No hacer nada"** como cuarto tipo de competencia. Propuesta pendiente de validar.
- **Festivos:** los del país de la cuenta.
- **Umbral de "monto alto"** para exigir el análisis completo: lo define George.
- **Estrategia de datos y alojamiento:** se define más adelante.
- **Calibración del índice:** se hará en el piloto.
