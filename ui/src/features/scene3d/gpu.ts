import {
  AnimationMixer,
  BackSide,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { cameraEyeAtTime, cameraLookAtTime } from './camera.ts'
import { scene3dClipLocalTime } from './clock.ts'
import { cylinderUvOffset, isCylinderBackdrop, slotMountKey } from './backdrop.ts'
import { scene3dSlotColor } from './document.ts'
import type { Scene3DClipCatalogEntry, Scene3DDocument, Scene3DLight, Scene3DSlot } from './types.ts'

export const CYLINDER_RADIUS = 12
export const CYLINDER_HEIGHT = 10

export const MAX_VIEW_WIDTH = 1280
export const MAX_VIEW_HEIGHT = 720
export const MAX_PIXEL_RATIO = 1.25

export type SlotGpu = {
  sourceUrl: string
  mountKey: string
  clipKey: string
  root: Object3D
  baseScale: number
  animations: GLTF['animations']
  mixer: AnimationMixer | null
  kind: 'model' | 'image'
  loopTexture: Texture | null
  loopSpeed: number
  looping: boolean
  loaded: boolean
}

export type GpuWorld = {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  dir: DirectionalLight
  slots: Map<string, SlotGpu>
}

export function clipKeyOf(clip: Scene3DSlot['clip']): string {
  return clip ? `${clip.index}\0${clip.name}` : ''
}

export function catalogFromClips(animations: GLTF['animations']): Scene3DClipCatalogEntry[] {
  return animations.map((clip: { name: string; duration: number }, index: number) => ({
    index,
    name: clip.name,
    durationSeconds: Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : null,
  }))
}

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && 'isTexture' in value)
}

export function disposeMaterial(material: Material) {
  material.dispose()
  for (const value of Object.values(material)) {
    if (isTexture(value)) value.dispose()
  }
}

export function disposeObject(object: Object3D) {
  object.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) disposeMaterial(material)
  })
}

export function viewSize(host: HTMLElement) {
  const width = host.clientWidth || 640
  const height = host.clientHeight || 360
  const scale = Math.min(1, MAX_VIEW_WIDTH / width, MAX_VIEW_HEIGHT / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function applyLight(dir: DirectionalLight, light: Scene3DLight) {
  dir.color = new Color(light.color)
  dir.intensity = light.intensity
  dir.position
    .set(-light.direction[0], -light.direction[1], -light.direction[2])
    .normalize()
    .multiplyScalar(6)
}

export function prepareBackdropTexture(texture: Texture) {
  texture.wrapS = RepeatWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function makeStripeTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  if (ctx) {
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? '#4a6078' : '#1c2838'
      ctx.fillRect(i * 32, 0, 32, 16)
    }
  }
  return prepareBackdropTexture(new CanvasTexture(canvas))
}

export function imageBackdropMesh(slot: Scene3DSlot, texture: Texture | null): Mesh {
  const material = new MeshBasicMaterial({
    map: texture,
    color: texture ? 0xffffff : 0x243044,
    depthWrite: false,
    side: isCylinderBackdrop(slot) ? BackSide : DoubleSide,
  })
  const scale = Math.max(0.2, slot.scale)
  if (isCylinderBackdrop(slot)) {
    const mesh = new Mesh(new CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_HEIGHT, 48, 1, true), material)
    mesh.position.set(0, CYLINDER_HEIGHT * 0.35 * scale, 0)
    mesh.scale.setScalar(scale)
    mesh.rotation.y = slot.rotationY
    mesh.renderOrder = -1
    return mesh
  }
  const mesh = new Mesh(new PlaneGeometry(2, 1.125), material)
  mesh.position.set(slot.position[0], slot.position[1] + 2.2, slot.position[2])
  mesh.rotation.y = slot.rotationY
  mesh.scale.setScalar(scale)
  mesh.renderOrder = -1
  return mesh
}

