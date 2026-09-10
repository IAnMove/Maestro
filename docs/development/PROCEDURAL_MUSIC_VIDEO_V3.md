# Videoclips procedurales v3 — plan de ejecución

Estado inicial: diseñado, 2026-09-06. Base `origin/development` (`9f82d032`).
Los PR #180 y #181 están mezclados; sus vídeos v2 existen y han sido vistos por
el usuario. No equivalen a aprobación final: se pidieron mejores transiciones,
variación de poses/expresiones y un piloto de sincronización labial.

## Condiciones de ejecución

- Worktree independiente. No cambiar los servicios compartidos 42003/42004,
  sus workspaces activos ni los tests de vídeo pesado de otros agentes.
- Imágenes nuevas: HocusPocus + Ask to the Wizard + MiniMax Image-01, con
  permiso explícito del usuario. Render: compositor procedural, sin modelos de
  vídeo, sin descargas de pesos. CI: sin modelos y sin credenciales.
- Cada bloque: pruebas locales, commit acotado, PR a `development`, revisión
  independiente y CI requerido, corregir hallazgos, merge normal. Cursor está
  temporalmente dispensado por el usuario; no modificar protecciones.
- No subir canciones, imágenes, vídeos, pesos ni credenciales a Git.
- Las casillas indican implementación con sus pruebas locales, no todos los
  estados posteriores. Registrar commit/PR/CI/revisión/merge/validación real
  por separado al cerrar cada bloque.

## A — Pack de movimientos musicales y contrato de componentes

Objetivo: movimientos exagerados y reconocibles, editables como escenas reales,
no 24 variantes del mismo zoom. Independiente del backend y de nuevos modelos.

- [x] A1. Añadir 24 coreografías distintas con IDs y nombres estables, conservando
  las 24 referencias originales y sus hashes sin cambios.
- [x] A2. Nuevos componentes `subject_1`, `subject_2`, `background`, `prop_1`:
  tipo, obligatoriedad, papel, pose/encuadre/transparencia esperados; no confundir
  un segundo personaje con un accesorio. Mantener bindings antiguos.
- [x] A3. Selector Library y catálogo muestran nombres, claves y descripciones;
  asignación explícita por asset canónico. Nunca rellenar un hueco obligatorio
  repitiendo el protagonista o llamando a un generador oculto.
- [x] A4. Compilar a capas/keyframes deterministas, guardables y reabribles.
  Respetar presupuestos, poses de entrada y fuentes; sin flashes automáticos.
- [x] A5. Tests preparados para CI y ejecutados localmente: contratos, componentes ausentes/incorrectos, identidades aisladas,
  trayectorias distintas, bounds, round-trip y compatibilidad con originales.
- [x] A6. Galería de pruebas renderizadas, con aprobación pendiente. La ausencia
  de un MP4 es visible; no fingir que existe una referencia aprobada.

PR A: catálogo, compiladores puros, UI de componentes y tests. Root integra;
Luna puede redactar catálogo y pruebas aisladas. No tocar `SceneAnimatorPanel`
si bastan los contratos de capas existentes.

## B — Montaje y transiciones editables conservando la canción

Depende del contrato de duración existente, no del número de templates.

- [ ] B1. Planificar en frames enteros; distinguir duración narrativa de duración
  del clip renderizado y handles de entrada/salida.
- [ ] B2. Fundido corto por defecto SOLO en secuencias nuevas procedurales;
  preservar el `none` explícito y proyectos existentes.
- [ ] B3. Solapamientos centrados en cortes planificados, sin perder final del
  audio: suma de frames de clips menos solapamientos = duración del montaje.
- [ ] B4. Transición/duración editables y persistentes; explicar cuándo hace
  falta rerenderizar handles. No recortar ni desplazar la canción en silencio.
- [ ] B5. Tests con FFmpeg CPU de clips sintéticos: duración, audio completo,
  primer/último frame, sin negro accidental, recovery y reexportación.

PR B separado: planner puro + integración VideoEditor. No ampliar los tipos
de transición más allá de lo realmente soportado por preview y export.

### Revisión técnica previa a B (todavía no implementada)

Para un corte de `g` frames: el clip saliente añade `floor(g/2)` al final y el
entrante `ceil(g/2)` al principio. Así `suma(renderFrames) - suma(gaps)` conserva
exactamente la duración narrativa. Definir el default como duración temporal:
8 frames a 30 fps, 16 a 60 fps; `none` explícito continúa siendo corte directo.

El backend actual clampa los fundidos a 0,05 s–45% de cada clip y los normaliza
con tiempos flotantes: hay que validar sus duraciones reales con ffprobe. No
usar tarjetas `later-*` en este planner, ya que insertan tiempo adicional.
Una transición explícita imposible debe dar error, no recortarse en silencio.

No implementar handles simplemente alargando `scene.duration`: cámara,
animación, vídeo/GLB, strips y partículas usan relojes distintos. Evaluar como
primer camino un padding CPU de primer/último frame de clips ya renderizados
(silencio en handles y una única pista musical intacta); requiere contrato,
preview y metadata de padding antes de declararlo integrado. Alternativamente,
un reloj común del renderer necesita tests de equivalencia para cada familia.
Nunca estirar o recortar la canción para disimular pérdidas de duración.

## C — Audio adjunto al Wizard, identidad y reutilización exacta

- [ ] C0. Importación preservando bytes originales. El upload-audio actual
  convierte MP3 a WAV y descarta su copia temporal MP3; no sirve para prometer
  conservación de tags, portada o letras. Mantener el original canónico y, si
  hace falta normalización, crear un derivado con lineage y hash observado.
