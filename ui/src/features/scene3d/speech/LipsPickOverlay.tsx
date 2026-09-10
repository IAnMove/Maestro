import { useState } from 'react'
import { useUiTranslation } from '../../../i18n'

export function LipsPickOverlay({ onPick, onCancel }: { onPick: (x: number, y: number) => boolean; onCancel: () => void }) {
  const { t } = useUiTranslation('scene3dEditor')
  const [missed, setMissed] = useState(false)
  return <div className="absolute inset-0 z-[902]" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }}>
    <button type="button" autoFocus data-testid="speech-pick-surface" aria-label={t('speech.pickHint')}
      className="absolute inset-0 cursor-crosshair rounded-lg border-2 border-dashed border-cyan-300"
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        setMissed(!onPick(event.detail ? event.clientX : rect.left + rect.width / 2, event.detail ? event.clientY : rect.top + rect.height / 2))
      }} />
    <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2 rounded bg-black/85 p-2 text-xs text-cyan-100">
      <p role="status">{t(missed ? 'speech.pickMissed' : 'speech.pickHint')}</p>
      <button type="button" className="pointer-events-auto rounded border border-cyan-200 px-2 py-1" onClick={onCancel}>{t('speech.cancelPlacement')}</button>
    </div>
  </div>
}
