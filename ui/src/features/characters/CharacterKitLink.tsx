import { useEffect, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import { fetchCharacterKitLibrary } from '../../api/characters'
import type { CharacterKit } from '../../lib/characterKit'
import type { CharacterKitRef } from '../../lib/characterVoice'

/** Stores an id, not a display-name match or a duplicate character definition. */
export function CharacterKitLink({ value, onChange, workspace: scope, disabled }: {
  value?: CharacterKitRef; onChange: (ref: CharacterKitRef | undefined) => void; workspace?: string; disabled?: boolean
}) {
  const active = useStore(s => s.activeWorkspace), workspace = scope ?? active
  const { t } = useUiTranslation('scene3dEditor')
  const [state, setState] = useState<{ workspace: string; kits: CharacterKit[]; error?: string }>()
  const kits = state?.workspace === workspace ? state.kits : [], error = state?.workspace === workspace ? state.error : ''
  useEffect(() => {
    let live = true
    void fetchCharacterKitLibrary(workspace).then(result => { if (live) setState({ workspace, kits: Object.values(result.kits).filter(kit => kit.speech3d) }) })
      .catch(reason => { if (live) setState({ workspace, kits: [], error: reason.message }) })
    return () => { live = false }
  }, [workspace])
  const selected = value?.workspace === workspace ? value.id : ''
  return <label className="block space-y-1 text-xs">{t('speech.savedCharacter')}
    <select data-testid="character-kit-link" disabled={disabled} className="min-h-10 w-full rounded border border-border bg-bg-primary px-2"
      value={selected} onChange={e => onChange(e.target.value ? { id: e.target.value, workspace } : undefined)}>
      <option value="">{t('speech.noLinkedCharacter')}</option>
      {selected && !kits.some(kit => kit.id === selected) && <option value={selected}>{selected} · {t('speech.missingCharacter')}</option>}
      {kits.map(kit => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
    </select>
    {value && value.workspace !== workspace && <span>{t('speech.otherWorkspace', { workspace: value.workspace })}</span>}
    {error && <span role="status">{error}</span>}
  </label>
}
