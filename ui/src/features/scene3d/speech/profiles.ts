import type { Scene3DSpeech } from './types'
import { defaultSpeech } from './types'
import { parseSpeech, safeMediaUrl } from './track'

export type FaceSettings = Pick<Scene3DSpeech, 'face' | 'atlas' | 'strength' | 'clean' | 'style' | 'lip' | 'expression' | 'blink' | 'eyes'>
export function faceSettings(speech: Scene3DSpeech): FaceSettings {
  const { face, atlas, strength, clean, style, lip, expression, blink, eyes } = speech
  return { face, atlas, strength, clean, style, lip, expression, blink, eyes }
}
const hashes = new Map<string, Promise<string>>()
export function modelDigest(url: string): Promise<string> {
  if (!safeMediaUrl(url)) return Promise.reject(new Error('Save/upload the GLB before saving calibration.'))
  if (hashes.has(url)) return hashes.get(url)!
  const pending = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'force-cache' })
    if (!response.ok || Number(response.headers.get('content-length')) > 64 * 1024 * 1024) throw new Error('Could not identify the model (maximum 64 MB).')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('Model exceeds 64 MB.')
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
  })()
  if (hashes.size >= 32) hashes.delete(hashes.keys().next().value!)
  hashes.set(url, pending)
  void pending.catch(() => { if (hashes.get(url) === pending) hashes.delete(url) })
  return pending
}
export async function loadFaceProfile(url: string, workspace: string) {
  const digest = await modelDigest(url)
  const response = await fetch('/api/v1/character-kits/speech/profiles/' + digest + '?workspace=' + encodeURIComponent(workspace))
  if (response.status === 404) return { digest, revision: 0, settings: undefined }
  if (!response.ok) throw new Error('Could not load saved face calibration.')
  const data = await response.json()
  if (data.digest !== digest || !Number.isInteger(data.revision) || data.revision < 1) throw new Error('Invalid face calibration.')
  const speech = parseSpeech({ ...defaultSpeech(), ...data.settings })!
  if (!speech.face) throw new Error('Saved calibration has no face.')
  return { digest, revision: data.revision as number, settings: faceSettings(speech) }
}
export async function saveFaceProfile(digest: string, workspace: string, revision: number, speech: Scene3DSpeech) {
  if (!speech.face) throw new Error('Place the mouth first.')
  const response = await fetch('/api/v1/character-kits/speech/profiles/' + digest, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace, revision, settings: faceSettings(speech) }),
  })
  if (!response.ok) throw new Error(response.status === 409 ? 'Calibration changed elsewhere; reload it before saving.' : 'Could not save face calibration.')
  return response.json() as Promise<{ revision: number }>
}
