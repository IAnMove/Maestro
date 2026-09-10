import { useState } from 'react'
import { Search } from 'lucide-react'
import { useUiTranslation } from '../../i18n'
import { SCENE3D_TEMPLATES, TEMPLATE_CATEGORIES, type Scene3DTemplateCategory, type Scene3DTemplateId } from './templates'

const categories = ['cinema', 'product', 'music', 'space', 'drive'] as const

export function Scene3DTemplateBrowser({ selected, disabled, onSelect }: {
  selected?: Scene3DTemplateId; disabled: boolean; onSelect: (id: Scene3DTemplateId) => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const [category, setCategory] = useState<'all' | Scene3DTemplateCategory>('all')
  const [query, setQuery] = useState('')
  const templates = SCENE3D_TEMPLATES.filter(item => (category === 'all' || TEMPLATE_CATEGORIES[item.id] === category)
    && `${t(`template.${item.id}.title`)} ${t(`template.${item.id}.description`)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <section className="rounded-xl border border-border bg-bg-secondary p-3" aria-label={t('templates')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-text-primary">{t('templates')} <span className="ml-1 text-text-muted">{SCENE3D_TEMPLATES.length}</span></h2>
      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 text-text-muted"><Search size={16} />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} className="min-w-0 bg-transparent text-sm text-text-primary outline-none" />
      </label>
    </div>
    <div className="my-3 flex flex-wrap gap-2" role="group" aria-label={t('templates')}>
      {(['all', ...categories] as const).map(item => <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item}
        className={`min-h-10 rounded-lg border px-3 text-xs font-medium ${category === item ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
        {item === 'all' ? t('all') : t(`category.${item}`)}
      </button>)}
    </div>
    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map(item => <button key={item.id} type="button" disabled={disabled} onClick={() => onSelect(item.id)} aria-pressed={selected === item.id}
        data-testid={`world3d-template-${item.id}`}
        className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-40 ${selected === item.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-border bg-bg-primary hover:border-cyan-300/50'}`}>
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-text-primary">{t(`template.${item.id}.title`)}<span className="whitespace-nowrap text-xs font-normal tabular-nums text-text-muted">{item.duration} s</span></span>
        <span className="mt-1 block text-xs leading-5 text-text-secondary">{t(`template.${item.id}.description`)}</span>
      </button>)}
    </div>
    {templates.length === 0 && <p role="status" className="p-4 text-sm text-text-secondary">{t('noResults')}</p>}
  </section>
}
