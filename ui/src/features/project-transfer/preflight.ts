import JSZip from 'jszip'
import {
  DOCUMENTS_DIR,
  MANIFEST_NAME,
  MAX_DOCUMENT_BYTES,
  MAX_MEMBER_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  MAX_ZIP_BYTES,
  MEDIA_DIR,
  PACKAGE_KIND,
  PACKAGE_VERSION,
  TEMPLATE_KIND,
  cinemaExtensionOf,
  collectUnknownFields,
  documentIssues,
  isCinemaMember,
  isContentHashName,
  isTemplateWrapper,
  sha256Hex,
  safeZipMember,
  type PackageIssue,
} from './format.ts'

export type PackedAsset = {
  sha256: string
  filename: string
  path: string
  kind?: string
  size?: number
  status: 'ok' | 'missing' | 'tampered'
}

export type PreflightReport = {
  ok: boolean
  canImport: boolean
  kind?: string
  title: string
  issues: PackageIssue[]
  unknownFields: string[]
  assets: PackedAsset[]
  documents: Array<{ id?: string; role?: string; name?: string }>
  warnings: string[]
}

function issue(code: string, message: string, extra: Partial<PackageIssue> = {}): PackageIssue {
  return { code, message, ...extra }
}

function failed(code: string, message: string): PreflightReport {
  return { ok: false, canImport: false, title: '', issues: [issue(code, message)], unknownFields: [], assets: [], documents: [], warnings: [] }
}

function scanZipMembers(zip: JSZip, issues: PackageIssue[]) {
  let uncompressed = 0
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    try {
      const member = safeZipMember(name)
      if (isCinemaMember(member)) issues.push(issue('cinema_extension', member, { path: member }))
    } catch {
      issues.push(issue('traversal', name, { path: name }))
    }
    const declared = (entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    if (typeof declared === 'number') {
      if (declared > MAX_MEMBER_BYTES) issues.push(issue('too_large', name, { path: name }))
      uncompressed += declared
    }
  }
  if (uncompressed > MAX_UNCOMPRESSED_BYTES) issues.push(issue('too_large', 'uncompressed'))
}

function rejectJsonPayload(data: Uint8Array, filename: string): PreflightReport | undefined {
  const head = new TextDecoder().decode(data.slice(0, 32)).trimStart()
  if (!head.startsWith('{') && !head.startsWith('[')) return undefined
  try {
    const raw = JSON.parse(new TextDecoder().decode(data))
    if (isTemplateWrapper(raw)) return failed('template', TEMPLATE_KIND)
  } catch { /* not JSON */ }
  return failed('not_zip', filename)
}

function inspectManifest(manifest: Record<string, unknown>, issues: PackageIssue[]) {
  if (manifest.kind === TEMPLATE_KIND) issues.push(issue('template', TEMPLATE_KIND))
  if (manifest.kind !== PACKAGE_KIND && manifest.schema !== PACKAGE_KIND) {
    issues.push(issue('unsupported_kind', String(manifest.kind || manifest.schema || '')))
  }
  if ((manifest.schema_version ?? manifest.version) !== PACKAGE_VERSION) {
    issues.push(issue('unsupported_version', String(manifest.schema_version ?? manifest.version ?? '')))
  }
  const cinema = cinemaExtensionOf(manifest)
  if (cinema) issues.push(issue('cinema_extension', cinema))
}

async function inspectDocuments(zip: JSZip, entries: unknown[], issues: PackageIssue[], unknownFields: string[], documents: PreflightReport['documents']) {
  for (const [index, entry] of entries.entries()) {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    documents.push({ id: String(record.id || ''), role: String(record.role || ''), name: String(record.name || '') })
    const path = String(record.path || '')
    const file = zip.file(path)
    if (!path.startsWith(`${DOCUMENTS_DIR}/`) || !file) {
      issues.push(issue('missing_document', path, { path }))
      continue
    }
    const bytes = await file.async('uint8array')
    let parsed: unknown
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)) } catch {
      issues.push(issue('invalid_document', path, { path }))
      continue
    }
    unknownFields.push(...collectUnknownFields(parsed, `documents[${index + 1}].`))
    issues.push(...documentIssues(parsed, index + 1))
  }
}

async function inspectAssets(zip: JSZip, entries: unknown[], issues: PackageIssue[], assets: PackedAsset[]) {
  for (const entry of entries) {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const path = String(record.path || '')
    const digest = String(record.sha256 || '')
    const filename = String(record.filename || '')
    let status: PackedAsset['status'] = 'ok'
    const file = zip.file(path)
    if (!path.startsWith(`${MEDIA_DIR}/`) || !file) status = 'missing'
    else if (!isContentHashName(path)) issues.push(issue('traversal', path, { path }))
    else {
      const hash = await sha256Hex(await file.async('uint8array'))
      if (hash !== digest) status = 'tampered'
    }
    if (status === 'missing') issues.push(issue('missing_asset', filename || digest, { repair: true, path }))
    if (status === 'tampered') issues.push(issue('tampered_asset', filename || digest, { repair: true, path }))
    assets.push({ sha256: digest, filename, path, kind: String(record.kind || ''), size: Number(record.size || 0), status })
  }
}

export async function preflightBytes(data: Uint8Array, filename = 'package.zip'): Promise<PreflightReport> {
  if (data.byteLength > MAX_ZIP_BYTES) return failed('too_large', 'zip')
  const rejected = rejectJsonPayload(data, filename)
  if (rejected) return rejected
  const zip = await JSZip.loadAsync(data)
  const issues: PackageIssue[] = []
  scanZipMembers(zip, issues)
  const manifestEntry = zip.file(MANIFEST_NAME)
  if (!manifestEntry) {
    issues.push(issue('missing_manifest', MANIFEST_NAME))
    return { ok: false, canImport: false, title: '', issues, unknownFields: [], assets: [], documents: [], warnings: [] }
  }
  const manifestBytes = await manifestEntry.async('uint8array')
  if (manifestBytes.byteLength > MAX_DOCUMENT_BYTES) issues.push(issue('too_large', MANIFEST_NAME))
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>
  } catch {
    return { ok: false, canImport: false, title: '', issues: [...issues, issue('invalid_manifest', MANIFEST_NAME)], unknownFields: [], assets: [], documents: [], warnings: [] }
  }
  inspectManifest(manifest, issues)
  const unknownFields: string[] = []
  const documents: PreflightReport['documents'] = []
  const assets: PackedAsset[] = []
  await inspectDocuments(zip, Array.isArray(manifest.documents) ? manifest.documents : [], issues, unknownFields, documents)
  await inspectAssets(zip, Array.isArray(manifest.assets) ? manifest.assets : [], issues, assets)
  const blocking = issues.some(item => ['cinema_extension', 'external_link', 'invalid_document', 'template', 'traversal', 'unsupported_kind', 'unsupported_version', 'too_large'].includes(item.code))
  const repairable = issues.some(item => item.repair)
  return {
    ok: !blocking && !repairable,
    canImport: !blocking && !repairable,
    kind: PACKAGE_KIND,
    title: String(manifest.title || ''),
    issues,
    unknownFields,
    assets,
    documents,
    warnings: Array.isArray(manifest.warnings) ? manifest.warnings.map(String) : [],
  }
}

export async function preflightFile(file: File): Promise<PreflightReport> {
  if (file.size > MAX_ZIP_BYTES) {
    return { ok: false, canImport: false, title: '', issues: [issue('too_large', file.name)], unknownFields: [], assets: [], documents: [], warnings: [] }
  }
  return preflightBytes(new Uint8Array(await file.arrayBuffer()), file.name)
}
