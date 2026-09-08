import { useRef, useState } from 'react'
import { useUiTranslation } from '../../i18n'
import { parseScene3DDocument } from './document.ts'
import { reviewClipNumber } from './performance.ts'
import type { Scene3DDocument } from './types.ts'

export function Scene3DDocumentControls({ document, disabled, onChange, onLoad }: {
  document: Scene3DDocument
  disabled: boolean
  onChange: (document: Scene3DDocument) => void
  onLoad: (document: Scene3DDocument) => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const save = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `clip-${String(document.clipNumber ?? 0).padStart(2, '0')}-${document.templateId}.world3d.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
    <label>{t('clipNumber')}
      <input type="number" min="1" step="1" aria-label={t('clipNumber')} disabled={disabled}
        className="ml-2 min-h-10 w-20 rounded-lg border border-border bg-bg-primary px-2"
        value={document.clipNumber ?? ''} onChange={event => onChange({ ...document, clipNumber: reviewClipNumber(event.target.valueAsNumber) })} />
    </label>
    <label>{t('duration')}
      <input type="number" min="0.1" max="600" step="0.1" aria-label={t('duration')} disabled={disabled}
        className="ml-2 min-h-10 w-20 rounded-lg border border-border bg-bg-primary px-2" value={document.duration}
        onChange={event => {
          const duration = event.target.valueAsNumber
          if (Number.isFinite(duration) && duration >= 0.1 && duration <= 600) onChange({ ...document, duration })
        }} />
    </label>
    <button type="button" disabled={disabled} onClick={save} className="min-h-10 rounded-lg border border-border px-3">{t('saveDocument')}</button>
    <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="min-h-10 rounded-lg border border-border px-3">{t('loadDocument')}</button>
    <input ref={input} type="file" accept=".json,application/json" aria-label={t('loadDocument')} disabled={disabled} className="hidden"
      onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
          if (file.size > 8 * 1024 * 1024) throw new Error('size')
          const next = parseScene3DDocument(JSON.parse(await file.text()))
          if (!next) throw new Error('document')
          onLoad(next); setError('')
        } catch { setError(t('invalidDocument')) }
      }} />
    {error && <p role="alert">{error}</p>}
  </div>
}
