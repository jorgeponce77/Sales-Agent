# Sales Agent — Reglas de pipeline review de George (v1)

Preguntas y criterios que George usa en sus revisiones de pipeline. Fuente: George, 31-oct-2026. Lo marcado como *propuesta* está pendiente de su validación.

## 1. Pregunta de apertura

**"¿Cuál es el estatus del negocio?"** George espera un resumen ejecutivo del vendedor.

*Propuesta de uso en el agente:*
- Es siempre la primera pregunta.
- El agente extrae de la narración libre todos los campos que pueda (SSO, monto, fecha de cierre, etapa, influencias, competencia, prioridad, siguiente paso) y **solo pregunta lo que falta o lo que no cuadra**. Así no se siente como llenar un formulario.
- También evalúa la calidad del resumen: si el vendedor no menciona monto, fecha o siguiente paso, eso ya es una señal.

## 2. Quién pregunta qué, según la etapa

- Los **gerentes** hacen las preguntas y definen la estrategia en las **etapas tempranas**.
- **George** entra en las **etapas finales**, sobre todo para leer forecast y pipeline. Por ejemplo, revisa las oportunidades con fecha de cierre en el mes en curso.

*Propuesta para el agente:* dos "lentes" que se activan según la oportunidad.
- **Lente gerente:** etapas 0 a 2. Hoja Azul, estrategia, cobertura de influencias y Hoja Verde.
- **Lente director:** etapas 3 y 4, o fecha de cierre dentro del mes o trimestre en curso. Aquí se aplica la Prueba de fecha de cierre.

## 3. Prueba de fecha de cierre (lente director)

Es una cadena secuencial. Cada paso que todavía no está cumplido suma días a la fecha de cierre más temprana que se puede creer.

| Paso | Pregunta | Si NO está cumplido |
|---|---|---|
| a | ¿El cliente ya comunicó que somos el proveedor elegido? | **Te falta mucho. No cierra este mes.** Fin de la prueba. |
| b | ¿Ya se envió el contrato? | +5 días para enviarlo |
| c | ¿El cliente ya envió comentarios al contrato? | +5 días para recibir los comentarios |
| d | ¿El contrato ya está en firma? (comentarios negociados) | +5 días para negociar los comentarios |
| e | ¿El contrato ya está firmado? | +5 días para recabar las firmas |
| f | ¿Ya se dio de alta al cliente, y el cliente ya nos dio de alta como proveedor? | +3 días para las altas |
| g | Con ambas altas hechas, ¿ya se puede facturar? ¿Se necesita orden de compra? | — |
| h | Si se necesita orden de compra, ¿ya la tenemos? | +3 días para obtenerla |

**Cálculo:** fecha de cierre creíble más temprana = hoy + la suma de los días de los pasos pendientes. El máximo es 26 días, cuando el cliente ya nos eligió pero no ha pasado nada más.

*Ejemplo:* el cliente ya nos eligió y ya tiene el contrato, pero no ha mandado comentarios. Faltan c + d + e + f + h = 5 + 5 + 5 + 3 + 3 = **21 días**.

**Uso:** esta línea de tiempo determina si una oportunidad está efectivamente en **Negociación (3)** o **Finalización (4)**. Para estar ahí se requiere, por lo menos, la suma de actividades y días.

*Propuesta de veredicto del agente:*
- **Creíble:** la fecha en CRM es igual o posterior a la fecha creíble.
- **En riesgo:** hay menos de 5 días de holgura.
- **No cierra en la fecha:** la fecha en CRM es anterior a la fecha creíble. El agente sugiere una nueva fecha.

*Propuesta de acciones para acortar el plazo:* arrancar en paralelo el alta de proveedor y el trámite de la orden de compra desde que el cliente nos elige, para no esperar a la firma. Es una recomendación; el cálculo base sigue siendo secuencial.

*Cruce con las etapas de Argano (propuesta):*
- **a = no** con etapa 4 o con fecha de cierre en el mes → etapa inflada. Argano exige acuerdo verbal del cliente para la etapa 4.
- **a = sí, b–c en curso** → coherente con la etapa 3 (Negotiating: SOW, precios y T&C se finalizan con el cliente).
- **d = sí** (en firma) → coherente con la etapa 4 (SOW enviado a firma).
- **e = sí** (firmado) → corresponde a la etapa 5 (Won). Los pasos f–h son lo que falta para facturar.

### Criterio de cierre en el CRM (George, 31-oct-2026)

Para cerrar una oportunidad en el CRM se necesita **uno de dos entregables: la orden de compra o el contrato firmado**. Lo ideal es tener los dos.

*Propuesta de cómo el agente calcula la fecha creíble:*
- Hay dos rutas posibles de cierre. El agente pregunta **cómo compra este cliente**: ¿cierra con contrato, con orden de compra, o con ambos? Y si son ambos, ¿en qué orden?
  - **Ruta contrato:** a → b → c → d → e. Cierra con el contrato firmado. Si solo se ha cumplido el paso a, son 20 días.
  - **Ruta orden de compra:** a → alta de proveedor (+3 si falta) → orden de compra (+3 si falta). Cierra al recibir la orden de compra. Si solo se ha cumplido el paso a, son 6 días.
