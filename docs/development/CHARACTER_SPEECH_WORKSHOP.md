# Taller de habla 2D — preparación manual primero

Base: development `a0bf91c6` (#200 mezclado), 2026-09-07. Complementa
[el plan raster](CHARACTER_SPEECH_RASTER_PLAN.md), no declara R2–R4 terminados.

## Alcance de este PR

- [x] Revisar instrucciones, logs y coordinación. No modificar launchers;
  destino, ejemplo y captura de URL de Pinokio no aplican a este cambio de UI.
- [x] Exponer «Preparar habla 2D» dentro de Personajes, sin generar órbitas 3D.
- [x] Reutilizar biblioteca y Face Rig; importar una base, seleccionar pose,
  preparar/importar bocas, colocar, previsualizar y guardar explícitamente.
- [x] Mostrar missing/pending/rejected/incompatible/approved por boca. Tener
  piezas no certifica alineación artística ni sincronización fonética.
- [x] Modo manual sin inferencia: botones de generación, limpieza neural y voz
  deshabilitados aquí. El Face Rig de escenas conserva sus herramientas
  asistidas previas. Referencia de identidad no equivale a edición con máscara.
- [x] Conservar aislamiento de workspace y revisión optimista; conflicto de
  guardado conserva borrador, nunca sobreescribe la revisión remota en silencio.
- [x] Corregir hallazgo de revisión: recuperación del borrador al salir de la
  sección/cambiar workspace. Conservar baseRevision original; una revisión
  remota nueva no autoriza a sobrescribir el kit recuperado. Caché de sesión,
  no guardado de servidor; fallback en memoria si el navegador bloquea storage.
  Payload versionado, validado y limitado a 2 MiB. Un fallo de reemplazo no
  recupera una copia anterior obsoleta. Guardar o descartar limpia la recuperación.
- [x] Tests baratos de estado, interacción, persistencia y respuestas tardías:
  22 casos específicos aprobados. Un E2E simulado abre el taller desde la
  navegación real, revisa, guarda y recarga sin inferencia. No es generación real.
- [x] Commit inicial `4cfc6cdd` y revisión independiente de código por Luna.
  Su hallazgo sobre recuperación de borradores se corrige antes de publicar.
- [x] Validación local final del parche de recuperación, incluida navegación
  real con API simulada y desmontaje comprobado antes de recuperar el borrador.
- [x] PR [#200](https://github.com/IAnMove/hocuspocus/pull/200) a development;
  HEAD `7fa0c6b5`; merge `a0bf91c6`. Comprobado en remoto, no inferido de esta lista.
- [x] CI required verde sobre ese HEAD. Independent QA/Bugbot neutrales no son
  aprobación. Sin publicar main ni reiniciar apps compartidas.
- [ ] Prueba artística de un personaje hablando (pendiente, fuera de #200).

## Alternativas y decisión

1. **Sprites raster**: importar bocas dibujadas/retocadas que encajen con el
   personaje. Tapar o borrar la boca original una vez. La limpieza plana existente
   no reconstruye barba; usar parche con piel si hay textura. Reproducción sin
   modelo generativo, aunque la composición puede usar aceleración gráfica.
2. **Parche facial**: una variante alineada por estado, máscara con piel/barba y
   composición sobre la base exacta. Generación sólo durante preparación, no
   por frame. Misma identidad no garantiza el mismo encuadre/píxeles.
3. **Cabezas completas/malla**: rutas posteriores para gestos mayores; deformar
   una imagen no inventa el interior de la boca. No introducir ahora un motor.
4. **Software de audio→visemas**: [Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync)
   produce tiempos y formas, no dibujos. Puede exportar JSON y datos para
   Moho/OpenToonz. Evaluar recognizer phonetic para español, voz aislada y canto;
   no asumir calidad equivalente entre idiomas. Todavía no integrado.
5. **Editor externo**: [Cartoon Animator](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/ENU/08_Animation/Facial_Puppeteering/Facial_Clips_and_Keys.htm)
   genera animación de boca al aplicar voz a personajes preparados. Alternativa
   de autoría externa, no dependencia ni runtime incorporado en HocusPocus.
6. **Neural**: [MuseTalk](https://github.com/TMElyralab/MuseTalk) modifica el rostro
   según audio. Sus límites documentados incluyen bigote, forma/color de labios
   y jitter. Medir calidad y recursos reales antes de integrar; no instalado ni
   ejecutado en este bloque. No prometer 24 GB ni otro requisito universal.

Referencias de edición enmascarada: [FLUX Fill](https://github.com/black-forest-labs/flux/blob/main/docs/fill.md)
y [Qwen en Diffusers](https://huggingface.co/docs/diffusers/api/pipelines/qwenimage).
Comprobar pipeline/versión/adaptador y licencia del checkpoint antes de ofrecer
esa capacidad. Máscara pequeña no reduce el tamaño de los pesos cargados.

## Siguientes PR, en orden

- [ ] Importador manual de sprites dedicado si el uso del editor actual resulta
  insuficiente; preview antes de upload, MIME/bytes/dimensiones/alpha, procedencia
  y revisión explícita. No aprobar una pieza sólo por ser transparente.
- [ ] Packs por pose/vista con migración del mapa global actual, round-trip
  backend y montaje/export; no lanzar packs multipose antes de esa migración.
- [ ] Adaptador Rhubarb opcional: detección de instalación/versionado, contrato
  audio/cues, subprocess sin shell y cancelación, límites de duración y tamaño,
  idioma, procedencia, errores honestos, tests con ejecutable falso en CI.
- [ ] Reproducción con audio real y editor de tiempos: silencios, fonemas,
  visemas faltantes visibles, vocal aislada para canciones, export/reopen
  sincronizados. Comparar con la heurística actual; no renombrarla «fonética».
- [ ] Piloto artístico local de 5–10 s: cerrado/abierto/redondeado primero,
  barba, costuras y doble boca; después seis o más visemas si aporta calidad.
- [ ] Inpainting opcional sólo tras validar capacidades: prompt técnico inglés,
  texto/idioma de diálogo intactos, modelo/proveedor/seed/máscara/parent/job IDs,
  reanudación sin reenviar costes, aprobación por pieza. No prometer pixel-perfect.
- [ ] MuseTalk A/B cuando la GPU esté libre, consentimiento de ejecución, recursos
  medidos, revisión de licencias, identidad y barba. Decidir por evidencia.

La aprobación del usuario de la identidad MiniMax se conserva. Lo pendiente es
la preparación para animación y actuación, no decidir de nuevo si es el personaje.
Pesos, imágenes, audio, GLB privados y outputs de pruebas permanecen fuera de Git.

## Incidente de RAM y ejecución acotada

En validación local del 2026-09-06 un proceso de estos tests fue terminado por
el OOM killer con unos 57 GiB residentes. La aserción comparaba directamente un
HTMLElement de JSDOM/React con null; al fallar, el formateador recorría sus
estructuras internas. Se corrigió la espera de recarga y se comparan primitivas,
no nodos DOM. No atribuir este incidente a la generación de modelos.

La repetición aislada de los 13 casos pasó en 1,54 s, máximo RSS de proceso
203384 KiB según time; ese dato no es el pico agregado de todo el grupo.
Límite de grupo verificado: 1610612736 bytes, swap 0, timeout 35 s, concurrencia
de tests 1. No volver a lanzar tests diagnósticos sin límites. En Linux con
systemd de usuario disponible, ejecutar desde ui:

```bash
systemd-run --user --scope -p MemoryMax=1536M -p MemorySwapMax=0 \
  -p TasksMax=128 timeout 35s env NODE_OPTIONS=--max-old-space-size=384 \
  npx tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts \
  --test --test-concurrency=1 tests/characterSpeechPreparation.test.mjs \
  tests/characterSpeechPreparationPanel.test.tsx
```

El límite V8 por sí solo no limita memoria nativa ni todos los hijos: mantener
un límite real de procesos/cgroup o equivalente del sistema operativo. Este
comando local no añade una dependencia de systemd al producto ni al CI. Si se
alcanza el límite, registrar el fallo; no subirlo automáticamente ni repetir
en paralelo. Builds/E2E se ejecutan por separado con presupuesto propio.

En la primera tanda acotada pasaron 970 tests UI, lint/tipos/i18n y los guards;
dos fixtures ffmpeg de la suite Python fallaron bajo el límite de tareas/hilos.
La repetición completa con afinidad a dos CPUs y OMP/BLAS/MKL a un hilo pasó:
2160 tests, 1 omitido, 79,32 s; se mantuvieron 3 GiB y swap 0. No se cambiaron
ni omitieron esos tests para lograrlo. La corrección posterior de recuperación
requiere una nueva tanda UI/ratchet/build/E2E; Python no se ha modificado.

### Cierre local, 2026-09-07

- UI final: **979 aprobados**, incluidos los 22 específicos. Lint, tipos, i18n,
  clean-repo, dependencias, enlaces y marca aprobados.
- Revisión de integración por Luna: hallazgo de recuperación corregido en
  `6713ce7c`, re-revisado sin nuevos bloqueos. El helper delegado fue revisado
  por el principal, no certificado independientemente por su propio autor.
- Integrado `development` `c2794f6c` (Labs, sin cambios de producto superpuestos);
  los 7 tests Python del contrato entrante pasan. No se repitió la suite Python
  completa porque este PR no modifica Python y ya pasó la tanda anterior.
- Ratchet contra esa base aprobado; score **53.0/100**. No es un certificado
  de arquitectura limpia: conserva avisos, incluidos tres nuevos casos de
  complejidad >=15 y Face Rig 84→85. No se alteraron baselines ni umbrales.
- Build y presupuesto aprobados: entrada gzip 316154/327680 bytes.
- **19 E2E simulados aprobados**. La primera tanda tuvo 18 aprobados y un fallo
  de sincronización del test al navegar demasiado rápido entre paneles. Se
  añadió comprobación de navegación/desmontaje, no una espera arbitraria ni
  un cambio de producto para ocultarlo; repetición completa aprobada.
- Todas las tandas finales bajo cgroup **3 GiB**, swap 0, timeout, en serie.
  Pico agregado observado de la primera: 1806360576 bytes; último muestreo de
  la repetición: 1761177600 bytes. Son muestras de MemoryPeak en vivo, no una
  afirmación de pico final exacto. No se iniciaron modelos ni apps compartidas.

Código validado: `b663912d` (contiene `6713ce7c`, ajuste E2E `27d68e7a` y base
integrada). Commit documental posterior no cambia el producto. CI remoto,
Cursor, merge y actuación con audio real siguen siendo evidencias separadas.
