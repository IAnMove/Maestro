import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_OUTPUT_BYTES,
  MAX_OUTPUTS,
  REVIEW_HEADERS,
  createWriteBudget,
  validateReviewSnapshot,
} from '../scripts/sceneTemplateReview/security.mjs'

const inlineImage = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'
const inlineGlb = 'data:model/gltf-binary;base64,AA=='
const atmosphereKinds = ['rain', 'snow', 'dust', 'embers', 'fog', 'smoke', 'ash', 'fireflies', 'confetti', 'bokeh', 'sparkles', 'bubbles', 'speedlines', 'leaves']

const atmosphere = kind => ({ kind, density: 24, speed: 0.5, size: 1, wind: 0, color: '#ffffff' })

const makeScene = (overrides = {}) => ({
  version: 1,
  name: 'Security fixture',
  generationPolicy: 'provided_only',
  width: 1280,
  height: 720,
  fps: 30,
  duration: 4,
  layers: [{
    id: 'hero',
    name: 'hero',
    type: 'image',
    source: inlineImage,
    visible: true,
    z: 1,
  }],
  narrative: { templateId: 'security-fixture' },
  ...overrides,
})

test('write budget defaults are bounded and reservations are fail-closed', () => {
  assert.equal(MAX_OUTPUTS, 128)
  assert.equal(MAX_OUTPUT_BYTES, 256 * 1024 * 1024)

  const budget = createWriteBudget({ maxOutputs: 2, maxBytes: 10 })
  assert.deepEqual(budget.snapshot(), { outputs: 0, bytes: 0, maxOutputs: 2, maxBytes: 10 })
  budget.reserve(4)
  assert.deepEqual(budget.snapshot(), { outputs: 1, bytes: 4, maxOutputs: 2, maxBytes: 10 })
  budget.reserve(6)
  assert.deepEqual(budget.snapshot(), { outputs: 2, bytes: 10, maxOutputs: 2, maxBytes: 10 })
  assert.throws(() => budget.reserve(0), /quota/i)
  assert.throws(() => budget.reserve(1), /quota/i)
})

test('write budgets cannot be widened beyond the sandbox defaults', () => {
  assert.throws(() => createWriteBudget({ maxOutputs: MAX_OUTPUTS + 1 }), /budget/i)
  assert.throws(() => createWriteBudget({ maxBytes: MAX_OUTPUT_BYTES + 1 }), /budget/i)
  assert.throws(() => createWriteBudget({ maxOutputs: 0 }), /budget/i)
  assert.throws(() => createWriteBudget({ maxBytes: 0 }), /budget/i)
})

test('review headers deny framing and external connections', () => {
  assert.equal(REVIEW_HEADERS['x-content-type-options'], 'nosniff')
  assert.equal(REVIEW_HEADERS['referrer-policy'], 'no-referrer')
  assert.equal(REVIEW_HEADERS['x-frame-options'], 'DENY')
  assert.match(REVIEW_HEADERS['content-security-policy'], /default-src 'none'/)
  assert.match(REVIEW_HEADERS['content-security-policy'], /connect-src 'self' data: blob:/)
})

test('accepts the canonical silent scene and returns the original object unchanged', () => {
  const scene = makeScene()
  assert.strictEqual(validateReviewSnapshot(scene), scene)

  const modelScene = makeScene({
    layers: [{
      id: 'ship',
      name: 'ship',
      type: 'model3d',
      source: inlineGlb,
      visible: true,
      z: 1,
    }],
  })
  assert.strictEqual(validateReviewSnapshot(modelScene), modelScene)
})

test('accepts each editor atmosphere only when its procedural source and kind agree', () => {
  assert.equal(atmosphereKinds.length, 14)
  for (const kind of atmosphereKinds) {
    const scene = makeScene({
      layers: [{
        id: `atmosphere-${kind}`,
        name: kind,
        type: 'effect',
        source: `maestro-effect:${kind}`,
        atmosphere: atmosphere(kind),
        visible: true,
        z: 30,
      }],
    })
    const persisted = JSON.parse(JSON.stringify(scene))
    assert.strictEqual(validateReviewSnapshot(persisted), persisted, kind)
  }
})

