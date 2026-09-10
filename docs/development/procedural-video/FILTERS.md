# 50 técnicas de acabado: inventario verificable

Backlog de P11/P12, no prestaciones implementadas. Cinco lotes de diez; no contar
combinaciones de estos operadores, otras paletas o intensidades como filtros nuevos.
«50 técnicas» tampoco significa 50 estilos artísticos aprobados: después se curan
presets combinados y el usuario escoge los que visualmente merecen quedarse.

Entradas: **C** color, **A** alpha, **D** profundidad lineal, **N** normales en espacio
de vista declarado, **V** movimiento en unidades declaradas, **H** historial,
**M** máscara. Coste B/M/A es una previsión relativa, no un benchmark.
Todos necesitan resolución/tiempo/seed/espacio de color y alpha bien definidos.

## Lote A — Representación gráfica

- [ ] **F01 · Pixelado espacial.** Una muestra/bloque y nearest-neighbor; C/A, B.
  Test: bloques exactos, píxeles estables al cambiar escala del visor.
- [ ] **F02 · Dithering ordenado.** Cuantización con matriz espacial; C/A, B.
  Test: fase de matriz constante por coordenada de salida, sin shimmer por UI.
- [ ] **F03 · Difusión de error.** Error de cuantización propagado entre vecinos;
  C/A, A. Test: orden determinista y límite de tamaño; no fingir equivalencia con F02.
- [ ] **F04 · Paleta indexada.** Distancia de color a paleta finita elegida; C/A, M.
  Test: salida pertenece a paleta, alpha preservado; todas las paletas son parámetros.
- [ ] **F05 · Semitono de impresión.** Tramas de puntos por cobertura tonal;
  C/A, M. Test: gradientes/texto y frecuencia para evitar moiré en export.
- [ ] **F06 · Mosaico de glifos.** Celdas se representan por atlas de caracteres
  según luminancia/estructura; C/A + fuente autorizada, M. Test atlas y legibilidad.
- [ ] **F07 · Tramado a lápiz.** Líneas orientadas por gradiente con densidad tonal;
  C/A, A. Test: orientación y ruido temporal, no simplemente overlay de rayas.
- [ ] **F08 · Puntillismo.** Distribución espacial de puntos con densidad/color
  derivados de imagen; C/A/seed, A. Test: semilla/espacio y no centelleo accidental.
- [ ] **F09 · Contorno de imagen.** Gradiente tipo Sobel en luminancia; C/A, M.
  Test: líneas finas, piel/texto, alpha cero y umbral; no afirma bordes geométricos.
- [ ] **F10 · Acabado pictórico Kuwahara.** Regiones de menor varianza guían
  suavizado; C/A, A. Test: coste de kernel, bordes y estabilidad entre frames.

## Lote B — Señal, película y color

- [ ] **F11 · Grano de película.** Ruido por luminancia con semilla y tiempo de
  salida; C/A, B. Test: repeat/seek y fuerza acotada, no ruido de reloj real.
- [ ] **F12 · Pantalla CRT.** Modelo de máscara de subpíxeles/scanlines del display;
  C/A, M. Test: legibilidad, frecuencia espacial y perfil sin parpadeo.
- [ ] **F13 · Señal VHS estilizada.** Menor resolución de crominancia y tracking
  de líneas; C/A/tiempo, M. Test: clamping y bandas, flashes desactivados por defecto.
- [ ] **F14 · Compresión en bloques.** Cuantización de frecuencias por bloque
  inspirada en JPEG; C/A, A. Test: no depender de recodificar archivos corruptos.
- [ ] **F15 · Inestabilidad de registro de película.** Gate weave acotado con
  overscan y grano independiente; C/A, B. Test bordes y semilla; no cámara narrativa.
- [ ] **F16 · Fuga de luz.** Campo de exposición localizado con evolución lenta;
  C/A, B. Test: intensidad cero identidad y sin picos de blanco súbitos.
- [ ] **F17 · Solarización.** Curva tonal no monótona definida y acotada; C/A, B.
  Test umbral/gradiente/color-space, conservar alpha y no valores no finitos.
- [ ] **F18 · Negativo fotográfico estilizado.** Inversión tonal/cromática en
  espacio declarado; C/A, B. Test carta de color; no afirmar simulación química exacta.
