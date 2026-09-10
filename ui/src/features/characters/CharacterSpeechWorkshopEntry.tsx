import { lazy, Suspense, useState } from 'react'
import { useUiTranslation } from '../../i18n'

const Preparation = lazy(() => import('./CharacterSpeechPreparation').then(module => ({ default: module.CharacterSpeechPreparation })))

/** Closing the drawer keeps its draft; first opening is the only lazy load. */
export function CharacterSpeechWorkshopEntry({ workspace }: { workspace: string }) {
  const { t } = useUiTranslation('characters')
  const [visited, setVisited] = useState(false)
  return <details className="mx-auto mb-4 max-w-5xl rounded-lg border border-violet-400/30 p-3" onToggle={event => { if (event.currentTarget.open) setVisited(true) }}>
    <summary className="cursor-pointer text-sm font-medium text-violet-100">{t('speechWorkshop.title')}</summary>
    {visited && <div className="mt-3"><Suspense fallback={<p role="status">{t('speechWorkshop.busy')}</p>}><Preparation workspace={workspace} /></Suspense></div>}
  </details>
}
