import { parseClipPlayback, parseMotion } from './performance.ts'
import { parseSpeech } from './speech/track'
import { parseScene3DLoop } from './backdrop.ts'
import { durableScene3DSourceUrl, parseScene3DSourceRef } from './slotSource.ts'
import type { Scene3DDressing, Scene3DSlot } from './types.ts'

const DRESSINGS = new Set<Scene3DDressing>(['street', 'space', 'treadmill', 'cafe', 'drive-city', 'drive-coast', 'drive-tunnel', 'citadel', 'workshop', 'chase-street'])
export const parseDressing = (value?: Scene3DDressing) => DRESSINGS.has(value!) ? value : undefined

function textureRepeat(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(16, Math.max(1, value)) : undefined
}

export function normalizeScene3DSlot(slot: Scene3DSlot): Scene3DSlot {
  const sourceUrl = durableScene3DSourceUrl(typeof slot.sourceUrl === 'string' ? slot.sourceUrl : '')
  const sourceRef = parseScene3DSourceRef(slot.sourceRef)
  return {
    ...slot, sourceUrl, sourceRef: sourceUrl && sourceRef ? sourceRef : undefined,
    speech: slot.media === 'image' ? undefined : parseSpeech(slot.speech),
    media: slot.media === 'image' ? 'image' : 'model3d',
    loop: parseScene3DLoop(slot.loop), clipPlayback: parseClipPlayback(slot.clipPlayback), motion: parseMotion(slot.motion),
    surface: slot.surface === 'floor' || slot.surface === 'wall' ? slot.surface : undefined,
    grounded: slot.grounded === true, textureRepeat: textureRepeat(slot.textureRepeat),
    performance: slot.performance === 'typing' ? 'typing' : undefined,
  }
}
