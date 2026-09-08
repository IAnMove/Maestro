import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { defaultMediaScreen } from './mediaScreen.ts'
import type { Scene3DSlot } from './types.ts'

/** A real world-space prop; its content shares camera, transforms and occlusion. */
export function screenGeometry(slot: Scene3DSlot) {
  const screen = slot.screen ?? defaultMediaScreen(), root = new Group()
  const { width, height, style } = screen
  const lift = style === 'billboard' ? 1.8 : style === 'monitor' ? .4 : 0
  const center = lift + height / 2
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color, roughness: .5, metalness: .3 }))
    mesh.position.set(x, y, z); root.add(mesh)
  }
  if (style !== 'frameless') {
    box(width + .18, height + .18, .18, 0, center, -.11, 0x171e2c)
    box(width + .22, .025, .035, 0, center - height / 2 - .07, .005, 0x497991)
    if (style === 'monitor') {
      box(.16, lift, .16, 0, lift / 2, -.1, 0x354357)
      box(width * .38, .08, .65, 0, .04, -.1, 0x171e2c)
    } else for (const x of [-width * .32, width * .32]) box(.14, lift, .16, x, lift / 2, -.1, 0x354357)
  }
  const face = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ color: 0x10202c, toneMapped: false }))
  face.name = 'SCREEN_CONTENT'; face.position.y = center; root.add(face)
  root.position.fromArray(slot.position); root.rotation.y = slot.rotationY; root.scale.setScalar(slot.scale)
  return root
}
