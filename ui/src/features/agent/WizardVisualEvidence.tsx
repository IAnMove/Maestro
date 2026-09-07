import { useUiTranslation } from '../../i18n'
import { normalizeVisualEvidence, type VisualEvidence } from './visualEvidence'

export function WizardVisualEvidence({ evidence }: { evidence?: VisualEvidence[] }) {
  const { t } = useUiTranslation('studio')
  const items = normalizeVisualEvidence(evidence)
  if (!items.length) return null
  return <details className="mt-2 text-xs text-text-muted">
    <summary>{t('wangp.visualEvidence')}</summary>
    <p>{t('wangp.visualReadOnly')}</p>
    {items.map((item, index) => <div key={index}>
      <a className="underline break-all" href={item.source} target="_blank" rel="noreferrer">{item.source}</a>
      {item.kind === 'video' && <p>{item.timestamps_seconds?.join(', ')} s · {t('wangp.visualHint')}</p>}
    </div>)}
  </details>
}
