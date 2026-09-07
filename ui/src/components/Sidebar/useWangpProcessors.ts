import { useEffect, useState } from 'react'

export interface WangpProcessor {
  value: string
  label: string
  kind: 'spatial' | 'temporal'
  media: string[]
  enabled: boolean
  reason: string
  parameters?: { name: string; type: string; default?: unknown; minimum?: number; maximum?: number; step?: number }[]
}

export function useWangpProcessors() {
  const [processors, setProcessors] = useState<WangpProcessor[]>([])
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/v1/wangp/capabilities', { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Processors unavailable'); return response.json() as Promise<{ processors: WangpProcessor[] }> })
      .then(result => { if (!controller.signal.aborted) setProcessors(Array.isArray(result.processors) ? result.processors : []) })
      .catch(error => { if (!controller.signal.aborted) console.debug('Optional processor discovery:', error) })
    return () => controller.abort()
  }, [])
  return processors
}
