import { useEffect, useState } from 'react'
import { pendingCollectionCommands, submitCollectionCommand, subscribeCollectionCommands,
  type CollectionCommand } from '../../api/workspaceCommands'
import type { WorkspaceCollection } from '../../api/workspaceCollections'
import { useUiTranslation } from '../../i18n'

export function CollectionRecovery({ onRecovered, disabled = false }: { onRecovered: (item: WorkspaceCollection) => void; disabled?: boolean }) {
  const { t } = useUiTranslation('workspaces')
  const [pending, setPending] = useState<CollectionCommand[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => {
    const load = () => {
      try { setPending(pendingCollectionCommands()) } catch (error) { setError(String(error)) }
    }
    load()
    return subscribeCollectionCommands(load)
  }, [])
  const retry = async (command: CollectionCommand) => {
    setBusy(command.intent_id); setError('')
    try {
      const receipt = await submitCollectionCommand(command)
      onRecovered(receipt.result)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy('') }
  }
  if (!pending.length && !error) return null
  return <div className="mb-3 rounded-md border border-amber-500/40 p-3 text-xs">
    <p>{t('commands.pendingTitle')}</p>
    <p className="mt-1 text-text-muted">{t('commands.pendingHint')}</p>
    {pending.map(command => <div key={command.intent_id} className="mt-2 flex flex-wrap items-center gap-2">
      <span>{command.input.name || command.input.workspace_id}</span>
      <code className="text-[10px]">{command.intent_id}</code>
      <button type="button" disabled={Boolean(busy) || disabled} title={disabled ? t('commands.unsavedChanges') : undefined} onClick={() => void retry(command)} className="rounded border border-border px-2 py-1">
        {busy === command.intent_id ? t('commands.recovering') : t('commands.recover')}
      </button>
    </div>)}
    {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
  </div>
}
