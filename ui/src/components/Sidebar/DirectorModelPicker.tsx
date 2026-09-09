import { useEffect, useMemo } from 'react'
import { useUiTranslation } from '../../i18n'
import { useStore, getFamiliesForMode, getModelsForFamily } from '../../stores/useStore'
import { MINIMAX_IMAGE_API_LABEL, MINIMAX_IMAGE_API_MODEL } from '../../lib/externalModels'
import type { DirectorPipelineType } from '../../types'
import { InfoTooltip } from './InfoTooltip'

export function DirectorModelPicker({ mode, value, onChange, pipeline, allowSeamless, preserveSelection = false, showModeLabel = true }: {
  pipeline?: DirectorPipelineType
  allowSeamless?: boolean
  preserveSelection?: boolean
  showModeLabel?: boolean
  mode: 'image' | 'video'
  value: string
  onChange: (modelType: string) => void
}) {
  const { t } = useUiTranslation('director')
  const models = useStore(s => s.models)
  const families = useStore(s => s.families)
  const enabledModels = useStore(s => s.enabledModels)
  const nsfwMode = useStore(s => s.servicesConfig?.nsfw_mode ?? false)
  const directorSkill = useStore(s => s.directorSkill)
  const shortFilmPath = useStore(s => s.shortFilmPath)
  const directorSeamless = useStore(s => s.directorSeamless)
  const seamless = allowSeamless ?? directorSeamless

  const pipelineType: DirectorPipelineType = pipeline ?? (directorSkill === 'music_video'
    ? 'music_video'
    : shortFilmPath === 'audio'
      ? 'short_film_audio'
      : 'short_film_story')

  const groups = useMemo(() =>
    getFamiliesForMode(mode, families).map(family => ({
      family,
      models: getModelsForFamily(family.id, models, mode)
        .filter(m => enabledModels.has(m.model_type))
        .filter(m => !m.nsfw_only || nsfwMode)
        .filter(m => mode === 'image'
          ? m.director?.image.compatible === true
          : m.director?.video[pipelineType].compatible === true
            && (!seamless || m.director?.video.seamless.compatible === true)),
    })).filter(g => g.models.length > 0),
  [mode, families, models, enabledModels, nsfwMode, pipelineType, seamless])

  const compatibleModels = useMemo(
    () => groups.flatMap(group => group.models),
    [groups],
  )
  const externalKnown = mode === 'image' && value === MINIMAX_IMAGE_API_MODEL
  const known = externalKnown || compatibleModels.some(model => model.model_type === value)
  const preferredId = mode === 'image' ? 'flux2_klein_9b' : 'ltx2_22B_distilled_1_1'
  const fallback = compatibleModels.find(model => model.model_type === preferredId)
    || compatibleModels[0]
  const selectedValue = known || preserveSelection ? value : (fallback?.model_type || '')
  const selectedModel = compatibleModels.find(model => model.model_type === selectedValue)

  useEffect(() => {
    if (!preserveSelection && !known && fallback && fallback.model_type !== value) {
      onChange(fallback.model_type)
    }
  }, [fallback, known, onChange, preserveSelection, value])

  const title = mode === 'image'
    ? t('modelPicker.imageHint')
    : pipelineType === 'short_film_story'
      ? t('modelPicker.storyHint')
      : t('modelPicker.soundtrackHint')

  return (
    <div className="flex items-center gap-1.5">
      {showModeLabel && <span className="text-[10px] text-text-muted uppercase tracking-wider w-11 shrink-0">
        {mode === 'image' ? t('modelPicker.image') : t('modelPicker.video')}
      </span>}
      <select
        value={selectedValue}
        onChange={e => onChange(e.target.value)}
        disabled={compatibleModels.length === 0 && mode !== 'image'}
        title={title}
        className="flex-1 min-w-0 bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent-blue"
      >
        {preserveSelection && !known && value && <option value={value}>{models.find(model => model.model_type === value)?.name || value}</option>}
        {compatibleModels.length === 0 && mode !== 'image' && (!preserveSelection || !value) && (
          <option value="">{t('modelPicker.empty')}</option>
        )}
        {mode === 'image' && (
          <optgroup label={t('modelPicker.externalApi')}>
            <option value={MINIMAX_IMAGE_API_MODEL}>{MINIMAX_IMAGE_API_LABEL}</option>
          </optgroup>
        )}
        {groups.map(({ family, models: famModels }) => (
          <optgroup key={family.id} label={family.label}>
            {famModels.map(m => (
              <option key={m.model_type} value={m.model_type}>{m.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {selectedModel?.selector_help && (
        <InfoTooltip
          text={selectedModel.selector_help}
          label={t('modelPicker.about', { name: selectedModel.name })}
        />
      )}
    </div>
  )
}

