# Cola vigente de refactor

Base verificada: `origin/development` `eb14a2c7`, 2026-09-07.
Lee primero [CURRENT_WORK](CURRENT_WORK.md): integrado, en curso y límites de QA.
No uses la ola F1–F12 como cola actual; es distinta de Labs L0–L12.

## Reservas y base

- Trabajo ordinario desde `origin/development`, PR hacia `development`.
  `main` es publicación: [BRANCHING](BRANCHING.md).
- Reconsultar PR y diff local antes de reservar. Máximo un PR pendiente por
  `_launch_runtime.py`, `useStore.ts`, `agentActions.ts`, StoryLabPanel o runtime
  Director/Wizard. No superponer cambios de otros agentes.
- Conservar prompts, IDs, provenance y fachadas. No mover código solo por reducir
  líneas. PR cohesivos con contratos y pruebas; no uno por propiedad.
- Revisión/merge según [AGENT_QA_POLICY](AGENT_QA_POLICY.md) y autorización vigente
  del usuario. Esta cola no concede permisos nuevos ni restablece excepciones de
  handoffs antiguos. No activar auto-merge ni protecciones por limpiar documentos.

## Pendientes elegibles: comprobar antes de reservar

| Paquete | Propiedad prevista | Dependencia / alcance |
|---|---|---|
| Cierre de QA Labs | Tests UI/Wizard, browser y pruebas reales acotadas | L0–L12 y attemptId (#201) integrados. Quedan móvil real, equivalencia amplia y GPU |
| Router Story Music | Nuevo router + cableado mínimo runtime | Finalización/spec/rehidratación ya integrados (#158–#163); reservar runtime en exclusiva |
| Sesión Story | Controller/hooks de carga, draft, guardado y recuperación | Las pestañas ya se reorganizaron; preservar workspace fuente y CAS |
| Slice musical Studio | `useStore` y slice musical | Reutilizar catálogo/spec existente; no extraer todo startGeneration |
| Director siguiente corte | Helpers de locks/reconcile/delete/observer y tests | I/O extraído en #167; caracterizar dependencias, elegir un solo contrato antes de mover |
| Concurrencia de ejecución Wizard | Runtime de workflow, autoridad backend y tests | CAS y 409 ya existen; verificar efectos/pasos concurrentes, no construir otra persistencia |
| Proyección visible de intentos | Producers/GenerationRecord/Activity según inventario | No segundo scheduler; elegir un flujo concreto y reservar sus hotspots |
| Policy H3 desde Studio | Adapter/request UI y tests de payload | No basta que el schema acepte policy; verificar envío y prompt efectivo |

Después del próximo corte Director: cómic → H3 story-video → reparación/rerun →
validación/planificación → ciclo de vida con dependencias tipadas, ajustando orden
por acoplamiento real. Es orientación pendiente, no paquetes reservados ni una
orden de extraerlos todos sin revisión.

## No volver a poner en cola

Finalización musical del servidor, rehidratación, contrato de idioma/proyección,
I/O Director, refactor H3 y Labs L0–L12 ya tienen entregas integradas. Ver pruebas y
límites en [CURRENT_WORK](CURRENT_WORK.md); integrado no significa QA audiovisual
exhaustiva. Wizard 409 y Series→Comics provenance tampoco son tareas nuevas (#122,
#124). No restaurar el viejo backlog post-#120.

## Documentación histórica

[Archivo de la ola anterior](../archive/2026-09-06/architecture-wave/SLICE_QUEUE.md).
Consultar solo para recuperar una decisión o requisito concreto, nunca para elegir
base, permisos, PR pendientes o la próxima tarea.
