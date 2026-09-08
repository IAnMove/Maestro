import { parseClipPlayback, parseMotion } from './performance.ts'
import { parseMediaScreen } from './mediaScreen.ts'
import { parseScene3DLoop } from './backdrop.ts'
import { durableScene3DSourceUrl, parseScene3DSourceRef } from './slotSource.ts'
import type { Scene3DDressing, Scene3DSlot } from './types.ts'

const DRESSINGS = new Set<Scene3DDressing>(['street', 'space', 'treadmill', 'cafe', 'drive-city', 'drive-coast', 'drive-tunnel', 'citadel', 'workshop', 'chase-street', 'retro-lab', 'observatory', 'broadcast-plaza'])
export const parseDressing = (value?: Scene3DDressing) => DRESSINGS.has(value!) ? value : undefined

function textureRepeat(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(16, Math.max(1, value)) : undefined
}

export function normalizeScene3DSlot(slot: Scene3DSlot): Scene3DSlot {
  const sourceUrl = durableScene3DSourceUrl(typeof slot.sourceUrl === 'string' ? slot.sourceUrl : '')
  const sourceRef = parseScene3DSourceRef(slot.sourceRef)
  return {
    ...slot, sourceUrl, sourceRef: sourceUrl && sourceRef ? sourceRef : undefined,
    media: slot.media === 'image' ? 'image' : slot.media === 'screen' ? 'screen' : 'model3d', screen: parseMediaScreen(slot.screen),
    loop: parseScene3DLoop(slot.loop), clipPlayback: parseClipPlayback(slot.clipPlayback), motion: parseMotion(slot.motion),
    surface: slot.surface === 'floor' || slot.surface === 'wall' ? slot.surface : undefined,
    grounded: slot.grounded === true, textureRepeat: textureRepeat(slot.textureRepeat),
    performance: slot.performance === 'typing' ? 'typing' : undefined,
  }
}
