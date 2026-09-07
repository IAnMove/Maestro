import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindKindFromLayerType,
  commitLayerSourceChoice,
  isOverlayFilename,
  isTransientLayerSource,
  localFileMatchesKind,
  outputFromLocalUpload,
  resolveBoundLayerType,
} from '../src/lib/sceneLayerSource.ts'

const item = (name, type = 'image', url = `/api/v1/file/${name}`) => ({
  name,
  type,
  mode: null,
  size: 4,
  created_at: 1,
  url,
  thumbnail_url: type === 'image' ? url : '',
})

const live = (overrides = {}) => {
  const layers = {
    lost: 'model3d',
    plate: 'image',
    sticker: 'overlay',
    clip: 'video',
  }
  return {
    generation: 1,
    workspaceId: 'ws-a',
    recording: false,
    publishing: false,
    saving: false,
    layerExists: id => id in layers,
    layerType: id => layers[id],
    ...overrides,
  }
}

const capture = (overrides = {}) => ({
  generation: 1,
  workspaceId: 'ws-a',
  reassignId: null,
  kind: 'model3d',
  ...overrides,
})

test('overlay filenames accept png/webp only', () => {
  assert.equal(isOverlayFilename('sticker.png'), true)
  assert.equal(isOverlayFilename('sticker.WEBP'), true)
  assert.equal(isOverlayFilename('photo.jpg'), false)
  assert.equal(isTransientLayerSource('blob:http://localhost/1'), true)
  assert.equal(isTransientLayerSource('/api/v1/file/hero.glb'), false)
})

test('bind kind follows the lost layer type', () => {
  assert.equal(bindKindFromLayerType('model3d'), 'model3d')
  assert.equal(bindKindFromLayerType('overlay'), 'overlay')
  assert.equal(bindKindFromLayerType('image'), 'media')
  assert.equal(bindKindFromLayerType('video'), 'media')
  assert.equal(bindKindFromLayerType('camera'), null)
})

test('local overlay files stay png/webp; media keeps image and video', () => {
  const png = { name: 'a.png', type: 'image/png' }
  const jpg = { name: 'a.jpg', type: 'image/jpeg' }
  const glb = { name: 'hero.glb', type: '' }
  const mp4 = { name: 'clip.mp4', type: 'video/mp4' }
  assert.equal(localFileMatchesKind('overlay', png), true)
  assert.equal(localFileMatchesKind('overlay', jpg), false)
  assert.equal(localFileMatchesKind('model3d', glb), true)
  assert.equal(localFileMatchesKind('media', mp4), true)
})

test('catalog GLB adds a model3d layer with a durable url', () => {
  const commit = commitLayerSourceChoice(live(), capture(), item('hero.glb', 'model3d'))
  assert.deepEqual(commit, {
    action: 'add',
    type: 'model3d',
    source: '/api/v1/file/hero.glb',
    name: 'hero.glb',
    thumbnail: undefined,
  })
})

test('catalog media maps video vs image independently', () => {
  assert.equal(commitLayerSourceChoice(live(), capture({ kind: 'media' }), item('clip.mp4', 'video')).type, 'video')
  assert.equal(commitLayerSourceChoice(live(), capture({ kind: 'media' }), item('plate.png', 'image')).type, 'image')
})

test('overlay catalog rejects jpeg and accepts png', () => {
  assert.equal(commitLayerSourceChoice(live(), capture({ kind: 'overlay' }), item('photo.jpg')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live(), capture({ kind: 'overlay' }), item('sticker.png')).type, 'overlay')
})

test('blob urls are not committed', () => {
  assert.equal(commitLayerSourceChoice(live(), capture(), item('hero.glb', 'model3d', 'blob:http://localhost/x')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live(), capture(), null).action, 'ignore')
})

test('stale generation, workspace or busy export does not mutate', () => {
  assert.equal(commitLayerSourceChoice(live({ generation: 2 }), capture(), item('hero.glb', 'model3d')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live({ workspaceId: 'ws-b' }), capture(), item('hero.glb', 'model3d')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live({ recording: true }), capture(), item('hero.glb', 'model3d')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live({ publishing: true }), capture(), item('hero.glb', 'model3d')).action, 'ignore')
  assert.equal(commitLayerSourceChoice(live({ saving: true }), capture(), item('hero.glb', 'model3d')).action, 'ignore')
})

test('reassign keeps the lost layer id and type', () => {
  const commit = commitLayerSourceChoice(
    live(),
    capture({ reassignId: 'lost', kind: 'model3d', existingType: 'model3d' }),
    item('other.glb', 'model3d'),
  )
  assert.equal(commit.action, 'reassign')
  assert.equal(commit.layerId, 'lost')
  assert.equal(commit.type, 'model3d')
  assert.equal(commit.source, '/api/v1/file/other.glb')
})

test('reassign rejects a different media type and a missing layer', () => {
  assert.equal(
    commitLayerSourceChoice(
      live(),
      capture({ reassignId: 'lost', kind: 'media', existingType: 'model3d' }),
      item('plate.png'),
    ).action,
    'ignore',
  )
  assert.equal(
    commitLayerSourceChoice(
      live(),
      capture({ reassignId: 'plate', kind: 'media', existingType: 'image' }),
      item('clip.mp4', 'video'),
    ).action,
    'ignore',
  )
  assert.equal(
    commitLayerSourceChoice(
      live(),
      capture({ reassignId: 'gone', kind: 'model3d', existingType: 'model3d' }),
      item('hero.glb', 'model3d'),
    ).action,
    'ignore',
  )
})

test('local upload helper keeps a durable url and drops the original File name into the stored filename', () => {
  const file = { name: 'Hero Shot.glb', type: 'model/gltf-binary', size: 12 }
  const output = outputFromLocalUpload(file, { filename: 'hero-shot.glb', url: '/api/v1/file/hero-shot.glb' }, 'model3d')
  assert.equal(output.type, 'model3d')
  assert.equal(output.url, '/api/v1/file/hero-shot.glb')
  assert.equal(output.name, 'hero-shot.glb')
  assert.equal(isTransientLayerSource(output.url), false)
  assert.equal(resolveBoundLayerType('model3d', output), 'model3d')
})
