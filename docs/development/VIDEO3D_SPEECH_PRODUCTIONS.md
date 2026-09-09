# Lip-sync 3D desde canciones, capítulos y tráileres

## Rama y alcance

- Rama de trabajo: `codex/3d-speech-productions`.
- Base explícita: `codex/3d-lipsync-scenes`, checkpoint `dedd3ee`.
- Actualizada con `development` `735e7eb` mediante el merge `c187c2b`: se
  conservan tanto lip-sync como pantallas multimedia y exportación asíncrona.
  Después se incorpora también `development` `f2ef220` en `18e7f81`,
  manteniendo las correcciones recientes de MCP y escalado de imágenes.
  No se modifica el checkout original ni se fusiona esta PR en development.
- Integra el motor facial existente en **Estudios → Vídeo 3D**. No crea otra
  web, otro formato de escena ni un renderizador paralelo.
- Las acciones existentes conservan su ruta 2D para imágenes/recortables.
  Si la capa seleccionada es GLB, las acciones de diálogo preparan un plano
  nativo 3D con el audio y el fragmento seleccionados.

## Entradas visibles

1. Story Lab → producción musical → canción seleccionada:
   **Lip-sync con personajes 3D**. Conserva la referencia del audio elegido.
2. Story Lab → tráiler: la misma opción; elegir el GLB y un audio existente.
3. Series Lab → planos con diálogo: seleccionar los GLB para los personajes
   que hablan y el archivo que contiene sus voces.
4. En el compositor 2,5D, seleccionar una capa GLB, su pista de voz y el rango
   de diálogo. La acción existente abre el motor nativo de Vídeo 3D.

Se usan archivos existentes o subidos por el usuario. Abrir, guardar, reutilizar
o exportar no lanza generaciones. La generación de voz es opcional y explícita,
desde el botón de cada intervención descrito abajo.

## Uso

- Elegir uno o dos personajes por plano y un fragmento de audio.
- Pulsar **Preparar plano en Vídeo 3D**.
- En **Voz y lip-sync**, seleccionar personaje e intervención.
- Revisar posición, tamaño, color de cobertura, boca, ojos y expresión.
  La detección inicial necesita un humanoide compatible y no es infalible.
- Ajustar **Inicio en escena**, **Fin de intervención** y **Recortar inicio
  del audio**. Este último es el tiempo dentro del archivo original.
- Cada personaje admite hasta 32 intervenciones no solapadas. Se puede repetir
  personaje, dejar silencios y sincronizar un archivo de voz diferente por turno.
- El audio original se reproduce una sola vez desde **Audio original de la escena**.
  Las intervenciones preparadas usan guías mudas: su boca se mueve, pero no
  duplican la canción. Activar audio de intervención solo para una voz adicional.
- Guardar el plano JSON para continuar editando; exportar MP4 para usar el resultado.

Los tiempos ausentes en el guion se reparten inicialmente en intervalos iguales.
Son una propuesta editable, **no** reconocimiento de hablante ni alineación de
palabras. El texto se conserva literalmente; por sí solo no genera una voz.

## Ficha compartida: personaje, cara y voz

En **Personajes / Character Creator → Personaje reutilizable · modelo 3D, cara y voz**
se crea o amplía un Character Kit existente. Elegir GLB, nombre y, opcionalmente,
una voz. **Ajustar boca y ojos en Vídeo3D** abre el editor nativo; después de
calibrar, **Guardar personaje con cara y voz** actualiza esa misma ficha.
El inspector de Vídeo3D permite crear, cargar y actualizar la ficha directamente.
Los recursos 2D (poses, bocas y ojos) anteriores se conservan.

- Fuente de verdad: la biblioteca existente `.character-kit-library-v1.json`,
  con CAS por revisión e historial `.vN.json`. No es otro catálogo paralelo.
- `speech3d` guarda referencia GLB, SHA-256 de los bytes y ajuste facial.
- `voice` guarda preferencias públicas, nunca claves: proveedor local, modelo
  `qwen3_tts_customvoice`, preset de hablante y dirección opcional.
- Historia guarda `characterKitRef={id,workspace}`; Series lo guarda dentro de
  `voiceProfile`. La importación Historia→Series conserva ese vínculo.
- Canciones y tráileres permiten elegir un personaje de Historia. Los planos
  de Series recuperan las fichas por los IDs de los hablantes del guion.
- Una capa GLB de Vídeo 2,5D puede vincular la misma ficha junto a sus controles
  de audio. El traspaso rechaza un GLB diferente al calibrado. Las capas 2D
  no reciben estos controles ni cambian su comportamiento.
- Cada instancia 3D guarda una copia de cara/voz y la referencia/revisión.
  Cambiar la ficha después no reescribe escenas ya guardadas.

