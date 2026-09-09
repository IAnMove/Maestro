# Reanudar vídeo procedural sin depender del historial del chat

2026-09-06. Leer primero AGENTS.md, VIDEO3D_TEMPLATE_REVIEW_PLAN.md y
[PROCEDURAL_VIDEO_ROADMAP.md](PROCEDURAL_VIDEO_ROADMAP.md).

## Estado exacto

No todos los pasos están terminados. #168 y el catálogo #169 están mezclados en
development; #173 galería y C2/#175 también están mezclados. No se ha publicado
main. P01 y posteriores están diseñadas, **no implementadas**.

- PR #168: `feat/wizard-programmatic-video`, base development, HEAD
  `3aaa65cb5b3e5c74e62f99a3856a81279bf12a41`.
- CI required de ese HEAD: verde. Revisión Cursor previa encontró dos problemas,
  corregidos con tests. La revisión actual no se ejecutó por límite de uso/gasto.
- No considerar `Cursor Automation: Untitled` como revisión Bugbot completada.
- Actualización del usuario (2026-09-06): excepción temporal expresa de Cursor;
  continuar con revisión independiente de agente + tests locales + CI. No cambiar
  protecciones ni gasto. No usar admin/force bypass. Retomar Cursor cuando vuelva.
- #168: mezclado por IAnMove, development `8542bf74`.
- #169: HEAD revisado `7615a9e929e8b3193e68fb7475c22909018b4259`, 22 tests,
  lint/tipos/build y CI required verdes; 5 hallazgos corregidos, revisión
  independiente final sin hallazgos. Merge por IAnMove `39c7fd4f`.
- #170 H3 fue mezclado externamente (`b879ac7c`); preservar esos cambios.
- #173: HEAD revisado `ab55bd9bdc65e827695c0e6081a7dd02e037ed0e`, 36 tests,
  5 E2E, lint/tipos/build/CI y revisión independiente pasan; merge normal realizado.
  Cursor NO completado; la excepción temporal sigue separada de estos hechos.
