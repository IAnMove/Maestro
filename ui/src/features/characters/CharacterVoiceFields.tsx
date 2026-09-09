import { useUiTranslation } from '../../i18n'
import { CHARACTER_VOICES, type CharacterVoice } from '../../lib/characterVoice'

export function CharacterVoiceFields({ value, onChange, disabled }: {
  value?: CharacterVoice; onChange: (voice: CharacterVoice | undefined) => void; disabled?: boolean
}) {
  const { t } = useUiTranslation('scene3dEditor')
  return <fieldset disabled={disabled} className="space-y-2 text-xs">
    <label className="block">{t('speech.libraryVoice')}
      <select data-testid="character-voice" className="mt-1 min-h-10 w-full rounded border border-border bg-bg-primary px-2" value={value?.voiceId ?? ''}
        onChange={e => onChange(e.target.value ? { provider: 'local', model: 'qwen3_tts_customvoice', voiceId: e.target.value, instructions: value?.instructions } : undefined)}>
        <option value="">{t('speech.noPreferredVoice')}</option>
        {CHARACTER_VOICES.map(id => <option key={id} value={id}>Qwen3 · {id}</option>)}
      </select>
    </label>
    {value && <label className="block">{t('speech.voiceDirection')}<textarea maxLength={1000} rows={2}
      className="mt-1 w-full rounded border border-border bg-bg-primary p-2" value={value.instructions ?? ''}
      onChange={e => onChange({ ...value, instructions: e.target.value })} /></label>}
    <p className="text-text-muted">{t('speech.voiceHint')}</p>
  </fieldset>
}
