import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { fxRandom } from './types'
import { WORLD_BEAM_KINDS, type WorldSfx, type WorldSfxAnchor, type WorldVec3 } from './world'

export type WorldSfxGpu = { root: Group; kind: WorldSfx['kind']; color: string }
export type WorldSlotPose = {
  id: string
  position: readonly [number, number, number]
  rotationY: number
  scale?: number
  root?: Object3D
}

const DEG = Math.PI / 180
const UP = new Vector3(0, 1, 0)
const scratch = new Vector3()
const scratchB = new Vector3()

function colorOf(hex: string) {
  return new Color(hex)
}

function darker(hex: string, amount = 0.35) {
  return colorOf(hex).multiplyScalar(amount)
}

function disposeRoot(root: Group) {
  root.traverse(child => {
    if (child instanceof Mesh || child instanceof Points) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach(item => item.dispose())
      else material.dispose()
    }
  })
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

function sparkMaterial(color: string, size = 0.04) {
  return new PointsMaterial({ color: colorOf(color), size, transparent: true, depthWrite: false, blending: AdditiveBlending })
}

function buildPortal(color: string) {
  const root = new Group()
  const rim = new Mesh(new TorusGeometry(0.55, 0.07, 14, 48), new MeshStandardMaterial({
    color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.7, metalness: 0.35, roughness: 0.32, depthWrite: true,
  }))
  const front = new Mesh(new CircleGeometry(0.47, 32), new MeshBasicMaterial({
    color: colorOf(color), transparent: true, opacity: 0.34, depthWrite: false, depthTest: true,
  }))
  const back = new Mesh(new CircleGeometry(0.5, 32), new MeshBasicMaterial({
    color: darker(color, 0.22), transparent: true, opacity: 0.62, depthWrite: false, depthTest: true,
  }))
  back.rotation.y = Math.PI
  front.position.z = 0.02
  back.position.z = -0.02
  const sparks = new Points(points(1, 40, 0.6), sparkMaterial(color, 0.05))
  sparks.userData.kind = 'rim'
  root.add(rim, front, back, sparks)
  root.userData.energy = [front, back]
  return root
}

