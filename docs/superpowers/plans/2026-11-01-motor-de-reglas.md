# Motor de Reglas del Sales Agent — Plan de Implementación (Plan 1 de 4 de la v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una librería TypeScript pura que reciba el expediente de una oportunidad y devuelva el diagnóstico completo. El diagnóstico incluye etapa recomendada, probabilidades, fecha de cierre creíble, embudo, banderas rojas, fortalezas, índice de madurez, huecos priorizados y validación del plan de acción. La librería debe ser determinista y estar 100% cubierta por pruebas.

**Architecture:** Funciones puras sin E/S ni IA. `calcularDiagnostico(exp, hoy, config)` primero arma un `Contexto` con los valores derivados (lente, etapa recomendada, fecha creíble, nivel de embudo) y después aplica un catálogo de reglas, cada una con `id`, `severidad`, `lente` y `evaluar(ctx)`. Toda la parametrización (pesos, ciclos, días, probabilidades, festivos) vive en un objeto `Config`; `CONFIG_DEFAULT` trae los valores de la especificación.

**Tech Stack:** Node 22 · TypeScript 5 (strict) · Vitest · sin dependencias de runtime.

**Spec:** `docs/superpowers/specs/2026-10-31-sales-agent-design.md` (§7 en especial) + `docs/conocimiento/01..03`.

**Planes siguientes (fuera de este plan):**
- Plan 2: plataforma base (datos, acceso, roles). Espera la decisión de datos de George.
- Plan 3: agente conversacional (Claude API y herramientas).
- Plan 4: interfaz de usuario (PWA): expediente y vista Forecast.

## Global Constraints

- Todas las fechas son cadenas ISO `YYYY-MM-DD`; nunca `Date` con hora. La aritmética se hace en UTC para evitar corrimientos por zona horaria.
- "Días" de la cadena de cierre = **días hábiles**: lunes a viernes, sin contar los festivos del **país de la cuenta** (`config.festivos[pais]`).
- Ciclos normales: WMS 8, TMS 10, PLANEACION_DEMANDA 6, VOICE 9 meses. Si hay varias líneas, se usa el **más largo**. 1 mes = 30 días naturales.
- La escala de calificación por influencia es −5..−1 y +1..+5. **El 0 no existe.**
- Niveles de evidencia: `confirmado` | `supuesto` | `ausente`.
- Pesos del índice: Influencias 20 · BANT 20 · Compelling event 20 · Triunfo-Resultados 10 · Competencia 10 · Cliente ideal 10 · Coherencia 10.
- Cualquier bandera crítica limita el índice a **40**. Semáforo: verde ≥70 y sin críticas · rojo <40 o con críticas · ámbar en los demás casos.
- Textos de banderas, fortalezas y huecos: en español.
- Probabilidades de Argano (tipo × etapa 0..5): NN 0,0,20,45,85,100 · ENxT 0,0,40,65,90,100 · EN 0,15,50,70,90,100 · EE 15,40,65,85,95,100.
- La librería no lanza excepciones con expedientes incompletos. Los datos faltantes generan banderas, no errores.

## Review Focus

1. **Oportunidad nueva casi vacía** (sin influencias, BANT ausente, sin cadena). Se espera un diagnóstico válido con índice bajo, crítica "sin Económico" y crítica "budget ausente", sin excepción → test en Task 9.
2. **Fecha de cierre del CRM en fin de semana, en festivo o ya pasada.** La aritmética de días hábiles no debe fallar; una fecha pasada da "no cierra en la fecha" y obliga al análisis completo → tests en Task 2 y Task 4.
3. **Cruce de año o trimestre** (hoy = 2026-12-28, cierre en enero, festivo 1-ene). La lente director se activa por trimestre en curso y el 1-ene no cuenta como hábil → tests en Task 2 y Task 3.
4. **Datos imposibles** (calificación 0 o −7, dos personas con rol E). `validarExpediente` reporta la calificación inválida; dos Económicos producen la bandera media "información incierta" → tests en Task 1 y Task 7.
5. **Oportunidad ya cerrada** (etapaCRM ≥ 5 en CRM). Se espera `cerrada: true`, sin banderas de forecast ni plan de acción → test en Task 9.

---

## File Structure

```
motor/
  package.json  tsconfig.json  vitest.config.ts
  src/
    tipos.ts              # Tipos del dominio (Expediente, Config, Diagnostico…)
    config.ts             # CONFIG_DEFAULT (valores de la especificación) + festivos MX
    validar.ts            # validarExpediente: errores de rango o forma
    fechas.ts             # Días hábiles, sumas, trimestres
    oportunidad.ts        # clasificarTipo, probabilidad, cicloMeses
    lente.ts              # lenteActiva
    etapa.ts              # etapaRecomendada, compararEtapa
    fechaCierre.ts        # evaluarFechaCierre (director), esFechaOptimista (gerente)
    embudo.ts             # nivelEmbudo, estaAtorada
    contexto.ts           # construirContexto (valores derivados compartidos)
    competencia.ts        # posicionGeneral
    reglas/
      tipos.ts            # interfaz Regla
      criticas.ts  altas.ts  medias.ts
      fortalezas.ts
      index.ts            # CATALOGO_BANDERAS, CATALOGO_FORTALEZAS
    indice.ts             # calcularIndice
    huecos.ts             # huecosPriorizados
    acciones.ts           # validarAcciones
    analisisCompleto.ts   # motivosAnalisisCompleto
    diagnostico.ts        # calcularDiagnostico (orquestador)
    index.ts              # exports públicos
  tests/
    fabrica.ts            # expedienteBase(): constructor de expedientes de prueba
    *.test.ts             # uno por módulo
    golden/
      casos/*.json        # casos de referencia de George
      golden.test.ts
```