function firstMap(root: Object3D): Texture | null {
  let found: Texture | null = null
  root.traverse((child: Object3D) => {
    if (found || !(child instanceof Mesh)) return
    const material = Array.isArray(child.material) ? child.material[0] : child.material
    if (material && 'map' in material && isTexture(material.map)) found = material.map
  })
  return found
}

export function placeholderMesh(slot: Scene3DSlot) {
  if (slot.media === 'image') {
    const texture = isCylinderBackdrop(slot) ? makeStripeTexture() : null
    return imageBackdropMesh(slot, texture)
  }
  const color = scene3dSlotColor(slot.slot)
  const mesh = new Mesh(
    new BoxGeometry(0.6, 1.6, 0.6),
    new MeshStandardMaterial({ color: new Color(color[0] / 255, color[1] / 255, color[2] / 255) }),
  )
  mesh.position.set(slot.position[0], 0.8, slot.position[2])
  mesh.rotation.y = slot.rotationY
  return mesh
}

export function fitGltf(root: Object3D, slot: Scene3DSlot) {
  const box = new Box3().setFromObject(root)
  const size = new Vector3()
  box.getSize(size)
  const baseScale = 1.7 / Math.max(size.y, 0.001)
  root.scale.setScalar(baseScale * slot.scale)
  root.position.set(slot.position[0], slot.position[1], slot.position[2])
  root.rotation.y = slot.rotationY
  return baseScale
}

export function bindMixer(root: Object3D, animations: GLTF['animations'], slot: Scene3DSlot) {
  if (!slot.clip) return null
  const clip = animations[slot.clip.index]
  if (!clip || clip.name !== slot.clip.name) return null
  const mixer = new AnimationMixer(root)
  mixer.clipAction(clip).play()
  return mixer
}

export function dropSlot(world: GpuWorld, slotId: string) {
  const current = world.slots.get(slotId)
  if (!current) return
  current.mixer?.stopAllAction()
  world.scene.remove(current.root)
  disposeObject(current.root)
  world.slots.delete(slotId)
}

export function placeSlot(
  world: GpuWorld,
  slot: Scene3DSlot,
  root: Object3D,
  animations: GLTF['animations'],
  baseScale = 1,
  loaded = true,
) {
  dropSlot(world, slot.id)
  world.scene.add(root)
  world.slots.set(slot.id, {
    sourceUrl: slot.sourceUrl,
    mountKey: slotMountKey(slot),
    clipKey: clipKeyOf(slot.clip),
    root,
    baseScale,
    animations,
    mixer: slot.media === 'image' ? null : bindMixer(root, animations, slot),
    kind: slot.media === 'image' ? 'image' : 'model',
    loopTexture: firstMap(root),
    loopSpeed: slot.loop?.speed ?? 0,
    looping: isCylinderBackdrop(slot),
    loaded,
  })
}

export function worldAssetsReady(world: GpuWorld, slots: readonly Scene3DSlot[]): boolean {
  return slots.every(slot => {
    if (!slot.sourceUrl) return true
    const gpu = world.slots.get(slot.id)
    return Boolean(gpu && gpu.sourceUrl === slot.sourceUrl && gpu.loaded)
  })
}

export function clipMatches(gpu: Pick<SlotGpu, 'clipKey' | 'animations'>, index: number) {
  const clip = gpu.animations[index]
  return Boolean(clip && gpu.clipKey === `${index}\0${clip.name}`)
}

export function paintWorld(world: GpuWorld, document: Scene3DDocument, sceneSeconds: number) {
  const eye = cameraEyeAtTime(document.camera, sceneSeconds, document.duration, document.slots)
  const look = cameraLookAtTime(document.camera, sceneSeconds, document.duration, document.slots)
  world.camera.fov = document.camera.fov
  world.camera.position.set(eye[0], eye[1], eye[2])
  world.camera.lookAt(look[0], look[1], look[2])
  world.camera.updateProjectionMatrix()
  applyLoopOffset(world, sceneSeconds)
  for (const gpu of world.slots.values()) {
    if (!gpu.mixer) continue
    const clip = gpu.animations.find((_clip: { duration?: number }, index: number) => clipMatches(gpu, index))
    const local = scene3dClipLocalTime(sceneSeconds, clip?.duration ?? null, { loop: true })
    if (local != null) gpu.mixer.setTime(local)
  }
  world.renderer.render(world.scene, world.camera)
}

