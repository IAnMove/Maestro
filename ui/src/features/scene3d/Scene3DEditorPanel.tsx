import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useUiTranslation } from '../../i18n'
import { Scene3DWorkspace } from './Scene3DWorkspace.tsx'

export function Scene3DEditorPanel() {
  const { t } = useUiTranslation('scene3dEditor')
  const host = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    const update = () => setExpanded(document.fullscreenElement === host.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const toggle = async () => {
    try {
      if (document.fullscreenElement === host.current) await document.exitFullscreen()
      else await host.current?.requestFullscreen()
      setError(false)
    } catch { setError(true) }
  }
  return (
    <div ref={host} className={`flex w-full flex-col gap-3 bg-bg-primary ${expanded ? 'overflow-y-auto p-5' : ''}`} data-testid="world3d-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="text-sm leading-relaxed text-text-muted">{t('subtitle')}</p></div>
        <button type="button" onClick={() => void toggle()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs text-text-primary">
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{expanded ? t('exitFocus') : t('focusEditor')}
        </button>
      </div>
      {error && <p role="status" className="text-xs text-amber-200">{t('fullscreenUnavailable')}</p>}
      <Scene3DWorkspace width={1280} height={720} />
    </div>
  )
}
