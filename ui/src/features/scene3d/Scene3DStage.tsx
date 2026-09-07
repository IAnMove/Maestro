import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { TextureLoader } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
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
  paint: (seconds: number) => HTMLCanvasElement | null
  ready: (slots: readonly Scene3DSlot[]) => boolean
  setExportSize: (width: number, height: number) => void
  restoreSize: () => void
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

  useEffect(() => {
    documentRef.current = document
  }, [document])

  useEffect(() => {
    onSlotClipsRef.current = onSlotClips
  }, [onSlotClips])

  useImperativeHandle(ref, () => ({
    paint(seconds) {
      const world = worldRef.current
      if (!world) return null
      paintWorld(world, documentRef.current, seconds)
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
    if (!world) return
    applyLight(world.dir, document.light)
  }, [document.light])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return
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
    if (!world) return
    paintWorld(world, document, sceneSeconds)
  }, [document, sceneSeconds])

  return <div ref={hostRef} className="absolute inset-0" data-testid="scene3d-stage" />
})
