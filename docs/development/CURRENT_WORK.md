# Estado de desarrollo y punto de entrada

Verificado el 7 de septiembre de 2026 contra `origin/development` **`6e7fa3fa`**.
Es una fotografía con evidencia, no un sustituto de Git. Antes de reservar trabajo:
`git fetch origin development`, consultar PR abiertos y comprobar sus archivos.

## Lectura mínima

Lee este documento y el contrato del dominio que vas a modificar. Para contribuir,
consulta [BRANCHING](BRANCHING.md) y [AGENT_QA_POLICY](AGENT_QA_POLICY.md).
La [cola](SLICE_QUEUE.md) contiene solo pendientes. No leas todo `docs/` ni el
[archivo histórico](../archive/README.md) al iniciar una sesión. Los planes antiguos
no autorizan acciones ni representan el estado actual.

## Integrado: no volver a implementar

| Trabajo | Evidencia de integración | Límite de la afirmación |
|---|---|---|
| Contrato de idioma de letras | #139, #141 | No garantiza fidelidad de toda canción generada |
| GenerationRecord con CAS y autoridad de proyección | #138, #142 | No es un segundo scheduler ni prueba cobertura de todos los productores |
| Reserva musical idempotente | #143 | Distinguir reserva, ejecución y publicación |
| Finalización musical en servidor | #158 | Revisar su contrato antes de proponer otra implementación |
| Catálogo/spec musical y rehidratación | #159, #160, #162; fake worker #163 | Fake worker no acredita calidad de audio real |
| Extracción I/O de estado Director | #167 | Locks, reconciliación, borrado y ejecución siguen en el pipeline |
| Adopción H3, guías y finalización de prompts | #170, #172, #174, #178, #179 | Mantener diálogos literales y fixtures; no rehacer refactor |
| Policy/idioma/Creative H3 | #185 | Pruebas de contrato no demuestran éxito audiovisual universal |
| Labs/Wizard L0–L12 | #182, #183, #186–#189, #192, #194, #196, #197 | Entregas integradas; #197 congela L1–L4 y L9 como resueltos. Quedan límites de validación indicados abajo |
| Vídeo procedural y galería/plantillas | #168, #169, #173, #175, #177, #180, #181, #184 | No equivale a completar toda la hoja de ruta procedural |
| Inspección GLB y parches faciales | #190, #193, #195 | Router de inspección de #195 todavía sin montar; parches tienen límites de piloto |
| Taller de habla 2D (preparación manual) | #200 | Panel, borrador, recarga y e2e simulado. El test del panel evita aserciones HTMLElement-vs-null (~260 MiB RSS). No es validación artística de un personaje hablando ni cierra R2–R4 |
| Series attemptId vs número de plano | #201 | `attempt_id` en un único shot selecciona esa toma histórica. `shot_numbers: [2]` sin `attempt_id` sigue siendo el último eligible del plano 2. No cubre móvil real ni GPU |
| Escenas 3D reales (editor + AssetExplorer inicial) | #198, merge `fae7d3f6` | No es el selector universal. Conserva doble clic, preselección del primero e identidad por `name` |
| Plantillas musicales vídeo 3D | #204 | Cámara `side` y plantillas de videoclip; `Scene3DWorkspace` ya no está reservado por un PR abierto |
| Copy i18n de Vídeo 3D / compositor | #205 | No cubre todo el chrome restante del laboratorio de plantillas |
| Inventario selector universal | #206 | Contrato e inventario; no implementa el picker |

La integración es en **development**. No implica que el servidor local esté usando
esa revisión ni que exista una publicación de aplicación en main.

## En curso al comprobarlo

