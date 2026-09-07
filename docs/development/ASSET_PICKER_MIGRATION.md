# Selector universal de recursos — inventario y contrato (PR 0)

Fecha de esta fotografía: 7 septiembre 2026.
Base: `origin/development` **`fae7d3f697d810bebf7e9ad8f749314da9bbd2b7`** (merge de [#198](https://github.com/IAnMove/hocuspocus/pull/198)).
PRs abiertos contra `development` al verificar: [#204](https://github.com/IAnMove/hocuspocus/pull/204) (`feat/video3d-music-templates`).
Este documento congela el inventario por **campo** y el contrato de aceptación. No implementa el picker.

Verificación: búsquedas `rg` en `ui/src` frente a esta tabla (sección 11). Sin suite UI completa, sin GPU y sin generación.

## Cómo leer las filas

Una fila = un campo que recibe un recurso (imagen, audio, vídeo, GLB u otro medio del catálogo). No una fila por archivo.

Columnas:

| Columna | Significado |
|---|---|
| ID | Identificador estable para PRs posteriores |
| Módulo | Superficie UI actual |
| Etiqueta / rol | Lo que ve o hace el usuario |
| Tipo | `image` `video` `audio` `model3d` `overlay` `scene` `mixed` |
| Qty | `S` simple · `M` múltiple (máximo si existe) |
| Origen actual | Disco nativo, catálogo/outputs, ambos, o botones separados |
| Restricciones | `accept`, capacidades, máscaras vs foto, etc. |
| Persistencia | Qué se guarda hoy (filename, path de upload, blob, ID de catálogo) |
| Wizard | Acción existente o `—` (PR 8) |
| Adaptador | Nombre previsto; el modal no importa el dominio |
| Tests | Prueba actual y la que exigirá la migración |
| Estado | `pending` `partial` `unused` `exception` `oos` |

Estados `partial` no cierran el contrato: #198 añadió `AssetExplorerDialog` con confirmación por doble clic, preselección del primer ítem, identidad por `name` y página de 12.

---

## 1. Contrato UX congelado

Aceptación de PRs 1–8. Casillas = trabajo pendiente, no hecho.

### Fuentes y campo

- [ ] Dos entradas visibles, no un segundo desplegable opaco: **Desde mi equipo** / **Desde HocusPocus**. Puede ser un control dividido con ambas opciones accesibles.
- [ ] Tras confirmar: miniatura o icono, título comprensible, **Cambiar** / **Quitar** cuando proceda. No volver a presentar un listado enorme de nombres técnicos.
- [ ] Selección simple por defecto. Solo los campos que ya son múltiples admiten multiselección explícita, contador, máximo y orden. No convertir todos los campos en múltiples.
- [ ] **Quitar / Sin recurso** es una acción explícita, distinta de **Cancelar**. Solo donde el campo sea opcional.
- [ ] El diálogo nativo entrega archivos del ordenador **del usuario**. El frontend no pide rutas del servidor. HocusPocus remoto: el archivo procede del cliente.

### Modal común

- [ ] Cabecera con propósito; búsqueda; filtro de tipo compatible; ámbito; ordenación.
- [ ] Cuerpo de tarjetas responsive; panel de vista previa; pie fijo **Seleccionar** / **Cancelar**.
- [ ] Cada tarjeta: miniatura/poster/icono, título legible, tipo y fecha. Duración para audio/vídeo y dimensiones/tamaño cuando aporten valor.
- [ ] Título: nombre editorial existente; si no hay, etiqueta determinista por tipo/fecha. Nombre físico completo en detalle/tooltip y búsqueda. No inventar títulos con LLM ni renombrar archivos al abrir el modal.
- [ ] Orden: creación reciente/antigua, nombre A–Z/Z–A; desempate estable por ID. Fecha ausente: «Fecha desconocida». No inventarla ni confundirla con finalización.
- [ ] Búsqueda y ordenación se aplican al conjunto consultado, no solo a la página visible.
- [ ] Ámbito inicial = campo/workspace. Cambiar de ámbito es explícito y respeta restricciones. No confundir workspace, carpeta de outputs y proyecto.
- [ ] Página de partida: 24 tarjetas, thumbnails lazy. No cargar el catálogo completo ni blobs/metadata completa por tarjeta. Virtualización solo si mediciones la justifican.

### Selección transaccional (captura concreta)

Ejemplo: compositor 2.5D, campo Personaje vacío, el usuario abre **Desde HocusPocus**.

1. El modal no preselecciona el primer GLB/imagen.
2. Pulsar una tarjeta solo marca elección **provisional**. Play, arrastrar un GLB o cambiar el filtro **no** confirman.
3. **Doble clic no confirma** (hoy `AssetExplorerDialog` sí lo hace; hay que desactivarlo).
4. **Seleccionar** escribe el valor en el campo. **Cancelar**, Escape o clic fuera **no** mutan el formulario.
5. Si el campo ya tenía recurso, reaparece seleccionado al reabrir si se puede resolver. Si no se puede resolver, no se finge que el primero es el valor.
6. Si un filtro oculta la elección provisional, sigue visible en el panel y exige compatibilidad vigente para confirmar.
7. Cambiar workspace o restricciones revalida; nunca se mantiene en silencio una elección incompatible.

### Previsualización (presupuesto de RAM)

- [ ] Imagen: miniatura ligera en tarjeta; imagen grande solo en la vista previa elegida (proporción y transparencia).
- [ ] Vídeo: poster y duración; Play/Pausa, volumen y scrub **del recurso activo**. Nada de autoplay masivo ni descargar todos los vídeos al abrir.
- [ ] Audio: icono/carátula, duración, Play/Pausa/volumen/progreso. No waveforms ni transcripciones al abrir.
- [ ] GLB: poster en tarjetas; «Vista 3D» carga **un** visor bajo demanda (órbita/zoom/reset; clips si existen). No inspeccionar/generar en cada tarjeta.
- [ ] Escenas/documentos: thumbnail y resumen; no tratarlos como vídeo/GLB. **Abrir una escena editable** ≠ añadir su vídeo como capa.
- [ ] Un reproductor activo y un contexto 3D por modal. Al cambiar, cerrar o navegar: pausar, liberar buffers, listeners, object URLs y WebGL.
- [ ] Visor GLB de carga diferida. Límites de bytes/timeout y confirmación si el archivo es extraordinariamente grande. Fallo de preview no implica que el asset sea inutilizable para un consumidor que sí lo soporta.

### Estados, i18n y accesibilidad

- [ ] Carga, vacío, sin resultados, error con reintento, recurso eliminado, miniatura ausente, formato no reproducible, archivo incompatible, subida en progreso/error.
- [ ] ES/EN; conservar literales del usuario. Teclado, foco visible, diálogo anunciado, Play separado de la tarjeta, foco restaurado al cerrar. No anidar botones dentro de botones.

### Identidad (recordatorio para adaptadores; detalle en PR 1)

Reutilizar ID y ubicaciones de `/api/v1/assets`. No persistir URLs blob. Legado sin ID: referencia versionada con ámbito + filename. Subida local = procedencia `upload`, no generación de IA. Preservar lineage al reutilizar un generado: no descargar y volver a subir solo para obtener un `File`.

---

## 2. Componentes existentes a conservar

| Pieza | Rol | Conservar / evolucionar |
|---|---|---|
| `ui/src/components/common/AssetExplorerDialog.tsx` | Modal + `AssetPickTrigger` | Evolucionar; wrapper compatible para consumidores de #198 |
| `ui/src/components/common/assetExplorer.ts` | Propósito 2.5D, filtro, aplicar elección | Separar utilidades comunes de acciones del compositor |
| `ui/src/components/common/ModalShell.tsx` | Semántica modal, Escape, foco | Reutilizar; no otro modal |
| `ui/src/api/assets.ts` | `AssetCatalogItem`, `fetchAssets` | Catálogo canónico (PR #58). No otra Library |
| `ui/src/api/outputs.ts` | `ApiOutput` legado | Puente por fases; no convertir todo de golpe |
| `ui/src/components/shared/FileUploadZone.tsx` | Dropzone + file input nativo | Mantener DnD con las mismas validaciones bajo confirmar |
| `ui/src/components/Sidebar/SceneLibraryDialog.tsx` | Abrir escena / recuperar receta | Conservar operaciones de dominio; presentación → explorador común |
| `ui/src/features/sceneTemplates/TemplateAssetPicker.tsx` | Library por `asset.id` | Sustituir por el modal común; conservar `catalogBindingIssue` |
| `ui/src/features/assets/AssetsPanel.tsx` | Explorador Media → Assets | No es un campo; no sustituirlo por el picker de formulario |

Hotspots a no editar en este PR: `SceneAnimatorPanel.tsx` (otro agente i18n), `Scene3DWorkspace.tsx` (#204), catálogos i18n.

---

## 3. Matriz de tipos y capacidades

| Tipo | `accept` típico | Preview contrato | Kind catálogo | No intercambiable con |
|---|---|---|---|---|
| Imagen | `image/*` o png/jpeg/webp | Miniatura + grande en panel | `image` | Máscara, recorte de boca, pose |
| Vídeo | `video/*` o mp4/webm/mov/mkv | Poster + duración + un player | `video` | Abrir receta de escena 3D |
| Audio canción | wav/mp3/flac/ogg/m4a | Icono + duración + un player | `audio` | Voz de referencia, SFX |
| Voz de referencia | wav/mp3/flac/ogg/m4a (~5 s) | Igual audio; no waveform | `audio` | Canción completa |
| GLB | `.glb,model/gltf-binary` | Poster + un visor lazy | `model3d` | Clips ya cargados en el visor |
| Overlay | `image/png,image/webp` | Imagen con transparencia | `image` | Foto opaca / vídeo |
| Escena editable | JSON de escena | Thumb + resumen | `scene` | Vídeo exportado `_3d_` |
| Mixed Omni/H3 | image+video+audio | Según tipo; cupos | mixto | Superar 12 refs / 3+3 H3 |

No ofrecer «Desde HocusPocus» vacío. Si el catálogo no admite el tipo (LoRA, JSON de proyecto, pesos), documentar excepción (sección 6).

---

## 4. Inventario por campo

### 4.1 Procedural 2.5D — PR 5

Consumidores: `SceneAnimatorPanel`, `SceneAnimatorExplorer`, `SceneRecipePanel`, `SceneLibraryDialog`. Wizard: `add_3d_scene_layer`, `attach_3d_scene_audio`, `open_3d_scene`. Tests actuales: `ui/tests/assetExplorerDialog.test.tsx`, `assetExplorerPurpose.test.ts`, `sceneLibraryDialog.test.tsx`. Migración: unificar botones «generado» vs «importar» en un campo de doble origen.

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P2D-01 | SceneAnimatorExplorer | Personaje / hero | image (visual) | S | Solo catálogo `AssetPickTrigger` → explorer `narrative-hero` | Slot plantilla narrativa; `assetSuitability('hero')`; none permitido | Nombre de output en estado de montaje; escena JSON al guardar | `add_3d_scene_layer` (image) | `narrativeSlotAdapter` | Explorer purpose + e2e compositor ambas fuentes | partial |
| P2D-02 | SceneAnimatorExplorer | Fondo / plate | image/video | S | Solo catálogo `narrative-plate` | Media generated; loop-ready es checkbox aparte | Filename en receta/escena | `add_3d_scene_layer` | `narrativeSlotAdapter` | Igual | partial |
| P2D-03 | SceneAnimatorExplorer | Objeto / portal (prop) | image (visual) | S | Solo catálogo `narrative-prop` | Slot opcional u obligatorio según plantilla | Filename o vacío | `add_3d_scene_layer` | `narrativeSlotAdapter` | Plantilla con/sin slot | partial |
| P2D-04 | SceneAnimatorExplorer | Primer término | image/video | S | Solo catálogo `narrative-foreground` | Opcional si el slot existe | Filename o vacío | `add_3d_scene_layer` | `narrativeSlotAdapter` | Plantilla con slot | partial |
| P2D-05 | SceneAnimatorPanel | Adjuntar audio generado | audio | S | Solo catálogo `scene-audio` si hay outputs de audio | Audio del workspace; no abre diálogo nativo | `scene.audioTracks[].filename` | `attach_3d_scene_audio` | `sceneAudioAdapter` | Adjuntar, cancelar, quitar pista | partial |
| P2D-06 | SceneAnimatorPanel menú Añadir | Capa GLB | model3d | S | **Botones separados**: explorer `layer-model` **o** `modelInputRef` `.glb` | GLB; reassign si `missingAsset` | `layer.source` URL/blob + name; escena JSON | `add_3d_scene_layer` model3d | `sceneLayerAdapter` | Disco + catálogo; reabrir escena | partial |
| P2D-07 | SceneAnimatorPanel menú Añadir | Capa imagen/vídeo | image/video | S | Botones separados: `layer-media` **o** `mediaInputRef` `image/*,video/*` | Tipo por MIME | Igual capas | `add_3d_scene_layer` image/video | `sceneLayerAdapter` | Disco + catálogo | partial |
| P2D-08 | SceneAnimatorPanel menú Añadir | Overlay PNG/WebP | overlay | M | Solo disco `overlayInputRef` multiple | png/webp | Varias capas overlay | `add_3d_scene_layer` overlay | `sceneLayerAdapter` | Multi archivo, cancelar nativo | pending |
| P2D-09 | SceneAnimatorPanel inspector | Reasignar asset perdido | según capa | S | Solo disco (mismo ref que P2D-06/07/08) | Tipo de la capa; no catálogo | Reemplaza `layer.source` | — | `sceneLayerAdapter` | Capa missing + ambas fuentes | pending |
| P2D-10 | SceneRecipePanel | Imágenes de receta | image/video | M | Botón catálogo **y** import `image/*,video/*` multiple | Manual recipe | Lista `selected[]` name/kind; al aplicar, escena | copilot receta (no picker) | `recipeAssetsAdapter` | Multi, quitar, orden | partial |
| P2D-11 | SceneRecipePanel | GLB de receta | model3d | M | Botón catálogo **y** import `.glb` multiple | Máx. implícito de receta | Igual | — | `recipeAssetsAdapter` | Multi GLB | partial |
| P2D-12 | SceneLibraryDialog | Abrir escena guardada | scene | S | Catálogo `mediaType=scene` (doble clic abre) | No es «añadir vídeo como capa» | Reemplaza documento de escena | `open_3d_scene` | `sceneLibraryAdapter` | Abrir, cancelar, no mutar si Escape | partial |
| P2D-13 | SceneLibraryDialog | Recuperar receta desde vídeo `_3d_` | video→scene | S | Lista de vídeos compositor | Distinto de P2D-12 y de importar el MP4 como capa | Receta en metadata → escena | — | `sceneLibraryAdapter` | No confundir con P2D-07 | partial |

### 4.2 Escenario 3D — PR 5 **después de #204**

Archivo: `ui/src/features/scene3d/Scene3DWorkspace.tsx`. **No editar mientras #204 esté abierto.** Slots reales según plantilla (`two-shot`, `product-orbit`, `hero-push`, `over-shoulder`, `tracking`, `crane-reveal`, `establishing`, `run-loop`). Wizard: `listenForWorld3DWorkflow` / plantilla; no hay picker de slot.

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S3D-01 | Scene3DWorkspace | Sujeto 1 | model3d | S | Dual ya: `stage.fromApp` + `input file` `.glb` | GLB; explorer filtra `/\.glb$/i` | `slot.sourceUrl` (a menudo **blob:**) + `media` | workflow world3d | `scene3dSlotAdapter` | Coordinar #204; no persistir blob | partial |
| S3D-02 | Scene3DWorkspace | Sujeto 2 | model3d | S | Igual; solo plantillas two-shot / over-shoulder | GLB | blob/url en documento 3D | workflow world3d | `scene3dSlotAdapter` | Plantilla con 2 sujetos | partial |
| S3D-03 | Scene3DWorkspace | Fondo | image | S | Dual: explorer `mediaType=image` + `image/*` | Imagen; loop cilindro es control aparte | `sourceUrl` + `loop` | workflow world3d | `scene3dSlotAdapter` | Fondo + infinite | partial |
| S3D-04 | Scene3DWorkspace | Accesorio (prop) | model3d | S | Dual; plantilla `establishing` | GLB | blob/url | workflow world3d | `scene3dSlotAdapter` | Plantilla establishing | partial |
| S3D-05 | Scene3DWorkspace | Clip de animación del GLB ya cargado | enum clips | S | `<select>` de `catalogs[slot.id]` | **No es lista de assets** | `slot.clip` index+name | — | — | No migrar al picker | oos |

### 4.3 Imagen y edición — PR 6A

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG-01 | InputsPanel | Start / frame inicial | image | S | Disco `pickImage` + drop; atajo galería `MediaFeedItem` «send to input» | `image/*`; obligatorio en I2V-only | `startImage` File y/o `params.image_start` path | `attach_studio_references` `start_frame` | `studioFrameAdapter` | Disco, catálogo, cancelar, quitar | pending |
| IMG-02 | InputsPanel | End frame | image | S | Disco + drop | Solo si `supports_end_frame` | `endImage` / `image_end` | attach refs (si se extiende) | `studioFrameAdapter` | Oculto si el modelo no soporta | pending |
| IMG-03 | InputsPanel | Frames inyectados | image | M | Disco + drop; reordenables | Presupuesto de frames del modelo | `inject frames` paths | — | `studioFrameAdapter` | Orden, máximo | pending |
| IMG-04 | InputsPanel / ImageRefSection | Referencias de imagen | image | M | Disco multiple + drop; reorder | `max_image_refs`; Edit consume 1 slot | `imageRefs` Files + upload paths | `attach_studio_references` subject/style | `studioRefsAdapter` | Orden, máximo, quitar | pending |
| IMG-05 | InpaintControls | Vídeo a inpaint | video | S | Disco + drop `video/*` | SAM/máscara aparte (no es asset picker) | `editVideo*` store | — | `editSourceAdapter` | Tipo no vídeo rechazado | pending |
| IMG-06 | OutpaintControls | Fuente outpaint | video/image | S | Disco + drop `video/*,image/*` | Canvas/máscara de expansión aparte | `editVideo*` | — | `editSourceAdapter` | Imagen y vídeo | pending |
| IMG-07 | EditAnythingControls | Vídeo Edit Anything | video | S | Disco + drop `video/*` | LoRA interpreta prompt; no SAM | `editVideo*` | — | `editSourceAdapter` | Rango temporal intacto | pending |
| IMG-08 | BlendControls | Clip A | video/image | S | Disco + drop | A y B independientes | `blendClipA` File+path+url | — | `blendClipAdapter` | Cancelar no toca B | pending |
| IMG-09 | BlendControls | Clip B | video/image | S | Disco + drop | Igual | `blendClipB` | — | `blendClipAdapter` | Igual | pending |
| IMG-10 | PanoramaLoopPanel | Fuente panorámica | image | S | Disco visible `png/jpeg/webp` | Preparación de loop; no audio | Blob preparado en panel | — | `panoramaSourceAdapter` | Transparencia/proporción | pending |
| IMG-11 | RecastControls | Vídeo a recastear | video | S | Disco + drop `video/*` | SCAIL | `editVideo*` | — | `recastAdapter` | No confirma al play | pending |
| IMG-12 | RecastControls | Personaje de reemplazo | image | S×N mappings | Disco `image/*` por mapping | Una identidad por mapping | `mapping.refPath` | — | `recastAdapter` | Mapping 0 y 1 | pending |
| IMG-13 | RecastControls | Vistas extra | image | M≤4 / mapping | Disco multiple | Tras alineación | `additionalRefs` | — | `recastAdapter` | Máximo 4 | pending |
| IMG-14 | RestyleControls | Vídeo a repintar | video | S | Disco + drop `video/*` | Timeline start/end | `editVideo*` | — | `restyleAdapter` | Trim conservado | pending |
| IMG-15 | RestyleControls | Frame editado | image | S | Disco `image/*` o round-trip Image mode | Debe corresponder al primer frame | `targetFrame*` | — | `restyleAdapter` | Reemplazar frame | pending |
| IMG-16 | RetakeControls | Vídeo a retomar | video | S | Disco + drop `video/*` | Timeline | `editVideo*` | — | `retakeAdapter` | Igual inpaint | pending |

`ImageUpload.tsx` (start/end dropzones) **no está montado**; `InputsPanel` lo sustituyó. No migrar el componente muerto; borrar o reexportar en PR 6A si sigue huérfano.

### 4.4 Vídeo y montaje — PR 6B

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| VID-01 | InputsPanel | Extender desde | video | S | Disco `video/*` + drop (modo Extend) | Ancla de timeline | `continueVideo` File+path+duración | — | `extendSourceAdapter` | Galería «continue from» | pending |
| VID-02 | InputsPanel / ControlVideoSection / AudioModeSection | Control / guide video | video | S | Disco; Advanced y audio mode duplican `video_guide` | mp4/webm/mkv/mov; image-mode usa imagen | `params.video_guide` | — | `controlVideoAdapter` | Un valor, varias superficies | pending |
| VID-03 | InputsPanel | Guide video (SCAIL etc.) | video | S | Disco si `guide_custom_choices` | Distinto proceso letters | `video_guide` + fps | — | `guideVideoAdapter` | Modelo sin guide: oculto | pending |
| VID-04 | InputsPanel | Soundtrack | audio/video | S | Disco wav/mp3/flac/ogg/m4a **o** contenedor vídeo | Backend extrae audio | `audio_guide` / soundtrack name | — | `soundtrackAdapter` | Vídeo como fuente de audio | pending |
| VID-05 | InputsPanel | H3 video refs | video | M≤3 | Disco | Total H3 refs ≤12; 2–15 s | paths H3 | — | `h3RefAdapter` | Cupo | pending |
| VID-06 | InputsPanel | H3 audio refs | audio | M≤3 | Disco | Igual cupo | paths H3 | — | `h3RefAdapter` | Cupo | pending |
| VID-07 | VideoEditControls | Vídeo fuente | video | S | Disco `.mp4,.webm,.avi,.mov` | Edit de vídeo Studio | `sourceVideo` + `video_guide` | — | `videoEditAdapter` | — | pending |
| VID-08 | VideoEditControls | Imagen de referencia | image | S | Disco png/jpg/webp; opcional | — | `refImage` path | — | `videoEditAdapter` | Quitar ≠ cancelar | pending |
| VID-09 | MultiClipEditor | Start image del shot | image | S / clip | Disco + drop | Un start por clip | `clip.startImage` File/path | — | `multiClipAdapter` | Clip 2 no pisa clip 1 | pending |
| VID-10 | MultiClipEditor | Keyframes del shot | image | M / clip | Disco `image/*` | Orden de keyframes | `clip.keyframes` | — | `multiClipAdapter` | Orden | pending |
| VID-11 | VideoEditorPanel | Clips del montaje | video | M | **Dual ya**: file multiple + picker propio `fromHocusPocus` | `.mp4,.webm,.mov,.mkv,.avi,.m4v`; orden de timeline | Proyecto Video Editor (nombres/urls) | — | `videoEditorClipAdapter` | Sustituir picker ad hoc; no resetear montaje | partial |
| VID-12 | AlternativeSongsDialog | Canción alternativa | audio | S | `<select>` de `fetchOutputs` audio | Exact output name | Sidecar alternative songs | `attach_videoclip_alternative_song` | `alternativeSongAdapter` | Homónimos, no GPU | pending |

`ContinueVideoSection.tsx` existe y **no se monta**; Extend vive en InputsPanel (VID-01).

### 4.5 Tools y 3D generado — PR 6A

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TLS-01 | ToolsSourcePanel | Fuente Tools | image o video | S | Disco + grid `AssetCatalogItem` + «usar galería actual» | remove_bg: solo image; upscale: image/video; revoice: video | `sourcePath` + `assetId` | — | `toolsSourceAdapter` | e2e `tools-background-removal.spec.ts` retarget al modal | partial |
| TLS-02 | ToolsParamsPanel | Voz A / referencia | audio/video | S | Disco `audio/*,video/*` | Revoice single | `revoiceRefs[0]` | — | `revoiceRefAdapter` | Sample incompatible | pending |
| TLS-03 | ToolsParamsPanel | Voz B | audio/video | S | Disco | Solo modo two | `revoiceRefs[1]` | — | `revoiceRefAdapter` | — | pending |
| TLS-04 | PostProcessing | Voice clone A | audio/video | S | Disco (duplica Tools) | Post de un clip existente | `voiceCloneRefs[0]` | — | `revoiceRefAdapter` | Compartir adaptador con TLS-02 | pending |
| TLS-05 | PostProcessing | Voice clone B | audio/video | S | Disco | Modo two | `voiceCloneRefs[1]` | — | `revoiceRefAdapter` | — | pending |
| TLS-06 | Hunyuan3DPanel | Vista front | image | S | Dual: upload **y** picker outputs `fromApp` | Obligatoria; `image/*` | `views.front` path/url/workspace | — | `hunyuanViewAdapter` | Workspace change invalida | partial |
| TLS-07 | Hunyuan3DPanel | Vista left | image | S | Dual | Solo multiview | `views.left` | — | `hunyuanViewAdapter` | Modelo sin multiview: no multi accidental | partial |
| TLS-08 | Hunyuan3DPanel | Vista right | image | S | Dual | Solo multiview | `views.right` | — | `hunyuanViewAdapter` | — | partial |
| TLS-09 | Hunyuan3DPanel | Vista back | image | S | Dual | Solo multiview | `views.back` | — | `hunyuanViewAdapter` | — | partial |
| TLS-10 | Hunyuan3DPanel | GLB a retexturizar | model3d | S | Dual: import `.glb` + grid de GLB del workspace | Operación retexture | `sourceModel` path | — | `hunyuanGlbAdapter` | Quitar fuente | partial |

### 4.6 Audio — PR 6B (y Story en PR 7)

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUD-01 | VoiceRefSection / InputsPanel / DirectorChat | Voice ref (ID-LoRA) | audio | S | Disco `.wav,.mp3,.flac,.ogg,.m4a`; tres superficies, **mismo** `directorVoiceRef` | Gate `voice_reference_enabled`; ~5 s | File en store + path al generar | — | `voiceRefAdapter` | Un valor en Studio y Director | pending |
| AUD-02 | AudioModeSection | Voces TTS | audio | M (N voces) | `FileUploadZone` por voz | wav/mp3/flac/ogg/m4a | `ttsVoices[].filename` | — | `ttsVoiceAdapter` | Voz 1 ≠ voz 2 | pending |
| AUD-03 | AudioModeSection | Audio file (no TTS) | audio/video | S | FileUploadZone | Incluye contenedores vídeo | `audio_guide` | — | `soundtrackAdapter` | Compartir con VID-04 | pending |
| AUD-04 | MixerControls | Pista base | audio | S | FileUploadZone | Duración completa | mixer local state | — | `mixerTrackAdapter` | — | pending |
| AUD-05 | MixerControls | Overlays | audio | M | FileUploadZone por overlay | Volumen/offset | mixer local | — | `mixerTrackAdapter` | Añadir overlay no borra base | pending |
| AUD-06 | SfxControls | Vídeo opcional SFX | video | S | FileUploadZone | Opcional | `video_guide` | — | `sfxVideoAdapter` | Quitar | pending |
| AUD-07 | ManualSongPanel | Cover / referencia de canción | audio | S | Disco `audio/*` si mode=cover | Cover ≠ canción generada | `project.music.coverReferenceName` | `configure_story_song` | `storyCoverAdapter` | — | pending |
| AUD-08 | StoryLabPanel | Import Lyria | audio | S | Disco `audio/*` por cue | Resultado Lyria | cue audio | — | `storyCueAudioAdapter` | — | pending |
| AUD-09 | StoryLabPanel | MP3 custom de cue | audio | S | Disco `.mp3,audio/mpeg` | No marcar como generación | cue | — | `storyCueAudioAdapter` | Provenance upload | pending |
| AUD-10 | OmniReferenceSection | Referencias Omni | mixed | M≤límite modelo | Disco multiple image/video/audio + drop | Orden; audio_intent; cupo | lista Omni | — | `omniRefAdapter` | Orden, tipos mixtos | pending |
| AUD-11 | OmniReferenceSection | Audio ligado a un vídeo ref | audio | S / ítem | Disco `audio/*,.flac,.m4a,.aac` | Soundtrack del vídeo ref | `reference.audio_path` | — | `omniRefAdapter` | Quitar soundtrack | pending |

### 4.7 Personajes — PR 7

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CHR-01 | CharacterCreatorPanel | Imagen sujeto / objeto | image | S | Disco `createElement` `image/*` | Identidad; no cualquier crop de boca | upload + refs[0] | — | `characterRefAdapter` | — | pending |
| CHR-02 | CharacterCreatorPanel | Refs extra (outfit/extra) | image | M | Disco por ref | Roles extra; MAX_REFS | refs[] | — | `characterRefAdapter` | — | pending |
| CHR-03 | CharacterFacePatchPanel | Variante facial | image | S | Disco png/jpeg/webp | Compatibilidad espacial con pose; no foto libre de boca | overlay del kit | — | `facePatchAdapter` | Rechazar imagen no alineable | pending |
| CHR-04 | CharacterSpeechPreparation | Imagen base del habla | image | S | Disco png/jpeg/webp | Importa kit; pose select es OOS | kit.base | — | `speechBaseAdapter` | e2e speech workshop | pending |
| CHR-05 | CharacterKit (panel 2.5D) | Identidad del kit | image | S | Capa seleccionada / Wizard; no picker de catálogo | Una sola identity | kit identity output | `attach_character_kit_references` | `characterKitIdentityAdapter` | Un output exacto | pending |

### 4.8 Story / Series / Cómics — PR 7

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STY-01 | StoryLabPanel | Subir visual (world/character/location) | image | M | Disco `image/*` multiple → `uploadVisual` | No sustituye canon ni aprueba al seleccionar | `project.assets` + `referenceAssetIds` | `approve_story_visuals` (aprueba existentes) | `storyVisualAdapter` | No ejecutar generación | pending |
| STY-02 | StoryAssetsImporter | Smart assets | image | M | Disco + drop | Analiza; propuesta aparte | pending smart assets | — | `storySmartAssetAdapter` | Drop + cancelar | pending |
| STY-03 | SeriesCanonPanel | Identidad de personaje | image | S | Disco `image/*` | Canon; no finalizar outputs | `uploadReference(..., 'character')` | — | `seriesCanonAdapter` | — | pending |
| STY-04 | SeriesCanonPanel | Referencia de localización | image | S | Disco | Canon | location refs | — | `seriesCanonAdapter` | — | pending |
| STY-05 | SeriesCanonPanel | Referencia de prop | image | S | Disco | Canon | prop refs | — | `seriesCanonAdapter` | — | pending |
| STY-06 | SeriesShotsPanel | Composed start | image | S | Disco | Frame compuesto del shot | `composed_start_frame` | — | `seriesShotFrameAdapter` | — | pending |
| STY-07 | SeriesShotsPanel | Composed end | image | S | Disco | Frame compuesto | `composed_end_frame` | — | `seriesShotFrameAdapter` | — | pending |
| STY-08 | ComicEditorPanel | Subir imágenes al cómic | image | M | Disco multiple | Inserta en página/assets | `project.assets` | — | `comicAssetAdapter` | — | pending |
| STY-09 | ComicEditorPanel | Insertar desde HocusPocus / proyecto | image | S | Grid outputs **o** assets del cómic (click confirma ya) | Tabs maestro vs project | inserta elemento | — | `comicAssetAdapter` | Transaccional; no click=confirm | pending |
| STY-10 | ComicEditorPanel planning | Identidad de personaje | image | S | `<select>` de `project.assets` | Solo assets del cómic | `referenceAssetId` | — | `comicIdentityAdapter` | Homónimos por ID | pending |
| STY-11 | ComicWorkflowPanels | Referencia de personaje | image | S | Disco `image/*` | Director cómic | asset + `referenceAssetIds` | — | `comicIdentityAdapter` | — | pending |

`ReferenceGallery` muestra/quita IDs ya ligados; no es un picker de origen. Tras migrar STY-01, Cambiar/Quitar debe respetar su confirmación de borrado.

### 4.9 Director / Wizard — PR 7–8

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DIR-01 | DirectorPanel / DirectorChat | Canción o diálogo | audio (o vídeo→audio) | S | Disco + drop; accept audio+video | Extrae audio; no ejecuta generación al adjuntar | análisis Director | `start_director_production` (después) | `directorAudioAdapter` | Adjuntar ≠ start | pending |
| DIR-02 | DirectorPanel / DirectorChat | Imagen de referencia | image | S | Disco + drop; varias copias UI | Strength slider aparte | `referenceImage` File | — | `directorRefImageAdapter` | Compact y full | pending |
| DIR-03 | DirectorChat | Character refs | image | M | Disco multiple | H3 limita 8/11 | charRefs Files | — | `directorExtraRefsAdapter` | Reorder | pending |
| DIR-04 | DirectorChat | Location refs | image | M | Disco multiple | — | locRefs | — | `directorExtraRefsAdapter` | — | pending |
| DIR-05 | DirectorChat | H3 video refs | video | M≤3 | Disco | 2–15 s; cupo 11 | h3VideoRefs | — | `h3RefAdapter` | Distinto de VID-05 (formulario Studio) | pending |
| DIR-06 | DirectorChat | H3 audio refs | audio | M≤3 | Disco | Igual | h3AudioRefs | — | `h3RefAdapter` | Distinto de VID-06 | pending |
| DIR-07 | Ask to the Wizard | Adjuntar recurso a un campo | según constraints | S/M | **No hay picker**; acciones por **nombre exacto** de output | Homónimos; no navega el disco del cliente | Referencia durable / output name | mismas actions que el campo | `wizardAssetAdapter` | Homónimos, cancelar, respuesta tardía, doble ejecución | pending |

Adjuntar en chat **no** ejecuta generación. Si hace falta archivo local, esperar el diálogo nativo humano (PR 8).

### 4.10 Plantillas — PR 5 (composer) / excepción JSON

Picker actual: `TemplateAssetPicker` (Library `/api/v1/assets`, click confirma de inmediato, ES hardcode, página 12). Sustituir por el modal común; conservar `catalogBindingIssue`. Tests: `ui/tests/templateAssetPicker.test.tsx`, `ui/e2e/specs/scene-template-review.spec.ts`.

| ID | Módulo | Etiqueta / rol | Tipo | Qty | Origen actual | Restricciones | Persistencia | Wizard | Adaptador | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TPL-01 | TemplateComposerDialog | Protagonista `hero` | image | S | Library click-confirm | Slot kinds + binding workspace | `selections[hero].id` | prompt de componentes (no genera) | `templateSlotAdapter` | e2e hero+plate | partial |
| TPL-02 | TemplateComposerDialog | Fondo `plate` | image | S | Library | kinds del slot | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-03 | TemplateComposerDialog | Objeto `prop` | image/model3d | S | Library | kinds; a menudo opcional | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-04 | TemplateComposerDialog | Primer término `foreground` | image | S | Library | opcional | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-05 | TemplateComposerDialog | Sujeto 1 | image/model3d | S | Library | plantillas 3D/espacio | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-06 | TemplateComposerDialog | Sujeto 2 | image/model3d | S | Library | — | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-07 | TemplateComposerDialog | Fondo 3D `background` | image | S | Library | — | asset id | — | `templateSlotAdapter` | — | partial |
| TPL-08 | TemplateComposerDialog | Accesorio `prop_1` | image/model3d | S | Library | — | asset id | — | `templateSlotAdapter` | — | partial |

Un solo `TemplateAssetPicker` sirve al slot activo; las filas son roles, no instancias del componente.

### 4.11 Primitivas (no son campos)

| ID | Pieza | Uso | Migración |
|---|---|---|---|
| PRI-01 | `FileUploadZone` | Mixer, SFX, control, audio mode | Envolver con AssetInput; DnD sigue siendo «Desde mi equipo» |
| PRI-02 | `InputsPanel` AddTile/Tile | Frames, refs, audio, control | Sustituir `pickFile` por AssetInput |
| PRI-03 | `AssetPickTrigger` | 2.5D | Evolucionar a valor actual + Cambiar/Quitar + dos fuentes |
| PRI-04 | `createElement('input')` | ImageUpload, ImageRef, VideoEdit, MultiClip, CharacterCreator, Recipes | Eliminar al migrar el campo dueño |

---

## 5. Fuera de alcance (no son listas de assets)

No sustituir automáticamente. Motivo en cada fila.

| Superficie | Control | Motivo |
|---|---|---|
| SceneAnimatorExplorer | Plantilla narrativa, mood, intensity, direction, camera, palette, voiceSpace | Enums de plantilla |
| SceneAnimatorPanel | Safe area, easing, blend, mask, atmosphere kind, strip direction, relationship, orbit facing, curves | Parámetros de capa |
| SceneAnimatorPanel | Rhythm track, voice track, speaker, dialogue audio, clip esquelético | Pistas/clips **ya cargados** en la escena |
| Scene3DWorkspace | Familia de cámara, plantilla, clip GLB (S3D-05), números X/Y/Z | Enum / transform / clips cargados |
| Studio | ModelSelector, resolución, calidad, duration, H3 policy/turbo, LoRA weights | Modelo/proveedor/enum |
| Series | format, provider, resolution, strategy, characterId, locationId, episode, approval | Dominio Series, no media |
| Story | genre, provider, music model, candidateCount, spoken language | Config |
| Cómics | format, font, bubble, filter, layout, camera move, renderer | Estilo/enum |
| Character speech | select de personaje y de pose | Kits/poses ya en biblioteca |
| CharacterKit | style, mouth pack, alpha status | Enums del kit |
| AssetsPanel | filtro kind / workspace | Explorador Media, no campo de formulario |
| StyleSheet / Architecture | collection, sort, layer | Navegación |
| AlternativeSongs | (el `<select>` de audio **sí** es VID-12; no esta fila) | — |
| ComicEditor `comicOutputs` | Abrir cómic guardado `.comic.json` | Documento de proyecto (sección 6) |
| MiniMaxH3TurboToggle | preset LoRA | Peso, no media |

---

## 6. Excepciones (no ofrecer HocusPocus vacío)

| ID | Superficie | Accept | Motivo | Destino |
|---|---|---|---|---|
| EX-01 | SceneAnimator `sceneInputRef` / Library «from JSON» | `.json` | Documento de escena, no media | Conservar import de dominio; P2D-12 cubre escenas del catálogo |
| EX-02 | SceneAnimator `motionInputRef` | `.json` | Motion JSON, no asset | Queda como herramienta JSON |
| EX-03 | TemplateReferencePanel | `.json` | Original verificado de plantilla | No es un output reutilizable |
| EX-04 | StoryLabLibraryChrome | `.storypack,.zip,.json` | Pack de proyecto | Import de Story, no picker |
| EX-05 | ComicEditor import | `.json,.comic.json` | Proyecto cómic | Conservar |
| EX-06 | RecipesOverlay import | `.json` | Receta de generación (incluye LoRAs) | Conservar |
| EX-07 | LoRA / checkpoint (CivitAI, Settings) | safetensors / descarga | Pesos de modelo; el catálogo de assets no los lista como media | No «Desde HocusPocus» de outputs |
| EX-08 | ImageUpload.tsx, ContinueVideoSection.tsx | image/video | Código huérfano, no montado | No migrar; retirar o reexportar al tocar InputsPanel |

---

## 7. Propietarios y PRs

Un agente es dueño del **núcleo** del picker (PR 1–4). Los demás solo adaptadores y consumidores. No abrir la cadena de migraciones hasta mezclar el contrato.

| PR | Alcance | Owner previsto | Hotspots / no tocar a la vez |
|---|---|---|---|
| 0 (este) | Inventario + contrato | Docs | — |
| 1 | Tipos, catálogo, identidad | Núcleo picker | `api/assets.ts`, router catálogo si hace falta |
| 2 | Modal, tarjetas, transacción | Núcleo picker | `AssetExplorerDialog`, `ModalShell` |
| 3 | Preview RAM-safe | Núcleo picker (archivos de preview) | No mezclar con PR 4 |
| 4 | AssetInput dual origin + upload | Núcleo picker | `FileUploadZone` / campo común |
| 5 | 2.5D + audio de escena + templates + Scene3D | Compositor 2.5D/3D | `SceneAnimatorPanel` (serializar vs i18n); **Scene3DWorkspace solo tras #204** |
| 6A | Tools, imagen, Hunyuan, edit | Tools/imagen | No núcleo modal |
| 6B | Audio, vídeo, Video Editor, mixer | Audio/vídeo | Paralelo a 6A si no comparten archivo |
| 7 | Story, Series, personajes, cómics, Director | Labs | Dividir 7A/7B si el diff crece |
| 8 | Paridad Wizard + cierre inventario | Wizard + núcleo | `agentActions.ts` exclusivo |

Asignación de IDs → PR de migración: P2D/TPL/S3D → 5; IMG/TLS → 6A; VID/AUD (Studio) → 6B; CHR/STY/DIR → 7–8.

---

## 8. Coordinación Scene3DWorkspace / #204

[#204](https://github.com/IAnMove/hocuspocus/pull/204) abierto (2026-09-07), rama `feat/video3d-music-templates`, base `development`.

Archivos del PR: `Scene3DWorkspace.tsx`, `Scene3DStage.tsx`, `camera.ts`, `document.ts`, `dressing.ts`, `gpu.ts`, `templates.ts`, `types.ts`, `ui/src/i18n/locales/{en,es}/scene3d.json`, `ui/tests/scene3dStage.test.mjs`.

Reglas:

1. Este inventario describe HEAD `fae7d3f6` (sin las plantillas musicales de #204).
2. No editar `Scene3DWorkspace.tsx` en PRs 0–4 ni en PR 5 mientras #204 esté abierto.
3. Tras mezclar #204, reconsultar slots: puede aparecer plantilla musical / cámara `musical` / `run-loop` extra. Añadir filas S3D-0n; no asumir que S3D-01…04 bastan.
4. S3D-05 (clips ya cargados) sigue OOS.
5. Otro agente trabaja i18n de Video3D/agent en worktree distinto: no editar `SceneAnimatorPanel.tsx`, catálogos `scene3d.json` ni JSON de locale en este paquete.

---

## 9. Preguntas abiertas

1. **Identidad legado:** muchos campos persisten `output.name` o path de upload, no `asset.id`. PR 1 debe definir la referencia versionada sin fabricar IDs.
2. **Blob en Scene3D:** `URL.createObjectURL` en S3D-01…04 no sobrevive recarga. ¿Importación provisional al confirmar, o binding a catálogo obligatorio?
3. **Superficies duplicadas:** AUD-01, IMG-04, VID-02 existen en 2–3 paneles con el mismo store. ¿Un AssetInput compartido o tres wrappers del mismo adaptador?
4. **H3 Studio vs Director:** VID-05/06 y DIR-05/06 son cupos distintos. No unificar el valor por error.
5. **P2D-12 vs P2D-07:** abrir escena vs usar el MP4 como capa. El modal debe titular el propósito; el Wizard ya tiene `open_3d_scene` vs `add_3d_scene_layer`.
6. **TemplateAssetPicker vs AssetExplorer:** el primero ya usa `asset.id`; el segundo `ApiOutput.name`. PR 1 unifica.
7. **Máscaras Inpaint/Outpaint:** el canvas de máscara no es un campo de catálogo. ¿Excepción permanente o picker solo para la fuente (IMG-05/06)?
8. **CHR-03 / CHR-04:** el catálogo de imágenes genéricas es peligroso (boca/pose). «Desde HocusPocus» solo con filtro de compatibilidad espacial; si no se puede filtrar, no ofrecer el origen vacío.
9. **DIR-07:** el Wizard no debe simular el file picker del SO. Confirmar copy de «espera interacción humana».
10. **ImageUpload / ContinueVideoSection:** ¿borrar en 6A/6B o dejar hasta ratchet de imports muertos?

---

## 10. Cursor / QA de este PR

Cursor review: **not run (quota)**. No hay revisión de Cursor completada. CI de docs según proceso vigente; este PR no ejecuta la suite UI ni GPU.

---

## 11. Evidencia de inventario (`rg` vs tabla)

Ejecutado sobre `ui/src` en `fae7d3f6`. Cada hit de media debe mapear a una fila, a OOS o a excepción.

| Búsqueda | Hallazgo |
|---|---|
| `AssetExplorerDialog` / `AssetPickTrigger` | SceneAnimatorExplorer, SceneRecipePanel, Scene3DWorkspace, tests |
| `SceneLibraryDialog` | SceneAnimatorPanel |
| `TemplateAssetPicker` | TemplateComposerDialog |
| `FileUploadZone` | AudioModeSection, MixerControls, SfxControls, ControlVideoSection |
| `type="file"` | Recast, Restyle, Outpaint, Blend, Tools, Hunyuan, Director*, MultiClip, Continue, Retake, Inpaint, EditAnything, VoiceRef, Omni, PostProcessing, ToolsParams, Panorama, SceneAnimator, SceneRecipe, Series*, Comics*, Story*, Character*, VideoEditor, Scene3D, TemplateReference |
| `createElement('input')` + `input.type = 'file'` | FileUploadZone, InputsPanel, ImageUpload, ImageRefSection, VideoEditControls, MultiClipEditor, CharacterCreator, RecipesOverlay |
| `onDrop` / `dataTransfer.files` | FileUploadZone, InputsPanel, ImageUpload, ImageRef, Omni, Director*, edit/video panels, StoryAssetsImporter, VideoEditor |
| `<select>` de outputs | AlternativeSongsDialog (VID-12), ComicEditor identity (STY-10), ComicEditor open saved (EX), Hunyuan image grid (botones, no select) |
| Wizard attach | `attach_studio_references`, `attach_character_kit_references`, `attach_3d_scene_audio`, `add_3d_scene_layer`, `open_3d_scene`, `attach_videoclip_alternative_song`, `approve_story_visuals` |

Conteos de filas en este documento:

| Clase | IDs | Recuento |
|---|---|---|
| Campos in-scope a migrar | P2D-01…13 (13) + S3D-01…04 (4) + IMG-01…16 (16) + VID-01…12 (12) + TLS-01…10 (10) + AUD-01…11 (11) + CHR-01…05 (5) + STY-01…11 (11) + DIR-01…07 (7) + TPL-01…08 (8) | **97** |
| OOS explícitos en tabla de campos | S3D-05 | 1 |
| Primitivas | PRI-01…04 | 4 |
| Excepciones | EX-01…08 | 8 |

Los 97 campos in-scope son la cola de PRs 5–8. Un campo `partial` cuenta como no cerrado.

### Criterio de cierre global (PR 8)

Repetir este inventario: cero filas `pending`/`partial` sin explicación. Impedir pickers ad hoc nuevos con una comprobación de arquitectura enfocada (no un ban global a `<select>` / `type=file`).
