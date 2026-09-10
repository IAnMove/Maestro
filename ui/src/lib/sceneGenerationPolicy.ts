import type { SceneRecipe } from './sceneRecipe'

/** Ordered from least to most restrictive. This governs recipe asset jobs,
 * not whether an existing video may be used as a compositor layer. */
export const SCENE_GENERATION_POLICIES = ['auto', 'no_video_generation', 'provided_only'] as const
export type SceneGenerationPolicy = typeof SCENE_GENERATION_POLICIES[number]

export class SceneGenerationPolicyError extends Error {
  readonly code: 'unknown_policy' | 'generation_forbidden'
  readonly policy: string
  readonly assetId: string
  readonly kind: string

  constructor(
    code: 'unknown_policy' | 'generation_forbidden',
    policy: string,
    assetId = '',
    kind = '',
  ) {
    super(code === 'unknown_policy'
      ? 'Unknown scene generation policy.'
      : `${kind === 'audio' ? 'Audio track' : 'Asset'} “${assetId}” has no source. Generation is forbidden under ${policy}. Supply an existing source.`)
    this.name = 'SceneGenerationPolicyError'
    this.code = code
    this.policy = policy
    this.assetId = assetId
    this.kind = kind
  }
}

export function parseSceneGenerationPolicy(value: unknown): SceneGenerationPolicy | undefined {
  if (value === undefined) return undefined // Legacy scenes retain legacy behaviour.
  const policy = SCENE_GENERATION_POLICIES.find(candidate => candidate === value)
  if (!policy) throw new SceneGenerationPolicyError('unknown_policy', '')
  return policy
}

/** Preserve omission for legacy JSON, but never drop malformed falsy values. */
export function sceneGenerationPolicyFields(value: unknown): { generationPolicy?: SceneGenerationPolicy } {
  const generationPolicy = parseSceneGenerationPolicy(value)
  return generationPolicy === undefined ? {} : { generationPolicy }
}

/** Neither an LLM recipe nor an explicit auto option can relax its caller's
 * restrictions. Unknown values fail closed, even alongside provided_only. */
export function effectiveSceneGenerationPolicy(...values: unknown[]): SceneGenerationPolicy {
  let rank = 0
  for (const value of values) {
    const policy = parseSceneGenerationPolicy(value) ?? 'auto'
    rank = Math.max(rank, SCENE_GENERATION_POLICIES.indexOf(policy))
  }
  return SCENE_GENERATION_POLICIES[rank]
}

export function withSceneGenerationPolicy<T extends { generationPolicy?: SceneGenerationPolicy }>(
  value: T,
  ...policies: unknown[]
): T & { generationPolicy: SceneGenerationPolicy } {
  return { ...value, generationPolicy: effectiveSceneGenerationPolicy(value.generationPolicy, ...policies) }
}

const hasSource = (value: { source?: string }) => typeof value.source === 'string' && Boolean(value.source.trim())

/** Preflight the ENTIRE request before any status callback, polling or job.
 * In provided_only existing GLBs are used as-is; rig_profile describes desired
 * capabilities, not permission to re-rig a supplied asset. */
export function assertSceneRecipeGenerationAllowed(recipe: SceneRecipe, policy: SceneGenerationPolicy): void {
  for (const asset of recipe.assets) {
    const forbidden = policy === 'provided_only' || (policy === 'no_video_generation' && asset.kind === 'video')
    if (forbidden && !hasSource(asset)) {
      throw new SceneGenerationPolicyError('generation_forbidden', policy, asset.id, asset.kind)
    }
  }
  if (policy !== 'provided_only') return
  for (const track of recipe.audio ?? []) {
    if (!hasSource(track)) {
      throw new SceneGenerationPolicyError('generation_forbidden', policy, track.id, 'audio')
    }
  }
}
