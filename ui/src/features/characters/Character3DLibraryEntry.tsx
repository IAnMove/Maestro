import { lazy, Suspense, useState } from 'react'
import { useUiTranslation } from '../../i18n'
const Definition = lazy(() => import('./CharacterDefinitionEditor').then(module => ({ default: module.CharacterDefinitionEditor })))
export function Character3DLibraryEntry({ workspace }: { workspace: string }) {
  const { t } = useUiTranslation('scene3dEditor'), [open, setOpen] = useState(false)
  return <details className="mx-auto mb-4 max-w-5xl rounded-lg border border-cyan-400/30 p-3" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium">{t('speech.characterDefinition')}</summary>
    {open && <Suspense fallback={<p>{t('speech.busy')}</p>}><Definition workspace={workspace} /></Suspense>}
  </details>
}
