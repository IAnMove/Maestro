import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertFacePatchPose,
  cropCharacterFacePatch,
  facePatchAnchor,
  facePatchRegionFromAnchor,
  facePatchSceneTransform,
  isFacePatchCompatible,
  registerCharacterFacePatch,
  validateFacePatchFrame,
  validateFacePatchMetadata,
  validateFacePatchRegion,
} from '../src/lib/characterFacePatch.ts'
import { createCharacterKit, mountCharacterKitLayers, registerWipedKitPose, syncMountedCharacterKitLayers } from '../src/lib/characterKit.ts'

const SHA = 'a'.repeat(64)
const pose = {
  id: 'luna-base', name: 'Luna base', source: '/api/v1/file/luna-base.png',
  kind: 'image', alphaStatus: 'opaque', reviewState: 'approved',
}

function pixelIndex(x, y, width) {
  return (y * width + x) * 4
}

function pixelAt(rgba, x, y, width) {
  return Array.from(rgba.subarray(pixelIndex(x, y, width), pixelIndex(x, y, width) + 4))
}

function opaqueFrame(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = pixelIndex(x, y, width)
      rgba[index] = (x * 17 + y * 3) % 256
      rgba[index + 1] = (y * 19 + x * 5) % 256
      rgba[index + 2] = (x * 11 + y * 23) % 256
      rgba[index + 3] = 255
    }
  }
  return rgba
}

function validMetadata(overrides = {}) {
  const base = {
    version: 1,
    poseId: 'base',
    poseSource: pose.source,
    variantSource: '/api/v1/file/luna-wide-variant.png',
    sourceWidth: 32,
    sourceHeight: 32,
    region: { x: 12, y: 12, size: 8 },
    feather: .08,
    poseSha256: SHA,
    variantSha256: SHA,
    outputSha256: SHA,
  }
  return { ...base, ...overrides }
}

function validKit(overrides = {}) {
  return {
    ...createCharacterKit('Luna'),
    base: pose,
    anchors: { base: { mouth: { offsetX: 1, offsetY: -10, scale: .2, rotation: 0 } } },
    provenance: [{ method: 'seed', source: pose.source }],
    ...overrides,
  }
}

function patchAsset(overrides = {}) {
  return {
    id: 'luna-wide-patch', name: 'Luna wide patch', source: '/api/v1/file/luna-wide-patch.png',
    kind: 'image', alphaStatus: 'opaque', reviewState: 'approved', ...overrides,
  }
}

test('crop preserves the opaque centre and source texture while feathering only the boundary', () => {
  const width = 16
  const height = 16
  const region = { x: 4, y: 4, size: 8 }
  const rgba = opaqueFrame(width, height)
  const before = rgba.slice()

  const patch = cropCharacterFacePatch(rgba, width, height, region, .25)

  assert.equal(patch.length, region.size * region.size * 4)
  for (let row = 0; row < region.size; row += 1) {
    for (let col = 0; col < region.size; col += 1) {
      const source = pixelAt(rgba, region.x + col, region.y + row, width)
      assert.deepEqual(pixelAt(patch, col, row, region.size).slice(0, 3), source.slice(0, 3))
    }
  }
  assert.deepEqual(pixelAt(patch, 4, 4, region.size), pixelAt(rgba, 8, 8, width))
  assert.equal(pixelAt(patch, 0, 0, region.size)[3], 0)
  assert.equal(pixelAt(patch, 1, 1, region.size)[3], 128)
  assert.deepEqual(rgba, before)
})

