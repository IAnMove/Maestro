import { SeriesField } from './components'
import { inputClass, textareaClass } from './styles'
import type { SeriesProject } from './types'
import { useUiTranslation } from '../../i18n'
import { CharacterKitLink } from '../characters/CharacterKitLink'

export function SeriesVoiceFields({
  series, onPatchVoice,
}: {
  series: SeriesProject
  onPatchVoice: (index: number, patch: Record<string, unknown>) => void
}) {
  const { t } = useUiTranslation('seriesLab')
  return (
    <div className="space-y-3">
      {series.characters.map((character, index) => (
        <div key={character.id} className="rounded-lg border border-border p-3">
          <strong className="text-xs text-text-primary">{character.name || t('canon.character')}</strong>
          <CharacterKitLink value={character.voiceProfile?.characterKitRef} onChange={characterKitRef => onPatchVoice(index, { characterKitRef })} />
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <SeriesField label={t('canon.provider')}>
              <input className={inputClass} value={String(character.voiceProfile?.provider || '')} onChange={event => onPatchVoice(index, { provider: event.target.value })} />
            </SeriesField>
            <SeriesField label={t('canon.voiceId')} hint={t('canon.voiceIdHint')}>
              <input className={inputClass} value={String(character.voiceProfile?.voiceId || '')} onChange={event => onPatchVoice(index, { voiceId: event.target.value })} />
            </SeriesField>
            <SeriesField label={t('canon.language')}>
              <input className={inputClass} value={String(character.voiceProfile?.language || '')} onChange={event => onPatchVoice(index, { language: event.target.value })} />
            </SeriesField>
            <SeriesField label={t('canon.pace')}>
              <input className={inputClass} type="number" step="0.05" value={Number(character.voiceProfile?.pace ?? 1)} onChange={event => onPatchVoice(index, { pace: Number(event.target.value) })} />
            </SeriesField>
            <SeriesField label={t('canon.pitch')}>
              <input className={inputClass} type="number" step="0.05" value={Number(character.voiceProfile?.pitch ?? 0)} onChange={event => onPatchVoice(index, { pitch: Number(event.target.value) })} />
            </SeriesField>
            <SeriesField label={t('canon.emotion')}>
              <input className={inputClass} value={String(character.voiceProfile?.emotionalDefaults || '')} onChange={event => onPatchVoice(index, { emotionalDefaults: event.target.value })} />
            </SeriesField>
            <SeriesField label={t('canon.pronunciationLabel')}>
              <textarea className={textareaClass} value={Object.entries(character.voiceProfile?.pronunciationDictionary || {}).map(([word, pronunciation]) => `${word}=${pronunciation}`).join('\n')} placeholder={t('canon.pronunciationPlaceholder')} onChange={event => onPatchVoice(index, { pronunciationDictionary: Object.fromEntries(event.target.value.split('\n').map(line => line.split('=', 2).map(value => value.trim())).filter(parts => parts.length === 2 && parts[0])) })} />
            </SeriesField>
            <SeriesField label={t('canon.consent')}>
              <textarea className={textareaClass} value={String(character.voiceProfile?.consentSourceNote || '')} onChange={event => onPatchVoice(index, { consentSourceNote: event.target.value })} />
            </SeriesField>
          </div>
        </div>
      ))}
    </div>
  )
}
