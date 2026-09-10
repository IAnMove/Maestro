# 50 propuestas de escenario 3D compartido

Estado: backlog de P10, no implementado. Depende de P08/P09 y sus presupuestos.
Una escena exige un mundo común, posiciones reales y oclusión coherente; colocar
varios model-viewer sobre un fondo no cumple esta fase.
Lotes A–E = 01–10, 11–20, 21–30, 31–40 y 41–50 respectivamente.

Cada casilla exige tres juegos de assets/bounds, cámara editable, test temporal,
render real, coste y recuperación del documento. Las acciones físicas pueden
estar coreografiadas: explicarlo, no vender simulación de fluidos/colisiones.
Si una capacidad supera el presupuesto del MVP, la entrada permanece pendiente
o se sustituye con revisión, no se implementa una aproximación silenciosa.

## Lote A — Narración espacial

- [ ] **S01 · Sobrevuelo planetario.** Nave pasa del horizonte al primer término
  con planeta/geometría común y cámara acompañante. Slots: nave, planeta.
- [ ] **S02 · Encuentro orbital.** Dos objetos rodean centro compartido con
  ocultación mutua y cambios de frente/fondo. Slots: cuerpos, centro, órbitas.
- [ ] **S03 · Atraque en hangar.** Nave alinea anclas, cruza puerta y termina dentro
  de un volumen iluminado. Slots: nave, hangar, anclas/puerta.
- [ ] **S04 · Fuego cruzado.** Dos grupos con emisores disparan hacia objetivos
  móviles; proyectiles e impactos concuerdan espacialmente. Slots: naves/emisores.
- [ ] **S05 · Intercepción de escudo.** Un proyectil choca con superficie de escudo
  antes de alcanzar la nave; onda localizada. Slots: nave, escudo, amenaza.
- [ ] **S06 · Huida por escombros.** Ruta diseñada evita volúmenes de obstáculos,
  cámara cruza sus huecos. Slots: nave, obstáculos, trayectoria libre validada.
- [ ] **S07 · Descenso a superficie.** Aproximación, desaceleración y contacto con
  plataforma, sin atravesar suelo. Slots: vehículo, suelo, zona de contacto.
- [ ] **S08 · Salto por anillo.** Objeto cruza un umbral geométrico y desaparece por
  plano de corte/portal, con estado antes/después. Slots: anillo, nave, destino.
- [ ] **S09 · Lanzamiento desde portanaves.** Unidades salen secuencialmente de
  anclas y forman escuadrón. Slots: portanaves, unidades, rutas de salida.
- [ ] **S10 · Inspección de pecio.** Cámara entra en estructura abierta siguiendo
  un foco/sonda y descubre un elemento interno. Slots: pecio abierto, sonda, hallazgo.

## Lote B — Arquitectura y lugares

- [ ] **S11 · Recorrido de habitación.** Cámara atraviesa puerta y visita estaciones
  sin cortar paredes. Slots: estancia, aperturas, puntos de interés.
- [ ] **S12 · Casa de muñecas seccionada.** Pisos se apartan o seccionan para mostrar
  habitaciones simultáneamente. Slots: módulos por planta, plano de sección.
- [ ] **S13 · Construcción por módulos.** Estructura se ensambla por dependencias
  (base antes de cubierta), no aparición aleatoria. Slots: módulos/anclas/DAG.
- [ ] **S14 · Pasillo de revelaciones.** Oclusores sucesivos abren microescenas
  laterales durante un recorrido continuo. Slots: pasillo, puertas, tableaux.
- [ ] **S15 · Ascenso por escalera.** Cámara/sujeto cambia de planta con geometría
  y alturas reales. Slots: escalera, niveles, ruta; rig de caminar opcional posterior.
- [ ] **S16 · Jardín cinético.** Vegetación modular oscila de forma correlacionada
  con campo de viento determinista. Slots: vegetación adecuada, terreno/campo.
- [ ] **S17 · Viaje sobre raíles.** Cámara/vehículo sigue rail con banking y límites
  de velocidad; entorno se descubre al recorrerlo. Slots: rail, vehículo, escenario.
- [ ] **S18 · Museo de revelado lumínico.** Obras/props se presentan por zonas de
  iluminación y recorrido del espectador. Slots: sala, obras, luces limitadas.
- [ ] **S19 · Paso del día en un interior.** Dirección de luz y sombras muestran el
  tiempo sobre superficies estables. Slots: habitación/ventana, luz y timeline.
- [ ] **S20 · Escenografía transformable.** Paredes/suelos pivotean y crean otro
  espacio sin fundido de imagen. Slots: módulos con bisagras, posiciones finales.

## Lote C — Producto, mecanismos y explicación

- [ ] **S21 · Despiece técnico.** Componentes se separan desde anclas y aparecen
  callouts vinculados. Slots: producto segmentado, nombres, vectores de separación.
- [ ] **S22 · Ensamblaje causal.** Componentes encajan en orden validado y muestran
  el estado final funcional. Slots: piezas, constraints y dependencias.
- [ ] **S23 · Turntable de materiales.** Objeto bajo iluminación calibrada presenta
  relieve/material mientras gira; referencia de escala fija. Slots: producto/set.
- [ ] **S24 · Cadena de reacción.** Objetos activan acciones del siguiente con
  contactos programados y tiempos medibles. Slots: módulos/eventos, no física libre.
