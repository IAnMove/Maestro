import {
  createGenerationCommandClient,
  GenerationCommandError,
  type GenerationReceiptLike,
  type GenerationTaskResult,
  type GenerationCommandErrorOptions,
  type SubmitGenerationCommandOptions,
} from './generationCommandClient'
import {
  assertStudioMusicGenerationCommand,
  buildStudioMusicGenerationCommand,
  createStudioMusicGenerationCommand,
  detachedStudioMusicGenerationCommand,
  type StudioMusicGenerationCommand,
  type StudioMusicGenerationFullParams,
  type StudioMusicGenerationInput,
  type StudioMusicParamKey,
  type StudioMusicParams,
  STUDIO_MUSIC_OPERATION,
  STUDIO_MUSIC_SCHEMA_VERSION,
} from '../features/studio/musicGenerationSpec'

export {
  assertStudioMusicGenerationCommand,
  buildStudioMusicGenerationCommand,
  createStudioMusicGenerationCommand,
  detachedStudioMusicGenerationCommand,
  STUDIO_MUSIC_OPERATION,
  STUDIO_MUSIC_SCHEMA_VERSION,
}
export type {
  StudioMusicGenerationCommand,
  StudioMusicGenerationFullParams,
  StudioMusicGenerationInput,
  StudioMusicParamKey,
  StudioMusicParams,
}

export type MusicGenerationTaskResult = GenerationTaskResult

export interface MusicGenerationReceipt extends GenerationReceiptLike {
  version: 1
  operation: typeof STUDIO_MUSIC_OPERATION
  result: MusicGenerationTaskResult
}

export class MusicGenerationCommandError extends GenerationCommandError {
  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message, intentId, workspace, {
      ...options,
      code: options.code ?? 'music_generation_command_failed',
    })
    this.name = 'MusicGenerationCommandError'
  }
}

const musicCommandClient = createGenerationCommandClient<StudioMusicGenerationCommand, MusicGenerationReceipt>({
  storagePrefix: 'hocuspocus.generation.music-commands.v2:',
  contextStoragePrefix: 'hocuspocus.generation.music-command-context.v1:',
  pendingChangedEvent: 'hocuspocus:generation-music-commands-changed',
  operation: STUDIO_MUSIC_OPERATION,
  label: 'Music generation',
  receiptFallbackVersion: STUDIO_MUSIC_SCHEMA_VERSION,
  detach: detachedStudioMusicGenerationCommand,
  errorClass: MusicGenerationCommandError,
  castReceipt: value => value as MusicGenerationReceipt,
})

export const newMusicGenerationIntentId = musicCommandClient.newIntentId
export const pendingMusicGenerationCommands = musicCommandClient.pendingCommands
export const pendingMusicGenerationCommand = musicCommandClient.pendingCommand

export type SubmitMusicGenerationCommandOptions = SubmitGenerationCommandOptions<StudioMusicGenerationCommand>

export const submitMusicGenerationCommand = musicCommandClient.submit
export const fetchMusicGenerationCommandReceipt = musicCommandClient.fetchReceipt
export const getMusicGenerationCommandReceipt = fetchMusicGenerationCommandReceipt

export function subscribeMusicGenerationCommands(callback: () => void): () => void {
  return musicCommandClient.subscribe(callback)
}

/** Alias for callers which do not distinguish the Studio-specific name. */
export const createMusicGenerationCommand = createStudioMusicGenerationCommand
