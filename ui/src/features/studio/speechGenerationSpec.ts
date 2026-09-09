import { stableSerialize } from '../../lib/commandContract'
import speechCommandCatalog from '../../api/speechCommandCatalog.json'

export const STUDIO_SPEECH_SCHEMA_VERSION = 2 as const
export const STUDIO_SPEECH_OPERATION = 'generation.speech' as const

type CatalogRecord = Record<string, unknown>
type SpeechSchema = CatalogRecord & {
  anyOf?: unknown[]
  properties?: CatalogRecord
  required?: string[]
  additionalProperties?: boolean
  $defs?: CatalogRecord
  $ref?: string
  const?: unknown
  enum?: unknown[]
  type?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  items?: unknown
}

const studioCatalog = speechCommandCatalog.studio as unknown as CatalogRecord
const inputSchema = studioCatalog.input as SpeechSchema
const paramsSchema = (inputSchema.$defs?.StudioSpeechParams || {}) as SpeechSchema

/**
 * The generated catalog is the sole source of the speech parameter allowlist.
 * Keeping the key type derived from its JSON object also makes adding a native
 * field a catalog change instead of a second hand-maintained client schema.
 */
export type StudioSpeechParamKey = keyof typeof speechCommandCatalog.studio.input.$defs.StudioSpeechParams.properties
export type StudioSpeechParams = Partial<Record<StudioSpeechParamKey, unknown>>
export type StudioSpeechGenerationFullParams = StudioSpeechParams & {
  workspace: string
  provenance?: unknown
}

export interface StudioSpeechGenerationInput {
  workspace: string
  workspace_collection_id?: string | null
  params: StudioSpeechParams
}

export interface StudioSpeechGenerationCommand {
  version: typeof STUDIO_SPEECH_SCHEMA_VERSION
  operation: typeof STUDIO_SPEECH_OPERATION
  intent_id: string
  input: StudioSpeechGenerationInput
}

export const STUDIO_SPEECH_PARAM_KEYS: readonly StudioSpeechParamKey[] =
  studioCatalog.supported_input_fields as StudioSpeechParamKey[]
export const STUDIO_SPEECH_PARAM_CATALOG: ReadonlySet<string> = new Set(
  STUDIO_SPEECH_PARAM_KEYS as readonly string[],
)

/**
 * Fields which can remain in the shared Studio form after Load Settings or a
 * reroll has restored a video/H3 sidecar.  They are deliberately listed
 * rather than matched by a prefix: a form projection may remove these known
 * UI-only leftovers, while the command builder below must continue to reject
 * an unknown key supplied directly by a Wizard/MCP caller.
 *
 * Values for fields in the speech catalog are never removed here, including
 * explicit inactive sentinels.  The native speech schema remains responsible
 * for rejecting an active image/video/H3 value that is invalid for speech.
 */
