import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { TextureLoader } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { adoptCafeMaps, loadCafeMaps } from './cafeSet.ts'
import { syncDressing } from './dressing.ts'
import { adoptDriveMaps, isDriveDressing, loadDriveMaps } from './driveSet.ts'
import {
  applyLight,
  catalogFromClips,
  createWorld,
  disposeObject,
  disposeWorld,
  fitGltf,
  imageBackdropMesh,
  type GpuWorld,
  paintWorld,
  placeSlot,
  placeholderMesh,
  poseLoadedSlot,
  prepareBackdropTexture,
  pruneSlots,
  resizeWorld,
  setWorldSize,
  slotNeedsReload,
  syncSlotClip,
  worldAssetsReady,
} from './gpu.ts'
import type { Scene3DClipCatalogEntry, Scene3DDocument, Scene3DSlot } from './types.ts'

type Props = {
  document: Scene3DDocument
  sceneSeconds: number
  onSlotClips?: (slotId: string, clips: Scene3DClipCatalogEntry[]) => void
}

export type Scene3DStageHandle = {
  paint: (seconds: number, document?: Scene3DDocument) => HTMLCanvasElement | null
  ready: (slots: readonly Scene3DSlot[]) => boolean
  setExportSize: (width: number, height: number) => void
  restoreSize: () => void
  beginExport: (document: Scene3DDocument) => void
  endExport: () => void
}

function loadSlotGltf(
  world: GpuWorld,
  slot: Scene3DSlot,
  loader: GLTFLoader,
  cancelled: () => boolean,
  liveSlot: () => Scene3DSlot | undefined,
  onClips: ((slotId: string, clips: Scene3DClipCatalogEntry[]) => void) | undefined,
) {
  const url = slot.sourceUrl
  if (!url) return
  loader.load(
    url,
    (gltf: GLTF) => {
      if (cancelled()) {
        disposeObject(gltf.scene)
        return
      }
      const live = liveSlot()
      if (!live || live.sourceUrl !== url || live.media === 'image') {
        disposeObject(gltf.scene)
        return
      }
      const baseScale = fitGltf(gltf.scene, live)
      placeSlot(world, live, gltf.scene, gltf.animations, baseScale, true)
      onClips?.(live.id, catalogFromClips(gltf.animations))
    },
    undefined,
    () => undefined,
  )
}

function loadSlotImage(
  world: GpuWorld,
  slot: Scene3DSlot,
  cancelled: () => boolean,
  liveSlot: () => Scene3DSlot | undefined,
) {
  const url = slot.sourceUrl
  if (!url) return
  new TextureLoader().load(
    url,
    (texture: import('three').Texture) => {
      if (cancelled()) {
        texture.dispose()
        return
      }
      const live = liveSlot()
      if (!live || live.sourceUrl !== url || live.media !== 'image') {
        texture.dispose()
        return
      }
      prepareBackdropTexture(texture)
      placeSlot(world, live, imageBackdropMesh(live, texture), [], 1, true)
    },
    undefined,
    () => undefined,
  )
}

export const Scene3DStage = forwardRef<Scene3DStageHandle, Props>(function Scene3DStage(
  { document, sceneSeconds, onSlotClips },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<GpuWorld | null>(null)
  const documentRef = useRef(document)
  const onSlotClipsRef = useRef(onSlotClips)
  const exportLockRef = useRef<Scene3DDocument | null>(null)

  useEffect(() => {
    if (exportLockRef.current) return
    documentRef.current = document
  }, [document])

  useEffect(() => {
    onSlotClipsRef.current = onSlotClips
  }, [onSlotClips])

  useImperativeHandle(ref, () => ({
    paint(seconds, frozen) {
      const world = worldRef.current
      if (!world) return null
      paintWorld(world, frozen ?? exportLockRef.current ?? documentRef.current, seconds)
      return world.renderer.domElement
    },
    ready(slots) {
      const world = worldRef.current
      return Boolean(world && worldAssetsReady(world, slots))
    },
    setExportSize(width, height) {
      const world = worldRef.current
      if (world) setWorldSize(world, width, height)
    },
    restoreSize() {
      const world = worldRef.current
      const host = hostRef.current
      if (world && host) resizeWorld(world, host)
    },
    beginExport(next) {
      exportLockRef.current = next
      documentRef.current = next
    },
    endExport() {
      exportLockRef.current = null
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const world = createWorld(host, documentRef.current.light, documentRef.current.camera.fov)
    worldRef.current = world
    const resize = () => resizeWorld(world, host)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => {
      observer.disconnect()
      disposeWorld(world)
      worldRef.current = null
    }
  }, [])

  useEffect(() => {
    const world = worldRef.current
    if (!world || exportLockRef.current) return
    applyLight(world.dir, document.light)
  }, [document.light])

  useEffect(() => {
    const world = worldRef.current
    if (!world || exportLockRef.current) return
    if (document.dressing === 'cafe') {
      world.dressingReady = false
      syncDressing(world, 'cafe')
      let gone = false
      void loadCafeMaps().then(maps => {
        if (!adoptCafeMaps(maps, () => !gone && worldRef.current === world)) return
        syncDressing(world, 'cafe', { cafe: maps })
        world.dressingReady = true
      })
      return () => { gone = true }
    }
    if (isDriveDressing(document.dressing)) {
      world.dressingReady = false
      syncDressing(world, document.dressing)
      let gone = false
      void loadDriveMaps().then(maps => {
        if (!adoptDriveMaps(maps, () => !gone && worldRef.current === world)) return
        syncDressing(world, document.dressing, { drive: maps })
        world.dressingReady = true
      })
      return () => { gone = true }
    }
    world.dressingReady = true
    syncDressing(world, document.dressing)
  }, [document.dressing])

  useEffect(() => {
    const world = worldRef.current
    if (!world || exportLockRef.current) return
    const loader = new GLTFLoader()
    pruneSlots(world, document.slots)
    for (const slot of document.slots) {
      const current = world.slots.get(slot.id)
      if (!slotNeedsReload(current, slot) && current) {
        poseLoadedSlot(current, slot)
        syncSlotClip(world, slot)
        continue
      }
      placeSlot(world, slot, placeholderMesh(slot), [], 1, !slot.sourceUrl)
      const live = () => documentRef.current.slots.find(item => item.id === slot.id)
      const gone = () => worldRef.current !== world
      if (slot.media === 'image') {
        loadSlotImage(world, slot, gone, live)
        continue
      }
      loadSlotGltf(world, slot, loader, gone, live, (slotId, clips) => onSlotClipsRef.current?.(slotId, clips))
    }
  }, [document.slots])

  useEffect(() => {
    const world = worldRef.current
    if (!world || exportLockRef.current) return
    paintWorld(world, document, sceneSeconds)
  }, [document, sceneSeconds])

  return <div ref={hostRef} className="absolute inset-0" data-testid="scene3d-stage" />
})
