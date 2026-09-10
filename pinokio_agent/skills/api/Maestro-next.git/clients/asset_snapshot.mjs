#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5
export const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
const FILE_PREFIX = '/api/v1/file/'
const ASSET_MANIFEST_SCHEMA = 'hocuspocus.asset-manifest'
const ASSET_MANIFEST_VERSION = 1

function usage() {
  return [
    'Usage: node asset_snapshot.mjs --base-url URL --asset-id ID [--asset-id ID ...] --workspace NAME --output-dir DIR',
    '',
    'Downloads canonical audio/image assets and their catalog metadata without generating or mutating server state.',
  ].join('\n')
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { baseUrl: '', assetIds: [], workspace: 'default', outputDir: '', help: false }
  const valueOptions = new Map([
    ['--base-url', 'baseUrl'],
    ['--workspace', 'workspace'],
    ['--output-dir', 'outputDir'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--asset-id' || argument.startsWith('--asset-id=')) {
      const value = argument === '--asset-id' ? argv[++index] : argument.slice('--asset-id='.length)
      if (!value) throw new Error('--asset-id needs a non-empty value')
      options.assetIds.push(String(value))
      continue
    }
    const equals = argument.indexOf('=')
    const name = equals >= 0 ? argument.slice(0, equals) : argument
    const key = valueOptions.get(name)
    if (!key) throw new Error(`Unknown argument: ${argument}`)
    const value = equals >= 0 ? argument.slice(equals + 1) : argv[++index]
    if (!value) throw new Error(`${name} needs a non-empty value`)
    options[key] = String(value)
  }
  if (options.help) return options
  if (!options.baseUrl) throw new Error('--base-url is required')
  if (!options.assetIds.length) throw new Error('At least one --asset-id is required')
  if (new Set(options.assetIds).size !== options.assetIds.length) throw new Error('--asset-id values must be unique')
  if (!options.workspace) throw new Error('--workspace must be non-empty')
  if (!options.outputDir) throw new Error('--output-dir is required')
  return options
}

function serverOrigin(baseUrl) {
  const parsed = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--base-url must use http or https')
  if (parsed.username || parsed.password) throw new Error('--base-url must not contain credentials')
  return parsed.origin
}

function metadataUrl(origin, assetId) {
  return `${origin}/api/v1/assets/${encodeURIComponent(assetId)}`
}

function fail(message) {
  throw new Error(message)
}

function asRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  return value
}

function checkedFileLocation(asset, workspace, origin) {
  const locations = Array.isArray(asset.locations) ? asset.locations : []
  const matching = locations.filter(location => location && location.workspace_id === workspace)
  if (matching.length !== 1) fail(`Asset ${asset.id} needs exactly one location in workspace ${workspace}`)
  const location = asRecord(matching[0], 'Asset location')
  if (typeof location.filename !== 'string' || !location.filename.trim() || /[\\/\0\r\n]/.test(location.filename)) {
    fail(`Asset ${asset.id} has an unsafe filename`)
  }
  if (typeof location.url !== 'string' || !location.url.startsWith(FILE_PREFIX)) {
    fail(`Asset ${asset.id} must use a root-relative ${FILE_PREFIX} URL`)
  }
  let parsed
  try {
    parsed = new URL(location.url, origin)
  } catch {
    fail(`Asset ${asset.id} has an invalid file URL`)
  }
  if (parsed.origin !== origin || !parsed.pathname.startsWith(FILE_PREFIX) || parsed.username || parsed.password) {
    fail(`Asset ${asset.id} file URL is outside the API origin`)
  }
  const queryEntries = [...parsed.searchParams.entries()]
  if (parsed.hash || queryEntries.length !== 1 || queryEntries[0][0] !== 'workspace' || queryEntries[0][1] !== workspace) {
    fail(`Asset ${asset.id} file URL must contain only the exact workspace query`)
  }
  let pathFilename
  try {
    pathFilename = decodeURIComponent(parsed.pathname.slice(FILE_PREFIX.length))
  } catch {
    fail(`Asset ${asset.id} file URL has invalid encoding`)
  }
  if (pathFilename !== location.filename) fail(`Asset ${asset.id} file URL does not match its catalog filename`)
  return { ...location, parsed }
}

