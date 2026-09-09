import { BASE } from '../../api/http'
import i18n from '../../i18n'

const AUDIO_FIELDS = [
  'audio_guide',
  'audio_guide2',
  'audio_guide3',
  'audio_guide4',
  'audio_guide5',
  'audio_guide6',
] as const


/** Convert legacy upload paths to canonical references without reading files. */
export async function canonicalAudioReferences(params: Record<string, unknown>): Promise<void> {
  const fields = AUDIO_FIELDS.filter(field => {
    const value = params[field]
    return value !== undefined && value !== null && value !== ''
  })
  // Do this validation before constructing the compact reference request. A
  // restored form can contain a malformed value in one voice slot while a
  // later slot is valid. Filtering non-strings would shift the later value
  // into the earlier slot and silently attach the wrong voice after resolve.
  for (const field of fields) {
    if (typeof params[field] !== 'string') {
      throw new Error(`${field} must be a string audio reference`)
    }
  }
  const references = fields.map(field => params[field] as string)
  if (!references.length) return
  const response = await fetch(`${BASE}/api/v1/generation/commands/references`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references, media_kind: 'audio' }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: { message?: string } }
    throw new Error(body.detail?.message || i18n.t('studio:commands.referenceFailed'))
  }
  const result = await response.json() as { references?: unknown }
  if (!Array.isArray(result.references) || result.references.length !== references.length
      || result.references.some(value => typeof value !== 'string')) {
    throw new Error(i18n.t('studio:commands.referenceFailed'))
  }
  const resolved = result.references as string[]
  fields.forEach((field, index) => { params[field] = resolved[index] })
}

