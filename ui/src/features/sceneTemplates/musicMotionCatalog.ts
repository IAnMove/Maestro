import type { SceneTemplateDefinition } from './catalog'

/**
 * Candidate-only musical motion definitions.
 *
 * This module describes the contract for the motion pack.  The choreography
 * compiler, asset picker and approval registry consume it separately; merely
 * adding an entry here must not generate an asset or approve a preview.
 */

export type MusicMotionIntensity = 'moderate' | 'high'

type MusicMotionSlotName = 'subject_1' | 'subject_2' | 'background' | 'prop_1'

type MusicMotionSlot = {
  readonly id: MusicMotionSlotName
  readonly required: boolean
  readonly kinds: readonly ['image']
  readonly description: string
}

type MusicMotionDefinition = Omit<SceneTemplateDefinition, 'slots'> & {
  readonly slots: readonly MusicMotionSlot[]
  readonly motionIntensity: MusicMotionIntensity
  readonly rhythmic?: boolean
}

const IMAGE = ['image'] as const

const slot = (
  id: MusicMotionSlotName,
  description: string,
): MusicMotionSlot => ({ id, required: true, kinds: IMAGE, description })

const composition = (
  subject: string,
  background: string,
  extras: { subject2?: string; prop1?: string } = {},
): readonly MusicMotionSlot[] => [
  slot('subject_1', subject),
  ...(extras.subject2 ? [slot('subject_2', extras.subject2)] : []),
  slot('background', background),
  ...(extras.prop1 ? [slot('prop_1', extras.prop1)] : []),
]

const COMMON_LIMITS = [
  'Sólo usa capas de imagen; no usa GLB, rig, física, colisiones ni caminata automática.',
  'La trayectoria se expresa con keyframes deterministas y editables; no hay simulación física.',
  'subject_1, subject_2 y prop_1 deben ser recortes con alpha limpio cuando sean figuras u objetos; no se repiten assets para cubrir slots.',
  'background debe ser una placa de imagen durable y legible; no se genera ni se sustituye silenciosamente.',
  'No genera vídeo ni audio con IA y no modifica la canción adjunta.',
  'No utiliza estroboscopio ni flashes blancos deliberados. Algunos movimientos incluyen giros o desplazamientos fuertes: evita repetición densa y revisa el resultado para detectar mareo.',
  'El alpha limpio es un requisito de entrada; este catálogo no inspecciona píxeles ni garantiza que el asset lo cumpla.',
  'Los movimientos que declaran un strip repiten la misma imagen en el eje indicado; pueden mostrar costuras si el asset no es tileable. No garantizan continuidad y requieren revisión artística de la preview y del render antes de aprobarlos; este catálogo no valida píxeles ni tileabilidad.',
] as const

type MotionSpec = {
  id: string
  title: string
  description: string
  subject: string
  background: string
  subject2?: string
  prop1?: string
  note: string
  duration?: number
  motionIntensity?: MusicMotionIntensity
}

const makeTemplate = (spec: MotionSpec): MusicMotionDefinition => {
  const slots = composition(spec.subject, spec.background, { subject2: spec.subject2, prop1: spec.prop1 })
  const requiredSlots = slots.filter(item => item.required).map(item => item.id).join(', ')
  return {
    id: spec.id,
    version: 1,
    status: 'candidate',
    family: 'music',
    title: spec.title,
    description: spec.description,
    slots,
    limits: [
      ...COMMON_LIMITS,
      spec.note,
    ],
    promptExample: `Usa el movimiento musical candidato "${spec.id}" (${spec.title}). Rellena exactamente los slots obligatorios ${requiredSlots}; usa sólo imágenes proporcionadas, con subject_1 como foco principal y background como placa de entorno. Respeta los límites del movimiento y conserva el texto y el audio fuera de esta plantilla.`,
    defaultDuration: spec.duration ?? 4,
    motionIntensity: spec.motionIntensity ?? 'moderate',
  }
}