- [ ] **F19 · Contraste local.** Separación base/detalle y recombinación acotada;
  C/A, M. Test: halos, ringing y piel; distinto de cambiar contraste global.
- [ ] **F20 · Gradación mediante LUT.** Operador único de LUT 3D validada; C/A,
  M. Test interpolación/identidad/límites/licencia. Cien LUTs siguen contando como F20.

## Lote C — Operadores espaciales y ópticos

- [ ] **F21 · Desenfoque gaussiano.** Convolución separable en alpha correcto;
  C/A, M. Test: radio/resolución, bordes transparentes, no halos negros.
- [ ] **F22 · Suavizado bilateral de color.** Pesos espaciales y diferencia de
  color preservan bordes; C/A, A. Test detalles y coste. D/N son variante futura,
  no requisito inventado del bilateral básico.
- [ ] **F23 · Limpieza por mediana.** Estadístico local contra ruido impulsivo;
  C/A, A. Test puntos aislados vs detalle fino y tamaño máximo de vecindad.
- [ ] **F24 · Enfoque por máscara de detalle.** Unsharp controlado y límites de
  sobreimpulso; C/A, M. Test ringing/ruido; no lo vender como superresolución IA.
- [ ] **F25 · Barrido radial.** Integración de muestras hacia centro/foco;
  C/A, M. Test centro editable, UV límites y pérdida de legibilidad.
- [ ] **F26 · Distorsión de lente.** Remapeo radial/tangencial con overscan;
  C/A, M. Test borde y coordenadas finitas. Barril/cojín son variantes del mismo ID.
- [ ] **F27 · Aberración cromática.** Desplazamiento óptico relativo de canales;
  C/A, B. Test alpha/crop y fuerza, no texto partido por defecto.
- [ ] **F28 · Viñeta.** Atenuación por posición con forma y transición suave;
  C/A, B. Test esquinas/centro y varios aspectos, no achatar el sujeto.
- [ ] **F29 · Bloom.** Extracción de altas luces, blur y recombinación en espacio
  declarado; C/A, A. Test energía, negros y highlight clipping. No cinco IDs por color.
- [ ] **F30 · Vidrio esmerilado.** Remuestreo mediante microdesplazamiento y
  dispersión espacial con máscara; C/A/M, M. Test máscara, seed y límites de UV.

## Lote D — Transformación y tiempo

- [ ] **F31 · Caleidoscopio.** Repetición angular/reflejo por dominio polar;
  C/A, M. Test centro, costuras y simetría. Número de sectores es parámetro.
- [ ] **F32 · Slit-scan temporal.** Columnas/filas muestrean tiempos distintos;
  C/A/H, A. Test ventana temporal, seek/reconstrucción y memoria acotada.
- [ ] **F33 · Estelas de exposición.** Mezcla ponderada de estados anteriores
  con horizonte finito; C/A/H, A. Test reset y render fuera de orden equivalentes.
- [ ] **F34 · Cadencia stop-motion.** Sample-and-hold del contenido a FPS menor
  que la salida; C/A/tiempo, B. Test audio continuo, frames repetidos exactos.
- [ ] **F35 · Arrastre de bloques.** Persistencia/traslado por regiones inspirados
  en datamosh; C/A/H y V cuando se exija movimiento real, A. Test reset; no afirmar
  que se está corrompiendo el codec ni inventar motion vectors de un still.
- [ ] **F36 · Refracción por calor.** Campo procedural temporal de UV con máscara;
  C/A/M, M. Test tiempo/seed, bordes y amplitud; no simula temperatura física.
- [ ] **F37 · Color selectivo.** Mantener una selección cromática y desaturar el
  resto con feather, C/A, B. Test límites de gama/piel; seleccionar otro tono no nuevo ID.
- [ ] **F38 · Key de transparencia.** Extraer matte por clave cromática y tratar
  spill, C/A, M. Test pelo/bordes/alpha; error visible si fondo no permite separación.
- [ ] **F39 · Tinta morfológica.** Dilatación/erosión de máscara/bordes para variar
  grosor de trazos, C/A/M, M. Test formas pequeñas y borde, no reemplazar por blur.
- [ ] **F40 · Relieve de luminancia.** Derivada orientada produce emboss
  estilizado, C/A, M. Test gradientes; no inventa geometría ni normales físicas.

