import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectViggleFrame, viggleFrameProblem } from '../src/lib/viggleFrame'

class MediaElement extends EventTarget {
  src = ''
  preload = ''
  muted = false
  videoWidth = 1920
  videoHeight = 1080
  naturalWidth = 1280
  naturalHeight = 720
  resets = 0
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
  load() { this.resets += 1 }
}

function mediaDocument() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const elements: MediaElement[] = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => { const element = new MediaElement(); elements.push(element); return element },
  } })
  return { elements, restore: () => {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  } }
}

test('Viggle accepts proportional frames, including portrait, but rejects reframing', () => {
  assert.equal(viggleFrameProblem({ width: 1920, height: 1080, frameWidth: 1280, frameHeight: 720 }), null)
  assert.equal(viggleFrameProblem({ width: 1080, height: 1920, frameWidth: 540, frameHeight: 960 }), null)
  assert.equal(viggleFrameProblem({ width: 1920, height: 1080, frameWidth: 1024, frameHeight: 1024 }), 'aspect')
  assert.equal(viggleFrameProblem({ width: 200, height: 100, frameWidth: 201, frameHeight: 100 }), null)
  assert.equal(viggleFrameProblem({ width: 200, height: 100, frameWidth: 205, frameHeight: 100 }), 'aspect')
  assert.equal(viggleFrameProblem({ width: Number.NaN, height: 100, frameWidth: 100, frameHeight: 100 }), 'aspect')
})

test('Viggle inspection reads both intrinsic dimensions and releases its elements', async () => {
  const { elements, restore } = mediaDocument()
  try {
    const result = inspectViggleFrame('/api/v1/uploads/source.mp4', '/api/v1/uploads/edited.png')
    assert.equal(elements[0].preload, 'metadata')
    elements[1].dispatchEvent(new Event('load'))
    elements[0].dispatchEvent(new Event('loadedmetadata'))
    assert.deepEqual(await result, { width: 1920, height: 1080, frameWidth: 1280, frameHeight: 720 })
    assert.deepEqual(elements.map(element => element.src), ['', ''])
    assert.equal(elements[0].resets, 1)
  } finally { restore() }
})

test('Cancelling a pending inspection releases both decoders and ignores late events', async () => {
  const { elements, restore } = mediaDocument()
  try {
    const controller = new AbortController()
    const result = inspectViggleFrame('blob:video-owned-by-caller', 'blob:image-owned-by-caller', controller.signal)
    controller.abort()
    await assert.rejects(result, { name: 'AbortError' })
    elements[0].dispatchEvent(new Event('loadedmetadata'))
    elements[1].dispatchEvent(new Event('load'))
    assert.deepEqual(elements.map(element => element.src), ['', ''])
    assert.equal(elements[0].resets, 1)
  } finally { restore() }
})

test('An unreadable frame also cancels the pending video inspection', async () => {
  const { elements, restore } = mediaDocument()
  try {
    const result = inspectViggleFrame('video', 'broken-image')
    elements[1].dispatchEvent(new Event('error'))
    await assert.rejects(result, /could not be read/)
    assert.deepEqual(elements.map(element => element.src), ['', ''])
    assert.equal(elements[0].resets, 1)
  } finally { restore() }
})

test('Zero-size metadata is an error, so it cannot accidentally authorize submission', async () => {
  const { elements, restore } = mediaDocument()
  try {
    const result = inspectViggleFrame('broken-video', 'image')
    elements[0].videoWidth = 0
    elements[0].dispatchEvent(new Event('loadedmetadata'))
    await assert.rejects(result, /dimensions are unavailable/)
    assert.deepEqual(elements.map(element => element.src), ['', ''])
  } finally { restore() }
})

test('A decoder that never answers times out and releases both sources', async context => {
  const { elements, restore } = mediaDocument()
  const timers: Array<() => void> = []
  context.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => {
    assert.equal(delay, 15_000)
    timers.push(callback)
    return 0 as unknown as ReturnType<typeof setTimeout>
  })
  try {
    const result = inspectViggleFrame('slow-video', 'slow-image')
    timers[0]()
    await assert.rejects(result, /timed out/)
    assert.deepEqual(elements.map(element => element.src), ['', ''])
  } finally { context.mock.restoreAll(); restore() }
})

test('An already-cancelled inspection never creates media elements', async () => {
  const { elements, restore } = mediaDocument()
  try {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(inspectViggleFrame('video', 'image', controller.signal), { name: 'AbortError' })
    assert.equal(elements.length, 0)
  } finally { restore() }
})
