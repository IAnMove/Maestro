import type { Scene3DLoop, Scene3DSlot } from './types.ts'

export function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}

export function cylinderUvOffset(sceneSeconds: number, speed: number): number {
  const safeSpeed = Number.isFinite(speed) ? speed : 0
  const time = Number.isFinite(sceneSeconds) ? sceneSeconds : 0
  return wrapUnit(time * safeSpeed)
}

export function parseScene3DLoop(raw: unknown): Scene3DLoop | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as { cylinder?: unknown; speed?: unknown }
  const speed = Number(value.speed)
  return {
    cylinder: value.cylinder === true,
    speed: Number.isFinite(speed) ? speed : 0,
  }
}

export function isImageBackdrop(slot: Pick<Scene3DSlot, 'media'>): boolean {
  return slot.media === 'image'
}

export function isCylinderBackdrop(slot: Pick<Scene3DSlot, 'media' | 'loop'>): boolean {
  return slot.media === 'image' && slot.loop?.cylinder === true
}

export function slotMountKey(slot: Pick<Scene3DSlot, 'sourceUrl' | 'media' | 'loop'>): string {
  if (slot.media !== 'image') return `${slot.sourceUrl}\0glb`
  return `${slot.sourceUrl}\0${slot.loop?.cylinder ? 'cyl' : 'plane'}`
}
