# Lip-sync local en el editor de vídeo 3D

## Entrega y alcance

Base: origin/development, commit 23253bb77e8f326eff6860b3aff7e100592158dc (verificado al descargar el 8 de septiembre de 2026).
Rama de trabajo: codex/3d-lipsync-scenes. Integración local; no se ha hecho push, PR ni merge.

Añade tres plantillas al editor existente: Retrato hablando, Diálogo con lip-sync y Presentador con voz. No crea otro catálogo de personajes, no cambia Historia/Story Lab y no integra todavía el 2D. No modifica los GLB originales ni requiere claves de Meshy o Hi3D.

## Uso normal

1. En Hocuspocus abre **Estudios → Vídeo 3D → Voz y lip-sync**. Es una opción del editor habitual, disponible en cualquier plano con modelos 3D; no requiere otra página ni pantalla completa.
2. Selecciona el GLB en la tarjeta existente del personaje. Abre su opción **Voz y lip-sync**: el inspector aparece junto al visor en pantallas amplias y debajo en pequeñas. El selector **Personaje** cambia qué voz/cara estás editando.
3. Las tres plantillas de voz son atajos opcionales que abren el mismo inspector. En **Importar ajustes existentes (opcional)** puedes reutilizar un kit v2 de Taberna: GLB, WAV, atlas de nueve bocas, gestos y calibración. Sólo se leen esos cuatro recursos y config.json; nunca se ejecutan sus scripts.
4. Para un modelo sin kit, elige su perfil y pulsa **Colocar boca y ojos**. Revisa y ajusta tamaño, posición, color de piel y ojos. La estimación requiere un humanoide +Z con hueso Head/mixamorigHead, UV y material compatible; no es reconocimiento universal de caras.
5. Elige una voz local o del catálogo (máximo 90 s / 32 MB). Inicialmente se genera una aproximación por volumen, claramente indicada. Pulsa **Calcular gestos con Rhubarb** para análisis fonético local, o importa un JSON cues/mouthCues.
6. Ajusta inicio en escena, recorte inicial y volumen por personaje. En un diálogo, selecciona el otro sujeto para asignar su voz. **Ajustar duración a las voces** evita cortar el final de las pistas.
7. Configura expresión/parpadeo y, si quieres, un clip corporal del GLB. Los clips de origen pueden requerir ajustes de orientación; el sistema facial no corrige retargeting corporal.
8. **Guardar plano JSON** conserva ajustes, gestos y referencias persistentes. **Exportar MP4** incluye la mezcla de voces, no sólo la boca.

Un JSON referencia los assets del equipo que lo guardó. Para llevarlo a otro ordenador, importa allí el ZIP y guarda otra escena, o migra también los assets y sus referencias. Copiar únicamente el JSON no copia modelo/audio/atlas.

## Instalación local de Rhubarb

No se instala ni descarga ningún ejecutable automáticamente. Usa la distribución de [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) con sus recursos y licencia completos. Configura RHUBARB_EXECUTABLE con la ruta absoluta de rhubarb.exe (o rhubarb en macOS/Linux) en el entorno del proceso de Hocuspocus, o ponlo en PATH, y reinicia ese proceso.

No hacen falta tokens/API keys. Sin Rhubarb siguen funcionando importar gestos y el modo por volumen. El modo phonetic sirve como estimación independiente del idioma, no como alineación lingüística perfecta.

La ruta POST /api/v1/character-kits/speech/analyze se monta mediante el router existente de Character Kits. Acepta sólo WAV PCM mono 16 kHz/16 bits, hasta 90 s y 3 MB; admite un proceso a la vez, dos hilos y timeout de 90 s. No resuelve URLs ni rutas recibidas del cliente. Mantiene los WAV/resultados de diagnóstico en el directorio temporal del sistema con prefijo hocuspocus-speech-.

## Organización del código

- ui/src/features/scene3d/speech/types.ts y track.ts: contrato serializable, validación y evaluación temporal pura.
- mouths.ts, eyes.ts, runtime.ts: atlas procedural y material de boca/párpados; adaptación del kit del proyecto Taberna.
- calibration.ts: colocación inicial y perfiles; kit.ts: importación acotada y subida mediante las API existentes.
- Scene3DSpeechControls.tsx y FaceControls.tsx: controles del personaje seleccionado, sin estado en otro catálogo.
- audio.ts, preview.tsx y encodeAudio.ts: mezcla, reproducción y AAC. Exportación 1280×720 como máximo, hasta 180 s de salida con voz.
- app/services/scene3d_speech.py y app/routers/scene3d_speech.py: análisis local aislado del runtime de generación.

