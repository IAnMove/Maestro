const ASSET_ID = /^asset(?:[_:-])[A-Za-z0-9][A-Za-z0-9._:-]{0,238}$/
const WORKSPACE = /^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/
const MAX_WORKSPACE_LENGTH = 240
const MAX_SOURCE_LENGTH = 8192

function invalidReference(field: string): never {
  throw new Error(`${field} must be a canonical local URL or asset ID`)
}

function assertSafeReferencePath(path: string): void {
  if (!path || path.includes('\\') || path.includes('\u0000')) throw new Error('source must be a canonical local reference')
  if (path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('source must identify one exact local asset')
  }
}

function parseReference(value: string, field: string): URL {
  if (value.includes('\\') || value.includes('\u0000')) invalidReference(field)
  const rawPath = value.split(/[?#]/, 1)[0]
  if (rawPath.split('/').some(part => {
    try {
      const decoded = decodeURIComponent(part)
      return decoded === '.' || decoded === '..'
    } catch {
      return false
    }
  })) invalidReference(field)
  try {
    const parsed = new URL(value, 'http://hocuspocus.invalid')
    if (parsed.origin !== 'http://hocuspocus.invalid' || parsed.hash) invalidReference(field)
    return parsed
  } catch {
    invalidReference(field)
  }
}

function decodedReferencePath(parsed: URL, field: string): string {
  try { return decodeURIComponent(parsed.pathname) } catch { invalidReference(field) }
}

type ReferenceValidator = (parsed: URL, path: string, field: string) => boolean

function validateUploadReference(parsed: URL, path: string, field: string): boolean {
  if (!path.startsWith('/api/v1/uploads/')) return false
  if (parsed.search) throw new Error(`${field} upload URL must not have a query`)
  assertSafeReferencePath(path.slice('/api/v1/uploads/'.length))
  return true
}

function validateAssetReference(parsed: URL, path: string, field: string): boolean {
  if (!path.startsWith('/api/v1/assets/')) return false
  if (parsed.search || !ASSET_ID.test(path.slice('/api/v1/assets/'.length))) {
    throw new Error(`${field} must identify one exact asset URL`)
  }
  return true
}

function validateFileReference(parsed: URL, path: string, field: string): boolean {
  if (!path.startsWith('/api/v1/file/')) return false
  assertSafeReferencePath(path.slice('/api/v1/file/'.length))
  const values = [...parsed.searchParams.keys()]
  if (values.length !== 1 || values[0] !== 'workspace') throw new Error(`${field} file URL requires one workspace query`)
  const workspace = parsed.searchParams.get('workspace') || ''
  if (!WORKSPACE.test(workspace)) throw new Error(`${field} file URL has an invalid workspace`)
  return true
}

const REFERENCE_VALIDATORS: readonly ReferenceValidator[] = [
  validateUploadReference,
  validateAssetReference,
  validateFileReference,
]

/** Validate the exact URL/asset-ID syntax accepted by the server contract. */
export function assertCanonicalToolsReference(value: unknown, field = 'input.params.source'): asserts value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > MAX_SOURCE_LENGTH) {
    invalidReference(field)
  }
  if (ASSET_ID.test(value)) return
  const parsed = parseReference(value, field)
  const path = decodedReferencePath(parsed, field)
  if (!REFERENCE_VALIDATORS.some(validator => validator(parsed, path, field))) invalidReference(field)
}

export function assertToolsWorkspace(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-blank string`)
  if (value.trim() !== value) throw new Error(`${field} must be an exact string without surrounding whitespace`)
  if (value.length > MAX_WORKSPACE_LENGTH) throw new Error(`${field} is too long`)
  if (!WORKSPACE.test(value)) throw new Error(`${field} must be an exact output workspace name`)
  return value
}

/** Convert a selected legacy name into the canonical local Tools reference. */
export function canonicalToolsSource(
  source: unknown,
  sourceUrl: unknown,
  sourceWorkspace: unknown,
  workspace: unknown,
): string {
  if (typeof sourceUrl === 'string' && sourceUrl) {
    assertCanonicalToolsReference(sourceUrl)
    return sourceUrl
  }
  if (typeof source !== 'string' || !source) throw new Error('An exact Tools source is required')
  if (ASSET_ID.test(source)) {
    assertCanonicalToolsReference(source)
    return source
  }
  if (source.startsWith('/api/')) {
    assertCanonicalToolsReference(source)
    return source
  }
  const outputWorkspace = assertToolsWorkspace(workspace, 'workspace')
  const selectedWorkspace = typeof sourceWorkspace === 'string' && sourceWorkspace
    ? sourceWorkspace
    : outputWorkspace
  const parts = source.replace(/^\/+/, '').split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..' || part.includes('\\'))) {
    throw new Error('An exact Tools source is required')
  }
  const encoded = parts.map(part => encodeURIComponent(part)).join('/')
  const candidate = selectedWorkspace === '__uploads__'
    ? `/api/v1/uploads/${encoded}`
    : `/api/v1/file/${encoded}?workspace=${encodeURIComponent(selectedWorkspace)}`
  assertCanonicalToolsReference(candidate)
  return candidate
}
