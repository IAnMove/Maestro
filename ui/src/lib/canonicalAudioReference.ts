const ASSET_ID = /^asset(?:[_:-])[A-Za-z0-9][A-Za-z0-9._:-]{0,238}$/
const WORKSPACE = /^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/

function safeReferencePath(value: string): boolean {
  return Boolean(value)
    && !value.includes('\\')
    && !value.includes('\u0000')
    && value.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}

function canonicalWorkspaceFile(parsed: URL, decodedPath: string): boolean {
  const suffix = decodedPath.slice('/api/v1/file/'.length)
  const query = parsed.searchParams
  return safeReferencePath(suffix) && query.size === 1
    && query.getAll('workspace').length === 1
    && WORKSPACE.test(query.get('workspace') || '')
}

/** Match the server's canonical asset URL/ID syntax without resolving anything. */
export function assertCanonicalAudioReference(value: unknown, field: string, mediaKind: 'audio' | 'video' = 'audio'): void {
  if (value === null || value === '') return
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
  }
  if (ASSET_ID.test(value)) return
  if (!value.startsWith('/api/v1/') || value.includes('\\') || value.includes('\u0000')) {
    throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
  }
  const rawPathEnd = value.search(/[?#]/)
  const rawPath = rawPathEnd < 0 ? value : value.slice(0, rawPathEnd)
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
  }
  const parsed = new URL(value, 'http://hocuspocus.invalid')
  if (parsed.origin !== 'http://hocuspocus.invalid' || parsed.hash) {
    throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
  }
  if (parsed.pathname.startsWith('/api/v1/uploads/')) {
    if (parsed.search || !safeReferencePath(decodedPath.slice('/api/v1/uploads/'.length))) {
      throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
    }
    return
  }
  if (parsed.pathname.startsWith('/api/v1/assets/')) {
    const suffix = decodedPath.slice('/api/v1/assets/'.length)
    if (parsed.search || !ASSET_ID.test(suffix)) {
      throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
    }
    return
  }
  if (parsed.pathname.startsWith('/api/v1/file/')) {
    if (!canonicalWorkspaceFile(parsed, decodedPath)) {
      throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
    }
    return
  }
  throw new Error(`${field} must be a canonical ${mediaKind} URL or asset ID`)
}
