import { BASE } from './http'
import { stableSerialize } from '../lib/commandContract'

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

export interface ImageGenerationCommand {
  version: typeof IMAGE_GENERATION_SCHEMA_VERSION
  operation: typeof IMAGE_GENERATION_OPERATION
  intent_id: string
  input: ImageGenerationInput
}

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
}

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
const PENDING_CHANGED_EVENT = 'hocuspocus:generation-image-commands-changed'
const MAX_INTENT_LENGTH = 160
const MAX_ID_LENGTH = 240
const MAX_PROMPT_LENGTH = 200_000
const MAX_RESOLUTION_LENGTH = 128

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

function assertImageGenerationCommand(value: unknown): asserts value is ImageGenerationCommand {
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
  assertImageGenerationCommand(value)
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
    if (current && sameCommand(current, command)) storage().removeItem(key)
  } else {
    storage().setItem(key, stableSerialize(command))
  }
  notifyPendingChanged()
  return existing != null
}

export function newImageGenerationIntentId(): string {
  return globalThis.crypto?.randomUUID?.()
    || `image-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Require the caller to choose the intention; this function never invents one. */
export function createImageGenerationCommand(
  intentId: string,
  input: ImageGenerationInput,
): ImageGenerationCommand {
  return detachedCommand({
    version: IMAGE_GENERATION_SCHEMA_VERSION,
    operation: IMAGE_GENERATION_OPERATION,
    intent_id: intentId,
    input,
  })
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

type ReceiptContext = Pick<ImageGenerationCommand, 'intent_id' | 'operation'> & {
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

function validateReceipt(
  value: unknown,
  command: ReceiptContext,
  replayed?: boolean,
): ImageGenerationReceipt {
  if (!isRecord(value)) throw invalidReceipt(command)
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
    || !validTaskResult(result, command.input.workspace, taskIds)
    || ('replayed' in value && typeof value.replayed !== 'boolean')) {
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
  }
  const outerReplayed = typeof value.replayed === 'boolean' ? value.replayed : replayed
  if (outerReplayed !== undefined) receipt.replayed = outerReplayed
  return receipt
}

async function postCommand(command: ImageGenerationCommand): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${BASE}/api/v1/generation/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

/** Submit or explicitly retry the same detached envelope and intention. */
export async function submitImageGenerationCommand(
  command: ImageGenerationCommand,
): Promise<ImageGenerationReceipt> {
  const snapshot = detachedCommand(command)
  let recovering = false
  try {
    recovering = retainPending(snapshot)
  } catch (error) {
    if (error instanceof ImageGenerationCommandError) throw error
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Could not persist image generation command',
      snapshot.intent_id,
      snapshot.input.workspace,
      { code: 'pending_storage_failed' },
    )
  }

  try {
    const envelope = unwrapReceipt(await postCommand(snapshot))
    if (envelope.malformed) throw invalidReceipt(snapshot)
    const receipt = validateReceipt(envelope.receipt, snapshot, envelope.replayed)
    // A committed receipt is returned even if best-effort local cleanup fails.
    try { retainPending(snapshot, true) } catch { /* Receipt remains the recovery authority. */ }
    return receipt
  } catch (error) {
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
    if (!recovering && commandError.status !== undefined
      && commandError.status >= 400 && commandError.status < 500) {
      try { retainPending(snapshot, true) } catch { /* Best effort only. */ }
    }
    throw new ImageGenerationCommandError(
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
}

/** Query a durable receipt after a lost response; this never invents a new ID. */
export async function fetchImageGenerationCommandReceipt(
  workspace: string,
  intentId: string,
): Promise<ImageGenerationReceipt> {
  requiredText(workspace, 'workspace', MAX_ID_LENGTH)
  requiredText(intentId, 'intent_id', MAX_INTENT_LENGTH)
  let response: Response
  try {
    response = await fetch(
      `${BASE}/api/v1/generation/commands/receipt?workspace=${encodeURIComponent(workspace)}&intent_id=${encodeURIComponent(intentId)}`,
    )
  } catch (error) {
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : 'Receipt request failed',
      intentId,
      workspace,
      { uncertain: true, code: 'transport_uncertain' },
    )
  }
  if (!response.ok) {
    throw await responseError(response, intentId, workspace)
  }
  try {
    const payload = unwrapReceipt(await response.json())
    if (payload.malformed) throw invalidReceipt({
      intent_id: intentId,
      operation: IMAGE_GENERATION_OPERATION,
      input: { workspace },
    })
    const receipt = validateReceipt(payload.receipt, {
      intent_id: intentId,
      operation: IMAGE_GENERATION_OPERATION,
      input: { workspace },
    }, payload.replayed)
    // Receipt validation is authoritative. Storage read/removal is only a
    // recovery hint and must never turn a valid GET into an apparent failure.
    try {
      const pending = readPending(intentId)
      if (pending && pending.input.workspace === workspace) {
        try { retainPending(pending, true) } catch { /* Keep the receipt visible if storage cleanup is unavailable. */ }
      }
    } catch { /* Keep the valid receipt even if local recovery storage is corrupt. */ }
    return receipt
  } catch (error) {
    if (error instanceof ImageGenerationCommandError) throw error
    throw new ImageGenerationCommandError(
      error instanceof Error ? error.message : `Receipt could not be verified for ${intentId}`,
      intentId,
      workspace,
      { status: 200, uncertain: true, code: 'invalid_receipt' },
    )
  }
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
