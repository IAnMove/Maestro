# Lip-sync 3D desde canciones, capítulos y tráileres

## Rama y alcance

- Rama de trabajo: `codex/3d-speech-productions`.
- Base explícita: `codex/3d-lipsync-scenes`, checkpoint `dedd3ee`.
- No incluye los cambios posteriores de development ni modifica ese checkout.
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

Se usan archivos existentes o subidos por el usuario. Ninguna entrada genera
modelos, voces, imágenes o vídeo mediante proveedores.

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
palabras. El texto se conserva literalmente como referencia; no genera una voz.

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

Resultado final: 1.216 tests UI, 57 tests backend de cara/voz, 1 E2E nativo,
compilación y TypeScript, i18n, lint de los componentes afectados y guard de
archivos limpios correctos. Entrada JS: 325.266 B gzip / 327.680 B permitidos.

## Coste de la tarea

- Tests simulados: 0 tokens externos.
- Tests reales: análisis local Rhubarb y exportación local de un MP4; sin proveedores.
- Llamadas LLM externas: 0.
- Tokens de prompt/respuesta/totales de Codex: N/A (no disponibles).
- Generaciones IA de imágenes/audio/vídeo: 0.
- Créditos Meshy/Hi3D: 0.
- Tiempo medido desde el inicio de la implementación: aproximadamente 51 min.
- Proveedores/modelos: ninguno; archivos existentes, Rhubarb y WebCodecs locales.
