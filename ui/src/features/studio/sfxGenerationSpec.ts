import { stableSerialize } from '../../lib/commandContract'
import { createCatalogValidator, type CommandSchema } from '../../lib/generationCommandSchema'
import { assertCanonicalAudioReference } from '../../lib/canonicalAudioReference'
import catalog from '../../api/sfxCommandCatalog.json'

export const STUDIO_SFX_OPERATION = 'generation.sfx' as const
export const STUDIO_SFX_SCHEMA_VERSION = 2 as const
export type StudioSfxParamKey = keyof typeof catalog.studio.input.$defs.StudioSfxParams.properties
export type StudioSfxParams = Partial<Record<StudioSfxParamKey, unknown>>
export interface StudioSfxGenerationCommand {
  version: 2
  operation: typeof STUDIO_SFX_OPERATION
  intent_id: string
  input: { workspace: string; workspace_collection_id?: string | null; params: StudioSfxParams }
}

const schema = catalog.operations[0].inputSchema as unknown as CommandSchema
const validate = createCatalogValidator(schema.$defs, STUDIO_SFX_OPERATION)
const paramKeys = Object.keys(catalog.studio.input.$defs.StudioSfxParams.properties)

export function assertStudioSfxGenerationCommand(value: unknown): asserts value is StudioSfxGenerationCommand {
  validate(value, schema, 'command')
  const command = value as StudioSfxGenerationCommand
  const params = command.input.params
  if (!command.intent_id.trim() || !/^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$/.test(command.input.workspace)) {
    throw new Error('Use an exact intention and output workspace')
  }
  if (command.input.workspace_collection_id !== undefined && command.input.workspace_collection_id !== null
      && !command.input.workspace_collection_id.trim()) throw new Error('Use a non-blank collection ID')
  if (!catalog.studio.sfx_model_types.includes(String(params.model_type))) {
    throw new Error('Choose mmaudio_v2 or mmaudio_nsfw')
  }
  const variant = params.model_type === 'mmaudio_nsfw' ? 'nsfw' : 'v2'
  if (params._mmaudio_variant != null && params._mmaudio_variant !== variant) {
    throw new Error('MMAudio variant does not match the selected model')
  }
  const prompt = params.MMAudio_prompt || params.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A literal sound description is required')
  if (params.prompt != null && params.MMAudio_prompt != null && params.prompt !== params.MMAudio_prompt) {
    throw new Error('The main and MMAudio prompts must identify the same sound description')
  }
  if (params.sfx_mode != null && params.sfx_mode !== true) throw new Error('SFX mode must be active')
  const duration = params.duration_seconds
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0
      || (!params.video_guide && duration > 20)) throw new Error('Text-only SFX duration must be greater than zero and at most 20 seconds')
  if (params.video_guide) assertCanonicalAudioReference(params.video_guide, 'video_guide', 'video')
  stableSerialize(command)
}

export function detachedStudioSfxGenerationCommand(value: unknown): StudioSfxGenerationCommand {
  assertStudioSfxGenerationCommand(value)
  return JSON.parse(stableSerialize(value)) as StudioSfxGenerationCommand
}

/** Direct builders remain closed; only the visible form adapter projects its fields. */
export function createStudioSfxGenerationCommand(fullParams: Record<string, unknown>, intentId: string): StudioSfxGenerationCommand {
  const { workspace, provenance, ...params } = fullParams
  const collectionId = provenance && typeof provenance === 'object'
    ? (provenance as Record<string, unknown>).workspace_id : undefined
  return detachedStudioSfxGenerationCommand({ version: 2, operation: STUDIO_SFX_OPERATION, intent_id: intentId,
    input: { workspace, ...(collectionId != null ? { workspace_collection_id: collectionId } : {}), params } })
}

/** SFX controls own a small subset of the shared Studio form. */
export function projectStudioSfxFormParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries([...paramKeys, 'workspace', 'provenance']
    .filter(key => params[key] !== undefined).map(key => [key, params[key]]))
}