Scene3DSlot.speech es opcional y versionado. Conserva FacePlacement en coordenadas de la malla original antes del skinning, atlas/audio como Scene3DSourceRef y los gestos en tiempo del audio. Los documentos antiguos permanecen válidos. Cambiar de modelo mediante el selector borra su calibración; conservar assets al cambiar de plano copia los ajustes sin compartir objetos mutables.

La boca utiliza pintura sobre el material, no una malla flotante ni una nueva cavidad bucal. El shader conserva las coordenadas anteriores al skinning para seguir la piel y cubre también el canal emisivo de las texturas Meshy. Esta primera integración no crea morph targets nuevos. Las expresiones son párpados/cejas estilizados; necesitan calibración por modelo y todavía pueden mostrar pequeñas costuras en las esquinas de los ojos.

## Tiempo y exportación

Tiempo de voz/gestos = tiempo de escena - inicio + recorte. Cámara, esqueleto, boca y parpadeo se evalúan por tiempo absoluto: no dependen de cuántos fotogramas se hayan dibujado antes.

La velocidad de escena se aplica una vez tanto al vídeo como a la voz; cambia también el tono del audio. Las voces se mezclan en mono a 48 kHz con OfflineAudioContext. El documento de exportación se congela antes de cargar la mezcla y renderizar los frames.