---

### Task 1: Proyecto, tipos del dominio, configuración por defecto y validación

**Files:**
- Create: `motor/package.json`, `motor/tsconfig.json`, `motor/vitest.config.ts`
- Create: `motor/src/tipos.ts`, `motor/src/config.ts`, `motor/src/validar.ts`, `motor/src/index.ts`
- Create: `motor/tests/fabrica.ts`, `motor/tests/validar.test.ts`

**Interfaces:**
- Produces: todos los tipos de abajo · `CONFIG_DEFAULT: Config` · `validarExpediente(exp: Expediente): ErrorValidacion[]` · `expedienteBase(over?: DeepPartial<Expediente>): Expediente` (solo para pruebas).

`src/tipos.ts` (contrato completo; los demás tasks lo usan tal cual):

```ts
export type Nivel = 'confirmado' | 'supuesto' | 'ausente';
export interface Evidencia<T> { valor: T | null; nivel: Nivel; fuente?: string; fecha?: string }
export type Etapa = 0 | 1 | 2 | 3 | 4 | 5;
export type TipoOportunidad = 'NN' | 'ENxT' | 'EN' | 'EE';
export type Linea = 'WMS' | 'TMS' | 'PLANEACION_DEMANDA' | 'VOICE';
export type Rol = 'E' | 'U' | 'T' | 'C';
export type Grado = 'A' | 'M' | 'B';
export type Modo = 'C' | 'P' | 'E' | 'EC';           // Crecimiento, Problema, Equilibrio, Exceso de confianza
export type Prioridad = 'urgente' | 'activa' | 'importante' | 'postergable';
export type Posicion = 'dominante' | 'nula' | 'compartida' | 'alternativa';
export type TipoAlternativa = 'proveedor' | 'interna' | 'presupuesto' | 'no_hacer_nada';
export type Sensacion = 'euforico'|'excelente'|'seguro'|'comodo'|'bien'|'preocupado'|'molesto'|'inquieto'|'con_miedo'|'con_panico';
export type Severidad = 'critica' | 'alta' | 'media';
export type Lente = 'gerente' | 'director';
export type RutaCierre = 'contrato' | 'oc' | 'ambas_oc_tras_contrato' | 'ambas_independientes' | 'desconocida';

export interface Cuenta {
  nombre: string; pais: string;                       // código ISO-2, p.ej. 'MX'
  esClienteNetlogistik: boolean; esClienteOtraTowerArgano: boolean;
  clienteIdeal: Evidencia<number>[];                  // 5 criterios, valor −5..+5
}
export interface Influencia {
  personaId: string; nombre: string; roles: Rol[];
  grado: Grado | null; modo: Modo | null; calificacion: number | null;
  contactada: boolean; ultimoContacto?: string; nuevaEnPuesto: boolean;
  trDeclaracion: string | null; prioridad: Prioridad | null;
}
export interface Alternativa { tipo: TipoAlternativa; nombre: string | null; posicion: Posicion | null }
export interface CompellingEvent {
  descripcion: string | null; fecha: Evidencia<string>; dueno: Evidencia<string>;
  costoInaccion: Evidencia<string>; urgenciaFalsa: boolean;
}
export interface CadenaCierre {
  ruta: RutaCierre; requiereSOW: boolean | null;
  pasos: { aElegido: boolean; bContratoEnviado: boolean; cComentariosRecibidos: boolean;
           dEnFirma: boolean; eFirmado: boolean; fAltaProveedor: boolean; hOC: boolean };
}
export interface CriterioCumplido { clave: string; nivel: Nivel }
export interface AccionPrevia { que: string; quien: string; cuando: string; atiende: string; estado: 'abierta'|'cumplida'|'no_cumplida' }

export interface Expediente {
  id: string; cuenta: Cuenta; lineas: Linea[]; montoUSD: number | null;
  etapaCRM: Etapa; fechaCierreCRM: string | null; fechaCreacion: string;
  esChangeOrder: boolean; cambioDeDueno: boolean; esMercadoNuevo: boolean; revisionGerenteProxima: boolean;
  sensacion: Sensacion | null; prioridad: Evidencia<Prioridad>;
  influencias: Influencia[];
  preguntaCompetenciaHecha: boolean; alternativas: Alternativa[];
  contribucionDiferenciadora: Evidencia<string>; criteriosCompraDefinidos: boolean;
  esRFP: boolean; contactoPrevioRFP: boolean | null;
  reorganizacion: Evidencia<boolean>;
  bant: { budget: Evidencia<string>; authority: Evidencia<string>; need: Evidencia<string>; time: Evidencia<string> };
  compellingEvent: CompellingEvent;
  cadena: CadenaCierre;
  criteriosArgano: CriterioCumplido[];
  higieneCRM: { valores: boolean | null; actividades: boolean | null; etapas: boolean | null };
  accionesPrevias: AccionPrevia[];
}

export interface CriterioArgano { etapaDesde: 0|1|2|3|4; clave: string; texto: string; soloRFP?: boolean }
export interface Config {
  probabilidades: Record<TipoOportunidad, [number,number,number,number,number,number]>;
  ciclosMeses: Record<Linea, number>;
  diasPasoContrato: number;            // 5
  diasAltaProveedor: number;           // 3
  diasOC: number;                      // 3
  holguraEnRiesgo: number;             // 5 días hábiles
  festivos: Record<string, string[]>;  // pais -> fechas ISO
  criteriosArgano: CriterioArgano[];
  pesos: { influencias: number; bant: number; compellingEvent: number; triunfoResultados: number; competencia: number; clienteIdeal: number; coherencia: number };
  topeConCritica: number;              // 40
  umbralVerde: number; umbralRojo: number;   // 70, 40
  fechaOptimistaPct: { etapas01: number; etapa2: number };  // 0.5, 0.25
  umbralMontoAltoUSD: number | null;   // null = no aplica (George lo define)
  caducidadDatoDias: number;           // 90
  caducidadContactoDias: number;       // 60
  horizonteAccionesDias: number;       // 30
  maxAcciones: number;                 // 5
}

export interface Bandera { id: string; severidad: Severidad; texto: string }
export interface Fortaleza { id: string; texto: string }
export interface Hueco { reglaId: string; severidad: Severidad; motivo: string }
export type VeredictoFecha = 'creible' | 'en_riesgo' | 'no_cierra_fecha' | 'no_cierra_periodo';
export interface ResultadoFecha { veredicto: VeredictoFecha; fechaCreible: string | null; diasPendientes: number | null; rutaUsada: 'contrato' | 'oc' | null; acelerador: string | null }
export type NivelEmbudo = 'universo' | 'arriba' | 'en_embudo' | 'pocos_selectos';
export interface ResultadoIndice { total: number; componentes: Record<keyof Config['pesos'], number>; topado: boolean; semaforo: 'verde' | 'ambar' | 'rojo' }
export interface AccionPropuesta { que: string; quien: string; cuando: string; atiende: string }
export interface ResultadoAcciones { aceptadas: AccionPropuesta[]; rechazadas: { accion: AccionPropuesta; motivo: string }[] }
export interface Diagnostico {
  cerrada: boolean; lente: Lente; tipo: TipoOportunidad;
  etapaCRM: Etapa; etapaRecomendada: Etapa; comparacionEtapa: 'al_dia' | 'inflada' | 'rezagada';
  probabilidadDeclarada: number; probabilidadAjustada: number;
  fecha: ResultadoFecha | null; fechaOptimista: boolean;
  embudo: NivelEmbudo; atorada: boolean;
  banderas: Bandera[]; fortalezas: Fortaleza[]; indice: ResultadoIndice;
  huecos: Hueco[]; analisisCompleto: string[];
}
export interface ErrorValidacion { campo: string; mensaje: string }
```