- [ ] C1. Aceptar adjuntos de audio por el chat mediante el contrato público
  de importación preservadora de C0.
  Una portada MP3 `attached_pic` no convierte una canción en vídeo.
- [ ] C2. Mostrar nombre, duración, workspace e identidad del asset recibido.
  Persistir referencias, no blobs temporales ni audio embebido en prompts.
- [ ] C3. Resolver por identidad antes de usarlo; no regenerar, mover, adoptar
  destructivamente ni sustituir un archivo dado por el usuario.
- [ ] C4. Pasar referencia estructurada al workflow y visibilizar el formulario;
  rechazo explícito si la herramienta no admite audio. No afirmar que se ha
  escuchado/transcrito sin haberlo hecho.
- [ ] C5. Tests de subida, portada, error/reintento, cambio de workspace, reload,
  cancelación y ausencia de generación musical cuando ya existe audio.

PR C independiente de A/B, con ownership separado de componentes de chat.

## D — Storyboard musical, variantes consistentes y lip-sync piloto

Depende de A/B/C para el flujo completo, no para diseñar contratos puros.

- [ ] D0. Reparar el puente Scene → Recipe → Scene: actualmente conserva capas
  pero pierde `narrative.assets`/`catalogAtAssignment`. La escena y su sidecar
  completos siguen siendo la fuente de recuperación del bloque A. No ejecutar
  el nuevo pack a través de una receta que prometa conservar esa identidad
  hasta tener tests de round-trip de componentes y provenance. La gramática
  de recipes no debe mapear silenciosamente las nuevas claves a las antiguas.
- [ ] D1. Identidad visual original durable; variantes de pose/expresión con
  referencia al original, prompt, modelo/proveedor y estado de revisión.
- [ ] D2. Storyboard por secciones/emoción de letra, con planos variados y
  componentes explícitos; no una imagen única para toda la canción.
- [ ] D3. Separar autoría con permiso de imágenes de render `provided_only`.
  Mostrar presupuesto, assets existentes/nuevos y selección antes de ejecutar.
- [ ] D4. Piloto facial corto: cuerpo sin boca pintada + bocas transparentes con
  ancla revisada. No duplicar ojos/labios; una nueva derivación queda pendiente
  de revisión. No activar Whisper CUDA, TTS ni modelos de talking-head.
- [ ] D5. Registrar precisión real: texto/tiempos manuales o aproximación de
  energía NO son alineación fonética. Silencios con boca cerrada. Preview y
  MP4 usan la misma composición; aislamiento entre personajes.
- [ ] D6. Wizard/Generar videoclip: mismos contratos de assets, storyboard y
  secuencia recuperable, no automatización que solo funciona en esta sesión.

Dividir D en PR de variantes, PR de seguridad facial y PR de workflow.
Serializar cambios en los grandes paneles; no usar varios agentes sobre ellos.

## E — Validación real: «I Came to Bury It» / Omarchy

- [x] E1. Verificar archivo del usuario y metadatos sin alterarlo: duración
  206.120167 s; audio MP3 estéreo con portada y letras inglesas incorporadas.
  No regenerar la canción ni traducir sus letras. Hash y ruta local solo en
  evidencia de sesión, no dependencia de una ruta de esta máquina.
- [x] E2. Consultar fuentes oficiales para el brief: Omarchy es una distribución
  Linux curada basada en Arch, con Hyprland y Quickshell, orientada al teclado,
  herramientas de desarrollo y personalización. Fuentes consultadas el
  2026-09-06: [web oficial](https://omarchy.org/),
  [manual](https://omarchy.org/manual/),
  [repositorio](https://github.com/omacom/omarchy).
- [ ] E3. Arco: veterano escéptico prepara una crítica, prueba el sistema,
  descubre su fluidez, personaliza y acaba riéndose de su propio prejuicio.
  Las exageraciones de la canción son opiniones del personaje, no hechos
  verificados sobre seguridad, financiación o velocidad de instalación.
- [ ] E4. Wizard dirige imágenes MiniMax consistentes en distintos momentos:
  escritorio antiguo, prueba inicial, sorpresa, concentración, madrugada de
  personalización y entusiasmo final; variar gesto/pose y tamaño de plano.
- [ ] E5. Render de 20–30 s con transiciones, movimientos y piloto facial;
  revisar antes de gastar en el montaje completo de 3 min 26 s.
- [ ] E6. Montaje íntegro, audio cotejado, sin saltos/negros involuntarios y sin
  vídeo IA. Guardar escenas editables, lineage y outputs finales en Library.
- [ ] E7. Publicar en la galería local existente sin borrar sus referencias;
  ofrecer al usuario revisión artística, no declarar aprobación por CI verde.

## Registro de avance

| Bloque | Implementado local | Commit | PR | CI | Revisión | Merge | Real / artístico |
|---|---|---|---|---|---|---|---|
| A | Catálogo, compiladores, UI; 891 tests + 17 E2E; galería ampliada | `80513765` + correcciones de revisión en PR | #184 abierto | Reejecución pendiente; E2E de 24→48 corregido localmente | Unicidad slots, versión contrato, migración y ausencia de referencia corregidos; D0 identificado | — | 24 ensayos MP4 reales; galería 43 tarjetas/3 canciones anteriores; revisión artística pendiente |
| B | Pendiente | — | — | — | — | — | Pendiente |
| C | Pendiente | — | — | — | — | — | Pendiente |
| D | Pendiente | — | — | — | — | — | Pendiente |
| E | Metadatos y fuentes | — | — | N/A | — | — | Vídeo pendiente |
