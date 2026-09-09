import { BASE } from './http'
import { stableSerialize } from '../lib/commandContract'
import type { GenerationSubmissionContext } from '../features/studio/generationProvenance'

/**
 * Durable client-side transport shared by the typed Studio generation
 * operations.  A command-specific module owns its closed schema and passes
 * only a detached validator here; this module owns persistence, ACK ordering,
 * retries and receipt validation.
 */
export interface GenerationCommandInput {
  workspace: string
  [key: string]: unknown
}

export interface GenerationCommandLike {
  version: number
  operation: string
  intent_id: string
  input: { workspace: string }
}

export interface GenerationTaskResult {
  job_id: string
  task_id: string
  workspace: string
  status: 'queued'
  root_task_id?: string | null
}

export interface GenerationReceiptLike {
  version: 1
  commandId: string
  operation: string
  status: 'queued'
  entities: unknown[]
  artifacts: unknown[]
  taskIds: string[]
  pipelineIds: string[]
  result: GenerationTaskResult
  replayed?: boolean
  commandVersion?: 2
  contentFingerprint?: string
  fingerprintVersion?: 2
}

export interface GenerationCommandErrorOptions {
  status?: number
  uncertain?: boolean
  code?: string
}

export class GenerationCommandError extends Error {
  readonly intentId: string
  readonly workspace: string
  readonly status?: number
  readonly uncertain: boolean
  readonly code: string

  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message)
    this.name = 'GenerationCommandError'
    this.intentId = intentId
    this.workspace = workspace
    this.status = options.status
    this.uncertain = options.uncertain ?? false
    this.code = options.code ?? 'generation_command_failed'
  }
}

type CommandErrorConstructor = new (
  message: string,
  intentId: string,
  workspace: string,
  options?: GenerationCommandErrorOptions,
) => GenerationCommandError

export interface GenerationCommandClientConfig<
  Command extends GenerationCommandLike,
  Receipt extends GenerationReceiptLike,
> {
  /** Stable storage namespace. It must include the versioned operation family. */
  storagePrefix: string
  contextStoragePrefix: string
  pendingChangedEvent: string
  operation: string
  label: string
  /** A v1 fallback keeps legacy receipt reads compatible when no hint exists. */
  receiptFallbackVersion?: number
  detach: (value: unknown) => Command
  errorClass?: CommandErrorConstructor
  /** Build a receipt type without exposing a second transport implementation. */
  castReceipt?: (value: GenerationReceiptLike) => Receipt
}

export interface SubmitGenerationCommandOptions<Command extends GenerationCommandLike> {
  /** UI attribution is transport metadata; it never enters the command hash. */
  submissionContext?: GenerationSubmissionContext
  /** Runs after the durable pending hint and before the network POST. */
  onSnapshotReady?: (snapshot: Command) => void | Promise<void>
}

type StoredSubmissionContext = Pick<GenerationSubmissionContext, 'actor' | 'workflowId' | 'runId'>

interface ReceiptEnvelope {
  receipt: unknown
  replayed?: boolean
  malformed?: boolean
}

interface ReceiptContext {
  version: number
  intent_id: string
  operation: string
  input: Pick<GenerationCommandInput, 'workspace'>
}

