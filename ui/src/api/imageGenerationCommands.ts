import { BASE } from './http'
import { stableSerialize } from '../lib/commandContract'
import type { GenerationSubmissionContext } from '../features/studio/generationProvenance'
import {
  assertStudioImageGenerationCommand,
  detachedStudioImageGenerationCommand,
  type StudioImageGenerationCommand,
} from '../features/studio/generationSpec'

export {
  buildStudioImageGenerationCommand,
  createStudioImageGenerationCommand,
} from '../features/studio/generationSpec'
export type {
  StudioImageGenerationCommand,
  StudioImageGenerationFullParams,
  StudioImageGenerationInput,
  StudioImageParams,
} from '../features/studio/generationSpec'

/** The first shared generation vertical deliberately exposes image only. */
export const IMAGE_GENERATION_OPERATION = 'generation.image' as const
export const IMAGE_GENERATION_SCHEMA_VERSION = 1 as const

export interface ImageGenerationInput {
  workspace: string
  model_type: string
  prompt: string
  negative_prompt?: string
  resolution: string
  num_inference_steps: number
  seed: number
  guidance_scale: number
  image_mode?: 1
  video_length?: 1
}

export interface ImageGenerationCommandV1 {
  version: typeof IMAGE_GENERATION_SCHEMA_VERSION
  operation: typeof IMAGE_GENERATION_OPERATION
  intent_id: string
  input: ImageGenerationInput
}

export type ImageGenerationCommandV2 = StudioImageGenerationCommand
export type ImageGenerationCommand = ImageGenerationCommandV1 | ImageGenerationCommandV2

export interface ImageGenerationTaskResult {
  job_id: string
  task_id: string
  workspace: string
  status: 'queued'
  root_task_id?: string | null
}

export interface ImageGenerationReceipt {
  version: typeof IMAGE_GENERATION_SCHEMA_VERSION
  commandId: string
  operation: typeof IMAGE_GENERATION_OPERATION
  status: 'queued'
  entities: unknown[]
  artifacts: unknown[]
  taskIds: string[]
  pipelineIds: string[]
  result: ImageGenerationTaskResult
  replayed?: boolean
  commandVersion?: 2
  contentFingerprint?: string
  fingerprintVersion?: 2
}

/**
 * Recovery metadata is deliberately smaller than the caller context. It is
 * stored beside the immutable command hint and only drives declared UI
 * attribution headers; it is never part of the command or its fingerprint.
 */
type StoredSubmissionContext = Pick<GenerationSubmissionContext, 'actor' | 'workflowId' | 'runId'>

export class ImageGenerationCommandError extends Error {
  readonly intentId: string
  readonly workspace: string
  readonly status?: number
  readonly uncertain: boolean
  readonly code: string

  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: { status?: number; uncertain?: boolean; code?: string } = {},
  ) {
    super(message)
    this.name = 'ImageGenerationCommandError'
    this.intentId = intentId
    this.workspace = workspace
    this.status = options.status
    this.uncertain = options.uncertain ?? false
    this.code = options.code ?? 'image_generation_command_failed'
  }
}

const PENDING_KEY_PREFIX = 'hocuspocus.generation.image-commands.v1:'
const PENDING_CONTEXT_KEY_PREFIX = 'hocuspocus.generation.image-command-context.v1:'
const PENDING_CHANGED_EVENT = 'hocuspocus:generation-image-commands-changed'
const MAX_INTENT_LENGTH = 160
const MAX_ID_LENGTH = 240
const MAX_PROMPT_LENGTH = 200_000
const MAX_RESOLUTION_LENGTH = 128
const MAX_SUBMISSION_CONTEXT_ID_LENGTH = 200
const SUBMISSION_ACTORS = new Set(['user', 'wizard', 'system', 'unknown'])

const INPUT_FIELDS = new Set([
  'workspace',
  'model_type',
  'prompt',
  'negative_prompt',
  'resolution',
  'num_inference_steps',
  'seed',
  'guidance_scale',
  'image_mode',
  'video_length',
])

const COMMAND_FIELDS = new Set(['version', 'operation', 'intent_id', 'input'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-blank string`)
  }
  if (value.length > maximum) throw new Error(`${field} is too long`)
  return value
}

function strictInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer in range`)
  }
  return value
}

function strictFiniteNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be a finite number in range`)
  }
  return value
}

function assertImageSelectors(value: Record<string, unknown>): void {
  for (const selector of ['image_mode', 'video_length'] as const) {
    if (selector in value && value[selector] !== 1) {
      throw new Error(`input.${selector} must be the image value 1`)
    }
  }
}

function assertImageGenerationInput(value: unknown): asserts value is ImageGenerationInput {
  if (!isRecord(value)) throw new Error('input must be an object')
  for (const key of Object.keys(value)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`input.${key} is not supported by generation.image`)
  }
  const workspace = requiredText(value.workspace, 'input.workspace', MAX_ID_LENGTH)
  if (!/^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/.test(workspace)) {
    throw new Error('input.workspace must be an exact output workspace name')
  }
  requiredText(value.model_type, 'input.model_type', MAX_ID_LENGTH)
  requiredText(value.prompt, 'input.prompt', MAX_PROMPT_LENGTH)
  if ('negative_prompt' in value && typeof value.negative_prompt !== 'string') {
    throw new Error('input.negative_prompt must be a string')
  }
  if (typeof value.negative_prompt === 'string' && value.negative_prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('input.negative_prompt is too long')
  }
  requiredText(value.resolution, 'input.resolution', MAX_RESOLUTION_LENGTH)
  strictInteger(value.num_inference_steps, 'input.num_inference_steps', 1, 1000)
  strictInteger(value.seed, 'input.seed', -(2 ** 63), 2 ** 63 - 1)
  strictFiniteNumber(value.guidance_scale, 'input.guidance_scale', 0, 1000)
  assertImageSelectors(value)
}

export function assertImageGenerationCommandV1(value: unknown): asserts value is ImageGenerationCommandV1 {
  if (!isRecord(value)) throw new Error('image generation command must be an object')
  for (const key of Object.keys(value)) {
    if (!COMMAND_FIELDS.has(key)) throw new Error(`command.${key} is not supported by generation.image`)
  }
  if (value.version !== IMAGE_GENERATION_SCHEMA_VERSION) throw new Error('version must be the integer 1')
  if (value.operation !== IMAGE_GENERATION_OPERATION) throw new Error('operation must be generation.image')
  requiredText(value.intent_id, 'intent_id', MAX_INTENT_LENGTH)
  assertImageGenerationInput(value.input)
}

function detachedCommand(value: unknown): ImageGenerationCommand {
  if (isRecord(value) && value.version === 2) {
    assertStudioImageGenerationCommand(value)
    return detachedStudioImageGenerationCommand(value)
  }
  assertImageGenerationCommandV1(value)
  // stableSerialize validates the JSON boundary and gives the retry an
  // immutable value-level snapshot. It never adds native defaults to input.
  return JSON.parse(stableSerialize(value)) as ImageGenerationCommand
}

function storage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('localStorage is unavailable; command admission cannot be made safely')
  }
  return globalThis.localStorage
}

function notifyPendingChanged(): void {
  if (typeof window === 'undefined' || typeof Event === 'undefined') return
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT))
}

function pendingKey(intentId: string): string {
  return PENDING_KEY_PREFIX + intentId
}

function invalidStoredCommand(intentId: string): ImageGenerationCommandError {
  return new ImageGenerationCommandError(
    `Stored image generation command ${intentId} is invalid`,
    intentId,
    '',
    { code: 'invalid_pending_command' },
  )
}

function readPending(intentId: string): ImageGenerationCommand | null {
  const raw = storage().getItem(pendingKey(intentId))
  if (raw == null) return null
  try {
    const value: unknown = JSON.parse(raw)
    const command = detachedCommand(value)
    if (command.intent_id !== intentId) throw new Error('intent_id does not match storage key')
    return command
  } catch {
    throw invalidStoredCommand(intentId)
  }
}

const STORED_CONTEXT_ENVELOPE_FIELDS = new Set(['version', 'intent_id', 'workspace', 'context'])
const STORED_CONTEXT_FIELDS = new Set(['actor', 'workflowId', 'runId'])

function pendingContextKey(intentId: string): string {
  return PENDING_CONTEXT_KEY_PREFIX + intentId
}

function invalidStoredContext(intentId: string): ImageGenerationCommandError {
  return new ImageGenerationCommandError(
    `Stored image generation context ${intentId} is invalid`,
    intentId,
    '',
    { code: 'invalid_pending_context' },
  )
}

function normalizeStoredSubmissionContext(value: unknown): StoredSubmissionContext {
  if (!isRecord(value)) throw new Error('context must be an object')
  for (const key of Object.keys(value)) {
    if (!STORED_CONTEXT_FIELDS.has(key)) throw new Error('context contains an unsupported field')
  }
  if (typeof value.actor !== 'string' || !SUBMISSION_ACTORS.has(value.actor)) {
    throw new Error('context.actor is invalid')
  }
  const workflowId = submissionContextPart(value.workflowId, 'context.workflowId')
  const runId = submissionContextPart(value.runId, 'context.runId')
  return {
    actor: value.actor as StoredSubmissionContext['actor'],
    ...(workflowId !== undefined ? { workflowId } : {}),
    ...(runId !== undefined ? { runId } : {}),
  }
}

function readPendingContext(command: ImageGenerationCommand): StoredSubmissionContext | null {
  const raw = storage().getItem(pendingContextKey(command.intent_id))
  if (raw == null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)
      || Object.keys(value).some(key => !STORED_CONTEXT_ENVELOPE_FIELDS.has(key))
      || value.version !== 1
      || value.intent_id !== command.intent_id
      || value.workspace !== command.input.workspace) {
      throw new Error('context envelope does not match its command')
    }
    return normalizeStoredSubmissionContext(value.context)
  } catch {
    throw invalidStoredContext(command.intent_id)
  }
}

function persistPendingContext(
  command: ImageGenerationCommand,
  context: StoredSubmissionContext | undefined,
): void {
  const key = pendingContextKey(command.intent_id)
  if (!context) {
    // Avoid turning a no-op cleanup into a storage failure. This also keeps
    // the legacy command-only path compatible with callers whose storage
    // implementation rejects removeItem even when the key is absent.
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

function sameSubmissionContext(
  left: StoredSubmissionContext,
  right: StoredSubmissionContext,
): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function sameCommand(left: ImageGenerationCommand, right: ImageGenerationCommand): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function retainPending(command: ImageGenerationCommand, done = false): boolean {
  const existing = readPending(command.intent_id)
  if (existing && !sameCommand(existing, command)) {
    throw new ImageGenerationCommandError(
      `intent_id ${command.intent_id} is already pending with a different command`,
      command.intent_id,
      command.input.workspace,
      { code: 'intent_conflict' },
    )
  }
  const key = pendingKey(command.intent_id)
  if (done) {
    // A different tab may have replaced the value. Never erase that command
    // while cleaning up a receipt for this one.
    const current = readPending(command.intent_id)
    if (current && sameCommand(current, command)) {
      // Clear the sidecar first. If storage cleanup fails, retain the command
      // hint so a confirmed result remains recoverable as before this sidecar
      // existed.
      persistPendingContext(command, undefined)
      storage().removeItem(key)
    } else if (!current) {
      // The command may already have been removed by another tab after its
      // receipt was confirmed. Its context key is still scoped by intent and
      // can be cleaned without touching a replacement command.
      persistPendingContext(command, undefined)
    }
  } else {
    storage().setItem(key, stableSerialize(command))
  }
  notifyPendingChanged()
  return existing != null
}

function forgetPending(command: ImageGenerationCommand): void {
  try { retainPending(command, true) } catch { /* A cleanup failure must not hide a confirmed server result. */ }
}

export function newImageGenerationIntentId(): string {
  return globalThis.crypto?.randomUUID?.()
    || `image-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Require the caller to choose the intention; this function never invents one. */