test('rejects procedural effect sources in other layer fields, mismatched kinds and unknown effects', () => {
  const valid = atmosphere('rain')
  for (const type of ['image', 'camera', 'overlay']) {
    const scene = makeScene({ layers: [{ id: type, name: type, type, source: 'maestro-effect:rain', atmosphere: valid, visible: true, z: 1 }] })
    assert.throws(() => validateReviewSnapshot(scene), /inline or indexed|external/i, type)
  }
  for (const layer of [
    { id: 'missing-atmosphere', name: 'missing-atmosphere', type: 'effect', source: 'maestro-effect:rain', visible: true, z: 1 },
    { id: 'wrong-kind', name: 'wrong-kind', type: 'effect', source: 'maestro-effect:rain', atmosphere: atmosphere('snow'), visible: true, z: 1 },
    { id: 'unknown-kind', name: 'unknown-kind', type: 'effect', source: 'maestro-effect:laser', atmosphere: atmosphere('laser'), visible: true, z: 1 },
  ]) {
    assert.throws(() => validateReviewSnapshot(makeScene({ layers: [layer] })), /inline or indexed|external/i, layer.id)
  }
  const narrativeSource = makeScene({
    narrative: { templateId: 'security-fixture', assets: [{ type: 'image', source: 'maestro-effect:rain' }] },
  })
  assert.throws(() => validateReviewSnapshot(narrativeSource), /inline or indexed|external/i)
})

test('accepts only an indexed same-application source through the explicit callback', () => {
  const source = '/api/v1/file/review-asset.glb?workspace=default'
  const seen = []
  const scene = makeScene({
    layers: [{
      id: 'ship',
      name: 'ship',
      type: 'model3d',
      source,
      visible: true,
      z: 1,
    }],
  })
  assert.strictEqual(validateReviewSnapshot(scene, value => {
    seen.push(value)
    return value === source
  }), scene)
  assert.deepEqual(seen, [source])

  const absoluteSource = 'http://review.test:4173/api/v1/file/review-asset.glb?workspace=default'
  const absoluteScene = makeScene({
    layers: [{ ...scene.layers[0], source: absoluteSource }],
  })
  assert.throws(() => validateReviewSnapshot(absoluteScene, value => value === absoluteSource), /inline or indexed/i)

  assert.throws(() => validateReviewSnapshot(scene, () => false), /inline or indexed/i)
})

test('rejects blob, external and local file sources even if a callback is permissive', () => {
  for (const source of [
    'blob:http://127.0.0.1:4173/temporary',
    'https://example.com/remote.png',
    'file:///tmp/scene.png',
    '/tmp/scene.png',
  ]) {
    const scene = makeScene({ layers: [{ ...makeScene().layers[0], source }] })
    assert.throws(() => validateReviewSnapshot(scene, () => true), /inline or indexed|external|blob|disk/i, source)
  }
})

test('rejects audio, unsafe identity and geometry/time budget violations', () => {
  assert.throws(() => validateReviewSnapshot(makeScene({
    audioTracks: [{ id: 'music', filename: 'music.wav', name: 'music', kind: 'music', startTime: 0, volume: 1 }],
  })), /silent/i)

  assert.throws(() => validateReviewSnapshot(makeScene({ narrative: { templateId: '../escape' } })), /safe template/i)
  assert.throws(() => validateReviewSnapshot(makeScene({ width: 1921 })), /budget/i)
  assert.throws(() => validateReviewSnapshot(makeScene({ height: 1081 })), /budget/i)
  assert.throws(() => validateReviewSnapshot(makeScene({ duration: 31 })), /budget/i)

  const tooManyLayers = Array.from({ length: 25 }, (_, index) => ({
    ...makeScene().layers[0],
    id: `layer-${index}`,
  }))
  assert.throws(() => validateReviewSnapshot(makeScene({ layers: tooManyLayers })), /budget/i)
})
