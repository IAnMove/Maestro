# Vídeo 3D: plantillas y controles de edición

Base de implementación: `f05bb2c8` de `development`. Trabajo aislado; no cambia
launchers ni servicios activos.

## Comportamiento

- Las 21 plantillas 3D existentes reciben perfiles de cámara e iluminación
  diferenciados. Se añaden 15 composiciones (36 en total), agrupadas en cine,
  producto, videoclip, espacio y conducción, con búsqueda y descripciones ES/EN.
- La barra de reproducción tiene una acción principal de 48 px, pausa, reinicio,
  cursor temporal y velocidad de 0,25× a 4×. La biblioteca se puede plegar y el
  editor ofrece pantalla completa para disponer de más espacio.
- Mover usa el gizmo real de Three.js para X/Y/Z; girar permite el eje Y que
  admite el documento. Escalar conserva las proporciones. Los campos numéricos,
  botones de tamaño y restablecimiento comparten el mismo estado que el gizmo.
- Cambiar de plano conserva por defecto fuentes, identidad y clips compatibles;
  usa las posiciones del plano nuevo. La opción se puede desmarcar.
- Las 48 plantillas por capas reciben un acabado editable de profundidad:
  fondos más contenidos, primer término suavizado, sombras suaves y partículas
  ajustadas a la intensidad. No se cambia la imagen del sujeto ni el prompt.
  La galería incorpora búsqueda y textos mayores; las acciones de reproducción
  del compositor y las galerías ganan tamaño y contraste.

## Contrato temporal y de recursos

`Scene3DDocument.playbackSpeed` es opcional; ausencia equivale a 1. Se acota entre
0,25 y 4. `duration` permanece como longitud de la línea temporal original.
La duración del resultado es `duration / playbackSpeed`; exportación y preview
recorren la misma cámara, clips y entorno. El encoder recibe tiempos del
resultado y los transforma a tiempos de la escena. El sidecar conserva el
documento completo y la duración efectiva del vídeo.

El gizmo actúa sobre un objeto auxiliar en coordenadas del documento. No
reescribe huesos, normalización del GLB ni identidad de sus animaciones. Se
oculta durante reproducción y exportación y se libera al desmontar la escena.
Los botones de edición quedan inactivos durante la reproducción/exportación.

Las nuevas composiciones son configuraciones de cámara, luz, decorado y slots.
No generan animación esquelética, física ni audio: los clips se eligen de los
GLB aportados. Las referencias coral/MiniMax existentes y sus hashes permanecen
intactos. El nuevo acabado sólo se aplica al compilar escenas nuevas y se
identifica como `narrative.controls.finishVersion: 1`.

## Validación

Los resultados y las limitaciones de validación se registran en el PR. Las
pruebas dirigidas cubren todos los catálogos, cámaras, roundtrip, procedencia,
velocidad y transformación. El E2E usa la escena WebGL real con API simulada en
un puerto propio, sin proveedores ni backend de usuario.