Al cerrar esta revisión el taller de habla (#200), la limpieza documental
(#199) y el contrato attemptId (#201) ya están integrados. Escenas 3D reales
(#198) se mezcló en development el 07/09 (`fae7d3f6`). Estado por dominio:

- **Selector universal de recursos (PR 1)**: contrato, adaptadores e identidad
  por ID/ubicación, consulta paginada/ordenada del catálogo. Rama
  `feat/asset-picker-contract`. Inventario #206 ya integrado. Cursor: no ejecutada (cuota).
- **Vídeo procedural**: conservar el checkpoint `work/procedural-video-pilot-checkpoint`;
  consultar [PROCEDURAL_VIDEO_ROADMAP](PROCEDURAL_VIDEO_ROADMAP.md) y el documento del
  subdominio asignado. No mezclar el checkpoint en bloque ni asumir que todo su
  historial está pendiente.

«En curso» se basa en rama y diff, no en inferir que un agente siga conectado.
No limpiar estos worktrees, stashes, archivos sin seguimiento ni outputs. El estado
local y sus rutas de máquina se mantienen fuera de Git en `ESTADO_LOCAL.md`.

## Pendiente: refactor y validación

1. **Director**: delimitar locks/reconcile/delete/observer y sus contratos antes de
   extraer; después cómic, H3, reparación/rerun y ciclo de vida. No existe todavía
   un `PipelineRuntime` tipado completo. No mover helpers enteros por nombre si
   mezclan I/O con generación o scheduler.
2. **Runtime HTTP**: las cuatro rutas Story Music siguen en `_launch_runtime.py`.
   Extraer un router de dominio con cableado mínimo y un único propietario del archivo.
3. **Estado UI**: falta la extracción cohesiva de sesión Story (carga, borradores,
   guardado/rehidratación) y continuar el slice musical de `useStore`.
4. **Wizard concurrente**: ya hay CAS de colección y recuperación 409; verificar
   exclusión de efectos/pasos entre dos clientes y compatibilidad de checkpoints.
   No volver a proponer CAS desde cero. La antigua F8 no está certificada completa.
5. **Trazabilidad**: comprobar cobertura real de productores→GenerationRecord→UI;
   conservar una proyección y la autoridad de TaskRegistry/asset-manifest. La
   antigua F12 no debe confundirse con Labs L12.
6. **H3 desde Studio**: comprobar propagación de policy desde cada petición UI;
   el contrato API acepta la policy, pero la inspección del store dejó caminos
   pendientes de comprobación. No inferir envío por existir el campo en el schema.
7. **Labs, cierre de validación**: `attemptId` vs número de plano está en #201.
   Siguen navegación móvil real, prueba audiovisual acotada y equivalencia
   UI/Wizard más amplia. #196 no repitió GPU. La UI de review ya envía
   `shotId`+`attemptId` explícitos; no se montó el panel completo aquí por RAM.
8. **Producto separado del refactor**: fidelidad de letras/idioma y evaluación real
   de Creative/audio H3. Sin repetir matrices masivas ni inventar resultados.
9. **Entrega**: reconsultar estado de protecciones y preparar una release a main
   solo dentro de su autorización. Esta limpieza documental no publica ni cambia
   reglas de GitHub.

Orden recomendado: terminar los cambios locales ya empezados, cerrar lagunas de
validación y abordar un único contrato de refactor por PR. Detalle de ownership y
priorización en [SLICE_QUEUE](SLICE_QUEUE.md).

## Contratos: consultar por tarea

| Tarea | Referencia |
|---|---|
| Capas y dependencias | [ARCHITECTURE_FOUNDATION](ARCHITECTURE_FOUNDATION.md), [ARCHITECTURE_MAP](ARCHITECTURE_MAP.md) |
| Identidad y procedencia | [DOMAIN_MODEL_AND_ASSET_PROVENANCE](DOMAIN_MODEL_AND_ASSET_PROVENANCE.md), [GENERATION_RECORD](GENERATION_RECORD.md) |
| Música | [MUSIC_SUBMISSION](MUSIC_SUBMISSION.md), [MUSIC_FINALIZATION](MUSIC_FINALIZATION.md), [MUSIC_MODEL_CONTRACT](MUSIC_MODEL_CONTRACT.md) |
| Wizard | [WIZARD_ACTION_RUNNER](WIZARD_ACTION_RUNNER.md), [WIZARD_WORKFLOW_RUNTIME](WIZARD_WORKFLOW_RUNTIME.md) |
| Labs | [LABS_WIZARD_ACTION_MATRIX](LABS_WIZARD_ACTION_MATRIX.md): referencia detallada/fixture, no checklist de inicio |
| Calidad y textos | [CODE_HEALTH](CODE_HEALTH.md), [INTERNATIONALIZATION](INTERNATIONALIZATION.md), [LOCAL_VALIDATION](LOCAL_VALIDATION.md) |

## Cómo mantener este estado sin volver a crear una biblia

Al integrar un contrato, mueve su pendiente a «Integrado» con PR y límite de
validación. Retira la entrada temporal de «En curso». Si la tabla crece demasiado,
resume por dominio y deja el historial de commits en Git; no pegues conversaciones.
Los handoffs caducan al integrarse o ser sustituidos. Conserva decisiones y evidencia
en el archivo, pero no su autoridad operativa. Una fecha antigua por sí sola no
convierte un contrato técnico vigente en material descartable.
