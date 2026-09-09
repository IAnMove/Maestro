import { useLayoutEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CollectionCommand } from '../../api/workspaceCommands'
import type { WorkspaceCollection } from '../../api/workspaceCollections'
import i18n from '../../i18n'

const EVENT = 'hocuspocus:collection-presentation'
type Phase = 'prepare' | 'committed' | 'cancel'
interface PresentationRequest {
  command: CollectionCommand
  phase: Phase
  collection?: WorkspaceCollection
  respond: (error?: string) => void
}

async function mountedPanel(): Promise<HTMLElement> {
  const find = () => document.querySelector<HTMLElement>('[data-collection-ready="true"]')
  const current = find()
  if (current) return current
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { observer.disconnect(); reject(new Error(i18n.t('workspaces:commands.panelUnavailable'))) }, 8000)
    const observer = new MutationObserver(() => {
      const root = find()
      if (root) { observer.disconnect(); clearTimeout(timer); resolve(root) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-collection-ready'] })
  })
}

/** ACK follows a React commit of the exact draft. This never executes the API. */
export async function presentCollectionCommand(command: CollectionCommand, phase: Exclude<Phase, 'cancel'>,
  collection?: WorkspaceCollection): Promise<void> {
  const root = await mountedPanel()
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(i18n.t('workspaces:commands.panelUnavailable'))), 8000)
    const respond = (error?: string) => {
      clearTimeout(timer)
      if (error) reject(new Error(error))
      else resolve()
    }
    window.dispatchEvent(new CustomEvent<PresentationRequest>(EVENT, { detail: { command, phase, collection, respond } }))
  })
  if (!root.isConnected || root.dataset.collectionCommand !== command.intent_id) {
    throw new Error(i18n.t('workspaces:commands.contextChanged'))
  }
}

export function cancelCollectionPresentation(command: CollectionCommand): void {
  window.dispatchEvent(new CustomEvent<PresentationRequest>(EVENT, { detail: { command, phase: 'cancel', respond: () => undefined } }))
}

interface PanelState {
  draft: WorkspaceCollection | null
  selectedId: string
  newName: string
  dirty: boolean
  loading: boolean
  saving: boolean
  setDraft: Dispatch<SetStateAction<WorkspaceCollection | null>>
  setSelectedId: Dispatch<SetStateAction<string>>
  setNewName: Dispatch<SetStateAction<string>>
  setItems: Dispatch<SetStateAction<WorkspaceCollection[]>>
  setSaving: Dispatch<SetStateAction<boolean>>
  invalidateLoad: () => void
}

function proposedDraft(request: PresentationRequest): WorkspaceCollection {
  const { command, collection } = request
  if (request.phase === 'committed') return collection!
  if (command.operation === 'collections.update' && (!collection || collection.id !== command.input.workspace_id
      || collection.revision !== command.input.expected_revision)) throw new Error(i18n.t('workspaces:commands.contextChanged'))
  return {
    schema: 'hocuspocus.workspace-record', schema_version: 1, id: '', revision: 1,
    name: '', description: '', project_ids: [], asset_ids: [], production_ids: [], created_at: null, updated_at: null,
    ...collection,
    ...Object.fromEntries(Object.entries(command.input).filter(([key, value]) => value !== undefined
      && ['name', 'description', 'project_ids', 'asset_ids', 'production_ids'].includes(key))),
  }
}

export function useCollectionPresentation(state: PanelState) {
  const current = useRef(state)
  useLayoutEffect(() => { current.current = state }, [state])
  const rootRef = useRef<HTMLElement>(null)
  const active = useRef<{ id: string; before: Pick<PanelState, 'draft' | 'selectedId' | 'newName'> } | null>(null)
  const pending = useRef<{ request: PresentationRequest; expected: WorkspaceCollection } | null>(null)

  useLayoutEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<PresentationRequest>).detail
      const value = current.current
      const id = request.command.intent_id
      if (request.phase === 'cancel') {
        if (active.current?.id === id) {
          value.setDraft(active.current.before.draft)
          value.setSelectedId(active.current.before.selectedId)
          value.setNewName(active.current.before.newName)
          active.current = null
          value.setSaving(false)
          pending.current = null
        }
        return
      }
      if (request.phase === 'prepare' && (value.loading || value.saving || value.dirty || value.newName.trim())) {
        request.respond(i18n.t('workspaces:commands.unsavedChanges'))
        return
      }
      if (request.phase === 'committed' && active.current?.id !== id) {
        request.respond(i18n.t('workspaces:commands.contextChanged'))
        return
      }
      try {
        const expected = proposedDraft(request)
        if (request.phase === 'prepare') active.current = { id, before: { draft: value.draft, selectedId: value.selectedId, newName: value.newName } }
        value.invalidateLoad()
        value.setSaving(request.phase === 'prepare')
        value.setDraft(expected)
        value.setSelectedId(expected.id)
        value.setNewName('')
        if (request.phase === 'committed') value.setItems(items => [expected, ...items.filter(item => item.id !== expected.id)])
        pending.current = { request, expected }
      } catch (error) { request.respond(error instanceof Error ? error.message : String(error)) }
    }
    window.addEventListener(EVENT, receive)
    return () => { window.removeEventListener(EVENT, receive) }
  }, [])

  useLayoutEffect(() => {
    const presentation = pending.current
    if (!presentation || !rootRef.current || JSON.stringify(state.draft) !== JSON.stringify(presentation.expected)) return
    rootRef.current.dataset.collectionCommand = presentation.request.command.intent_id
    pending.current = null
    if (presentation.request.phase === 'committed') active.current = null
    presentation.request.respond()
  }, [state.draft])

  return { rootRef }
}
