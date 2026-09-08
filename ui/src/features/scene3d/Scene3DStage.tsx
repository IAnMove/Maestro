import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { createTransformGizmo, type TransformMode, type TransformPatch } from './transformGizmo.ts'
import { TextureLoader } from 'three'
import { estimateFace, FACE_PROFILES, type FaceProfile } from './speech/calibration'
import type { FacePlacement } from './speech/types'
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
  selectedId?: string
  transformMode?: TransformMode
  editing?: boolean
  onTransform?: (slotId: string, patch: TransformPatch) => void
  onSelect?: (slotId: string) => void
  onSlotClips?: (slotId: string, clips: Scene3DClipCatalogEntry[]) => void
}

export type Scene3DStageHandle = {
  paint: (seconds: number, document?: Scene3DDocument) => HTMLCanvasElement | null
  ready: (slots: readonly Scene3DSlot[]) => boolean
  setExportSize: (width: number, height: number) => void
  restoreSize: () => void
  beginExport: (document: Scene3DDocument) => void
  endExport: () => void
  facePlacement?: (slotId: string, profile: FaceProfile) => FacePlacement | undefined
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
      gltf.scene.userData.speechPlacements = Object.fromEntries(FACE_PROFILES.map(profile => [profile, estimateFace(gltf.scene, profile)]))
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
  { document, sceneSeconds, onSlotClips, selectedId, transformMode = 'translate', editing = false, onTransform, onSelect },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<GpuWorld | null>(null)
  const gizmoRef = useRef<ReturnType<typeof createTransformGizmo> | null>(null)
  const interactionRef = useRef({ onTransform, onSelect })
  useEffect(() => { interactionRef.current = { onTransform, onSelect } }, [onTransform, onSelect])
  const documentRef = useRef(document)
  const secondsRef = useRef(sceneSeconds)
  useEffect(() => { secondsRef.current = sceneSeconds }, [sceneSeconds])
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
    facePlacement(slotId, profile) {
      const placement = worldRef.current?.slots.get(slotId)?.root.userData.speechPlacements?.[profile] as FacePlacement | undefined
      return placement ? structuredClone(placement) : undefined
    },
    beginExport(next) {
      gizmoRef.current?.hide()
      exportLockRef.current = next
      documentRef.current = next
    },
    endExport() {
      exportLockRef.current = null
      documentRef.current = document
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const world = createWorld(host, documentRef.current.light, documentRef.current.camera.fov)
    worldRef.current = world
    gizmoRef.current = createTransformGizmo(world, (id, patch) => interactionRef.current.onTransform?.(id, patch), id => interactionRef.current.onSelect?.(id))
    const resize = () => {
      if (exportLockRef.current) return
      resizeWorld(world, host)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => {
      observer.disconnect()
      gizmoRef.current?.dispose()
      gizmoRef.current = null
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
      loadSlotGltf(world, slot, loader, gone, live, (slotId, clips) => {
        onSlotClipsRef.current?.(slotId, clips)
        paintWorld(world, documentRef.current, secondsRef.current)
      })
    }
  }, [document.slots])

  useEffect(() => {
    const world = worldRef.current
    if (!world || exportLockRef.current) return
    gizmoRef.current?.sync(document.slots.find(slot => slot.id === selectedId), transformMode, editing)
    paintWorld(world, document, sceneSeconds)
  }, [document, sceneSeconds, selectedId, transformMode, editing])

  return <div ref={hostRef} className="absolute inset-0" data-testid="scene3d-stage" />
})