`src/config.ts`: `CONFIG_DEFAULT` con los valores de Global Constraints y los comentarios de `Config`. `festivos.MX` para 2026–2027: `2026-01-01, 2026-02-02, 2026-03-16, 2026-05-01, 2026-09-16, 2026-11-16, 2026-12-25, 2027-01-01, 2027-02-01, 2027-03-15, 2027-05-01, 2027-09-16, 2027-11-15, 2027-12-25`. Los demás países van vacíos y George los configura después. `criteriosArgano` sale de doc 01 §1, columna "Completar para avanzar":
- `etapaDesde 0`: `fuente_creible`, `cliente_confirma_real`, `alineada_estrategia_argano`.
- `etapaDesde 1`: `entiende_cliente_dolores`, `volumen_presupuesto_aprox`, `aprobacion_calificacion_presupuesto_cliente`, `rfp_analizado` (soloRFP), `business_case_identificado`, `confirma_recibir_propuesta`.
- `etapaDesde 2`: `propuesta_desarrollada`, `requerimientos_refinados`, `recursos_presupuesto_evaluados`, `estrategia_delivery_refinada`, `rfp_respuesta` (soloRFP), `revenue_equipo_calendario`.
- `etapaDesde 3`: `aprobacion_interna_recursos_margen`, `pr_aprobado`, `propuesta_entregada`, `sow_precios_finalizados`, `staffing_request`, `forecast_actualizado`.
- `etapaDesde 4`: `acuerdo_cliente`, `fecha_inicio_confirmada`, `demand_signal_confirmado`, `sow_enviado_firma`.

Cada uno lleva su `texto` en español, tomado de doc 01.

- [ ] **Step 1: Inicializar `motor/`**: `npm init -y`, devDependencies `typescript@5 vitest@2 @types/node@22`, `"type": "module"`, scripts `test: vitest run`, `typecheck: tsc --noEmit`. `tsconfig` con `strict: true`, `noUncheckedIndexedAccess: true` y `module/moduleResolution: NodeNext`.
- [ ] **Step 2: Escribir `src/tipos.ts` y `src/config.ts`** según lo de arriba.
- [ ] **Step 3: Escribir `tests/fabrica.ts`** con `expedienteBase(over)`. El base es una oportunidad WMS en MX, `etapaCRM 0`, `fechaCreacion 2026-10-01`, `fechaCierreCRM null`, sin influencias, todas las evidencias `{valor:null, nivel:'ausente'}`, `cadena.ruta 'desconocida'` con todos los pasos `false`, y `clienteIdeal` con 5 evidencias ausentes. `over` se fusiona en profundidad, salvo los arreglos, que se reemplazan.
- [ ] **Step 4: Escribir los tests de validación que fallan** en `tests/validar.test.ts`:
  - `calificacion_cero_es_invalida`: una influencia con `calificacion: 0` → error con `campo: 'influencias[0].calificacion'`.
  - `calificacion_fuera_de_rango`: `-7` → error.
  - `cliente_ideal_fuera_de_rango`: `clienteIdeal[2].valor = 6` → error.
  - `fecha_mal_formada`: `fechaCierreCRM: '31/12/2026'` → error con `campo: 'fechaCierreCRM'`.
  - `expediente_base_es_valido`: `validarExpediente(expedienteBase())` → `[]`.
