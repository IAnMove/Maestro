import { Quaternion, Vector3, type Object3D } from 'three'
import type { Scene3DSlot } from './types'

type Arm = { upper: Object3D; lower: Object3D; hand: Object3D; side: number }
const rigs = new WeakMap<Object3D, { arms: Arm[]; rest: Map<Object3D, Quaternion>; pendingRestore: boolean }>()

function rigFor(root: Object3D) {
  const cached = rigs.get(root)
  if (cached) return cached
  const arms: Arm[] = []
  for (const [name, side] of [['Left', -1], ['Right', 1]] as const) {
    const upper = root.getObjectByName(`${name}Arm`)
    const lower = root.getObjectByName(`${name}ForeArm`)
    const hand = root.getObjectByName(`${name}Hand`)
    if (upper && lower && hand) arms.push({ upper, lower, hand, side })
  }
  const rest = new Map(arms.flatMap(arm => [arm.upper, arm.lower, arm.hand]).map(bone => [bone, bone.quaternion.clone()]))
  const rig = { arms, rest, pendingRestore: false }; rigs.set(root, rig)
  return rig
}

export function resetTypingPose(root: Object3D) {
  const rig = rigs.get(root)
  if (!rig?.pendingRestore) return
  rig.rest.forEach((quaternion, bone) => bone.quaternion.copy(quaternion))
  rig.pendingRestore = false
}

function aimBone(bone: Object3D, child: Object3D, target: Vector3) {
  const origin = bone.getWorldPosition(new Vector3())
  const from = child.getWorldPosition(new Vector3()).sub(origin).normalize()
  const to = target.clone().sub(origin).normalize()
  const delta = new Quaternion().setFromUnitVectors(from, to)
  const parent = bone.parent!.getWorldQuaternion(new Quaternion())
  bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent))
  bone.updateWorldMatrix(false, true)
}

/** Optional procedural keyboard gesture for compatible rigs; source GLBs stay intact. */
export function applyTypingPose(root: Object3D, slot: Scene3DSlot, seconds: number) {
  const rig = rigFor(root)
  rig.rest.forEach((quaternion, bone) => quaternion.copy(bone.quaternion))
  rig.pendingRestore = true
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), slot.rotationY)
  for (const arm of rig.arms) {
    root.updateWorldMatrix(true, true)
    const shoulder = arm.upper.getWorldPosition(new Vector3())
    const elbow = arm.lower.getWorldPosition(new Vector3())
    const hand = arm.hand.getWorldPosition(new Vector3())
    const a = shoulder.distanceTo(elbow); const b = elbow.distanceTo(hand)
    const target = new Vector3(arm.side * .19, .91 + Math.max(0, Math.sin(seconds * 13 + arm.side)) * .025, .62)
      .applyQuaternion(yaw).add(new Vector3(...slot.position))
    const direction = target.clone().sub(shoulder)
    const distance = Math.max(.001, Math.min(direction.length(), a + b - .001))
    direction.normalize()
    const along = (a * a - b * b + distance * distance) / (2 * distance)
    const bend = new Vector3(arm.side * .8, -.8, -.25).applyQuaternion(yaw)
    bend.addScaledVector(direction, -bend.dot(direction)).normalize()
    const targetElbow = shoulder.clone().addScaledVector(direction, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
    aimBone(arm.upper, arm.lower, targetElbow)
    aimBone(arm.lower, arm.hand, target)
  }
}
