import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from 'three'

export type CarMaps = {
  paint: Texture | null
  glass: Texture | null
  front: Texture | null
  rear: Texture | null
}

function skin(map: Texture | null, color: number, extra?: { roughness?: number; metalness?: number; emissive?: number }) {
  return new MeshStandardMaterial({
    map: map ?? undefined,
    color: map ? 0xffffff : color,
    roughness: extra?.roughness ?? 0.42,
    metalness: extra?.metalness ?? 0.55,
    emissive: extra?.emissive ?? 0x000000,
    emissiveIntensity: extra?.emissive ? 0.85 : 0,
  })
}

function wheel(): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.33, 0.33, 0.22, 14),
    new MeshStandardMaterial({ color: 0x111115, roughness: 0.92 }),
  )
  mesh.rotation.z = Math.PI / 2
  return mesh
}

export function buildCar(maps: CarMaps): { root: Group; wheels: Mesh[] } {
  const root = new Group()
  const paint = skin(maps.paint, 0x8a1518, { metalness: 0.72, roughness: 0.34 })
  const glass = skin(maps.glass, 0x151820, { metalness: 0.8, roughness: 0.12 })
  const front = skin(maps.front, 0x8a1518, { metalness: 0.5, roughness: 0.4 })
  const rear = skin(maps.rear, 0x8a1518, { metalness: 0.5, roughness: 0.4 })
  const body = new Mesh(new BoxGeometry(1.86, 0.5, 4.05), [paint, paint, paint, paint, rear, front])
  body.position.set(0, 0.46, 0)
  root.add(body)
  const cabin = new Mesh(new BoxGeometry(1.48, 0.34, 1.52), glass)
  cabin.position.set(0, 0.84, 0.38)
  root.add(cabin)
  const shield = new Mesh(new BoxGeometry(1.42, 0.03, 0.98), glass)
  shield.rotation.x = 0.58
  shield.position.set(0, 0.76, -0.38)
  root.add(shield)
  const spoiler = new Mesh(new BoxGeometry(1.5, 0.05, 0.28), paint)
  spoiler.position.set(0, 0.78, 1.85)
  root.add(spoiler)
  const lamp = new MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffe8a8, emissiveIntensity: 1.2, roughness: 0.25 })
  const tail = new MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 0.9, roughness: 0.35 })
  for (const x of [-0.62, 0.62]) {
    const head = new Mesh(new BoxGeometry(0.22, 0.1, 0.08), lamp)
    head.position.set(x, 0.48, -2.02)
    root.add(head)
    const back = new Mesh(new BoxGeometry(0.28, 0.1, 0.06), tail)
    back.position.set(x, 0.5, 2.02)
    root.add(back)
  }
  const wheels: Mesh[] = []
  for (const [x, z] of [[-0.82, -1.22], [0.82, -1.22], [-0.82, 1.22], [0.82, 1.22]]) {
    const item = wheel()
    item.position.set(x, 0.33, z)
    root.add(item)
    wheels.push(item)
  }
  return { root, wheels }
}
