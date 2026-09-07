import { Object3D, Raycaster, Vector2 } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { GpuWorld } from './gpu'
import type { Scene3DSlot } from './types'

export type TransformMode = 'translate' | 'rotate' | 'scale'
export type TransformPatch = Partial<Pick<Scene3DSlot, 'position' | 'rotationY' | 'scale'>>

export function transformPatch(proxy: Object3D, mode: TransformMode, axis: string | null): TransformPatch {
  if (mode === 'translate') return { position: [proxy.position.x, proxy.position.y, proxy.position.z] }
  if (mode === 'rotate') return { rotationY: proxy.rotation.y }
  const value = axis === 'Y' ? proxy.scale.y : axis === 'Z' ? proxy.scale.z : proxy.scale.x
  return { scale: Math.max(0.05, Math.min(100, value)) }
}

/** A document-space proxy keeps GLB normalization and animation bones separate
 * from user transforms. Helpers never become part of an exported scene. */
export function createTransformGizmo(world: GpuWorld, onChange: (id: string, patch: TransformPatch) => void, onSelect: (id: string) => void) {
  const canvas = world.renderer.domElement
  const proxy = new Object3D()
  const controls = new TransformControls(world.camera, canvas)
  controls.setSize(0.85)
  const helper = controls.getHelper()
  world.scene.add(proxy, helper)
  let selectedId: string | null = null
  let allowed = true
  let mode: TransformMode = 'translate'
  const redraw = () => world.renderer.render(world.scene, world.camera)
  let uniformScale = 1
  const objectChange = () => {
    if (!allowed || !selectedId) return
    const patch = transformPatch(proxy, mode, controls.axis)
    if (patch.scale !== undefined) uniformScale = patch.scale
    onChange(selectedId, patch)
  }
  const finishDrag = () => { if (mode === 'scale') proxy.scale.setScalar(uniformScale) }
  const raycaster = new Raycaster()
  const select = (event: PointerEvent) => {
    if (!allowed || controls.axis || event.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), world.camera)
    const targets = [...world.slots.entries()].filter(([, slot]) => slot.kind === 'model')
    const hits = raycaster.intersectObjects(targets.map(([, slot]) => slot.root), true)
    const hit = hits[0]
    if (!hit) return
    const selected = targets.find(([, slot]) => {
      let object: Object3D | null = hit.object
      while (object) { if (object === slot.root) return true; object = object.parent }
      return false
    })
    if (selected) onSelect(selected[0])
  }
  controls.addEventListener('change', redraw)
  controls.addEventListener('objectChange', objectChange)
  controls.addEventListener('mouseUp', finishDrag)
  canvas.addEventListener('pointerdown', select)
  return {
    sync(slot: Scene3DSlot | undefined, nextMode: TransformMode, enabled: boolean) {
      allowed = enabled
      mode = nextMode
      controls.enabled = enabled
      if (!slot || slot.media === 'image' || !enabled) { controls.detach(); return }
      selectedId = slot.id
      if (!controls.dragging) {
        proxy.position.fromArray(slot.position)
        proxy.rotation.set(0, slot.rotationY, 0)
        proxy.scale.setScalar(slot.scale)
        proxy.updateMatrixWorld(true)
      }
      controls.setMode(mode)
      // Uniform scale uses the centre handle; yaw is the document's rotation axis.
      controls.showX = mode !== 'rotate'
      controls.showY = true
      controls.showZ = mode !== 'rotate'
      controls.attach(proxy)
    },
    hide() { allowed = false; controls.enabled = false; controls.detach() },
    dispose() {
      canvas.removeEventListener('pointerdown', select)
      controls.removeEventListener('change', redraw)
      controls.removeEventListener('objectChange', objectChange)
      controls.removeEventListener('mouseUp', finishDrag)
      controls.detach()
      controls.dispose()
      world.scene.remove(proxy, helper)
    },
  }
}
