import type { GenerateParams } from '../types'

export function supportsSemanticBridge(modelType: string): boolean {
  return modelType === 'minimax_h3' || modelType === 'minimax_h3_full'
}

export function restoreSemanticBridgeSettings(input: Partial<GenerateParams> | Record<string, unknown>, modelType: string): Partial<GenerateParams> {
  const value = input.minimax_h3_semantic_bridge_alpha
  const alpha = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0
  const requestedMode = input.minimax_h3_semantic_bridge_magnitude
  const magnitude = requestedMode === 'global' || requestedMode === 'none' ? requestedMode : 'per_token'
  return {
    minimax_h3_semantic_bridge_alpha: supportsSemanticBridge(modelType) ? alpha : 0,
    minimax_h3_semantic_bridge_magnitude: magnitude,
  }
}

export function h3ModelSwitchSettings(params: GenerateParams, modelType: string): Partial<GenerateParams> {
  const nextH3 = modelType.startsWith('minimax_h3')
  if (!nextH3 && !params.model_type.startsWith('minimax_h3')) return {}
  const fused = modelType.includes('_fused_turbo')
  const native = nextH3 && modelType !== 'minimax_h3_legacy'
  let attention = params.override_attention
  if (native && fused && attention !== 'sdpa') attention = 'sla'
  if (native && !fused && attention === 'sla') attention = undefined
  if (!native && (attention === 'sla' || attention === 'sol')) attention = undefined
  return { ...restoreSemanticBridgeSettings(params, modelType), override_attention: attention }
}