function buildCircle(color: string) {
  const root = new Group()
  const ring = (inner: number, outer: number, y: number, opacity: number) => {
    const mesh = new Mesh(new RingGeometry(inner, outer, 64), new MeshStandardMaterial({
      color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.75, transparent: true, opacity,
      depthWrite: false, side: DoubleSide, metalness: 0.12, roughness: 0.5,
    }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y
    return mesh
  }
  root.add(ring(0.32, 0.52, 0.016, 0.9), ring(0.6, 0.76, 0.024, 0.55), ring(0.88, 1.02, 0.032, 0.38))
  for (let i = 0; i < 12; i++) {
    const rune = new Mesh(new BoxGeometry(0.04, 0.02, 0.12), new MeshStandardMaterial({
      color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.9, roughness: 0.35,
    }))
    const angle = (i / 12) * Math.PI * 2
    rune.position.set(Math.cos(angle) * 0.68, 0.03, Math.sin(angle) * 0.68)
    rune.rotation.y = -angle
    root.add(rune)
  }
  const sparks = new Points(points(3, 36, 0.72, 0.02), sparkMaterial(color))
  sparks.userData.kind = 'rise'
  root.add(sparks)
  return root
}

function buildGate(color: string) {
  const root = buildPortal(color)
  root.add(new Mesh(new TorusGeometry(0.7, 0.035, 10, 40), new MeshStandardMaterial({
    color: colorOf('#16101f'), metalness: 0.65, roughness: 0.3, emissive: colorOf(color), emissiveIntensity: 0.25,
  })))
  return root
}

function buildBeam(color: string, radius: number) {
  const root = new Group()
  const shaft = new Mesh(new CylinderGeometry(radius, radius, 1, 10), new MeshStandardMaterial({
    color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 1.1, transparent: true, opacity: 0.85, roughness: 0.25,
  }))
  shaft.userData.kind = 'beam'
  root.add(shaft)
  return root
}

function buildLightning(color: string) {
  const root = new Group()
  for (let i = 0; i < 7; i++) {
    const seg = new Mesh(new CylinderGeometry(0.025, 0.018, 1, 6), new MeshStandardMaterial({
      color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 1.4, roughness: 0.2,
    }))
    seg.userData.kind = 'bolt'
    root.add(seg)
  }
  return root
}

function buildOrb(color: string) {
  const root = new Group()
  const shell = new Mesh(new SphereGeometry(0.28, 24, 16), new MeshStandardMaterial({
    color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.8, transparent: true, opacity: 0.45, roughness: 0.2,
  }))
  const core = new Mesh(new SphereGeometry(0.12, 16, 12), new MeshBasicMaterial({ color: colorOf('#fff6d0') }))
  const cloud = new Points(points(9, 28, 0.32), sparkMaterial(color, 0.035))
  cloud.userData.kind = 'orb'
  root.add(shell, core, cloud)
  return root
}

function buildAura(color: string) {
  const root = new Group()
  const back = new Mesh(new SphereGeometry(0.55, 24, 16), new MeshBasicMaterial({
    color: colorOf(color), transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false,
  }))
  back.scale.set(0.85, 1.55, 0.85)
  const front = new Mesh(new SphereGeometry(0.48, 24, 16), new MeshBasicMaterial({
    color: colorOf(color), transparent: true, opacity: 0.16, depthWrite: false,
  }))
  front.scale.set(0.7, 1.35, 0.7)
  const mist = new Points(points(12, 32, 0.5, 0.4), sparkMaterial(color, 0.03))
  mist.userData.kind = 'rise'
  root.add(back, front, mist)
  root.userData.energy = [back, front]
  return root
}

function buildMissiles(color: string) {
  const root = new Group()
  for (let i = 0; i < 3; i++) {
    const bolt = new Mesh(new SphereGeometry(0.07, 10, 8), new MeshStandardMaterial({
      color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 1.2,
    }))
    bolt.userData.kind = 'missile'
    bolt.userData.index = i
    root.add(bolt)
  }
  const impact = new Mesh(new SphereGeometry(0.22, 12, 10), new MeshBasicMaterial({
    color: colorOf(color), transparent: true, opacity: 0, depthWrite: false,
  }))
  impact.userData.kind = 'impact'
  root.add(impact)
  return root
}

function buildShockwave(color: string) {
  const root = new Group()
  const ring = new Mesh(new RingGeometry(0.2, 0.38, 48), new MeshStandardMaterial({
    color: colorOf(color), emissive: colorOf(color), emissiveIntensity: 0.9, transparent: true, opacity: 0.8,
    side: DoubleSide, depthWrite: false,
  }))
  ring.rotation.x = -Math.PI / 2
  ring.userData.kind = 'shock'
  const dust = new Points(points(4, 24, 0.4, 0.04), sparkMaterial(color, 0.05))
  dust.userData.kind = 'shockdust'
  root.add(ring, dust)
  return root
}

function buildMissingMarker() {
  const mesh = new Mesh(new BoxGeometry(0.12, 0.12, 0.12), new MeshBasicMaterial({ color: 0xff4466 }))
  mesh.userData.kind = 'missing'
  mesh.visible = false
  return mesh
}

function build(kind: WorldSfx['kind'], color: string) {
  const root = kind === 'magic_circle' ? buildCircle(color)
    : kind === 'summoning_gate' ? buildGate(color)
    : kind === 'energy_beam' ? buildBeam(color, 0.045)
    : kind === 'laser' ? buildBeam(color, 0.02)
    : kind === 'lightning' ? buildLightning(color)
    : kind === 'energy_orb' ? buildOrb(color)
    : kind === 'anime_aura' ? buildAura(color)
    : kind === 'arcane_missiles' ? buildMissiles(color)
    : kind === 'shockwave' ? buildShockwave(color)
    : buildPortal(color)
  root.add(buildMissingMarker())
  return root
}

export function worldAnchorOffsetFromSlotRoot(
  root: Object3D,
  point: readonly [number, number, number],
): WorldVec3 {
  root.updateMatrixWorld(true)
  const local = root.worldToLocal(new Vector3(point[0], point[1], point[2]))
  return { x: local.x, y: local.y, z: local.z }
}

function resolvePoint(anchor: WorldSfxAnchor | undefined, fallback: WorldVec3, slots: readonly WorldSlotPose[]): { point: Vector3; missing: boolean } {
  if (!anchor?.slotId) return { point: new Vector3(fallback.x, fallback.y, fallback.z), missing: false }
  const slot = slots.find(item => item.id === anchor.slotId)
  if (!slot) return { point: new Vector3(fallback.x, fallback.y, fallback.z), missing: true }
  const ox = anchor.offset?.x ?? 0, oy = anchor.offset?.y ?? 0, oz = anchor.offset?.z ?? 0
  if (slot.root) {
    slot.root.updateMatrixWorld(true)
    return { point: slot.root.localToWorld(new Vector3(ox, oy, oz)), missing: false }
  }
  const cos = Math.cos(slot.rotationY), sin = Math.sin(slot.rotationY)
  return {
    point: new Vector3(slot.position[0] + ox * cos + oz * sin, slot.position[1] + oy, slot.position[2] - ox * sin + oz * cos),
    missing: false,
  }
}

function orientBetween(object: Object3D, from: Vector3, to: Vector3, radial = 1) {
  const dir = scratch.copy(to).sub(from)
  const len = Math.max(0.08, dir.length())
  object.position.copy(from).add(to).multiplyScalar(0.5)
  object.quaternion.setFromUnitVectors(UP, scratchB.copy(dir).multiplyScalar(1 / len))
  object.scale.set(radial, len, radial)
}

function poseFixed(root: Group, cue: WorldSfx, origin: Vector3) {
  root.position.copy(origin)
  root.rotation.set(cue.rotation.x * DEG, cue.rotation.y * DEG, cue.rotation.z * DEG)
  root.scale.setScalar(cue.scale)
}

function poseAura(root: Group, cue: WorldSfx, origin: Vector3, slots: readonly WorldSlotPose[]) {
  const slot = cue.anchor?.slotId ? slots.find(item => item.id === cue.anchor!.slotId) : undefined
  if (slot?.root) {
    slot.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(slot.root)
    if (!box.isEmpty()) {
      box.getCenter(root.position)
      const size = box.getSize(scratch)
      const span = Math.max(size.x, size.y, size.z, 0.6)
      root.scale.setScalar(span * 0.85 * cue.scale)
      return
    }
  }
  poseFixed(root, cue, origin)
}

function poseBeam(root: Group, cue: WorldSfx, from: Vector3, to: Vector3) {
  const radial = cue.kind === 'laser' ? 0.55 * cue.scale : cue.scale
  if (cue.kind === 'lightning') {
    const kids = root.children.filter(child => child.userData.kind === 'bolt')
    const hops = kids.length
    let prev = from
    for (let i = 0; i < hops; i++) {
      const t = (i + 1) / hops
      const dest = i === hops - 1 ? to : from.clone().lerp(to, t)
      if (i < hops - 1) {
        dest.x += (fxRandom(cue.seed, i) - 0.5) * 0.55 * cue.scale
        dest.y += (fxRandom(cue.seed, i + 9) - 0.5) * 0.35 * cue.scale
        dest.z += (fxRandom(cue.seed, i + 17) - 0.5) * 0.55 * cue.scale
      }
      orientBetween(kids[i], prev, dest, 0.8 * radial)
      prev = dest
    }
    return
  }
  const shaft = root.children.find(child => child.userData.kind === 'beam')
  if (shaft) orientBetween(shaft, from, to, radial)
}

function poseMissiles(root: Group, cue: WorldSfx, from: Vector3, to: Vector3, local: number, span: number) {
  const progress = Math.min(1, local / span)
  const kids = root.children.filter(child => child.userData.kind === 'missile')
  kids.forEach((bolt, index) => {
    const t = Math.min(1, Math.max(0, progress * 1.15 - index * 0.12))
    bolt.position.copy(from).lerp(to, t)
    bolt.scale.setScalar(cue.scale * (0.7 + 0.3 * t))
    bolt.visible = progress < 0.98
  })
  const impact = root.children.find(child => child.userData.kind === 'impact')
  if (impact instanceof Mesh) {
    impact.position.copy(to)
    const material = impact.material as MeshBasicMaterial
    const burst = Math.max(0, (progress - 0.82) / 0.18)
    material.opacity = burst * 0.7 * cue.intensity
    impact.scale.setScalar(cue.scale * (0.4 + burst * 1.8))
  }
}

function animate(root: Group, cue: WorldSfx, seconds: number) {
  const local = Math.max(0, seconds - cue.start)
  const pulse = 0.85 + 0.15 * Math.sin(local * (1.6 + cue.intensity))
  for (const mesh of (root.userData.energy as Mesh[] | undefined) ?? []) {
    const material = mesh.material as MeshBasicMaterial
    material.opacity = Math.max(0.08, (mesh === (root.userData.energy as Mesh[])[0] ? 0.24 : 0.16) * cue.intensity * pulse)
  }
  root.traverse(child => {
    if (child.userData.kind === 'shock' && child instanceof Mesh) {
      const span = Math.max(0.001, cue.end - cue.start)
      const p = Math.min(1, local / span)
      child.scale.setScalar(0.4 + p * 3.2 * cue.scale)
      ;(child.material as MeshStandardMaterial).opacity = (1 - p) * 0.85 * cue.intensity
    }
    if (!(child instanceof Points)) return
    const geometry = child.geometry
    const base = geometry.getAttribute('base')
    const position = geometry.getAttribute('position')
    if (!base || !position) return
    for (let i = 0; i < position.count; i++) {
      const bx = base.getX(i), by = base.getY(i), bz = base.getZ(i)
      if (child.userData.kind === 'rise' || child.userData.kind === 'shockdust') {
        const climb = (local * (0.35 + cue.intensity * 0.25) + fxRandom(cue.seed, i) * 1.2) % 1.4
        position.setXYZ(i, bx * (1 + (child.userData.kind === 'shockdust' ? local * 0.4 : 0)), climb, bz * (1 + (child.userData.kind === 'shockdust' ? local * 0.4 : 0)))
      } else if (child.userData.kind === 'orb') {
        const spin = local * 1.4
        const cos = Math.cos(spin), sin = Math.sin(spin)
        position.setXYZ(i, bx * cos - bz * sin, by + Math.sin(local * 5 + i) * 0.04, bx * sin + bz * cos)
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
  nodes: Map<string, WorldSfxGpu> | undefined,
  cues: readonly WorldSfx[] | undefined,
  seconds: number,
  slots: readonly WorldSlotPose[],
) {
  if (!scene || !nodes || typeof nodes.set !== 'function') return
  const live = new Set((cues ?? []).map(cue => cue.id))
  for (const [id, gpu] of nodes) {
    if (live.has(id)) continue
    scene.remove(gpu.root)
    disposeRoot(gpu.root)
    nodes.delete(id)
  }
  for (const cue of cues ?? []) {
    let gpu = nodes.get(cue.id)
    if (!gpu || gpu.kind !== cue.kind || gpu.color !== cue.color) {
      if (gpu) { scene.remove(gpu.root); disposeRoot(gpu.root) }
      gpu = { root: build(cue.kind, cue.color), kind: cue.kind, color: cue.color }
      gpu.root.userData.worldSfxId = cue.id
      scene.add(gpu.root)
      nodes.set(cue.id, gpu)
    }
    const active = seconds >= cue.start && seconds < cue.end
    gpu.root.visible = active
    const origin = resolvePoint(cue.anchor, cue.position, slots)
    const destination = WORLD_BEAM_KINDS.has(cue.kind)
      ? resolvePoint(cue.target, cue.targetPosition ?? { x: cue.position.x, y: cue.position.y, z: cue.position.z + 2.2 }, slots)
      : origin
    gpu.root.userData.gizmoAt = origin.point.clone()
    const missing = origin.missing || destination.missing
    const marker = gpu.root.children.find(child => child.userData.kind === 'missing')
    if (marker) marker.visible = missing
    if (cue.kind === 'anime_aura') poseAura(gpu.root, cue, origin.point, slots)
    else if (cue.kind === 'arcane_missiles') poseMissiles(gpu.root, cue, origin.point, destination.point, Math.max(0, seconds - cue.start), Math.max(0.001, cue.end - cue.start))
    else if (WORLD_BEAM_KINDS.has(cue.kind)) poseBeam(gpu.root, cue, origin.point, destination.point)
    else poseFixed(gpu.root, cue, origin.point)
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
