# Wizard → composición de vídeo: primera integración

## Qué se puede pedir

- «Prepara una escena con Video3D, sólo con mis assets, sin vídeo generativo».
- «Monta una escena con el compositor; puedes generar imágenes, pero no vídeo».
- «Prepare a programmatic video using only my existing assets».

El Wizard abre **Video3D → Scene recipe** y rellena la petición literal. La
acción `prepare_programmatic_video` no ejecuta un LLM planificador adicional,
no monta, no exporta y no inicia generación. Los recursos se revisan y escogen
visiblemente en el formulario. Los nombres emitidos por la capability sólo
pueden resolver outputs visuales exactos del workspace; no se inventan rutas.

La política por defecto es `provided_only`: no generar imagen, malla, audio,
vídeo ni rig. El permiso explícito para crear recursos no-video activa
`no_video_generation`. Mencionar una nave o una canción no concede ese permiso.
Una respuesta LLM no puede concedérselo a sí misma mediante su JSON.

Después se puede planificar la receta, revisarla, montar cada plano y guardar
o exportar con los controles existentes. La generación de texto del
planificador sí utiliza el LLM configurado al pulsar su botón. No debe
confundirse con generación de medios ni con una planificación gratuita/offline.

## Contrato y límites

- La reconciliación se aplica antes del atajo genérico «genera un vídeo».
- Una pregunta explicativa no pone trabajos en cola.
- Las peticiones normales de Studio y las negaciones de Video3D mantienen su ruta.
- El workflow rítmico anterior se conserva cuando usa audio existente o el
  usuario ha pedido crear la canción; nunca genera vídeo neuronal.
- La política de la preparación permanece visible y bloqueada. Las recetas
  devueltas por el LLM no pueden reducirla; el resolver realiza preflight antes
  de cualquier trabajo de assets. Reiniciar la sesión es una acción explícita.
- Handoff único, acotado a 20 s, con workspace y nombres exactos. El ACK llega
  después de reflejar el formulario, no sólo de cambiar de pestaña.
- No es un permiso global persistente del Wizard: otras acciones Studio/Director
  no pasan por el resolver de recetas. No se promete que un «continúa» ambiguo
  mantenga una restricción global entre todos los workflows. Para generación
  automática duradera hay que usar acciones/workflows con política explícita.
- No hay todavía selección automática de tomas híbridas Story Lab/Director,
  aprobación del catálogo candidato ni sustitución del editor existente.

## Pruebas sin proveedores

`programmaticVideo.test.mjs`, `programmaticVideoHandoff.test.mjs` y
`programmaticVideoPanel.test.tsx`: clasificación ES/EN, texto literal,
permisos, parser, timeout, concurrencia, ACK tardío, workspace, outputs y
formulario sin llamadas a generadores. Se ejecutan además los tests existentes
de acciones, contrato, puertos, registry y políticas de receta para detectar
regresiones del workflow musical y de las rutas de Studio.

Una prueba del formulario con dobles y un CI verde no son una generación
real, una comprobación del proveedor LLM ni una exportación MP4.
