import { BASE } from './http'
import type { CommandResult } from '../lib/commandContract'
import { stableSerialize } from '../lib/commandContract'
import type { WorkspaceCollection } from './workspaceCollections'
import catalog from './workspaceCommandCatalog.json'
import i18n from '../i18n'

export { catalog as workspaceCommandCatalog }
export type CollectionOperation = 'collections.create' | 'collections.update'
export interface CollectionCommand {
  version: 1
  operation: CollectionOperation
  intent_id: string
  input: {
    workspace_id?: string
    expected_revision?: number
    name?: string
    description?: string
    project_ids?: string[]
    asset_ids?: string[]
    production_ids?: string[]
  }
}
export interface CollectionReceipt extends CommandResult {
  version: 1
  operation: CollectionOperation
  replayed: boolean
  result: WorkspaceCollection
}

const PENDING_KEY = 'hocuspocus.collection-commands.v1:'
const changedEvent = 'hocuspocus:collection-commands-changed'

export function newCollectionIntentId(): string {
  return globalThis.crypto?.randomUUID?.() || `collection-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function pendingCollectionCommands(): CollectionCommand[] {
  const pending: CollectionCommand[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PENDING_KEY)) continue
    const value = JSON.parse(localStorage.getItem(key) || 'null') as CollectionCommand | null
    if (!value || value.version !== 1 || !value.intent_id || !value.input
      || !catalog.operations.some(item => item.name === value.operation && item.mutation)) {
      throw new Error(i18n.t('workspaces:commands.pendingInvalid'))
    }
    pending.push(value)
  }
  return pending
}

function retainPending(command: CollectionCommand, done = false): void {
  const pending = pendingCollectionCommands()
  const existing = pending.find(item => item.intent_id === command.intent_id)
  if (existing && stableSerialize(existing) !== stableSerialize(command)) {
    throw new Error(i18n.t('workspaces:commands.intentConflict'))
  }
  // Fail before admission if the recovery hint cannot be persisted. This cache
  // is not an authority; only the backend can report a committed receipt.
  const key = PENDING_KEY + command.intent_id
  if (done) localStorage.removeItem(key)
  else localStorage.setItem(key, JSON.stringify(command))
  window.dispatchEvent(new Event(changedEvent))
}

export class CollectionCommandError extends Error {
  intentId: string
  status?: number
  constructor(message: string, intentId: string, status?: number) {
    super(message)
    this.intentId = intentId
    this.status = status
  }
}

async function postCommand<T>(value: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE}/api/v1/commands`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { detail?: string | { message?: string } }
    const message = typeof error.detail === 'string' ? error.detail : error.detail?.message
    throw new CollectionCommandError(message || i18n.t('workspaces:commands.failed'), String(value.intent_id || ''), response.status)
  }
  return response.json() as Promise<T>
}

export function fetchCollectionCommandReceipt(intentId: string): Promise<CollectionReceipt> {
  return postCommand({ version: 1, operation: 'commands.receipt', input: { intent_id: intentId } })
}

export function fetchWorkspaceCollection(workspaceId: string): Promise<WorkspaceCollection> {
  return postCommand({ version: 1, operation: 'collections.get', input: { workspace_id: workspaceId } })
}

function validCollectionRecord(item: WorkspaceCollection | undefined): boolean {
  return item?.schema === 'hocuspocus.workspace-record' && item.schema_version === 1
    && typeof item.id === 'string' && Boolean(item.id) && Number.isInteger(item.revision) && item.revision > 0
    && typeof item.name === 'string' && typeof item.description === 'string'
    && [item.project_ids, item.asset_ids, item.production_ids].every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string'))
}

function assertCollectionReceipt(receipt: CollectionReceipt, command: CollectionCommand): void {
  if (receipt?.version !== 1 || receipt.commandId !== command.intent_id || receipt.operation !== command.operation
    || receipt.status !== 'completed' || !validCollectionRecord(receipt.result)
    || (command.operation === 'collections.update' && receipt.result.id !== command.input.workspace_id)) {
    throw new CollectionCommandError(i18n.t('workspaces:commands.invalidReceipt', { id: command.intent_id }), command.intent_id)
  }
}

/** Transport retries retain the exact command. A new user action gets a new ID. */
export async function submitCollectionCommand(command: CollectionCommand): Promise<CollectionReceipt> {
  retainPending(command)
  let receipt: CollectionReceipt
  try {
    receipt = await postCommand<CollectionReceipt>({ ...command })
  } catch (error) {
    // A rejected request is known not to have committed. An uncertain transport
    // or storage response remains available for explicit recovery by the user.
    if (error instanceof CollectionCommandError && error.status && error.status < 500) retainPending(command, true)
    const detail = error instanceof Error ? error.message : String(error)
    throw new CollectionCommandError(i18n.t('workspaces:commands.failedWithIntent', { message: detail, id: command.intent_id }),
      command.intent_id, error instanceof CollectionCommandError ? error.status : undefined)
  }
  assertCollectionReceipt(receipt, command)
  // Presentation/local-storage failure after a commit must not erase its receipt.
  try { retainPending(command, true) } catch { /* Recovering the same ID remains safe. */ }
  return receipt
}

export function subscribeCollectionCommands(callback: () => void): () => void {
  window.addEventListener(changedEvent, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(changedEvent, callback)
    window.removeEventListener('storage', callback)
  }
}