- [ ] **Step 5: Ejecutar** `cd motor && npx vitest run tests/validar.test.ts` → Expected: FAIL (`validarExpediente` no existe).
- [ ] **Step 6: Implementar `validarExpediente(exp): ErrorValidacion[]`** en `src/validar.ts`. Debe revisar: calificaciones ∈ {−5..−1, 1..5} o null · clienteIdeal ∈ [−5, 5] o null · todas las fechas con el patrón `^\d{4}-\d{2}-\d{2}$` y que sean válidas. Exportar en `src/index.ts`.
- [ ] **Step 7: Ejecutar** `npx vitest run && npx tsc --noEmit` → Expected: PASS, sin errores de tipos.
- [ ] **Step 8: Commit** `git add motor && git commit -m "feat(motor): tipos, config por defecto y validación de expediente"`

---

### Task 2: Fechas y días hábiles

**Files:**
- Create: `motor/src/fechas.ts`, `motor/tests/fechas.test.ts`

**Interfaces:**
- Produces:
  - `esHabil(fecha: string, festivos: string[]): boolean`
  - `sumarDiasHabiles(desde: string, dias: number, festivos: string[]): string`: cuenta hacia adelante desde el día siguiente a `desde`; con `dias=0` devuelve `desde`.
  - `diasHabilesEntre(a: string, b: string, festivos: string[]): number`: hábiles en el intervalo (a, b]; si b ≤ a, devuelve 0 o negativo.
  - `sumarDiasNaturales(desde: string, dias: number): string`
  - `diasNaturalesEntre(a: string, b: string): number`
  - `finDeTrimestre(fecha: string): string`

- [ ] **Step 1: Tests que fallan** en `tests/fechas.test.ts` (festivos = `CONFIG_DEFAULT.festivos.MX`):
  - `sumarDiasHabiles('2026-11-02', 21, MX) === '2026-12-02'`: el 16-nov es festivo y se salta.
  - `sumarDiasHabiles('2026-10-30', 1, MX) === '2026-11-02'`: viernes + 1 = lunes.
  - `sumarDiasHabiles('2026-12-28', 5, MX) === '2027-01-05'`: el 1-ene se salta (Review Focus 3).
  - `esHabil('2026-11-16', MX) === false` · `esHabil('2026-11-14', MX) === false` (sábado).
  - `diasHabilesEntre('2026-11-02', '2026-11-09', MX) === 5`.
  - `finDeTrimestre('2026-11-01') === '2026-12-31'` · `finDeTrimestre('2026-12-28') === '2026-12-31'` · `finDeTrimestre('2027-01-05') === '2027-03-31'`.
- [ ] **Step 2: Ejecutar** `npx vitest run tests/fechas.test.ts` → FAIL.
- [ ] **Step 3: Implementar en `src/fechas.ts`** con `Date.UTC`, parseando `YYYY-MM-DD` a mano (nada de `new Date('…')` sin UTC).
- [ ] **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(motor): aritmética de días hábiles y trimestres"` (antes, `git add` de los archivos nuevos).

---

### Task 3: Tipo de oportunidad, probabilidad, ciclo y lente

**Files:**
- Create: `motor/src/oportunidad.ts`, `motor/src/lente.ts`, `motor/tests/oportunidad.test.ts`, `motor/tests/lente.test.ts`

**Interfaces:**
- Consumes: `Expediente`, `Config`, `finDeTrimestre`.
- Produces:
  - `clasificarTipo(exp): TipoOportunidad`: changeOrder → EE · si no, clienteNetlogistik → EN · si no, otraTower → ENxT · si no → NN.
  - `probabilidad(etapa: Etapa, tipo: TipoOportunidad, config): number`
  - `cicloMeses(exp, config): number`: el máximo de las líneas; si `lineas` viene vacío, usa WMS.
  - `lenteActiva(exp, hoy: string): Lente`: `director` si `etapaCRM ≥ 3` o si `fechaCierreCRM ≤ finDeTrimestre(hoy)`; si no, `gerente`.

- [ ] **Step 1: Tests que fallan:**
  - `clasificarTipo`: los 4 casos, incluido `esChangeOrder` con cliente Netlogistik → `EE`.
  - `probabilidad(2,'NN') === 20` · `probabilidad(4,'ENxT') === 90` · `probabilidad(0,'EE') === 15`.
  - `cicloMeses({lineas:['WMS','TMS']}) === 10`.
  - `lenteActiva`: etapa 1 con cierre `2027-02-15` y hoy `2026-11-01` → gerente · etapa 1 con cierre `2026-12-20` → director · etapa 3 sin fecha → director · hoy `2026-12-28` con cierre `2027-01-10` → gerente (es otro trimestre, Review Focus 3).
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): tipo de oportunidad, probabilidad Argano y lente`

---

### Task 4: Etapa recomendada y fecha de cierre creíble

**Files:**
- Create: `motor/src/etapa.ts`, `motor/src/fechaCierre.ts`, `motor/tests/etapa.test.ts`, `motor/tests/fechaCierre.test.ts`

**Interfaces:**
- Consumes: `fechas.ts`, `cicloMeses`.
- Produces:
  - `etapaRecomendada(exp, config): Etapa`
  - `compararEtapa(crm: Etapa, rec: Etapa): { resultado: 'al_dia'|'inflada'|'rezagada'; diferencia: number }`, con `diferencia = crm − rec`.
  - `evaluarFechaCierre(exp, hoy, config): ResultadoFecha`
  - `esFechaOptimista(exp, hoy, config): boolean`

**Algoritmo de `etapaRecomendada`** (no lo determinan los tests por sí solos):
```
k = 0
para d en 0..4:
  requeridos = config.criteriosArgano.filter(c => c.etapaDesde === d && (!c.soloRFP || exp.esRFP))
  si todos los requeridos tienen nivel 'confirmado' en exp.criteriosArgano:
     si d === 3 y !exp.cadena.pasos.aElegido: detener      // George: ≥4 exige proveedor elegido
     k = d + 1
  si no: detener
