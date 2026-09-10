import {
  BoxGeometry,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Object3D,
} from 'three'

export const CAFE_TEXTURE_URLS = {
  facade: '/scene3d/cafe-facade.jpg',
  floor: '/scene3d/cafe-floor.jpg',
  back: '/scene3d/cafe-back.jpg',
} as const

export type CafeMaps = {
  facade: Texture | null
  floor: Texture | null
  back: Texture | null
}

function prep(texture: Texture, tile: boolean) {
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = tile ? RepeatWrapping : ClampToEdgeWrapping
  texture.wrapT = tile ? RepeatWrapping : ClampToEdgeWrapping
  if (tile) texture.repeat.set(8, 8)
  texture.needsUpdate = true
  return texture
}

function loadOne(loader: TextureLoader, url: string, tile: boolean): Promise<Texture | null> {
  return new Promise(resolve => {
    loader.load(url, texture => resolve(prep(texture, tile)), undefined, () => resolve(null))
  })
}

export function loadCafeMaps(): Promise<CafeMaps> {
  const loader = new TextureLoader()
  return Promise.all([
    loadOne(loader, CAFE_TEXTURE_URLS.facade, false),
    loadOne(loader, CAFE_TEXTURE_URLS.floor, true),
    loadOne(loader, CAFE_TEXTURE_URLS.back, false),
  ]).then(([facade, floor, back]) => ({ facade, floor, back }))
}

export function disposeCafeMaps(maps: CafeMaps) {
  maps.facade?.dispose()
  maps.floor?.dispose()
  maps.back?.dispose()
}

export function adoptCafeMaps(maps: CafeMaps, live: () => boolean): boolean {
  if (live()) return true
  disposeCafeMaps(maps)
  return false
}

export function cafeGroup(maps: CafeMaps): Object3D {
  const root = new Group()
  const plaster = new MeshStandardMaterial({ color: 0xc9b896, roughness: 0.9 })
  const roof = new MeshStandardMaterial({ color: 0x4a4338, roughness: 0.86 })
  const front = new MeshStandardMaterial({
    map: maps.facade ?? undefined,
    color: maps.facade ? 0xffffff : 0xd4c48a,
    roughness: 0.68,
  })
  const building = new Mesh(new BoxGeometry(6.6, 4.1, 2.1), [plaster, plaster, roof, plaster, front, plaster])
  building.position.set(0, 2.05, -5.35)
  root.add(building)
  const slab = new Mesh(
    new PlaneGeometry(18, 18),
    new MeshStandardMaterial({
      map: maps.floor ?? undefined,
      color: maps.floor ? 0xffffff : 0xc4b59a,
      roughness: 0.92,
    }),
  )
  slab.rotation.x = -Math.PI / 2
  slab.position.y = 0.01
  root.add(slab)
  const backdrop = new Mesh(
    new PlaneGeometry(24, 12),
    new MeshBasicMaterial({ map: maps.back ?? undefined, color: maps.back ? 0xffffff : 0x3a3550 }),
  )
  backdrop.position.set(0, 5.1, -9.6)
  root.add(backdrop)
  return root
}
