import assert from 'node:assert/strict'
import test from 'node:test'
import { webcrypto } from 'node:crypto'
import { prepareCharacterFacePatch } from '../src/lib/prepareCharacterFacePatch.ts'

const MAX_BYTES = 8 * 1024 * 1024
const ORIGIN = 'https://hocus.local'
const POSE_SOURCE = '/api/v1/file/luna-base.png'
const UPLOAD_POSE_SOURCE = '/api/v1/uploads/luna-base-upload.png'
const ANCHOR = { offsetX: 0, offsetY: 0, scale: .25, rotation: 0 }

function pixelIndex(x, y, width) {
  return (y * width + x) * 4
}

function pixelAt(rgba, x, y, width) {
  return Array.from(rgba.subarray(pixelIndex(x, y, width), pixelIndex(x, y, width) + 4))
}

function texturedFrame(width, height) {
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

function makeVariant(type = 'image/png', bytes = [9, 8, 7, 6]) {
  return new Blob([new Uint8Array(bytes)], { type })
}

function makeReader(chunks, mime) {
  let cursor = 0
  const state = { reads: 0, cancelled: 0, released: false, getReaderCalls: 0 }
  const reader = {
    async read() {
      state.reads += 1
      if (cursor >= chunks.length) return { done: true, value: undefined }
      return { done: false, value: chunks[cursor++] }
    },
    async cancel() {
      state.cancelled += 1
    },
    releaseLock() {
      state.released = true
    },
  }
  const body = {
    getReader() {
      state.getReaderCalls += 1
      return reader
    },
  }
  return {
    state,
    response: {
      ok: true,
      body,
      headers: { get: name => name.toLowerCase() === 'content-type' ? mime : null },
    },
  }
}

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true, enumerable: true, writable: true, value,
  })
}

const GLOBALS = ['window', 'fetch', 'createImageBitmap', 'document', 'crypto']