test('frame, region, buffer and alpha validation rejects malformed or unsafe values', () => {
  for (const [width, height] of [
    [15, 16], [16, 15], [4097, 16], [16, 4097], [2049, 2049],
    [Number.NaN, 16], [16, Number.POSITIVE_INFINITY], [16.5, 16], ['16', 16], [true, 16],
  ]) {
    assert.throws(() => validateFacePatchFrame(width, height), /Face patch images/)
  }

  const validRegion = { x: 4, y: 4, size: 8 }
  for (const region of [
    null, undefined, true, '8', { x: 4, y: 4, size: 7 }, { x: 4, y: 4, size: 1025 },
    { x: -1, y: 4, size: 8 }, { x: 9, y: 4, size: 8 }, { x: 4, y: -1, size: 8 },
    { x: 4, y: 9, size: 8 }, { x: Number.NaN, y: 4, size: 8 }, { x: 4, y: 4, size: '8' },
    { x: 4, y: 4, size: true },
  ]) {
    assert.throws(() => validateFacePatchRegion(region, 16, 16, .08), /Place an 8–1024/)
  }
  for (const feather of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, .251, true, '0.08', null]) {
    assert.throws(() => validateFacePatchRegion(validRegion, 16, 16, feather), /feather must be between/)
  }

  const frame = opaqueFrame(16, 16)
  assert.throws(() => cropCharacterFacePatch(new Uint8Array(frame), 16, 16, validRegion), /Invalid face patch pixel buffer/)
  assert.throws(() => cropCharacterFacePatch(frame.subarray(0, frame.length - 1), 16, 16, validRegion), /Invalid face patch pixel buffer/)
  assert.throws(() => cropCharacterFacePatch(Array.from(frame), 16, 16, validRegion), /Invalid face patch pixel buffer/)

  const translucentCentre = frame.slice()
  translucentCentre[pixelIndex(8, 8, 16) + 3] = 254
  assert.throws(() => cropCharacterFacePatch(translucentCentre, 16, 16, validRegion, .25), /fully cover the mouth region/)
  const translucentBoundary = frame.slice()
  translucentBoundary[pixelIndex(4, 4, 16) + 3] = 0
  assert.equal(cropCharacterFacePatch(translucentBoundary, 16, 16, validRegion, .25)[3], 0)
})

test('face patch anchors map exactly for landscape and portrait frames', () => {
  const landscapeAnchor = { offsetX: 6.25, offsetY: -12.5, scale: .25, rotation: 0 }
  const landscapeRegion = facePatchRegionFromAnchor(landscapeAnchor, 32, 16)
  assert.deepEqual(landscapeRegion, { x: 14, y: 0, size: 8 })
  assert.deepEqual(facePatchAnchor(landscapeRegion, 32, 16), landscapeAnchor)

  const portraitAnchor = { offsetX: -6.25, offsetY: 12.5, scale: .25, rotation: 0 }
  const portraitRegion = facePatchRegionFromAnchor(portraitAnchor, 16, 32)
  assert.deepEqual(portraitRegion, { x: 2, y: 16, size: 8 })
  assert.deepEqual(facePatchAnchor(portraitRegion, 16, 32), portraitAnchor)

  for (const anchor of [
    null, { offsetX: '0', offsetY: 0, scale: .25, rotation: 0 },
    { offsetX: 0, offsetY: 0, scale: Number.NaN, rotation: 0 },
    { offsetX: 0, offsetY: 0, scale: 0, rotation: 0 },
    { offsetX: 0, offsetY: 0, scale: .25, rotation: 1 },
  ]) {
    assert.throws(() => facePatchRegionFromAnchor(anchor, 32, 32))
  }
})

test('face patch scene placement accounts for source aspect ratio and pose rotation', () => {
  const landscapeMetadata = validMetadata({
    sourceWidth: 32, sourceHeight: 16, region: { x: 14, y: 0, size: 8 },
  })
  const portraitMetadata = validMetadata({
    sourceWidth: 16, sourceHeight: 32, region: { x: 2, y: 16, size: 8 },
  })
  const anchor = { offsetX: 6.25, offsetY: -12.5, scale: .25, rotation: 0 }
  const pose = { x: 50, y: 55, scale: 1, opacity: 1, rotation: 0 }
  const viewport = { width: 1920, height: 1080 }

  assert.deepEqual(facePatchSceneTransform(pose, anchor, landscapeMetadata, viewport), {
    x: 56.25, y: 32.77777777777778, scale: 0.4444444444444444, opacity: 1, rotation: 0,
  })
  assert.deepEqual(facePatchSceneTransform(pose, anchor, portraitMetadata, viewport), {
    x: 53.515625, y: 42.5, scale: .25, opacity: 1, rotation: 0,
  })

  const rotated = facePatchSceneTransform({ ...pose, rotation: 90 }, anchor, landscapeMetadata, viewport)
  assert.deepEqual(rotated, {
    x: 62.5, y: 66.11111111111111, scale: 0.4444444444444444, opacity: 1, rotation: 90,
  })
  assert.throws(() => facePatchSceneTransform(pose, anchor, landscapeMetadata, { width: 0, height: 1080 }), /positive scene dimensions/)
  assert.throws(() => facePatchSceneTransform(pose, anchor, landscapeMetadata, { width: '1920', height: 1080 }), /positive scene dimensions/)
})

