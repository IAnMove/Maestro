import { createCharacterKit, mountCharacterKitLayers } from '../../src/lib/characterKit.ts'

/**
 * Small, deterministic assets for the Video 3D production baseline.
 *
 * The registry below contains data URLs with hand-authored geometry only.
 * Recipes refer to deterministic fixture filenames and the test's file mapper
 * resolves those names to the inline SVG. They are not generated outputs and
 * do not require a backend, a model or a browser renderer.
 */
export const inlineSvg = (name, fill, accent = '#f8fafc') => {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="${fill}"/><path d="M0 92 Q28 68 56 92 T112 92 T168 92 V120 H0Z" fill="${accent}" opacity=".45"/><circle cx="24" cy="24" r="4" fill="#f8fafc"/><circle cx="132" cy="36" r="3" fill="#f8fafc"/><text x="80" y="110" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#f8fafc">${name}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

const svgData = markup => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

const characterBaseSvg = (name, fill, accent) => svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><path d="M39 117 Q40 82 80 80 Q120 82 121 117Z" fill="${fill}"/><circle cx="80" cy="52" r="32" fill="${accent}"/><path d="M48 33 Q80 8 112 33" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/><text x="80" y="116" text-anchor="middle" font-family="sans-serif" font-size="8" fill="#0f172a">${name}</text></svg>`,
)

const faceOverlaySvg = geometry => svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">${geometry}</svg>`,
)

const asset = (id, name, source, kind = 'image') => ({
  id,
  name,
  source,
  kind,
  alphaStatus: kind === 'overlay' ? 'transparent' : 'opaque',
  reviewState: 'approved',
})

const mouthAsset = (kitId, state) => asset(
  `${kitId}-mouth-${state}`,
  `${kitId} mouth ${state}`,
  faceOverlaySvg({
    closed: '<path d="M68 73 Q80 77 92 73" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>',
    small: '<ellipse cx="80" cy="73" rx="8" ry="4" fill="#111827"/>',
    wide: '<path d="M59 69 Q80 91 101 69 Q80 78 59 69Z" fill="#111827"/>',
    round: '<ellipse cx="80" cy="73" rx="10" ry="13" fill="#111827"/>',
  }[state]),
  'overlay',
)

