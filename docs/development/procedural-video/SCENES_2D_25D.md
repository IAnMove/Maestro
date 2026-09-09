# 50 propuestas de composición 2D/2,5D

Estado: diseñadas como backlog, ninguna casilla certifica implementación.
P05-A: 01–10; B: 11–20; C: 21–30; D: 31–40; E: 41–50.
Dependencia común: P04. Movimiento de personaje articulado sólo si ya existe un
asset/clip apropiado; locomoción generada por rig queda para P14. No fingir caminar
arrastrando una imagen frontal. Se puede usar un personaje flotante de muestra.

Cada casilla requiere: contrato/slots → compilación → tres bindings → tests →
render real → edición/reapertura. Aprobación visual se registra aparte en galería.
Son situaciones y mecanismos distintos, no cincuenta presets de cámara.

## Lote A — Narración y espacio

- [ ] **C01 · Lugar que despierta.** Fondo en tres distancias, luces/actividad por
  zonas en secuencia; el sujeto aparece después. Slots: fondo, planos, sujeto.
- [ ] **C02 · Revelación tras oclusor.** Primer término abre físicamente el encuadre
  mediante matte y cámara lateral. Slots: oclusor con alpha, sujeto, fondo.
- [ ] **C03 · Llegada y parada.** Trayectoria del sujeto termina en marca de escena,
  cámara espera y un prop reacciona. Slots: sujeto apto para movimiento, destino.
- [ ] **C04 · Cruce con cambio de profundidad.** Dos sujetos se cruzan y cambia el
  orden delante/detrás en un punto preparado. Slots: dos sujetos, zonas de profundidad.
- [ ] **C05 · Distancia emocional.** Un sujeto abandona el cuadro, otro permanece;
  el espacio vacío se vuelve la acción. Slots: dos sujetos, salida, framing seguro.
- [ ] **C06 · Atención al objeto.** Rack focus estilizado de capas y gesto/entrada
  visual dirige hacia un detalle. Slots: sujeto, objeto aislado, máscara de foco.
- [ ] **C07 · Plano/contraplano con eje.** Dos encuadres con miradas compatibles y
  cortes temporales; no voltear texto/vestuario. Slots: vistas adecuadas A/B.
- [ ] **C08 · Mensaje en pantalla.** Dispositivo en escena muestra contenido y
  provoca reacción/iluminación local. Slots: pantalla con matte, contenido, sujeto.
- [ ] **C09 · Sombra antes que cuerpo.** Sombra estilizada anticipa la entrada del
  personaje; el cuerpo la alcanza. Slots: silueta, sujeto, superficie de apoyo.
- [ ] **C10 · Ventana a otra escena.** Marco recorta un segundo entorno independiente,
  con paralaje exterior/interior. Slots: marco alpha, dos mundos, sujeto opcional.

## Lote B — Acción y transformación

- [ ] **C11 · Persecución con obstáculo.** Dos trayectorias desfasadas y un oclusor
  intermedio permiten perder/revelar al perseguidor. Slots: dos sujetos, obstáculo.
- [ ] **C12 · Entrega de objeto.** Prop pasa entre anclas de dos sujetos; ownership
  visual cambia en un frame definido. Slots: dos sujetos, prop, anclas.
- [ ] **C13 · Lanzamiento e impacto.** Proyectil sigue parábola estilizada desde
  emisor hasta objetivo; impacto coordinado, no láser flotante. Slots: emisor/prop/target.
- [ ] **C14 · Puerta y espacio oculto.** Dos hojas/matte abren un interior con su
  propio plano profundo y sujeto. Slots: marco/hojas, interior, visitante.
- [ ] **C15 · Ascensor de mundos.** Ventana fija en cabina, niveles exteriores pasan
  a velocidades relativas; parada final revela lugar. Slots: cabina, plantas.
- [ ] **C16 · Collage que se ensambla.** Piezas separadas convergen a una figura con
  orden/encajes, no sólo fade simultáneo. Slots: piezas con destinos y silueta.
- [ ] **C17 · Descomposición en fragmentos.** Un objeto se separa en capas/piezas
  predefinidas y queda espacio narrativo. Slots: objeto y fragmentos con anclas.
- [ ] **C18 · Crecimiento revelado.** Planta/estructura crece mediante máscaras
  a lo largo de un recorrido, no estirando todo el bitmap. Slots: etapas y matte.
- [ ] **C19 · Mundo plegable.** Paneles de decorado giran/abren como teatro de papel
  con bisagras 2,5D limitadas. Slots: paneles, pivotes, fondo revelado.
- [ ] **C20 · Portal y sustitución.** Sujeto entra en matte y sale en otro lugar/vista
  con timing continuo. Slots: dos portales, sujeto entrada/salida.

## Lote C — Videoclip y gráfica musical

- [ ] **C21 · Escenario de intérprete.** Iluminación por zonas y gestos existentes
  responden a secciones musicales, no sólo pulsar escala. Slots: performer, stage, cues.
- [ ] **C22 · Dueto espacial.** Intercambio de protagonismo entre dos áreas de escena
  con respuesta visual alternada. Slots: dos performers, cues de turno.
- [ ] **C23 · Coro de siluetas.** Instancias diferenciadas por fase y profundidad
  ejecutan un patrón de formación. Slots: siluetas, formación, cues.
- [ ] **C24 · Tipografía cinética literal.** Palabras aparecen según segmentos reales
  preservando idioma/citas y legibilidad. Slots: texto, fuentes autorizadas, timings.