export function createImageGenerationCommand(
  intentId: string,
  input: ImageGenerationInput,
): ImageGenerationCommandV1 {
  return detachedCommand({
    version: IMAGE_GENERATION_SCHEMA_VERSION,
    operation: IMAGE_GENERATION_OPERATION,
    intent_id: intentId,
    input,
  }) as ImageGenerationCommandV1
}

export function pendingImageGenerationCommands(workspace?: string): ImageGenerationCommand[] {
  const pending: ImageGenerationCommand[] = []
  const area = storage()
  for (let index = 0; index < area.length; index += 1) {
    const key = area.key(index)
    if (!key?.startsWith(PENDING_KEY_PREFIX)) continue
    const intentId = key.slice(PENDING_KEY_PREFIX.length)
    const command = readPending(intentId)
    if (!command || (workspace !== undefined && command.input.workspace !== workspace)) continue
    pending.push(command)
  }
  return pending.sort((left, right) => left.intent_id.localeCompare(right.intent_id))
}

export function pendingImageGenerationCommand(
  intentId: string,
  workspace?: string,
): ImageGenerationCommand | null {
  const command = readPending(intentId)
  if (!command || (workspace !== undefined && command.input.workspace !== workspace)) return null
  return command
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

async function responseError(
  response: Response,
  intentId: string,
  workspace: string,
): Promise<ImageGenerationCommandError> {
  const payload = await response.json().catch(() => undefined)
  return new ImageGenerationCommandError(
    errorDetail(payload) || `Image generation command failed (${response.status})`,
    intentId,
    workspace,
    { status: response.status, uncertain: response.status >= 500, code: 'http_error' },
  )
}

interface ReceiptEnvelope {
  receipt: unknown
  replayed?: boolean
  malformed?: boolean
}

function unwrapReceipt(value: unknown): ReceiptEnvelope {
  if (isRecord(value) && 'receipt' in value) {
    if ('replayed' in value && typeof value.replayed !== 'boolean') {
      return { receipt: value.receipt, malformed: true }
    }
    return {
      receipt: value.receipt,
      replayed: typeof value.replayed === 'boolean' ? value.replayed : undefined,
    }
  }
  return { receipt: value }
}

type ReceiptContext = Pick<ImageGenerationCommand, 'intent_id' | 'operation' | 'version'> & {
  input: Pick<ImageGenerationInput, 'workspace'>
}

function invalidReceipt(command: ReceiptContext, message = 'Receipt could not be verified'): ImageGenerationCommandError {
  return new ImageGenerationCommandError(
    `${message} for ${command.intent_id}`,
    command.intent_id,
    command.input.workspace,
    { status: 200, uncertain: true, code: 'invalid_receipt' },
  )
}

function validTaskResult(value: unknown, workspace: string, taskIds: unknown[]): value is ImageGenerationTaskResult {
  return isRecord(value)
    && typeof value.job_id === 'string' && value.job_id.length > 0
    && typeof value.task_id === 'string' && value.task_id.length > 0
    && taskIds.length === 1 && taskIds[0] === value.task_id
    && value.workspace === workspace && value.status === 'queued'
}

function receiptReplay(value: Record<string, unknown>, command: ReceiptContext, fallback?: boolean): boolean | undefined {
  if ('replayed' in value && typeof value.replayed !== 'boolean') throw invalidReceipt(command)
  return typeof value.replayed === 'boolean' ? value.replayed : fallback
}

function receiptV2Metadata(value: Record<string, unknown>, command: ReceiptContext): {
  commandVersion?: 2
  contentFingerprint?: string
  fingerprintVersion?: 2
} {
  const metadataFields = ['commandVersion', 'contentFingerprint', 'fingerprintVersion'] as const
  const present = metadataFields.filter(field => field in value)
  // A receipt is either the complete v1 shape or the complete v2 shape. A
  // half-present fingerprint must never be treated as a legacy receipt.
  if (present.length !== 0 && present.length !== metadataFields.length) {
    throw invalidReceipt(command, 'Receipt fingerprint metadata is incomplete')
  }
  if (present.length === 0) {
    if (command.version === 2) {
      throw invalidReceipt(command, 'The v2 receipt is missing its content fingerprint')
    }
    return {}
  }
  if (value.commandVersion !== 2 || value.fingerprintVersion !== 2
    || typeof value.contentFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.contentFingerprint)) {
    throw invalidReceipt(command, 'Receipt fingerprint metadata is invalid')
  }
  return {
    commandVersion: 2,
    contentFingerprint: value.contentFingerprint,
    fingerprintVersion: 2,
  }
}