export function setWorldSize(world: GpuWorld, width: number, height: number) {
  world.renderer.setPixelRatio(1)
  world.renderer.setSize(Math.max(2, width), Math.max(2, height), false)
  world.camera.aspect = Math.max(2, width) / Math.max(2, height)
  world.camera.updateProjectionMatrix()
}

export function applyLoopOffset(world: GpuWorld, sceneSeconds: number) {
  for (const gpu of world.slots.values()) {
    if (!gpu.loopTexture) continue
    gpu.loopTexture.offset.x = gpu.looping ? cylinderUvOffset(sceneSeconds, gpu.loopSpeed) : 0
  }
}

export function syncSlotClip(world: GpuWorld, slot: Scene3DSlot) {
  const current = world.slots.get(slot.id)
  if (!current) return
  const nextKey = clipKeyOf(slot.clip)
  if (current.clipKey === nextKey) return
  current.mixer?.stopAllAction()
  current.mixer = bindMixer(current.root, current.animations, slot)
  current.clipKey = nextKey
}

export function slotNeedsReload(current: SlotGpu | undefined, slot: Scene3DSlot): boolean {
  return !current || current.mountKey !== slotMountKey(slot)
}

export function pruneSlots(world: GpuWorld, slots: readonly Scene3DSlot[]) {
  const wanted = new Set(slots.map(slot => slot.id))
  for (const id of [...world.slots.keys()]) {
    if (!wanted.has(id)) dropSlot(world, id)
  }
}

export function createWorld(host: HTMLDivElement, light: Scene3DLight, fov: number): GpuWorld {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  renderer.shadowMap.enabled = false
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  host.append(renderer.domElement)
  const scene = new Scene()
  scene.background = new Color(0x10141c)
  const camera = new PerspectiveCamera(fov, 16 / 9, 0.05, 200)
  scene.add(new HemisphereLight(0xc8d8ff, 0x2a2118, 0.55))
  const dir = new DirectionalLight(light.color, light.intensity)
  applyLight(dir, light)
  scene.add(dir)
  const floor = new Mesh(
    new CircleGeometry(11.5, 48),
    new MeshStandardMaterial({ color: 0x1c222c, roughness: 0.92 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  return { renderer, scene, camera, dir, slots: new Map() }
}

export function disposeWorld(world: GpuWorld) {
  for (const id of [...world.slots.keys()]) dropSlot(world, id)
  disposeObject(world.scene)
  world.renderer.dispose()
  world.renderer.forceContextLoss()
  world.renderer.domElement.remove()
}

export function resizeWorld(world: GpuWorld, host: HTMLDivElement) {
  const size = viewSize(host)
  world.renderer.setSize(size.width, size.height, false)
  world.camera.aspect = size.width / size.height
  world.camera.updateProjectionMatrix()
}

export function poseLoadedSlot(current: SlotGpu, slot: Scene3DSlot) {
  current.loopSpeed = slot.loop?.speed ?? 0
  current.looping = isCylinderBackdrop(slot)
  const scale = Math.max(0.2, slot.scale)
  if (current.kind === 'image' && isCylinderBackdrop(slot)) {
    current.root.position.set(0, CYLINDER_HEIGHT * 0.35 * scale, 0)
    current.root.rotation.y = slot.rotationY
    current.root.scale.setScalar(scale)
    return
  }
  if (current.kind === 'image') {
    current.root.position.set(slot.position[0], slot.position[1] + 2.2, slot.position[2])
    current.root.rotation.y = slot.rotationY
    current.root.scale.setScalar(scale)
    return
  }
  current.root.position.set(slot.position[0], slot.position[1], slot.position[2])
  current.root.rotation.y = slot.rotationY
  current.root.scale.setScalar(current.baseScale * slot.scale)
}
