# Personajes raster que hablan — plan incremental

Base inicial: development `b8fb2bfc`, 2026-09-06. Rama del piloto:
`feat/character-face-patches`. No generación neural de vídeo ni modelos locales
durante las pruebas pesadas compartidas. No tocar 42003/42004 ni su configuración.

## Decisión artística y técnica

| Estrategia | Cuándo utilizarla | Limitación |
|---|---|---|
| Base sin boca + sprites de boca | SVG, recorte plano, anime limitado | Preparar una base limpia; una boca genérica puede no coincidir con el estilo. |
| Parche de una variante del mismo rostro | Cómic con sombra, barba, acuarela, plastilina | Requiere igual encuadre/pose; costuras y deriva de identidad se revisan visualmente. |
| Cabezas completas intercambiables | Expresiones grandes, perfil y tres cuartos | Más assets; cambios de silueta/iluminación pueden producir saltos. |
| Deformación de malla 2D | Movimientos secundarios pequeños | No inventa dientes ni superficies ocultas; no es el primer bloque. |
| Modelo de animación facial | Primeros planos realistas exigentes | Ruta separada con coste, licencias y validación; no se instala aquí. |

Generar una imagen «sin boca» es una petición al proveedor, no una garantía de
calidad. Conviene conservar la imagen maestra con la expresión/identidad aprobada
y derivar piezas. Un parche sustituye también la piel/barba dentro de su región:
no es un dibujo de labios transparentes pegado encima de otros labios.

