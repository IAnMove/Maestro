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
      message: `No clip at index ${index}`,
    }
  }
  const found = catalog[index]
  if (found.name !== wanted.name) {
    return {
      code: 'clip_name_mismatch',
      message: `Clip ${index} is ${JSON.stringify(found.name)}, not ${JSON.stringify(wanted.name)}`,
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