test('metadata validation returns a defensive copy and rejects bad types, sources, hashes and bounds', () => {
  const input = validMetadata()
  const parsed = validateFacePatchMetadata(input)
  assert.deepEqual(parsed, input)
  assert.notEqual(parsed, input)
  assert.notEqual(parsed.region, input.region)
  input.region.x = 0
  assert.equal(parsed.region.x, 12)
  const uploaded = validateFacePatchMetadata(validMetadata({
    poseSource: '/api/v1/uploads/luna-base-upload.png',
    variantSource: '/api/v1/uploads/luna-wide-upload.png',
  }))
  assert.equal(uploaded.poseSource, '/api/v1/uploads/luna-base-upload.png')
  assert.equal(uploaded.variantSource, '/api/v1/uploads/luna-wide-upload.png')

  for (const value of [null, undefined, false, true, 1, 'metadata', []]) {
    assert.throws(() => validateFacePatchMetadata(value), /Invalid face patch metadata|Unsupported face patch/)
  }
  for (const version of [0, 2, '1', true, null]) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ version })), /Unsupported face patch version/)
  }
  for (const poseId of ['', 'base/other', 'ümlaut', true, 'x'.repeat(121)]) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ poseId })), /Unsupported face patch version/)
  }
  for (const source of ['', ' /api/v1/file/pose.png', '/api/v1/file/pose.png ', 'blob:temporary', 'data:image/png;base64,abc',
    'https://example.test/pose.png', '../pose.png', 'folder/pose.png', 'pose.png?cache=1', true, 12, '\u0000']) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ poseSource: source })), /saved source images/)
    assert.throws(() => validateFacePatchMetadata(validMetadata({ variantSource: source })), /saved source images/)
  }
  for (const digest of ['', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), true, 12, `${SHA} `]) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ poseSha256: digest })), /hashes are missing or invalid/)
  }
  for (const [sourceWidth, sourceHeight] of [[15, 32], [32, 15], ['32', 32], [Number.NaN, 32], [4097, 32]]) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ sourceWidth, sourceHeight })), /Face patch images/)
  }
  for (const region of [null, { x: 0, y: 0, size: 7 }, { x: 25, y: 12, size: 8 }, { x: 12, y: 12, size: '8' }]) {
    assert.throws(() => validateFacePatchMetadata(validMetadata({ region })), /Place an 8–1024/)
  }
  assert.throws(() => validateFacePatchMetadata({ ...validMetadata(), extra: true }), /metadata fields/)
  assert.throws(() => validateFacePatchMetadata(validMetadata({ region: { x: 12, y: 12, size: 8, extra: true } })), /region fields/)
})

test('registering a face patch creates a pending new overlay and preserves prior provenance', () => {
  const kit = validKit()
  const metadata = validMetadata()
  const asset = patchAsset()
  const next = registerCharacterFacePatch(kit, 'base', 'wide', asset, metadata)

  assert.equal(kit.mouth.wide, undefined)
  assert.deepEqual(kit.provenance, [{ method: 'seed', source: pose.source }])
  assert.equal(next.mouth.wide.id, asset.id)
  assert.equal(next.mouth.wide.source, asset.source)
  assert.equal(next.mouth.wide.kind, 'overlay')
  assert.equal(next.mouth.wide.reviewState, 'pending')
  assert.deepEqual(next.mouth.wide.facePatch, metadata)
  assert.deepEqual(next.anchors.base.mouth, kit.anchors.base.mouth)
  assert.deepEqual(next.anchors.base.mouthStates.wide, facePatchAnchor(metadata.region, 32, 32))
  assert.deepEqual(next.provenance.slice(0, -1), kit.provenance)
  assert.equal(next.provenance.at(-1).method, 'character-face-patch-v1')
  assert.equal(next.provenance.at(-1).source, asset.source)
})

test('registration rejects reused identities, transient sources, unreviewed poses and malicious states', () => {
  const metadata = validMetadata()
  const kit = validKit()
  const cases = [
    [/** @type {any} */ ('smile'), patchAsset(), metadata, /Choose a mouth state/],
    [/** @type {any} */ (true), patchAsset(), metadata, /Choose a mouth state/],
    ['wide', patchAsset({ source: 'blob:temporary' }), metadata, /Save the facial patch/],
    ['wide', patchAsset({ source: pose.source }), metadata, /Save the facial patch/],
    ['wide', patchAsset({ source: metadata.variantSource }), metadata, /Save the facial patch/],
    ['wide', patchAsset({ id: pose.id }), metadata, /Save the facial patch/],
    ['wide', patchAsset(), { ...metadata, poseId: 'other' }, /another pose/],
  ]
  for (const [state, asset, patch, message] of cases) {
    assert.throws(() => registerCharacterFacePatch(kit, 'base', state, asset, patch), message)
  }
  assert.throws(() => registerCharacterFacePatch({ ...kit, base: { ...pose, reviewState: 'pending' } }, 'base', 'wide', patchAsset(), metadata), /Approve the base pose/)
  assert.throws(() => registerCharacterFacePatch(kit, 'missing', 'wide', patchAsset(), metadata), /Approve the base pose/)
})

