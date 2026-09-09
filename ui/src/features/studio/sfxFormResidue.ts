/**
 * SFX owns these keys on the shared Studio params map. Speech and Music
 * command builders must not see them: MMAudio_* are catalogued inactive
 * sentinels (non-empty fails closed) and sfx_text_weight is unknown to
 * those contracts. Direct MCP/Wizard envelopes stay fail-closed.
 */
export const SFX_OWNED_FORM_FIELDS = [
  'MMAudio_prompt',
  'MMAudio_neg_prompt',
  'MMAudio_setting',
  'sfx_text_weight',
  'sfx_mode',
  '_sfx_virtual_model',
  '_mmaudio_variant',
] as const

const OWNED = new Set<string>(SFX_OWNED_FORM_FIELDS)

/** Drop SFX-owned leftovers before projecting a Speech or Music form. */
export function neutralizeSfxOwnedFormFields(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([key]) => !OWNED.has(key)))
}
