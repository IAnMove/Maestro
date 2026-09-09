# Auditoría de aplicación — 8 de septiembre de 2026

Base de implementación: `92c95500` de `development`. Los medios, conversaciones
y trazas de ejecución se conservan fuera de Git, en
`outputs/app-acceptance-20260908`. El índice generado enlaza todos los intentos,
incluidos los fallidos; no convierte una repetición posterior en éxito histórico.

## Qué se ha observado

| Caso | Evidencia y alcance |
| --- | --- |
| Inventario de interfaz | 52 destinos y submodos con captura individual; última pasada sin errores de página. Incluye móvil de 390 × 844. |
| Imagen nativa | Flux 2 Klein 9B real; tarea canónica completada, JPG descargado, identidad y metadatos reales. |
| Upscale | La imagen anterior ampliada con Lanczos ×2; dimensiones decodificadas exactamente dobles. |
| Música nativa | ACE-Step 1.5 XL SFT LM 4B real; WAV de 30 segundos, duración comprobada en navegador y decodificación completa con FFmpeg. |
| Wizard: idiomas | Conversación francesa, dirección técnica inglesa y frase española literal comprobadas por separado. |
| Wizard: carpetas | Crea y selecciona dos carpetas propias; la carpeta global del servidor se conserva. La selección está virtualizada en el navegador de pruebas. |
| Wizard: cómic | Tres páginas, cuatro viñetas por página y doce imágenes generadas con Flux 2 Klein 9B. JSON y PDF descargados; PDF de tres páginas inspeccionado. |
| Wizard: Series | Creación de serie y episodio guardados. La prueba ampliada exige personajes, lugares, premisa, outline y cuatro planos persistidos. Consultar el último intento del informe para su resultado. |
| Video 3D | Siete vídeos Gandalf conservados fuera de Git y PR #257 independiente. La entrega V3 incluye 33 clips y coche. No es evidencia de generación mediante el Wizard. |

## Fallos y límites encontrados

- **Corregido en este cambio:** el endpoint `tools_upscale` ocultaba al módulo
  Python del mismo nombre. El worker fallaba antes de adquirir su turno. Se
  diferencia el alias del servicio y se comprueba el contrato después de definir
  la ruta real.
- **Corregido:** una cabecera cancelada de FIFO podía bloquear los trabajos
  siguientes si su worker ya había muerto. Un sucesor retira ese ticket cancelado;
  la prueba mantiene un worker ausente y exige que el sucesor adquiera su turno.
- **Corregido:** las utilidades de navegación dejaban sin anchura la fila de
  categorías en móvil. Ahora ocupan una fila distinta en pantallas estrechas.
- **Corregido en el test:** esperar las preferencias del modelo antes de fijar
  duración y leer de nuevo ante una desconexión breve. La primera música llegó a
  completarse aunque el observador había fallado; ese intento sigue marcado como
  fallido. Sólo se reintentan GET, nunca la generación.
- **Pendiente de producto:** crear un episodio no genera sus planos. Generar y
  aplicar el plan en una única respuesta del Wizard intenta aplicar antes de que
  termine el trabajo. El flujo de prueba espera la tarea y aplica su ID en un
  turno posterior; no se acredita encadenamiento automático.
- **Pendiente de producto:** Comics save/history resuelven la carpeta global.
  La primera prueba del cómic dejó un checkpoint en `default` del backend QA
  aislado, sin tocar la app original. El guard ahora excluye estas escrituras.
  JSON/PDF se descargan desde el navegador; el guardado/historial en servidor
  queda fuera de la certificación de esta suite.
- **Calidad del cómic:** la página inspeccionada presenta cambios de vestuario
  y rasgos entre viñetas. Que existan doce imágenes no acredita continuidad de
  personaje. Conviene fijar una referencia visual y evaluar cada panel.
- **H3 real:** una prueba anterior fue interrumpida por `systemd-oomd` durante la
  decodificación, sin MP4 final. No se presenta como generación aprobada ni se
  reanuda automáticamente. El muestreo terminado no garantiza archivo publicado.

## Lo que esta entrega no certifica

Cada captura documenta acceso y controles visibles. No certifica cada modelo,
proveedor, parámetro, exportador ni todas las combinaciones de entradas. Las
preferencias globales, gestión de pesos, borrado y recuperación global se
excluyen de los tests en una sesión compartida. Las acciones de Wizard del
manual se distinguen como registradas, parciales o manuales; sólo una traza con
resultado observado acredita su ejecución.

Para continuar: cubrir por separado voz/SFX, edición de vídeo y máscaras,
generación de GLB, Character Kit, montaje de Director y guardado entre carpetas.
Empezar con `simulate` para la orquestación y ejecutar después una combinación
real acotada por familia, conservando consumo, identidad y archivo decodificado.

Consulte [la guía de uso](APP_USER_GUIDE.md) y
[el ejecutor nocturno](WIZARD_ACCEPTANCE_TESTING.md).
