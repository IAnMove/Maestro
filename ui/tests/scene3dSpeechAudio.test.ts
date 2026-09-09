import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeSpeechAudio } from '../src/features/scene3d/speech/encodeAudio'

test('AAC uses dequeue backpressure, pads its tail and flushes once at end', async () => {
  const originalEncoder = Object.getOwnPropertyDescriptor(globalThis, 'AudioEncoder')
  const originalData = Object.getOwnPropertyDescriptor(globalThis, 'AudioData')
  let flushes = 0, closes = 0, frames = 0
  const blocks: { numberOfFrames: number; timestamp: number; data: Float32Array }[] = []
  class FakeData {
    constructor(value: typeof blocks[number]) { blocks.push(value) }
    close() { closes++ }
  }
  class FakeEncoder extends EventTarget {
    static async isConfigSupported(config: unknown) { return { supported: true, config } }
    state = 'configured'
    encodeQueueSize = 0
    configure() {}
    encode() { frames++; this.encodeQueueSize++; queueMicrotask(() => { this.encodeQueueSize = 0; this.dispatchEvent(new Event('dequeue')) }) }
    async flush() { flushes++ }
    close() { this.state = 'closed' }
  }
  Object.defineProperty(globalThis, 'AudioEncoder', { configurable: true, value: FakeEncoder })
  Object.defineProperty(globalThis, 'AudioData', { configurable: true, value: FakeData })
  try {
    const samples = new Float32Array(423810).fill(.15)
    await encodeSpeechAudio({} as Parameters<typeof encodeSpeechAudio>[0], { sampleRate: 48000, getChannelData: () => samples } as unknown as AudioBuffer)
    assert.equal(flushes, 1); assert.equal(frames, 414); assert.equal(closes, frames)
    assert.ok(blocks.every(block => block.numberOfFrames === 1024))
    assert.equal(blocks.at(-1)!.data[1023], 0)
    assert.equal(blocks.at(-1)!.timestamp, Math.round(413 * 1024 / 48000 * 1e6))
  } finally {
    if (originalEncoder) Object.defineProperty(globalThis, 'AudioEncoder', originalEncoder)
    else Reflect.deleteProperty(globalThis, 'AudioEncoder')
    if (originalData) Object.defineProperty(globalThis, 'AudioData', originalData)
    else Reflect.deleteProperty(globalThis, 'AudioData')
  }
})
