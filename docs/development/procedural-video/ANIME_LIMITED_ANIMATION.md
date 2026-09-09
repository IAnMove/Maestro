# Bloque AN — Animación limitada expresiva con imágenes fijas

Estado: **diseñado, no implementado como bloque**. Encargo del usuario, 2026-09-06.
30 técnicas/recetas prioritarias; reutilizan cámara, composición y efectos del
roadmap. No cuentan como otras 30 prestaciones ya disponibles ni se suman
automáticamente al objetivo de 50 filtros o 50 escenas distintas.

## Qué queremos conseguir

Un personaje puede sostener una pose muy expresiva mientras el fondo, la cámara,
el montaje y los efectos comunican velocidad, tensión, poder o sorpresa. No es
necesario animar cada articulación para construir ese plano. Tampoco convierte
una imagen quieta en un personaje capaz de caminar, girarse o hablar correctamente.

Primero plano medio/medio corto: evita que unas piernas inmóviles contradigan la
acción. Cuerpo entero para poses sostenidas, vuelo o flotación explícitos; no para
simular marcha deslizando un recorte por el suelo. Un plano H3 con referencia de
personaje puede cubrir actuación corporal, pero sólo con permiso explícito y
fuera de las pruebas pesadas actuales.

La nomenclatura siguiente es funcional para HocusPocus, no una clasificación
académica ni técnicas exclusivas del anime. Como base verificable, el manual de
CLIP STUDIO documenta líneas de velocidad paralelas y líneas de concentración:
[Speed lines and Focus lines](https://help.clip-studio.com/en-us/manual_en/540_comic/Speed_lines_and_Focus_lines.htm).
Su tutorial oficial distingue dibujos clave/poses del trabajo de intercalación;
nuestro compositor no debe afirmar que inventa esos dibujos intermedios:
[Inbetweening basics](https://tips.clip-studio.com/en-us/articles/954).

## Requisitos de entrada

- **R0:** una imagen completa. Sólo efectos sobre el plano, recortes y cámara;
  no se puede mover el fondo detrás de un personaje que siga pegado a él.
- **R1:** personaje con alpha y fondo separados. Si hay máscara imperfecta,
  mostrarla sobre damero y corregirla antes de exportar, sin generación automática.
- **R2:** R1 + anclas editables (cabeza, ojos, cintura, manos o punto de energía).
  Son coordenadas de composición, no detección anatómica infalible.
- **R3:** dos o más poses/expresiones/vistas coherentes del mismo personaje.
  Preparadas explícitamente y con assetId/characterId; no inventadas por interpolación.

Cada receta declara lo que falta. Los controles no soportados permanecen visibles,
deshabilitados y con motivo. Un efecto alrededor de los ojos no sustituye los ojos
originales ni añade una segunda boca: las expresiones nuevas requieren otro asset.

## Catálogo de técnicas

### AN1 — Velocidad aparente sin caminar

| ID | Técnica | Entrada | Mecanismo y uso | Límite / prueba visual |
|---|---|---|---|---|
| AN-01 | Líneas de velocidad direccionales | R1 | Trazos paralelos fluyen detrás de una pose de esfuerzo; dirección y velocidad con curva temporal. | No cubrir cara/manos; no anunciar locomoción. |
| AN-02 | Líneas de concentración radial | R1 | Rayos convergen a una ancla: revelación, grito, determinación o ataque preparado. | Centro no vibra ni cruza ojos; densidad acotada. |
| AN-03 | Fondo desplazado en bucle | R1 | Entorno se desplaza mientras el personaje permanece fijo; vuelo, vehículo o caída estilizada. | Uniones del fondo invisibles; no usar para caminar sin ciclo. |
| AN-04 | Multiplano rápido | R1 + varias placas | Fondo lejano lento, elementos cercanos rápidos y sujeto estable. | Parallax auténtico de capas, no reclamar profundidad 3D compartida. |
| AN-05 | Barrido y estiramiento del fondo | R1 | Blur direccional/smear sólo del entorno; rostro y silueta permanecen nítidos. | No deformar anatomía ni contaminar alpha; mismo resultado en export. |
| AN-06 | Estelas y afterimages | R1 | Copias semitransparentes desplazadas a lo largo de una trayectoria, con decaimiento temporal. | Pocas copias; separar recurso estilizado de duplicados accidentales de cara. |
| AN-07 | Dash oculto por barrido | R1 | Anticipación breve → banda de oclusión → reaparición del recorte en destino. | No mostrar deslizamiento de pies; no genera transición entre poses. |
| AN-08 | Aceleración del mundo, pose sostenida | R1 | Receta temporal que aumenta flujo de fondo/líneas y luego corta a una calma brusca. | Reutiliza AN-01/03: no contabilizar como otro filtro de líneas. |

### AN2 — Energía, golpes y tensión

| ID | Técnica | Entrada | Mecanismo y uso | Límite / prueba visual |
|---|---|---|---|---|
| AN-09 | Electricidad alrededor de la silueta | R1/R2 | Arcos segmentados con semilla y anclas, delante/detrás del personaje. | Cambios acotados; sin flashes repetitivos; no dibujar rayos sobre la cara por defecto. |
| AN-10 | Aura de contorno | R1 | Dilatación suave de alpha, halo y contorno animado alrededor del recorte. | No rectángulo brillante alrededor del PNG; bordes limpios sobre fondos claros/oscuros. |
| AN-11 | Columna de energía ascendente | R1 | Bandas, partículas y viento visual suben detrás de una pose de carga. | Pies/cintura permanecen quietos; no afirmar que el pelo se mueve. |
| AN-12 | Onda de choque | R2 | Anillo elíptico expandido desde una mano/suelo, con atenuación y paso por capas. | Ancla explícita; oclusión manual, no simulación física. |
| AN-13 | Polvo y fragmentos de impacto | R1/R2 | Emisión corta de partículas, pequeña pausa y caída/dispersión determinista. | Sin partículas naciendo dentro de ojos/boca; presupuesto de instancias. |
| AN-14 | Arco de ataque y destello de filo | R2 | Trazo curvo cruza desde mano/objeto mientras se sostiene una pose final. | Comunica un corte estilizado; no anima brazo/espada ni demuestra contacto real. |
| AN-15 | Impacto de silueta gráfica | R1 | Breve sustitución del plano por masas gráficas de alto contraste y vuelta al encuadre. | Desactivado en modo reducido; no secuencias estroboscópicas ni garantía de seguridad por duración. |
| AN-16 | Anticipación, hold y liberación | R0/R1 | Pausa deliberada → impulso de cámara/efecto → asentamiento; énfasis temporal. | El golpe está en montaje/FX; si cambia anatomía necesita R3. |

### AN3 — Expresión y comedia

| ID | Técnica | Entrada | Mecanismo y uso | Límite / prueba visual |
|---|---|---|---|---|
| AN-17 | Fondo emocional simbólico | R1 | Sustituir el decorado por patrones de tensión, vergüenza, afecto o desconcierto. | Una familia paramétrica, no contar cada color/símbolo como plantilla nueva. |
| AN-18 | Sombra dramática sobre la mirada | R2 | Máscara graduada en frente/ojos y fondo amortiguado, con entrada lenta. | Respetar anclas; no dibujar ojos nuevos ni tapar boca necesaria para diálogo. |
| AN-19 | Signos de reacción anclados | R2 | Gota, marca de enfado, interrogación o exclamación con aparición/elástico breve. | Gráficos originales, legibles; texto citado no se traduce ni altera. |
| AN-20 | Aislamiento de protagonista | R1 | Entorno pierde saturación/luz mientras sujeto conserva color y un foco gráfico. | Separación de capas requerida; no vender profundidad de campo óptica real. |
| AN-21 | Temblor cómico de pose | R1 | Microdesplazamiento controlado en cabeza/torso encuadrados; sorpresa o nervios. | Nada de pie patinando; amplitude y duración bajas, modo reducido disponible. |
| AN-22 | Compresión visual de pánico | R0/R1 | Viñeta envolvente + presión del encuadre y fondo, sin deformación corporal por defecto. | Evitar deformar el rostro; no usar como supuesto cambio de perspectiva. |
| AN-23 | Cut-in de ojos/rostro | R2 | Banda o ventana recortada del mismo asset aparece sobre el plano general. | Muestra un detalle de la imagen, no una expresión nueva; margen de ojos verificable. |
| AN-24 | Reacción fuera de campo | R0/R1 | Mantener objeto o entorno y usar sombra, símbolo o texto/sonido explícito para reacción. | Receta de puesta en escena, no actuación facial simulada; audio es asset independiente. |

### AN4 — Puesta en escena y montaje expresivo

| ID | Técnica | Entrada | Mecanismo y uso | Límite / prueba visual |
|---|---|---|---|---|
| AN-25 | Pantalla partida de enfrentamiento | R1 × 2 | Dos poses en paneles que entran desde lados opuestos con eje de miradas coherente. | Dos identidades/assetIds; orientación no se inventa espejando rasgos asimétricos sin permiso. |
| AN-26 | Montaje de fragmentos | R2 | Cortes entre mano, rostro, objeto y plano medio a partir de recortes preparados. | No ampliar más allá de resolución útil; no representa vistas inexistentes. |
| AN-27 | Cambio de atención por planos | R1 + sujeto secundario | Nitidez/contraste alternan entre sujeto y objeto con una pausa de lectura. | Efecto 2.5D declarado, no rack focus físico de una lente real. |
| AN-28 | Recorrido de ilustración alta | R0 de alta resolución | Paneo vertical/lateral revela una pose o composición compleja progresivamente. | Cambia encuadre, no punto de vista; sin estirar la ilustración para rellenar. |
| AN-29 | Estampa dramática sostenida | R0/R1 | Hold largo, composición cuidada, textura/luz sutil y cierre de escena. | El peso está en la imagen y el ritmo; no afirmar que la pintura se ha animado corporalmente. |
| AN-30 | Cambios de expresión o pose al acento | R3 | Sustitución discreta y mutuamente excluyente de 2–4 assets del mismo personaje. | No interpolar caras/miembros; misma ancla/escala/iluminación, una sola cara visible por frame. |

## Base técnica compartida — AN0

No construir otro editor ni escribir JS generado por el Wizard. Las recetas
declarativas se compilan al documento procedural y usan el evaluador compartido.

- [ ] Declarar capacidades R0/R1/R2/R3 y `characterMotion: held | float | poses | rigged`.
- [ ] `framing: full | medium | medium-close | close` con anclas de cabeza/cintura;
  `medium = waist-up`, predeterminado para personajes estáticos. `full` explícito.
- [ ] Timeline de acentos: anticipación → énfasis → hold → salida, en frames.
- [ ] Semilla explícita para líneas/partículas/rayos; evaluación fuera de orden.
- [ ] Pila por grupos: fondo → FX traseros → personaje → FX delanteros → acabado.
- [ ] Máscara/zona protegida de cara y manos; soportes de alpha declarados.
- [ ] Perfil de recursos: máximo de instancias, resolución, densidad y duración;
  medir CPU/GPU real, no prometer «cero VRAM».
- [ ] Modo reducido: sin flashes repetitivos ni shake automático; previews pausadas
  por defecto cuando el usuario pide movimiento reducido. Evaluación específica
  de secuencias de alto contraste antes de publicarlas, sin garantías médicas.
- [ ] Política provided_only: faltar un asset no inicia H3, MiniMax ni imagegen.
- [ ] UI conserva prompt técnico, idioma de texto/voz y texto literal por separado.
- [ ] Guardar snapshot, templateId/version, assetIds/characterId, seed, parámetros,
  renderer/version, relación con shot/run y configuración exacta para reabrir.

## PRs y dependencias

| PR | Objetivo / módulos | Depende de | Tests y criterio de aceptación | Riesgo |
|---|---|---|---|---|
| AN0 | Contrato `features/proceduralVideo/anime/{capabilities,cues,validation}` y anclas/encuadres compartidos, sin renderer nuevo. | P01/P02/P03; máscaras reutilizan P04. | Fixtures R0–R3, límites, frame/seed deterministas, estados incompatibles deshabilitados, roundtrip. | Medio |
| AN1 | AN-01…08, velocidad/flujo/afterimages; reutilizar primitivas existentes antes de añadir otras. | AN0, P04. | Ocho recetas con imágenes originales, 2 relaciones de aspecto y renders locales; sin andar deslizando pies, sin joints inventados. | Medio |
| AN2 | AN-09…16, energía/impactos/ritmo. | AN1; acabados que necesiten buffers dependen de P11. | Rayos/partículas deterministas, capa de protección, export/preview iguales, modo reducido; ocho clips revisables. | Medio-alto |
| AN3 | AN-17…24, expresión/comedia y anclas. | AN0, P04; audio/montaje reutilizan P07 cuando corresponda. | Rostro nunca duplicado, anclas ajustables, texto literal intacto, ocho clips con encuadre medio. | Medio |
| AN4 | AN-25…30, montaje/poses discretas. | AN3, P07; AN-30 necesita kit de poses coherentes, enlazado con P14. | Identidad por personaje, paneles y cortes editables; una pose/expresión activa; seis clips y reapertura exacta. | Alto |

AN3 y documentación/tests de AN2 pueden prepararse en paralelo cuando AN0 esté
mezclado, con ownership distinto. No modificar a la vez SceneAnimatorPanel,
evaluador, schema o pila de efectos. Un PR dependiente se abre después del merge
de su base, no apilar todos los bloques. Luna: fixtures/recetas ya especificadas;
principal: contratos, cámaras, composición, seguridad y revisión de integración.

Estos bloques no son gates para P05–P15. Empezar cada familia con una sola receta
representativa renderizada y revisada; ampliar a su lote sólo después. Separar
AN4 en AN4a (25–29, montaje) y AN4b (30, después de P14) para no posponer las
técnicas de imagen única por el kit de poses. Las técnicas que requieran buffers
de P11 quedan pendientes explícitas y no bloquean las que usan capas existentes.

El objetivo de AN4 no bloquea los primeros 24 recursos, que no necesitan un rig
articulado. Si el kit de poses no está listo, separar AN-30 en otro PR posterior;
no marcar todo AN4 completado ni generar poses ocultamente para pasar una demo.

## QA y ejemplos para el selector

- [ ] Cada receta tiene una tarjeta con acción expresiva, requisitos, controles,
  límites, referencia MP4 y «abrir configuración». Misma referencia para cambios
  menores de color; versiones/variantes visuales se identifican por separado.
- [ ] CI: gramáticas, contratos, geometría de anclas/máscaras, propiedad de semilla,
  0/mitad/último frame, lectura fuera de orden, ausencia de llamadas a generadores.
- [ ] E2E simulado: seleccionar personaje → encuadre medio → FX → guardar/reabrir;
  asset inválido/ausente detiene con error visible y conserva el trabajo.
- [ ] Local: render real corto con PNG opaco y cutout alpha, fondo claro y oscuro,
  cabello fino, manos separadas, personaje alto/bajo y padding asimétrico.
- [ ] Revisar caras/cinturas en todo el movimiento, no sólo un poster bonito.
- [ ] Excluir por defecto movimiento incompatible con pose y encuadre; el Wizard
  explica la limitación y ofrece otro plano, no promete actuación inexistente.
- [ ] Comparar intensidad reducida/normal, sin ruido temporal, halos ni flashes
  repetidos. No convertir un fallo visual en «estilo anime» para aprobarlo.
- [ ] Aprobar cada clip antes de publicarlo como referencia; guardar originales,
  metadata y hashes fuera de Git. No copiar clips ni personajes de franquicias.

Ejemplos de instrucciones futuras del Wizard (contratos, no promesas actuales):

> Usa esta imagen de mi personaje, de cintura hacia arriba, inmóvil en su pose.
> Añade líneas de velocidad detrás y una aceleración del fondo durante tres segundos.
> No generes vídeo ni cambies su cara. Abre el resultado en el editor.

> Mantén a los dos personajes en poses fijas, crea un enfrentamiento con pantalla
> partida y termina con un acercamiento a los ojos. Conserva sus referencias e idioma.

> Para este plano necesito que camine de verdad. Prepara una alternativa H3 con
> referencia de personaje y presupuesto explícito; no la ejecutes sin permiso.