export const STUDIO_SPEECH_FORM_RESIDUAL_FIELDS = [
  // Shared video/image controls restored into the common Studio params map.
  'viggle_audio_mode',
  'switch_threshold',
  'denoising_strength',
  'video_guide_outpainting',
  'sliding_window_size',
  'sliding_window_overlap',
  'sliding_window_memory_override',
  'sliding_window_discard_last_frames',
  'sliding_window_color_correction_strength',
  'sliding_window_overlap_noise',
  'keep_frames_video_source',
  'keep_frames_video_guide',
  'force_fps',
  'skip_steps_cache_type',
  'skip_steps_multiplier',
  'skip_steps_start_step_perc',
  'video_prompt_type',
  'image_prompt_type',
  'input_video_strength',
  'preserve_source_style',
  'image_fit_mode',
  'frames_positions',
  'injection_strength',
  'remove_background_images_ref',
  'self_refiner_setting',
  'per_clip_frames',
  'per_clip_keyframes',
  // H3 video policy and window controls. Reference lists themselves are
  // catalogued inactive fields and therefore remain subject to schema checks.
  'h3_audio_shift',
  'h3_audio_prompt',
  'h3_ref_image_size',
  'h3_reference_mode',
  'h3_model_profile',
  'minimax_h3_reference_detail',
  'minimax_h3_text_encoder',
  'minimax_h3_turbo_preset',
  'minimax_h3_planning_style',
  'minimax_h3_audio_policy',
  'minimax_h3_reference_sequence',
  'minimax_h3_semantic_bridge_alpha',
  'minimax_h3_semantic_bridge_magnitude',
  'minimax_h3_multi_window',
  'h3_reference_context',
  'minimax_h3_window_storyboard',
  'h3_window_prompts',
  'h3_window_plan_signature',
  'h3_window_plan',
  // Restored advanced pipeline toggles and model-specific controls.
  'stage2_steps',
  'progressive_pipeline',
  'single_stage_pipeline',
  'reference_pipeline',
  'progressive_stage1_image_weight',
  'progressive_stage2_steps',
  'progressive_stage2_sigma',
  'progressive_stage3_steps',
  'progressive_stage3_sigma',
  'progressive_stage3_image_weight',
  'stg_scale',
  'perturbation_switch',
  'perturbation_layers',
  'perturbation_start_perc',
  'perturbation_end_perc',
  'cfg_rescale',
  'modality_scale',
  'use_gradient_estimation',
  'ge_gamma',
  'ge_alpha',
  'keyframe_conditioning_mode',
  'keyframe_inject_mode',
  'override_attention',
  'attention_sparsity',
  // Other known form/sidecar controls from non-speech modes.
  'batch_size',
  'tts_voice_count',
  'voice_clone_enabled',
  'voice_clone_mode',
  'voice_clone_refs',
  'voice_reference',
  'identity_guidance_scale',
  'speakers_locations',
  'video_guide2',
  'sfx_mode',
  '_sfx_virtual_model',
  '_mmaudio_variant',
  '_music_description',
  '_music_instrumental',
  'edit_sub_mode',
] as const

const STUDIO_SPEECH_FORM_RESIDUAL_SET: ReadonlySet<string> = new Set(
  STUDIO_SPEECH_FORM_RESIDUAL_FIELDS,
)

export interface StudioSpeechFormProjection {
  params: Record<string, unknown>
  droppedFields: string[]
}

/**
 * Project the complete in-memory Studio form into the Speech command input.
 *
 * This is intentionally a caller-side adapter, not a relaxation of the
 * closed command contract. Direct builders still reject every unrecognised
 * key, including a key which merely resembles one of the residual fields.
 */
export function projectStudioSpeechFormParams(
  fullParams: Record<string, unknown>,
): StudioSpeechFormProjection {
  if (!isRecord(fullParams)) throw new Error('Studio speech parameters must be an object')
  const params: Record<string, unknown> = {}
  const droppedFields: string[] = []
  for (const [key, value] of Object.entries(fullParams)) {
    if (value === undefined) continue
    if (key === 'workspace' || DECLARED_METADATA_FIELDS.has(key)) {
      params[key] = value
      continue
    }
    if (ENVELOPE_INJECTION_FIELDS.has(key)) {
      throw new Error('workspace parameters cannot contain envelope field ' + key)
    }
    if (STUDIO_SPEECH_PARAM_CATALOG.has(key)) {
      params[key] = value
      continue
    }
    if (STUDIO_SPEECH_FORM_RESIDUAL_SET.has(key)) {
      droppedFields.push(key)
      continue
    }
    throw new Error('input.params.' + key + ' is not supported by generation.speech')
  }
  return { params, droppedFields }
}

