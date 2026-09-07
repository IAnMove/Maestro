import { getFileUrl, getOutputThumbnailUrl, type ApiOutput } from '../../api/outputs'

export function videoEditorClipFromOutput(item: ApiOutput, workspace: string): {
  source: string
  previewUrl: string
  name: string
  thumbnailUrl: string
} {
  const source = item.url || getFileUrl(item.name, workspace)
  return {
    source,
    previewUrl: source,
    name: item.name,
    thumbnailUrl: item.thumbnail_url || getOutputThumbnailUrl(item.name, workspace),
  }
}
