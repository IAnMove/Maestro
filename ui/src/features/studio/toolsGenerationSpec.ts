import { stableSerialize } from '../../lib/commandContract'
import toolsCommandCatalog from '../../api/toolsCommandCatalog.json'
import { assertCanonicalToolsReference, assertToolsWorkspace } from './toolsSource'

export { assertCanonicalToolsReference, canonicalToolsSource, assertToolsWorkspace } from './toolsSource'

/**
 * Browser-side projection of the closed `tools.upscale` contract.
 *
 * The JSON catalog is generated from the Python schema.  This module only
 * validates the transport envelope and keeps the UI from sending host paths,
 * arbitrary processor options, or a second operation through the Tools
 * gateway.  Source existence and processor availability remain server-side
 * authorities.
 */
export const TOOLS_UPSCALE_SCHEMA_VERSION = 2 as const
export const TOOLS_UPSCALE_OPERATION = 'tools.upscale' as const

type CatalogRecord = Record<string, unknown>
type CatalogSchema = CatalogRecord & {
  additionalProperties?: boolean
  anyOf?: unknown[]
  const?: unknown
  enum?: unknown[]
  items?: unknown
  maxItems?: number
  maxLength?: number
  maximum?: number
  minItems?: number
  minLength?: number
  minimum?: number
  pattern?: string
  properties?: CatalogRecord
  required?: string[]
  type?: string
  $defs?: CatalogRecord
  $ref?: string
}

const studioCatalog = toolsCommandCatalog.studio as unknown as CatalogRecord
const studioInputSchema = studioCatalog.input as CatalogSchema
const paramsSchema = (studioInputSchema.$defs?.ToolsUpscaleParams || {}) as CatalogSchema

/** Derived from the generated schema rather than maintained as a second list. */
export type ToolsUpscaleParamKey = keyof typeof toolsCommandCatalog.studio.input.$defs.ToolsUpscaleParams.properties
export type ToolsUpscaleParams = Partial<Record<ToolsUpscaleParamKey, unknown>>
export type ToolsUpscaleGenerationFullParams = ToolsUpscaleParams & {
  workspace: string
  provenance?: unknown
}

export interface ToolsUpscaleGenerationInput {
  workspace: string
  workspace_collection_id?: string | null
  params: ToolsUpscaleParams
}

export interface ToolsUpscaleGenerationCommand {
  version: typeof TOOLS_UPSCALE_SCHEMA_VERSION
  operation: typeof TOOLS_UPSCALE_OPERATION
  intent_id: string
  input: ToolsUpscaleGenerationInput
}

export const TOOLS_UPSCALE_PARAM_KEYS: readonly ToolsUpscaleParamKey[] =
  (studioCatalog.supported_input_fields as string[])
    .filter(key => key !== 'workspace' && key !== 'workspace_collection_id') as ToolsUpscaleParamKey[]
export const TOOLS_UPSCALE_PARAM_CATALOG: ReadonlySet<string> = new Set(TOOLS_UPSCALE_PARAM_KEYS)
export const TOOLS_UPSCALE_SOURCE_KINDS: readonly ('image' | 'video')[] =
  (studioCatalog.source_kinds as ('image' | 'video')[]).slice()
export const TOOLS_UPSCALE_METHODS: readonly string[] = (studioCatalog.methods as string[]).slice()

const COMMAND_FIELDS = new Set(['version', 'operation', 'intent_id', 'input'])
const INPUT_FIELDS = new Set(['workspace', 'workspace_collection_id', 'params'])
const ENVELOPE_INJECTION_FIELDS = new Set([
  'version', 'operation', 'intent_id', 'input', 'params', 'command', 'command_id', 'commandId',
])
const DECLARED_METADATA_FIELDS = new Set([
  'provenance', 'runtime', 'client', 'actor', 'permission', 'workspace_id', 'workspaceId',
])
const MAX_INTENT_LENGTH = 160
const MAX_COLLECTION_LENGTH = 200