Referencias primarias: [capas, vistas y sustitución de ojos en Adobe Character
Animator](https://helpx.adobe.com/adobe-character-animator/desktop/creating-and-controlling-puppets/prepare-artwork.html)
y [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync).
Son referencias de diseño; no son dependencias instaladas ni integraciones hechas.

## R1 — Preparación regional, PR independiente

- [x] Inspeccionar código existente, logs, base y reservas de Grok.
- [x] Crear worktree aislado y guardar este plan antes de implementar.
- [x] Añadir recorte puro de región con centro opaco y borde suavizado, límites
  de memoria y validación estricta de dimensiones/alpha. No modificar el original.
- [x] Asociar cada parche a pose/source exactos, región y fuente variante;
  guardar como asset distinto, pendiente de revisión. Rechazar el montaje
  sobre otra pose o una imagen base reemplazada.
- [x] Añadir preparación visible desde Character Kit: importar una variante
  alineada del mismo personaje, previsualizar y registrar una boca concreta.
- [x] Mostrar prompts de referencia para generar variantes en HocusPocus;
  no afirmar que un proveedor de identidad hace edición pixel-perfect.
- [x] Mantener el flujo de sprites anterior compatible. Describir claramente
  por qué limpiar el fondo de un parche destruye la piel que debe cubrir la boca.
- [x] Corregir la aprobación heredada al borrar una boca: una imagen cambiada
  requiere nueva revisión y no conserva una identidad prestada del original.
- [x] Tests sintéticos de recorte/alpha/límites, binding, save/reopen y UI sin
  modelos. Prueba visual raster aparte; no sustituirla por un test de arrays.
- [x] Tests locales de R1 sobre su base inicial: UI 931/931 y Python 2127
  aprobados, 1 omitido; E2E simulado 17/17. Lint/build/i18n/bundle, contratos de
  repositorio y ratchet contra la base inicial aprobados.
- [x] Commit de implementación `cac47459`, integrado con development en `4f8028df`.
  [PR #193](https://github.com/IAnMove/hocuspocus/pull/193) abierto a development.
- [x] Revisión independiente final de agentes Luna; hallazgos corregidos.
- [x] Revalidación `validate_local.sh --full` en `4f8028df`, contra development
  `f9fbeb8a`: Python 2155 aprobados/1 omitido, UI 940, E2E 17; ratchet y demás
  controles aprobados. i18n también aprobado por separado.
- [x] CI requerido sobre HEAD `56bea596` aprobado; Cursor Automation
  InternalBugBot aprobado. Independent QA neutral no es una aprobación.
- [x] PR #193 mezclado normalmente en development, merge `426cc006`.
  Sin publicar main ni reiniciar apps compartidas. Estado remoto releído al
  preparar [el taller manual](CHARACTER_SPEECH_WORKSHOP.md).
- [ ] Validación artística de un pack hablante real: **no conseguida** en este
  ensayo. El control cerrado de una misma imagen no demuestra interpretación.

Aceptación: un parche raster importable y visible sobre el personaje, montado en
escena con la geometría correcta, sin alterar el fichero base. Evidencia separada
de implementación, tests, commit, PR, CI, merge y resultado artístico.
Al reanudar, releer #193 para actualizar CI/merge: este fichero conserva el
snapshot previo a su resultado remoto; no abrir otro PR por esas casillas.

## R2 — Generación guiada de piezas coherentes

- [ ] Separar packs de boca por pose/vista antes de automatizar múltiples vistas;
  migración explícita y round-trip compatible del pack legacy global. El R1
  conserva un solo mapa de bocas por kit: vincularlo a una pose evita aplicar
  piezas equivocadas, pero **no** habilita dos packs de poses a la vez.
- [ ] Un piloto con imagen maestra y closed/small/wide/round, frontal primero.
- [ ] Generación por HocusPocus/MiniMax autorizado, prompts y job IDs conservados;
  comprobar capacidad de referencia. No cambiar de proveedor silenciosamente.
- [ ] Comparación A/B, alineación de imágenes y rechazo de deriva. No prometer
  inpainting donde sólo existe referencia de identidad.
- [ ] Automatizar pack recuperable, sin reenviar generaciones tras timeout;
  aprobación visual de cada pieza. Vincular por pose y vista, no sólo por nombre.
- [ ] Ojos: reemplazo real de la zona visible o sprites sobre base limpia;
  nunca dibujar párpados encima y dejar debajo los ojos abiertos.

## R3 — Tiempo de voz fiable

- [ ] Separar cadencia heurística por texto, alineación por palabra y visemas
  basados en audio. Etiquetar el método y los fallbacks de manera visible.
- [ ] Pista vocal y letras literales con idioma propio; no mover la boca por
  batería/música instrumental. Silencios → reposo; tiempos editables y persistidos.
- [ ] Piloto de dos interlocutores, turnos, pausas y frase en español; después
  canto con vocales sostenidas. Primero clip breve, después videoclip Omarchy.
- [ ] Prueba de replay/export con el mismo reloj y reapertura sin deriva.

## R4 — Interpretación y vistas

- [ ] Varias poses del mismo personaje, frontal/tres cuartos/perfil con sus
  propios parches; expresión separada de forma de boca.
- [ ] Cambio de cabeza completo cuando lo justifique el gesto, con registro
  de pivote/silueta. Plano medio y recursos de animación limitada para caminar.
- [ ] Integrar acciones Wizard con controles visibles y estados recuperables;
  no presentar aprobación automática de estilo como revisión humana.

## Estado inicial y límites conocidos

El código previo ya contiene Character Kit, cuatro estados de boca y temporización
heurística por letras, con opción de tiempos de transcripción en la previsualización.
Eso no demuestra lip-sync fonético ni canto correcto. La limpieza actual de boca
rellena una elipse con color cercano; no reconstruye barba ni iluminación.
Este plan no declara completado el programa general de vídeo procedural.

## Evidencia del primer ensayo MiniMax (2026-09-06)

- Imagen maestra: job `minimax-image-2e17260ab573`, Image-01, 1024×1024.
- Variante AH: job `minimax-image-f56ab6eb3383`. Cambia ángulo, encuadre y estilo;
  **no apta para recorte directo alineado**.
- Segundo intento frontal: job `minimax-image-32937bfedb04`. El usuario aprueba
  la identidad y la referencia: es el mismo personaje. Esto no valida todavía
  la alineación para intercambiar parches, las expresiones ni una actuación.
- Sólo tres imágenes; no se ejecutó generación de vídeo, separación vocal ni
  inferencia local. Prompts, respuestas y imágenes conservados fuera de Git.
- Conclusión limitada a esta prueba: el endpoint de referencia de identidad no
  ofrece aquí un resultado pixel-alineado. No confundirlo con edición con máscara.
  El importador no corrige automáticamente esta deriva ni certifica identidad.

El parche inicial requiere región cuadrada sin rotación, dos imágenes del mismo
tamaño y centro opaco que tape la boca original. Conserva los píxeles de la
variante, con un borde suavizado; no reconstruye dientes ni barba. El hash de
entrada es una observación, no una firma de autoría. La lectura limita bytes y
el tamaño de la imagen decodificada; no evita la asignación inicial del decoder.
Preparación por localhost/HTTPS para usar Web Crypto. Los assets se guardan en
la biblioteca del kit, pero los uploads no equivalen a promoción al catálogo
canónico de Library. No borrar uploads referenciados por kits.
UI y backend deben actualizarse juntos: un backend anterior no conserva este
campo nuevo. No guardar estos kits desde la UI piloto contra el backend antiguo.

La colocación de parches calcula el ajuste de la imagen al lienzo real (horizontal,
vertical o cuadrado), a diferencia de trasladar directamente los porcentajes del
preview cuadrado. Se mantiene el comportamiento histórico de sprites normales.
Si cambia la pose o su source, el montaje explícito falla; la sincronización
automática preserva el snapshot ya autorado en lugar de lanzar una excepción
desde un efecto React. Las escenas antiguas no se migran automáticamente.

## Uso de R1 y evidencia de navegador

1. Abrir el Character Kit y aprobar la imagen de la pose que se va a usar.
2. En Face Rig, seleccionar closed/small/wide/round y colocar el cuadro de boca
   sin rotación; debe incluir piel/barba suficiente para tapar la boca original.
3. Desplegar la preparación de parche raster. Importar una variante PNG/JPEG/WebP
   alineada y del mismo tamaño. La preparación local no llama a proveedores.
4. Revisar la superposición y las costuras. Guardar explícitamente como pendiente:
   se suben la variante y el PNG recortado, con identidades separadas.
5. Revisar/aprobar esa pieza y guardar el kit mediante sus controles habituales.
   No borrar la boca base ni quitar el fondo del parche. Montar en escena sólo
   después de aprobar. Repetir para los otros estados.

Prueba en navegador real con la imagen maestra generada como base y variante
idéntica (control matemático closed): decodificación, vista previa, cero POST
antes de guardar, dos uploads explícitos, identidad nueva pendiente y SHA del
PNG descargado coincidente. El kit no se guardó en el backend compartido antiguo;
la persistencia del contrato nuevo se probó mediante tests Python aislados.
Este control no prueba una boca abierta, audio sincronizado ni export de actuación.

Cambiar de pose, kit, región o workspace durante una operación invalida su
resultado. Una cancelación después de subir un archivo puede dejar un upload
sin referencia: no se borran automáticamente archivos de otros trabajos. La
promoción a assets finales y recogida segura de huérfanos quedan pendientes.

Revisión independiente de R1: corregida la reaparición de una preparación al
volver al input anterior; bloqueo externo durante upload; guardia de vigencia
para el borrado legacy de boca; y bloqueo de ese borrado cuando **cualquier**
estado de boca tiene parches. Ninguna de estas correcciones certifica calidad
artística, autenticidad de hashes ni alineación automática.
