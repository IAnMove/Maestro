# MiniMax H3: revisión de Maestro y adopción en Hocuspocus

> Informe inicial conservado como evidencia de la investigación. Para la implementación posterior y las pruebas reales, consultar [H3_IMPLEMENTATION_NOTES.md](H3_IMPLEMENTATION_NOTES.md) y [H3_BENCHMARK_2026-09-06.md](H3_BENCHMARK_2026-09-06.md).

Fecha: 5 de septiembre de 2026. Estado: análisis de código y fuentes completado; implementación y pruebas audiovisuales pendientes.

## Alcance y evidencia

El objetivo es reproducir las mejoras útiles de Maestro dentro de la arquitectura actual de Hocuspocus, sin importar commits ni sustituir módulos completos. Grok podría estar trabajando en main: este informe es un archivo nuevo y no modifica runtime, UI, launchers ni los documentos de fases compartidos.

Se compararon copias independientes de:

- Maestro: `a5dddd4faa53e8fa8d76ef528c1074935eded8c0`.
- Hocuspocus main: `43f75b907f3cf1134747ac09dc5ce5e6ba266900`.
- Checkout local: `93287183d0e8e8b04538fd91bf4605d613d2e89f`.

Se comprobaron primero `logs/api/start.js/latest` y `logs/shell/latest`. No aportan un experimento controlado que permita confirmar la calidad anunciada. No se han generado vídeos, descargado pesos ni medido velocidad en esta revisión.

Checklist previo: AGENTS releído; aplican conservación del trabajo existente, revisión de logs, documentación y verificación. PINOKIO_HOME resuelto desde config a `/home/ina/pinokio`; proyecto existente `/home/ina/pinokio/api/Maestro-next.git`. Referencia de launcher consultada: `/home/ina/pinokio/prototype/system/examples/mochi/start.js`, líneas 21–39. No se modifica ningún launcher; captura de URL, instalación y menú no aplican a esta entrega documental. Si se tocaran después, prevalece el patrón de captura `input.event[1]` exigido por el usuario, aunque ese ejemplo local antiguo use índice 0.

## 1. Qué modelos utilizan realmente

Hay tres capas diferentes. Confundirlas conduce a probar combinaciones que no reproducen el resultado.

| Capa | Maestro observado | Consecuencia |
|---|---|---|
| Red generadora de vídeo y audio | H3 FL2VA y Ref2VA, Pruned 20B y Full 33B | Frames y References requieren condicionamiento distinto |
| Codificador de texto e imágenes de H3 | Qwen3-VL-32B, representación de capa 50; varias cuantizaciones | No lo sustituye el LLM elegido para mejorar prompts |
| LLM de escritura y planificación | Por defecto `Abhiray/gemma-4-E4B-it-heretic-GGUF`, Q4_K_M; catálogo con Gemma y Qwen mayores, incluidos Qwen3.6/3.8 27B | El usuario puede elegir otro; el repositorio no revela qué LLM empleó el autor en una demo concreta |

En el camino estructurado H3, Maestro desactiva thinking. Creative designa permiso para escribir y desarrollar la escena; no implica usar otro checkpoint H3 ni habilitar razonamiento en todas las llamadas. La planificación larga hace varias pasadas con JSON y temperaturas diferenciadas.

Fuentes de código: [handler](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/models/minimax_h3/minimax_h3_handler.py), [conditioner](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/models/minimax_h3/conditioner.py), [servicio LLM](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/services/llm_service.py).

## 2. Qué significa «muy rápido»

| Receta | Configuración observada | Hocuspocus main |
|---|---|---|
| Turbo anterior LarryVRH v1-500 | 6 evaluaciones, fuerza 0.50 | Es nuestro preset actual |
| LarryVRH v4-600 EMA | 6 evaluaciones, fuerza 1.0 | Falta el selector de esta variante |
| Alibaba PAI FL2VA Acc | Adaptador específico, 8 evaluaciones, fuerza 1.0, PDD | No integrado |
| Alibaba PAI Ref2VA Acc | Adaptador específico, 8 evaluaciones, fuerza 1.0, PDD | No integrado |
| MATLOWAI Fused | Un checkpoint INT8 ConvRot de unos 21 GB; 4 evaluaciones por defecto | No integrado |

