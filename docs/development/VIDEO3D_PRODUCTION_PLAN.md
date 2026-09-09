# Video 3D: producción programática y animación dialogada

Plan de ejecución autorizado el 2026-09-06. Base inspeccionada:
`origin/development`, `8ec9946fc1bb527e9a31932eb32aef723a2278ea`.

## Reanudar sin depender de la conversación

1. Leer este documento, [BRANCHING.md](BRANCHING.md),
   [AGENT_QA_POLICY.md](AGENT_QA_POLICY.md), [CODE_HEALTH.md](CODE_HEALTH.md),
   [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md) y las instrucciones AGENTS locales.
2. Consultar GitHub: base actual, PRs, archivos compartidos y revisiones del HEAD.
   Los estados de esta página son checkpoints, no sustituyen la comprobación remota.
3. Trabajar en un worktree temporal propio desde `origin/development`. No cambiar
   la rama del checkout compartido, tocar sus outputs ni detener sus procesos.
4. **Restricción vigente del usuario:** hay pruebas pesadas de generación en curso.
   No lanzar inferencia de vídeo, imagen, audio, TTS, alineadores con modelos ni
   descargas de pesos. No invocar el backend de producción durante los tests.
   Usar contratos, adaptadores falsos y, cuando sea necesario, render programático
   pequeño de Video 3D. Preferir CPU/software y concurrencia limitada. No cargar
   modelos en GPU. La validación real queda pendiente hasta levantar esta restricción.
5. Ciclo autorizado: implementar un paquete → pruebas locales → commit → PR a
   `development` → pedir Cursor → esperar revisión del HEAD y CI → corregir →
   mezclar sólo con evidencia satisfactoria → actualizar base → siguiente paquete.
   No activar auto-merge, modificar protecciones ni publicar en `main`.
6. Si falta CI/revisión, conservar el PR y registrar qué falta. No interpretar
   silencio, un check omitido o una revisión antigua como aprobación. No abrir un
   PR dependiente de otro sin mezclar ni acumular ramas sobre el mismo hotspot.
7. Actualizar las casillas de acciones verificadas. Un PR abierto NO completa una
   fase. Mantener separados diseñado, implementado, commit, PR, CI, Cursor, merge y
   validación audiovisual real. Datos remotos mutables van en el PR, sin commits
   documentales que invaliden continuamente la revisión.

## Objetivo y alcance

Dos productos sobre una base pequeña compartida:

- Videoclip musical programático: planos editables, motivos visuales, cámaras y
  montaje rítmico, con canción maestra continua y cero generación de vídeo.
- Animación dialogada: personajes originales de recortes 2D/2,5D, voz por
  intervención, bocas, miradas, gestos y continuidad. No exige personajes 3D.

No se busca entrenar modelos, hacer autorig universal, baile corporal general,
sincronización cantada universal, física avanzada ni reescribir todo en otro motor.
TRELLIS/Pixal/otros GLB pueden aportar assets, no garantizan rigs ni visemas.
No subir pesos, medios generados, datos de usuarios ni outputs al repositorio.

## Verdad de partida (código inspeccionado, no piloto validado)

- `SceneAnimatorPanel.tsx` ya exporta por fotogramas con WebCodecs. MediaRecorder
  es una alternativa compatible, no el único exportador actual.
- `SceneRecipePanel.tsx` monta un plano y permite elegir otros; esto no demuestra
  render/ensamblado automático de una producción completa.
- `sceneTimeline.ts` y `sceneClip.ts` aportan evaluación temporal reutilizable.
- Character Kits tienen poses, anclajes y cuatro estados de boca. `cutoutDialogue`
  deriva estados de letras; tiempos de palabras no equivalen a fonemas alineados.
- La exportación vive en la UI y mantiene el MP4 en memoria. Debe medirse antes
  de prometer vídeos largos. Snapshot renderizado y metadata publicada deben ser
  la misma revisión, incluso cuando el usuario edita durante el render.
- Los GLB se componen desde visores por capa. No se debe anunciar un mundo 3D
  compartido con sombras y oclusiones entre objetos sin implementarlo y probarlo.
- El resolver puede generar vídeo. El modo programático necesita una prohibición
  ejecutable en todos sus caminos, no sólo una instrucción al LLM.