async function withBrowser(options, callback) {
  const previous = new Map(GLOBALS.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const poseWidth = options.poseWidth ?? 32
  const poseHeight = options.poseHeight ?? 32
  const variantWidth = options.variantWidth ?? poseWidth
  const variantHeight = options.variantHeight ?? poseHeight
  const variantPixels = options.variantPixels ?? texturedFrame(variantWidth, variantHeight)
  const stream = makeReader(options.poseChunks ?? [new Uint8Array([1, 2]), new Uint8Array([3, 4])], options.poseMime ?? 'image/png')
  const state = Object.assign(stream.state, {
    fetchCalls: [],
    bitmapInputs: [],
    bitmaps: [],
    canvas: null,
    canvasCreated: false,
    canvasSizes: [],
    drawCalls: [],
    getImageDataCalls: [],
    createImageDataCalls: [],
    putImageDataCalls: [],
    toBlobCalls: [],
    outputPixels: null,
  })
  const context = {
    drawImage(bitmap, x, y) {
      state.drawCalls.push({ bitmap, x, y })
    },
    getImageData(x, y, width, height) {
      state.getImageDataCalls.push({ x, y, width, height })
      return { data: new Uint8ClampedArray(variantPixels) }
    },
    createImageData(width, height) {
      state.createImageDataCalls.push({ width, height })
      return { data: new Uint8ClampedArray(width * height * 4) }
    },
    putImageData(imageData, x, y) {
      state.putImageDataCalls.push({ x, y })
      state.outputPixels = imageData.data.slice()
    },
  }
  const canvas = {
    _width: 0,
    _height: 0,
    get width() { return this._width },
    set width(value) {
      this._width = value
      state.canvasSizes.push({ width: this._width, height: this._height })
    },
    get height() { return this._height },
    set height(value) {
      this._height = value
      state.canvasSizes.push({ width: this._width, height: this._height })
    },
    getContext(type, attributes) {
      state.contextRequest = { type, attributes }
      return options.canvasContext === false ? null : context
    },
    toBlob(callback, mime) {
      state.toBlobCalls.push(mime)
      callback(options.encodeResult === null
        ? null
        : new Blob([state.outputPixels ?? new Uint8Array()], { type: mime }))
    },
  }
  state.canvas = canvas

  setGlobal('window', { location: { origin: ORIGIN } })
  setGlobal('crypto', options.secure === false ? undefined : webcrypto)
  setGlobal('fetch', async (url, init) => {
    state.fetchCalls.push({ url: String(url), init })
    return stream.response
  })
  setGlobal('createImageBitmap', async input => {
    const bitmapIndex = state.bitmaps.length
    const dimensions = bitmapIndex === 0
      ? { width: poseWidth, height: poseHeight }
      : { width: variantWidth, height: variantHeight }
    const record = { closed: 0 }
    const bitmap = {
      ...dimensions,
      close() { record.closed += 1 },
    }
    state.bitmapInputs.push(input)
    state.bitmaps.push({ bitmap, record })
    return bitmap
  })
  setGlobal('document', {
    createElement(name) {
      assert.equal(name, 'canvas')
      state.canvasCreated = true
      return canvas
    },
  })

  try {
    return await callback(state)
  } finally {
    for (const name of GLOBALS) {
      const descriptor = previous.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
}

test('preparation reads only the saved pose, crops real variant pixels, hashes inputs and closes resources', async () => {
  const variant = makeVariant()
  const variantBefore = new Uint8Array(await variant.arrayBuffer())
  const variantPixels = texturedFrame(32, 32)

  await withBrowser({ variantPixels }, async state => {
    const result = await prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR)

    assert.equal(result.blob.type, 'image/png')
    assert.deepEqual(result.metadata, {
      version: 1,
      poseSource: POSE_SOURCE,
      sourceWidth: 32,
      sourceHeight: 32,
      region: { x: 12, y: 12, size: 8 },
      feather: .08,
      poseSha256: result.metadata.poseSha256,
      variantSha256: result.metadata.variantSha256,
      outputSha256: result.metadata.outputSha256,
    })
    for (const digest of [result.metadata.poseSha256, result.metadata.variantSha256, result.metadata.outputSha256]) {
      assert.match(digest, /^[a-f0-9]{64}$/)
    }
    assert.equal('poseId' in result.metadata, false)
    assert.equal('variantSource' in result.metadata, false)
    assert.deepEqual(pixelAt(state.outputPixels, 4, 4, 8), pixelAt(variantPixels, 16, 16, 32))
    assert.equal(pixelAt(state.outputPixels, 0, 0, 8)[3], 0)
    assert.deepEqual(new Uint8Array(await variant.arrayBuffer()), variantBefore)

    assert.equal(state.fetchCalls.length, 1)
    assert.equal(state.fetchCalls[0].url, `${ORIGIN}${POSE_SOURCE}`)
    assert.equal(state.fetchCalls[0].init.redirect, 'error')
    assert.equal(state.fetchCalls[0].init.cache, 'no-store')
    assert.ok(state.fetchCalls[0].init.signal instanceof AbortSignal)
    assert.equal(state.getReaderCalls, 1)
    assert.equal(state.cancelled, 1)
    assert.equal(state.released, true)
    assert.equal(state.bitmaps.length, 2)
    assert.ok(state.bitmaps.every(({ record }) => record.closed === 1))
    assert.deepEqual(state.contextRequest, { type: '2d', attributes: { willReadFrequently: true } })
    assert.deepEqual(state.getImageDataCalls, [{ x: 0, y: 0, width: 32, height: 32 }])
    assert.deepEqual(state.createImageDataCalls, [{ width: 8, height: 8 }])
    assert.deepEqual(state.putImageDataCalls, [{ x: 0, y: 0 }])
    assert.deepEqual(state.toBlobCalls, ['image/png'])
    assert.equal(state.canvas.width, 0)
    assert.equal(state.canvas.height, 0)
  })
})

test('preparation accepts a saved upload URL as a pose source', async () => {
  await withBrowser({}, async state => {
    const result = await prepareCharacterFacePatch(UPLOAD_POSE_SOURCE, makeVariant(), ANCHOR)
    assert.equal(result.metadata.poseSource, UPLOAD_POSE_SOURCE)
    assert.equal(state.fetchCalls.length, 1)
    assert.equal(state.fetchCalls[0].url, `${ORIGIN}${UPLOAD_POSE_SOURCE}`)
    assert.ok(state.fetchCalls[0].init.signal instanceof AbortSignal)
  })
})

test('preparation rejects mismatched or invalid decoded dimensions and closes decoded bitmaps', async () => {
  const variant = makeVariant()
  await withBrowser({ poseWidth: 32, poseHeight: 16, variantWidth: 16, variantHeight: 16 }, async state => {
    await assert.rejects(
      prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR),
      /exactly the same pixel dimensions/,
    )
    assert.equal(state.bitmaps.length, 2)
    assert.ok(state.bitmaps.every(({ record }) => record.closed === 1))
    assert.equal(state.canvasCreated, false)
    assert.equal(state.toBlobCalls.length, 0)
  })

  await withBrowser({ poseWidth: 15, poseHeight: 32 }, async state => {
    await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR), /Face patch images/)
    assert.equal(state.bitmaps.length, 1)
    assert.equal(state.bitmaps[0].record.closed, 1)
    assert.equal(state.canvasCreated, false)
    assert.equal(state.toBlobCalls.length, 0)
  })
})