El guion, audio y tiempos pertenecen a `speech.clips`, no al personaje. Sin
audio, la preparación abre turnos editables. Para crear voz: escribir una frase
literal, reservar su intervalo y pulsar **Generar voz de esta frase**. Se usa
el scheduler de generación existente, se decodifica el audio producido y
Rhubarb calcula sus gestos. Requiere Qwen3 CustomVoice instalado/configurado;
no se descarga ni arranca automáticamente desde la ficha.

Si ya hay audio, el botón queda desactivado y se reutiliza el archivo. Si la
generación no cabe en el turno, se conserva su archivo y se pide ampliar el fin;
el reintento aplica el archivo ya creado, no genera otra voz ni desplaza a otros
personajes. Cerrar el editor cancela únicamente el job iniciado por esa acción.
El idioma lo detecta el modelo a partir del texto. Esta versión no añade
clonación de voces ni conecta proveedores TTS remotos.

## Tres E2E de aceptación

`ui/e2e/specs/scene3d-speech.spec.ts` contiene la navegación previa y estos
tres recorridos nuevos, todos sobre la aplicación nativa en `/`:

1. Subir WAV, analizar, hablar/silencio/seek hacia atrás y exportar MP4 real.
2. A→B→A, pausas, lectura del hablante activo, un solo reproductor y MP4 con
   nivel de audio sin duplicar.
3. Guardar cara/voz, abrir otro plano, reutilizar por ID, generar desde texto
   con API simulada una sola vez y reabrir sin volver a generar.

El GLB y WAV de CI son procedurales y originales. Se simulan biblioteca,
subida, Rhubarb y TTS; WebGL, reloj, reproducción, muxer, H.264 y AAC son reales.
Edge en Windows / Chrome en Linux aportan los codecs. El test exporta y
decodifica audio del MP4, y adjunta capturas, JSON y MP4 al resultado.
CI conserva esos artefactos también cuando las pruebas pasan.

```powershell
$env:HOCUSPOCUS_API_TARGET = 'http://127.0.0.1:1'
$env:HOCUSPOCUS_E2E_PORT = '8806'
npm run test:e2e -- scene3d-speech.spec.ts scene3d-media-screen.spec.ts --workers=1
```

Esto no sustituye una prueba de calidad de canto o de la voz de un modelo TTS
real. La revisión complementaria `node scripts/review-reusable-speech.mjs`
usa la aplicación sin interceptar peticiones, el GLB/WAV existente de Mira,
Rhubarb local real, biblioteca en disco y exportación MP4. No genera voz.
Dos instancias del mismo modelo demuestran A→B→A y reutilización, no dos
personajes generados nuevos. Los originales y los archivos de revisión siguen
en `.codex-tmp/speech-review`, fuera de Git.

Para cantar, una voz aislada suele dar una guía mejor que la mezcla instrumental.
Puede seleccionarse como voz de intervención, manteniendo desactivada su
reproducción y dejando la canción completa en la pista original. Aquí no se
implementa separación de voces. Rhubarb propone gestos fonéticos; hay que revisar
su resultado. El modo por volumen es una alternativa aproximada explícita.

## Calibración reutilizable

**Guardar ajuste para este modelo** guarda boca, ojos, expresión, estilo y atlas,
pero nunca voces, letra, tiempos o pistas. La clave es SHA-256 de los bytes del
GLB, no su nombre: una nueva subida del mismo modelo recupera el mismo ajuste.
Es independiente por workspace. No se aplica un ajuste a un GLB diferente.

Para actualizar un perfil existente: **Recuperar ajuste guardado**, ajustar y
guardar. Las revisiones anteriores se conservan y una revisión concurrente
produce un conflicto, no una sobrescritura silenciosa.

Al abrir un plano nuevo sin cara, se busca el ajuste guardado; si no existe, se
intenta la colocación humanoide. Una calibración manual ya presente no se cambia.
Sin hueso de cabeza o material compatible puede ser necesario importar un kit.

Persistencia: `<workspace>/.speech3d-profiles/<digest>.json` con revisiones
anteriores `<digest>.vN.json`. API bajo el router de character-kits:

- GET `/api/v1/character-kits/speech/profiles/{digest}?workspace=…`
- PUT misma ruta con `workspace`, `revision` y `settings`.

## Límites y compatibilidad

- Audio fuente: hasta 10 min y 32 MB. Análisis local: fragmentos de hasta 90 s.
- Exportación con sonido: hasta 180 segundos de resultado por plano.
- MP4 usa el mismo reloj que la boca; cambiar velocidad cambia también el tono.
- Caras por proyección sobre materiales del GLB, no creación de morph targets
  ni rig facial universal. No requiere volver a gastar créditos en cada personaje.
- El JSON sigue siendo `world3d.json`, versión 1, con campos opcionales
  `production`, `soundtrack`, `slot.character` y `speech.clips`.
  El editor nuevo lee las escenas antiguas. Versiones antiguas del editor no
  interpretan las pistas nuevas: usar esta rama para abrir estos planos.
- El traspaso es local a la pestaña y al workspace. Se guarda una copia temporal
  del plano nativo previo antes de aceptarlo, con historial en sessionStorage y
  botón para volver. Guardar JSON para conservación duradera entre sesiones.

