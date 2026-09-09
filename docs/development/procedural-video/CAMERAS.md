# Cámara: vocabulario y controles, no plantillas duplicadas

Relacionado: [plan maestro](../PROCEDURAL_VIDEO_ROADMAP.md), P03 y P09.
Estado: propuesta de implementación. Los términos cinematográficos describen
intención; no prometen simulación óptica en el compositor por capas.

## Taxonomía que debe ver usuario y Wizard

No colocar todo en un único desplegable «estilo de cámara».

| Dimensión | Opciones iniciales | Regla de implementación |
|---|---|---|
| Encuadre | gran plano general, general, entero, americano, medio, medio corto, primer plano, primerísimo primer plano, detalle | Sujeto/ancla + ocupación de cuadro y márgenes, no posiciones fijas |
| Relación de sujetos | individual, two-shot, grupal, sobre hombro, punto de vista, plano de reacción, insert | Slots y eje/mirada; no son movimientos |
| Ángulo | altura de ojos, picado, contrapicado, cenital, nadir, holandés | Roll 2D es real; cambiar punto de vista necesita imagen adecuada o 3D |
| Movimiento | fijo, pan, tilt, truck, pedestal, dolly, orbit, crane, spline, seguimiento | Trayectoria + objetivo + tiempo; proyección depende del modo |
| Óptica | perspectiva/ortográfica; angular/normal/tele; enfoque | FOV o focal+sensor coherentes; blur no equivale a nueva perspectiva |
| Formato | 16:9, 9:16, 1:1, 4:3, 1.85:1, 2.39:1 | Dimensiones de salida y zona segura, no estirar el vídeo |
| Montaje | corte, corte en acción, match cut, plano/contraplano, L/J cut, disolución | Pertenece a secuencia/timeline, no a la cámara de un frame |

## Movimientos implementables y sus límites

| ID | Técnica / utilidad | 2D/2,5D | Escenario 3D |
|---|---|---|---|
| locked | Trípode: composición sostenida | Cámara fija, animación de sujetos independiente | Cámara inmóvil |
| pan | Barrido horizontal que descubre un lugar | Desplazamiento de ventana; no giro óptico real de una foto | Giro yaw |
| tilt | Descubrir altura | Desplazamiento vertical | Giro pitch |
| truck | Acompañamiento lateral | Traslación con paralaje si hay capas profundas | Traslación lateral con objetivo |
| pedestal | Ascenso/descenso sin cambiar dirección | Desplazamiento vertical por capas | Traslación vertical |
| push-pull | Acercar/alejar emocionalmente | Zoom de composición; aviso «no revela geometría» | Dolly en eje con perspectiva |
| optical-zoom | Cambiar campo visual sin mover cámara | Escala/crop | Focal/FOV con cámara fija |
| arc | Arco alrededor del sujeto | Órbita planar de capas, no espalda de una foto | Arco de cámara real |
| orbit | Vuelta completa de observación | Deshabilitada si sólo existe vista frontal; recurso multivista explícito | Cámara alrededor del conjunto |
| crane | Ascenso combinado y revelado | Trayectoria 2D con varios planos | Posición 3D + mirada |
| follow | Seguimiento de sujeto móvil | Objetivo ID, lead room y suavizado temporal evaluable | Target/look-at + trayectoria |
| lead | Cámara precediendo al sujeto | Movimiento relativo de ventana y sujeto | Cámara delante con distancia segura |
| rail | Trayectoria diseñada | Bézier 2D con easing y anclas | Spline 3D con velocidad controlada |
| handheld | Inestabilidad contenida de mano | Ruido con semilla, no random por frame de UI | Transformación pequeña aditiva |
| shoulder | Respiración/deriva suave | Deriva separada de acción | Deriva de posición/orientación |
| whip | Barrido muy rápido como transición | Desplazamiento y blur etiquetados | Giro rápido; riesgo de mareo señalado |
| roll | Rotación sobre eje óptico | Rotación del cuadro con overscan | Roll cámara |
| dolly-zoom | Mantener sujeto y variar perspectiva del fondo | Sólo aproximación estilizada con capas; no llamarla equivalente físico | Posición+FOV compensados con bounds |
| rack-focus | Transferir atención entre planos | Blur selectivo de capas separadas | Distancia de enfoque y profundidad |
| split-focus | Dos zonas de nitidez deliberadas | Máscara de enfoque estilizada | Postefecto explícito, no óptica física exacta |
| reveal-occluder | Descubrir detrás de un elemento | Máscara/orden de capas | Oclusión de geometría real |

## Instrucciones para P03/P09

- [ ] Cada preset de cámara guarda ID/versión, motivo, target/anclas, inicio/fin,
  easing, amplitud, duración y restricciones. El espejo es parámetro, no nuevo ID.
- [ ] Cámara de navegación del editor no cambia cámara de render hasta acción explícita.
- [ ] Target desaparecido ⇒ error/ancla de respaldo visible, nunca NaN o salto al origen.
- [ ] Mantener cabeza/pies/objeto importante según framing, sin prometer autoencuadre
  semántico de una imagen arbitraria sin anclas. Permitir ajuste manual visible.
- [ ] Respetar eje de acción, mirada y dirección en secuencias. Advertir cambios de eje,
  no bloquear recursos expresivos a un usuario que los elige conscientemente.
- [ ] En 3D fijar unidades, handedness, near/far y FOV vertical u horizontal inequívocos.
- [ ] Evaluar velocidad/aceleración, overscan y clipping en varios tiempos, no sólo extremos.
- [ ] Trayectoria de cámara editable; safe areas y guía tercios opcionales, no quemadas en MP4.
- [ ] Para lentes, especificar sensor antes de usar milímetros. «50 mm» sin sensor no
  define por sí solo el campo visual; no trasladar ese número a una escala 2D sin explicación.
- [ ] Pruebas: tres aspect ratios, asset alto/ancho/pequeño, seek inverso, objetivo
  animado, duración mínima/máxima y cámara cerca de geometría.

Referencia de proyecciones y parámetros técnicos:
[manual oficial de cámaras Three](https://threejs.org/manual/en/cameras.html).
La organización cinematográfica y prioridades anteriores son decisiones de producto
de este plan; no un catálogo incluido automáticamente por la librería.
