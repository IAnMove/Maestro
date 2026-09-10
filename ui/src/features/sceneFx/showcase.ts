import bases from '../../../../app/shared/scene_bases.json'
import { FX_CATALOG, parseSceneFx } from './types'

/** Non-destructive to actors/cameras/audio; the authored effect track is replaced explicitly. */
export function withFxShowcase<T extends { duration: number }>(document: T): T & { sfx: ReturnType<typeof parseSceneFx> } {
  return { ...document, ...('layers' in document && Array.isArray(document.layers) && !document.layers.length ? { layers: structuredClone(bases['2d'].layers) } : {}), duration: Math.max(document.duration, FX_CATALOG.length * 3),
    sfx: parseSceneFx(FX_CATALOG.map((preset, i) => ({ id: `showcase-${preset.id}`, kind: preset.id,
      label: preset.id.replace('speedlines', 'speed lines').toUpperCase(), start: i * 3, end: i * 3 + 2.8, color: preset.color, size: 95, sound: true, seed: i + 17 }))) }
}