- [ ] **S25 · Mecanismo sincronizado.** Engranajes/pistón/ejes transmiten movimiento
  mediante relaciones declaradas. Slots: piezas con radios/ejes válidos.
- [ ] **S26 · Corte interior explicativo.** Plano de corte revela capas internas
  conservando contexto exterior. Slots: mallas aptas, plano, leyendas.
- [ ] **S27 · Llenado volumétrico estilizado.** Nivel analítico sube dentro de un
  recipiente compatible; no prometer dinámica de fluidos. Slots: recipiente/volumen.
- [ ] **S28 · Cinta que envuelve producto.** Geometría paramétrica recorre un camino
  alrededor del objeto con separación comprobada. Slots: producto, spline, cinta.
- [ ] **S29 · Línea de fabricación.** Instancias avanzan por estaciones que alteran
  su estado/material, sin teletransporte de identidad. Slots: estaciones/productos.
- [ ] **S30 · Comparador dimensional.** Dos productos y guías de medida se alinean
  en referencia común, sin ajustar escala para engañar. Slots: medidas/modelos.

## Lote D — Videoclip y espectáculo

- [ ] **S31 · Escenario de concierto.** Luces y plataformas responden a secciones
  musicales manteniendo sujeto legible. Slots: escenario/performer/cues.
- [ ] **S32 · Túnel geométrico musical.** Cámara atraviesa secciones que cambian
  forma/espaciado por cue; no simple pulsación de todo el frame. Slots: perfiles/cues.
- [ ] **S33 · Enjambre en formaciones.** Instancias transitan entre figuras con
  trayectorias asignadas, no sólo nube aleatoria. Slots: unidades/formaciones.
- [ ] **S34 · Tipografía espacial.** Texto literal ocupa un recorrido 3D y la cámara
  revela frases manteniendo legibilidad. Slots: texto/fuente/cues/ruta.
- [ ] **S35 · Coreografía de props suspendidos.** Objetos intercambian posiciones
  alrededor de performer con anclas y espacios libres. Slots: props/performer/rutas.
- [ ] **S36 · Paisaje sonoro.** Datos de bandas/eventos deforman una superficie
  espacial con cámara navegable. Slots: datos reales o sintéticos etiquetados, malla.
- [ ] **S37 · Instrumento mecánico visible.** Golpes de piezas coinciden con cues
  sonoros en puntos físicos definidos. Slots: instrumentos/anclas/eventos.
- [ ] **S38 · Prisma escenográfico.** Paneles transparentes colorean/ocultan la
  escena por geometría ordenada; límites de transparencia declarados. Slots: paneles.
- [ ] **S39 · Haz que guía al sujeto.** Volumen luminoso estilizado por geometría
  transparente marca el camino; no ray marching volumétrico prometido. Slots: haz/ruta.
- [ ] **S40 · Escenario de globos flotantes.** Volúmenes ascienden en trayectorias
  por capas de profundidad y se apartan del performer. Slots: globos/sujeto/campo.

## Lote E — Narrativa visual y mundos abstractos

- [ ] **S41 · Ilusión de perspectiva forzada.** Piezas separadas forman una imagen
  desde cámara objetivo; el movimiento revela el truco. Slots: piezas/target visual.
- [ ] **S42 · Viaje microscópico estilizado.** Cámara atraviesa estructuras de
  varias escalas con transiciones controladas. Slots: niveles/rutas/estructuras.
- [ ] **S43 · Ciudad de datos.** Valores construyen edificios/zonas con leyenda y
  recorrido explicativo, sin decoración que falsee magnitudes. Slots: dataset/layout.
- [ ] **S44 · Multitud de rutas.** Instancias viajan por carriles y cruces con
  reservas temporales; no navegación autónoma prometida. Slots: rutas/agentes simples.
- [ ] **S45 · Diorama de mesa que cobra vida.** Objetos escénicos mantienen escala
  de miniatura y ejecutan microacciones coordinadas. Slots: mesa/tableaux/eventos.
- [ ] **S46 · Escultura móvil equilibrada.** Ramas colgantes oscilan respecto a
  pivotes jerárquicos con amplitud acotada. Slots: estructura/bisagras, no solver físico.
- [ ] **S47 · Libro tridimensional emergente.** Página gira y levanta decorado por
  bisagras; cámara cambia de lectura a interior. Slots: libro/paneles/pivotes.
- [ ] **S48 · Nube que toma forma.** Puntos/instancias convergen hacia superficie
  muestreada de un objeto y después se dispersan. Slots: shape/points/seed.
- [ ] **S49 · Red de energía causal.** Flujo recorre enlaces 3D y activa nodos por
  eventos propagados con tiempos consistentes. Slots: grafo/layout/eventos.
- [ ] **S50 · Plano secuencia entre decorados.** Una cámara conecta varios sets
  reales a través de aperturas y acciones motivadas. Slots: sets/ruta/cues/anclas.

## Aceptación especial

- Sombras, clipping, anclas, contacto con suelo y emisión de proyectiles se prueban
  en frames intermedios. Fin visual correcto no compensa interpenetración durante la toma.
- Planos 2D en un mundo 3D siguen siendo planos: avisar sobre vistas faltantes.
- Reflejos, transparencias complejas, piel, pelo y fluidos no entran por promesa
  implícita del nombre de una escena; capacidad ausente deshabilita esa variante.
- No depender de modelos de franquicias para las pruebas; geometría original y
  modelos externos sólo con procedencia/licencia documentadas, sin subir pesos.
