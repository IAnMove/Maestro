import { Box3, Vector3, type Object3D } from 'three'
import type { Scene3DFraming, Vec3 } from './types'

const headBones = new WeakMap<Object3D, Object3D | null>()

/** Evaluate after animation/grounding so close-ups follow the current head pose. */
export function framingAnchor(root: Object3D, anchor: Scene3DFraming['anchor']): Vec3 {
  root.updateMatrixWorld(true)
  if (anchor === 'head') {
    if (!headBones.has(root)) {
      let head: Object3D | null = null
      root.traverse(node => {
        if (!head && 'isBone' in node && /head$/i.test(node.name)) head = node
      })
      headBones.set(root, head)
    }
    const head = headBones.get(root)
    if (head) return head.getWorldPosition(new Vector3()).toArray() as unknown as Vec3
  }
  const box = new Box3().setFromObject(root, true)
  if (box.isEmpty()) return root.getWorldPosition(new Vector3()).toArray() as unknown as Vec3
  const center = box.getCenter(new Vector3())
  center.y = anchor === 'feet' ? box.min.y : anchor === 'head' ? box.min.y + (box.max.y - box.min.y) * .86 : center.y
  return center.toArray() as unknown as Vec3
}
