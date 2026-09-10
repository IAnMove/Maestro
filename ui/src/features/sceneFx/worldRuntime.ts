import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  TorusGeometry,
  Vector3,
} from 'three'
import { fxRandom } from './types'
import type { WorldSfx } from './world'

export type WorldSfxGpu = { root: Group; kind: WorldSfx['kind'] }

const DEG = Math.PI / 180
const scratch = new Vector3()

function colorOf(hex: string) {
  return new Color(hex)
}

function darker(hex: string) {
  const color = colorOf(hex)
  color.multiplyScalar(0.35)
  return color
}

function points(seed: number, count: number, radius: number, lift = 0) {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const angle = fxRandom(seed, i) * Math.PI * 2
    const r = radius * (0.85 + fxRandom(seed, i + 17) * 0.3)
    positions[i * 3] = Math.cos(angle) * r
    positions[i * 3 + 1] = lift
    positions[i * 3 + 2] = Math.sin(angle) * r
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('base', new BufferAttribute(positions.slice(), 3))
  return geometry
}

function buildPortal(color: string) {
  const root = new Group()
  const rim = new Mesh(new TorusGeometry(0.55, 0.055, 12, 40), new MeshStandardMaterial({
    color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.55, metalness: 0.25, roughness: 0.4,
  }))
  const front = new Mesh(new CircleGeometry(0.48, 28), new MeshBasicMaterial({
    color: colorOf(color), transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide,
  }))
  const back = new Mesh(new CircleGeometry(0.5, 28), new MeshBasicMaterial({
    color: darker(color), transparent: true, opacity: 0.55, depthWrite: false,
  }))
  back.rotation.y = Math.PI
  front.position.z = 0.012
  back.position.z = -0.012
  const sparks = new Points(points(1, 42, 0.58), new PointsMaterial({
    color: colorOf(color), size: 0.045, transparent: true, depthWrite: false, blending: AdditiveBlending,
  }))
  sparks.userData.kind = 'rim'
  root.add(rim, front, back, sparks)
  root.userData.energy = [front, back]
  return root
}

