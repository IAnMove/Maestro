import { analyzeSceneSpeech } from '../../../api/scene3dSpeech'
import { useStore } from '../../../stores/useStore'
import { getPlayableFileUrl } from '../../../api/client'
import type { Scene } from '../../../types'
import { buildSpeechProduction, queueSpeechProduction, type SpeechProductionInput } from './production'
import { decodeVoice, voiceWav } from './audio'
import { amplitudeCues } from './track'

export async function prepareSpeechProduction(input: SpeechProductionInput, phonetic = true, signal?: AbortSignal) {
  const doc = buildSpeechProduction(input), buffer = await decodeVoice(input.audio.url)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (input.offset + input.duration > buffer.duration + .01) throw new Error('The selected fragment extends beyond the audio file.')
  // Analyze the complete shot once, so gaps and repeated speakers share timing.
  const cues = phonetic
    ? (await analyzeSceneSpeech(await voiceWav(buffer, input.offset, input.duration), signal)).map(c => ({ ...c, start: c.start + input.offset, end: c.end + input.offset }))
    : amplitudeCues(buffer, input.offset, input.duration)
  for (const slot of doc.slots) if (slot.speech?.clips) for (const clip of slot.speech.clips) {
    clip.cues = cues.filter(c => c.end > clip.offset && c.start < clip.offset + (clip.end! - clip.start))
    clip.driver = phonetic ? 'rhubarb' : 'amplitude'
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return doc
}
export function openSpeechProduction(document: ReturnType<typeof buildSpeechProduction>) {
  if (useStore.getState().activeWorkspace !== document.production?.workspace) throw new Error('Workspace changed. Reopen the source and try again.')
  queueSpeechProduction(document)
  useStore.getState().setSettingsOpen(false)
  useStore.getState().setDashboardOpen(false)
  useStore.getState().setMediaFilter('world3d')
}
/** Upgrade only a selected GLB. All image/cutout actions retain their old path. */
export async function speakLegacyModel(scene: Scene, modelId: string, trackId: string, workspace: string, start: number, end: number, text: string) {
  const model = scene.layers.find(layer => layer.id === modelId && layer.type === 'model3d')
  const track = scene.audioTracks?.find(item => item.id === trackId)
  if (!model?.source || !track) throw new Error('Choose a saved GLB and the character audio first.')
  const source = new URL(model.source, window.location.origin)
  const name = decodeURIComponent(source.pathname.split('/').at(-1) || '')
  const input: SpeechProductionInput = { kind: track.kind === 'music' ? 'song' : 'dialogue', title: scene.name, sourceId: scene.name,
    workspace, duration: end - start, offset: start - track.startTime,
    cast: [{ id: model.id, name: model.name, model: { workspaceId: workspace, filename: name, url: model.source } }],
    audio: { workspaceId: workspace, filename: track.filename, url: getPlayableFileUrl('', track.filename, workspace) },
    lines: [{ id: 'dialogue', characterId: model.id, text, start: 0, end: end - start }] }
  const document = await prepareSpeechProduction(input)
  openSpeechProduction(document)
}
