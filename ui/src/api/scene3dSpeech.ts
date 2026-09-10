import { BASE } from './http'
import { parseMouthCues } from '../features/scene3d/speech/track'

export type SpeechAnalysisResponse = { mouthCues: { start: number; end: number; value: string }[]; recognizer: 'phonetic'; duration: number }
export async function analyzeSceneSpeech(wav: ArrayBuffer, signal?: AbortSignal, isolateVocals = false) {
  const response = await fetch(`${BASE}/api/v1/character-kits/speech/analyze${isolateVocals ? '?isolate_vocals=true' : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav, signal,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'Local speech analysis failed.')
  }
  const data: SpeechAnalysisResponse = await response.json()
  return parseMouthCues(data)
}