export function validateAssetRecord(assetValue, requestedId, workspace, origin) {
  const asset = asRecord(assetValue, 'Asset response')
  if (asset.id !== requestedId) fail(`Asset identity mismatch: requested ${requestedId}`)
  if (asset.kind !== 'audio' && asset.kind !== 'image') fail(`Asset ${requestedId} is not an audio or image asset`)
  if (typeof asset.filename !== 'string' || !asset.filename.trim()) fail(`Asset ${requestedId} has no catalog filename`)
  if (asset.metadata_status !== 'canonical') fail(`Asset ${requestedId} does not have canonical metadata`)
  if (!Array.isArray(asset.workspace_ids) || !asset.workspace_ids.includes(workspace)) {
    fail(`Asset ${requestedId} is not registered in workspace ${workspace}`)
  }
  const location = checkedFileLocation(asset, workspace, origin)
  if (asset.filename !== location.filename) fail(`Asset ${requestedId} catalog filename does not match its workspace location`)
  const manifest = asRecord(asset.manifest, `Asset ${requestedId} manifest`)
  if (manifest.schema !== ASSET_MANIFEST_SCHEMA || manifest.schema_version !== ASSET_MANIFEST_VERSION) {
    fail(`Asset ${requestedId} does not have a canonical asset manifest`)
  }
  const manifestAsset = asRecord(manifest.asset, `Asset ${requestedId} manifest asset`)
  if (manifestAsset.id !== asset.id) fail(`Asset ${requestedId} manifest identity does not match the catalog record`)
  if (manifestAsset.kind !== asset.kind) fail(`Asset ${requestedId} manifest kind does not match the catalog record`)
  if (manifestAsset.filename !== asset.filename || manifestAsset.filename !== location.filename) {
    fail(`Asset ${requestedId} manifest filename does not match the catalog location`)
  }
  return { asset, location }
}