Se utiliza [AudioEncoder](https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder) y el [mp4-muxer ya presente en el proyecto](https://github.com/Vanilagy/mp4-muxer). Si AAC no está disponible, se informa del error: no se publica silenciosamente un plano mudo. AAC usa dequeue para controlar la cola y un solo flush al terminar; múltiples flush intermedios fallaban en Edge/Windows con la pista real de 8,83 s. El último bloque se rellena con silencio hasta 1024 muestras (máximo 21,3 ms).

## Revisión local sin cargar modelos generativos

La revisión principal se hace en la aplicación completa, no en el harness aislado:

- scripts/dev/scene3d_speech_review.py: API mínima, sólo loopback. Permite arrancar el shell normal con datos vacíos y preferencias efímeras; guarda imports/exportaciones sólo en la carpeta indicada. Si existe portrait.world3d.json, ofrece sus referencias de modelo/voz en los selectores habituales. Identifica la app como local-review / sin generación. No sustituye al backend normal ni conecta a proveedores.
- ui/scripts/review-video3d-in-app.mjs: abre la raíz de Hocuspocus, pulsa Estudios/Vídeo 3D, carga un plano nativo, reproduce, comprueba cerrar/abrir el inspector, guarda/reabre y captura con la navegación visible.
- ui/e2e/fixtures/scene3d-speech.html: editor aislado conservado sólo para QA técnica; no es una nueva sección ni el acceso de usuario.
- ui/scripts/review-scene3d-speech.mjs: importa un kit v2 proporcionado como argumento, reproduce, guarda JSON y exporta MP4.

Desde la raíz, en un entorno Python ligero con fastapi, uvicorn y python-multipart:

```powershell
python scripts/dev/scene3d_speech_review.py --assets ABSOLUTE_IGNORED_FOLDER --port 8792
```

Desde ui, en otra terminal:

```powershell
$env:HOCUSPOCUS_API_TARGET = 'http://127.0.0.1:8792'
npx vite --host 127.0.0.1 --port 8788 --strictPort
node scripts/review-scene3d-speech.mjs ABSOLUTE_PATH_TO_TABERNA_KIT.zip
```

Revisar http://127.0.0.1:8788/ → Estudios → Vídeo 3D → Voz y lip-sync. Para recuperar la demostración ya calibrada, **Abrir plano JSON** y seleccionar .codex-tmp/speech-review/portrait.world3d.json. Usa los mismos controles Guardar plano JSON y Exportar MP4 que cualquier otro plano. No hay una nueva extensión ni catálogo.

Desde ui, `node scripts/review-video3d-in-app.mjs` verifica este acceso real (opcionalmente recibe la ruta absoluta a otro plano nativo). Los medios/capturas están en .codex-tmp/speech-review/, ignorados por Git. No se han borrado los experimentos anteriores.

## Evidencia y límites de QA

Seguimiento de integración visual (8 de septiembre):

- La opción Voz y lip-sync está en la barra y tarjetas del editor, no en otra sección. Cerrar el inspector no apaga ni borra la voz. Cambiar el personaje actualiza sus controles. Compatible con planos normales y con las tres plantillas de voz.
- E2E actualizado: PASS desde la aplicación completa, sin pantalla completa obligatoria ni cambio de URL. Comprueba apertura/cierre, selección del segundo sujeto y las tres plantillas.
- Revisión con medios reales en la raíz de Hocuspocus: PASS. Navegación Estudios → Vídeo 3D, carga de Mira, reproducción, cierre/apertura de controles y guardado/reapertura del documento nativo con sus 54 gestos intactos. Sin pageerrors ni peticiones fallidas. Captura: .codex-tmp/speech-review/video3d-integrado.jpg.
- Repetidos tras el ajuste: build/TypeScript, i18n, presupuesto de bundle, lint de los controles, 10 tests de voz y 15 de backend/arquitectura: PASS.
- La API de revisión sólo conecta a archivos y Rhubarb locales. El shell se identifica como local-review / sin generación. Para producción se usan los endpoints normales ya integrados; no se deben publicar los fixtures como backend.

- Build de producción y TypeScript: PASS.
- i18n en/es: PASS.
- Suite funcional: 1202/1202 PASS con concurrencia 2. Se añadió después una regresión AAC; las 10 pruebas del módulo de voz pasan.
- Backend: 15/15 PASS (analizador, grabaciones y contratos de arquitectura).
- E2E del editor completo: PASS, tres plantillas accesibles desde Video 3D. API simulada cerrada; HOCUSPOCUS_API_TARGET apunta a loopback sin listener, puerto propio 8794.
- Medios reales: importación de Mira v2, 54 gestos conservados, ocho clips corporales, guardado/reapertura del JSON, expresiones y render de dos instancias con voces desfasadas.
- Rhubarb real: HTTP 200 desde el botón del editor; 53 gestos calculados sobre la voz de 8,829375 s tras remuestreo.
- Dos MP4 locales renderizados: toma corporal y retrato frontal. H.264 1280×720/30 fps, vídeo 8,833333 s, audio AAC 48 kHz mono 8,832 s. Ambos decodificados sin errores con FFmpeg; señal del retrato: media -21,1 dB, máximo -2,2 dB.
- La primera ejecución de toda la suite con concurrencia por defecto produjo timeouts en pruebas ajenas; la repetición limitada pasó completa. El harness inicial tuvo una ruta de subida errónea, corregida; no eran errores del endpoint de producción.
- No se han ejecutado el backend principal, modelos generativos, tests de proveedores reales ni un render de episodio/Story Lab. No se ha hecho revisión independiente por otro agente ni CI remota.

Hay solapamientos acotados con la PR abierta #260 (pantallas multimedia) en los puntos de conexión de scene3d. No se incorporó código de esa PR ni se tocó su rama. Antes de publicar, revisar/reconciliar esos hunks contra development y pedir revisión independiente. El nuevo módulo se mantiene separado para facilitarlo.

## Coste de la tarea

- Tests simulados: 0 tokens externos.
- Tests reales: WebGL, Rhubarb y codificación local; 0 llamadas a proveedores de IA.
- Llamadas LLM externas desde Hocuspocus: 0.
- Tokens de prompt: N/A.
- Tokens de respuesta: N/A.
- Tokens totales: N/A.
- Generaciones de imágenes/audio/vídeo con IA: 0. Exportaciones locales de vídeo verificadas: 2, reutilizando modelo y voz existentes.
- Tiempo transcurrido: aproximadamente 70 minutos, incluidos intentos y comprobaciones.
- Proveedores/modelos: N/A. Rhubarb/Three.js/WebCodecs/FFmpeg locales; sin créditos Meshy/Hi3D.

Seguimiento de interfaz: tests simulados 0 tokens externos; tests reales de reproducción/guardado local, sin proveedores; llamadas LLM externas 0; tokens de prompt/respuesta/totales N/A; generaciones de imagen/audio/vídeo 0; nuevas exportaciones MP4 0; tiempo de seguimiento N/A (sin medición continua); proveedores/modelos N/A. Se reutilizaron modelo, voz y plano existentes. Sigue sin commit/push ni revisión independiente.
