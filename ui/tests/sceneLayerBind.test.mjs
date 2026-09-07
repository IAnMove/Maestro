import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindLocalLayerFiles,
  captureLayerBind,
  makeLiveLayerSource,
} from '../src/lib/sceneLayerBind.ts'

const file = (name, type) => ({ name, type, size: 8 })

const liveFrom = state => makeLiveLayerSource({
  generation: state.generation,
  workspaceId: state.workspaceId,
  recording: state.recording,
  publishing: state.publishing,
  saving: state.saving,
  layers: state.layers,
})

test('local GLB upload adds a durable layer when the scene is still current', async () => {
  const state = {
    generation: 1,
    workspaceId: 'ws-a',
    recording: false,
    publishing: false,
    saving: false,
    layers: [],
  }
  const added = []
  await bindLocalLayerFiles(
    () => liveFrom(state),
    captureLayerBind(liveFrom(state), 'model3d', null),
    'model3d',
    [file('hero.glb', 'model/gltf-binary')],
    { addLayer: (...args) => added.push(args), reassignLayer: () => { throw new Error('reassign') } },
    message => { throw new Error(message) },
    async () => ({ filename: 'aa.glb', url: '/api/v1/uploads/aa.glb' }),
  )
  assert.deepEqual(added, [['model3d', '/api/v1/uploads/aa.glb', 'aa.glb', undefined]])
})

test('a scene import mid-upload does not add the file to the imported document', async () => {
  const state = {
    generation: 1,
    workspaceId: 'ws-a',
    recording: false,
    publishing: false,
    saving: false,
    layers: [{ id: 'old', type: 'image' }],
  }
  const capture = captureLayerBind(liveFrom(state), 'media', null)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const added = []
  const reassigned = []
  const pending = bindLocalLayerFiles(
    () => liveFrom(state),
    capture,
    'media',
    [file('clip.mp4', 'video/mp4')],
    {
      addLayer: (...args) => added.push(args),
      reassignLayer: (...args) => reassigned.push(args),
    },
    message => { throw new Error(message) },
    async () => {
      await gate
      return { filename: 'bb.mp4', url: '/api/v1/uploads/bb.mp4' }
    },
  )
  state.generation += 1
  state.layers = [{ id: 'imported', type: 'camera' }]
  release()
  assert.equal(await pending, null)
  assert.deepEqual(added, [])
  assert.deepEqual(reassigned, [])
})

test('workspace switch or record/save mid-upload is ignored', async () => {
  for (const mutate of [
    state => { state.workspaceId = 'ws-b' },
    state => { state.recording = true },
    state => { state.publishing = true },
    state => { state.saving = true },
  ]) {
    const state = {
      generation: 4,
      workspaceId: 'ws-a',
      recording: false,
      publishing: false,
      saving: false,
      layers: [],
    }
    const capture = captureLayerBind(liveFrom(state), 'overlay', null)
    let release
    const gate = new Promise(resolve => { release = resolve })
    const added = []
    const pending = bindLocalLayerFiles(
      () => liveFrom(state),
      capture,
      'overlay',
      [file('sticker.png', 'image/png')],
      { addLayer: (...args) => added.push(args), reassignLayer: () => {} },
      message => { throw new Error(message) },
      async () => {
        await gate
        return { filename: 'cc.png', url: '/api/v1/uploads/cc.png' }
      },
    )
    mutate(state)
    release()
    assert.equal(await pending, null)
    assert.deepEqual(added, [])
  }
})

test('reassign after the target layer is deleted during upload is ignored', async () => {
  const state = {
    generation: 1,
    workspaceId: 'ws-a',
    recording: false,
    publishing: false,
    saving: false,
    layers: [{ id: 'lost', type: 'model3d' }],
  }
  const capture = captureLayerBind(liveFrom(state), 'model3d', 'lost')
  let release
  const gate = new Promise(resolve => { release = resolve })
  const reassigned = []
  const pending = bindLocalLayerFiles(
    () => liveFrom(state),
    capture,
    'model3d',
    [file('other.glb', 'model/gltf-binary')],
    { addLayer: () => { throw new Error('add') }, reassignLayer: (...args) => reassigned.push(args) },
    message => { throw new Error(message) },
    async () => {
      await gate
      return { filename: 'dd.glb', url: '/api/v1/uploads/dd.glb' }
    },
  )
  state.layers = []
  release()
  assert.equal(await pending, null)
  assert.deepEqual(reassigned, [])
})