si k === 5 y !entregableCierre(exp): k = 4
```
Donde `entregableCierre(exp)` = `(pasos.eFirmado || pasos.hOC) && (exp.cadena.requiereSOW !== true || pasos.eFirmado)`.

**Algoritmo de `evaluarFechaCierre`** (spec §7.3):
1. `!pasos.aElegido` → `{veredicto:'no_cierra_periodo', fechaCreible:null, diasPendientes:null, rutaUsada:null, acelerador:null}`.
2. `diasContrato` = 5 × (número de pasos pendientes entre b, c, d, e).
3. `diasOC` = 3 × (si falta fAltaProveedor) + 3 × (si falta hOC).
4. Ruta usada: `'oc'` solo si `ruta === 'oc'` y `requiereSOW !== true` · `min(diasContrato, diasOC)` con la ruta que lo produjo si `ruta === 'ambas_independientes'` y `requiereSOW !== true` · `'contrato'` en todos los demás casos.
5. `fechaCreible = sumarDiasHabiles(hoy, dias, festivos[pais] ?? [])`.
6. Veredicto: si `fechaCierreCRM` es null o `fechaCierreCRM < fechaCreible` → `no_cierra_fecha` · si `diasHabilesEntre(fechaCreible, fechaCierreCRM) < holguraEnRiesgo` → `en_riesgo` · en otro caso → `creible`.
7. `acelerador` = `'Inicia en paralelo el alta de proveedor y la OC desde hoy'` si `rutaUsada === 'contrato'` y falta `fAltaProveedor` u `hOC`; en otro caso, `null`. Es una recomendación y no cambia el cálculo.

**`esFechaOptimista`:** si `fechaCierreCRM` es null → false. Etapas 0–1: optimista si `fechaCierreCRM < sumarDiasNaturales(hoy, round(ciclo×30×0.5))`. Etapa 2: igual, pero con 0.25. Etapas ≥3 → false.

- [ ] **Step 1: Tests que fallan** (hoy = `2026-11-02`, país MX):
  - `etapa_sin_criterios_es_0`.
  - `etapa_2_con_criterios_0_y_1_confirmados`.
  - `criterio_supuesto_no_cuenta`: un criterio de la etapa 0 en `supuesto` → 0.
  - `rfp_analizado_solo_si_es_rfp`: criterios de las etapas 0 y 1 confirmados, excepto `rfp_analizado`; con `esRFP:false` → 2; con `esRFP:true` → 1.
  - `sin_proveedor_elegido_tope_en_3`: todo confirmado hasta la etapa 3 y `aElegido:false` → 3.
  - `etapa_5_exige_entregable`: todo confirmado y sin `eFirmado` ni `hOC` → 4; con `hOC` y `requiereSOW:true` → 4; con `eFirmado` → 5.
  - `compararEtapa(4,2)` → `{resultado:'inflada', diferencia:2}`.
  - `fecha_contrato_ejemplo_george`: aElegido y bContratoEnviado `true`, ruta `contrato`, `fechaCierreCRM '2026-11-20'` → `{veredicto:'no_cierra_fecha', diasPendientes:15, fechaCreible:'2026-11-24', rutaUsada:'contrato', acelerador: <texto>}`. Pendientes c, d, e = 15; la ruta contrato termina con la firma. El 16-nov es festivo.
  - `sin_acelerador_si_altas_y_oc_listas`: lo mismo con fAltaProveedor y hOC en `true` → `acelerador: null`.
  - `ruta_oc_6_dias`: aElegido `true`, ruta `oc`, `fechaCierreCRM '2026-11-20'` → `diasPendientes:6`, `fechaCreible:'2026-11-10'`, `creible`.
  - `oc_con_sow_requerido_usa_contrato`: lo mismo con `requiereSOW:true` → `rutaUsada:'contrato'`, `diasPendientes:20`.
  - `en_riesgo_por_holgura`: fechaCreible `2026-11-10` y CRM `2026-11-13` → `en_riesgo`.
  - `sin_eleccion_no_cierra_periodo`.
  - `fecha_crm_pasada` (Review Focus 2): CRM `2026-10-15` y aElegido → `no_cierra_fecha`.
  - `fecha_crm_en_sabado`: CRM `2026-11-21` (sábado), fechaCreible `2026-11-10` → `creible` (sin excepción).
  - `fecha_optimista`: etapa 0, WMS, CRM `2027-01-15` (< hoy + 120 días) → true; CRM `2027-04-15` → false.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): etapa recomendada y prueba de fecha de cierre`

---

### Task 5: Embudo y contexto derivado

