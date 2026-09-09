import { useState, type ReactNode } from 'react'
import { useUiTranslation } from '../../i18n'
import type { TransformMode } from './transformGizmo'

const shortcuts: Record<string, TransformMode> = { g: 'translate', r: 'rotate', s: 'scale' }

/** Keyboard scope and transient help belong to the editor, never the render. */
export function Scene3DInteraction({ enabled, width, height, onMode, children }: {
  enabled: boolean; width: number; height: number
  onMode: (mode: TransformMode) => void; children: ReactNode
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const [showHelp, setShowHelp] = useState(false)
  return <div
    role="region" aria-label={t('viewport')} aria-keyshortcuts="G R S"
    tabIndex={enabled ? 0 : -1}
    className="relative w-full overflow-hidden rounded-lg border border-border bg-[#10141c] focus-visible:outline-2 focus-visible:outline-cyan-300"
    style={{ aspectRatio: `${width} / ${height}` }}
    onFocus={() => { if (enabled) setShowHelp(true) }}
    onBlur={() => setShowHelp(false)}
    onPointerEnter={() => { if (enabled) setShowHelp(true) }}
    onPointerLeave={() => setShowHelp(false)}
    onPointerDownCapture={event => {
      if (!enabled || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return
      event.currentTarget.focus({ preventScroll: true })
      setShowHelp(true)
    }}
    onPointerUpCapture={() => setShowHelp(false)}
    onPointerCancel={() => setShowHelp(false)}
    onKeyDown={event => {
      if (!enabled || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target !== event.currentTarget && !(event.target instanceof HTMLCanvasElement)) return
      const mode = shortcuts[event.key.toLowerCase()]
      if (!mode) return
      event.preventDefault()
      event.stopPropagation()
      onMode(mode)
      setShowHelp(true)
    }}
  >
    {children}
    {enabled && showHelp && <div role="status" data-testid="scene3d-transform-help"
      className="pointer-events-none absolute inset-x-2 bottom-2 z-[902] mx-auto w-fit max-w-[calc(100%-1rem)] rounded-lg border border-cyan-300/40 bg-black/90 px-3 py-2 text-center text-xs leading-5 text-cyan-50">
      {t('transformShortcuts')}
    </div>}
  </div>
}