const COMMAND_FIELDS = new Set(['version', 'operation', 'intent_id', 'input'])
const INPUT_FIELDS = new Set(['workspace', 'workspace_collection_id', 'params'])
const DECLARED_METADATA_FIELDS = new Set([
  'provenance',
  'runtime',
  'client',
  'actor',
  'permission',
  'workspace_id',
  'workspaceId',
])
const ENVELOPE_INJECTION_FIELDS = new Set([
  'version',
  'operation',
  'intent_id',
  'input',
  'params',
  'command',
  'command_id',
  'commandId',
])
const AUDIO_REFERENCE_FIELDS = [
  'audio_guide',
  'audio_guide2',
  'audio_guide3',
  'audio_guide4',
  'audio_guide5',
  'audio_guide6',
] as const
const ASSET_ID = /^asset(?:[_:-])[A-Za-z0-9][A-Za-z0-9._:-]{0,238}$/
const WORKSPACE = /^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/
const MAX_INTENT_LENGTH = 160
const MAX_WORKSPACE_LENGTH = 240
const MAX_COLLECTION_LENGTH = 200

function isRecord(value: unknown): value is CatalogRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-blank string`)
  if (value.length > maximum) throw new Error(`${field} is too long`)
  return value
}

function safeReferencePath(value: string): boolean {
  return Boolean(value)
    && !value.includes('\\')
    && !value.includes('\u0000')
    && value.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}

/** Match the server's canonical asset URL/ID syntax without resolving anything. */
export function assertCanonicalAudioReference(value: unknown, field: string): void {
  if (value === null || value === '') return
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new Error(`${field} must be a canonical audio URL or asset ID`)
  }
  if (ASSET_ID.test(value)) return
  if (!value.startsWith('/api/v1/') || value.includes('\\') || value.includes('\u0000')) {
    throw new Error(`${field} must be a canonical audio URL or asset ID`)
  }
  const rawPathEnd = value.search(/[?#]/)
  const rawPath = rawPathEnd < 0 ? value : value.slice(0, rawPathEnd)
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    throw new Error(`${field} must be a canonical audio URL or asset ID`)
  }
  const parsed = new URL(value, 'http://hocuspocus.invalid')
  if (parsed.origin !== 'http://hocuspocus.invalid' || parsed.hash) {
    throw new Error(`${field} must be a canonical audio URL or asset ID`)
  }
  if (parsed.pathname.startsWith('/api/v1/uploads/')) {
    if (parsed.search || !safeReferencePath(decodedPath.slice('/api/v1/uploads/'.length))) {
      throw new Error(`${field} must be a canonical audio URL or asset ID`)
    }
    return
  }
  if (parsed.pathname.startsWith('/api/v1/assets/')) {
    const suffix = decodedPath.slice('/api/v1/assets/'.length)
    if (parsed.search || !ASSET_ID.test(suffix)) {
      throw new Error(`${field} must be a canonical audio URL or asset ID`)
    }
    return
  }
  if (parsed.pathname.startsWith('/api/v1/file/')) {
    const suffix = decodedPath.slice('/api/v1/file/'.length)
    const query = new URLSearchParams(parsed.search)
    if (!safeReferencePath(suffix) || query.size !== 1 || query.getAll('workspace').length !== 1
      || !WORKSPACE.test(query.get('workspace') || '')) {
      throw new Error(`${field} must be a canonical audio URL or asset ID`)
    }
    return
  }
  throw new Error(`${field} must be a canonical audio URL or asset ID`)
}

function schemaTypeMatches(value: unknown, type: unknown): boolean {
  if (type === 'null') return value === null
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isRecord(value)
  return true
}

function resolveSchema(schema: unknown): SpeechSchema {
  if (!isRecord(schema)) throw new Error('The generated speech catalog contains an invalid schema')
  if (typeof schema.$ref !== 'string') return schema
  const prefix = '#/$defs/'
  if (!schema.$ref.startsWith(prefix)) throw new Error('The generated speech catalog contains an unsupported reference')
  return resolveSchema(paramsSchema.$defs?.[schema.$ref.slice(prefix.length)])
}

function assertCatalogUnion(value: unknown, schema: SpeechSchema, field: string): void {
  const valid = schema.anyOf?.some(option => {
    try {
      assertCatalogValue(value, option, field)
      return true
    } catch {
      return false
    }
  })
  if (!valid) throw new Error(`${field} has an invalid native speech value`)
}

function assertCatalogIdentity(value: unknown, schema: SpeechSchema, field: string): void {
  if ('const' in schema && value !== schema.const) {
    throw new Error(`${field} must equal its native selector`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(option => Object.is(option, value))) {
    throw new Error(`${field} has an invalid native speech value`)
  }
  if (schema.type && !schemaTypeMatches(value, schema.type)) {
    throw new Error(`${field} has an invalid native speech type`)
  }
}

function assertCatalogString(value: unknown, schema: SpeechSchema, field: string): void {
  if (typeof value !== 'string') return
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    throw new Error(`${field} is too short`)
  }
  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    throw new Error(`${field} is too long`)
  }
  if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern).test(value))) {
    throw new Error(`${field} has an invalid native speech value`)
  }
}

function assertCatalogNumber(value: unknown, schema: SpeechSchema, field: string): void {
  if (typeof value !== 'number') return
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`)
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    throw new Error(`${field} is below its native minimum`)
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    throw new Error(`${field} is above its native maximum`)
  }
}