test('pose stream has an 8 MiB limit and always releases its reader on overflow', async () => {
  const variant = makeVariant()
  await withBrowser({ poseChunks: [{ byteLength: MAX_BYTES + 1 }] }, async state => {
    await assert.rejects(
      prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR),
      /Face patch inputs are limited to 8 MiB each/,
    )
    assert.equal(state.fetchCalls.length, 1)
    assert.equal(state.reads, 1)
    assert.equal(state.cancelled, 1)
    assert.equal(state.released, true)
    assert.equal(state.bitmaps.length, 0)
  })
})

test('variant type, byte-size and secure-context checks happen before any read or decode', async () => {
  const invalidVariants = [
    { type: 'image/gif', size: 1, arrayBuffer: async () => new ArrayBuffer(1) },
    { type: 'image/png', size: 0, arrayBuffer: async () => new ArrayBuffer(0) },
    { type: 'image/png', size: MAX_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(1) },
    { type: 'image/png', size: '1', arrayBuffer: async () => new ArrayBuffer(1) },
    { type: 'image/png', size: true, arrayBuffer: async () => new ArrayBuffer(1) },
  ]
  for (const variant of invalidVariants) {
    await withBrowser({}, async state => {
      await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR), /Choose a PNG, JPEG or WebP variant up to 8 MiB/)
      assert.equal(state.fetchCalls.length, 0)
      assert.equal(state.bitmaps.length, 0)
    })
  }

  await withBrowser({ secure: false }, async state => {
    await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, makeVariant(), ANCHOR), /localhost or HTTPS/)
    assert.equal(state.fetchCalls.length, 0)
    assert.equal(state.bitmaps.length, 0)
  })
})

test('pose URL and response MIME are constrained to local saved files', async () => {
  const variant = makeVariant()
  for (const source of [
    'https://evil.example/api/v1/file/luna-base.png',
    '/api/v1/other/luna-base.png',
    `${POSE_SOURCE}#fragment`,
  ]) {
    await withBrowser({}, async state => {
      await assert.rejects(prepareCharacterFacePatch(source, variant, ANCHOR), /saved HocusPocus pose/)
      assert.equal(state.fetchCalls.length, 0)
    })
  }

  await withBrowser({ poseMime: 'image/gif' }, async state => {
    await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, variant, ANCHOR), /Choose a PNG, JPEG or WebP pose/)
    assert.equal(state.fetchCalls.length, 1)
    assert.equal(state.getReaderCalls, 0)
    assert.equal(state.bitmaps.length, 0)
  })
})

test('canvas and bitmap cleanup still occurs when the canvas cannot encode', async () => {
  await withBrowser({ encodeResult: null }, async state => {
    await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, makeVariant(), ANCHOR), /Could not encode the facial patch/)
    assert.ok(state.bitmaps.every(({ record }) => record.closed === 1))
    assert.equal(state.canvas.width, 0)
    assert.equal(state.canvas.height, 0)
  })

  await withBrowser({ canvasContext: false }, async state => {
    await assert.rejects(prepareCharacterFacePatch(POSE_SOURCE, makeVariant(), ANCHOR), /Canvas is unavailable/)
    assert.ok(state.bitmaps.every(({ record }) => record.closed === 1))
    assert.equal(state.canvas.width, 0)
    assert.equal(state.canvas.height, 0)
  })
})