- 24 coral: aprobación visual explícita del usuario y publicación independiente
  [referencias v1](https://github.com/IAnMove/hocuspocus/releases/tag/procedural-style-reference-v1).
  74 assets remotos cotejados con hashes, sin medios en Git. No es release de app.

Branch de conservación: `work/procedural-video-pilot-checkpoint`.
Es un checkpoint, no una rama para mezclar de golpe contra development.

| PR / fase | Commit de origen (no volver a aplicar si está mezclado) | Contenido | Estado observado |
|---|---|---|---|
| Piloto B #169 | `5f6dc88e` + correcciones posteriores | 24 candidatos/compiladores, SVG/GLB originales, tests | mezclado `39c7fd4f` |
| Piloto C1 #173 | `72e5cdd8` + `ab55bd9b` | Galería, snapshot exacto, decisiones, 5 E2E | mezclado `e318a1f5` |
| Piloto C2 #175 | `d10eac6e` (incluye origen `246cb5f8` + hardening) | Build estático, renderer, API cerrada, CSP/cuotas/LAN lectura y 21 tests | CI y revisión independiente pasan; merge `38a90aa6` |
| Plan | branch `docs/procedural-video-phases` | Roadmap + cámaras + 3 inventarios de 50 + bloque AN de 30 técnicas | documentos/commits; no prestaciones implementadas |

La primera vez que se sube el checkpoint, comprobar con `git ls-remote` que su
HEAD coincide; la existencia de este documento no prueba que el push haya terminado.
Los cuatro commits se preparan como PRs independientes desde development actualizado,
no se abre una cadena de PRs que incluya repetidamente los commits anteriores.

## Reanudación operativa

1. Inspeccionar `git status`, worktrees, PRs y HEAD remotos. No cambiar el checkout
   compartido. Fetch sólo necesario, no force/reset/stash del trabajo ajeno.
2. Verificar PRs y cuota. La excepción temporal de Cursor ya está autorizada;
   no pedir reintentos en bucle ni esperar cuota mientras pueda revisar otro agente.
3. Para el siguiente PR abierto, leer revisión de HEAD actual y CI; corregir si procede.
   Mezclar normalmente usando comprobación del SHA esperado, nunca admin bypass.
4. No volver a aplicar B/C1: #169 y #173 ya están mezclados. Consultar PRs
   actuales para preservar merges externos de otras sesiones.
5. C2/#175 ya mezclado en `38a90aa6`: no repetirlo. Su revisión independiente
   corrigió URLs absolutas incompatibles con CSP y cómputo de cuota de sidecars.
6. Preparar el PR independiente de documentación desde development actualizado.
7. Incorporar documentación, P00D selector/referencias y bindings durables; después
   P01 del roadmap, reutilizando el contrato mínimo de assets.
8. Continuar fases sólo con dependencias mezcladas y aceptación cumplida. Ante
   dudas complejas, principal; Luna sólo tarea delimitada y resultados revisados.

### Continuación P00D — primer corte de selector, PR #177

- Rama `feat/procedural-template-assets`, worktree aislado
  `/tmp/hocus-procedural-selector.JAoGuJ`. No confundirlo con el checkout compartido.
- Selector implementado localmente/commits/PR abierto. Leer el estado remoto de
  #177 antes de continuar: al escribir esta nota CI/merge finales están pendientes.
- `SCENE_TEMPLATE_LIBRARY.md` describe contrato, instrucciones y límites.
  Library canónica → slots visibles → editor → guardar/reabrir conserva IDs.
  Referencias MP4 originales opt-in; JSON original importado tras tamaño/SHA-256.
- 6 E2E pasan con editor real y API simulada, incluidos nombres `hero(1).svg`.
  Revisión independiente corrigió incompatibilidad Python quote/encodeURIComponent;
  preview y compile ahora comparten `catalogLocation.ts`. No quedan hallazgos
  de esa revisión; no equivale a revisión Cursor ni render nuevo con modelos.
- Todos los 24 sidecars originales publicados pasan verificación/import local.
  No se añadieron esos outputs a Git; sólo índice de tamaños/hashes.
- Tras mezclar #177, completar únicamente los checkboxes P00D cubiertos por su
  aceptación. No marcar generación explícita de imágenes, anclas/encuadre automático,
  identidad durable de scene/shot/run o técnicas AN: todavía no implementadas.
- Próximo corte: encuadre/contratos P01–P03 y preparación explícita de assets según
  dependencias del roadmap. No añadir decenas de recetas antes del evaluador común.

No ejecutar inferencia de vídeo, descargar modelos ni tocar las apps 42003/42004.
No hacer release a main sin autorización de esa operación.

## Evidencia local de esta sesión

- PR A: 120 tests UI enfocados y build de un checkout separado en HEAD exacto.
- B/C1/C2: 35 tests de catálogo, arte, GLB, compilación, decisiones y contrato HTTP.
- C1 inicial: 3 Playwright E2E; versión final #173: 5 E2E, worker único/API
  simulada/puerto aislado 42005, todos pasan. No son 8 tests distintos.
- Lint global con cero warnings y build: pasan. Warning de chunks grandes
  permanece; no se elevó el límite para ocultarlo.
- Ratchet contra origin/development: pasa, **con warnings** de LOC/hotspots
  existentes. No afirmar que añadir este piloto resuelve la deuda arquitectónica.
- 24 MP4 reales con compositor existente: 4 s, 1280×720, 30fps, sin audio. Assets
  SVG y GLB de código original, sin modelos IA o proveedores de generación.
- Galería: 24 tarjetas y 72 archivos de preview comprobados; reproducción y seek.
- Guardar nombre editado/policy/procedencia probado con API sandbox real.
- Tooling reproducible: 2/2 renders (cinema-establishing, space-cruise) con UI
  construida; ffprobe confirma duración/FPS/dimensiones. El MP4 de space-cruise
  se reabrió con SceneLibraryDialog y conservó template, policy y capa GLB.
- Los tests HTTP usan cabecera MP4 sintética para contrato, no un vídeo válido.
  La evidencia de render real anterior es un conjunto distinto.

La primera versión del tooling falló por websocket de desarrollo; se sustituyó
por build estático temporal y se repitió el smoke con éxito. No borrar ni
renombrar el fallo anterior como éxito. Los artefactos de QA no entran en git.

## Dónde ver y recuperar archivos (rutas sólo de esta sesión)

Worktree de implementación: `/tmp/hocus-video3d-production.DJRluS`.
Checkout de prueba A: `/tmp/hocus-pr-a-validation.lZnmbu`.
No son rutas portables para scripts del producto.

Galería piloto, mientras su servidor siga activo:
`http://192.168.1.87:43873/scene-template-review`.
Loopback: `http://127.0.0.1:43873/scene-template-review`.

Archivos: `/tmp/hocus-template-review.o8H5is/previews/` contiene MP4/PNG/JSON por ID.
El snapshot de cada JSON permite recuperar la configuración; los votos de la
galería viven en localStorage del navegador y se exportan con «Exportar revisión JSON».
Servidor local de sesión no es persistencia de producción; el puerto puede dejar
de existir al apagar el proceso/equipo. No prometemos continuidad de esa URL.

La herramienta de C2/#175 ya está en development y puede ejecutarse después
de instalar las dependencias normales:
`npm --prefix ui run scene:review -- --render`. Lee SCENE_TEMPLATE_REVIEW.md para
prerrequisitos y LAN. Usa puerto efímero por defecto, no reserves 42003/42004.

Demo previamente aprobada «La noche es nuestra»: servidor `192.168.1.87:43872`,
fuentes/medios en `/tmp/hocus-video3d-neon.Kz8d82`. No modificar o borrar.

Logs fuera de git: `/tmp/hocus-template-review.o8H5is/{render.log,final-tests.log,
final-build.log,final-lint.log,final-health.log,repro-smoke.log,repro-static-smoke.log}`.
No copiar clips/pesos al historial Git. Las referencias originales ya están en la
publicación externa v1; no sobrescribirlas al volver a ejecutar recetas.

### Worktrees y prueba pintada de la continuación

- Worktree de continuación: `/tmp/hocus-procedural-phases.g9zon7`, ahora branch
  `feat/procedural-review-tooling`. Catálogo #169 y galería #173 ya mezclados;
  consultar `git status` antes de reanudar. Separado del servidor de galería anterior.
- Documentación: `/tmp/hocus-procedural-plan.jrMCSw`, branch
  `docs/procedural-video-phases`. No mezclar una pila entera del checkpoint.
- Prueba pintada: `/tmp/hocus-painted-trial.628k1j`, MP4 en
  `http://192.168.1.87:41353/scene-template-previews/painted-establishing-v1.mp4`.
- Comparación más cerrada: `/tmp/hocus-painted-medium.LZhJqF`, MP4 en
  `http://192.168.1.87:41605/scene-template-previews/painted-medium-v1.mp4`.
- Son URLs históricas de sesión: comprobar que el proceso sigue vivo antes de
  ofrecerlas. No representan servicios publicados ni disponibilidad garantizada.
- PNG originales + prompts en el directorio ignorado
  `app/outputs/procedural-style-trials-v1/` del worktree del catálogo.
- Dos imágenes generadas con image_gen integrado, no modelos GPU locales;
  versión exacta de modelo no expuesta. Video procedural real, 4 s/720p/30,
  personaje estático no articulado. Aprobación visual de esta estética pendiente.
- Sandbox tiene URLs temporales: no presentarlas como assetId durable de producto.

## Exit checklist

- [x] AGENTS snapshot y límites de tarea revisados; no se editaron launchers.
- [x] Destino/ejemplos/captura URL de Pinokio no aplican a estos cambios de lógica/UI.
- [x] Apps 42003/42004 y cambios de otros agentes preservados.
- [x] Artefactos fuera de Git; ningún modelo GPU local ni vídeo IA ejecutado.
  Dos imágenes se generaron con la herramienta integrada, con prompts conservados.
- [x] CI, revisión, merge y render real distinguidos; no aprobar candidatas por PR.
- [ ] Completar revisión pendiente y merges secuenciales antes de nuevas fases.