const DEFINITIONS = [
  makeTemplate({
    id: 'music-spiral-exit',
    title: 'Salida en espiral',
    description: 'El foco se encoge y se desvanece en el centro mientras gira dos vueltas, produciendo una salida gráfica compacta.',
    subject: 'Figura u objeto protagonista recortado, legible durante el giro y preparado para reducirse hasta casi desaparecer.',
    background: 'Placa con un centro limpio y contraste suficiente para que el giro y el desvanecimiento sean visibles.',
    note: 'La salida es una rotación y escala 2D de dos vueltas; no describe una espiral ascendente, órbita ni profundidad 3D.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-speed-flight',
    title: 'Vuelo de velocidad',
    description: 'El protagonista cruza el encuadre de izquierda a derecha en una pasada rápida con una salida clara.',
    subject: 'Figura u objeto recortado orientado hacia el trayecto, sin exigir un ciclo de locomoción.',
    background: 'Placa con carril, horizonte o rayas gráficas que sugiera velocidad sin depender de motion blur; puede desplazarse hacia la izquierda mediante un strip horizontal que repite la imagen y puede mostrar costuras si la fuente no es tileable en horizontal.',
    note: 'La ruta va de izquierda a derecha y el fondo puede usar un strip horizontal hacia la izquierda a 95 unidades por segundo; no garantiza continuidad, requiere revisar artísticamente preview y render, no es sincronización al compás ni vuelo físico.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-infinite-fall',
    title: 'Caída infinita',
    description: 'El protagonista entra desde arriba, desciende por una ruta finita y se hace pequeño hasta salir por abajo.',
    subject: 'Figura u objeto recortado con orientación coherente durante el descenso y una silueta que tolere la reducción.',
    background: 'Placa vertical o campo gráfico que mantenga legible la entrada superior y la salida inferior; un strip vertical repite la imagen y puede mostrar costuras si la fuente no es tileable en vertical.',
    note: 'Es una única ruta de arriba abajo con escala decreciente; el strip vertical no garantiza continuidad y requiere revisar artísticamente preview y render; no hay bucle limpio, mundo infinito, gravedad ni profundidad 3D.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-pinball',
    title: 'Rebote de pinball',
    description: 'El foco recorre una sucesión de rebotes angulares y acentos de escala como una bola de pinball gráfica.',
    subject: 'Objeto o personaje recortado que funciona como foco móvil y conserva una lectura clara en cada rebote.',
    background: 'Placa con tablero abstracto, bordes y zonas de rebote dibujadas, sin necesidad de piezas 3D.',
    note: 'Los rebotes son puntos de una trayectoria escrita; no hay colisiones, flippers ni solver de pinball.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-boomerang',
    title: 'Bumerán',
    description: 'El sujeto se aleja por una curva abierta y vuelve al punto de partida con una respuesta visual reconocible.',
    subject: 'Figura u objeto recortado que pueda leerse durante la ida y el regreso.',
    background: 'Placa con espacio negativo y una línea de horizonte que haga visible el arco de ida y vuelta.',
    note: 'El arco es keyframeado y estilizado; no simula aerodinámica, lanzamiento ni física de proyectiles.',
  }),
  makeTemplate({
    id: 'music-cannon-launch',
    title: 'Lanzamiento de cañón',
    description: 'El foco sale disparado y abandona el cuadro por la zona superior derecha siguiendo un arco rápido.',
    subject: 'Figura u objeto recortado que tolere el giro de salida y permanezca identificable antes de abandonar el encuadre.',
    background: 'Placa con una boca de cañón o carril gráfico integrado en el entorno, sin requerir un asset extra.',
    note: 'La ruta arqueada termina fuera del cuadro; no hay aterrizaje, pausa final, balística, fuerzas ni impacto real.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-orbit-duel',
    title: 'Duelo orbital',
    description: 'Dos focos se cruzan en arcos opuestos alrededor de un eje central para crear tensión de videoclip.',
    subject: 'Primer personaje u objeto recortado que define el primer arco del duelo.',
    subject2: 'Segundo personaje u objeto recortado, con silueta distinta, que responde desde el arco opuesto.',
    background: 'Placa con eje central y espacio suficiente para distinguir ambos recorridos.',
    note: 'Los dos arcos son trayectorias 2D independientes; no hay órbita física, contacto ni oclusión global.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-high-five',
    title: 'Choca esos cinco',
    description: 'Dos personajes se aproximan a un punto común, marcan el encuentro y se separan con un rebote breve.',
    subject: 'Primer personaje recortado con una pose que deje espacio visual para el gesto compartido.',
    subject2: 'Segundo personaje recortado, orientado hacia el primero y con una silueta no idéntica por defecto.',
    background: 'Placa sencilla con un punto de encuentro despejado y contraste suficiente para las dos figuras.',
    note: 'El encuentro es una pose sincronizada; no detecta manos, contacto ni articulaciones.',
  }),
  makeTemplate({
    id: 'music-magnet-pull',
    title: 'Tirón magnético',
    description: 'El primer foco permanece casi estable mientras atrae al segundo, que rebota y se estabiliza.',
    subject: 'Primer personaje u objeto recortado que actúa como polo visual estable.',
    subject2: 'Segundo personaje u objeto recortado que se aproxima, rebota y queda legible junto al primer polo.',
    background: 'Placa con una línea o campo gráfico que haga visible la dirección del tirón.',
    note: 'Sólo subject_2 ejecuta la aproximación y el rebote amortiguado; no calcula campos magnéticos, masas ni colisiones.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-ricochet-pass',
    title: 'Pase de rebotes',
    description: 'Un objeto recortado rebota entre varios puntos mientras el foco permanece quieto como referencia del pase.',
    subject: 'Personaje u objeto recortado que permanece quieto y sirve de referencia; no necesita un ciclo de caminar.',
    background: 'Placa con pasillo o marcas de trayectoria que mantenga el pase dentro de los límites del encuadre.',
    prop1: 'Objeto recortado pequeño, como balón, micrófono o carta, que ejecuta todos los rebotes del pase.',
    note: 'prop_1 es obligatorio y es el único elemento móvil; subject_1 permanece quieto y no hay colisiones físicas.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-portal-swap',
    title: 'Intercambio de portales',
    description: 'Dos focos desaparecen y reaparecen en posiciones intercambiadas mediante cortes gráficos controlados.',
    subject: 'Primer personaje u objeto recortado que ocupa el portal de salida inicial.',
    subject2: 'Segundo personaje u objeto recortado que ocupa el portal opuesto y permite leer el intercambio.',
    background: 'Placa con dos zonas despejadas para sugerir portales sin añadir geometría o partículas obligatorias.',
    note: 'Los portales son estados de opacidad y posición; no hay teletransporte 3D, espacio continuo ni oclusión.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-trampoline',
    title: 'Salto de trampolín',
    description: 'El protagonista baja, rebota y vuelve a caer con un pulso vertical exagerado y legible.',
    subject: 'Figura u objeto recortado que soporte un rebote vertical sin requerir deformación de malla.',
    background: 'Placa con una base visual o escenario que marque el punto de despegue y de aterrizaje.',
    note: 'El rebote usa escala uniforme y posición de la capa; no hay squash-and-stretch por ejes, deformación del bitmap ni elasticidad real.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-pendulum',
    title: 'Péndulo musical',
    description: 'El foco oscila de lado a lado alrededor de una posición fija con una cadencia hipnótica.',
    subject: 'Figura u objeto recortado que conserva orientación reconocible durante la oscilación.',
    background: 'Placa con una referencia superior o central que haga legible el eje del péndulo.',
    note: 'La oscilación usa keyframes angulares; no resuelve gravedad, cuerda, pivote físico ni colisiones.',
  }),
  makeTemplate({
    id: 'music-rubber-band',
    title: 'Goma elástica',
    description: 'El foco se separa del centro, acumula tensión visual y regresa con una liberación musical.',
    subject: 'Figura u objeto recortado que pueda cambiar de escala sin perder su silueta principal.',
    background: 'Placa con dos extremos o anclajes gráficos que expliquen la dirección de la tensión.',
    note: 'La tensión usa desplazamiento en X y rotación, sin escalar la capa; no hay deformación de goma ni solver de fuerzas.',
  }),
  makeTemplate({
    id: 'music-card-toss',
    title: 'Lanzamiento de carta',
    description: 'El foco entra, mantiene una lectura breve y sale disparado del encuadre con un giro marcado.',
    subject: 'Carta, objeto o personaje recortado que pueda mantener su lectura y girar mediante rotación de capa.',
    background: 'Placa de mesa, escenario o espacio negativo donde se distinga el arco del lanzamiento.',
    note: 'La entrada, pausa legible y salida propulsada están escritas como keyframes 2D; no hay aterrizaje, perspectiva 3D ni física de cartas.',
  }),
  makeTemplate({
    id: 'music-staircase-pop',
    title: 'Ascenso por escalones',
    description: 'El protagonista sube por posiciones discretas con acentos de escala que recuerdan a un sampler.',
    subject: 'Figura u objeto recortado que salta entre posiciones y no necesita caminar.',
    background: 'Placa con escalones o franjas gráficas integradas para que cada salto tenga una referencia visual.',
    note: 'Los escalones son posiciones de composición, no una escalera navegable ni un ciclo de locomoción.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-accordion-clones',
    title: 'Clones acordeón',
    description: 'El mismo foco aparece en una expansión y contracción de posiciones, como un acordeón visual.',
    subject: 'Figura u objeto recortado aprobado que pueda repetirse visualmente sin cambiar de identidad.',
    background: 'Placa amplia y despejada para que las copias temporales no oculten el eje principal.',
    note: 'Las copias son instancias acotadas de la misma imagen; no generan personajes nuevos ni crowd simulation.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-domino-wave',
    title: 'Ola de dominó',
    description: 'Copias limitadas del foco se inclinan en secuencia y recuperan su posición formando una ola visual.',
    subject: 'Figura u objeto recortado que pueda repetirse y tolerar una inclinación breve sin perder su pose.',
    background: 'Placa horizontal con un eje claro para leer el avance de la ola.',
    note: 'Las copias se inclinan y recuperan su orientación; no entran ni salen como personajes nuevos y no hay dominós físicos ni colisiones.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-conveyor',
    title: 'Cinta transportadora',
    description: 'El foco se desplaza en una dirección constante mientras el entorno conserva una sensación de cadena.',
    subject: 'Figura u objeto recortado que viaja horizontalmente sin necesitar animación de piernas.',
    background: 'Placa con banda, flechas o módulos repetibles que sugieran una cinta plana; un strip horizontal repite la imagen y puede mostrar costuras si la fuente no es tileable en horizontal.',
    note: 'El transporte es un desplazamiento de capas con bucle opcional; el strip horizontal no garantiza continuidad y requiere revisar artísticamente preview y render; no existe maquinaria, física ni colisión.',
  }),
  makeTemplate({
    id: 'music-spotlight-relay',
    title: 'Relevo de focos',
    description: 'Dos presencias se alternan el centro de atención mediante entradas y salidas de luz y escala.',
    subject: 'Primer personaje u objeto recortado que recibe el primer foco del relevo.',
    subject2: 'Segundo personaje u objeto recortado que toma el foco después y conserva una identidad separada.',
    background: 'Placa oscura o escénica con dos zonas de foco legibles y sin flashes blancos.',
    note: 'El foco se expresa con opacidad, escala y efectos suaves; no hay iluminación física ni seguimiento de rostros.',
    duration: 6,
    motionIntensity: 'moderate',
  }),
  makeTemplate({
    id: 'music-corkscrew-rise',
    title: 'Ascenso sacacorchos',
    description: 'El protagonista asciende con una rotación de capa y una deriva lateral que dibujan un sacacorchos.',
    subject: 'Figura u objeto recortado con silueta estable durante la rotación de la capa.',
    background: 'Placa vertical con marcas de altura y suficiente espacio para el recorrido helicoidal.',
    note: 'El sacacorchos es un camino 2D con rotación; no es una trayectoria 3D ni una cámara orbital.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-shockwave',
    title: 'Onda expansiva',
    description: 'El foco central permanece legible mientras un zoom de movimiento marca el golpe visual.',
    subject: 'Figura u objeto recortado que permanece en el centro del impacto visual.',
    background: 'Placa con espacio negativo alrededor del sujeto para que la expansión no quede recortada.',
    note: 'La onda es un acento de movimiento y escala sin cambio de opacidad; no simula explosión, presión ni daño físico.',
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-satellite-swarm',
    title: 'Enjambre de satélites',
    description: 'El foco central queda acompañado por un satélite u objeto clonado que recorre órbitas visuales controladas.',
    subject: 'Figura u objeto recortado que funciona como centro estable del enjambre.',
    background: 'Placa espacial o abstracta con espacio suficiente para separar centro y satélites.',
    prop1: 'Un satélite u objeto pequeño en un recorte transparente; el compositor puede clonarlo hasta cinco veces alrededor del centro.',
    note: 'prop_1 es obligatorio y es un único asset que puede instanciarse cinco veces; no hay IA de enjambre, física ni profundidad 3D.',
    duration: 6,
    motionIntensity: 'high',
  }),
  makeTemplate({
    id: 'music-crowd-surf',
    title: 'Surf entre multitudes',
    description: 'El protagonista se desplaza sobre copias de una franja de público que actúan como apoyo visual.',
    subject: 'Figura u objeto recortado que se mantiene claramente por encima de la franja de apoyo.',
    background: 'Placa de concierto con espacio superior y contraste para separar protagonista y las copias del público.',
    prop1: 'Franja o grupo de siluetas de público recortadas que se copia bajo el protagonista como soporte visual.',
    note: 'prop_1 es obligatorio y sus copias forman el soporte; no hay una onda de fondo, cuerpos generados, manos, equilibrio ni crowd physics.',
    duration: 6,
    motionIntensity: 'high',
  }),
] as const

export const MUSIC_MOTION_TEMPLATES: readonly SceneTemplateDefinition[] = DEFINITIONS