**Files:**
- Create: `motor/src/embudo.ts`, `motor/src/contexto.ts`, `motor/tests/embudo.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `estaAtorada(exp, hoy, config): boolean`: `diasNaturalesEntre(fechaCreacion, hoy) > ciclo×30`.
  - `nivelEmbudo(exp, hoy, config): NivelEmbudo`
  - `interface Contexto { exp; hoy; config; lente; tipo; etapaRec; comparacion; fecha: ResultadoFecha | null; fechaOptimista; embudo; atorada; economicos: Influencia[]; coaches: Influencia[] }`
  - `construirContexto(exp, hoy, config): Contexto`: calcula `fecha` solo con lente director; con lente gerente queda null. `economicos` = influencias con rol E. `coaches` = influencias con rol C.

**Reglas de `nivelEmbudo`** (se evalúan de arriba hacia abajo y gana la primera que se cumple):
- `pocos_selectos`: hay un E contactado · todas las influencias contactadas · todas las de grado A/M con `trDeclaracion` · `aElegido` · `fechaCierreCRM ≤ hoy + ½ ciclo` (días naturales).
- `en_embudo`: al menos una influencia contactada con modo C o P.
- `arriba`: `bant.need.nivel !== 'ausente'`.
- `universo`: en cualquier otro caso.

- [ ] **Step 1: Tests que fallan:**
  - `atorada`: WMS creada `2026-01-01` con hoy `2026-11-02` → true; creada `2026-06-01` → false.
  - `nivelEmbudo`: expediente base → universo · need supuesto → arriba · más una influencia contactada en P → en_embudo · completo con cierre dentro de ½ ciclo → pocos_selectos · completo con cierre `2027-06-01` → en_embudo.
  - `contexto_gerente_sin_fecha`: etapa 1 con cierre lejano → `ctx.fecha === null`.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): embudo, oportunidad atorada y contexto derivado`

---

### Task 6: Banderas críticas y altas

**Files:**
- Create: `motor/src/reglas/tipos.ts`, `motor/src/reglas/criticas.ts`, `motor/src/reglas/altas.ts`, `motor/tests/banderas-criticas-altas.test.ts`

**Interfaces:**
- Consumes: `Contexto`.
- Produces: `interface Regla { id: string; severidad: Severidad; lente: Lente | 'ambas'; evaluar(ctx: Contexto): string | null }` (devuelve el texto si la bandera se activa) · `REGLAS_CRITICAS: Regla[]` · `REGLAS_ALTAS: Regla[]`.

Los ids, las condiciones y la lente se toman de spec §7.5. Cada uno lleva un texto corto en español:

| id | Sev. | Lente | Se activa si |
|---|---|---|---|
| `sin_economico` | crítica | ambas | `economicos.length === 0` |
| `economico_sin_cubrir` | crítica | director | hay al menos un E y ninguno está contactado |
| `budget_ausente` | crítica | ambas | `bant.budget.nivel === 'ausente'` |
| `no_elegidos_cierre_periodo` | crítica | director | `fecha?.veredicto === 'no_cierra_periodo'` y `fechaCierreCRM ≤ finDeTrimestre(hoy)` |
| `etapa_inflada_grave` | crítica | ambas | `comparacion.diferencia ≥ 2` |
| `bant_supuesto` | alta | ambas | algún elemento de BANT en `supuesto` (el texto lista cuáles) |
| `bant_ausente` | alta | ambas | authority, need o time en `ausente` |
| `ce_incompleto` | alta | ambas | algún elemento de fecha, dueño o costo distinto de `confirmado`, y `!urgenciaFalsa` |
| `ce_urgencia_falsa` | alta | ambas | `urgenciaFalsa` |
| `sin_coach_valido` | alta | ambas | ningún C con `calificacion ≥ 3` y modo C/P |
| `etapa_inflada` | alta | ambas | `diferencia === 1` |
| `banco_una_pata` | alta | ambas | `influencias.filter(contactada).length === 1` |
| `rfp_sin_contacto_previo` | alta | gerente | `esRFP && contactoPrevioRFP !== true` |
| `atorada` | alta | ambas | `atorada` |
| `sow_requerido_solo_oc` | alta | director | `requiereSOW === true && ruta === 'oc'` |
| `no_cierra_fecha` | alta | director | `fecha?.veredicto === 'no_cierra_fecha'` |
| `influencia_alta_no_contactada` | alta | ambas | alguna con grado A y `!contactada` |
| `sin_contribucion_diferenciadora` | alta | ambas | `contribucionDiferenciadora.nivel === 'ausente'` |
| `alternativas_no_identificadas` | alta | ambas | `!preguntaCompetenciaHecha` |
| `cierre_despues_ce` | alta | ambas | la fecha del CE es confirmada o supuesta y `fechaCierreCRM > compellingEvent.fecha.valor` |
| `urgente_sin_ce` | alta | ambas | `prioridad.valor === 'urgente'` y `compellingEvent.fecha.nivel === 'ausente'` |

Las reglas con lente `director` solo se evalúan con esa lente activa; las de `gerente`, solo con lente gerente.

