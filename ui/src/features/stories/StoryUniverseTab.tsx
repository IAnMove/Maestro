import type { ReactNode } from 'react'
import { useUiTranslation } from '../../i18n'

export function StoryUniverseTab({ children }: { children: ReactNode }) {
  const { t } = useUiTranslation('storyLab')
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('universe.title')}</h2>
        <p className="mt-1 text-xs text-text-muted">{t('universe.description')}</p>
      </div>
      {children}
    </div>
  )
}
