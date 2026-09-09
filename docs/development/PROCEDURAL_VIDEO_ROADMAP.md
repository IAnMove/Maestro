# Vídeo procedural: plan de ejecución por fases y PRs

Fecha: 2026-09-06. Responsable: agente principal; Luna sólo en tareas acotadas.
Documento de ejecución, no declaración de funcionalidades terminadas.

## Resultado perseguido

Un editor de **Vídeo procedural** con dos tipos de escena: composición 2D/2,5D
y escenario 3D compartido. Cámara, tiempo, identidad, guardado, Wizard, montaje
y acabados comparten contratos; los renderers no tienen que ser el mismo.
Subtítulo: «Anima y compón vídeo sin modelos generativos de vídeo».
No prometer cero GPU/VRAM: rasterizar también consume recursos.

Primero mejorar de verdad la composición existente; después añadir un escenario
con profundidad y cámara reales; después ampliar acabados; personajes consistentes
y locomoción al final. No construir un modelador, un motor de juegos ni un Blender.

Los tres inventarios adjuntos contienen objetivos de **50 propuestas distintas**,
no 150 prestaciones ya disponibles. Se admiten rechazos y sustituciones tras QA.
Cada entrada necesita mecanismo, slots, ejemplo y evidencia propia. Un simple
espejo, zoom, LUT o cambio de objeto no aumenta el contador de plantillas.

- [Cámaras y lenguaje cinematográfico](procedural-video/CAMERAS.md)
- [50 composiciones 2D/2,5D](procedural-video/SCENES_2D_25D.md)
- [50 escenarios 3D](procedural-video/SCENES_3D.md)
- [50 técnicas de acabado](procedural-video/FILTERS.md)
- [Bloque AN: 30 técnicas expresivas de animación limitada](procedural-video/ANIME_LIMITED_ANIMATION.md)

## Estado de partida y decisiones del usuario

- PR #166: corrección facial mezclada en development, no publicación en main.
- PR #168: Wizard prepara un formulario visible, con política de assets;
  HEAD `3aaa65cb5b3e5c74e62f99a3856a81279bf12a41`, 120 pruebas locales enfocadas
  y CI required verdes. Dos observaciones iniciales de Cursor corregidas.
- #168 fue mezclado por IAnMove en development (`8542bf74`, 2026-09-06).
- Revisión Cursor del HEAD actual **no completada**: límite de uso/gasto.
  «Cursor Automation: success» no equivale a revisión Bugbot del código.
- Catálogo piloto de 24, compiladores, arte SVG/GLB original y galería:
  implementados localmente. 24 MP4 reales de 4 s, 720p/30, sin audio ni inferencia.
  No son aún 50 escenas de cada modo ni un escenario 3D compartido.
- «Abrir en editor» usa SceneAnimatorPanel y JSON real, no un visor alternativo.
- El Wizard aún no tiene un contrato completo de selección de estas nuevas
  candidatas, permisos persistentes de todos los tipos ni dirección multiescena.
- Los GLB actuales se renderizan individualmente: su composición no demuestra
  oclusión/iluminación/colisiones entre modelos en un único mundo.

El usuario autorizó expresamente continuar sin el check de Cursor hasta que vuelva
su cuota (2026-09-06). Excepción temporal: revisión independiente con otro agente,
tests locales y CI del HEAD actual antes del merge normal. No cambiar rulesets,
checks ni límites de gasto; no afirmar «Cursor revisado». Si una protección real
impide mezclar, detenerse sin bypass. Al recuperar cuota, retomar Cursor.