const createFixtureKit = (name, fill, accent) => {
  const kit = createCharacterKit(name)
  const id = kit.id
  const base = { ...asset(`${id}-base`, `${name} base`, characterBaseSvg(name, fill, accent)), alphaStatus: 'transparent' }
  return {
    ...kit,
    base,
    poses: {
      base: base,
    },
    mouth: {
      closed: mouthAsset(id, 'closed'),
      small: mouthAsset(id, 'small'),
      wide: mouthAsset(id, 'wide'),
      round: mouthAsset(id, 'round'),
    },
    eyes: {
      open: asset(`${id}-eyes-open`, `${name} eyes open`, faceOverlaySvg('<circle cx="69" cy="49" r="4" fill="#111827"/><circle cx="91" cy="49" r="4" fill="#111827"/>'), 'overlay'),
      blink: asset(`${id}-eyes-blink`, `${name} eyes blink`, faceOverlaySvg('<path d="M63 49 H75 M85 49 H97" stroke="#111827" stroke-width="4" stroke-linecap="round"/>'), 'overlay'),
    },
    anchors: {
      base: {
        mouth: { offsetX: 0, offsetY: -18, scale: .05, rotation: 0 },
        eyes: { offsetX: 0, offsetY: -29, scale: .12, rotation: 0 },
      },
    },
    provenance: [{ method: 'video3d-production-fixture', source: 'inline-svg' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const layersForKit = (kit, transform, duration) => mountCharacterKitLayers(kit, 'base', transform, duration)

const layerAssetId = (layer, kitId) => {
  if (layer.faceBinding?.role === 'mouth') return `${kitId}-mouth-${layer.faceBinding.state}`
  if (layer.faceBinding?.role === 'eyes' || layer.faceBinding?.role === 'blink') return `${kitId}-eyes-${layer.faceBinding.state === 'blink' ? 'blink' : 'open'}`
  return `${kitId}-base`
}

const recipeLayer = (layer, kitId) => ({
  id: layer.id,
  name: layer.name,
  type: layer.type,
  asset: layer.type === 'image' || layer.type === 'overlay' ? layerAssetId(layer, kitId) : undefined,
  z: layer.z,
  visible: layer.visible,
  locked: layer.locked,
  fill: layer.fill,
  transform: layer.transform,
  animation: layer.animation,
  faceBinding: layer.faceBinding,
  relationship: layer.relationship,
})

const camera = id => ({ id, name: 'Camera', type: 'camera', cameraPreset: 'camera-locked', z: 1000 })

const plateLayer = (id, assetId, duration, startX, endX) => ({
  id,
  name: `${assetId} plate`,
  type: 'image',
  asset: assetId,
  z: 0,
  fill: true,
  transform: { x: 50, y: 50, scale: 1, opacity: 1, rotation: 0 },
  animation: {
    start: { x: startX, y: 50, scale: 1, opacity: 1, rotation: 0 },
    end: { x: endX, y: 50, scale: 1, opacity: 1, rotation: 0 },
    duration,
    curve: 'linear',
    keyframes: [
      { id: `${id}-start`, time: 0, x: startX, y: 50, scale: 1, opacity: 1, rotation: 0, curve: 'linear' },
      { id: `${id}-end`, time: duration, x: endX, y: 50, scale: 1, opacity: 1, rotation: 0, curve: 'linear' },
    ],
  },
})

const recipeAsset = (id, kind, source, sourceByFilename) => {
  const filename = `${id}.svg`
  sourceByFilename[filename] = source
  return { id, kind, source: filename }
}

const recipeAssetsFor = (plate, luma, brin, sourceByFilename) => [
  recipeAsset('plate-aurora', 'image', plate.source, sourceByFilename),
  ...[
    ['luma', luma],
    ['brin', brin],
  ].flatMap(([kitId, kit]) => [
    recipeAsset(`${kitId}-base`, 'image', kit.base.source, sourceByFilename),
    ...['closed', 'small', 'wide', 'round'].map(state => recipeAsset(`${kitId}-mouth-${state}`, 'image', kit.mouth[state].source, sourceByFilename)),
    recipeAsset(`${kitId}-eyes-open`, 'image', kit.eyes.open.source, sourceByFilename),
    recipeAsset(`${kitId}-eyes-blink`, 'image', kit.eyes.blink.source, sourceByFilename),
  ]),
]

/**
 * A three-shot, two-character fixture. The same source is reused by each kit
 * and every shot declares its own audio/dialogue scope, including silence.
 */
export const createVideo3dProductionFixture = () => {
  const luma = createFixtureKit('Luma', '#fef3c7', '#f97316')
  const brin = createFixtureKit('Brin', '#dbeafe', '#2563eb')
  const plate = asset('plate-aurora', 'Aurora plate', inlineSvg('aurora-plate', '#0f172a', '#22d3ee'))
  const sourceByFilename = {}
  const lumaDuration = 2.4
  const brinDuration = 2.8
  const lumaLayers = layersForKit(luma, { x: 34, y: 58, scale: .62, opacity: 1, rotation: 0 }, lumaDuration)
  const brinLayers = layersForKit(brin, { x: 66, y: 58, scale: .62, opacity: 1, rotation: 0 }, brinDuration)
  const lumaRecipeLayers = [camera('shot-luma-camera'), plateLayer('shot-luma-plate', 'plate-aurora', lumaDuration, 50, 54), ...lumaLayers.map(layer => recipeLayer(layer, 'luma'))]
  const brinRecipeLayers = [camera('shot-brin-camera'), plateLayer('shot-brin-plate', 'plate-aurora', brinDuration, 54, 50), ...brinLayers.map(layer => recipeLayer(layer, 'brin'))]
  const silentDuration = 1.6
  const silentLayers = [camera('shot-silent-camera'), plateLayer('shot-silent-plate', 'plate-aurora', silentDuration, 50, 50), ...lumaLayers.map(layer => recipeLayer(layer, 'luma'))]
  const lumaMouthLayerIds = lumaLayers.filter(layer => layer.faceBinding?.role === 'mouth').map(layer => layer.id)
  const brinMouthLayerIds = brinLayers.filter(layer => layer.faceBinding?.role === 'mouth').map(layer => layer.id)
  const lumaText = '«La nieve canta en español.»'
  const brinText = '“The snow sings in English.”'
  const recipe = {
    version: 1,
    name: 'video3d-production-baseline',
    record: false,
    save: false,
    assets: recipeAssetsFor(plate, luma, brin, sourceByFilename),
    audio: [
      { id: 'voice-luma-es', kind: 'speech', source: 'fixture/luma-es.wav', prompt: lumaText, model: 'fixture-tts-es' },
      { id: 'voice-brin-en', kind: 'speech', source: 'fixture/brin-en.wav', prompt: brinText, model: 'fixture-tts-en' },
    ],
    dialogueBeats: [
      { id: 'beat-luma-es', text: lumaText, start: .25, end: 2.1, mouthLayerIds: lumaMouthLayerIds, audioTrackId: 'voice-luma-es', confidence: 'known-text' },
      { id: 'beat-brin-en', text: brinText, start: .35, end: 2.4, mouthLayerIds: brinMouthLayerIds, audioTrackId: 'voice-brin-en', confidence: 'known-text' },
    ],
    shots: [
      { name: 'silent-establishing', duration: silentDuration, audioTrackIds: [], dialogueBeatIds: [], layers: silentLayers },
      { name: 'luma-spanish', duration: lumaDuration, audioTrackIds: ['voice-luma-es'], dialogueBeatIds: ['beat-luma-es'], layers: lumaRecipeLayers },
      { name: 'brin-english', duration: brinDuration, audioTrackIds: ['voice-brin-en'], dialogueBeatIds: ['beat-brin-en'], layers: brinRecipeLayers },
    ],
    scene: {
      width: 320,
      // Scene recipes currently enforce a 256px minimum height. This is a
      // compact contract fixture, not a visual-quality/render benchmark.
      height: 256,
      fps: 30,
      duration: lumaDuration,
      layers: lumaRecipeLayers,
    },
  }
  return { brin, luma, plate, recipe, lumaText, brinText, sourceByFilename }
}

export const fixtureFileUrl = sourceByFilename => filename => sourceByFilename[filename] || filename