function assertCatalogArray(value: unknown, schema: SpeechSchema, field: string): void {
  if (!Array.isArray(value)) return
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    throw new Error(`${field} has too few items`)
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    throw new Error(`${field} has too many items`)
  }
  if (schema.items) {
    value.forEach((item, index) => assertCatalogValue(item, schema.items, `${field}[${index}]`))
  }
}

function assertCatalogObject(value: unknown, schema: SpeechSchema, field: string): void {
  if (!isRecord(value)) return
  const properties = schema.properties || {}
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) throw new Error(`${field}.${key} is not supported by generation.speech`)
    }
  }
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (!(key in value)) throw new Error(`${field}.${key} is required by generation.speech`)
    }
  }
  for (const [key, child] of Object.entries(value)) {
    const childSchema = properties[key]
    if (childSchema) assertCatalogValue(child, childSchema, `${field}.${key}`)
  }
}

function assertCatalogValue(value: unknown, schema: unknown, field: string): void {
  const resolved = resolveSchema(schema)
  if (Array.isArray(resolved.anyOf)) {
    assertCatalogUnion(value, resolved, field)
    return
  }
  assertCatalogIdentity(value, resolved, field)
  assertCatalogString(value, resolved, field)
  assertCatalogNumber(value, resolved, field)
  assertCatalogArray(value, resolved, field)
  assertCatalogObject(value, resolved, field)
}

function assertSpeechParams(value: unknown): asserts value is StudioSpeechParams {
  if (!isRecord(value)) throw new Error('input.params must be an object')
  for (const key of Object.keys(value)) {
    if (!STUDIO_SPEECH_PARAM_CATALOG.has(key)) {
      throw new Error(`input.params.${key} is not supported by generation.speech`)
    }
  }
  assertCatalogValue(value, paramsSchema, 'input.params')
  if (value.generation_mode !== undefined && value.generation_mode !== 'audio') {
    throw new Error('input.params.generation_mode must be audio')
  }
  if (value._audio_sub_mode !== undefined && value._audio_sub_mode !== 'speech') {
    throw new Error('input.params._audio_sub_mode must be speech')
  }
  if (value._tts_original_prompt === null) {
    throw new Error('input.params._tts_original_prompt must be a string when supplied')
  }
  if (value.minimax_h3_turbo_mode === true) {
    throw new Error('input.params.minimax_h3_turbo_mode must be false or null in speech mode')
  }
  for (const field of AUDIO_REFERENCE_FIELDS) {
    if (field in value) assertCanonicalAudioReference(value[field], `input.params.${field}`)
  }
  if (Array.isArray(value.activated_loras)) {
    value.activated_loras.forEach((item, index) => {
      if (!item.trim() || item.includes('/') || item.includes('\\')) {
        throw new Error(`input.params.activated_loras[${index}] must be an exact catalog name`)
      }
    })
  }
  // stableSerialize is the JSON boundary: it rejects cycles, BigInt, class
  // instances, functions and non-finite values before localStorage or fetch.
  stableSerialize(value)
}