- [ ] **Step 1: Tests que fallan.** Por cada id, un caso que la active y otro que no la active, construidos con `expedienteBase` + `construirContexto`. Además:
  - `reglas_director_no_aplican_con_lente_gerente`.
  - `expediente_vacio_activa_sin_economico_y_budget_ausente` (Review Focus 1).
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): catálogo de banderas críticas y altas`

---

### Task 7: Banderas medias y fortalezas

**Files:**
- Create: `motor/src/competencia.ts`, `motor/src/reglas/medias.ts`, `motor/src/reglas/fortalezas.ts`, `motor/src/reglas/index.ts`, `motor/tests/banderas-medias-fortalezas.test.ts`

**Interfaces:**
- Produces: `REGLAS_MEDIAS: Regla[]` · `interface ReglaFortaleza { id: string; evaluar(ctx): string | null }` · `REGLAS_FORTALEZAS: ReglaFortaleza[]` · `CATALOGO_BANDERAS = [...criticas, ...altas, ...medias]` · `evaluarBanderas(ctx): Bandera[]` (ordenadas: críticas, después altas, después medias) · `evaluarFortalezas(ctx): Fortaleza[]`.

| id (media) | Lente | Se activa si |
|---|---|---|
| `influencia_nueva_puesto` | ambas | alguna con `nuevaEnPuesto` |
| `reorganizacion` | ambas | `reorganizacion.valor === true` |
| `informacion_incierta` | ambas | `economicos.length > 1` (Review Focus 4) |
| `modo_calificacion_inconsistente` | ambas | alguna en modo E/EC con calificación > 0 |
| `modo_no_determinado` | ambas | alguna contactada con `modo === null` |
| `nula_sin_criterios` | ambas | `posicionGeneral(exp) === 'nula'` y `!criteriosCompraDefinidos` |
| `euforia_con_banderas` | ambas | sensación euforico o excelente, y hay al menos una crítica o alta |
| `prioridad_incongruente` | ambas | (`prioridad.valor === 'postergable'` y algún Económico con `modo === 'P'`) o (`postergable` y lente director) o (`urgente`, hay Económicos y todos tienen modo E o EC) |
| `tr_no_redactado` | ambas | alguna de grado A/M sin `trDeclaracion` |
| `dato_caduco` | ambas | alguna evidencia `confirmado` con `fecha` anterior a hoy − 90 días |
| `influencia_sin_contacto` | ambas | alguna con `ultimoContacto` anterior a hoy − 60 días |
| `crm_desactualizado` | ambas | algún valor de `higieneCRM` en `false` |
| `grado_bajo_ignorado` | ambas | alguna de grado B y `!contactada` |
| `fecha_optimista` | gerente | `fechaOptimista` |

`posicionGeneral(exp): Posicion | null` vive en `src/competencia.ts`, para evitar una importación circular con `reglas/index.ts`:
- Si `preguntaCompetenciaHecha` y no hay alternativas → `'nula'`.
- Si no, la peor posición de las alternativas, en este orden: alternativa < compartida < dominante. Las posiciones null se ignoran.
- Si no se cumple nada de lo anterior → `null`.

Fortalezas: `coach_valido` · `economico_a_favor` (E contactado con calificación ≥ +3) · `bant_confirmado` (4/4) · `ce_completo` (3/3 confirmados y sin urgencia falsa) · `dominante_con_contribucion` · `cliente_ideal_alto` (promedio ≥ 3) · `tr_completos` (todas las A/M con declaración y al menos una A/M) · `varios_a_favor` (≥ 2 influencias en C/P con calificación > 0).

- [ ] **Step 1: Tests que fallan.** Un caso que activa y otro que no activa por cada id de medias y de fortalezas. Además: `evaluarBanderas_ordena_por_severidad`, y `posicionGeneral` con estos casos: [dominante, alternativa] → alternativa; pregunta hecha sin alternativas → nula; pregunta no hecha → null.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): banderas medias y fortalezas`

---

### Task 8: Índice de madurez

**Files:**
- Create: `motor/src/indice.ts`, `motor/tests/indice.test.ts`

**Interfaces:**
- Consumes: `Contexto`, `Bandera[]`, `posicionGeneral`.
- Produces: `calcularIndice(ctx, banderas: Bandera[]): ResultadoIndice`.

Cálculo por componente (spec §7.7; cada componente se escala por `config.pesos.X / pesoBase`, y con los pesos por defecto la escala es 1):
- **influencias (base 20):** E identificado 5 · algún E contactado 4 · coach válido 4 · al menos un U y un T 3 · (contactadas/total)×2 (0 si no hay influencias) · sin `modo_calificacion_inconsistente` 2.
- **bant (20):** por elemento, confirmado 5 · supuesto 2 · ausente 0.
- **compellingEvent (20):** fecha 7, dueño 7, costo 6, multiplicados por factor (confirmado 1 · supuesto 0.5 · ausente 0). Si hay urgencia falsa → 0.
- **triunfoResultados (10):** Σ peso(grado) de las influencias con declaración / Σ peso(grado) de todas × 10. Pesos A 2, M 1, B 0.5, null 1. Sin influencias → 0.
- **competencia (10):** pregunta hecha 3 · posición (dominante 5, nula 5, compartida 3, alternativa 1, null 0) · contribución (confirmado 2, supuesto 1, ausente 0).
- **clienteIdeal (10):** promedio de los valores no null + 5. Si todos son null → 0.
- **coherencia (10):** etapa (al_dia 5 · rezagada 4 · inflada 0) + fecha. Con lente director: creíble 5 · en_riesgo 2 · no_cierra 0. Con lente gerente: `!fechaOptimista` 5 · optimista 2.
- `total = round(Σ componentes)`. Si hay alguna crítica: `total = min(total, topeConCritica)` y `topado = total original > tope`. Semáforo según Global Constraints.

- [ ] **Step 1: Tests que fallan:**
  - `bant_completo_suma_20`.
  - `bant_mixto`: confirmado, supuesto, ausente, confirmado → 12.
  - `ce_supuesto_mitad`: los 3 supuestos → 10.
  - `ce_urgencia_falsa_cero`.
  - `cliente_ideal`: valores [3, 3, 3, null, null] → 8.
  - `tope_por_critica`: un expediente sin Económico, con BANT, CE, competencia, cliente ideal y coherencia completos (sin tope suma > 40) → `total 40`, `topado true`, `rojo`.
  - `semaforo_ambar`: un expediente sin banderas críticas con total entre 40 y 69 → `ambar`.
  - `pesos_configurables`: con `pesos.bant = 40` y BANT completo → componente bant = 40.
  - `expediente_vacio_no_lanza`: el total queda entre 0 y 15.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `feat(motor): índice de madurez con tope por crítica y semáforo`

---

### Task 9: Huecos, análisis completo, acciones y diagnóstico

**Files:**
- Create: `motor/src/huecos.ts`, `motor/src/analisisCompleto.ts`, `motor/src/acciones.ts`, `motor/src/diagnostico.ts`
- Modify: `motor/src/index.ts` (exportar `calcularDiagnostico`, `validarAcciones`, `validarExpediente`, `CONFIG_DEFAULT` y los tipos)
- Test: `motor/tests/huecos.test.ts`, `motor/tests/acciones.test.ts`, `motor/tests/diagnostico.test.ts`

