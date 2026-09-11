/**
 * Wizard capability for typed generation.video.
 *
 * This module is tested on its own. Store/applicationAdapters wiring is a
 * later integration; Wizard and MCP can still POST /api/v1/generation/commands.
 */
import { stableSerialize } from '../../lib/commandContract'
import { assertCanonicalAudioReference } from '../../lib/canonicalAudioReference'

export const VIDEO_GENERATION_OPERATION = 'generation.video' as const
export const VIDEO_GENERATION_SCHEMA_VERSION = 2 as const
export const VIDEO_MODEL_FAMILY = 'wan_t2v_2_1' as const
export const VIDEO_MODEL_TYPES = ['t2v', 't2v_1.3B'] as const
export const VIDEO_GENERATION_DEFAULTS = {
  modelType: 't2v_1.3B' as const,
  resolution: '832x480',
  videoLength: 81,
  numInferenceSteps: 30,
  guidanceScale: 5,
  seed: -1,
  fps: 16,
}

const WORKSPACE = /^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/
const RESOLUTION = /^([1-9][0-9]{1,4})x([1-9][0-9]{1,4})$/
const MAX_PROMPT = 200_000
const MAX_INTENT = 160
const COMMAND_FIELDS = new Set(['version', 'operation', 'intent_id', 'input'])
const INPUT_FIELDS = new Set(['workspace', 'workspace_collection_id', 'params'])
const PARAM_FIELDS = new Set([
  'prompt', 'negative_prompt', 'model_type', 'resolution', 'video_length',
  'num_inference_steps', 'guidance_scale', 'seed', 'image_mode', 'generation_mode',
  'repeat_generation', 'batch_size', 'activated_loras', 'loras_multipliers',
  'image_start', 'image_end', 'image_refs', 'video_guide', 'video_source',
  'video_mask', 'image_prompt_type', 'video_prompt_type', 'prompt_enhancer',
  'flow_shift', 'sample_solver', 'guidance_phases',
])

export type VideoModelType = typeof VIDEO_MODEL_TYPES[number]

export interface AgentGenerationVideoAction {
  type: 'generation_video'
  intentId: string
  workspace: string
  prompt: string
  modelType: VideoModelType
  resolution: string
  videoLength: number
  numInferenceSteps: number
  guidanceScale: number
  seed?: number
  negativePrompt?: string
  imageStart?: string | null
  workspaceCollectionId?: string
  confirm: true
}

export interface VideoGenerationCommand {
  version: typeof VIDEO_GENERATION_SCHEMA_VERSION
  operation: typeof VIDEO_GENERATION_OPERATION
  intent_id: string
  input: {
    workspace: string
    workspace_collection_id?: string
    params: Record<string, unknown>
  }
}