## Lote E — Acabados que necesitan datos adicionales

- [ ] **F41 · Contorno geométrico.** Discontinuidades de D/N, independiente de
  textura; C/A/D/N, M. Test objeto con textura ruidosa y superficie suave.
- [ ] **F42 · Profundidad de campo.** Círculo de confusión desde distancia de
  enfoque, C/A/D, A. Test foreground/background y bordes; no equivale a blur global.
- [ ] **F43 · Niebla por profundidad.** Mezcla atmosférica con distancia lineal;
  C/A/D, B. Test near/far, fondos y transparencia. Niebla azul/roja no dos técnicas.
- [ ] **F44 · Motion blur por vectores.** Integración por movimiento por píxel;
  C/A/V y D para rechazo de oclusión, A. Test cambio cámara, disocclusion y shutter.
- [ ] **F45 · Oclusión ambiental en pantalla.** Muestreo de D/N para contacto
  estilizado, C/A/D/N, A. Test escala/radio y halos. No ray tracing ni GI real.
- [ ] **F46 · Reflejos en pantalla.** Ray marching en datos visibles; C/A/D/N y
  máscara de reflectancia/roughness, A. Test borde/offscreen; explicar desaparición
  de información fuera de cuadro, no vender reflejos físicamente completos.
- [ ] **F47 · Refracción en pantalla.** Remuestreo detrás de superficie con N/D y
  máscara/material explícito; C/A/D/N/M, A. Test cobertura/bordes, no habilitar sin datos.
- [ ] **F48 · Rayos de luz en pantalla.** Dispersión radial desde fuente y máscara
  de oclusión; C/A/M + posición fuente, A. Test fuente fuera de cuadro/energía;
  no equivalente a iluminación volumétrica del mundo.
- [ ] **F49 · Antialias temporal.** Reproyección/acumulación con rechazo de historial;
  C/A/D/V/H, A. Test ghosting, cambio de cámara, seek y duración de warm-up declarada.
- [ ] **F50 · Falso color de profundidad.** Representación informativa/estilizada
  de distancia por bandas/gradiente; C/A/D, B. Test escala/unidades. No cámara térmica
  ni profundidad recuperada automáticamente de una imagen sin D.

## PSX sin promesas engañosas

Preset **PSX de imagen**: F01 + F04 + F02 y cadencia F34 opcional; no cuenta como
una técnica 51. La apariencia de geometría PSX requiere un futuro feature de
material/mesh: vertex snapping y estrategia de interpolación/texturas. No son
filtros de imagen final ni se habilitan para una foto prometiendo 3D real.

También fuera de este contador: sombras por luces, inverted-hull de malla,
deformación de vértices, reflejo planar con segunda cámara y partículas de escena.
Van al renderer/escenario y tienen otros presupuestos. El pipeline puede usarlos
como entrada, pero no deben inflar la biblioteca de filtros finales.

## Contrato y test de cada casilla

- [ ] Manifest: ID/versión, params con rangos, requiredBuffers, requiresHistory,
  determinismo/seed, coste, preview/export disponibles y explicación de incompatibilidad.
- [ ] Operador puro o pase con recursos controlados; nada de código del LLM.
- [ ] Intensidad cero/disabled conserva imagen; alpha cero no produce colores basura.
- [ ] Carta sintética pequeña, imagen con piel/texto y clip con movimiento/oclusiones.
- [ ] Mismos resultados después de seek y export desde inicio. Historial finito
  se reconstruye de modo documentado; no fingir aleatoriedad determinista por reset.
- [ ] Previews A/B con salida real y coste medido, no sólo screenshot CSS.
- [ ] Perfil sin flashes/sacudidas; avisar sobre patrones intensos. No afirmar
  conformidad de fotosensibilidad sólo porque exista un switch «safe».

Referencias de implementación: [pases Three](https://threejs.org/manual/en/post-processing.html),
[render targets](https://threejs.org/manual/en/rendertargets.html),
[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html),
[derivadas WebGL de Khronos](https://registry.khronos.org/webgl/extensions/OES_standard_derivatives/).
El inventario y priorización son propuestas nuestras, no un listado de efectos
garantizados por Three o por HocusPocus.