- [ ] **C25 · Percusión de objetos.** Props actúan como instrumentos visuales con
  deformación limitada y golpe/retorno. Slots: objetos, anclas, eventos rítmicos.
- [ ] **C26 · Secuenciador visual.** Un cursor activa celdas/objetos y deja memoria
  de patrón musical, diferente de un ecualizador. Slots: grid, contenido, secuencia.
- [ ] **C27 · Cinta de recuerdos.** Fotografías/fragmentos viajan por una cinta con
  marcos y puntos de atención sincronizados. Slots: varias imágenes, cues.
- [ ] **C28 · Estela gráfica de baile.** Poses/recortes disponibles dejan duplicados
  temporales limitados, sin inventar cuerpo posterior. Slots: poses o clip con alpha.
- [ ] **C29 · Símbolo construido por ritmo.** Cada golpe coloca una pieza hasta
  completar una figura reconocible. Slots: piezas, layout final, beats.
- [ ] **C30 · Cambio de sección escénico.** Decorado se transforma por paneles al
  llegar al estribillo, manteniendo sujeto/continuidad. Slots: dos sets, performer, cue.

## Lote D — Gráfica narrativa y mundos estilizados

- [ ] **C31 · Mapa de viaje.** Ruta, hitos y movimiento del indicador explican un
  trayecto; cámara sigue eventos, no coordenadas arbitrarias. Slots: mapa y ruta.
- [ ] **C32 · Mesa de investigación.** Pistas se conectan, una selección altera
  jerarquía del conjunto. Slots: documentos/props, relaciones y foco.
- [ ] **C33 · Página de cómic viva.** Viñetas se activan en orden y un elemento cruza
  un borde con máscara. Slots: paneles, sujeto, secuencia.
- [ ] **C34 · Infografía causal.** Estado A activa B y C mediante conectores y
  transferencia visible; parámetros de datos. Slots: nodos/valores/aristas.
- [ ] **C35 · Papel recortado multicapa.** Siluetas forman túnel por profundidad y
  revelan sujeto final, con sombras estilizadas. Slots: recortes por plano.
- [ ] **C36 · Acuario de planos.** Partículas/burbujas y sujetos flotantes cruzan
  estratos de agua, con oclusión preparada. Slots: fauna/props, estratos, trayectorias.
- [ ] **C37 · Escaparate de producto.** Partes/características se señalan mediante
  callouts ligados a anclas mientras producto cambia de posición. Slots: producto/datos.
- [ ] **C38 · Objeto y mundo interior.** Máscara del objeto contiene paisaje en
  movimiento que después ocupa el cuadro. Slots: silueta, interior, exterior.
- [ ] **C39 · Escena de vigilancia.** Varias cámaras/ventanas muestran eventos
  coordinados y una alarma redirige atención. Slots: vistas y eventos compartidos.
- [ ] **C40 · Teatro de sombras.** Acción se cuenta únicamente con siluetas sobre
  superficie/luz cambiante, no duplicado de personaje iluminado. Slots: siluetas/luz.

## Lote E — Espacio y transiciones narrativas

- [ ] **C41 · Flota en profundidad por capas.** Formación atraviesa planos y
  cambia jerarquía aparente, sin llamarlo mundo 3D. Slots: naves recortadas/GLB por capa.
- [ ] **C42 · Órbita estilizada con ocultación.** Nave pasa delante/detrás de planeta
  por máscaras y profundidad declarada. Slots: planeta, nave, órbita planar.
- [ ] **C43 · Combate y escudo.** Emisor, proyectil, target e impacto coordinados;
  energía de escudo reacciona en punto de llegada. Slots: dos naves/escudo.
- [ ] **C44 · Explosión narrativa.** Target desaparece en impacto, fragmentos
  definidos y nube expanden con fases; no un flash sin consecuencia. Slots: target/piezas.
- [ ] **C45 · Entrada en hipervelocidad.** Preparación, aceleración y vacío posterior;
  túnel/speedlines ligado al evento. Slots: nave, campo de velocidad, cue.
- [ ] **C46 · Match cut de silueta.** Dos escenas se enlazan por forma/ancla común,
  no por simple crossfade. Slots: dos sujetos compatibles, máscara/anchor.
- [ ] **C47 · Wipe motivado por objeto.** Sujeto/vehículo atraviesa el encuadre y
  descubre la siguiente escena tras su silueta. Slots: oclusor y dos tomas.
- [ ] **C48 · Tiempo en una ventana.** Mismo lugar cambia de estados/épocas por
  regiones ancladas; sujeto fijo como referencia. Slots: estados registrados.
- [ ] **C49 · Escena dentro de pantalla múltiple.** Un monitor se amplía hasta
  convertirse en nuevo plano manteniendo contenido temporal. Slots: marco/contenido/toma.
- [ ] **C50 · Plano secuencia por estaciones.** Cámara recorre >=3 microacciones
  conectadas en decorado ancho, con cues y llegada final. Slots: estaciones/acciones.

## Regla de revisión de diferencia

Si dos entradas se distinguen sólo por velocidad, orientación, paleta o assets,
se fusionan. Si requieren una nueva primitiva, declararla y probarla antes del lote.
La galería debe mostrar mecanismo visible y controles útiles; una firma JSON
diferente no demuestra una escena visualmente diferente. Los IDs piloto pueden
reutilizarse mediante versión/migración explícita, nunca renombrar y contar dos veces.
