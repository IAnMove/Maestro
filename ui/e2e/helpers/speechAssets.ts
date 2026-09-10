import { BoxGeometry } from 'three'
import { createHash } from 'node:crypto'
import { buildSpeechProduction } from '../../src/features/scene3d/speech/production'
import { defaultSpeech, type FacePlacement } from '../../src/features/scene3d/speech/types'

/** Original procedural test geometry, no downloaded or private character assets. */
export function speechTestGlb(headName = 'Head') {
  const chunks: Buffer[] = [], views: object[] = [], accessors: object[] = []
  let offset = 0
  const accessor = (bytes: Buffer, componentType: number, count: number, type: string, bounds = {}) => {
    const index = views.length
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length })
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded); chunks.push(padded); offset += padded.length
    accessors.push({ bufferView: index, componentType, count, type, ...bounds })
    return accessors.length - 1
  }
  const meshes = [[.48, .55, .38, 1.45], [.42, 1.1, .28, .55]].map(([x, y, z, cy], material) => {
    const geo = new BoxGeometry(x, y, z).translate(0, cy, 0)
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const attrs = Object.fromEntries(['position', 'normal', 'uv'].map((name, i) => {
      const a = geo.getAttribute(name)
      return [['POSITION', 'NORMAL', 'TEXCOORD_0'][i], accessor(Buffer.from(a.array.buffer), 5126, a.count, i === 2 ? 'VEC2' : 'VEC3',
        i === 0 ? { min: box.min.toArray(), max: box.max.toArray() } : {})]
    }))
    const indices = accessor(Buffer.from(geo.index!.array.buffer), 5123, geo.index!.count, 'SCALAR')
    return { primitives: [{ attributes: attrs, indices, material }] }
  })
  const gltf = { asset: { version: '2.0', generator: 'HocusPocus procedural speech test' }, scene: 0,
    scenes: [{ nodes: [0, 1] }], nodes: [{ mesh: 0, name: headName }, { mesh: 1, name: 'Body' }], meshes,
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [.72, .48, .32, 1], metallicFactor: 0, roughnessFactor: .8 } },
      { pbrMetallicRoughness: { baseColorFactor: [.08, .25, .5, 1], metallicFactor: 0, roughnessFactor: .8 } }],
    buffers: [{ byteLength: offset }], bufferViews: views, accessors }
  const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded)
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + padded.length + offset, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const bin = Buffer.alloc(8); bin.writeUInt32LE(offset); bin.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, padded, bin, ...chunks])
}
export function speechTestWav(seconds = 4) {
  const rate = 16000, count = Math.round(seconds * rate), result = Buffer.alloc(44 + count * 2)
  result.write('RIFF'); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8); result.writeUInt32LE(16, 16)
  result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24)
  result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34)
  result.write('data', 36); result.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) {
    const time = i / rate, active = time % 1.2 >= .2 && time % 1.2 < .8
    result.writeInt16LE(active ? Math.round(Math.sin(i * Math.PI * 2 * 240 / rate) * 6000) : 0, 44 + i * 2)
  }
  return result
}
export const testFace: FacePlacement = { meshIndex: 0, center: [0, 1.36, .19], size: [.2, .13], skin: [.72, .48, .32],
  eyes: { left: [-.1, 1.53, .19], right: [.1, 1.53, .19], size: [.12, .05], skinLeft: [.72, .48, .32], skinRight: [.72, .48, .32] } }
export const model = { workspaceId: 'default', filename: 'speech-test.glb', url: '/api/v1/file/speech-test.glb?workspace=default' }
export const audio = { workspaceId: 'default', filename: 'speech-test.wav', url: '/api/v1/file/speech-test.wav?workspace=default' }
export function speechFixture(duo = false, withAudio = false) {
  const doc = buildSpeechProduction({ kind: 'dialogue', title: duo ? 'A → B → A' : 'One speaking character', workspace: 'default', duration: 4, offset: 0,
    audio: withAudio ? audio : undefined, cast: [{ id: 'alice', name: 'Alice', model }, ...(duo ? [{ id: 'bob', name: 'Bob', model }] : [])],
    lines: duo ? [{ id: 'a1', characterId: 'alice', text: 'Hello Bob.', start: 0, end: 1.2 },
      { id: 'b1', characterId: 'bob', text: 'Hello Alice.', start: 1.2, end: 2.4 },
      { id: 'a2', characterId: 'alice', text: 'We can reuse our voices.', start: 2.4, end: 4 }] : undefined })
  doc.width = 640; doc.height = 360; doc.fps = 24
  doc.camera = { family: 'follow', eye: [duo ? .475 : 0, 1.4, 3.5], look: [duo ? .475 : 0, 1.4, 0], fov: 35 }
  for (const slot of doc.slots) {
    slot.rotationY = 0
    slot.speech = { ...defaultSpeech(), ...slot.speech, face: testFace, blink: false, eyes: false }
  }
  return doc
}
export const testDigest = () => createHash('sha256').update(speechTestGlb()).digest('hex')