export function assertStudioSpeechGenerationCommand(
  value: unknown,
): asserts value is StudioSpeechGenerationCommand {
  if (!isRecord(value)) throw new Error('Studio speech generation command must be an object')
  for (const key of Object.keys(value)) {
    if (!COMMAND_FIELDS.has(key)) throw new Error(`command.${key} is not supported by generation.speech`)
  }
  if (value.version !== STUDIO_SPEECH_SCHEMA_VERSION) throw new Error('version must be the integer 2')
  if (value.operation !== STUDIO_SPEECH_OPERATION) throw new Error('operation must be generation.speech')
  requiredText(value.intent_id, 'intent_id', MAX_INTENT_LENGTH)
  if (!isRecord(value.input)) throw new Error('input must be an object')
  for (const key of Object.keys(value.input)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`input.${key} is not supported by generation.speech`)
  }
  const workspace = requiredText(value.input.workspace, 'input.workspace', MAX_WORKSPACE_LENGTH)
  if (!WORKSPACE.test(workspace)) throw new Error('input.workspace must be an exact output workspace name')
  if ('workspace_collection_id' in value.input && value.input.workspace_collection_id !== null) {
    requiredText(value.input.workspace_collection_id, 'input.workspace_collection_id', MAX_COLLECTION_LENGTH)
  }
  assertSpeechParams(value.input.params)
}

export function detachedStudioSpeechGenerationCommand(value: unknown): StudioSpeechGenerationCommand {
  assertStudioSpeechGenerationCommand(value)
  return JSON.parse(stableSerialize(value)) as StudioSpeechGenerationCommand
}

function takeWorkspace(value: CatalogRecord): string {
  const workspace = requiredText(value.workspace, 'workspace', MAX_WORKSPACE_LENGTH)
  if (!WORKSPACE.test(workspace)) throw new Error('workspace must be an exact output workspace name')
  return workspace
}

function takeWorkspaceCollectionId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('provenance must be an object when supplied')
  if (value.workspace_id === undefined || value.workspace_id === null) return undefined
  return requiredText(value.workspace_id, 'provenance.workspace_id', MAX_COLLECTION_LENGTH)
}

/** Build a detached Speech envelope from the complete native Studio form. */
export function createStudioSpeechGenerationCommand(
  fullParams: Record<string, unknown>,
  intentId: string,
): StudioSpeechGenerationCommand {
  if (!isRecord(fullParams)) throw new Error('Studio speech parameters must be an object')
  const workspace = takeWorkspace(fullParams)
  const workspaceCollectionId = takeWorkspaceCollectionId(fullParams.provenance)
  const params: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fullParams)) {
    if (key === 'workspace' || DECLARED_METADATA_FIELDS.has(key)) continue
    if (ENVELOPE_INJECTION_FIELDS.has(key)) {
      throw new Error('workspace parameters cannot contain envelope field ' + key)
    }
    if (!STUDIO_SPEECH_PARAM_CATALOG.has(key)) {
      throw new Error('input.params.' + key + ' is not supported by generation.speech')
    }
    params[key] = value
  }
  return detachedStudioSpeechGenerationCommand({
    version: STUDIO_SPEECH_SCHEMA_VERSION,
    operation: STUDIO_SPEECH_OPERATION,
    intent_id: intentId,
    input: {
      workspace,
      ...(workspaceCollectionId !== undefined ? { workspace_collection_id: workspaceCollectionId } : {}),
      params: params as StudioSpeechParams,
    },
  })
}

export const buildStudioSpeechGenerationCommand = createStudioSpeechGenerationCommand
