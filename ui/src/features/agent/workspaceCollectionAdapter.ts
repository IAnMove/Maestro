import type { AdapterOutcome, WorkspaceAdapter } from './applicationAdapters'
import type { AgentTab } from './capabilityRegistry'
import type { CollectionCommand } from '../../api/workspaceCommands'
import { fetchWorkspaceCollection, newCollectionIntentId, submitCollectionCommand } from '../../api/workspaceCommands'
import type { WorkspaceCollection } from '../../api/workspaceCollections'
import { cancelCollectionPresentation, presentCollectionCommand } from '../workspaceCollections/collectionPresentation'
import i18n from '../../i18n'

export function createWorkspaceCollectionAdapter(navigate: (tab: AgentTab) => Promise<AdapterOutcome>):
  Pick<WorkspaceAdapter, 'createCollection' | 'updateCollection'> {
  const execute = async (command: CollectionCommand, current?: WorkspaceCollection): Promise<AdapterOutcome> => {
    await navigate('workspaces')
    try {
      await presentCollectionCommand(command, 'prepare', current)
    } catch (error) { cancelCollectionPresentation(command); throw error }
    let receipt
    try {
      receipt = await submitCollectionCommand(command)
    } catch (error) { cancelCollectionPresentation(command); throw error }
    let presentationWarning = ''
    try {
      await presentCollectionCommand(command, 'committed', receipt.result)
    } catch {
      presentationWarning = i18n.t('workspaces:commands.savedButNotVisible', { id: receipt.result.id })
    }
    const item = receipt.result
    return {
      message: [i18n.t('workspaces:commands.saved', { name: item.name, revision: item.revision }), presentationWarning].filter(Boolean).join(' '),
      target: { kind: 'workspace_collection', id: item.id, title: item.name },
      metadata: { commandId: receipt.commandId, receipt, ...(presentationWarning ? { presentationWarning } : {}) },
    }
  }
  return {
    async createCollection(action, context) {
      return execute({ version: 1, operation: 'collections.create', intent_id: context?.commandId || newCollectionIntentId(), input: {
        name: action.name, description: action.description,
        project_ids: action.projectIds, asset_ids: action.assetIds, production_ids: action.productionIds,
      } })
    },
    async updateCollection(action, context) {
      const current = await fetchWorkspaceCollection(action.workspaceId)
      if (action.expectedRevision !== undefined && current.revision !== action.expectedRevision) {
        throw new Error(i18n.t('workspaces:commands.revisionConflict', { expected: action.expectedRevision, current: current.revision }))
      }
      return execute({ version: 1, operation: 'collections.update', intent_id: context?.commandId || newCollectionIntentId(), input: {
        workspace_id: action.workspaceId, expected_revision: action.expectedRevision ?? current.revision,
        name: action.name, description: action.description,
        project_ids: action.projectIds, asset_ids: action.assetIds, production_ids: action.productionIds,
      } }, current)
    },
  }
}
