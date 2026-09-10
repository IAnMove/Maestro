import test from 'node:test'
import assert from 'node:assert/strict'
import { recordMicrophone } from '../src/features/scene3d/speech/microphone'

test('microphone cancellation releases a late permission grant without recording', async t => {
  let grant!: (value: MediaStream) => void, stopped = 0
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }) } } })
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'navigator', prior); else Reflect.deleteProperty(globalThis, 'navigator') })
  const controller = new AbortController()
  const task = recordMicrophone(controller.signal, { onRecording: () => assert.fail('started after cancel'), onComplete: () => assert.fail('committed after cancel'), onError: () => assert.fail('unexpected error') })
  controller.abort(); grant({ getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream)
  await task; assert.equal(stopped, 1)
})

test('recording stops its stream, returns audio only after Stop, and discards aborted takes', async t => {
  let stopped = 0, output: Blob | undefined
  class FakeRecorder {
    state = 'inactive'; mimeType = 'audio/webm'; onstop?: () => void; ondataavailable?: (event: { data: Blob }) => void
    static latest: FakeRecorder
    constructor() { FakeRecorder.latest = this }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.() }
  }
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } } })
  t.mock.method(globalThis, 'setTimeout', () => 0 as never)
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })
  t.after(() => { Reflect.deleteProperty(globalThis, 'MediaRecorder'); if (prior) Object.defineProperty(globalThis, 'navigator', prior); else Reflect.deleteProperty(globalThis, 'navigator') })
  const callbacks = { onRecording() {}, onComplete: (blob: Blob) => { output = blob }, onError: () => assert.fail('unexpected error') }
  const finish = await recordMicrophone(new AbortController().signal, callbacks)
  const instance = FakeRecorder.latest
  assert.equal(instance.state, 'recording'); assert.equal(output, undefined)
  finish(); assert.equal(instance!.state, 'inactive'); assert.equal(await output!.text(), 'audio'); assert.ok(stopped)
  output = undefined
  const controller = new AbortController(); await recordMicrophone(controller.signal, callbacks); controller.abort()
  assert.equal(output, undefined); assert.equal(FakeRecorder.latest.state, 'inactive')
})
