import {
  BoxGeometry,
  ClampToEdgeWrapping,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Object3D,
} from 'three'
import { buildCar, type CarMaps } from './carMesh.ts'
import type { Scene3DDressing } from './types.ts'

export const DRIVE_TEXTURE_URLS = {
  paint: '/scene3d/car-paint.jpg',
  glass: '/scene3d/car-glass.jpg',
  front: '/scene3d/car-front.jpg',
  rear: '/scene3d/car-rear.jpg',
  road: '/scene3d/drive-road.jpg',
  building: '/scene3d/drive-building.jpg',
  city: '/scene3d/drive-city.jpg',
  coast: '/scene3d/drive-coast.jpg',
  tunnel: '/scene3d/drive-tunnel.jpg',
} as const

export type DriveMaps = CarMaps & {
  road: Texture | null
  building: Texture | null
}

export type DriveDressing = 'drive-city' | 'drive-coast' | 'drive-tunnel'

export function isDriveDressing(kind: Scene3DDressing | undefined): kind is DriveDressing {
  return kind === 'drive-city' || kind === 'drive-coast' || kind === 'drive-tunnel'
}

export function disposeDriveMaps(maps: DriveMaps) {
  maps.paint?.dispose()
  maps.glass?.dispose()
  maps.front?.dispose()
  maps.rear?.dispose()
  maps.road?.dispose()
  maps.building?.dispose()
}

export function adoptDriveMaps(maps: DriveMaps, live: () => boolean): boolean {
  if (live()) return true
  disposeDriveMaps(maps)
  return false
}

function prep(texture: Texture, tile: boolean) {
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = tile ? RepeatWrapping : ClampToEdgeWrapping
  texture.wrapT = tile ? RepeatWrapping : ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function loadOne(loader: TextureLoader, url: string, tile: boolean): Promise<Texture | null> {
  return new Promise(resolve => {
    loader.load(url, texture => resolve(prep(texture, tile)), undefined, () => resolve(null))
  })
}

export function loadDriveMaps(): Promise<DriveMaps> {
  const loader = new TextureLoader()
  return Promise.all([
    loadOne(loader, DRIVE_TEXTURE_URLS.paint, true),
    loadOne(loader, DRIVE_TEXTURE_URLS.glass, true),
    loadOne(loader, DRIVE_TEXTURE_URLS.front, false),
    loadOne(loader, DRIVE_TEXTURE_URLS.rear, false),
    loadOne(loader, DRIVE_TEXTURE_URLS.road, true),
    loadOne(loader, DRIVE_TEXTURE_URLS.building, true),
  ]).then(([paint, glass, front, rear, road, building]) => {
    if (road) road.repeat.set(1, 10)
    if (building) building.repeat.set(1, 2)
    if (paint) paint.repeat.set(2, 2)
    return { paint, glass, front, rear, road, building }
  })
}

function moving(object: Object3D, z: number) {
  object.userData.baseZ = z
  object.position.z = z
  return object
}

function addCity(strip: Group, maps: DriveMaps) {
  const facade = new MeshStandardMaterial({
    map: maps.building ?? undefined,
    color: maps.building ? 0xffffff : 0x2a2433,
    roughness: 0.55,
    metalness: 0.25,
  })
  for (let i = 0; i < 8; i += 1) {
    const z = -21 + i * 6
    const leftH = 3.2 + (i % 3) * 1.4
    const rightH = 4.1 + ((i + 1) % 3) * 1.2
    const left = new Mesh(new BoxGeometry(2.2, leftH, 3.4), facade)
    left.position.set(-5.6, leftH / 2, 0)
    strip.add(moving(left, z))
    const right = new Mesh(new BoxGeometry(2.4, rightH, 3.1), facade)
    right.position.set(5.7, rightH / 2, 0)
    strip.add(moving(right, z + 1.2))
  }
}

function addCoast(strip: Group) {
  const rock = new MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 })
  const rail = new MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.4, metalness: 0.6 })
  for (let i = 0; i < 7; i += 1) {
    const z = -20 + i * 6.4
    const barrier = new Mesh(new BoxGeometry(0.12, 0.55, 5.6), rail)
    barrier.position.set(-4.1, 0.28, 0)
    strip.add(moving(barrier, z))
    const stone = new Mesh(new IcosahedronGeometry(0.7 + (i % 2) * 0.25, 0), rock)
    stone.position.set(-6.4, 0.45, 0)
    strip.add(moving(stone, z + 1.5))
  }
}

function addTunnel(strip: Group) {
  const wall = new MeshStandardMaterial({ color: 0x4a5858, roughness: 0.78 })
  const lamp = new MeshStandardMaterial({ color: 0xffc07a, emissive: 0xffaa55, emissiveIntensity: 0.8, roughness: 0.3 })
  for (let i = 0; i < 10; i += 1) {
    const z = -22.5 + i * 5
    const left = new Mesh(new BoxGeometry(0.35, 3.6, 4.2), wall)
    left.position.set(-4.3, 1.8, 0)
    strip.add(moving(left, z))
    const right = new Mesh(new BoxGeometry(0.35, 3.6, 4.2), wall)
    right.position.set(4.3, 1.8, 0)
    strip.add(moving(right, z))
    const roof = new Mesh(new BoxGeometry(8.9, 0.28, 4.2), wall)
    roof.position.set(0, 3.7, 0)
    strip.add(moving(roof, z))
    const light = new Mesh(new BoxGeometry(0.4, 0.08, 0.4), lamp)
    light.position.set(0, 3.5, 0)
    strip.add(moving(light, z))
  }
}

export function driveGroup(kind: DriveDressing, maps: DriveMaps): { root: Group; wheels: Mesh[]; roadMap: Texture | null; movers: Object3D[] } {
  const root = new Group()
  const strip = new Group()
  const roadMat = new MeshStandardMaterial({
    map: maps.road ?? undefined,
    color: maps.road ? 0xffffff : 0x222226,
    roughness: 0.92,
  })
  const road = new Mesh(new PlaneGeometry(7.4, 64), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.y = 0.01
  root.add(road)
  const shoulder = new MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.95 })
  for (const x of [-5.2, 5.2]) {
    const band = new Mesh(new PlaneGeometry(2.8, 64), shoulder)
    band.rotation.x = -Math.PI / 2
    band.position.set(x, 0.008, 0)
    root.add(band)
  }
  if (kind === 'drive-city') addCity(strip, maps)
  if (kind === 'drive-coast') addCoast(strip)
  if (kind === 'drive-tunnel') addTunnel(strip)
  root.add(strip)
  const car = buildCar(maps)
  root.add(car.root)
  const movers: Object3D[] = []
  strip.traverse(child => {
    if (child.userData.baseZ != null) movers.push(child)
  })
  return { root, wheels: car.wheels, roadMap: maps.road, movers }
}