Los presets actuales por defecto de Maestro son los dos Alibaba, según workflow. No basta con añadir sus nombres al catálogo: PDD contiene cabezas de salida de vídeo y audio por intervalo, además de los pesos LoRA. Su receta agrupa 32 intervalos en ocho evaluaciones y debe alinear las cabezas con los sigmas reales. Cargarlo como un LoRA convencional de ocho pasos no reproduce esa inferencia.

El Fused combina base FL2VA pruned, delta Ref2VA rank-1024, LightX2V Turbo y Mystic. Maestro fuerza `res_multistep`, shifts vídeo/audio 12/3, sin CFG efectivo y desactiva otras aceleraciones incompatibles. Expone 4–8 evaluaciones y evita acumular otro Turbo sobre pesos ya fusionados. SLA se ofrece con protección del prefijo de condicionamiento/audio y fallback denso.

La ficha MATLOWAI publica 76 segundos para 10 segundos de vídeo a 1152×640, cuatro pasos y SLA, en RTX PRO 6000 de 96 GB. Es evidencia del autor para esa receta y hardware, no una expectativa para nuestra máquina. La propia mezcla incorpora un sesgo de estilo/movimiento que hay que evaluar con personajes conocidos.

Fuentes: [manifest de presets](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/models/minimax_h3/turbo_presets.json), [implementación PDD](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/models/minimax_h3/pdd.py), [Alibaba PAI](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs), [MATLOWAI](https://huggingface.co/MATLOWAI/minimax-h3-fused-turbo-int8-convrot).

**Corrección de nuestra documentación histórica:** `minimax-h3-fast-runtime-research.md` describe un estado anterior. Main ya conecta H3 con la atención compartida Sage/SDPA y dispone de First Block Cache. No hay que contabilizarlos como mejoras nuevas. Sí faltan la integración H3 de Sol/SLA, los presets actuales y PDD. Sol, SLA y First Block Cache son mecanismos distintos; no multiplicar sus aceleraciones ni activarlos todos para una primera comparación.

## 3. Faithful, Creative y palabras ininteligibles

En una ventana, `planning_style` modifica las instrucciones del enhancer. En secuencias, Maestro construye un registro estructurado de historia y diálogo antes de redactar los prompts locales.

- **Faithful:** preserva hechos, identidades y frases suministradas; con diálogo literal bloqueado usa una programación determinista y deja al LLM desarrollar puesta en escena.
- **Creative:** admite progresión y diálogo adicional con contenido concreto. Conserva las frases literales como anclas y respeta peticiones de silencio o de usar exclusivamente las frases suministradas.
- El registro vincula frases, eventos, personajes y ventanas; el compilador conserva esa propiedad al producir cada prompt. Se validan resultados y se intenta reparar los que incumplen el contrato.
- El render asigna identificadores de hablante según orden vocal, mantiene la identidad de cada voz y evita que otro personaje repita o interprete la misma frase. La referencia de voz aporta timbre/interpretación, sin pedir que copie ruido o acústica de origen.

Esto es sustancialmente más que un prompt que diga «sin gibberish». Al pedir «conversan» sin escribir qué dicen, se deja al generador resolver una actuación vocal ambigua. Maestro intenta convertirla en diálogo explícito, ajustar su duración y reservar el resto para acciones no verbales. Su guía orienta a unas dos palabras por segundo entre todos los hablantes; es una heurística, no un límite universal para español u otros idiomas.

Hocuspocus ya tiene etiquetas `<d>[Idioma] texto</d>`, validación/reintento del enhancer, reglas de fidelidad, un compilador de diálogo propio y planificación por ventanas. Lo que falta es separar explícitamente los modos y adoptar selectivamente la planificación global y la propiedad de frases que aporten garantías adicionales. Reemplazar nuestro compilador entero perdería correcciones locales.

**Diferencia crítica:** Hocuspocus fuerza temporalmente `overall_soundscape: N/A` y `non_diegetic_music: N/A`, y elimina descripciones acústicas mediante `apply_h3_no_sound_description`. Maestro describe ambientes y efectos, delimita intervalos de voz/silencio y pide cerrar la boca al terminar. Copiar sólo su guía dejaría instrucciones incompatibles con nuestro saneador. Hay que ensayar ambas políticas como alternativas coherentes de extremo a extremo, preservando la actual como control.

No se ha encontrado en estos mecanismos una prueba perceptual controlada que demuestre «eliminación» del balbuceo. Los tests de texto comprueban contratos; no oyen el vídeo. ASR puede ayudar a medir frases erróneas, pero puede omitir balbuceos o inventar transcripciones. La aceptación necesita escucha.

Fuentes: [registro de historia](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/services/h3_story_ledger.py), [planificador de ventanas](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/services/h3_window_planner.py), [guía H3](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/services/llm_guides/enhance/minimax_h3_video.md), [formato oficial](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md).

## 4. Películas y series

Separar tres peticiones:

1. **Nombre en texto:** «personaje X, interpretación Y, serie Z». Depende del conocimiento aprendido y de su traducción visual. No equivale a cargar una referencia ni garantiza parecido.
2. **Imagen:** un fotograma inicial fija composición inicial; Ref2VA puede tomar imágenes como referencias de identidad/vestuario sin convertirlas automáticamente en primer fotograma.
3. **Vídeo o audio:** condicionan movimiento, voz o reutilización de una actuación según el contrato de referencia. La identidad visual y la voz se asignan explícitamente.

Las reglas de Maestro conservan adaptación, actor, época, prendas y poderes establecidos. Estas reglas ya existen en la guía H3 de Hocuspocus. Por tanto, no son una nueva capacidad pendiente de importar.

Inferencia a comprobar: si una variante rápida falla donde H3 normal funciona, el problema puede ser el adaptador antiguo, la combinación incorrecta FL2VA/Ref2VA, cuantización del conditioner, o degradación de identidad por destilación. Si cambia el prompt efectivo o el material de referencia entre pruebas, no se puede atribuir el fallo al número de pasos. Tampoco hay evidencia suficiente para explicar retrospectivamente las pruebas del usuario sin sus ajustes y resultados concretos.

## 5. Qué no copiar

- Promesas de ausencia total de palabras ininteligibles o de igualdad perceptual sin pruebas locales.
- El supuesto límite duro de 480 tokens de la guía upstream. Su propio `h3_prompt_budget.py` declara que no existe ese límite publicado, usa un objetivo de calidad de 1024 y conserva texto protegido; `conditioner.py` tokeniza sin truncarlo a 480. Es una contradicción real del árbol observado.
- Guías que a la vez prohíben añadir frases y ordenan añadir intercambios implícitos, sin resolver qué modo tiene precedencia.
- Nuevos modelos LLM como requisito universal: primero evaluar nuestro proveedor configurado con el mismo contrato.
- Activar por defecto sparse attention, caching y distilación juntos. Impide localizar regresiones de audio o identidad.

Fuente del presupuesto: [h3_prompt_budget.py](https://github.com/Blizaine/Maestro/blob/a5dddd4faa53e8fa8d76ef528c1074935eded8c0/app/services/h3_prompt_budget.py).

## 6. Paquetes para incorporar a la revisión

Estos paquetes concretan la adopción selectiva de Maestro mencionada en F12.8. No renumeran ni amplían silenciosamente las fases musicales 1–12. Antes de implementar, volver a consultar main y ownership con el trabajo de Grok; los módulos de enlace son compartidos.

### H3-A — Contrato de escritura y diálogo

- [ ] Añadir `faithful` / `creative` en petición, UI y estado persistido del plan. Mantener el significado separado del checkpoint y de los pasos.
- [ ] Diseñar un registro pequeño con frase original, idioma, hablante, evento, ventana e intervalo; proteger texto literal y señalar diálogos que no caben, sin recortarlos silenciosamente.
- [ ] Aplicar el mismo contrato a una ventana y a múltiples ventanas; repetir identidad y contexto con reloj local, sin repetir frases salvo petición expresa.
- [ ] Incluir modo, referencias e inputs efectivos en firma de caché y snapshot para que generación no reutilice ni reemplace un plan incompatible.
- [ ] Política explícita para silencio y para «sólo estas frases»; Creative no las anula. Separar texto visible de texto hablado.
- [ ] Cablear sobre `app/routers/llm.py`, `llm_service`, `h3_window_planner`, compilador H3 y `llmSlice`; no copiar el enorme ledger upstream como nueva dependencia monolítica.
- [ ] Tests con respuestas falsas incorrectas: omisiones, duplicados, hablante cambiado, idioma incorrecto, cartel confundido con diálogo, duración insuficiente, fallback y plan obsoleto. UI→API→plan→generación, incluida recarga.

### H3-B — Política de sonido comparada

- [ ] Conservar la política actual como opción de control; añadir política de ambiente/efectos explícitos sin instrucciones contradictorias en enhancer, compilador y runtime.
- [ ] Registrar política y prompt efectivo en el resultado. No borrar audio solicitado sin que quede visible.
- [ ] Promover sólo después de escuchar resultados controlados. Un texto bien formado no demuestra calidad de audio.

### H3-C — Presets rápidos reproducibles

- [ ] Selector versionado: conservar Larry v1, añadir v4 como comparación y recetas PDD específicas para FL2VA/Ref2VA.
- [ ] Implementar mapeo PDD, cabezas vídeo/audio, pesos por intervalo y restauración de módulos después de cancelación, fallo o cambio de modelo. Verificar contra inferencia de referencia de Alibaba.
- [ ] Fijar revisión, hash, tamaño y workflow de cada asset; impedir mezcla accidental de aceleradores. PDD no se etiqueta disponible sólo por descargar su LoRA.
- [ ] Fused 4-step como ruta experimental independiente, con carga ConvRot correcta, solver/shifts adecuados y restricciones de LoRA visibles.
- [ ] Probar primero atención densa; incorporar SLA protegido y fallback en otro cambio. Sol queda en comparación separada, sin actualizar indiscriminadamente el entorno funcional.
- [ ] Contabilizar carga/codificación, muestreo y decodificación por separado; RAM/VRAM y cold/warm. Mantener la receta antigua seleccionable.

### H3-D — Aceptación audiovisual

Corpus mínimo común: personaje conocido sólo por nombre; mismo personaje con imagen; dos personajes con dos frases españolas exactas; conversación sin guion; personaje conocido actuando sin hablar; narrador fuera de cámara; secuencia de dos ventanas con una frase cerca de la unión; References con identidad visual y voz distintas.

Primero comparar prompts/políticas sobre una receta fija; después comparar recetas con el mismo prompt efectivo. Usar al menos tres semillas por caso. La semilla común no hace equivalentes dos samplers, pero reduce cambios arbitrarios del protocolo. Mantener duración, resolución y referencias idénticas; registrar toda excepción.

Medir: frases conservadas y repetidas, palabras no solicitadas, intervalos vocales fuera de guion, hablante correcto, idioma, sincronía labial, identidad/vestuario, continuidad, movimientos anómalos y tiempo/memoria. ASR + VAD son apoyo; revisión audiovisual ciega decide casos dudosos. Comparar speedup sólo con la calidad aceptada y el mismo hardware.

Criterios previos: cero cambios de las frases literales en el prompt compilado; cero colisiones de referencias/planes en tests; ninguna nueva variante declarada recomendada hasta que la escucha y valoración de identidad no empeoren frente al control. Si una receta gana velocidad pero falla con franquicias, puede quedar como preview, no como sustituto universal. Guardar resultados negativos también.

## Cierre

Recomendación: adoptar primero contrato y registro de diálogo, comparar las políticas acústicas, incorporar PDD completo y evaluar Fused/SLA después. La mejora más prometedora de fidelidad es controlar qué se dice, quién lo dice y cuándo; la mejora de velocidad pertenece a otra capa y debe validarse por separado.

Checklist de salida: fuentes y revisiones identificadas; comparación repetida contra main; documentación histórica corregida mediante esta nota; mejoras ya presentes diferenciadas de las pendientes; ningún cambio en launchers ni módulos compartidos; no se presenta una prueba de software como prueba perceptual. Implementación, benchmarks y promoción de presets siguen pendientes.
