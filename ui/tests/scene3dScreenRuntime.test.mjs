import test from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, MeshBasicMaterial } from 'three'
import { bindScreenMedia } from '../src/features/scene3d/screenMediaRuntime.ts'
import { defaultMediaScreen } from '../src/features/scene3d/mediaScreen.ts'

// Browser currentTime changes before decoding finishes. Keep seeked under the
// test's control to exercise overlapping preview/export requests independently.
function mediaHarness() {
  const previous = globalThis.document
  const video = new EventTarget()
  Object.assign(video, { currentTime: 0, duration: 6, videoWidth: 320, videoHeight: 180,
    pause() {}, removeAttribute() {}, load() { queueMicrotask(() => video.dispatchEvent(new Event('loadeddata'))) } })
  const frames = []
  const context = { fillRect() {}, drawImage(source) { frames.push(source.currentTime) } }
  globalThis.document = { createElement: kind => kind === 'video' ? video : { getContext: () => context } }
  const root = new Group(), original = new MeshBasicMaterial(), mesh = new Mesh(undefined, original)
  mesh.name = 'SCREEN_CONTENT'; root.add(mesh)
  return { video, frames, root, mesh, original, finishSeek() { video.dispatchEvent(new Event('seeked')) },
    restore() { globalThis.document = previous; original.dispose() } }
}

test('no-op and same-target requests await decoded content and repaint on backward seek', async () => {
  const h = mediaHarness(), screen = { ...defaultMediaScreen(), media: 'video', sourceUrl: '/test.mp4' }
  const repaints = []
  const runtime = await bindScreenMedia(h.root, screen, true, new AbortController().signal, () => repaints.push(h.frames.at(-1)))
  try {
    const zero = runtime.seek(0, screen)
    const forward = runtime.seek(4, screen)
    assert.equal(h.video.currentTime, 4)
    let ready = false
    const same = runtime.seek(4, screen).then(() => { ready = true })
    await Promise.resolve()
    assert.equal(ready, false, 'the currentTime assignment does not prove frame readiness')
    h.finishSeek()
    await Promise.all([zero, forward, same])
    assert.equal(ready, true)
    assert.equal(repaints.at(-1), 4)
    const back = runtime.seek(1, screen)
    assert.equal(h.video.currentTime, 1)
    assert.equal(repaints.at(-1), 4)
    h.finishSeek(); await back
    assert.equal(repaints.at(-1), 1)
    const count = repaints.length
    runtime.dispose()
    assert.equal(h.mesh.material, h.original)
    h.finishSeek()
    assert.equal(repaints.length, count)
  } finally { runtime.dispose(); h.restore() }
})

test('disposing a pending video seek rejects it and restores the GLB material', async () => {
  const h = mediaHarness(), screen = { ...defaultMediaScreen(), media: 'video', sourceUrl: '/test.mp4' }
  const runtime = await bindScreenMedia(h.root, screen, false, new AbortController().signal)
  try {
    const pending = runtime.seek(3, screen)
    const rejected = assert.rejects(pending, /screen-media-disposed/)
    runtime.dispose()
    await rejected
    assert.equal(h.mesh.material, h.original)
    assert.deepEqual(h.frames, [0])
  } finally { runtime.dispose(); h.restore() }
})