async function getAsset(assetId, origin, fetchImpl) {
  const response = await fetchImpl(metadataUrl(origin, assetId), { method: 'GET', redirect: 'error' })
  if (response.status !== 200) throw new Error(`Asset metadata request failed: HTTP ${response.status}`)
  let body
  try {
    body = await response.json()
  } catch (error) {
    throw new Error(`Asset metadata response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return body
}

function checkedRedirectUrl(location, currentUrl, origin, expectedUrl) {
  let next
  try {
    next = new URL(location, currentUrl)
  } catch {
    fail('Asset download returned an invalid redirect')
  }
  if (next.origin !== origin || next.username || next.password || !next.pathname.startsWith(FILE_PREFIX)) {
    fail('Asset download redirect leaves the API file origin')
  }
  if (next.pathname !== expectedUrl.pathname || next.search !== expectedUrl.search || next.hash !== expectedUrl.hash) {
    fail('Asset download redirect changed the asset path or workspace')
  }
  return next
}

function validateContentType(response, kind) {
  const raw = response.headers?.get?.('content-type')
  const contentType = typeof raw === 'string' ? raw.split(';', 1)[0].trim().toLowerCase() : ''
  const compatible = contentType === 'application/octet-stream'
    || (kind === 'audio' ? contentType.startsWith('audio/') : contentType.startsWith('image/'))
  if (!compatible) fail(`Asset download content type ${contentType || '(missing)'} is not valid for ${kind}`)
}

function contentLength(response, maxBytes) {
  const raw = response.headers?.get?.('content-length')
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return
  const length = Number(raw)
  if (Number.isSafeInteger(length) && length > maxBytes) fail(`Asset download exceeds the ${maxBytes}-byte limit`)
}

async function downloadResponse(initialUrl, origin, kind, maxBytes, fetchImpl) {
  let current = new URL(initialUrl)
  const expectedUrl = new URL(initialUrl)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(current.href, { method: 'GET', redirect: 'manual' })
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers?.get('location')
      if (!location) throw new Error('Asset download redirect has no Location header')
      if (redirects === MAX_REDIRECTS) throw new Error('Asset download followed too many redirects')
      current = checkedRedirectUrl(location, current.href, origin, expectedUrl)
      continue
    }
    if (response.status !== 200) throw new Error(`Asset download failed: HTTP ${response.status}`)
    if (response.url) {
      const finalUrl = checkedRedirectUrl(response.url, current.href, origin, expectedUrl)
      if (finalUrl.href !== current.href) throw new Error('Asset download response changed its origin or file path')
    }
    contentLength(response, maxBytes)
    validateContentType(response, kind)
    return response
  }
  throw new Error('Asset download redirect loop')
}

function safeStem(assetId) {
  const readable = assetId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+$/, '_').slice(0, 96) || 'asset'
  const digest = createHash('sha256').update(assetId).digest('hex').slice(0, 12)
  return `${readable}-${digest}`
}

function extensionFor(filename, kind) {
  const base = filename.split(/[\\/]/).pop() || ''
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(base)
  return match ? `.${match[1].toLowerCase()}` : (kind === 'audio' ? '.audio' : '.image')
}

async function writeExclusive(filePath, value) {
  const handle = await open(filePath, 'wx')
  try {
    await handle.writeFile(value)
  } finally {
    await handle.close()
  }
}

function promptLiteral(asset) {
  const effective = asset.manifest?.generation?.prompts?.effective
  return typeof effective === 'string' ? effective : (typeof asset.prompt_preview === 'string' ? asset.prompt_preview : null)
}

async function responseBytes(response, maxBytes, assetId) {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) fail(`Asset ${assetId} exceeds the ${maxBytes}-byte download limit`)
    return bytes
  }
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value || [])
      total += chunk.byteLength
      if (total > maxBytes) {
        await reader.cancel('asset download limit exceeded').catch(() => undefined)
        fail(`Asset ${assetId} exceeds the ${maxBytes}-byte download limit`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

async function saveSnapshot(outputDir, workspace, asset, location, response, maxBytes) {
  const bytes = await responseBytes(response, maxBytes, asset.id)
  if (bytes.byteLength === 0) throw new Error(`Asset ${asset.id} download is empty`)
  if (typeof asset.size_bytes === 'number' && Number.isFinite(asset.size_bytes) && Number.isInteger(asset.size_bytes) && asset.size_bytes >= 0 && bytes.byteLength !== asset.size_bytes) {
    throw new Error(`Asset ${asset.id} size mismatch: expected ${asset.size_bytes}, received ${bytes.byteLength}`)
  }
  // This SHA-256 is an observation of the bytes downloaded now; it is not an
  // immutability guarantee if the server-side asset changes between requests
  // (a TOCTOU race remains outside this stateless client).
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const stem = safeStem(asset.id)
  const mediaName = `${stem}${extensionFor(location.filename, asset.kind)}`
  const metadataName = `${stem}.metadata.json`
  const mediaPath = path.join(outputDir, mediaName)
  const metadataPath = path.join(outputDir, metadataName)
  let mediaCreated = false
  try {
    await writeExclusive(mediaPath, bytes)
    mediaCreated = true
    const metadata = {
      schema_version: 1,
      asset_id: asset.id,
      workspace,
      kind: asset.kind,
      catalog_filename: location.filename,
      source_url: location.url,
      media_file: mediaName,
      metadata_file: metadataName,
      bytes: bytes.byteLength,
      sha256,
      prompt_literal: promptLiteral(asset),
      prompt_preview: asset.prompt_preview ?? null,
      manifest: asset.manifest ?? null,
      catalog: asset,
    }
    await writeExclusive(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  } catch (error) {
    if (mediaCreated) await unlink(mediaPath).catch(() => undefined)
    throw error
  }
  return { assetId: asset.id, kind: asset.kind, workspace, mediaPath, metadataPath, bytes: bytes.byteLength, sha256 }
}

function normalizedLimit(value) {
  if (value === undefined) return MAX_DOWNLOAD_BYTES
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('maxBytes must be a positive safe integer')
  return Math.min(value, MAX_DOWNLOAD_BYTES)
}

export async function snapshotAsset({ baseUrl, assetId, workspace = 'default', outputDir, maxBytes, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error('This Node runtime does not provide fetch')
  if (typeof assetId !== 'string' || !assetId.trim()) throw new Error('Asset id must be non-empty')
  if (typeof workspace !== 'string' || !workspace.trim()) throw new Error('Workspace must be non-empty')
  if (typeof outputDir !== 'string' || !outputDir) throw new Error('Output directory must be non-empty')
  const origin = serverOrigin(baseUrl)
  const downloadLimit = normalizedLimit(maxBytes)
  const rawAsset = await getAsset(assetId, origin, fetchImpl)
  const { asset, location } = validateAssetRecord(rawAsset, assetId, workspace, origin)
  if (Number.isSafeInteger(asset.size_bytes) && asset.size_bytes > downloadLimit) fail(`Asset ${asset.id} exceeds the ${downloadLimit}-byte download limit`)
  const response = await downloadResponse(location.parsed.href, origin, asset.kind, downloadLimit, fetchImpl)
  await mkdir(outputDir, { recursive: true })
  return saveSnapshot(outputDir, workspace, asset, location, response, downloadLimit)
}

export async function snapshotAssets({ baseUrl, assetIds, workspace = 'default', outputDir, maxBytes, fetchImpl = globalThis.fetch }) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) throw new Error('At least one asset id is required')
  if (new Set(assetIds).size !== assetIds.length) throw new Error('Asset ids must be unique')
  const results = []
  for (const assetId of assetIds) {
    results.push(await snapshotAsset({ baseUrl, assetId, workspace, outputDir, maxBytes, fetchImpl }))
  }
  return results
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(usage())
    return 0
  }
  const results = await snapshotAssets(options)
  console.log(JSON.stringify({ snapshots: results }, null, 2))
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