function kitWithPatch(overrides = {}) {
  return validKit({
    mouth: { closed: { ...patchAsset({ id: 'luna-closed-patch', name: 'Closed patch' }), facePatch: validMetadata(), reviewState: 'approved' } },
    ...overrides,
  })
}

test('mounting rejects a patch from another pose or changed source, while legacy overlays remain usable', () => {
  const kit = kitWithPatch({ poses: { side: { ...pose, id: 'luna-side', name: 'Luna side', source: '/api/v1/file/luna-side.png' } } })
  assert.throws(() => mountCharacterKitLayers(kit, 'side'), /another pose or an earlier image/)

  const changedSource = { ...kit, base: { ...pose, source: '/api/v1/file/luna-base-replaced.png' } }
  assert.throws(() => mountCharacterKitLayers(changedSource, 'base'), /another pose or an earlier image/)

  const legacy = validKit({
    mouth: { closed: { ...patchAsset({ id: 'legacy-mouth' }), facePatch: undefined, reviewState: 'approved' } },
  })
  const mountedLegacy = mountCharacterKitLayers(legacy, 'base')
  assert.equal(mountedLegacy.filter(layer => layer.id.endsWith('mouth-closed')).length, 1)
})

test('automatic kit sync leaves an authored snapshot untouched when its pose or patch is stale', () => {
  const kit = kitWithPatch()
  const mounted = mountCharacterKitLayers(kit, 'base')
  const pendingPose = { ...kit, base: { ...pose, reviewState: 'pending' } }
  const replacedPose = { ...kit, base: { ...pose, source: '/api/v1/file/luna-base-replaced.png' } }
  assert.strictEqual(syncMountedCharacterKitLayers(mounted, pendingPose, 'base'), mounted)
  assert.strictEqual(syncMountedCharacterKitLayers(mounted, replacedPose, 'base'), mounted)
})

test('wiping a pose rejects reuse and records a changed copy without secure-context randomUUID', (context) => {
  context.mock.method(globalThis.crypto, 'randomUUID', () => { throw new Error('Unavailable on plain-HTTP LAN') })
  const kit = validKit()
  assert.throws(() => registerWipedKitPose(kit, 'base', { ...pose, name: 'Same image' }), /new image/)
  const wiped = registerWipedKitPose(kit, 'base', {
    ...pose, source: '/api/v1/file/luna-wiped.png', name: 'Wiped copy',
  })
  assert.equal(kit.base.reviewState, 'approved')
  assert.equal(wiped.base.reviewState, 'pending')
  assert.notEqual(wiped.base.id, kit.base.id)
  assert.match(wiped.base.id, /-wiped-[a-f0-9]{32}$/)
  assert.equal(wiped.provenance.at(-1).method, 'character-kit-mouth-wipe')
})

test('JSON round-trip preserves semantic face binding and parent relationship', () => {
  const mounted = mountCharacterKitLayers(kitWithPatch(), 'base')
  const restored = JSON.parse(JSON.stringify(mounted))
  const poseLayer = restored[0]
  const mouth = restored.find(layer => layer.id.endsWith('mouth-closed'))
  assert.deepEqual(mouth.faceBinding, { poseLayerId: poseLayer.id, role: 'mouth', state: 'closed' })
  assert.deepEqual(mouth.relationship, { type: 'parent', targetLayerId: poseLayer.id })
})

test('assertFacePatchPose accepts legacy assets and only compatible patch provenance', () => {
  const legacy = patchAsset({ facePatch: undefined })
  assert.doesNotThrow(() => assertFacePatchPose(legacy, 'base', pose.source))
  assert.equal(isFacePatchCompatible(legacy, 'base', pose.source), true)
  const current = patchAsset({ facePatch: validMetadata() })
  assert.doesNotThrow(() => assertFacePatchPose(current, 'base', pose.source))
  assert.equal(isFacePatchCompatible(current, 'base', pose.source), true)
  assert.throws(() => assertFacePatchPose(current, 'base', '/api/v1/file/luna-base-replaced.png'), /another pose or an earlier image/)
  assert.throws(() => assertFacePatchPose(current, 'other', pose.source), /another pose or an earlier image/)
  assert.equal(isFacePatchCompatible(current, 'base', '/api/v1/file/luna-base-replaced.png'), false)
  assert.equal(isFacePatchCompatible(current, 'other', pose.source), false)
  assert.equal(isFacePatchCompatible({ ...current, facePatch: { ...validMetadata(), extra: true } }, 'base', pose.source), false)
})
