import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry } from 'three'

export function mediaSet(kind: 'retro-lab' | 'observatory' | 'broadcast-plaza') {
  const root = new Group(), retro = kind === 'retro-lab', plaza = kind === 'broadcast-plaza'
  const box = (size: [number, number, number], position: [number, number, number], color: number, glow = false) => {
    const material = glow ? new MeshBasicMaterial({ color, toneMapped: false }) : new MeshStandardMaterial({ color, roughness: .65, metalness: .25 })
    const mesh = new Mesh(new BoxGeometry(...size), material); mesh.position.set(...position); root.add(mesh); return mesh
  }
  box([38, .12, 40], [0, -.08, -4], retro ? 0x352d2b : 0x0b1120)
  for (let i = -8; i <= 8; i++) {
    box([.016, .006, 32], [i * 2, .003, -4], retro ? 0x68564b : 0x193546, true)
    box([32, .006, .016], [0, .003, i * 2], retro ? 0x68564b : 0x193546, true)
  }
  if (retro) {
    box([16, 8, .2], [0, 4, -7], 0x232b39)
    for (let i = 0; i < 5; i++) box([.05, 6, .1], [-6 + i * 3, 3, -6.85], 0x668295, true)
  } else {
    for (const sign of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = sign * (plaza ? 9 : 7), z = 4 - i * 4, height = plaza ? 9 + i : 3.8
      box([1.5, height, 1.7], [x, height / 2, z], 0x161e30)
      for (let row = 0; row < (plaza ? 4 : 9); row++) {
        box([1.18, .16, .05], [x, .4 + row * .34, z + .88], 0x28364e)
        box([.055, .055, .02], [x + .45, .4 + row * .34, z + .92], row % 3 ? 0x73bbaa : 0xf3bb71, true)
      }
    }
    const platform = new Mesh(new CylinderGeometry(2.1, 2.25, .13, 64), new MeshStandardMaterial({ color: 0x1b2a43, metalness: .65, roughness: .3 }))
    platform.position.set(0, .055, 1); root.add(platform)
    const ring = new Mesh(new TorusGeometry(2.15, .025, 8, 80), new MeshBasicMaterial({ color: 0x7197f0, toneMapped: false }))
    ring.rotation.x = Math.PI / 2; ring.position.set(0, .13, 1); root.add(ring)
  }
  return root
}
