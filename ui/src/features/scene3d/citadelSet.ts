import { BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, SRGBColorSpace, TorusGeometry, type Object3D } from 'three'

/** A reusable server citadel: geometry and canvas lettering, no external media. */
export function citadelGroup(): Group {
  const root = new Group()
  root.name = 'citadel'
  const stone = new MeshStandardMaterial({ color: 0x243143, roughness: 0.62, metalness: 0.35 })
  const metal = new MeshStandardMaterial({ color: 0x0d1927, roughness: 0.4, metalness: 0.7 })
  const cyan = new MeshBasicMaterial({ color: 0x58e5ff })
  const gold = new MeshBasicMaterial({ color: 0xffc16a })
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material = stone) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    root.add(mesh)
    return mesh
  }
  const platform = new Mesh(new CylinderGeometry(7.4, 7.8, 0.3, 64), stone)
  platform.position.y = -0.17
  root.add(platform)
  const ring = (radius: number, material: MeshBasicMaterial, y: number) => {
    const mesh = new Mesh(new TorusGeometry(radius, 0.018, 5, 96), material)
    mesh.rotation.x = Math.PI / 2
    mesh.position.y = y
    root.add(mesh)
  }
  ring(6.8, cyan, 0.012)
  ring(3.5, gold, 0.016)
  ring(3.65, gold, 0.017)
  for (let i = -6; i <= 6; i++) {
    const line = new Mesh(new BoxGeometry(12, 0.008, 0.009), cyan)
    line.position.set(0, 0.004, i)
    root.add(line)
    const cross = new Mesh(new BoxGeometry(0.009, 0.008, 12), cyan)
    cross.position.set(i, 0.004, 0)
    root.add(cross)
  }
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI + i * Math.PI / 8
    const x = Math.cos(angle) * 6.2
    const z = Math.sin(angle) * 6.2 - 0.4
    const height = 2.6 + (i % 3) * 0.5
    box(x, height / 2, z, 0.9, height, 0.65, metal)
    for (let row = 0; row < 7; row++) {
      box(x, 0.35 + row * 0.3, z + 0.34, 0.65, 0.17, 0.025)
      const led = new Mesh(new BoxGeometry(0.38, 0.025, 0.026), i % 2 ? gold : cyan)
      led.position.set(x, 0.35 + row * 0.3, z + 0.36)
      root.add(led)
    }
  }
  for (const x of [-3.9, 3.9]) {
    box(x, 2.2, -5.3, 0.42, 4.4, 0.5)
    box(x, 4.35, -5.3, 0.85, 0.2, 0.8)
  }
  box(0, 4.55, -5.3, 8.3, 0.38, 0.65)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#091624'; ctx.fillRect(0, 0, 1024, 256)
      ctx.strokeStyle = '#5de9f1'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 1008, 240)
      ctx.textAlign = 'center'; ctx.fillStyle = '#b0fbff'; ctx.font = 'bold 62px monospace'
      ctx.fillText('THE LAST COMMIT', 512, 118)
      ctx.fillStyle = '#ffc876'; ctx.font = '30px monospace'; ctx.fillText('SERVER CITADEL / EST. 1970', 512, 182)
      const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
      const panel = new Mesh(new BoxGeometry(5, 1.25, 0.08), new MeshBasicMaterial({ map: texture }))
      panel.position.set(0, 3.45, -5.15); root.add(panel)
    }
  }
  const portal = new Group(); portal.name = 'citadel-portal'
  for (let i = 0; i < 3; i++) {
    const halo = new Mesh(new TorusGeometry(1.05 + i * 0.18, 0.018, 6, 72), i === 1 ? gold : cyan)
    halo.rotation.y = i * 0.24; portal.add(halo)
  }
  portal.position.set(0, 1.7, -4.8); root.add(portal)
  // Soft contact markers anchor figures without expensive shadow maps.
  const contact = new Mesh(new CircleGeometry(3.2, 64), new MeshBasicMaterial({ color: 0x091222, transparent: true, opacity: 0.22, depthWrite: false }))
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.003; root.add(contact)
  const rim = new PointLight(0x30d9ff, 18, 18, 2); rim.position.set(-3, 3, -2); root.add(rim)
  const warm = new PointLight(0xffad62, 16, 18, 2); warm.position.set(3, 2.8, 2); root.add(warm)
  return root
}

export function paintCitadel(root: Object3D | null, seconds: number) {
  const portal = root?.getObjectByName('citadel-portal')
  if (!portal) return
  portal.rotation.z = seconds * 0.3
  portal.children.forEach((halo, i) => { halo.rotation.y = Math.sin(seconds * 0.5 + i) * 0.35 })
}
