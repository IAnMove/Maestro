import type { Scene } from '../../types'
import { parseSceneFile } from '../../lib/sceneFile'
import { templateCatalogVersion, type SceneTemplateDefinition } from './catalog'

type ReferenceIdentity = { id: string; version: number; catalogVersion: string; variant: 'coral' }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La referencia no contiene metadata válida.')
  return value as Record<string, unknown>
}

/** The reviewed movie's saved scene is authoritative, not today's compiler. */
export function parseRenderedReferenceScene(payload: unknown, expected: ReferenceIdentity): Scene {
  const metadata = record(payload)
  if (metadata.templateId !== expected.id || metadata.templateVersion !== expected.version
    || metadata.catalogVersion !== expected.catalogVersion || metadata.variant !== expected.variant
    || metadata.status !== 'rendered-not-approved') throw new Error('La identidad o versión de la referencia no coincide con la plantilla.')
  const scene = parseSceneFile(JSON.stringify(record(metadata.scene)))
  if (scene.generationPolicy !== 'provided_only' || scene.narrative?.templateId !== expected.id
    || scene.narrative.controls.catalogVersion !== expected.catalogVersion
    || scene.narrative.controls.templateVersion !== expected.version) throw new Error('La escena guardada no coincide con la referencia o su política.')
  return scene
}

export async function loadRenderedReferenceScene(template: SceneTemplateDefinition, previewBaseUrl: string, signal?: AbortSignal): Promise<Scene> {
  const response = await fetch(`${previewBaseUrl.replace(/\/+$/, '')}/${template.id}.json`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('No está disponible el snapshot de este vídeo. No se ha reconstruido ni abierto otra escena.')
  const text = await response.text()
  if (text.length > 4_000_000) throw new Error('El snapshot de referencia supera el límite de 4 MB.')
  return parseRenderedReferenceScene(JSON.parse(text), { id: template.id, version: template.version, catalogVersion: templateCatalogVersion(template), variant: 'coral' })
}
