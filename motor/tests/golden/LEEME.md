# Casos de referencia de George

Aquí guardas oportunidades reales (o inventadas) junto con **el diagnóstico que tú darías en un pipeline review**. Cada vez que se corren las pruebas, el motor calcula su propio diagnóstico y lo compara con el tuyo. Si no coinciden, la prueba falla y te dice cuál caso y qué campo.

Un caso = un archivo `.json` dentro de la carpeta `casos/`.

## Cómo agregar un caso

1. En `casos/`, copia uno de los ejemplos (`ejemplo-01-cierre-inflado.json` o `ejemplo-02-sano.json`) y ponle un nombre nuevo, por ejemplo `bimbo-wms-2026.json`.
2. Abre el archivo y cambia:
   - `nombre`: una frase que describa el caso (es lo que verás en los resultados).
   - `hoy`: la fecha "de hoy" para el diagnóstico, en formato `AAAA-MM-DD`. Usa una fecha fija para que el resultado no cambie con el tiempo.
   - `expediente`: los datos de la oportunidad. Va **completo**, no se mezcla con nada; edita lo que cambie y deja el resto como en el ejemplo.
   - `esperado`: lo que tú concluirías (ver abajo).
3. Corre las pruebas desde la carpeta `motor`:

   ```
   npx vitest run tests/golden
   ```

   Verde = el motor coincide contigo. Rojo = el mensaje dice `archivo: campo` con lo esperado y lo obtenido.

## Qué va en `esperado`

Pon **solo** los campos que quieras revisar; los demás se ignoran.

| Campo | Valores | Qué revisa |
|---|---|---|
| `etapaRecomendada` | `0`, `1`, `2`, `3`, `4`, `5` | La etapa que sostienen los criterios de Argano |
| `veredictoFecha` | `"creible"`, `"en_riesgo"`, `"no_cierra_fecha"`, `"no_cierra_periodo"` | Si la fecha de cierre del CRM es creíble (solo existe cuando la oportunidad está en lente de director: etapa 3 o más, o cierre dentro del trimestre) |
| `semaforo` | `"verde"`, `"ambar"`, `"rojo"` | El semáforo del índice de madurez |
| `banderasIncluye` | lista de ids, ej. `["sin_economico"]` | Banderas que **sí** deben aparecer |
| `banderasExcluye` | lista de ids, ej. `["budget_ausente"]` | Banderas que **no** deben aparecer |

Ejemplo:

```json
"esperado": {
  "etapaRecomendada": 2,
  "semaforo": "ambar",
  "banderasIncluye": ["bant_supuesto", "sin_coach_valido"],
  "banderasExcluye": ["sin_economico"]
}
```

## Ids de bandera que puedes usar

Algunas banderas solo se evalúan en una lente: **G** = solo gerente, **D** = solo director, sin marca = ambas.

**Críticas** (cualquiera limita el índice a 40 y pone el semáforo en rojo)

| Id | Significado |
|---|---|
| `sin_economico` | No hay Influencia Económica identificada |
| `economico_sin_cubrir` (D) | Ninguna Influencia Económica ha sido contactada |
| `budget_ausente` | No hay información de presupuesto |
| `no_elegidos_cierre_periodo` (D) | No nos han elegido y el cierre cae dentro del trimestre |
| `etapa_inflada_grave` | La etapa del CRM está 2 o más etapas arriba de lo que sostienen los criterios |

**Altas**

| Id | Significado |
|---|---|
| `bant_supuesto` | Algún elemento de BANT está solo en supuesto |
| `bant_ausente` | Falta información de Authority, Need o Time |
| `ce_incompleto` | Al evento convincente le falta confirmar fecha, dueño o costo de la inacción |
| `ce_urgencia_falsa` | La urgencia del cliente parece falsa |
| `sin_coach_valido` | No hay Coach válido (+3 o más, modo Crecimiento o Problema) |
| `etapa_inflada` | La etapa del CRM está 1 etapa arriba de lo que sostienen los criterios |
| `banco_una_pata` | Solo hay una Influencia contactada |
| `rfp_sin_contacto_previo` (G) | Es un RFP sin contacto previo con el cliente |
| `atorada` | Superó el ciclo normal de venta |
| `sow_requerido_solo_oc` (D) | El cierre requiere SOW pero la ruta es solo con orden de compra |
| `no_cierra_fecha` (D) | Los pasos pendientes de cierre no caben antes de la fecha del CRM |
| `influencia_alta_no_contactada` | Hay una Influencia de grado alto sin contactar |
| `sin_contribucion_diferenciadora` | No se identificó nuestra contribución diferenciadora |
| `alternativas_no_identificadas` | No se ha preguntado por la competencia ni las alternativas |
| `cierre_despues_ce` | La fecha de cierre es posterior a la del evento convincente |
| `urgente_sin_ce` | El cliente dice que es urgente pero no hay evento convincente con fecha |

**Medias**

| Id | Significado |
|---|---|
| `influencia_nueva_puesto` | Hay Influencias nuevas en el puesto |
| `reorganizacion` | El cliente está en una reorganización |
| `informacion_incierta` | Hay varias Influencias Económicas; no está claro quién decide |
| `modo_calificacion_inconsistente` | Calificación positiva con modo Equilibrio o Exceso de confianza |
| `modo_no_determinado` | Influencias contactadas sin modo determinado |
| `nula_sin_criterios` | Sin alternativas, pero tampoco hay criterios de compra definidos |
| `euforia_con_banderas` | El vendedor está eufórico, pero hay banderas críticas o altas |
| `prioridad_incongruente` | La prioridad no cuadra con el modo de los Económicos o con la etapa |
| `tr_no_redactado` | Falta el Triunfo-Resultado de una Influencia de grado alto o medio |
| `dato_caduco` | Datos confirmados hace más de 90 días |
| `influencia_sin_contacto` | Una Influencia lleva más de 60 días sin contacto |
| `crm_desactualizado` | Valores, actividades o etapas del CRM no reflejan la realidad |
| `grado_bajo_ignorado` | Influencias de grado bajo sin contactar |
| `fecha_optimista` (G) | La fecha de cierre del CRM es optimista para el ciclo normal |

## Si algo falla

- **"el expediente no es válido"**: hay un dato fuera de rango o una fecha mal escrita (por ejemplo `2026-13-01`). El mensaje dice el campo exacto.
- **"la bandera ... debería estar activa / no debería estar activa"**: el motor y tú difieren en esa bandera. Ahí hay algo que revisar: o el caso, o la regla.
- **Error de JSON** (comas, comillas): revisa que cada línea termine en coma salvo la última de cada bloque, y que los textos vayan entre comillas dobles.
- Los dos ejemplos son plantillas; no los borres, te sirven de guía de qué campos lleva un expediente.
