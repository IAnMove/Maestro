import { useEffect, useState } from 'react'
import { uploadImage } from '../api/generation'
import { fetchOutputs, type ApiOutput } from '../api/outputs'

export async function loadWorkspaceImages(workspace: string): Promise<ApiOutput[]> {
  const { outputs } = await fetchOutputs(200, 0, { mediaType: 'image', workspace })
  return outputs.filter(item => item.type === 'image')
}

export function useWorkspaceImageOutputs(workspace: string): ApiOutput[] {
  const [items, setItems] = useState<ApiOutput[]>([])
  useEffect(() => {
    let alive = true
    loadWorkspaceImages(workspace)
      .then(next => { if (alive) setItems(next) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [workspace])
  return items
}

export function isUploadOutput(item: ApiOutput): boolean {
  return item.url.includes('/api/v1/uploads/')
}

export async function fileFromOutput(item: ApiOutput): Promise<File> {
  const response = await fetch(item.url)
  if (!response.ok) throw new Error('Could not read the selected image')
  const blob = await response.blob()
  return new File([blob], item.name, { type: blob.type || 'image/png' })
}

/**
 * Copy the pick into uploads/ and return the upload API payload.
 * Callers (Series import, Character Creator describe, H3 isfile checks)
 * only share that absolute filesystem path. A synthetic `uploads/${name}`
 * is not enough: describe resolves relative names under uploads/, so
 * `uploads/hero.png` becomes `uploads/uploads/hero.png` and the default
 * empty-prompt Character Creator flow 400s.
 */
export async function ensureUploadsPath(item: ApiOutput): Promise<{ path: string; name: string; url: string }> {
  const uploaded = await uploadImage(await fileFromOutput(item))
  return { path: uploaded.path, name: uploaded.filename, url: uploaded.url }
}

export function asImageOutput(name: string, url: string, thumbnail = url): ApiOutput {
  return {
    name,
    type: 'image',
    mode: null,
    size: 0,
    created_at: 0,
    url,
    thumbnail_url: thumbnail,
  }
}
