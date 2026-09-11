import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { SceneFx } from './types'
import { parseWorldSfx } from './world'
import { syncWorldSfx, type WorldSfxGpu } from './worldRuntime'

type Gpu = {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  nodes: Map<string, WorldSfxGpu>
  canvas: HTMLCanvasElement
}

let gpu: Gpu | null | undefined

function ensureGpu(): Gpu | null {
  if (gpu !== undefined) return gpu
  try {
    if (typeof document === 'undefined') { gpu = null; return null }
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 640
    const renderer = new WebGLRenderer({
      canvas, alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
    })
    renderer.setClearColor(new Color(0x000000), 0)
    renderer.setSize(640, 640, false)
    renderer.toneMappingExposure = 1.25
    const scene = new Scene()
    const camera = new PerspectiveCamera(34, 1, 0.08, 24)
    camera.position.set(2.7, 1.85, 5.1)
    camera.lookAt(0, 0.48, 0)
    gpu = { renderer, scene, camera, nodes: new Map(), canvas }
    return gpu
  } catch {
    gpu = null
    return null
  }
}

/** Same 3D blast, filmed for the 2D overlay. */
export function rasterizeExplosion(cue: SceneFx, time: number): HTMLCanvasElement | null {
  const pack = ensureGpu()
  if (!pack) return null
  const span = Math.max(0.35, cue.end - cue.start || 1)
  const world = parseWorldSfx([{
    id: `overlay-${cue.id}`,
    kind: 'explosion',
    start: 0,
    end: span,
    position: { x: 0, y: 0.38, z: 0 },
    scale: 1.55 + cue.intensity * 0.35,
    color: cue.color,
    intensity: cue.intensity,
    seed: cue.seed,
  }])
  syncWorldSfx(pack.scene, pack.nodes, world, time, [])
  pack.renderer.setClearColor(new Color(0x000000), 0)
  pack.renderer.clear()
  pack.renderer.render(pack.scene, pack.camera)
  return pack.canvas
}