- Los checkpoints rítmicos limitados a 200 beats no deben ser el análisis completo.

Los documentos históricos de Video 3D pueden describir fallos ya corregidos.
Reproducir antes de reabrirlos. El quality score no certifica calidad audiovisual.

## Contrato arquitectónico

Intención → plan validado → revisión inmutable → planos/audio/animación → trabajos
recuperables por plano → validación/ensamblado → asset final con lineage.

- Reutilizar Runs, generaciones y assets existentes; no crear un segundo almacén
  de trabajos. IDs estables, revisión, workspace, intentos y CAS cuando corresponda.
- UI y Wizard usan los mismos servicios. Producción no depende de un panel abierto.
- Plan LLM como datos cerrados y validados, nunca código arbitrario ejecutable.
- Fijar assets/versiones, motor, FPS, duración y semillas por render. Determinismo
  dentro de un entorno fijado; no prometer bytes idénticos entre distintas GPUs.
- Separar idioma UI/conversación/prompt técnico/voz y texto literal protegido.
  Transcribir sirve para comparar/alinear, no para reescribir las palabras originales.
- Staging por intento, validación antes de publicar y publicación atómica. Un
  resultado tardío no puede sobrescribir otro intento o revisión.
- Rehacer sólo dependencias afectadas: una frase modifica su audio, boca, planos
  consumidores y mezcla; no regenera el personaje ni el resto de intervenciones.

## Pilotos y gates

### Musical

- [ ] 30–45 s, 6–8 planos, tres familias visuales y pista musical continua.
- [ ] Cero llamadas a generadores de vídeo, también en fallbacks/resolución de assets.
- [ ] Variación de montaje sin cortar en cada beat; decisiones manuales bloqueables.
- [ ] Editar un plano y reutilizar los demás resultados compatibles.
- [ ] Después: canción de 2–4 min, 1080p30, memoria/tiempo medidos y recuperación.

### Dialogado

- [ ] 20–30 s, dos personajes originales, seis intervenciones, tres encuadres.
- [ ] Pruebas españolas e inglesas; bocas, miradas, parpadeos y reacción de escucha.
- [ ] Cambiar una frase sin regenerar las otras ni las identidades visuales.
- [ ] Después: escena de 60–120 s con continuidad y actuación evaluadas localmente.

Los contratos no completan estos pilotos. Los tests con texto sin voz prueban
compilación/animación, no inteligibilidad, interpretación ni precisión fonética.

## Paquetes de PR (en orden de dependencias)

### PR 01 — Baseline reproducible y plan persistente (riesgo bajo)

Archivos: este plan, guía de baseline, fixtures declarativos y tests de Video 3D.
No tocar producción, workflows, launchers, store ni runtime.