- **Fecha creíble** = hoy + los días restantes de la ruta que el cliente realmente usa. Si el cliente emite las dos y la orden de compra depende del contrato firmado, se usa la ruta contrato. Lo mismo si no se sabe cuál usa, por ser la más conservadora.
- **SOW firmado (George):** en algunos casos sí se requiere y en otros no. *Regla:* el agente pregunta en cada oportunidad si este negocio requiere SOW firmado. Si lo requiere y el plan de cierre es solo con orden de compra, avisa: "Argano requiere el SOW firmado en Contract Wrangler para marcarlo Won". La ruta del contrato pasa a ser obligatoria para calcular la fecha creíble.

**Días hábiles (confirmado por George).** *Propuesta:* excluir también los días festivos del país del cliente (la operación cubre varios países de LATAM).

## 3b. BANT (se pregunta constantemente en el ciclo)

George o el gerente preguntan: **"¿Cuál es el BANT de la cuenta?"** (Budget, Authority, Need, Time). **Si falta cualquiera de las cuatro definiciones, se prende una bandera roja.** Cualquier ausencia indica riesgo para garantizar el cierre.

*Propuesta de validación y vínculo con Miller Heiman y Argano:*

| Elemento | Qué valida el agente | Vínculo |
|---|---|---|
| **Budget** | ¿Hay monto asignado o aprobado? ¿En qué partida? ¿Quién lo libera? ¿O solo "se espera"? | Influencia Económica (libera los fondos) · Argano etapa 1: "budget in place or strongly anticipated" · competencia "presupuesto en otra cosa" |
| **Authority** | Nombre del Económico de ESTE SSO, si está contactado o cubierto, su grado de influencia y el proceso de aprobación | Influencias compradoras · bandera roja automática por base no cubierta |
| **Need** | ¿Cuál es la discrepancia (Crecimiento o Problema)? ¿Está cuantificada? ¿Quién la siente? | Modos de respuesta · Triunfo-Resultados · Concepto |
| **Time** | Fecha de decisión y **por qué esa fecha** | Fecha de cierre · prioridad · compelling event |

**Niveles (confirmado por George):** Confirmado (con evidencia: quién lo dijo y cuándo) · Supuesto (el vendedor lo cree) · Ausente. Tanto Supuesto como Ausente prenden bandera roja; en el libro, la incertidumbre sobre la información es bandera roja automática.

## 3c. Compelling Event (evento decisivo)

George o el gerente preguntan: **"¿Cuál es el compelling event?"**

**Definición (George):** un hecho comercial, financiero o regulatorio con una **fecha límite inalterable** que obliga al comprador a actuar, de modo que no hacer nada resulta más costoso o riesgoso que decidir. **No es** una urgencia falsa creada por el vendedor, como un descuento de fin de mes o de trimestre: es presión real anclada al negocio del cliente.

**Tres elementos que el agente verifica uno por uno:**
1. **Fecha fija:** un día límite en el calendario.
2. **Dueño:** un ejecutivo o líder (Económico o Champion) cuya reputación, bono o puesto depende de resolverlo a tiempo.
3. **Costo de la inacción:** consecuencias claras y cuantificables si se pasa la fecha (multas, pérdida de clientes, caída de ingresos, penalizaciones).

**Ejemplos comunes:**
- Vence el contrato de un sistema heredado que no se puede renovar.
- Entra en vigor una norma o ley obligatoria para operar en una fecha específica.
- El consejo fijó una meta corporativa crítica (por ejemplo, crecer 30% o abrir una filial antes de cerrar el año).
- Hay una integración tecnológica prometida a inversionistas después de una ronda de financiamiento o una fusión.

**Si el cliente no lo tiene:** es lo normal en B2B. El vendedor, junto con su contacto interno (Champion), debe ayudar a descubrirlo o co-crearlo, vinculando la solución con un objetivo de negocio que el cliente ya tenga calendarizado.

*Propuesta de reglas para el agente:*
- **Champion ≈ Coach** en Miller Heiman. El **dueño** del evento suele ser el Económico, y lo que está en juego para él (reputación, bono) es su **Triunfo**.
- Un evento que no cumple los 3 elementos es "urgencia blanda" y se marca bandera roja. Un evento que depende de un incentivo del vendedor es urgencia falsa y se marca bandera roja.
- El compelling event es el antídoto contra la competencia "no hacer nada".
- **Cruces:**
  - Prioridad "Urgente" sin compelling event → inconsistente.
  - Lente director (cierre en el mes) sin compelling event → riesgo.
  - Pocos selectos sin compelling event → hay que revisar si de verdad está ahí.
  - Fecha de cierre posterior a la fecha del compelling event → incongruente.
- **Si no hay evento:** el agente sugiere acciones para descubrirlo con el Coach o Champion. Por ejemplo: ¿qué metas tiene calendarizadas el Económico este año? ¿Qué contratos o sistemas vencen? ¿Qué cambios regulatorios vienen?

## 4. Higiene de CRM (se pregunta en cada revisión)

- ¿Todos los valores están actualizados en el CRM?
- ¿Todas las actividades están registradas en el CRM?
- ¿Las etapas están actualizadas?

*Propuesta:* como no hay integración con CRM en la primera versión, el agente pregunta y registra la respuesta del vendedor (sí o no, y qué falta). El tablero muestra quién tiene el CRM al día. Si en el futuro se integra Salesforce, esta verificación se hace automática.

## Pendientes de confirmar con George
- ~~¿Los días son hábiles o naturales?~~ Resuelto: hábiles.
- ~~Niveles de BANT~~ Resuelto: 3 niveles.
- ~~¿Qué cuenta como "cerrado"?~~ Resuelto: orden de compra o contrato firmado (ver arriba).
- ~~SOW con cierre por orden de compra~~ Resuelto: depende del caso; el agente lo pregunta en cada oportunidad.
