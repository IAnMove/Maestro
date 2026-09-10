/** Public preferences only. Credentials always stay in the server configuration. */
export type CharacterVoice = {
  provider: 'local'
  model: 'qwen3_tts_customvoice'
  voiceId: string
  instructions?: string
}
export type CharacterKitRef = { id: string; workspace: string }
export const CHARACTER_VOICES = ['vivian', 'serena', 'uncle_fu', 'dylan', 'eric', 'ryan', 'aiden', 'ono_anna', 'sohee'] as const
export function parseCharacterVoice(raw: unknown): CharacterVoice | undefined {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object') throw new Error('Invalid character voice.')
  const data = raw as Record<string, unknown>
  if (Object.keys(data).some(key => !['provider', 'model', 'voiceId', 'instructions'].includes(key))
    || data.provider !== 'local' || data.model !== 'qwen3_tts_customvoice'
    || !CHARACTER_VOICES.includes(data.voiceId as typeof CHARACTER_VOICES[number])
    || (data.instructions !== undefined && (typeof data.instructions !== 'string' || data.instructions.length > 1000))) {
    throw new Error('Choose a local Qwen3 CustomVoice preset. Do not store credentials in a character.')
  }
  return { provider: 'local', model: 'qwen3_tts_customvoice', voiceId: data.voiceId as string,
    ...(data.instructions ? { instructions: data.instructions as string } : {}) }
}
export function parseCharacterKitRef(raw: unknown): CharacterKitRef | undefined {
  if (raw === undefined) return undefined
  const ref = raw as CharacterKitRef
  if (!ref || typeof ref.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(ref.id)
    || typeof ref.workspace !== 'string' || !/^[A-Za-z0-9_. -]{1,120}$/.test(ref.workspace)
    || ['.', '..'].includes(ref.workspace)) throw new Error('Invalid character library reference.')
  return { id: ref.id, workspace: ref.workspace }
}