export interface VideoGenerationPresentation {
  destination: 'studio'
  anchors: string[]
  workspace: string
  modelType: VideoModelType
  resolution: string
  videoLength: number
  prompt: string
  imageStart?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-blank string`)
  if (value.length > maximum) throw new Error(`${field} is too long`)
  return value
}

function exactText(value: unknown, field: string, maximum: number): string {
  const text = requiredText(value, field, maximum)
  if (text !== value) throw new Error(`${field} must be exact`)
  return text
}

export function alignWanT2vFrames(frames: number): number {
  const minimum = 5
  const step = 4
  const bounded = Math.max(minimum, Math.min(10_000, Math.round(frames)))
  const delta = (bounded - minimum) % step
  if (!delta) return bounded
  if (delta >= step / 2) {
    const raised = bounded + (step - delta)
    return raised > 10_000 ? bounded - delta : raised
  }
  const lowered = bounded - delta
  return lowered < minimum ? bounded + (step - delta) : lowered
}

export function framesFromDurationSeconds(seconds: number, fps = VIDEO_GENERATION_DEFAULTS.fps): number {
  return alignWanT2vFrames(seconds * fps)
}

function modelType(value: unknown): VideoModelType | null {
  return value === 't2v' || value === 't2v_1.3B' ? value : null
}

function resolutionValue(value: unknown): string | null {
  if (typeof value !== 'string' || !RESOLUTION.test(value)) return null
  const match = RESOLUTION.exec(value)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if ([width, height].some(size => size < 64 || size > 4096 || size % 8)) return null
  return value
}

function finiteNumber(value: unknown, minimum: number, maximum: number, integer = false): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const bounded = Math.max(minimum, Math.min(maximum, value))
  return integer ? Math.round(bounded) : bounded
}

export function resolveVideoGenerationAction(raw: Record<string, unknown>): AgentGenerationVideoAction | null {
  if (raw.confirm !== true) return null
  const prompt = typeof raw.prompt === 'string' && raw.prompt.length <= MAX_PROMPT ? raw.prompt : null
  if (!prompt?.trim()) return null
  const workspace = typeof raw.workspace === 'string' && WORKSPACE.test(raw.workspace) ? raw.workspace : null
  if (!workspace) return null
  const selectedModel = raw.model_type === undefined ? VIDEO_GENERATION_DEFAULTS.modelType : modelType(raw.model_type)
  const resolution = raw.resolution === undefined
    ? VIDEO_GENERATION_DEFAULTS.resolution
    : resolutionValue(raw.resolution)
  if (!selectedModel || !resolution) return null
  const videoLength = raw.video_length === undefined
    ? (typeof raw.duration_seconds === 'number'
      ? framesFromDurationSeconds(raw.duration_seconds)
      : VIDEO_GENERATION_DEFAULTS.videoLength)
    : finiteNumber(raw.video_length, 5, 10_000, true)
  const steps = raw.num_inference_steps === undefined
    ? VIDEO_GENERATION_DEFAULTS.numInferenceSteps
    : finiteNumber(raw.num_inference_steps, 1, 1000, true)
  const guidance = raw.guidance_scale === undefined
    ? VIDEO_GENERATION_DEFAULTS.guidanceScale
    : finiteNumber(raw.guidance_scale, 0, 1000)
  if (videoLength === undefined || steps === undefined || guidance === undefined) return null
  const intentId = typeof raw.intent_id === 'string' && raw.intent_id.trim() && raw.intent_id.length <= MAX_INTENT
    ? raw.intent_id
    : null
  if (!intentId) return null
  if (raw.image_start !== undefined && raw.image_start !== null && raw.image_start !== '') {
    try {
      assertCanonicalAudioReference(raw.image_start, 'image_start', 'video')
    } catch {
      return null
    }
  }
  const collection = raw.workspace_collection_id
  if (collection !== undefined && collection !== null
    && (typeof collection !== 'string' || !collection.trim() || collection.length > 200)) {
    return null
  }
  return {
    type: 'generation_video',
    intentId,
    workspace,
    prompt,
    modelType: selectedModel,
    resolution,
    videoLength: alignWanT2vFrames(videoLength),
    numInferenceSteps: steps,
    guidanceScale: guidance,
    confirm: true,
    ...(typeof raw.seed === 'number' && Number.isSafeInteger(raw.seed) ? { seed: raw.seed } : {}),
    ...(typeof raw.negative_prompt === 'string' && raw.negative_prompt.length <= MAX_PROMPT
      ? { negativePrompt: raw.negative_prompt } : {}),
    ...(raw.image_start !== undefined ? { imageStart: raw.image_start as string | null } : {}),
    ...(typeof collection === 'string' ? { workspaceCollectionId: collection } : {}),
  }
}

export function validateVideoGenerationAction(action: AgentGenerationVideoAction): string[] {
  if (action.confirm !== true) return ['confirmation is required']
  if (!action.prompt.trim()) return ['a literal prompt is required']
  if (!WORKSPACE.test(action.workspace)) return ['an explicit output workspace is required']
  if (!VIDEO_MODEL_TYPES.includes(action.modelType)) return ['choose t2v or t2v_1.3B']
  return []
}

export function videoGenerationPresentation(action: AgentGenerationVideoAction): VideoGenerationPresentation {
  return {
    destination: 'studio',
    anchors: ['video', 'generate', 'destination'],
    workspace: action.workspace,
    modelType: action.modelType,
    resolution: action.resolution,
    videoLength: action.videoLength,
    prompt: action.prompt,
    ...(action.imageStart !== undefined ? { imageStart: action.imageStart } : {}),
  }
}

export function buildVideoGenerationCommand(action: AgentGenerationVideoAction): VideoGenerationCommand {
  const errors = validateVideoGenerationAction(action)
  if (errors.length) throw new Error(errors[0])
  const params: Record<string, unknown> = {
    prompt: action.prompt,
    model_type: action.modelType,
    resolution: action.resolution,
    video_length: action.videoLength,
    num_inference_steps: action.numInferenceSteps,
    guidance_scale: action.guidanceScale,
    generation_mode: 'video',
    image_mode: 0,
  }
  if (action.seed !== undefined) params.seed = action.seed
  if (action.negativePrompt !== undefined) params.negative_prompt = action.negativePrompt
  if (action.imageStart !== undefined) params.image_start = action.imageStart
  const input: VideoGenerationCommand['input'] = {
    workspace: action.workspace,
    params,
  }
  if (action.workspaceCollectionId !== undefined) {
    input.workspace_collection_id = action.workspaceCollectionId
  }
  const command: VideoGenerationCommand = {
    version: VIDEO_GENERATION_SCHEMA_VERSION,
    operation: VIDEO_GENERATION_OPERATION,
    intent_id: action.intentId,
    input,
  }
  return detachedVideoGenerationCommand(command)
}

export function assertVideoGenerationCommand(value: unknown): asserts value is VideoGenerationCommand {
  if (!isRecord(value)) throw new Error('generation.video command must be an object')
  for (const key of Object.keys(value)) {
    if (!COMMAND_FIELDS.has(key)) throw new Error(`command.${key} is not supported by generation.video`)
  }
  if (value.version !== VIDEO_GENERATION_SCHEMA_VERSION) throw new Error('version must be the integer 2')
  if (value.operation !== VIDEO_GENERATION_OPERATION) throw new Error('operation must be generation.video')
  exactText(value.intent_id, 'intent_id', MAX_INTENT)
  if (!isRecord(value.input)) throw new Error('input must be an object')
  for (const key of Object.keys(value.input)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`input.${key} is not supported by generation.video`)
  }
  const workspace = exactText(value.input.workspace, 'input.workspace', 240)
  if (!WORKSPACE.test(workspace)) throw new Error('input.workspace must be an exact output workspace name')
  if (!isRecord(value.input.params)) throw new Error('input.params must be an object')
  for (const key of Object.keys(value.input.params)) {
    if (!PARAM_FIELDS.has(key)) throw new Error(`input.params.${key} is not supported by generation.video`)
  }
  requiredText(value.input.params.prompt, 'input.params.prompt', MAX_PROMPT)
  if (!modelType(value.input.params.model_type)) throw new Error('input.params.model_type must be t2v or t2v_1.3B')
  if (!resolutionValue(value.input.params.resolution)) throw new Error('input.params.resolution is invalid')
  if (value.input.params.generation_mode !== undefined && value.input.params.generation_mode !== 'video') {
    throw new Error('input.params.generation_mode must be video')
  }
  if (value.input.params.image_mode !== undefined && value.input.params.image_mode !== 0) {
    throw new Error('input.params.image_mode must be 0')
  }
  if (value.input.params.image_start !== undefined) {
    assertCanonicalAudioReference(value.input.params.image_start, 'input.params.image_start', 'video')
  }
  stableSerialize(value)
}

export function detachedVideoGenerationCommand(value: unknown): VideoGenerationCommand {
  assertVideoGenerationCommand(value)
  return JSON.parse(stableSerialize(value)) as VideoGenerationCommand
}

export function mcpArgumentsFromCommand(command: VideoGenerationCommand): Record<string, unknown> {
  const { operation: _operation, ...arguments_ } = command
  return arguments_
}

export function effectiveVideoRequestsMatch(
  wizardCommand: VideoGenerationCommand,
  mcpArguments: Record<string, unknown>,
): boolean {
  return stableSerialize(mcpArgumentsFromCommand(wizardCommand)) === stableSerialize(mcpArguments)
}

export const videoGenerationCapability = {
  name: 'generation_video' as const,
  title: 'Generate Wan 2.1 Text2Video',
  description: 'Admit a typed generation.video job for an installed t2v or t2v_1.3B model in an explicit workspace.',
  useWhen: 'The user explicitly asks to generate video with the shared Wizard/MCP command.',
  parameters: [
    'intent_id', 'workspace', 'prompt', 'model_type', 'resolution', 'video_length',
    'duration_seconds', 'num_inference_steps', 'guidance_scale', 'seed',
    'negative_prompt', 'image_start', 'workspace_collection_id', 'confirm',
  ],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { const: 'generation_video' },
      intent_id: { type: 'string', minLength: 1, maxLength: 160 },
      workspace: { type: 'string', minLength: 1, maxLength: 240 },
      prompt: { type: 'string', minLength: 1, maxLength: MAX_PROMPT },
      model_type: { type: 'string', enum: [...VIDEO_MODEL_TYPES] },
      resolution: { type: 'string' },
      video_length: { type: 'integer', minimum: 5, maximum: 10_000 },
      duration_seconds: { type: 'number', exclusiveMinimum: 0 },
      num_inference_steps: { type: 'integer', minimum: 1, maximum: 1000 },
      guidance_scale: { type: 'number' },
      seed: { type: 'integer' },
      negative_prompt: { type: 'string' },
      image_start: { type: ['string', 'null'] },
      workspace_collection_id: { type: 'string', minLength: 1, maxLength: 200 },
      confirm: { const: true },
    },
    required: ['type', 'intent_id', 'workspace', 'prompt', 'confirm'],
  },
  risk: 'compute' as const,
  confirmation: 'required' as const,
  progress: 'Admitting Wan Text2Video…',
  resolve: resolveVideoGenerationAction,
  validate: validateVideoGenerationAction,
  presentation: { destination: 'studio' as const, anchors: ['video', 'generate', 'destination'], replay: 'atomic' as const },
}

export function registerVideoGenerationCapability(
  register: (definition: typeof videoGenerationCapability) => unknown,
): void {
  register(videoGenerationCapability)
}
