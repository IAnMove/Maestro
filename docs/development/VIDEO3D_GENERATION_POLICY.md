# Política de generación de assets de recetas Video 3D

PR 02a del [plan de producción](VIDEO3D_PRODUCTION_PLAN.md). Este contrato controla
los trabajos iniciados por el resolver de recetas; no es un sistema global de
permisos para Studio, Director, voz del panel o comandos independientes del Wizard.

## Tres niveles, siempre gana el más restrictivo

| `generationPolicy` | Generación de assets ausentes | Assets suministrados |
|---|---|---|
| `auto` u omitido en documentos legacy | Comportamiento anterior | Se reutilizan; rigging según receta |
| `no_video_generation` | Imagen, audio y 3D permitidos; vídeo prohibido | Incluye clips de vídeo ya existentes |
| `provided_only` | Ninguna, tampoco rigging | Se usan tal cual; no se infieren capacidades nuevas |

El nombre deliberadamente explícito `no_video_generation` evita confundir dos
garantías: **no llamar a un generador de vídeo** y **no usar ninguna capa de vídeo**.
El primer piloto completamente programático exige ambas; esta política sólo
implementa la primera. Un MP4 producido por el compositor sigue siendo un output
de tipo vídeo; no se debe confundir ese tipo con inferencia de un modelo de vídeo.

`provided_only` tampoco promete que un GLB contenga un clip solicitado. Reutiliza
sus bytes sin iniciar un trabajo de rigging. La inspección de clips/capacidades del
asset sigue siendo necesaria antes de un render final.

El botón de planificar con el LLM es una operación aparte: Manual/provided_only
no significa modo offline ni prohíbe esa consulta de texto. Los tests de ese botón
usan respuestas falsas y no ejecutan un LLM real.

## Autoridad y preflight

- El modo Manual impone `provided_only`, también mediante el antiguo argumento
  `generateMissing: false`. No se puede elevar con `policy: 'auto'`.
- El control visible de no generar vídeo impone `no_video_generation` en modo Auto.
- Una receta puede añadir restricciones, pero no relajar las de su caller. Una
  respuesta del LLM que diga `auto` no anula la elección del usuario.
- Los valores desconocidos, `null`, cadenas vacías y booleanos se rechazan.
- Se inspecciona la receta completa antes de cualquier callback, consulta de cola
  o petición de generación. Una imagen anterior a un vídeo prohibido no se genera
  parcialmente antes de descubrir el bloqueo.
- El resolver toma una copia antes del primer `await`. Editar el objeto original
  durante la resolución no permite insertar un trabajo después del preflight.

La política no verifica que un nombre de archivo exista o corresponda al tipo
declarado; eso pertenece al resolver de archivos y al preflight del render. Los
tests sin red prueban restricciones de ejecución, no validez de bytes audiovisuales.

## Persistencia y compatibilidad

Campo opcional `generationPolicy` en `SceneRecipe` y `Scene` versión 1. Se mantiene
en recetas con fuentes resueltas, ambos caminos de compilación (custom/template),
JSON de escena y `sceneToRecipe`. Ausencia significa comportamiento legacy: no se
reescriben archivos ni se cambia el formato de los outputs existentes.

Guardar/reabrir una escena conserva la restricción para volver a usarla como
receta. El backend actual guarda el documento; eso **no** constituye aplicación de
la política en todos los endpoints. Los jobs de producción y los demás workflows
deberán transportarla y aplicarla explícitamente en sus paquetes correspondientes.

Para ampliar deliberadamente una receta restringida hay que cambiar su campo y el
control del caller. Cambiar sólo el modo a Auto no borra una restricción guardada.

## Pruebas sin modelos

```bash
cd ui
node_modules/.bin/tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts \
  --test --test-concurrency=1 tests/sceneGenerationPolicy.test.mjs \
  tests/sceneRecipePolicyPanel.test.tsx tests/video3dProductionBaseline.test.mjs
```

Los casos negativos fallan con `fetch` interceptado; no usan un backend. La
compatibilidad Auto se prueba contra respuestas falsas incluso para el POST de
vídeo. Ese POST simulado no es generación real. Comprobar también EN/ES, lint,
type-check/build, tests de recetas y ratchet contra la base del PR.

## Pendientes deliberados

- Identidad/revisión/CAS de producción: PR 02b, no inventar un segundo almacén.
- Snapshot del vídeo y metadata de publicación: PR 03.
- Worker independiente, cancelación/recuperación y ensamblado: PR 04–06.
- Aplicar restricciones a workflows rítmicos, voz, comandos directos y backend
  cuando se integren en la producción común. No anunciar protección global todavía.
- Validar render sin capas de vídeo para el piloto programático. No limitar las
  composiciones legacy que sí incluyen clips importados.
