import { useEffect } from 'react'
import type { ParseKeys } from 'i18next'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import type { EditSubMode } from '../../types'

const ALL_SUB_MODES: { value: EditSubMode | 'viggle'; labelKey: ParseKeys<'studio'>; experimental?: boolean }[] = [
  { value: 'retake', labelKey: 'editSubModes.retake' },
  { value: 'edit_anything', labelKey: 'editSubModes.editAnything' },
  { value: 'outpaint', labelKey: 'editSubModes.outpaint' },
  { value: 'restyle', labelKey: 'editSubModes.restyle' },
  { value: 'recast', labelKey: 'editSubModes.recast' },
  { value: 'viggle', labelKey: 'editSubModes.viggle' },
  { value: 'inpaint', labelKey: 'editSubModes.inpaint', experimental: true },
]

export function EditSubModeToggle() {
  const { t } = useUiTranslation('studio')
  const editSubMode = useStore(s => s.editSubMode)
  const setEditSubMode = useStore(s => s.setEditSubMode)
  const modelType = useStore(s => s.params.model_type)
  const activeMode = editSubMode === 'recast' && modelType === 'viggle_animate' ? 'viggle' : editSubMode
  const showExperimental = useStore(s => !!s.servicesConfig?.show_experimental)

  // When experimental features are gated off, hide the experimental
  // sub-modes from the toggle. If the user happened to be in one of
  // them when they turned the gate off (or before it was first set),
  // snap them back to 'retake' so the toggle has something highlighted
  // and the sidebar doesn't render orphaned sub-mode controls.
  const subModes = showExperimental
    ? ALL_SUB_MODES
    : ALL_SUB_MODES.filter(m => !m.experimental)

  useEffect(() => {
    if (!showExperimental && editSubMode === 'inpaint') {
      setEditSubMode('retake')
    }
  }, [showExperimental, editSubMode, setEditSubMode])

  return (
    <div className="flex flex-wrap bg-bg-tertiary rounded-lg p-0.5 border border-border">
      {subModes.map(m => (
        <button
          key={m.value}
          onClick={() => m.value === 'viggle'
            ? setEditSubMode('recast', 'viggle')
            : setEditSubMode(m.value, m.value === 'recast' ? 'scail' : undefined)}
          aria-pressed={activeMode === m.value}
          className={`flex-1 text-[10px] py-1.5 rounded-md transition-all whitespace-nowrap ${
            activeMode === m.value
              ? 'bg-bg-active text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(m.labelKey)}
        </button>
      ))}
    </div>
  )
}