function isRecord(value: unknown): value is CatalogRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-blank string`)
  if (value.trim() !== value) throw new Error(`${field} must be an exact string without surrounding whitespace`)
  if (value.length > maximum) throw new Error(`${field} is too long`)
  return value
}

function schemaDefinitions(): CatalogRecord {
  return studioInputSchema.$defs || {}
}

function resolveSchema(value: unknown): CatalogSchema {
  const schema = (value || {}) as CatalogSchema
  if (typeof schema.$ref !== 'string') return schema
  const prefix = '#/$defs/'
  if (!schema.$ref.startsWith(prefix)) throw new Error('Tools command catalog has an unsupported schema reference')
  const resolved = schemaDefinitions()[schema.$ref.slice(prefix.length)]
  if (!resolved) throw new Error('Tools command catalog has an unresolved schema reference')
  return resolved as CatalogSchema
}

function assertCatalogUnion(value: unknown, schema: CatalogSchema, field: string): void {
  const choices = schema.anyOf || []
  if (choices.some(choice => {
    try {
      assertCatalogValue(value, choice, field)
      return true
    } catch {
      return false
    }
  })) return
  throw new Error(`${field} does not match the generated Tools schema`)
}

function assertCatalogConstant(value: unknown, schema: CatalogSchema, field: string): void {
  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(`${field} must equal the generated constant`)
  }
  if (schema.enum && !schema.enum.some(item => item === value)) {
    throw new Error(`${field} is not in the generated enum`)
  }
}

function assertCatalogNull(value: unknown, _schema: CatalogSchema, field: string): void {
  if (value !== null) throw new Error(`${field} must be null`)
}

function assertCatalogString(value: unknown, schema: CatalogSchema, field: string): void {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  if (schema.minLength !== undefined && value.length < schema.minLength) throw new Error(`${field} is too short`)
  if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new Error(`${field} is too long`)
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${field} has an invalid format`)
}

function assertCatalogNumber(value: unknown, schema: CatalogSchema, field: string, integer: boolean): void {
  const valid = typeof value === 'number' && Number.isFinite(value) && (!integer || Number.isSafeInteger(value))
  if (!valid) throw new Error(`${field} must be a ${integer ? 'integer' : 'finite number'}`)
  if (schema.minimum !== undefined && (value as number) < schema.minimum) throw new Error(`${field} is below the minimum`)
  if (schema.maximum !== undefined && (value as number) > schema.maximum) throw new Error(`${field} is above the maximum`)
}