function validateReceipt(
  value: unknown,
  command: ReceiptContext,
  replayed?: boolean,
): ImageGenerationReceipt {
  if (!isRecord(value)) throw invalidReceipt(command)
  const outerReplayed = receiptReplay(value, command, replayed)
  const v2Metadata = receiptV2Metadata(value, command)
  const result = value.result
  const taskIds = value.taskIds
  if (value.version !== IMAGE_GENERATION_SCHEMA_VERSION
    || value.commandId !== command.intent_id
    || value.operation !== command.operation
    || value.status !== 'queued'
    || !Array.isArray(value.entities)
    || !Array.isArray(value.artifacts)
    || !Array.isArray(taskIds)
    || !Array.isArray(value.pipelineIds)
    || !validTaskResult(result, command.input.workspace, taskIds)) {
    throw invalidReceipt(command)
  }
  const receipt: ImageGenerationReceipt = {
    version: IMAGE_GENERATION_SCHEMA_VERSION,
    commandId: command.intent_id,
    operation: IMAGE_GENERATION_OPERATION,
    status: 'queued',
    entities: JSON.parse(stableSerialize(value.entities)) as unknown[],
    artifacts: JSON.parse(stableSerialize(value.artifacts)) as unknown[],
    taskIds: [...taskIds] as string[],
    pipelineIds: [...value.pipelineIds] as string[],
    result: JSON.parse(stableSerialize(result)) as ImageGenerationTaskResult,
    ...v2Metadata,
  }
  if (outerReplayed !== undefined) receipt.replayed = outerReplayed
  return receipt
}