**No está implementado** el montaje automático del capítulo/tráiler completo ni
la sustitución automática de sus intentos aprobados. Esta entrega prepara planos
3D exportables desde esos lugares, sin alterar sus producciones originales.
Tampoco convierte todas las capas, cámaras, decorados o efectos del compositor
2,5D: el traspaso toma el GLB, el audio y el rango para un nuevo plano nativo.

## Revisión local sin backend pesado

Revisión visual: `http://127.0.0.1:8796/`, API ligera en 8798. Las demos anteriores
8788/8792 se conservan. La interfaz es la aplicación real; esta API solo proporciona
archivos y respuestas de arranque para revisión, sin servicios de generación.

En **Estudios → Vídeo 3D → Abrir plano JSON**, cargar:

- `.codex-tmp/speech-review/song-native.world3d.json`
- `.codex-tmp/speech-review/dialogue-native.world3d.json`

El material de revisión está ignorado por Git; no son dependencias del producto.
Prueba reproducible: desde ui, `node scripts/review-speech-productions.mjs`.
Usa Mira y su audio local de demostración; la prueba de “canción” verifica el
recorte y la pista compartida con esa voz, no la precisión de canto con instrumentos.

Verificado con archivos reales: 40 gestos locales en un recorte de 6 s, una
pista de audio cuya comparación antes de codificar da diferencia máxima 0,
dos personajes/3 turnos y recuperación de la misma calibración usando otra URL
de subida. MP4 H.264 1280×720 + AAC 48 kHz, decodificado íntegramente sin errores.

Pruebas: contratos/timing/roundtrip, almacenamiento y revisiones, cancelación,
cambio de workspace, recuperación antes de carga del GLB, entrada desde la canción
y navegación E2E de la aplicación. Esto es QA del implementador: no revisión
independiente, CI remoto, merge ni validación del capítulo completo.

Resultado del checkpoint anterior `60ca05f`: 1.216 tests UI, 57 tests backend de cara/voz, 1 E2E nativo,
compilación y TypeScript, i18n, lint de los componentes afectados y guard de
archivos limpios correctos. Entrada JS: 325.266 B gzip / 327.680 B permitidos.

## Validación de la ampliación (9 de septiembre)

- 1.243 tests UI en la batería completa local y una regresión adicional de
  sustitución de ficha (1.244 tests en total). Los tres E2E nuevos pasan.
  Sumando navegación anterior y
  pantalla multimedia, el recorrido seleccionado da **5 E2E correctos**.
- 63 tests Python de biblioteca, limpieza facial, definición reutilizable,
  perfiles, análisis de voz y Series pasan en la última repetición, incluida
  la importación Historia→Series. Una batería anterior más amplia dio 89.
- La suite Python completa no se pudo recoger: este entorno carece de
  `diffusers` y `safetensors`, requeridos por pruebas de otros modelos.
  No se considera equivalente a CI completo ni se han instalado modelos.
- Revisión real: ficha en disco, dos instancias, A→B→A, Rhubarb real y MP4
  1280×720 H.264 + AAC mono 48 kHz; 6,016 s, decodificación completa sin errores.
- `reusable-mira.world3d.json`, `reusable-dialogue.world3d.json`,
  `personaje-reutilizable-integrado.jpg`, `dialogo-reutilizable-integrado.jpg`,
  `mira-parpadeo.png` y `dialogo-reutilizable.mp4` están en el directorio
  ignorado de revisión. No se ha borrado material anterior.
- Al aplicar una ficha todavía sin calibración, se restablece su apariencia
  predeterminada: no hereda el atlas de otro personaje. Dos actores que usan
  una misma ficha mantienen IDs de instancia distintos y sus propios turnos.
- El control de complejidad pasa contra la base de la PR sin cambiar su
  política. TypeScript, lint y presupuesto de entrada JS: 325.399 B gzip
  de 327.680 B permitidos.

Coste de esta ampliación hasta el checkpoint de corrección: unos 80 minutos
medidos desde 05:16:26 UTC. 0 llamadas LLM externas de la aplicación, 0
generaciones IA y 0 créditos Meshy/Hi3D. Tokens Codex: N/A. Solo análisis
Rhubarb y render local con archivos existentes; el contrato TTS se simula.
CI remoto y revisión independiente se informan separadamente en la PR.

## Coste del checkpoint anterior

- Tests simulados: 0 tokens externos.
- Tests reales: análisis local Rhubarb y exportación local de un MP4; sin proveedores.
- Llamadas LLM externas: 0.
- Tokens de prompt/respuesta/totales de Codex: N/A (no disponibles).
- Generaciones IA de imágenes/audio/vídeo: 0.
- Créditos Meshy/Hi3D: 0.
- Tiempo medido desde el inicio de la implementación: aproximadamente 51 min.
- Proveedores/modelos: ninguno; archivos existentes, Rhubarb y WebCodecs locales.
