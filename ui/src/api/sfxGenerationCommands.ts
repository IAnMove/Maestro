import {
  createGenerationCommandClient,
  GenerationCommandError,
  type GenerationReceiptLike,
  type GenerationTaskResult,
  type GenerationCommandErrorOptions,
  type SubmitGenerationCommandOptions,
} from './generationCommandClient'
import {
  assertStudioSfxGenerationCommand,
  createStudioSfxGenerationCommand,
  detachedStudioSfxGenerationCommand,
  type StudioSfxGenerationCommand,
  type StudioSfxParamKey,
  type StudioSfxParams,
  STUDIO_SFX_OPERATION,
  STUDIO_SFX_SCHEMA_VERSION,
} from '../features/studio/sfxGenerationSpec'

export {
  assertStudioSfxGenerationCommand,
  createStudioSfxGenerationCommand,
  detachedStudioSfxGenerationCommand,
  STUDIO_SFX_OPERATION,
  STUDIO_SFX_SCHEMA_VERSION,
}
export type {
  StudioSfxGenerationCommand,
  StudioSfxParamKey,
  StudioSfxParams,
}

export type SfxGenerationTaskResult = GenerationTaskResult

export interface SfxGenerationReceipt extends GenerationReceiptLike {
  version: 1
  operation: typeof STUDIO_SFX_OPERATION
  result: SfxGenerationTaskResult
}

export class SfxGenerationCommandError extends GenerationCommandError {
  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message, intentId, workspace, {
      ...options,
      code: options.code ?? 'sfx_generation_command_failed',
    })
    this.name = 'SfxGenerationCommandError'
  }
}

const sfxCommandClient = createGenerationCommandClient<StudioSfxGenerationCommand, SfxGenerationReceipt>({
  storagePrefix: 'hocuspocus.generation.sfx-commands.v2:',
  contextStoragePrefix: 'hocuspocus.generation.sfx-command-context.v1:',
  pendingChangedEvent: 'hocuspocus:generation-sfx-commands-changed',
  operation: STUDIO_SFX_OPERATION,
  label: 'Sfx generation',
  receiptFallbackVersion: STUDIO_SFX_SCHEMA_VERSION,
  detach: detachedStudioSfxGenerationCommand,
  errorClass: SfxGenerationCommandError,
  castReceipt: value => value as SfxGenerationReceipt,
})

export const newSfxGenerationIntentId = sfxCommandClient.newIntentId
export const pendingSfxGenerationCommands = sfxCommandClient.pendingCommands
export const pendingSfxGenerationCommand = sfxCommandClient.pendingCommand

export type SubmitSfxGenerationCommandOptions = SubmitGenerationCommandOptions<StudioSfxGenerationCommand>

export const submitSfxGenerationCommand = sfxCommandClient.submit
export const fetchSfxGenerationCommandReceipt = sfxCommandClient.fetchReceipt
export const getSfxGenerationCommandReceipt = fetchSfxGenerationCommandReceipt

export function subscribeSfxGenerationCommands(callback: () => void): () => void {
  return sfxCommandClient.subscribe(callback)
}

/** Alias for callers which do not distinguish the Studio-specific name. */
export const createSfxGenerationCommand = createStudioSfxGenerationCommand