function submissionContextPart(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value
    || value.length > MAX_SUBMISSION_CONTEXT_ID_LENGTH) {
    throw new Error(field + ' must be an exact non-blank string of at most 200 characters')
  }
  return value
}

function validateSubmissionContext(
  context: GenerationSubmissionContext | undefined,
): StoredSubmissionContext | undefined {
  if (!context) return undefined
  if (!SUBMISSION_ACTORS.has(context.actor)) {
    throw new Error('submissionContext.actor must be a known actor')
  }
  const workflowId = submissionContextPart(context.workflowId, 'submissionContext.workflowId')
  const runId = submissionContextPart(context.runId, 'submissionContext.runId')
  return {
    actor: context.actor,
    ...(workflowId !== undefined ? { workflowId } : {}),
    ...(runId !== undefined ? { runId } : {}),
  }
}

async function postCommand(
  command: ImageGenerationCommand,
  submissionContext?: StoredSubmissionContext,
): Promise<unknown> {
  let response: Response
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (submissionContext) {
      headers['X-Hocus-UI-Surface'] = submissionContext.actor === 'wizard' ? 'wizard' : 'studio'
      const context: Record<string, string> = {}
      const workflowId = submissionContextPart(submissionContext.workflowId, 'submissionContext.workflowId')
      const runId = submissionContextPart(submissionContext.runId, 'submissionContext.runId')
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
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Image generation request failed',
      command.intent_id,
      command.input.workspace,
      { uncertain: true, code: 'transport_uncertain' },
    )
  }
  if (!response.ok) {
    throw await responseError(response, command.intent_id, command.input.workspace)
  }
  try {
    return await response.json()
  } catch {
    throw new ImageGenerationCommandError(
      `Image generation response could not be decoded for ${command.intent_id}`,
      command.intent_id,
      command.input.workspace,
      { status: response.status, uncertain: true, code: 'invalid_response' },
    )
  }
}

export interface SubmitImageGenerationCommandOptions {
  /**
   * A declared UI surface is transport metadata, never part of the command
   * snapshot and never an authorization decision.
   */
  submissionContext?: GenerationSubmissionContext
  /**
   * Runs after the pending hint is durable and before POST. The callback gets
   * a detached copy so it cannot mutate the retry or transport snapshot.
   */
  onSnapshotReady?: (snapshot: ImageGenerationCommand) => void | Promise<void>
}

interface PreparedSubmission {
  recovering: boolean
  submissionContext?: StoredSubmissionContext
}

function requestedContext(
  snapshot: ImageGenerationCommand,
  context: GenerationSubmissionContext | undefined,
): StoredSubmissionContext | undefined {
  try {
    return validateSubmissionContext(context)
  } catch (error) {
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'The submission context is invalid',
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'invalid_submission_context' },
    )
  }
}

function assertContextMatches(
  snapshot: ImageGenerationCommand,
  stored: StoredSubmissionContext | null,
  requested: StoredSubmissionContext | undefined,
): void {
  if (stored && requested && !sameSubmissionContext(stored, requested)) {
    throw new ImageGenerationCommandError(
      `intent_id ${snapshot.intent_id} is already attributed to a different UI context`,
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'submission_context_conflict', uncertain: true },
    )
  }
}

