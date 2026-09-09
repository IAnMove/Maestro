import { useUiTranslation } from '../../../i18n'
import type { Scene3DSlot } from '../types'

export function Scene3DSpeechSelector({ slots, selected, open, onToggle, onSelect }: {
  slots: Scene3DSlot[]; selected?: Scene3DSlot; open: boolean
  onToggle: () => void; onSelect: (id: string) => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const { t: sceneT } = useUiTranslation('scene3d')
  const characters = slots.filter(slot => slot.media === 'model3d')
  const selectedCharacter = selected?.media === 'model3d' ? selected.id : ''
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" data-testid="world3d-speech-toggle" aria-expanded={open} aria-controls="world3d-speech-inspector"
      disabled={!characters.length} onClick={() => {
        if (!open && !selectedCharacter) onSelect(characters[0].id)
        onToggle()
      }}
      className={`min-h-10 rounded-lg border px-3 text-xs font-medium ${open ? 'border-cyan-300 bg-cyan-300/10 text-cyan-100' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
      {t('speech.option')}
    </button>
    {open && <label className="flex items-center gap-2 text-xs text-text-secondary">{t('speech.character')}
      <select aria-label={t('speech.character')} value={selectedCharacter} onChange={event => onSelect(event.target.value)}
        className="min-h-10 rounded-lg border border-border bg-bg-primary px-2">
        {!selectedCharacter && <option value="" disabled>{t('speech.selectCharacter')}</option>}
        {characters.map(slot => <option key={slot.id} value={slot.id}>{slot.character?.name || sceneT(`stage.slot.${slot.slot}`)}</option>)}
      </select>
    </label>}
  </div>
}
