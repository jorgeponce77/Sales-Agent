# Motor de reglas — Resultado de la ejecución (1-nov-2026)

Rama `feat/motor-de-reglas`. 10 tareas, cada una con revisión independiente, más una revisión final de toda la rama y una ronda de correcciones. Resultado: **407 pruebas pasan** y `tsc` está limpio.

## Decisiones tomadas durante la ejecución (para validar con George)

| # | Decisión | Si estuviera mal |
|---|---|---|
| R1–R4 | Las reglas compartidas (Coach válido, Triunfo-Resultado redactado, grado A/M, entregable de cierre) viven en un solo lugar y todas las partes del motor las reutilizan. | Solo implica reorganizar código; no cambia ninguna regla. |
| F1 | Un negocio **ganado** (etapa 5 con OC o contrato) no muestra señales de forecast: etapa recomendada 5, al día, probabilidad ajustada 100% y sin veredicto de fecha. | Si George prefiere ver también las señales de los negocios ganados, el cambio es trivial. |
| F2 | El campo "información que necesitamos: **¿de quién?**" y la vista completa del diagnóstico (BANT, compelling event, acciones) se arman en el Plan 3 (agente y backend). El motor ya entrega todos los datos necesarios. | El Plan 3 agrega un campo. |
| F3 | El agente no repregunta riesgos que el vendedor ya informó: reorganización, persona nueva en el puesto y urgencia falsa. | El agente haría menos seguimiento sobre esos riesgos. |
| F4 | En el índice, "sin inconsistencias" (2 puntos) solo se otorga si hay al menos una influencia registrada. | Se recalibra en el piloto. |
| F5 | Los festivos de México están cargados hasta 2027. Los años siguientes y los demás países se configuran en el panel. | Fechas posteriores a 2027 no descontarían festivos mientras no se configuren. |

## Pendientes que heredan los planes siguientes

- **Plan 3 (agente):**
  - Agregar el campo `deQuien` a los huecos (F2).
  - La herramienta `registrar_dato` debe **reemplazar** el valor de un criterio, no duplicarlo: si un criterio queda registrado a la vez como supuesto y como confirmado, el motor lo toma como confirmado.
  - Marcar las acciones previas como cumplidas o no cumplidas en cada sesión.
- **Plan 3 o 4:**
  - En un negocio ganado, el componente "coherencia" del índice todavía usa la comparación de etapa sin ajustar. Se corrige con una línea.
  - Validar la fecha "hoy" que envía el backend.
- **Panel de configuración (Plan 2 o 4):** festivos de 2028 en adelante y de otros países, umbral de "monto alto" y calibración de porcentajes y pesos.
- **Por confirmar con George:**
  - La ruta del contrato termina con la firma: 15 días hábiles si ya se envió el contrato. El ejemplo original del doc 03 sumaba 21 días porque incluía altas y orden de compra.
  - Las condiciones "Pocos selectos sin compelling event" y "Lente director sin compelling event" (doc 03 §3c) no están en el catálogo de banderas de la v1.

## Mejoras menores registradas (sin urgencia)

Faltan pruebas de borde adicionales: trimestres a mitad de año, el límite exacto de 240 días para "atorada", la combinación de ruta independiente con SOW y los casos de un solo elemento del compelling event. También quedan algunas aserciones de pruebas que conviene ajustar, y falta el campo `engines` en `package.json`.