function assertPendingCommandMatches(
  snapshot: ImageGenerationCommand,
  existing: ImageGenerationCommand | null,
): void {
  if (existing && !sameCommand(existing, snapshot)) {
    throw new ImageGenerationCommandError(
      `intent_id ${snapshot.intent_id} is already pending with a different command`,
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'intent_conflict' },
    )
  }
}

function prepareNewPendingContext(
  snapshot: ImageGenerationCommand,
  requested: StoredSubmissionContext | undefined,
): void {
  // A sidecar is written before its command hint. If this write fails, no
  // recoverable command is left behind to suggest an admitted request.
  // Clearing an orphan is strict for the same reason: a stale attribution
  // must not be paired with a newly written command.
  persistPendingContext(snapshot, requested)
}

function persistMissingRecoveryContext(
  snapshot: ImageGenerationCommand,
  recovering: boolean,
  stored: StoredSubmissionContext | null,
  requested: StoredSubmissionContext | undefined,
): StoredSubmissionContext | undefined {
  const submissionContext = stored || requested
  if (recovering && !stored && requested) {
    persistPendingContext(snapshot, requested)
  }
  return submissionContext
}

function preparePendingSubmission(
  snapshot: ImageGenerationCommand,
  requested: StoredSubmissionContext | undefined,
): PreparedSubmission {
  let recovering = false
  try {
    const existing = readPending(snapshot.intent_id)
    assertPendingCommandMatches(snapshot, existing)
    recovering = existing !== null
    if (!recovering) prepareNewPendingContext(snapshot, requested)
    recovering = retainPending(snapshot)
    const stored = recovering ? readPendingContext(snapshot) : null
    assertContextMatches(snapshot, stored, requested)
    return {
      recovering,
      submissionContext: persistMissingRecoveryContext(snapshot, recovering, stored, requested),
    }
  } catch (error) {
    if (error instanceof ImageGenerationCommandError) throw error
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Could not persist image generation command',
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'pending_storage_failed', uncertain: recovering },
    )
  }
}

async function presentSnapshot(
  snapshot: ImageGenerationCommand,
  recovering: boolean,
  hook: SubmitImageGenerationCommandOptions['onSnapshotReady'],
): Promise<void> {
  if (!hook) return
  try {
    await hook(detachedCommand(snapshot))
  } catch (error) {
    // A hook failure happens before network admission and is therefore
    // certain. Preserve an older recovery hint because it may represent a
    // previously admitted request whose response was lost.
    if (!recovering) forgetPending(snapshot)
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'The image command snapshot could not be presented',
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'snapshot_hook_failed' },
    )
  }
}

async function admitImageCommand(
  snapshot: ImageGenerationCommand,
  submissionContext: StoredSubmissionContext | undefined,
): Promise<ImageGenerationReceipt> {
  const envelope = unwrapReceipt(await postCommand(snapshot, submissionContext))
  if (envelope.malformed) throw invalidReceipt(snapshot)
  const receipt = validateReceipt(envelope.receipt, snapshot, envelope.replayed)
  // A committed receipt is returned even if best-effort local cleanup fails.
  forgetPending(snapshot)
  return receipt
}

function isDefinitiveClientError(error: ImageGenerationCommandError): boolean {
  return error.status !== undefined && error.status >= 400 && error.status < 500
}

function normalizeSubmissionFailure(
  error: unknown,
  snapshot: ImageGenerationCommand,
  recovering: boolean,
): ImageGenerationCommandError {
  const commandError = error instanceof ImageGenerationCommandError
    ? error
    : new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Image generation command failed',
      snapshot.intent_id,
      snapshot.input.workspace,
      { uncertain: true, code: 'unknown_failure' },
    )
  // A first, explicit 4xx response is definitive before admission. Once a
  // pending hint exists, a later rejection may follow an admitted request;
  // preserve it, including a 401 after a timeout or lost response.
  if (!recovering && isDefinitiveClientError(commandError)) forgetPending(snapshot)
  return new ImageGenerationCommandError(
    commandError.message,
    snapshot.intent_id,
    snapshot.input.workspace,
    {
      status: commandError.status,
      uncertain: commandError.uncertain || recovering,
      code: commandError.code,
    },
  )
}

