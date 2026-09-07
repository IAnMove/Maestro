# Adopción de WanGP 12.72

La integración parte de `development` y adopta componentes del commit
[`362c3467a70e1136ceb52eec95907205a8f88543`](https://github.com/deepbeepmeep/Wan2GP/tree/362c3467a70e1136ceb52eec95907205a8f88543),
posterior al anuncio 12.71. Conserva el motor, la cola, los identificadores de
tareas y las colecciones de HocusPocus. El launcher de Pinokio instala y arranca
la aplicación; las capacidades de generación residen en el WanGP interno.

## Comparación y resultado

| Punto anunciado | Situación de esta base | Integración |
| --- | --- | --- |
| Viggle-Animate | Recast usa SCAIL-2 y su preparación de personas | Preset propio en Editar → Recast, con vídeo y un fotograma editado; conserva la cola Recast existente |
| H3 en dos fases | H3 local tiene una implementación distinta, con políticas y presets propios | Familia `h3_advanced` independiente: FL2VA, Ref2VA y variantes pruned; fases y refinamiento con tiles |
| Inpainting y outpainting H3 | Los controles genéricos no usan todos los códigos nativos nuevos | Panel H3 dedicado con vídeo, máscara, márgenes y máscara por grupos; conserva anclas, inyección y audio |
| Refinamiento de audio | Faltan los controles H3 nuevos | Opciones nativas de refinamiento en el modelo y sus ajustes personalizados |
| Refinador de rostros | No existe el procesador H3 nuevo | Postprocesado y Tools comparten Face Refiner; número de rostros, intensidad y prompt opcional |
| VDN rápido | No existe este preset | Presets full/pruned con módulo VDN y LoRA de sistema resueltos por el cargador interno |
| PDD de 8 pasos | Ya hay PDD y Turbo H3 integrados | Se conservan sus presets; no se añade otra entrada PDD |
| SenseNova U1.5 | No existe la familia | Generación y edición de imágenes, referencias y caché nativa |
| DLSS Neural Rendering y Frame Generation | No existe el puente | Procesadores opcionales con detección de plataforma/runtime; intensidad y escalas publicadas según capacidad |
| Deepy Prime / Qwen3.8 | Ya hay Wizard, llama-server y workflows duraderos | Qwen3.8 opcional, referencias visuales en Wizard y MCP conectado a los servicios existentes |

RIFE mantiene sus rutas ×2/×4 y añade ×3 con tiempos de interpolación en tercios.
×3 requiere RIFE 4.26. Se descarga únicamente el checkpoint seleccionado si falta.

## Viggle

1. Seleccionar Viggle en Recast y elegir el vídeo fuente.
2. Extraer un fotograma hacia Imágenes, editar la apariencia manteniendo pose,
   encuadre y proporciones, y aplicar el resultado de vuelta a Recast. También se
   puede elegir directamente un fotograma ya editado.
3. Elegir resolución y audio y generar.

El preset fija tres pasos, Euler, shift 3 y CFG 1 a 24 FPS. Emplea un prompt
precalculado: el cambio visual se expresa mediante el fotograma. Su panel no
presenta las máscaras/personas de SCAIL. Los clips largos usan ventanas de hasta
124 fotogramas con solape de 18; el padding nativo no amplía la duración solicitada.
La interpolación posterior conserva los extremos de cada intervalo.

Audio «fuente» sustituye el audio del modelo antes de publicar el archivo. Una
fuente sin audio produce vídeo sin pista sonora. Audio «generado» conserva la
salida del modelo. La opción de conservar la fuente no introduce acondicionamiento
sonoro experimental en el modelo Viggle.

Las rutas de entrada distinguen uploads y workspace. Un nombre ambiguo se rechaza.
Los metadatos incluyen modelo, referencia editada, fuente original, recorte y
campos Recast para galería y restauración de ajustes.

## Motor y recursos

El H3 antiguo y el H3 importado no comparten clases de pipeline: mezclar sus
internals rompería firmas, cachés y políticas de memoria. La adaptación nueva
usa el cargador y offload existentes, con un espacio de nombres separado. Las
descargas tienen revisiones fijadas; las rutas de checkpoints y LoRA permiten
reutilizar ficheros existentes. Los mapas affine compatibles con H3 antiguo se
reutilizan después de comprobar tamaño y SHA-256.

Face Refiner recibe audio PCM y offsets acordes a sus ventanas. Su modelo privado
no sustituye el modelo principal ni su perfil global. La detección/tracking añade
`ultralytics==8.4.142` y `ultralytics-thop==2.0.18`; no exige reemplazar Torch,
Transformers ni MMGP de la base.

Los controles de H3 nuevo tienen un único propietario de entradas en la UI. No
se modifica `InputsPanel` ni los paneles de edición en migración paralela. Los
parámetros del postprocesador se validan contra su catálogo, conservan sus valores
en metadatos y no pueden sustituir callbacks o recursos del runtime.

## Wizard y agentes externos

Qwen3.8 27B Q4 y su proyector visual son una opción del selector LLM. Se conserva
el modelo elegido por el usuario. La integración usa llama-server; no implementa
el motor de ejecución Deepy ni su aceleración especulativa MTP. No hay una medida
de velocidad de Qwen3.8 en esta máquina.

Wizard puede adjuntar imágenes o un vídeo al turno. El análisis de vídeo envía
hasta ocho fotogramas repartidos por su duración, con sus tiempos, sin audio.
La preparación conserva el prompt literal y presenta el contenido visual como
datos, sin autoridad para ordenar acciones. Los turnos con adjunto son solo de
análisis: las acciones sugeridas por el modelo no se ejecutan ni contestan una
confirmación pendiente. Para dar instrucciones de edición, se retira el adjunto
y se usa un turno de texto o el cliente MCP. Solo se aceptan URLs canónicas del
catálogo, que se conservan con los tiempos en mensajes y trazas. Un LLM local sin visión rechaza la
entrada visual; no responde fingiendo haberla visto. Los archivos temporales se
eliminan al terminar la llamada.

MCP está desactivado si no se configura `HOCUS_MCP_TOKEN` en el entorno del
servidor. Un cliente compatible con Streamable HTTP puede usar
`/api/v1/wangp/mcp` con cabecera `Authorization: Bearer <token>`; el token no se
guarda en el repositorio. El protocolo implementado es `2025-03-26`.

| Herramientas MCP | Servicio reutilizado |
| --- | --- |
| `models`, `processors` | Catálogos y opciones reales del motor |
| `assets`, `collections` | Catálogo de medios y colecciones Workspace |
| `analyze` | LLM seleccionado, con evidencia visual acotada |
| `organize` | Crear/actualizar una colección de IDs exactos; actualización con revisión esperada |
| `generate`, `recast`, `upscale` | Admisión existente; devuelven IDs de tareas/trabajos |
| `status` | Estado canónico del trabajo devuelto |

Las operaciones con `params` requieren `request_id`. El diario SQLite conserva
la admisión y su respuesta entre reinicios. Un reintento con el mismo contenido
reutiliza el resultado; contenido distinto con el mismo ID se rechaza. Una
admisión de resultado incierto no se repite automáticamente. Las generaciones
externas guardan atribución `external_agent` y conservan el contexto permitido de
proyecto, colección y ejecución. Organizar una colección no mueve ni borra medios.

La ejecución larga continúa apoyándose en los workflows y eventos canónicos del
Wizard, o en un cliente externo que conserva los IDs devueltos. Este cambio no
introduce un segundo scheduler ni un bucle autónomo con acceso al shell.

## Procedencia y límites de validación

El [inventario de fuentes y hashes](../../app/shared/wangp1272/upstream.json)
identifica cada importación y adaptación. Se conserva la
[licencia WanGP 2.0](../../app/licenses/wangp-1272.txt), además de las licencias de
SenseNova y del refinador. Las licencias de código no sustituyen las de los pesos.
La [licencia publicada de Viggle/H3](https://huggingface.co/Viggle/Viggle-Animate/blob/76282703c9e4c52797cdfbd368f699fe5a2a7a36/LICENSE)
excluye UE, Reino Unido, Corea del Sur y EE. UU.; esta integración no demuestra
una autorización adicional para usar esos pesos en España.

DLSS requiere componentes Windows externos; véase [DLSS5](../DLSS5.md).
No se incluyen DLL, ejecutables, checkpoints ni medios de muestra en el commit.

Las pruebas de contrato usan CPU, pipelines pequeños o servicios simulados y
medios sintéticos diminutos. Verifican admisión, referencias, duración, audio,
restauración, parámetros, reintentos y ensamblado. No certifican la calidad de
generación de Viggle/H3/SenseNova, el arranque del GGUF nuevo ni DLSS en Windows.
La validación funcional con pesos reales sigue pendiente y debe registrarse por
modelo y hardware, separada de CI y de revisión de código.
