import { BASE } from '../../api/http'
import i18n from '../../i18n'

/** Resolve the exact existing guide in its source workspace before presenting it. */
export async function canonicalVideoReference(params: Record<string, unknown>): Promise<void> {
  const source = params.video_guide
  if (source === undefined || source === null || source === '') return
  if (typeof source !== 'string') throw new Error('video_guide must be a string video reference')
  const response = await fetch(`${BASE}/api/v1/generation/commands/references`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references: [source], media_kind: 'video' }),
  })
  const body = await response.json().catch(() => ({})) as {
    references?: unknown; detail?: { message?: string }
  }
  if (!response.ok || !Array.isArray(body.references) || body.references.length !== 1
      || typeof body.references[0] !== 'string') {
    throw new Error(body.detail?.message || i18n.t('studio:commands.referenceFailed'))
  }
  params.video_guide = body.references[0]
}