/** Submit or explicitly retry the same detached envelope and intention. */
export async function submitImageGenerationCommand(
  command: ImageGenerationCommand,
  options: SubmitImageGenerationCommandOptions = {},
): Promise<ImageGenerationReceipt> {
  const snapshot = detachedCommand(command)
  const requestedSubmissionContext = requestedContext(snapshot, options.submissionContext)
  const prepared = preparePendingSubmission(snapshot, requestedSubmissionContext)

  await presentSnapshot(snapshot, prepared.recovering, options.onSnapshotReady)
  try {
    return await admitImageCommand(snapshot, prepared.submissionContext)
  } catch (error) {
    throw normalizeSubmissionFailure(error, snapshot, prepared.recovering)
  }
}

function receiptCommandContext(intentId: string, workspace: string): ReceiptContext {
  const fallback: ReceiptContext = {
    version: 1,
    intent_id: intentId,
    operation: IMAGE_GENERATION_OPERATION,
    input: { workspace },
  }
  try {
    const pending = readPending(intentId)
    return pending && pending.input.workspace === workspace ? pending : fallback
  } catch {
    // A receipt read must remain available when local recovery storage is damaged.
    return fallback
  }
}

async function requestReceipt(workspace: string, intentId: string): Promise<Response> {
  try {
    const response = await fetch(
      `${BASE}/api/v1/generation/commands/receipt?workspace=${encodeURIComponent(workspace)}&intent_id=${encodeURIComponent(intentId)}`,
    )
    if (!response.ok) throw await responseError(response, intentId, workspace)
    return response
  } catch (error) {
    if (error instanceof ImageGenerationCommandError) throw error
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Receipt request failed',
      intentId,
      workspace,
      { uncertain: true, code: 'transport_uncertain' },
    )
  }
}

async function decodeReceiptResponse(
  response: Response,
  command: ReceiptContext,
): Promise<ImageGenerationReceipt> {
  try {
    const payload = unwrapReceipt(await response.json())
    if (payload.malformed) throw invalidReceipt(command)
    return validateReceipt(payload.receipt, command, payload.replayed)
  } catch (error) {
    if (error instanceof ImageGenerationCommandError) throw error
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : `Receipt could not be verified for ${command.intent_id}`,
      command.intent_id,
      command.input.workspace,
      { status: 200, uncertain: true, code: 'invalid_receipt' },
    )
  }
}

function clearReceiptPending(intentId: string, workspace: string): void {
  try {
    const pending = readPending(intentId)
    if (pending && pending.input.workspace === workspace) clearPendingReceipt(pending)
  } catch { /* Keep the valid receipt even if local recovery storage is corrupt. */ }
}

function clearPendingReceipt(command: ImageGenerationCommand): void {
  try { retainPending(command, true) } catch { /* Keep the receipt visible if storage cleanup is unavailable. */ }
}

/** Query a durable receipt after a lost response; this never invents a new ID. */
export async function fetchImageGenerationCommandReceipt(
  workspace: string,
  intentId: string,
): Promise<ImageGenerationReceipt> {
  requiredText(workspace, 'workspace', MAX_ID_LENGTH)
  requiredText(intentId, 'intent_id', MAX_INTENT_LENGTH)
  // A receipt query has no command envelope of its own. When the durable hint
  // is present, use its version so a lost v2 response cannot be accepted as a
  // legacy v1 receipt. If the hint is unavailable, the endpoint remains a
  // legacy-compatible read and the server's receipt metadata is still
  // validated when it is present.
  const receiptCommand = receiptCommandContext(intentId, workspace)
  const response = await requestReceipt(workspace, intentId)
  const receipt = await decodeReceiptResponse(response, receiptCommand)
  // Receipt validation is authoritative. Storage read/removal is only a
  // recovery hint and must never turn a valid GET into an apparent failure.
  clearReceiptPending(intentId, workspace)
  return receipt
}

export const getImageGenerationCommandReceipt = fetchImageGenerationCommandReceipt

export function subscribeImageGenerationCommands(callback: () => void): () => void {
  window.addEventListener(PENDING_CHANGED_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(PENDING_CHANGED_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}
