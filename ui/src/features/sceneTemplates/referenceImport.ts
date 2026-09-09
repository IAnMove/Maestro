import { CATALOG_VERSION, type SceneTemplateDefinition } from './catalog'
import { APPROVED_REFERENCE_JSON } from './approvedReferences'
import { parseRenderedReferenceScene } from './previewSnapshot'

/** Offline user-selected download, not an arbitrary remote proxy. Check the
 * exact published bytes before interpreting the saved scene or loading assets. */
export async function verifyReferenceBytes(bytes: ArrayBuffer, expected: { bytes: number; sha256: string }) {
  if (bytes.byteLength !== expected.bytes) throw new Error('El tamaño no coincide con el JSON original publicado de esta plantilla.')
  if (!globalThis.crypto?.subtle) throw new Error('La verificación SHA-256 necesita localhost o HTTPS. No se abre una referencia sin verificar.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  if (sha256 !== expected.sha256) throw new Error('El JSON cambió o no es la referencia publicada. No se abre otra escena en su lugar.')
}

export async function importApprovedReference(file: Pick<File, 'size' | 'arrayBuffer'>, template: SceneTemplateDefinition) {
  const expected = APPROVED_REFERENCE_JSON[template.id]
  if (!expected || file.size !== expected.bytes) throw new Error('El tamaño no coincide con el JSON original publicado de esta plantilla.')
  const bytes = await file.arrayBuffer()
  await verifyReferenceBytes(bytes, expected)
  return parseRenderedReferenceScene(JSON.parse(new TextDecoder().decode(bytes)), {
    id: template.id, version: template.version, catalogVersion: CATALOG_VERSION, variant: 'coral',
  })
}
