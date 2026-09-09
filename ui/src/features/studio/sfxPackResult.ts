import type { GenerationReceiptLike } from '../../api/generationCommandClient'
import { commandResultFromSlice } from '../../lib/commandContract'
import i18n from '../../i18n'
import { newUserGenerationContext, type GenerationSubmissionContext } from './generationProvenance'

export function sfxPackContexts(context: GenerationSubmissionContext | undefined, count: number) {
  const parent = context?.commandId || newUserGenerationContext().commandId!
  return Array.from({ length: count }, (_, index): GenerationSubmissionContext => {
    // Keep the full parent ID. Truncating it could alias two different packs.
    const commandId = `${parent}:sfx:${index + 1}`
    if (commandId.length > 160) throw new Error(i18n.t('studio:sfxCommands.packIdTooLong'))
    return { actor: 'user', ...context, commandId }
  })
}

export function sfxPackResult(
  workspace: string,
  contexts: GenerationSubmissionContext[],
  receipts: GenerationReceiptLike[],
  failure?: string,
) {
  const parentId = contexts[0].commandId!.replace(/:sfx:1$/, '')
  const entity = { kind: 'sfx_pack', id: parentId, workspaceId: workspace }
  const failed = failure !== undefined
  const message = failure || i18n.t('studio:sfxCommands.packMissingReceipt', { name: String(receipts.length + 1) })
  const summary = failed
    ? i18n.t('studio:sfxCommands.packPartial', { count: receipts.length, total: contexts.length, error: message })
    : i18n.t('studio:sfxCommands.packQueued', { count: receipts.length })
  return commandResultFromSlice({
    commandId: parentId,
    status: failed ? (receipts.length ? 'partial' : 'failed') : 'queued',
    entity, taskIds: receipts.flatMap(receipt => receipt.taskIds),
    artifacts: [{ id: 'reply', kind: 'document', owner: entity, uri: 'studio:reply', metadata: {
      title: 'Audio → SFX', mode: 'audio', summary, receipts,
      childIntentIds: contexts.map(context => context.commandId),
    } }],
    ...(failed ? { error: { code: 'sfx_pack_incomplete', message, retryable: true,
      details: { nextClipIndex: receipts.length, pendingIntentIds: contexts.slice(receipts.length).map(context => context.commandId) },
    } } : {}),
  })
}
