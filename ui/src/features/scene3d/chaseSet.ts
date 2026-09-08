import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three'

/** Fixed street geometry gives travelling characters measurable parallax. */
export function chaseGroup() {
  const root = new Group(); root.name = 'chase-street'
  const asphalt = new MeshStandardMaterial({ color: 0x24363f, roughness: .85 })
  const brick = new MeshStandardMaterial({ color: 0x88634b, roughness: .85 })
  const light = new MeshBasicMaterial({ color: 0xffda92 })
  const road = new Mesh(new BoxGeometry(64, .1, 12), asphalt); road.position.y = -.08; root.add(road)
  for (let x = -30; x <= 30; x += 3) {
    const seam = new Mesh(new BoxGeometry(.025, .01, 10), brick); seam.position.set(x, .003, -.5); root.add(seam)
    for (const z of [-4.5, 4.5]) {
      const curb = new Mesh(new BoxGeometry(2.95, .18, .35), brick); curb.position.set(x, .02, z); root.add(curb)
    }
  }
  for (let x = -24; x <= 24; x += 6) {
    const base = new Mesh(new BoxGeometry(.35, .25, .35), asphalt); base.position.set(x, .12, -3.9); root.add(base)
    const pole = new Mesh(new CylinderGeometry(.035, .055, 3, 8), asphalt); pole.position.set(x, 1.5, -3.9); root.add(pole)
    const lamp = new Mesh(new BoxGeometry(.38, .25, .38), light); lamp.position.set(x, 3, -3.9); root.add(lamp)
    const glow = new PointLight(0xffc882, 9, 7); glow.position.copy(lamp.position); root.add(glow)
  }
  return root
}
