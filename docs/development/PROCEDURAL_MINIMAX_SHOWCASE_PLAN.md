# Showcase con MiniMax/Wizard y tres canciones reales

Encargo del usuario: 2026-09-06, después de P00-C2 y P00D/primer selector.
Estado local: tres videoclips completos exportados, 36 planos editables, 16 tipos
de escena MiniMax y 24 referencias coral preservadas. La galería de sesión ha
sido sustituida en 43873; aprobación artística de los nuevos resultados pendiente.
Wizard #180 mezclado en development por IAnMove (e465a56e), CI required verde.
Checkpoint previo al PR del visor: código implementado y pruebas locales verdes.
Consultar GitHub para el estado posterior de PR/CI/merge, no inferirlo de este MD.

## Alcance y límites

- Rehacer la galería de sesión en la URL solicitada (puerto 43873), conservando
  los 24 originales coral aprobados y su publicación de referencias v1.
- Personajes elaborados generados por HocusPocus + Ask to the Wizard con MiniMax.
  El usuario autoriza gasto de tokens. No sustituir por imágenes de otro proveedor
  silenciosamente; verificar qué MiniMax es LLM y qué modelo produce las imágenes.
- Tres videoclips completos con las tres canciones reales más recientes de Library.
  Sólo composición procedural, imágenes fijas y efectos implementados; nunca
  inferencia de vídeo H3/MiniMax/LTX ni regeneración de las canciones.
- No reiniciar apps 42003/42004, descargar modelos, cambiar settings globales de
  otros agentes, subir pesos/outputs al historial Git ni hacer release a main.
- Render y montaje seriales. Preservar letra, idioma, audio e identidades fuente.
  Los 30 AN están diseñados, no declarar que todos se han implementado.

## Pasos verificables

- [x] C2 #175 mezclado; plan/anime #176 mezclado; selector #177 mezclado
  por IAnMove en development (2beb1c88), con CI required verde.
- [x] Pinokio confirma HocusPocus activo: Maestro-next.git, listo. No arrancar
  otra instancia del backend ni usar el benchmark de H3.
- [x] Library devuelve las tres últimas canciones canónicas/reales en default:
  - asset_6912759921f746c6bf73b7bd24a80f74 — “Atardecer sobre la colina…”, ACE-Step.
  - asset_f5e0d1789b384ab6831a4b1e4693264c — “I crossed the Shire…”, MiniMax-Music3.
  - asset_f85ef3d27fa845928151dfffe369a6cc — “The screen says zero…”, ACE-Step.
  Son identificadores de fuente, no títulos nuevos ni renombrados.
- [x] Obtener metadata completa, duración y audio original; verificar que son
  canciones completas, no simulaciones, stems, speech ni versiones duplicadas.
  Duraciones observadas: 90 s, 104.083447 s y 120 s. WAV originales con hashes
  y manifests en el directorio de evidencia, fuera de Git. Las letras mixtas
  de los dos últimos ya estaban en las fuentes; se conservan literalmente.
- [x] Inspeccionar interfaz/API real de Wizard y MiniMax. Guardar conversación
  y decisiones auténticas, sin fabricar mensajes como si procedieran del Wizard.
- [x] Brief de personajes/inventarios por canción mediante Wizard y prompts
  técnicos de fondos. El operador dirigió cortes/encuadres a partir del análisis
  CPU; no atribuir al Wizard la dirección íntegra de los montajes. Letras y texto
  original permanecen en su idioma; no se regeneró ninguna canción.
- [x] Probar primero un personaje y un fondo mediante HocusPocus/MiniMax; evaluar
  calidad, resolución, padding, rostro y alpha. Si no hay transparencia real,
  declarar el límite y usar una extracción explícita compatible con la carga actual.
- [x] Generar assets restantes con referencias coherentes. Límite operativo:
  máximo dos reintentos razonados por asset, no bucles de gasto por fallo repetido.
- [x] Conservar assetId/provider/model/task/prompt/reference/hash de cada salida.
  El cliente reutilizable recibe URL/workspace/IDs como argumentos, nunca claves.
- [x] Crear escenas editables con encuadres de cintura hacia arriba o close-ups,
  sin pies deslizándose ni labios/ojos añadidos sobre rasgos ya pintados.
- [x] Rehacer galería con nueva variante identificada y acceso a originales.
  Snapshot exacto por clip, no recompilar la versión actual y llamarla original.
- [x] Renderizar piloto corto antes de escalar; verificar ffprobe y frames.
- [x] Montar tres videoclips de duración completa respetando las canciones fuente,
  ritmo y legibilidad. Repartir los efectos con intención, no apilarlos todos a la vez.
- [x] Guardar configuración de planos/montaje y lineage hacia audio e imágenes;
  ofrecer abrir/ajustar los planos y preservar outputs fuera de Git.
- [x] Validar duración/FPS/dimensiones/audio, cortes, frames negros, encuadre,
  clipping, repetición excesiva y consistencia del personaje a lo largo de cada clip.
  Comprobación técnica automatizada y revisión de frames representativos;
  revisión artística completa por el usuario pendiente, no certificación de calidad.
- [x] Entregar URLs de galería + tres MP4, listado de límites observados y
  evidencia; aprobación visual de nuevos resultados pendiente del usuario.

## Reanudación de esta sesión

Worktree aislado: /tmp/hocus-minimax-showcase.z35rpR, rama
work/procedural-showcase-gallery (anterior: work/procedural-minimax-showcase).
Estas rutas son evidencia de sesión, no scripts
portables. Leer primero AGENTS y el roadmap. La herramienta de app existente está
en pinokio_agent/skills/api/Maestro-next.git; su cliente CDP es genérico.
Usar Pinokio para descubrir base URL actual antes de API, no asumir puertos.

