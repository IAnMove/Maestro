import { uploadLocalAsset } from '../../asset-picker/upload'
import { voiceWav } from './audio'
import { amplitudeCues, parseMouthCues } from './track'

export async function recordedVoice(blob: Blob, workspaceId: string, signal: AbortSignal) {
  const context = new OfflineAudioContext(1, 1, 16000)
  const buffer = await context.decodeAudioData(await blob.arrayBuffer())
  const duration = Math.min(90, buffer.duration)
  const wav = await voiceWav(buffer, 0, duration)
  const upload = await uploadLocalAsset(new File([wav], 'microphone.wav', { type: 'audio/wav' }), signal)
  return { audio: { workspaceId, filename: upload.filename, url: upload.url },
    cues: amplitudeCues(buffer).filter(cue => cue.start < duration).map(cue => ({ ...cue, end: Math.min(duration, cue.end) })), driver: 'amplitude' as const, duration }
}

export async function exampleVoice(workspaceId: string, signal: AbortSignal) {
  const responses = await Promise.all(['/speech-examples/english-preview.mp3', '/speech-examples/english-preview.json'].map(url => fetch(url, { signal })))
  if (responses.some(response => !response.ok)) throw new Error('English voice example could not be loaded.')
  const data = await responses[1].json(), cues = parseMouthCues(data)
  const upload = await uploadLocalAsset(new File([await responses[0].blob()], 'english-preview.mp3', { type: 'audio/mpeg' }), signal)
  return { audio: { workspaceId, filename: upload.filename, url: upload.url }, cues, driver: 'rhubarb' as const, duration: data.duration as number }
}