const MAX_INTENT_LENGTH = 160
const MAX_WORKSPACE_LENGTH = 240
const MAX_SUBMISSION_CONTEXT_ID_LENGTH = 200
const SUBMISSION_ACTORS = new Set(['user', 'wizard', 'system', 'unknown'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function errorFor<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  message: string,
  command: Pick<GenerationCommandLike, 'intent_id'> & { input: Pick<GenerationCommandInput, 'workspace'> },
  options: GenerationCommandErrorOptions = {},
): GenerationCommandError {
  const ErrorClass = config.errorClass || GenerationCommandError
  return new ErrorClass(message, command.intent_id, command.input.workspace, options)
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-blank string`)
  if (value.length > maximum) throw new Error(`${field} is too long`)
  return value
}

function storage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('localStorage is unavailable; command admission cannot be made safely')
  }
  return globalThis.localStorage
}

function notifyPendingChanged(eventName: string): void {
  if (typeof window === 'undefined' || typeof Event === 'undefined') return
  window.dispatchEvent(new Event(eventName))
}

function contextPart(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value
    || value.length > MAX_SUBMISSION_CONTEXT_ID_LENGTH) {
    throw new Error(field + ' must be an exact non-blank string of at most 200 characters')
  }
  return value
}

function validateSubmissionContext(context: GenerationSubmissionContext | undefined): StoredSubmissionContext | undefined {
  if (!context) return undefined
  if (!SUBMISSION_ACTORS.has(context.actor)) throw new Error('submissionContext.actor must be a known actor')
  const workflowId = contextPart(context.workflowId, 'submissionContext.workflowId')
  const runId = contextPart(context.runId, 'submissionContext.runId')
  return {
    actor: context.actor,
    ...(workflowId !== undefined ? { workflowId } : {}),
    ...(runId !== undefined ? { runId } : {}),
  }
}

function receiptError<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: ReceiptContext,
  message = 'Receipt could not be verified',
): GenerationCommandError {
  return errorFor(config, `${message} for ${command.intent_id}`, command, {
    status: 200,
    uncertain: true,
    code: 'invalid_receipt',
  })
}

function pendingKey<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
): string {
  return config.storagePrefix + intentId
}

function pendingContextKey<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
): string {
  return config.contextStoragePrefix + intentId
}

function invalidStoredCommand<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
): GenerationCommandError {
  return errorFor(config, `Stored ${config.label} command ${intentId} is invalid`, {
    intent_id: intentId,
    input: { workspace: '' },
  }, { code: 'invalid_pending_command' })
}

function readPending<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
): Command | null {
  const raw = storage().getItem(pendingKey(config, intentId))
  if (raw == null) return null
  try {
    const command = config.detach(JSON.parse(raw))
    if (command.intent_id !== intentId) throw new Error('intent_id does not match storage key')
    return command
  } catch {
    throw invalidStoredCommand(config, intentId)
  }
}

const STORED_CONTEXT_ENVELOPE_FIELDS = new Set(['version', 'intent_id', 'workspace', 'context'])
const STORED_CONTEXT_FIELDS = new Set(['actor', 'workflowId', 'runId'])

function invalidStoredContext<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
): GenerationCommandError {
  return errorFor(config, `Stored ${config.label} context ${intentId} is invalid`, {
    intent_id: intentId,
    input: { workspace: '' },
  }, { code: 'invalid_pending_context' })
}

function normalizeStoredContext(value: unknown): StoredSubmissionContext {
  if (!isRecord(value)) throw new Error('context must be an object')
  for (const key of Object.keys(value)) {
    if (!STORED_CONTEXT_FIELDS.has(key)) throw new Error('context contains an unsupported field')
  }
  if (typeof value.actor !== 'string' || !SUBMISSION_ACTORS.has(value.actor)) throw new Error('context.actor is invalid')
  const workflowId = contextPart(value.workflowId, 'context.workflowId')
  const runId = contextPart(value.runId, 'context.runId')
  return {
    actor: value.actor as StoredSubmissionContext['actor'],
    ...(workflowId !== undefined ? { workflowId } : {}),
    ...(runId !== undefined ? { runId } : {}),
  }
}

function readPendingContext<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: Command,
): StoredSubmissionContext | null {
  const raw = storage().getItem(pendingContextKey(config, command.intent_id))
  if (raw == null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)
      || Object.keys(value).some(key => !STORED_CONTEXT_ENVELOPE_FIELDS.has(key))
      || value.version !== 1
      || value.intent_id !== command.intent_id
      || value.workspace !== command.input.workspace) throw new Error('context envelope does not match command')
    return normalizeStoredContext(value.context)
  } catch {
    throw invalidStoredContext(config, command.intent_id)
  }
}

function persistPendingContext<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: Command,
  context: StoredSubmissionContext | undefined,
): void {
  const key = pendingContextKey(config, command.intent_id)
  if (!context) {
    if (storage().getItem(key) != null) storage().removeItem(key)
    return
  }
  storage().setItem(key, stableSerialize({
    version: 1,
    intent_id: command.intent_id,
    workspace: command.input.workspace,
    context,
  }))
}

function sameSubmissionContext(left: StoredSubmissionContext, right: StoredSubmissionContext): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function sameCommand<Command extends GenerationCommandLike>(left: Command, right: Command): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function retainPending<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: Command,
  done = false,
): boolean {
  const existing = readPending(config, command.intent_id)
  if (existing && !sameCommand(existing, command)) {
    throw errorFor(config, `intent_id ${command.intent_id} is already pending with a different command`, command, {
      code: 'intent_conflict',
    })
  }
  const key = pendingKey(config, command.intent_id)
  if (done) {
    const current = readPending(config, command.intent_id)
    if (current && sameCommand(current, command)) {
      persistPendingContext(config, command, undefined)
      storage().removeItem(key)
    } else if (!current) {
      persistPendingContext(config, command, undefined)
    }
  } else {
    storage().setItem(key, stableSerialize(command))
  }
  notifyPendingChanged(config.pendingChangedEvent)
  return existing != null
}

function forgetPending<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: Command,
): void {
  try { retainPending(config, command, true) } catch { /* cleanup is best effort after a confirmed receipt */ }
}

function errorDetail(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (!isRecord(value)) return undefined
  const detail = value.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (isRecord(detail) && typeof detail.message === 'string' && detail.message.trim()) return detail.message
  if (typeof value.message === 'string' && value.message.trim()) return value.message
  return undefined
}

async function responseError<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  response: Response,
  command: Pick<GenerationCommandLike, 'intent_id'> & { input: Pick<GenerationCommandInput, 'workspace'> },
): Promise<GenerationCommandError> {
  const payload = await response.json().catch(() => undefined)
  return errorFor(config, errorDetail(payload) || `${config.label} command failed (${response.status})`, command, {
    status: response.status,
    uncertain: response.status >= 500,
    code: 'http_error',
  })
}

function unwrapReceipt(value: unknown): ReceiptEnvelope {
  if (isRecord(value) && 'receipt' in value) {
    if ('replayed' in value && typeof value.replayed !== 'boolean') return { receipt: value.receipt, malformed: true }
    return {
      receipt: value.receipt,
      replayed: typeof value.replayed === 'boolean' ? value.replayed : undefined,
    }
  }
  return { receipt: value }
}

function receiptReplay<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  value: Record<string, unknown>,
  command: ReceiptContext,
  fallback?: boolean,
): boolean | undefined {
  if ('replayed' in value && typeof value.replayed !== 'boolean') throw receiptError(config, command)
  return typeof value.replayed === 'boolean' ? value.replayed : fallback
}

function receiptV2Metadata<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  value: Record<string, unknown>,
  command: ReceiptContext,
): Pick<GenerationReceiptLike, 'commandVersion' | 'contentFingerprint' | 'fingerprintVersion'> {
  const fields = ['commandVersion', 'contentFingerprint', 'fingerprintVersion'] as const
  const present = fields.filter(field => field in value)
  if (present.length !== 0 && present.length !== fields.length) {
    throw receiptError(config, command, 'Receipt fingerprint metadata is incomplete')
  }
  if (present.length === 0) {
    if (command.version === 2) throw receiptError(config, command, 'The v2 receipt is missing its content fingerprint')
    return {}
  }
  if (value.commandVersion !== 2 || value.fingerprintVersion !== 2
    || typeof value.contentFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.contentFingerprint)) {
    throw receiptError(config, command, 'Receipt fingerprint metadata is invalid')
  }
  return { commandVersion: 2, contentFingerprint: value.contentFingerprint, fingerprintVersion: 2 }
}

function validTaskResult(value: unknown, workspace: string, taskIds: unknown[]): value is GenerationTaskResult {
  return isRecord(value)
    && typeof value.job_id === 'string' && value.job_id.length > 0
    && typeof value.task_id === 'string' && value.task_id.length > 0
    && taskIds.length === 1 && taskIds[0] === value.task_id
    && value.workspace === workspace && value.status === 'queued'
}

function validateReceipt<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  value: unknown,
  command: ReceiptContext,
  replayed?: boolean,
): Receipt {
  if (!isRecord(value)) throw receiptError(config, command)
  const outerReplayed = receiptReplay(config, value, command, replayed)
  const metadata = receiptV2Metadata(config, value, command)
  const taskIds = value.taskIds
  if (value.version !== 1
    || value.commandId !== command.intent_id
    || value.operation !== command.operation
    || value.status !== 'queued'
    || !Array.isArray(value.entities)
    || !Array.isArray(value.artifacts)
    || !Array.isArray(taskIds)
    || !Array.isArray(value.pipelineIds)
    || !validTaskResult(value.result, command.input.workspace, taskIds)) {
    throw receiptError(config, command)
  }
  const receipt: GenerationReceiptLike = {
    version: 1,
    commandId: command.intent_id,
    operation: command.operation,
    status: 'queued',
    entities: JSON.parse(stableSerialize(value.entities)) as unknown[],
    artifacts: JSON.parse(stableSerialize(value.artifacts)) as unknown[],
    taskIds: [...taskIds] as string[],
    pipelineIds: [...value.pipelineIds] as string[],
    result: JSON.parse(stableSerialize(value.result)) as GenerationTaskResult,
    ...metadata,
  }
  if (outerReplayed !== undefined) receipt.replayed = outerReplayed
  return config.castReceipt ? config.castReceipt(receipt) : receipt as Receipt
}

function requestedContext<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  snapshot: Command,
  context: GenerationSubmissionContext | undefined,
): StoredSubmissionContext | undefined {
  try {
    return validateSubmissionContext(context)
  } catch (error) {
    throw errorFor(config, error instanceof Error ? error.message : 'The submission context is invalid', snapshot, {
      code: 'invalid_submission_context',
    })
  }
}

function assertContextMatches<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  snapshot: Command,
  stored: StoredSubmissionContext | null,
  requested: StoredSubmissionContext | undefined,
): void {
  if (stored && requested && !sameSubmissionContext(stored, requested)) {
    throw errorFor(config, `intent_id ${snapshot.intent_id} is already attributed to a different UI context`, snapshot, {
      code: 'submission_context_conflict', uncertain: true,
    })
  }
}

function preparePendingSubmission<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  snapshot: Command,
  requested: StoredSubmissionContext | undefined,
): { recovering: boolean; submissionContext?: StoredSubmissionContext } {
  let recovering = false
  try {
    const existing = readPending(config, snapshot.intent_id)
    if (existing && !sameCommand(existing, snapshot)) {
      throw errorFor(config, `intent_id ${snapshot.intent_id} is already pending with a different command`, snapshot, {
        code: 'intent_conflict',
      })
    }
    recovering = existing !== null
    if (!recovering) persistPendingContext(config, snapshot, requested)
    recovering = retainPending(config, snapshot)
    const stored = recovering ? readPendingContext(config, snapshot) : null
    assertContextMatches(config, snapshot, stored, requested)
    if (recovering && !stored && requested) persistPendingContext(config, snapshot, requested)
    return { recovering, submissionContext: stored || requested }
  } catch (error) {
    if (error instanceof GenerationCommandError) throw error
    throw errorFor(config, error instanceof Error ? error.message : `Could not persist ${config.label} command`, snapshot, {
      code: 'pending_storage_failed', uncertain: recovering,
    })
  }
}

async function presentSnapshot<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  snapshot: Command,
  recovering: boolean,
  hook: SubmitGenerationCommandOptions<Command>['onSnapshotReady'],
): Promise<void> {
  if (!hook) return
  try {
    await hook(config.detach(snapshot))
  } catch (error) {
    if (!recovering) forgetPending(config, snapshot)
    throw errorFor(config, error instanceof Error ? error.message : `${config.label} command could not be presented`, snapshot, {
      code: 'snapshot_hook_failed',
    })
  }
}

async function postCommand<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  command: Command,
  submissionContext?: StoredSubmissionContext,
): Promise<unknown> {
  let response: Response
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (submissionContext) {
      headers['X-Hocus-UI-Surface'] = submissionContext.actor === 'wizard' ? 'wizard' : 'studio'
      const context: Record<string, string> = {}
      const workflowId = contextPart(submissionContext.workflowId, 'submissionContext.workflowId')
      const runId = contextPart(submissionContext.runId, 'submissionContext.runId')
      if (workflowId !== undefined) context.workflowId = workflowId
      if (runId !== undefined) context.runId = runId
      if (Object.keys(context).length > 0) headers['X-Hocus-UI-Context'] = JSON.stringify(context)
    }
    response = await fetch(`${BASE}/api/v1/generation/commands`, {
      method: 'POST',
      headers,
      body: JSON.stringify(command),
    })
  } catch (error) {
    throw errorFor(config, error instanceof Error ? error.message : `${config.label} request failed`, command, {
      uncertain: true, code: 'transport_uncertain',
    })
  }
  if (!response.ok) throw await responseError(config, response, command)
  try {
    return await response.json()
  } catch {
    throw errorFor(config, `${config.label} response could not be decoded for ${command.intent_id}`, command, {
      status: response.status, uncertain: true, code: 'invalid_response',
    })
  }
}

function receiptCommandContext<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
  workspace: string,
): ReceiptContext {
  const fallback: ReceiptContext = {
    version: config.receiptFallbackVersion ?? 1,
    intent_id: intentId,
    operation: config.operation,
    input: { workspace },
  }
  try {
    const pending = readPending(config, intentId)
    return pending && pending.input.workspace === workspace ? pending : fallback
  } catch {
    return fallback
  }
}

async function requestReceipt<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  workspace: string,
  intentId: string,
): Promise<Response> {
  const command = { intent_id: intentId, input: { workspace } }
  try {
    const response = await fetch(`${BASE}/api/v1/generation/commands/receipt?workspace=${encodeURIComponent(workspace)}&intent_id=${encodeURIComponent(intentId)}`)
    if (!response.ok) throw await responseError(config, response, command)
    return response
  } catch (error) {
    if (error instanceof GenerationCommandError) throw error
    throw errorFor(config, error instanceof Error ? error.message : `${config.label} receipt request failed`, command, {
      uncertain: true, code: 'transport_uncertain',
    })
  }
}

async function decodeReceiptResponse<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  response: Response,
  command: ReceiptContext,
): Promise<Receipt> {
  try {
    const payload = unwrapReceipt(await response.json())
    if (payload.malformed) throw receiptError(config, command)
    return validateReceipt(config, payload.receipt, command, payload.replayed)
  } catch (error) {
    if (error instanceof GenerationCommandError) throw error
    throw errorFor(config, error instanceof Error ? error.message : `${config.label} receipt could not be verified`, command, {
      status: 200, uncertain: true, code: 'invalid_receipt',
    })
  }
}

function clearPendingReceipt<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  intentId: string,
  workspace: string,
): void {
  try {
    const pending = readPending(config, intentId)
    if (pending && pending.input.workspace === workspace) forgetPending(config, pending)
  } catch { /* A valid server receipt remains authoritative. */ }
}

function isDefinitiveClientError(error: GenerationCommandError): boolean {
  return error.status !== undefined && error.status >= 400 && error.status < 500
}

function normalizeFailure<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
  error: unknown,
  snapshot: Command,
  recovering: boolean,
): GenerationCommandError {
  const commandError = error instanceof GenerationCommandError
    ? error
    : errorFor(config, error instanceof Error ? error.message : `${config.label} command failed`, snapshot, {
      uncertain: true, code: 'unknown_failure',
    })
  if (!recovering && isDefinitiveClientError(commandError)) forgetPending(config, snapshot)
  return errorFor(config, commandError.message, snapshot, {
    status: commandError.status,
    uncertain: commandError.uncertain || recovering,
    code: commandError.code,
  })
}

export interface GenerationCommandClient<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike> {
  newIntentId: () => string
  pendingCommands: (workspace?: string) => Command[]
  pendingCommand: (intentId: string, workspace?: string) => Command | null
  submit: (command: Command, options?: SubmitGenerationCommandOptions<Command>) => Promise<Receipt>
  fetchReceipt: (workspace: string, intentId: string) => Promise<Receipt>
  subscribe: (callback: () => void) => () => void
}

export function createGenerationCommandClient<Command extends GenerationCommandLike, Receipt extends GenerationReceiptLike>(
  config: GenerationCommandClientConfig<Command, Receipt>,
): GenerationCommandClient<Command, Receipt> {
  const newIntentId = () => globalThis.crypto?.randomUUID?.()
    || `${config.operation.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const pendingCommands = (workspace?: string): Command[] => {
    const pending: Command[] = []
    const area = storage()
    for (let index = 0; index < area.length; index += 1) {
      const key = area.key(index)
      if (!key?.startsWith(config.storagePrefix)) continue
      const intentId = key.slice(config.storagePrefix.length)
      const command = readPending(config, intentId)
      if (!command || (workspace !== undefined && command.input.workspace !== workspace)) continue
      pending.push(command)
    }
    return pending.sort((left, right) => left.intent_id.localeCompare(right.intent_id))
  }

  const pendingCommand = (intentId: string, workspace?: string): Command | null => {
    const command = readPending(config, intentId)
    if (!command || (workspace !== undefined && command.input.workspace !== workspace)) return null
    return command
  }

  const submit = async (command: Command, options: SubmitGenerationCommandOptions<Command> = {}): Promise<Receipt> => {
    const snapshot = config.detach(command)
    const context = requestedContext(config, snapshot, options.submissionContext)
    const prepared = preparePendingSubmission(config, snapshot, context)
    await presentSnapshot(config, snapshot, prepared.recovering, options.onSnapshotReady)
    try {
      const envelope = unwrapReceipt(await postCommand(config, snapshot, prepared.submissionContext))
      if (envelope.malformed) throw receiptError(config, snapshot)
      const receipt = validateReceipt(config, envelope.receipt, snapshot, envelope.replayed)
      forgetPending(config, snapshot)
      return receipt
    } catch (error) {
      throw normalizeFailure(config, error, snapshot, prepared.recovering)
    }
  }

  const fetchReceipt = async (workspace: string, intentId: string): Promise<Receipt> => {
    requiredText(workspace, 'workspace', MAX_WORKSPACE_LENGTH)
    requiredText(intentId, 'intent_id', MAX_INTENT_LENGTH)
    const context = receiptCommandContext(config, intentId, workspace)
    const receipt = await decodeReceiptResponse(config, await requestReceipt(config, workspace, intentId), context)
    clearPendingReceipt(config, intentId, workspace)
    return receipt
  }

  const subscribe = (callback: () => void): (() => void) => {
    window.addEventListener(config.pendingChangedEvent, callback)
    window.addEventListener('storage', callback)
    return () => {
      window.removeEventListener(config.pendingChangedEvent, callback)
      window.removeEventListener('storage', callback)
    }
  }

  return { newIntentId, pendingCommands, pendingCommand, submit, fetchReceipt, subscribe }
}