**Interfaces:**
- Produces:
  - `huecosPriorizados(ctx, banderas): Hueco[]`: una entrada por bandera activa cuyo id está en `IDS_POR_FALTA_DE_DATO` (todas excepto `etapa_inflada*`, `atorada`, `no_cierra_fecha`, `euforia_con_banderas`, `cierre_despues_ce` y `fecha_optimista`). Se ordenan por severidad; dentro de la misma severidad van primero las reglas cuya lente coincide con la activa y después las de lente `ambas`.
  - `motivosAnalisisCompleto(ctx, banderas): string[]`: `cuenta_heredada` (cambioDeDueno) · `monto_alto` (montoUSD ≥ umbral, solo si el umbral no es null) · `competencia_desconocida` (!preguntaCompetenciaHecha) · `competencia_fuerte` (posicionGeneral === 'alternativa') · `mercado_nuevo` · `atorada` · `fecha_vencida` (fechaCierreCRM < hoy) · `revision_gerente` (revisionGerenteProxima) · `falta_info_esencial` (alguna bandera crítica).
  - `validarAcciones(propuestas: AccionPropuesta[], banderas: Bandera[], fortalezas: Fortaleza[], hoy: string, config): ResultadoAcciones`. Se rechaza una acción si: `atiende` no es un id activo (motivo `no_atiende_bandera_ni_fortaleza`) · `quien` está vacío (`sin_responsable`) · `cuando` es anterior a hoy o posterior a hoy + horizonte (`fuera_de_horizonte`). Las aceptadas se ordenan por la severidad de lo que atienden (críticas, altas, medias y al final fortalezas) y se cortan en `maxAcciones`; las sobrantes se rechazan con motivo `excede_maximo`.
  - `calcularDiagnostico(exp, hoy, config = CONFIG_DEFAULT): Diagnostico`. Si `exp.etapaCRM === 5` y existe el entregable de cierre → `cerrada: true`, con `banderas`, `huecos` y `analisisCompleto` vacíos, y un índice calculado de todos modos.

- [ ] **Step 1: Tests que fallan:**
  - `huecos_criticas_primero`: con `sin_economico`, `bant_supuesto` y `tr_no_redactado` activas → ese orden.
  - `huecos_excluyen_no_datos`: con `etapa_inflada` activa → no aparece.
  - `motivos`: cambioDeDueno → incluye `cuenta_heredada` · umbral null con monto 1e7 → no incluye `monto_alto` · umbral 500000 con monto 1e6 → incluye `monto_alto` · cierre `2026-10-15` con hoy `2026-11-02` → `fecha_vencida` (Review Focus 2) · una alternativa en posición `alternativa` → `competencia_fuerte` · con `sin_economico` activa → `falta_info_esencial`.
  - `acciones`: atiende `sin_economico` y es válida → aceptada · `atiende:'inventado'` → rechazada · `quien:''` → rechazada · `cuando` a hoy + 45 días → rechazada · 7 válidas → 5 aceptadas y 2 `excede_maximo`.
  - `diagnostico_expediente_vacio` (Review Focus 1): no lanza; `etapaRecomendada 0`; banderas incluyen `sin_economico` y `budget_ausente`; semáforo `rojo`.
  - `diagnostico_cerrada` (Review Focus 5).
  - `diagnostico_ejemplo_completo`: un expediente WMS en etapa 3, ENxT, ruta `contrato`, con aElegido y bContratoEnviado `true` (pendientes c, d, e) → `probabilidadDeclarada 65`, `lente director`, `fecha.diasPendientes 15`.
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementar.** **Step 4: Ejecutar** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(motor): huecos priorizados, análisis completo, acciones y diagnóstico`

---

### Task 10: Arnés de casos de referencia (golden set)

**Files:**
- Create: `motor/tests/golden/golden.test.ts`, `motor/tests/golden/casos/ejemplo-01-cierre-inflado.json`, `motor/tests/golden/casos/ejemplo-02-sano.json`, `motor/tests/golden/LEEME.md`

**Interfaces:**
- Consumes: `calcularDiagnostico`.
- Formato de cada caso JSON: `{ "nombre": string, "hoy": "YYYY-MM-DD", "expediente": Expediente, "esperado": { "etapaRecomendada"?: Etapa, "veredictoFecha"?: VeredictoFecha, "semaforo"?: "verde"|"ambar"|"rojo", "banderasIncluye"?: string[], "banderasExcluye"?: string[] } }`. Solo se comparan los campos presentes en `esperado`.

- [ ] **Step 1: Escribir `golden.test.ts`.** Lee todos los `casos/*.json` y genera un `it(caso.nombre)` por archivo con las comparaciones de arriba.
- [ ] **Step 2: Escribir los dos casos de ejemplo:**
  - (01) etapa CRM 4, cliente no ha elegido, cierre en el mes → `etapaRecomendada 3`, `banderasIncluye ['no_elegidos_cierre_periodo']`, `semaforo 'rojo'`.
  - (02) oportunidad sana en etapa 2 → `semaforo 'verde'`, `banderasExcluye ['sin_economico','budget_ausente']`.
- [ ] **Step 3: Ejecutar** `npx vitest run tests/golden` → PASS.
- [ ] **Step 4: Escribir `LEEME.md`** (en español, para George): cómo agregar un caso copiando un ejemplo y llenando `esperado` con su propio diagnóstico.
- [ ] **Step 5: Ejecutar** la suite completa `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** `test(motor): arnés de casos de referencia de George`
