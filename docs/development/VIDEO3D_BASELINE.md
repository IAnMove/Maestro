# Video 3D: baseline sin modelos

Este paquete caracteriza código existente antes de cambiar contratos o exportación.
No implementa un renderizador, un alineador ni un ensamblador de episodios.
La hoja de ruta y los gates están en [VIDEO3D_PRODUCTION_PLAN.md](VIDEO3D_PRODUCTION_PLAN.md).

## Alcance de las fixtures

`ui/tests/fixtures/video3dProduction.mjs` contiene datos declarativos y gráficos
SVG geométricos inline. No depende de outputs, modelos, personajes del usuario,
descargas, audio hablado ni servidores. No representa una prueba de calidad visual.

`ui/tests/video3dProductionBaseline.test.mjs` ejercita el parser/compilador,
Character Kits, evaluación temporal, exportación/importación de JSON y resolución
de assets de la aplicación. Las llamadas de red se interceptan y rechazan en los
tests del resolver. El texto ES/EN es autoría de la fixture, no voz sintetizada.

Los tests existentes de `tests/test_scene_recording.py` comprueban construcción
del comando FFmpeg, validación de metadata y publicación atómica con dobles.
No decodifican una película real y no prueban que un GLB aparezca en pantalla.

## Reproducir

Usar un worktree propio desde `origin/development`. Instalar sólo dependencias de
desarrollo. No ejecutar `install.js`, `start.js`, smoke real ni el backend principal.

En `ui/`, con Node 24.18.0 y las dependencias fijadas en el lockfile:

```bash
npm ci --no-audit --no-fund
node_modules/.bin/tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts \
  --test --test-concurrency=1 tests/video3dProductionBaseline.test.mjs \
  tests/sceneRecipe.test.mjs tests/sceneRecipeAssets.test.mjs \
  tests/sceneTimeline.test.mjs tests/sceneFile.test.mjs \
  tests/characterKitEpisode.test.mjs tests/cutoutDialogue.test.mjs
```

Desde la raíz, con un entorno Python de desarrollo que tenga pytest:

```bash
python -m pytest -q tests/test_scene_recording.py tests/test_architecture_contracts.py
python scripts/verify_clean_repo.py
python scripts/check_documentation_links.py
git diff --check
```

Antes del PR, seguir la validación del repositorio. Pasar siempre la base exacta:

```bash
BASE_REF=origin/development bash scripts/validate_local.sh
```

Ese wrapper requiere también dependencias Python de contratos y Playwright; no las
instala. No declarar PASS si faltan. Su modo rápido no equivale al modo `--full`.
Cuando haya cargas pesadas concurrentes, ejecutar checks individualmente con baja
prioridad y concurrencia limitada, registrando exactamente cuáles se han ejecutado.
Los E2E simulados requieren puerto propio mediante `HOCUSPOCUS_E2E_PORT` y no deben
reutilizar un servidor ajeno. Fijar además `HOCUSPOCUS_API_TARGET` a un puerto
loopback comprobado sin listener (por ejemplo `http://127.0.0.1:1`) para que una
petición no interceptada jamás alcance el backend activo. No ejecutar la
configuración `playwright.live`. Los errores de proxy no equivalen a una
intercepción completa: deben registrarse aunque los escenarios pasen.

## Qué no demuestra un PASS

| Propiedad | Evidencia necesaria posterior |
|---|---|
| Vídeo completo de varios planos | Render, decodificación y ensamblado (PR 04–06) |
| Snapshot y metadata idénticos | Prueba de edición concurrente durante exportación (PR 03) |
| Render recuperable tras cerrar UI | Worker gestionado y pruebas de recuperación (PR 05) |
| Prohibición global de generación de vídeo | Política integrada en todos los consumidores (PR 02 y posteriores) |
| Precisión de boca y voz | Corpus hablado y benchmark local (PR 09–11) |
| Calidad profesional musical/dialogada | Pilotos audiovisuales y revisión funcional breve |
| Memoria/tiempo de exportación | Mediciones locales con resolución, duración y entorno fijados |

## Registro de evidencia

Cada PR registra SHA base/HEAD, comandos, duración medida cuando esté disponible,
resultado y limitaciones. No poner latencias artificiales, score estimado ni
"validado con generación real" por pasar contratos.

Para el primer paquete, el benchmark de render y uso de memoria queda **pendiente**:
el usuario mantiene pruebas pesadas concurrentes y no se debe perturbarlas. Este
pendiente no se transforma en un PASS de rendimiento por completar CI.

Los resultados CI/Cursor pertenecen al PR actual. Las fixtures entran en la suite
normal `npm test`; no necesitan un workflow de GitHub adicional ni relajar checks.
