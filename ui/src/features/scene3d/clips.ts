import { scene3dCopy } from './copy.ts'
import type { Scene3DClipCatalogEntry, Scene3DClipError, Scene3DClipRef } from './types.ts'

export function resolveScene3DClip(
  catalog: readonly Scene3DClipCatalogEntry[],
  wanted: Scene3DClipRef | null,
): Scene3DClipCatalogEntry | Scene3DClipError | null {
  if (!wanted) return null
  const index = wanted.index
  if (!Number.isInteger(index) || index < 0 || index >= catalog.length) {
    return {
      code: 'clip_missing',
      message: scene3dCopy('stage.clipMissing', { index }),
    }
  }
  const found = catalog[index]
  if (found.name !== wanted.name) {
    return {
      code: 'clip_name_mismatch',
      message: scene3dCopy('stage.clipNameMismatch', { index, found: JSON.stringify(found.name), wanted: JSON.stringify(wanted.name) }),
    }
  }
  return found
}

export function clipBindingError(
  result: Scene3DClipCatalogEntry | Scene3DClipError | null,
): Scene3DClipError | null {
  if (result && 'code' in result) return result
  return null
}

/** Reusing a GLB does not reload it, so retain its known animation choices. */
export function retainSlotClipCatalogs(
  previous: readonly { id: string; sourceUrl: string }[],
  next: readonly { id: string; sourceUrl: string }[],
  catalogs: Record<string, Scene3DClipCatalogEntry[]>,
): Record<string, Scene3DClipCatalogEntry[]> {
  return Object.fromEntries(next.flatMap(slot => {
    const old = previous.find(item => item.id === slot.id)
    return old?.sourceUrl === slot.sourceUrl && catalogs[slot.id] ? [[slot.id, catalogs[slot.id]]] : []
  }))
}
