import { applyActionTemplate } from './src/features/scene3d/actionTemplates.ts'
import { syncDressing } from './src/features/scene3d/dressing.ts'
import {
  applyLight,
  createWorld,
  fitGltf,
  paintWorld,
  placeSlot,
  placeholderMesh,
  pruneSlots,
  renderWorld,
  resizeWorld,
} from './src/features/scene3d/gpu.ts'
import { FACE_PACK_IDS, FACE_PACKS } from './src/features/scene3d/speech/facePackExamples.ts'
import { expressionAt, mouthAt } from './src/features/scene3d/speech/track.ts'
import { VISEMES } from './src/features/scene3d/speech/types.ts'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const SHOTS = ['hangar-talk', 'sea-talk', 'voxel-talk'] as const
const LABELS: Record<typeof SHOTS[number], string> = {
  'hangar-talk': 'Hangar · CRT + skull',
  'sea-talk': 'Sea · CRT + skull',
  'voxel-talk': 'Roof · cube + voxel skull',
}
const host = document.querySelector('#view') as HTMLDivElement
const caption = document.querySelector('#caption') as HTMLParagraphElement
const status = document.querySelector('#status') as HTMLParagraphElement
const strip = document.querySelector('#strip') as HTMLDivElement
const atlas = document.querySelector('#atlas') as HTMLDivElement
const voice = document.querySelector('#voice') as HTMLAudioElement
const params = new URLSearchParams(location.search)
const startId = SHOTS.includes(params.get('shot') as typeof SHOTS[number]) ? params.get('shot') as typeof SHOTS[number] : 'hangar-talk'
const freeze = Number(params.get('t'))

let current = applyActionTemplate(startId)!
let playing = Number.isFinite(freeze)
let started = performance.now()
const world = createWorld(host, current.light, current.camera.fov)
const loader = new GLTFLoader()
resizeWorld(world, host)

for (const id of SHOTS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = LABELS[id]
  button.dataset.shot = id
  button.setAttribute('aria-pressed', id === current.templateId ? 'true' : 'false')
  button.addEventListener('click', () => select(id))
  strip.append(button)
}

for (const id of FACE_PACK_IDS) {
  const figure = document.createElement('figure')
  const img = document.createElement('img')
  img.src = FACE_PACKS[id].url
  img.alt = `${id} visemes and expressions`
  const cap = document.createElement('figcaption')
  cap.textContent = `${id} · 9 visemes × 6 expressions`
  figure.append(img, cap)
  atlas.append(figure)
}

function mount(doc: typeof current) {
  pruneSlots(world, doc.slots)
  syncDressing(world, doc.dressing)
  world.floor.visible = false
  applyLight(world.dir, doc.light)
  playing = Number.isFinite(freeze)
  let pending = 0
  for (const slot of doc.slots) {
    placeSlot(world, slot, placeholderMesh(slot), [], 1, false)
    if (!slot.sourceUrl) continue
    pending++
    loader.load(slot.sourceUrl, gltf => {
      if (current.slots.find(item => item.id === slot.id)?.sourceUrl !== slot.sourceUrl) {
        gltf.scene.removeFromParent()
        return
      }
      const baseScale = fitGltf(gltf.scene, slot)
      placeSlot(world, slot, gltf.scene, gltf.animations, baseScale, true)
      pending--
      if (pending === 0 && !Number.isFinite(freeze)) {
        playing = true
        started = performance.now()
        void voice.play().catch(() => undefined)
      }
    })
  }
}

function select(id: typeof SHOTS[number]) {
  current = applyActionTemplate(id)!
  mount(current)
  caption.textContent = `${LABELS[id]} · ${current.dressing} · ${current.duration}s · synthetic vowels`
  for (const button of strip.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.dataset.shot === id ? 'true' : 'false')
  }
  voice.currentTime = 0
}

select(startId)
const tick = (now: number) => {
  const seconds = Number.isFinite(freeze)
    ? Math.max(0, Math.min(current.duration - 0.01, freeze))
    : playing ? ((now - started) / 1000) % current.duration : 0
  paintWorld(world, current, seconds)
  renderWorld(world)
  const labels = current.slots.map(slot => {
    if (!slot.speech) return slot.id
    const mouth = VISEMES[mouthAt(slot.speech, seconds).b]
    return `${slot.id}: ${expressionAt(slot.speech, seconds)}/${mouth}`
  })
  status.textContent = `${seconds.toFixed(2)}s · ${labels.join(' · ')}`
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
window.addEventListener('resize', () => resizeWorld(world, host))
document.addEventListener('click', () => { void voice.play().catch(() => undefined) }, { once: true })