- [x] Guardar alcance, restricciones, dependencias y protocolo de reanudación.
- [x] Añadir receta de tres planos y dos Character Kits mínimos sin medios externos.
- [x] Probar orden, duración, movimientos y round-trip de escenas.
- [x] Probar aislamiento de bocas/texto español e inglés y rechazo de fuentes ausentes.
- [x] Reproducir baseline con suite focalizada y checks locales sin modelos.
- [x] Registrar mediciones disponibles; render/memoria no medidos siguen pendientes.
- [x] Commit, PR, CI/revisión actual y merge comprobados por separado (#164).

Aceptación: otra máquina con dependencias de desarrollo reproduce los contratos
sin modelos, archivos personales ni backend en ejecución. No afirmar película hecha.

### PR 02 — Contratos y política programática (riesgo medio; depende de 01)

Archivos: tipos/validadores de producción, `sceneRecipeAssets`, contratos de receta.
Dividir en 02a/02b si identidad/migración y política no caben en un PR cohesivo.

División aplicada: **02a** limita los trabajos del resolver de recetas y conserva
la política en UI/JSON; **02b** aborda identidad/revisión y migración. No se da
por completado 02 al terminar 02a. El valor se llama `no_video_generation`, no
`procedural_only`: permite clips ya existentes, pero no generarlos. El piloto
totalmente programático tendrá además fixtures sin capas de vídeo. Contrato y
consumidores todavía pendientes: [VIDEO3D_GENERATION_POLICY.md](VIDEO3D_GENERATION_POLICY.md).

- [x] 02a: preflight completo antes de trabajos, opciones legacy y snapshot de entrada.
- [x] 02a: persistencia en receta/escena y validación de políticas desconocidas.
- [x] 02a: checkbox, errores EN/ES y tests de integración del formulario revisados.
- [ ] 02a: checks locales, commit, PR, CI, Cursor y merge verificables.
- [ ] 02b: contrato de identidad/revisión y compatibilidad con escenas existentes.

- [ ] Inventariar contratos actuales y reutilizar identidades de dominio existentes.
- [ ] Definir ID/revisión, referencias durables y tiempo/fotogramas sin ambigüedad.
- [ ] Bloquear generación de vídeo en resolución, fallback y ejecución programática.
- [ ] Preservar el modo legacy; rechazar valores de política desconocidos.
- [ ] Migrar escenas antiguas sin seleccionar silenciosamente nombres duplicados.
- [ ] Tests negativos de contratos y cero llamadas de vídeo en todos los caminos.

Aceptación: modo programático exigible, compatible y fail-closed. No anunciarlo
globalmente si sólo está integrado en un resolver; enumerar consumidores pendientes.

### PR 03 — Snapshot único para render y metadata (riesgo medio; depende de 02)

Archivos: exportación/publicación de escenas y tests.

- [ ] Capturar una revisión antes del primer await y reutilizarla para publicar.
- [ ] Vincular resultado a revisión y trabajo/intento existentes.
- [ ] Probar edición concurrente y publicación sin contaminación del estado actual.

Aceptación: metadata y vídeo representan la misma revisión; siguiente edición separada.

### PR 04 — Núcleo de evaluación/render separado (riesgo alto; depende de 03)

Archivos: `SceneAnimatorPanel`, `sceneTimeline`, `sceneClip`, adaptador dedicado.

- [ ] Extraer evaluación/captura conservando comportamiento, sin otro motor visual.
- [ ] Compartir evaluación entre preview/exportación y timestamps por frame index.
- [ ] Probar primer/último frame, alpha, readiness, duración y errores de medios.
- [ ] Medir memoria y coste; no alterar defaults para ocultar degradaciones.

Aceptación: fixtures conservan su movimiento y salida. Propietario exclusivo del panel.

### PR 05 — Render fuera de la pestaña y recuperación (riesgo alto; depende de 04)

Archivos: servicios de trabajos, adaptador de render; wiring mínimo y coordinado.

- [ ] Spike acotado de navegador local gestionado por backend con renderer compartido.
- [ ] Elegir y documentar entorno compatible a partir de medidas, no suposiciones.
- [ ] Cancelación, timeout, lease/intentos, recuperación y límites de memoria.
- [ ] Staging por intento, validación y publicación atómica; rechazo de resultados viejos.
- [ ] Tests con worker falso de cierre de UI, fallo y reinicio; sin GPU.

Aceptación: no perder producción por cerrar la UI; reintentar sin duplicar finales.

### PR 06 — Ensamblado multiplano (riesgo medio-alto; depende de 05)

Archivos: compilador de recetas, servicio de producción, `scene_recording.py`.

- [ ] Renderizar y cachear planos por revisión/dependencias, con perfil común.
- [ ] Ensamblar ordenadamente y mezclar audio maestro una vez, sin costuras musicales.
- [ ] Situar SFX/diálogos en tiempo absoluto; validar duración y frames decodificados.
- [ ] Fallar el segundo de tres planos y recuperar sin repetir el primero.

Aceptación: producción de tres planos completa y recuperable sin modelos.

### PR 07 — Mapa musical completo (riesgo medio; depende de 02)

Archivos: análisis de audio y `sceneRhythm`; independiente del panel durante desarrollo.

- [ ] Persistir análisis completo separado del resumen de checkpoint.
- [ ] Beats, compases, secciones y procedencia/confianza; corrección manual.
- [ ] Cubrir tempo variable, final de canción larga y ausencia de pulso fiable.

Aceptación: no truncar el final ni inventar certeza. Fixtures sintéticos en CI.

### PR 08 — Dirección musical (riesgo medio; depende de 06 y 07)

Archivos: planificador, recetas, workflow rítmico y plantillas.

- [ ] 6–10 plantillas terminadas con roles de presentación/progresión/contraste/cierre.
- [ ] Presupuesto de repetición, cortes y movimientos; motivos reutilizables.
- [ ] Decisiones manuales bloqueables y regeneración selectiva.
- [ ] Ejecutar y evaluar el piloto musical sin generadores de vídeo.

Aceptación: pieza completa, variada y editable; no sólo un visualizador de beats.

### PR 09 — Voz por intervención/personaje (riesgo medio; depende de 02)

Archivos: `sceneSpeech`, contratos de audio y recetas.

- [ ] Identidad de intervención/voz, idioma hablado, modelo/proveedor/configuración.
- [ ] Texto literal separado de instrucciones interpretativas; duración real del audio.
- [ ] Validar salida audio y recuperar trabajos; invalidación selectiva.
- [ ] Tests de contrato con TTS falso. TTS real pendiente bajo restricción vigente.

Aceptación: cambiar una frase no regenera otras voces ni personajes.

### PR 10 — Alineación y pistas de boca (riesgo medio-alto; depende de 09)

Archivos: `cutoutDialogue`, adaptador de alineación, tests y benchmark declarativo.

- [ ] Priorizar timings reales del proveedor cuando existan, sin asumir capacidades.
- [ ] Comparar heurística actual/Rhubarb/alineación forzada con corpus ES/EN acotado.
- [ ] Diferenciar energía, letras, palabras, fonemas y visemas en metadata/feedback.
- [ ] Mantener cuatro bocas inicialmente; pistas generadas y overrides separados.
- [ ] Evitar cierres artificiales por palabra y respetar silencio/continuidad.
- [ ] Benchmark real sólo al levantar restricción de modelos; no falsear precisión.

Aceptación: método elegido con evidencia y fallback honesto; correcciones conservadas.

### PR 11 — Actuación limitada y corrección (riesgo medio; depende de 04 y 10)

Archivos: Character Kits, pistas de interpretación y editor.

- [ ] Miradas, parpadeos, poses, gestos y reacciones del oyente reutilizables.
- [ ] Continuidad de encuadre y anclajes; no duplicar ojos/bocas bajo overlays.
- [ ] Editar y bloquear boca/gestos/tiempo visiblemente, con EN/ES en copy tocado.
- [ ] Ejecutar y evaluar piloto dialogado; mantener voces reales pendientes si procede.

Aceptación: escena inteligible y corregible sin regenerar identidades por intervención.

### PR 12 — Wizard y seguimiento (riesgo medio-alto; depende de 08 y 11)

Archivos: workflows específicos, servicios compartidos y UI de producción.

- [ ] Workflows separados para videoclip y diálogo, sin duplicar servicios/jobs.
- [ ] Plan, recursos, capacidades, restricciones y coste visibles antes de ejecutar.
- [ ] Progreso por plano/intervención, fallos, recuperación y resultados parciales.
- [ ] Navegación/formularios visibles; ejecutar sin dependencia del panel montado.

Aceptación: iniciar, inspeccionar y corregir ambos productos desde Wizard/UI.

### PR 13 — Endurecimiento y candidato de release (riesgo alto; depende de 12)

Archivos: QA, smoke local, documentación y fixes acotados encontrados.

- [ ] Piezas completas, recursos medidos, cancelación y reinicio.
- [ ] Instalación/capacidades en plataformas declaradas, sin promesas no probadas.
- [ ] Informe automático, contact sheet y breve revisión humana funcional/creativa.
- [ ] Registrar limitaciones y evidencia ligada al SHA exacto.
- [ ] Sólo preparar candidato; promoción development → main requiere autorización.

Aceptación: evidencia de ambos pilotos y piezas largas; CI verde no reemplaza esto.

## Dependencias y concurrencia

`01 → 02 → 03 → 04 → 05 → 06`; `02 → 07`; `{06,07} → 08`;
`02 → 09 → 10`; `{04,10} → 11`; `{08,11} → 12 → 13`.

Cada flecha exige merge. Independientes: música (07), voz (09), fixtures/QA y
plantillas sin archivos compartidos. Secuenciales: `SceneAnimatorPanel.tsx`,
contratos centrales, registro de trabajos y `_launch_runtime.py`. Comprobar PRs
ajenos antes de adquirir un hotspot. No ampliar la wave musical existente por accidente.

## QA y evidencias

CI barato: contratos/migraciones, rangos/IDs, aislamiento de personajes, idiomas y
texto literal; conteo/timestamps; cero llamadas prohibidas; cancelación/reintentos
con worker falso; render sintético pequeño y decodificación; ratchet contra base
exacta. Introducir mutation testing selectivo para las invariantes críticas cuando
estén implementadas. No cambiar presupuestos/checks para hacer pasar una feature.

Local real: TTS/alineación ES/EN, sincronización inicio/final, alpha/cámaras/sonido,
memoria, piezas largas y recuperación. Informe/contact sheet fuera de Git. Revisión
humana breve de funcionamiento/creatividad, no una revisión de código imaginaria.

## Referencias

- [Contratos de arquitectura](ARCHITECTURE_FOUNDATION.md)
- [Identidades y provenance](DOMAIN_MODEL_AND_ASSET_PROVENANCE.md)
- [Wizard rítmico actual](WIZARD_RHYTHMIC_VIDEO3D.md)
- [WebCodecs](https://www.w3.org/TR/webcodecs/)
- [Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync): opción fonética
  multilingüe menos precisa; verificar español antes de adoptarla.
- [MFA: alineación](https://montreal-forced-aligner.readthedocs.io/en/latest/user_guide/workflows/alignment.html):
  requiere recursos lingüísticos adecuados y versión fijada tras evaluación.
- [FFmpeg filtros](https://ffmpeg.org/ffmpeg-filters.html): reutilizar mezcla/normalización.

## Checkpoint de ejecución

- 2026-09-06: PR 01 iniciado en rama `test/video3d-production-baseline` desde la
  base indicada. Sólo documentación y contratos; ninguna generación o render real
  ejecutado. Consultar su PR para SHA, resultados, CI y Cursor actuales.
- El worktree se actualizó por fast-forward a
  `ac5d3bc5dc30fb38c5aa0ad327186a06b1f5cdd1` tras los merges ajenos #161 y #163,
  sin modificar esos cambios. La inspección arquitectónica anterior conserva su SHA.
- PR 01: [#164](https://github.com/IAnMove/hocuspocus/pull/164) mezclado en
  `development` como `a52c5680ad3079ddec07681521a1a3b9c1644e2b`. CI obligatorio y
  Cursor completados sobre HEAD `5e1b15e0262967eed27949973ffcabd0f8cb0b22` antes
  del merge. Independent QA neutral no se considera aprobación. No hay piloto
  audiovisual validado ni inferencia real.
- PR 02a: implementación local iniciada en `feat/video3d-recipe-generation-policy`
  desde ese merge. Core revisado por el agente principal; UI/DOM delegados a Luna
  y sujetos a revisión del principal. No equivale a autorización global de Wizard.
- PR 02b–13: diseñados, no implementados por este checkpoint.
- PR 02a: [#165](https://github.com/IAnMove/hocuspocus/pull/165) mezclado en
  `development` como `353a1225c63e0c1ffc3fed8459bc280bbe883ba3`; CI obligatorio y
  Cursor completados sobre `de99a61b67ee6a3a4237ef4a8c88930c604d2b4e`.
- 2026-09-06, comprobación visual solicitada por el usuario: rama aislada
  `fix/video3d-facial-playback-contract`. Detectados dos defectos de reproducción:
  la normalización descartaba `eyes/open` al importar y el reposo sin diálogo
  inventaba una frase de fallback. Corregidos localmente con pruebas de contrato.
  La demo «La noche es nuestra» usa personajes SVG originales, compositor real
  del navegador, música procedural y voces españolas CPU eSpeak NG con eventos
  de fonemas. El ensamblado de planos/audio es orquestación externa de la demo,
  NO implementación de las fases 06–10 ni validación de canto natural.
  Los medios permanecen fuera del repositorio. No se llaman los backends vivos
  ni se descarga o ejecuta ningún generador neuronal de vídeo.
