import { stableSerialize } from '../lib/commandContract'
import {
  createGenerationCommandClient,
  GenerationCommandError,
  type GenerationReceiptLike,
  type GenerationTaskResult,
  type GenerationCommandErrorOptions,
  type SubmitGenerationCommandOptions,
} from './generationCommandClient'
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

/** The legacy image command remains supported beside the typed Studio command. */
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

export type ImageGenerationTaskResult = GenerationTaskResult

export interface ImageGenerationReceipt extends GenerationReceiptLike {
  version: typeof IMAGE_GENERATION_SCHEMA_VERSION
  operation: typeof IMAGE_GENERATION_OPERATION
  result: ImageGenerationTaskResult
}

export class ImageGenerationCommandError extends GenerationCommandError {
  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message, intentId, workspace, {
      ...options,
      code: options.code ?? 'image_generation_command_failed',
    })
    this.name = 'ImageGenerationCommandError'
  }
}

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

function detachedImageCommand(value: unknown): ImageGenerationCommand {
  if (isRecord(value) && value.version === 2) {
    assertStudioImageGenerationCommand(value)
    return detachedStudioImageGenerationCommand(value)
  }
  assertImageGenerationCommandV1(value)
  return JSON.parse(stableSerialize(value)) as ImageGenerationCommandV1
}

const imageCommandClient = createGenerationCommandClient<ImageGenerationCommand, ImageGenerationReceipt>({
  storagePrefix: 'hocuspocus.generation.image-commands.v1:',
  contextStoragePrefix: 'hocuspocus.generation.image-command-context.v1:',
  pendingChangedEvent: 'hocuspocus:generation-image-commands-changed',
  operation: IMAGE_GENERATION_OPERATION,
  label: 'Image generation',
  receiptFallbackVersion: IMAGE_GENERATION_SCHEMA_VERSION,
  detach: detachedImageCommand,
  errorClass: ImageGenerationCommandError,
  castReceipt: value => value as ImageGenerationReceipt,
})

export function createImageGenerationCommand(
  intentId: string,
  input: ImageGenerationInput,
): ImageGenerationCommandV1 {
  return detachedImageCommand({
    version: IMAGE_GENERATION_SCHEMA_VERSION,
    operation: IMAGE_GENERATION_OPERATION,
    intent_id: intentId,
    input,
  }) as ImageGenerationCommandV1
}

export const newImageGenerationIntentId = imageCommandClient.newIntentId
export const pendingImageGenerationCommands = imageCommandClient.pendingCommands
export const pendingImageGenerationCommand = imageCommandClient.pendingCommand

export type SubmitImageGenerationCommandOptions = SubmitGenerationCommandOptions<ImageGenerationCommand>

export const submitImageGenerationCommand = imageCommandClient.submit
export const fetchImageGenerationCommandReceipt = imageCommandClient.fetchReceipt
export const getImageGenerationCommandReceipt = fetchImageGenerationCommandReceipt

export function subscribeImageGenerationCommands(callback: () => void): () => void {
  return imageCommandClient.subscribe(callback)
}