Los 24 vídeos coral fueron aprobados visualmente como referencias de estilo y
acción. Se conservan intactos en una publicación de assets, **no release de app**:
[referencias v1](https://github.com/IAnMove/hocuspocus/releases/tag/procedural-style-reference-v1).
El manifiesto mantiene SHA por MP4/PNG/JSON y procedencia por clip; la aprobación
posterior no reescribe el estado histórico del sidecar. No aprobar por extensión
variantes teal, imágenes pintadas o futuros cambios de cámara.

## Procedimiento obligatorio para cada PR

- [ ] Releer AGENTS.md y reglas del módulo; comprobar logs si se diagnostica.
- [ ] Consultar el HEAD actual de origin/development y PRs abiertos/hotspots.
- [ ] Crear rama y worktree propios; no cambiar la rama de una sesión compartida.
- [ ] Anotar objetivo, archivos permitidos, dependencias mezcladas y aceptación.
- [ ] Añadir primero una prueba que falle por la carencia o regresión real.
- [ ] Implementar el corte vertical mínimo; no elevar presupuestos de deuda para pasar.
- [ ] Ejecutar tests locales aplicables, lint, tipos, build y ratchet contra base real.
- [ ] Revisar diff y archivos staged explícitos: sin medios, pesos, secretos o outputs.
- [ ] Commit pequeño; registrar SHA y qué validación corresponde a ese SHA.
- [ ] Abrir PR contra development, con evidencia y limitaciones; pedir Cursor
  cuando esté disponible, o documentar la excepción temporal y revisión independiente.
- [ ] Leer revisión y CI del **HEAD actual**; arreglar hallazgos y repetir pruebas.
- [ ] Mezclar normalmente sólo cuando estén satisfechas ambas condiciones.
- [ ] Actualizar estado y seguir desde development mezclado, no desde una pila vieja.

Un check neutro, omitido, cancelado o sólo publicador no es aprobación.
Un JSON del implementador no autentica QA independiente. El revisor no se
concede permisos de escritura ni cambia tests para aceptar su propia solución.
No se exige una revisión humana de código ficticia: automatización comprobable,
revisión independiente y selección funcional/visual humana muy acotada.

Una casilla `[x]` significa que su acción concreta tiene evidencia, no que toda
la fase esté terminada. Mantener por fase: diseñado / local / commit / PR /
CI / Cursor / development / render real / aprobado visualmente / main.

## Contratos que no se negocian

1. **Identidad:** sceneId, revision, schemaVersion, renderer/version, seed,
   templateId/version, shotId, productionId, runId y assetId estables. Los nombres
   de fichero son presentación, no claves para correlacionar ejecuciones.
2. **Persistencia:** snapshot exacto de escena + referencias durables con hash,
   procedencia, licencias, modelo/proveedor/prompt si hubo generación. Guardado
   atómico con revisión esperada; no pisar otra pestaña. Sin migración destructiva.
3. **Tiempo:** frameIndex y fps racional como autoridad; semilla explícita,
   cámara/animación/efectos evaluables fuera de orden. Date.now y requestAnimationFrame
   no determinan el contenido exportado. Playback puede saltar frames; export no.
4. **Renderer:** prepareAssets → validate → evaluateFrame → render → dispose.
   Export consume la misma evaluación que preview. El adaptador v1 conserva escenas.
5. **Capacidades:** soportado / degradado con explicación / no soportado.
   Controles deshabilitados con motivo; no omitir silenciosamente profundidad,
   sombras, multivista, audio, filtros o modelos no soportados.
6. **Permisos:** modo procedural bloquea inferencia de vídeo en el punto de
   ejecución; allow-list separada para imagen/modelo/audio/voz, coste y descarga.
   El LLM, metadata importada y texto citado no amplían permisos. La ausencia de
   un recurso detiene/prepara una solicitud, no dispara MiniMax por fallback.
7. **Idioma:** UI, conversación, prompt técnico y letras/diálogo son campos
   separados; texto citado protegido literalmente. El prompt técnico inglés no
   traduce diálogo. Las pistas de voz guardan idioma y texto realmente sintetizado.
8. **Recuperación:** idempotency key por operación, transiciones válidas, cancelación,
   timeout, reintento explícito y recuperación tras reinicio. Finalizar una vez;
   un MP4 temporal no se publica en Library como asset final antes de verificarse.
9. **Seguridad:** DSL de datos validada, nunca JS/GLSL arbitrario del Wizard.
   URLs/assets con políticas de origen y tamaño; no SSRF ni rutas del disco.
   Import GLB/glTF con límites y recursos externos explícitos, sin descargas ocultas.
10. **Recursos:** perfiles preview/export medidos, cargas seriales mientras corren
    tests pesados. Reutilizar recursos y liberar texturas/canvases/workers al salir.

## Dependencias y orden

| Fase | PR(s) previstos | Depende de | Resultado verificable |
|---|---|---|---|
| P00 | #168, piloto B, C1, C2 | #166 | Wizard seguro, 24 candidatas editables y evidencia |
| P00D | referencias + selector de assets | B, C1, C2 | 24 acciones con vídeo de referencia y bindings durables de Library |
| P01 | contrato procedural | P00; referencia mínima de assets de P00D | documento de escena/capacidades compatible |
| P02 | evaluación determinista | P01 | misma evaluación temporal en preview/export |
| P03 | cámaras 2D | P02 | movimientos y encuadres reutilizables |
| P04 | composición 2,5D | P03 | grupos, máscaras y profundidad por capas |
| P05 | catálogo 2D A–E | P04 | 5 lotes de 10 propuestas distintas |
| P06 | Wizard declarativo | P05-A; resto aditivo | crea/abre/edita con permisos y IDs |
| P07 | montaje durable | P06 | escenas → secuencia → vídeo recuperable |
| P08 | escenario 3D mínimo | P07 | dos GLB y planos en un único mundo |
| P09 | cámara/luz/movimiento 3D | P08 | herramientas limitadas de puesta en escena |
| P10 | catálogo 3D A–E | P09 | 5 lotes de 10 propuestas distintas |
| P11 | contrato/pipeline de acabados | P02, P09 | misma pila en ambos modos y export |
| P12 | filtros A–E | P11 | 5 lotes de 10 técnicas, capacidades honestas |
| P13 | Wizard híbrido y editor | P07, P10, P12 | creación nueva por composición, no por código |
| P14 | personajes A–C | P13 | kit multivista, movimiento y diálogo consistente |
| P15 | endurecimiento/release | fases aceptadas | release explícito, reversible y probado |

Rama de trabajo AN, **no es un gate para continuar P05–P15**:

| Subfase | Depende de | Corte inicial verificable |
|---|---|---|
| AN0 | P01/P02/P03; máscaras de P04 | contrato R0–R3, encuadres y acentos |
| AN1 | AN0/P04 | una receta de velocidad; después AN-01…08 |
| AN2 | AN1; efectos con buffers esperan P11 | una receta de energía; después AN-09…16 |
| AN3 | AN0/P04; receta de audio/montaje espera P07 | una reacción; después AN-17…24 |
| AN4a | AN3/P07 | montaje/paneles AN-25…29 |
| AN4b | P14 kit de poses | AN-30, sin bloquear las recetas de imagen única |

P05/P10/P12 son fases con sub-PRs A–E para evitar PRs gigantes: cada lote tiene
su contrato de aceptación. Mezclar un lote antes de abrir el siguiente. No abrir
los quince simultáneamente. El número objetivo no justifica rebajar calidad.

## P00 — Cerrar el piloto sin fingir que es el producto completo

Objetivo: conservar la demo aprobada, preparar Wizard y entregar selección visual.
Riesgo medio. Owner principal en integración; Luna en arte/tests/galería acotados.

- [x] Resolver cómo continuar: #168 mezclado; excepción de Cursor autorizada,
  revisión independiente + CI siguen siendo obligatorios.
- [x] PR piloto B (#169, merge `39c7fd4f` por IAnMove): `features/sceneTemplates/{catalog,compile,sceneBuilders,
  cinemaScenes,musicScenes,spaceScenes,demoScenes,demoArtwork,demoShips}` y tests.
- [x] PR piloto C1 (#173): galería/ruta/editor-handoff, decisiones versionadas y E2E
  en `ui/e2e/specs`, no una carpeta que CI no descubre.
- [x] PR piloto C2 (#175, `38a90aa6`): tooling local reproducible, API cerrada y tests HTTP. Depende
  de C1; separado para no unir servidor de QA y UI en un PR demasiado grande.
- [ ] Comprobar 24 snapshots, reproducción/seek, cambio de assets, guardado/reapertura.
- [x] Publicar originales fuera de git: referencias v1, 74 assets remotos con
  tamaño/SHA comprobados (72 originales, manifiesto, ZIP).
- [ ] No promover ni borrar plantillas antiguas sin selección visual del usuario.

Aceptación: A/B/C1/C2 mezclados con evidencia separada; candidatos visibles y editables.
Los 24 originales coral tienen aprobación visual explícita del usuario; no implica
que todas las futuras escenas o parámetros estén validados. El estado de código,
CI y merge continúa registrándose por separado.

### P00D — Selector y estilos sin confundir acción, apariencia e identidad

- [ ] Selector dentro del editor con acción, slots y vídeo original de referencia.
- [ ] Conservar demos SVG/GLB y escenas originales; no regenerarlas al cambiar código.
- [ ] Referencias remotas opt-in, estado offline/error visible, un vídeo activo;
  sin descargas masivas al instalar o abrir HocusPocus.
- [ ] Separar «abrir plantilla actual» de recuperar el snapshot del MP4 original.
- [ ] Binding de Library conserva assetId, workspace, localización, tipo y metadata;
  no considerar un nombre o blob URL como identidad durable.
- [ ] Formulario visible para fondo, sujeto, objetos y primer plano; tipos
  incompatibles deshabilitados con motivo; no compilar con slots requeridos vacíos.
- [ ] Reemplazar assets sin alterar la gramática; no llamar generadores por fallback.
- [ ] Imágenes generadas: acción explícita separada, modelo/proveedor/prompt reales,
  autorización por medio, espera de resultado y resolución a assetId en Library.
  Si el upload aún no devuelve identidad, no fingir que queda registrado.
- [ ] QA barata: cancelación de búsqueda al cambiar workspace, referencias stale,
  selección visible y roundtrip de IDs; ningún modelo en CI.
- [x] Prueba local separada con fondo y recorte pintados por image_gen: 4 s/720p/30,
  export real y snapshot idéntico al guardado. No es un rig ni aprobación visual.

P01 debe reutilizar este pequeño contrato de referencias, no introducir una segunda
identidad paralela para los mismos assets. P00D puede dividirse en PR de catálogo/
referencias y PR de bindings/selector; después abordar la generación explícita.

### Encuadre y actuación de recortes — decisión del usuario 2026-09-06

- [ ] Separar acción de encuadre: cuerpo entero, plano medio (cintura hacia arriba),
  medio corto y primer plano. Son opciones de una misma plantilla, no nuevas
  plantillas para inflar el catálogo. Mostrar zona segura y límites en preview.
- [ ] Para personajes estáticos, recomendar plano medio/medio corto. Los planos
  generales siguen disponibles, con aviso visible: no hay locomoción articulada.
- [ ] Fijar contrato: `medium = waist-up` y predeterminado para personajes
  estáticos. Cuerpo entero sólo por selección explícita/pose sostenida/flotación.
- [ ] Encuadrar con anclas de cabeza/cintura y margen del asset, no un recorte fijo
  que decapite personajes de distintas proporciones. Anclas ajustables en editor.
- [ ] No desplazar horizontalmente un humano de cuerpo entero como si caminase:
  pose sostenida, flotación explícita o movimiento de cámara sí; marcha requiere
  rig/ciclo de pasos o un plano generado aparte. No fingir que un filtro lo arregla.
- [ ] Montaje híbrido: planos procedurales para diálogo/insertos/entornos y H3 con
  referencia de personaje para caminar, girarse o actuar. Conservar characterId,
  referencia de imagen, shotId, modelo/proveedor/prompt y permiso por plano.
- [ ] H3 es opt-in; no fallback silencioso desde provided_only. No ejecutar H3 ni
  otro generador de vídeo mientras siguen las pruebas pesadas actuales.
- [ ] QA: encuadre dentro de zona segura para distintos tamaños/padding, cara no
  cortada, piernas fuera del plano medio, preview/export iguales, transiciones y
  continuidad visual entre planos. Smoke H3 queda para validación local autorizada.

Orden: encuadres y anclas primero (P00D/P03), montaje híbrido después (P07/P13),
personajes articulados y locomoción real al final (P14).

## P01 — Base pequeña: documento procedural y matriz de capacidades

Un PR, riesgo alto por compatibilidad; principal implementa, Luna prueba fixtures.
Archivos: nuevo `ui/src/features/proceduralVideo/{document,capabilities,validation}.ts`,
adaptador `legacySceneAdapter.ts`, seam mínimo en `sceneFile.ts`/`sceneOutput.ts`.
No añadir Three todavía ni reescribir `types.ts` o SceneAnimatorPanel entero.

- [ ] Inventariar todos los lectores/escritores v1 y guardar fixtures de compatibilidad.
- [ ] ADR corto: `kind: composition | stage3d`; unidades y límites de cada modo.
- [ ] Envelope con identidad/revisión/procedencia/tiempo/política; no romper Scene v1.
- [ ] `stage3d` declarado no disponible hasta P08; no un botón que parece funcionar.
- [ ] Resolver capacidades antes de mostrar controles; exponer razón y alternativa.
- [ ] Versiones desconocidas fallan explicativamente; preservar original importado.
- [ ] Tests JSON roundtrip, fixtures v1, números inválidos, IDs/revisiones y capabilities.

Aceptación: todas las escenas previas abren/exportan igual; nuevo documento guarda
y recupera sin pérdida; ningún campo unsupported se acepta silenciosamente.

## P02 — Evaluación de frames, preview/export y QA visual

Un PR, riesgo alto; principal propietario de la extracción temporal.
Archivos: nuevo `features/proceduralVideo/evaluation/*`, seams existentes de
`SceneAnimatorPanel`, `scenePlayback`, `sceneMotion`, `sceneFace` según inventario.

- [ ] Caracterizar cámara, órbitas, parentesco, visibilidad, ojos/bocas y efectos.
- [ ] Extraer sólo evaluación pura de un frame, no todo el panel de golpe.
- [ ] Frame inicial/final definidos sin duplicación; audio en muestras, no reloj UI.
- [ ] PRNG con semilla; animaciones de modelos por tiempo absoluto con seek.
- [ ] Preview y export invocan evaluador común; ownership explícito de recursos.
- [ ] Fixtures sintéticas minúsculas, capturas en 0/25/50/75/final y test seek inverso.
- [ ] Test cancelación/export fallida/context loss sin asset final falso.

Aceptación: mismas posiciones/opacidades/cámara para tiempo idéntico; captura
preview/export con tolerancia documentada, no hashes MP4 idénticos entre codecs.
No llamar «paridad visual» a comparar sólo el JSON de ambos caminos.

## P03 — Lenguaje y controles de cámara 2D

Un PR, riesgo medio. `features/proceduralVideo/camera/*`, panel pequeño extraído,
locales en/es y pruebas; no modificaciones de backend.

- [ ] Separar encuadre, ángulo, movimiento, proyección/óptica y relación de aspecto.
- [ ] Implementar los movimientos 2D marcados en CAMERAS.md con límites y easing.
- [ ] Objetivo de cámara por ID, lead room, headroom, zona segura y trayectoria visible.
- [ ] Distinguir crop/zoom 2D de dolly/paralaje y perspectiva real; mostrar limitaciones.
- [ ] Cámara de trabajo del editor separada de cámara de salida.
- [ ] Probar sujeto en cuatro esquinas, aspect ratios y cambios de tamaño del asset.

Aceptación: trocar assets no rompe automáticamente encuadre; caminos editables y
deterministas; export y visor usan la misma cámara de salida.

## P04 — Composición 2,5D: capas que realmente se pueden dirigir

Un PR o dos cortes inseparables si supera 800 líneas de producción revisables;
riesgo alto. `composition/{groups,masks,depth,anchors}.ts` y sus paneles.

- [ ] Grupos y pivotes sin ciclos; coordenadas locales/mundo con inversas probadas.
- [ ] Anclas semánticas por asset (pies, cara, centro, emisor), crop y safe bounds.
- [ ] Máscaras alpha/matte y revelado por oclusor; no sustituirlo por un fade.
- [ ] Profundidad por capas, paralaje y regla explícita de orden; no prometer mesh-depth.
- [ ] Trayectorias relativas/orbitas y cambios de orden validados sin saltos accidentales.
- [ ] Sombras/reflejos 2D estilizados etiquetados como tales, sin física fingida.
- [ ] Test asset sin alpha, pivote fuera, máscaras ausentes, mezcla de relaciones.

Aceptación: revelar, cruzar delante/detrás y orbitar son mecanismos editables,
no animaciones fijadas a las coordenadas del personaje de la demo.

## P05 — 50 composiciones con diferencia real

Cinco PRs A–E de 10 entradas según SCENES_2D_25D.md. Riesgo medio por lote.
`sceneTemplates/composition/*`, manifests, demos nativas y tests del lote.
Luna puede implementar manifiestos/fixtures de gramáticas aprobadas; principal
define cualquier primitiva nueva. No añadir 50 ramas al panel o al prompt global.

- [ ] Por lote, elegir 10 IDs y declarar requisitos; no ocultar dependencia pendiente.
- [ ] Por ID: objetivo narrativo, beat inicial/cambio/resolución, slots y constraints.
- [ ] Definir duración/encuadre/tempo/semilla y qué transformaciones son invariantes.
- [ ] Compilar a documento editable; probar tres bindings, incluido uno adverso.
- [ ] Render local de ejemplos diferentes, no sólo recolorear el mismo personaje.
- [ ] Revisión independiente de diferencia visual; fusionar duplicados detectados.
- [ ] Galería con etiquetas de soporte/estado y botones exactos para abrir/editar.

Aceptación por lote: 10 mecanismos distinguibles, tests y render reales; revisión
de estética separada. No fabricar aprobaciones para llegar al número 50.

## P06 — Wizard: de intención a composición editable

Un PR de contrato/runner y otro sólo si la integración UI lo exige; riesgo alto.
`features/agent/*` en puertos registrados, `proceduralVideo/commands/*`, API/workflow
existentes sólo mediante seams. No aumentar el legacy executor.

- [ ] Acciones tipadas list_templates/prepare_scene/patch_scene/open_scene/render_scene.
- [ ] Selección por templateId/version y assets ID exactos; candidatas sólo con opción
  experimental explícita. Describir capacidades al LLM, no pegar toda la biblioteca.
- [ ] Cerrar permiso persistente por medio; texto citado y ejemplos son sólo datos.
- [ ] Preparar formulario visible con escena propuesta y razones/recursos faltantes.
- [ ] Ediciones con expectedRevision y preview de cambio, no sobrescribir pestaña ajena.
- [ ] RunId/idempotency, ACK de UI aplicado y errores correlacionados, cancelación.
- [ ] Mantener idioma y fragmentos literales; tests ES/EN/otros idiomas declarados.
- [ ] Crear escenas nuevas combinando primitivas tipadas con validación; no eval/código.

Aceptación: «compón con estos dos assets, sin generar vídeo» abre, ajusta y exporta
la escena correcta; falta de asset explica y no invoca un proveedor alternativo.
Un request_id o UI toast sin persistencia final no completa una acción.

## P07 — Vídeoclips e historias sin generación de vídeo

Dos PRs secuenciales: secuencia durable; integración Wizard/Director. Riesgo alto.
Reutilizar `wizardWorkflowRuntime`, `sceneRhythm`/`sceneAudio` y APIs de producciones;
reservar Director antes de tocarlo. No invadir su refactor paralelo.

- [ ] Shot list con continuidad de assets, idioma, aspecto, tiempo y política.
- [ ] Cues musicales con fuente/fiabilidad; onset/BPM no inventados si no hay análisis.
- [ ] Cortes, transiciones y handles explícitos; duración final sin huecos/frames dobles.
- [ ] Render jobs serializables, temporales por run, verificación y publicación atómica.
- [ ] Recuperar tras reinicio a mitad de secuencia sin repetir renders completados.
- [ ] Mezcla de audio, ducking opcional, ausencia de clipping y sync de eventos.
- [ ] Library: production → shots → runs → assets; abrir snapshot de cada plano.
- [ ] Pruebas de falso worker + ffmpeg corto local, sin llamar modelos ni descargas.

Aceptación: producción de 30–60 s, >=6 planos distintos, audio permitido ya existente,
reinicio simulado, un único asset final y todos los planos editables.

## P08 — Escenario 3D compartido mínimo

Un PR experimental, riesgo alto; principal completo. `stage3d/{loader,renderer,
sceneGraph,resources}.ts`; dependencia Three directa fijada y auditada si se elige,
sin depender accidentalmente del Three transitivo privado de model-viewer.

- [ ] Spike pequeño con dos GLB originales, un plano 2D y una cámara compartida.
- [ ] Decidir Three/WebGL por compatibilidad medida; WebGPU no requisito inicial.
- [ ] Unidades/ejes, bounds, materiales/transparencia, luces mínimas y color definidos.
- [ ] Oclusión real entre objetos; cámara orbita el conjunto, no cada visor por separado.
- [ ] Límites de vértices/texturas/extensiones y carga cancelable; validar glTF offline.
- [ ] Reusar contrato temporal, export y documento; dispose y context-loss explícitos.
- [ ] Feature flag; escena v1 nunca migra automáticamente a 3D.

Aceptación: órbita de dos objetos con un tercero que los oculta en un mundo único,
snapshot reabrible y MP4 real. Presupuesto medido en hardware/software; si el spike
no cabe, registrar límites y resolverlo antes de añadir 50 escenas.

## P09 — Puesta en escena 3D, no mini-Blender

Dos PRs: cámara/transformaciones; iluminación/animación. Riesgo alto.
`stage3d/{camera,lights,motion,animation}.ts` y paneles acotados.

- [ ] Perspectiva/ortográfica, focal/sensor o FOV inequívoco, clipping coherente.
- [ ] Dolly/truck/pedestal/orbit/spline/look-at y guías de encuadre.
- [ ] Keyframes de transform, parenting, instancias y animaciones glTF por tiempo.
- [ ] Luz principal/relleno/contraluz y sombras presupuestadas, no GI prometida.
- [ ] Planos/billboards 2D con orientación explícita y aviso de vistas inexistentes.
- [ ] Efectos de naves: emisores/anclas, trayectoria y momentos de impacto coordinados.
- [ ] Cámara editor/salida, gizmos y undo/redo; no esculturas, UV editing o rigging libre.

Aceptación: misma toma con dos modelos distintos mantiene encuadre, oclusión y
acción; ninguna luz/control aparenta funcionar si el perfil lo deshabilita.

## P10 — 50 escenarios 3D

Cinco PRs A–E de diez entradas según SCENES_3D.md; riesgo medio por lote.
`sceneTemplates/stage3d/*`, fixtures/galería. Misma aceptación por lote que P05,
añadiendo profundidad, escalas, transparencia, sombras y dos cámaras de prueba.

- [ ] Diferenciar escena espacial de cambio de trayectoria de la misma nave.
- [ ] Validar bounds/escala/anclas de tres juegos de modelos antes del render.
- [ ] Añadir planos de producto, arquitectura, espectáculo, geometría abstracta y
  acciones con varios objetos; no hacer las 50 con naves.
- [ ] Mostrar límites de física/colisión/reflexión; animación programada no simulación física.
- [ ] Cada preview enlaza su documento, coste medido y export real.

Aceptación: diez propuestas independientes por lote, fuera del selector aprobado
hasta selección; no añadir objetos complejos sólo para impresionar un screenshot.

## P11 — Pipeline compartido de acabados

Un PR, riesgo alto por color/paridad. `proceduralVideo/effects/{contract,pipeline,
capabilities,resources}.ts`, adapters composición/escenario.

- [ ] Pila ordenada no destructiva con ID/versión/params/mix/enabled y seed.
- [ ] Espacios color lineal/sRGB, alpha premultiplicado, tone mapping y resolución.
- [ ] Exponer buffers requeridos por efecto; nunca inferir profundidad de un JPEG.
- [ ] Preview/export comparten operador; CSS filters sólo si export equivalente probado.
- [ ] Imagen original/A-B, reordenar, reset y parámetros animables deterministas.
- [ ] Límites de pases/memoria y perfil accesible sin flashes ni sacudidas fuertes.
- [ ] Desconocido/no compatible ⇒ deshabilitado con razón o error de export explícito.

Aceptación: pila vacía conserva imagen; render con dos efectos coincide con preview;
cambiar orden tiene resultado probado y guardado; reiniciar no cambia el grano.

## P12 — 50 acabados distintos, no 50 nombres de LUT

Cinco PRs A–E siguiendo FILTERS.md. Riesgo medio/alto para historia temporal.
`effects/operators/*`, schemas, controles y atlas de muestra; cada shader escrito
y revisado como código del proyecto, nunca recibido del LLM.

- [ ] Implementar lotes de 10 con dependencia de buffers verificada en manifiesto.
- [ ] Carta sintética y escena real: piel, degradados, líneas finas, texto, transparencias.
- [ ] Intensidad cero es identidad; parámetros límite finitos; color/alpha no se corrompen.
- [ ] Seek/re-render y reducción de FPS no cambian aleatoriedad de forma accidental.
- [ ] Separar «PSX de imagen» de vertex snapping/afinidad de textura de geometría.
- [ ] Añadir combinaciones curadas como presets, sin contarlas como técnicas nuevas.
- [ ] Gallery A/B y señalización de flash, pérdida de legibilidad o coste elevado.

Aceptación: todos los efectos del lote tienen evidencia individual, impacto medido
y explicación comprensible; un efecto profundo no aparece disponible en 2D plano.

## P13 — Dirección asistida en ambos modos

Un PR de integración, riesgo alto. Depende de workflows y capacidades previas;
no un segundo runner o un prompt monolítico distinto para cada galería.

- [ ] Usuario/Wizard eligen composition o stage3d según resultado y recursos.
- [ ] Explicar recomendación, coste y límites antes de ejecutar.
- [ ] Crear nueva escena desde primitivas/slots/cámaras/acabados validados.
- [ ] Reusar personajes/props entre tomas por IDs; no nombres ambiguos de Library.
- [ ] «Abrir en editor» desde Wizard, Activity, Run y output lleva al snapshot/revisión correctos.
- [ ] Modificar manualmente y continuar en Wizard sin restaurar una versión anterior.
- [ ] Tests adversarios: prompt injection en metadata/citas, versiones desconocidas,
  dos pestañas, reintentos y modo procedural sin rutas de vídeo IA.

Aceptación: un videoclip híbrido de ambos modos sin inferencia de vídeo; se puede
abrir cualquier toma y regenerar sólo su render, sin perder la producción.

## P14 — Personajes consistentes y movimiento (último bloque de producto)

Tres PRs A/B/C, en ese orden. Riesgo alto; principal contratos/rig temporal,
Luna manifests/fixtures y pruebas adversarias. Reusar character-kits/sceneFace,
no otra colección desconectada ni duplicar ojos/bocas en las imágenes.

### A. Kit consistente y publicación de assets

- [ ] CharacterId/version, proporciones, paleta, vestuario, anclas, vistas y licencias.
- [ ] Frontal, 3/4 izq/der, perfil izq/der y espalda como assets verificables;
  espejo sólo si diseño realmente simétrico, nunca inventar logo/mano dominante.
- [ ] Fondo transparente, bounds/pivotes comunes, ojos/bocas sin duplicación en base.
- [ ] Pipeline opcional de generación de hojas a partir de referencias, modelo/seed/
  prompts/idioma guardados; generación no garantiza consistencia por compartir seed.
- [ ] QA de silueta, colores, proporción y anclas; vista ausente bloquea el giro o
  propone puesta en escena compatible, no deforma una foto para fingir espalda.

### B. Bloqueo y locomoción

- [ ] Estados idle/walk/turn/gesture/float con transiciones y contacto de pies.
- [ ] Caminos, velocidad, orientación, entrada/salida de escena y profundidad.
- [ ] Root motion separado del ciclo de piernas; evitar foot sliding al cambiar velocidad.
- [ ] Rig «fantasma» alternativo: flotación y giro de cuerpo, sin exigir piernas falsas.
- [ ] Objetos sujetos a manos y cambio de pose con anclas consistentes.
- [ ] Escenas de conversación lateral, caminando y de espaldas con interlocutor visible.

### C. Diálogo, mirada y actuación

- [ ] Visemas de audio real o alineación explícita, idioma/motor/procedencia registrados.
- [ ] Bocas cerradas cuando no hay audio/texto; ojos abiertos/cerrados excluyentes.
- [ ] Assets de boca por vista y ancla facial; no misma boca frontal pegada a un perfil.
- [ ] Pistas de mirada/parpadeo/gesto separadas de voz, con prioridad y límites.
- [ ] QA de sincronía, deriva a 60 s, cambio de plano y final de utterance.
- [ ] Corto original de 30–60 s, dos personajes, >=3 vistas, caminata o flotación,
  interacción con objeto; texto pedido sin traducción silenciosa.

Aceptación: identidad reconocible y sin saltos de facciones; no declarar voces
neuronales verificadas con un audio sintético de prueba. Mientras estén prohibidas
las cargas pesadas usar fixtures originales y audio permitido existente/sintético.

## P15 — Estabilidad, recuperación y release explícito

Uno o más PRs de corrección acotados; release development→main es otra operación.

- [ ] Migraciones/backup de proyectos y recuperación probada, sin borrar datos antiguos.
- [ ] Matriz Windows/Linux/macOS y navegadores que realmente se soportan.
- [ ] Memoria estable al abrir/cerrar 20 escenas; cancelación, assets rotos y context loss.
- [ ] Instalación limpia reproducible, modelos opcionales no descargados por defecto.
- [ ] Documentación de editor, Wizard y API; ejemplos originales con licencias.
- [ ] Smoke funcional local antes de release; weights/outputs fuera del repositorio.
- [ ] Preparar notas, rollback y PR development→main sólo con autorización de publicación.

Aceptación: release reproducible y recuperable; no basta un score agregado alto.

## CI barato y QA local

En cada PR: tests puros (schemas/cámara/frames/slots/idioma/permisos), fixtures de
compatibilidad, API/worker falsos, lint/tipos/build, dependencias y ratchet contra
base. E2E Chromium con API simulada: abrir/editar/guardar/reabrir, run correcto y
fallo visible; bloquear peticiones no simuladas. Nada de inferencia/modelos en CI.

Visual automatizado: fixtures pequeñas y tolerancia fijada antes del cambio,
imágenes diff como artifacts de CI con retención, nunca autorizar al implementador
a actualizar todos los golden sólo porque fallan. Revisor independiente juzga
regresiones; el humano elige estética mediante clips breves y A/B, no lee miles de líneas.

Render local por fase: imágenes y MP4 del compositor real, software cuando sea
viable, ffprobe para dimensiones/FPS/duración/audio, SHA y scene snapshot. Probar
seek, export y reapertura. No confundir preview DOM con MP4, ni compare JSON con
compare visual. Smoke más largo 1080p/varios planos sólo cuando el equipo esté libre.

Antes de releases: instalación limpia, reapertura/reanudación tras reinicio,
fuentes/GLB de usuario con licencias, idiomas y audio largo, modos 2D/3D, cancelación,
memoria. Generaciones reales de imagen/audio/3D/vídeo sólo locales y autorizadas;
no necesarias para que pase CI. Mientras los tests pesados del usuario sigan activos,
no llamar a generadores ni usar 42003/42004 como banco de pruebas.

## Paralelismo seguro y límites de agentes

Luna: un archivo/módulo con contrato fijado, fixtures, manifiestos, traducciones,
test E2E específico, demos geométricas originales. Debe recibir ruta absoluta,
archivos permitidos y prohibidos, prueba a ejecutar y criterio de aceptación.

Principal: autoridad de permisos, identidad, migraciones, temporalidad, renderers,
seguridad, integración y revisión visual. No delegar arquitectura al mismo agente
que autoriza sus resultados. Todos preservan cambios ajenos, sin cambiar ramas
compartidas, sin git add -A ni reset/force. Una tarea activa por archivo hotspot.

Paralelizables tras fijar contratos: pruebas de distintos operadores, fixtures,
docs, manifests en archivos separados. Secuenciales: SceneAnimatorPanel, types.ts,
sceneFile, capabilityRegistry/agentActions, runtime/export y `_launch_runtime.py`.
No tocar este último en estas fases salvo que un seam de backend imprescindible
lo requiera y se reserve un PR específico. No hacer un mega-refactor preventivo.

## Condiciones de parada

Parar dependientes ante CI/revisión no obtenible, contrato en conflicto, requisito
de descarga/compute no autorizado, pérdida de datos o cambio de alcance. Guardar
estado exacto, evidencias y siguiente acción. No sortear reglas por «modo yolo».
La selección estética puede quedar pendiente sin paralizar contratos independientes;
la falta de revisión de código no autoriza merge.

## Referencias técnicas (no equivalen a compatibilidad ya probada)

- [Cámaras Three](https://threejs.org/manual/en/cameras.html): distingue proyecciones;
  la adaptación concreta al editor requiere P08/P09 y sus pruebas.
- [Postprocesado Three](https://threejs.org/manual/en/post-processing.html): referencia
  de pases; HocusPocus debe decidir explícitamente orden, buffers y equivalencia de export.
- [Color management](https://threejs.org/manual/en/color-management.html): referencia
  para evitar dobles conversiones al unir pipelines.
- [Carga glTF](https://threejs.org/manual/en/load-gltf.html): referencia de assets,
  no sustituto de nuestros límites y pruebas de importación.
- Documentos locales: VIDEO3D_PRODUCTION_PLAN.md, VIDEO3D_TEMPLATE_REVIEW_PLAN.md,
  WIZARD_PROGRAMMATIC_VIDEO.md, WIZARD_WORKFLOW_RUNTIME.md, LOCAL_VALIDATION.md,
  CODE_HEALTH.md y SCENE_TEMPLATE_REVIEW.md (incluido con C2/#175).
