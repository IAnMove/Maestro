import JSZip from 'jszip'
import { uploadLocalAsset } from '../../asset-picker/upload'
import { defaultSpeech, type FacePlacement } from './types'
import { parseMouthCues, parseSpeech } from './track'

type LabConfig = {
  type: string; version: number; anchor: { center: FacePlacement['center']; width: number; height: number }
  skin: FacePlacement['skin']; eyes: FacePlacement['eyes']; track: unknown
  settings?: { strength?: number; clean?: boolean; lip?: string; expression?: string; eyes?: boolean; autoBlink?: boolean }
}
export function speechFromLabConfig(raw: unknown) {
  const config = raw as LabConfig
  if (config?.type !== 'taberna-talking-character' || config.version !== 2 || !config.anchor) throw new Error('Use a Taberna talking-character v2 kit.')
  const settings = config.settings ?? {}
  return parseSpeech({ ...defaultSpeech(), strength: settings.strength ?? .85, clean: settings.clean, lip: settings.lip,
    expression: settings.expression, eyes: settings.eyes, blink: settings.autoBlink, cues: parseMouthCues(config.track),
    face: { meshIndex: 0, center: config.anchor.center, size: [config.anchor.width, config.anchor.height], skin: config.skin, eyes: config.eyes } })!
}
export async function importSpeechKit(file: File, workspaceId: string, signal: AbortSignal) {
  if (file.size > 64 * 1024 * 1024) throw new Error('Kit exceeds 64 MB.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const get = async (name: string, limit: number) => {
    const entry = zip.file(name)
    // JSZip exposes the central-directory size in its compressed object. Reject before inflation.
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })?._data?.uncompressedSize
    if (!entry || !Number.isSafeInteger(declared) || declared! > limit) throw new Error('Missing or oversized kit asset: ' + name)
    const bytes = await entry.async('uint8array')
    if (bytes.length > limit) throw new Error('Oversized kit asset: ' + name)
    return bytes
  }
  const speech = speechFromLabConfig(JSON.parse(new TextDecoder().decode(await get('config.json', 2 * 1024 * 1024))))
  const glb = await get('character.glb', 48 * 1024 * 1024), wav = await get('dialogue.wav', 18 * 1024 * 1024), atlas = await get('mouth-atlas.png', 4 * 1024 * 1024)
  // Import only self-contained GLB media, never scripts/HTML or external GLTF resources.
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== glb.length) throw new Error('Invalid kit GLB.')
  const jsonLength = view.getUint32(12, true)
  if (20 + jsonLength > glb.length) throw new Error('Invalid GLB manifest.')
  const model = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)))
  if ([...(model.buffers ?? []), ...(model.images ?? [])].some((asset: { uri?: string }) => asset.uri && !asset.uri.startsWith('data:'))) throw new Error('Kit GLB must embed all assets.')
  const upload = async (bytes: Uint8Array, name: string, type: string) => {
    const result = await uploadLocalAsset(new File([bytes.slice().buffer], name, { type }), signal)
    return { workspaceId, filename: result.filename, url: result.url }
  }
  const sourceRef = await upload(glb, 'character.glb', 'model/gltf-binary')
  speech.audio = await upload(wav, 'dialogue.wav', 'audio/wav')
  speech.atlas = await upload(atlas, 'mouth-atlas.png', 'image/png')
  return { sourceUrl: sourceRef.url, sourceRef, media: 'model3d' as const, clip: null, speech: parseSpeech(speech)! }
}
