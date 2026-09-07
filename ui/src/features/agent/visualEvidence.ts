export interface VisualEvidence {
  source: string
  kind: 'image' | 'video'
  timestamps_seconds?: number[]
  audio_analyzed?: false
}

export function normalizeVisualEvidence(value: unknown): VisualEvidence[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 4).flatMap((item): VisualEvidence[] => {
    if (!item || !['image', 'video'].includes(item.kind) || typeof item.source !== 'string'
      || !/^\/api\/v1\/(uploads|file)\//.test(item.source)) return []
    return [{ source: item.source, kind: item.kind,
      ...(item.kind === 'video' ? { audio_analyzed: false as const,
        timestamps_seconds: (Array.isArray(item.timestamps_seconds) ? item.timestamps_seconds : [])
          .filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(0, 8) } : {}),
    }]
  })
}