function assertCatalogArray(value: unknown, schema: CatalogSchema, field: string): void {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  if (schema.minItems !== undefined && value.length < schema.minItems) throw new Error(`${field} has too few items`)
  if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${field} has too many items`)
  if (schema.items) value.forEach((item, index) => assertCatalogValue(item, schema.items, `${field}[${index}]`))
}

type CatalogValueValidator = (value: unknown, schema: CatalogSchema, field: string) => void
const CATALOG_VALUE_VALIDATORS: Readonly<Record<string, CatalogValueValidator>> = {
  null: assertCatalogNull,
  string: assertCatalogString,
  integer: (value, schema, field) => assertCatalogNumber(value, schema, field, true),
  number: (value, schema, field) => assertCatalogNumber(value, schema, field, false),
  array: assertCatalogArray,
  object: assertCatalogObject,
}

function assertCatalogValue(value: unknown, source: unknown, field: string): void {
  const schema = resolveSchema(source)
  if (Array.isArray(schema.anyOf)) return assertCatalogUnion(value, schema, field)
  assertCatalogConstant(value, schema, field)
  CATALOG_VALUE_VALIDATORS[schema.type || '']?.(value, schema, field)
}

function assertCatalogObject(value: unknown, schema: CatalogSchema, field: string): void {
  if (!isRecord(value)) throw new Error(`${field} must be an object`)
  const properties = schema.properties || {}
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) throw new Error(`${field}.${key} is not supported by tools.upscale`)
    }
  }
  for (const key of schema.required || []) {
    if (!(key in value)) throw new Error(`${field}.${key} is required by tools.upscale`)
  }
  for (const [key, child] of Object.entries(value)) {
    if (properties[key]) assertCatalogValue(child, properties[key], `${field}.${key}`)
  }
}

function assertCollection(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value
  return requiredText(value, 'input.workspace_collection_id', MAX_COLLECTION_LENGTH)
}

function assertToolsParams(value: unknown): asserts value is ToolsUpscaleParams {
  if (!isRecord(value)) throw new Error('input.params must be an object')
  for (const key of Object.keys(value)) {
    if (!TOOLS_UPSCALE_PARAM_CATALOG.has(key)) throw new Error(`input.params.${key} is not supported by tools.upscale`)
  }
  for (const key of ['source', 'source_kind', 'method'] as const) {
    if (!(key in value)) throw new Error(`input.params.${key} is required by tools.upscale`)
  }
  assertCatalogObject(value, paramsSchema, 'input.params')
  assertCanonicalToolsReference(value.source)
  assertSourceWorkspaceMatchesReference(value.source, value.source_workspace)
  if (typeof value.source_kind !== 'string' || !TOOLS_UPSCALE_SOURCE_KINDS.includes(value.source_kind as 'image' | 'video')) {
    throw new Error('input.params.source_kind must be image or video')
  }
  if (typeof value.method !== 'string' || !TOOLS_UPSCALE_METHODS.includes(value.method)) {
    throw new Error('input.params.method must be an installed Tools upscale method')
  }
  stableSerialize(value)
}

function assertSourceWorkspaceMatchesReference(source: string, sourceWorkspace: unknown): void {
  if (sourceWorkspace === undefined || sourceWorkspace === null || !source.startsWith('/api/v1/')) return
  let expected: string | null = null
  if (source.startsWith('/api/v1/uploads/')) {
    expected = '__uploads__'
  } else if (source.startsWith('/api/v1/file/')) {
    try {
      expected = new URL(source, 'http://hocuspocus.invalid').searchParams.get('workspace')
    } catch {
      return
    }
  }
  if (expected && sourceWorkspace !== expected) {
    throw new Error('input.params.source_workspace must match the source reference workspace')
  }
}

export function assertToolsUpscaleGenerationCommand(
  value: unknown,
): asserts value is ToolsUpscaleGenerationCommand {
  if (!isRecord(value)) throw new Error('Tools upscale generation command must be an object')
  for (const key of Object.keys(value)) {
    if (!COMMAND_FIELDS.has(key)) throw new Error(`command.${key} is not supported by tools.upscale`)
  }
  if (value.version !== TOOLS_UPSCALE_SCHEMA_VERSION) throw new Error('version must be the integer 2')
  if (value.operation !== TOOLS_UPSCALE_OPERATION) throw new Error('operation must be tools.upscale')
  requiredText(value.intent_id, 'intent_id', MAX_INTENT_LENGTH)
  if (!isRecord(value.input)) throw new Error('input must be an object')
  for (const key of Object.keys(value.input)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`input.${key} is not supported by tools.upscale`)
  }
  assertToolsWorkspace(value.input.workspace, 'input.workspace')
  if ('workspace_collection_id' in value.input) assertCollection(value.input.workspace_collection_id)
  assertToolsParams(value.input.params)
}

export function detachedToolsUpscaleGenerationCommand(value: unknown): ToolsUpscaleGenerationCommand {
  assertToolsUpscaleGenerationCommand(value)
  return JSON.parse(stableSerialize(value)) as ToolsUpscaleGenerationCommand
}

function takeCollection(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('provenance must be an object when supplied')
  if (value.workspace_id === undefined || value.workspace_id === null) return undefined
  return requiredText(value.workspace_id, 'provenance.workspace_id', MAX_COLLECTION_LENGTH)
}

/**
 * Convert a complete flat Tools form into a detached closed envelope.  The
 * caller must provide a canonical source URL or asset ID; legacy file names
 * belong in the adapter's source-resolution step before this builder.
 */
export function createStudioToolsUpscaleGenerationCommand(
  fullParams: Record<string, unknown>,
  intentId: string,
): ToolsUpscaleGenerationCommand {
  if (!isRecord(fullParams)) throw new Error('Tools upscale parameters must be an object')
  const workspace = assertToolsWorkspace(fullParams.workspace, 'workspace')
  const workspaceCollectionId = takeCollection(fullParams.provenance)
  const params: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fullParams)) {
    if (key === 'workspace' || DECLARED_METADATA_FIELDS.has(key)) continue
    if (ENVELOPE_INJECTION_FIELDS.has(key)) throw new Error('workspace parameters cannot contain envelope field ' + key)
    if (!TOOLS_UPSCALE_PARAM_CATALOG.has(key)) throw new Error('input.params.' + key + ' is not supported by tools.upscale')
    if (value === undefined) continue
    params[key] = value
  }
  return detachedToolsUpscaleGenerationCommand({
    version: TOOLS_UPSCALE_SCHEMA_VERSION,
    operation: TOOLS_UPSCALE_OPERATION,
    intent_id: intentId,
    input: {
      workspace,
      ...(workspaceCollectionId !== undefined ? { workspace_collection_id: workspaceCollectionId } : {}),
      params: params as ToolsUpscaleParams,
    },
  })
}

export const buildStudioToolsUpscaleGenerationCommand = createStudioToolsUpscaleGenerationCommand