Originales intactos: /tmp/hocus-template-review.o8H5is/previews/ y publicación
procedural-style-reference-v1. Nuevos outputs serán versiones hermanas fuera de Git.

## Concurrencia y límites detectados durante la ejecución

Se creó `procedural-showcase-v2` mediante API sin activarlo globalmente; el servidor
sigue en `default`. La UI stock cambia un singleton al seleccionar workspace.
La UI de prueba de esta sesión usa componentes reales desde este worktree, con
contexto Zustand explícito sólo en ese navegador. Su guard bloquea mutaciones de
settings/workspace global, inferencia local y vídeo IA; sólo permite peticiones
del Wizard y Story Lab dirigidas al workspace nuevo y MiniMax Image-01 remoto.
No es una nueva función de aislamiento ya publicada en producto.

MiniMax chat está configurado y hay clave de Image-01 (sólo booleanos comprobados).
Image-01 produce JPG opaco; su manifiesto no guarda actualmente la identidad de
la referencia como parent. Mantener evidencia externa de requests/references.
El capturador público de escenas admite MP4/WebM; el sandbox C2 es más restrictivo
y no debe emplearse como si fuese el backend de montaje de canciones completas.

Evidencia de sesión: `/tmp/hocus-minimax-media.CF3dwI`. El cliente de descarga
portable está en `pinokio_agent/skills/api/Maestro-next.git/clients/asset_snapshot.mjs`.

### Hallazgos y decisiones verificadas durante el piloto

- El reconciliador convertía una petición explícita de Story/MiniMax en
  Studio/Flux o la anulaba por una prohibición de otro medio. El navegador
  bloqueó el intento local; no se ejecutó Flux. Corrección local y regresiones
  acotadas en revisión, todavía no mezcladas.
- Las respuestas antiguas de MiniMax omiten workspace en source/thumbnail.
  La corrección local utiliza el workspace del job, también al recuperar.
- Las referencias de personajes de Story Lab fuerzan un retrato de identidad;
  no equivale a un recorte de cintura ni a un personaje articulado.
- Un estilo demasiado largo puede truncar el contenido técnico, y el estilo de
  personaje puede contaminar fondos. Los dos fondos piloto con personas se
  conservan como evidencia rechazada, no como plates válidos. Para los fondos
  finales el Wizard redacta prompts separados en inglés y el operador los envía
  literalmente a la API pública de HocusPocus, con 16:9 explícito. Distinguir esta
  ejecución del operador de una acción ejecutada por el Wizard.
- El tercer inventario contenía nombres duplicados. La guarda de ambigüedad
  impidió generar. El operador renombró los duplicados del borrador propio como
  variantes sin eliminar entidades y volvió a pedir el personaje al Wizard.
- El exportador actual no admite soundtrack de otro workspace. Se crearon
  copias byte a byte mediante Upload; los tres SHA coinciden con los originales.
  No se movió ningún audio. Análisis público con transcribe=false y
  extract_vocals=false: 117.5, 86.1 y 99.4 BPM estimados. Downbeats heurísticos,
  no compases garantizados ni alineación fonética.

### Resultados locales de composición

- Audio fuente: 90 / 104.083447 / 120 s. MP4 H.264 final: 90.023 / 104.133 /
  120.027 s, 1280×720, 30 FPS, soundtrack AAC. Los WAV/copias conservan SHA;
  el audio del contenedor MP4 está recodificado, no es byte-idéntico al WAV.
- El mixer instalado normaliza dos pistas (una muda). Se compensó con volumen
  de soundtrack 2, dentro del contrato público, sin modificar backend ni WAV.
  Diferencias RMS observadas frente a fuente: −0.074 / −0.058 / −0.043 dB.
  Blackdetect no encontró intervalos negros de al menos 150 ms al umbral usado;
  esto no sustituye ver la película ni aprobar dirección/arte.
- Nara, Orin y Vega usan un retrato fuente cada uno. Se mantienen idénticos por
  reutilización de la imagen, no por un character kit multivista/articulado.
  Primeros planos y recortes ocultan el borde inferior; no hay walking ni lip-sync.
- 16 tipos de plano de cine/videoclip, 14 atmósferas existentes, cámara/paralaje,
  keyframes sobre beats estimados, color y un overlay procedural de final.
  No son las 50 escenas/filtros ni los 30 AN propuestos en el roadmap.
- Paquete de sesión fuera de Git: `showcase-package-HOLHdy` dentro del directorio
  de evidencia, con 3 montajes, 36 snapshots de planos, 16 previews representativas,
  7 inputs raster, hashes y provenance. `edit-plan.json` conserva el montaje;
  el botón del visor abre planos individuales, no un proyecto final de timeline.
- URL de revisión: http://192.168.1.87:43873/scene-template-review.
  LAN es sólo lectura; para verificar SHA en navegador y guardar ajustes usar
  http://127.0.0.1:43873/scene-template-review en la máquina anfitriona.
  La galería es un servicio de sesión temporal, no persistencia tras reinicio.
- Sólo se detuvo el proceso anterior de esta galería; apps 42003/42004 y medios
  originales permanecieron intactos. El script portable `--showcase-dir` permite
  volver a servir el paquete en un directorio temporal nuevo.
- Prueba de navegador real: reproducción de los 3 montajes, Range HTTP de las
  24 referencias, apertura exacta del plano de Nara, cambio de bokeh a lluvia y
  guardado de la escena editada en el sandbox. Cero errores JavaScript en ese
  recorrido. La URL LAN rechaza POST (403); ningún generador se invocó en él.