function buildCircle(color: string) {
  const root = new Group()
  const ring = (inner: number, outer: number, y: number, opacity: number) => {
    const mesh = new Mesh(new RingGeometry(inner, outer, 48), new MeshStandardMaterial({
      color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.7, transparent: true, opacity,
      depthWrite: false, side: DoubleSide, metalness: 0.1, roughness: 0.55,
    }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y
    return mesh
  }
  const sparks = new Points(points(3, 36, 0.7, 0.02), new PointsMaterial({
    color: colorOf(color), size: 0.04, transparent: true, depthWrite: false, blending: AdditiveBlending,
  }))
  sparks.userData.kind = 'rise'
  root.add(ring(0.35, 0.55, 0.018, 0.85), ring(0.62, 0.78, 0.026, 0.55), ring(0.9, 1.02, 0.034, 0.4), sparks)
  return root
}

function buildGate(color: string) {
  const root = buildPortal(color)
  const frame = new Mesh(new TorusGeometry(0.68, 0.03, 8, 32), new MeshStandardMaterial({
    color: colorOf('#1a1424'), metalness: 0.6, roughness: 0.35, emissive: colorOf(color), emissiveIntensity: 0.2,
  }))
  root.add(frame)
  return root
}

function build(kind: WorldSfx['kind'], color: string) {
  if (kind === 'magic_circle') return buildCircle(color)
  if (kind === 'summoning_gate') return buildGate(color)
  return buildPortal(color)
}

function pose(root: Group, cue: WorldSfx, slots: readonly { id: string; position: readonly [number, number, number]; rotationY: number }[]) {
  let x = cue.position.x, y = cue.position.y, z = cue.position.z
  if (cue.anchor?.slotId) {
    const slot = slots.find(item => item.id === cue.anchor!.slotId)
    if (slot) {
      const ox = cue.anchor.offset?.x ?? 0
      const oy = cue.anchor.offset?.y ?? 0
      const oz = cue.anchor.offset?.z ?? 0
      const cos = Math.cos(slot.rotationY), sin = Math.sin(slot.rotationY)
      x = slot.position[0] + ox * cos + oz * sin
      y = slot.position[1] + oy
      z = slot.position[2] - ox * sin + oz * cos
    }
  }
  root.position.set(x, y, z)
  root.rotation.set(cue.rotation.x * DEG, cue.rotation.y * DEG, cue.rotation.z * DEG)
  root.scale.setScalar(cue.scale)
}

function animate(root: Group, cue: WorldSfx, seconds: number) {
  const local = Math.max(0, seconds - cue.start)
  const pulse = 0.85 + 0.15 * Math.sin(local * (1.6 + cue.intensity))
  for (const mesh of (root.userData.energy as Mesh[] | undefined) ?? []) {
    const material = mesh.material as MeshBasicMaterial
    material.opacity = 0.22 * cue.intensity * pulse
  }
  root.traverse(child => {
    if (!(child instanceof Points)) return
    const geometry = child.geometry
    const base = geometry.getAttribute('base')
    const position = geometry.getAttribute('position')
    if (!base || !position) return
    for (let i = 0; i < position.count; i++) {
      const bx = base.getX(i), by = base.getY(i), bz = base.getZ(i)
      if (child.userData.kind === 'rise') {
        const climb = (local * (0.35 + cue.intensity * 0.25) + fxRandom(cue.seed, i) * 1.2) % 1.4
        position.setXYZ(i, bx, climb, bz)
      } else {
        const spin = local * (0.7 + cue.intensity * 0.4)
        const cos = Math.cos(spin), sin = Math.sin(spin)
        position.setXYZ(i, bx * cos - bz * sin, by + Math.sin(local * 6 + i) * 0.02, bx * sin + bz * cos)
      }
    }
    position.needsUpdate = true
  })
}

export function syncWorldSfx(
  scene: Scene,
  nodes: Map<string, WorldSfxGpu>,
  cues: readonly WorldSfx[] | undefined,
  seconds: number,
  slots: readonly { id: string; position: readonly [number, number, number]; rotationY: number }[],
) {
  const live = new Set((cues ?? []).map(cue => cue.id))
  for (const [id, gpu] of nodes) {
    if (live.has(id)) continue
    scene.remove(gpu.root)
    gpu.root.traverse(child => {
      if (child instanceof Mesh || child instanceof Points) {
        child.geometry.dispose()
        const material = child.material
        if (Array.isArray(material)) material.forEach(item => item.dispose())
        else material.dispose()
      }
    })
    nodes.delete(id)
  }
  for (const cue of cues ?? []) {
    let gpu = nodes.get(cue.id)
    if (!gpu || gpu.kind !== cue.kind) {
      if (gpu) { scene.remove(gpu.root) }
      gpu = { root: build(cue.kind, cue.color), kind: cue.kind }
      gpu.root.userData.worldSfxId = cue.id
      scene.add(gpu.root)
      nodes.set(cue.id, gpu)
    }
    const active = seconds >= cue.start && seconds < cue.end
    gpu.root.visible = active
    pose(gpu.root, cue, slots)
    if (active) animate(gpu.root, cue, seconds)
  }
}

export function worldSfxIdFromObject(object: { userData?: { worldSfxId?: string }; parent?: unknown } | null): string | undefined {
  let current = object as { userData?: { worldSfxId?: string }; parent?: unknown } | null
  while (current) {
    if (typeof current.userData?.worldSfxId === 'string') return current.userData.worldSfxId
    current = current.parent as typeof current
  }
  return undefined
}

export function worldSfxWorldPosition(cue: WorldSfx): Vector3 {
  return scratch.set(cue.position.x, cue.position.y, cue.position.z)
}
