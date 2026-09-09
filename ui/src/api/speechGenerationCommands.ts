import {
  createGenerationCommandClient,
  GenerationCommandError,
  type GenerationReceiptLike,
  type GenerationTaskResult,
  type GenerationCommandErrorOptions,
  type SubmitGenerationCommandOptions,
} from './generationCommandClient'
import {
  assertStudioSpeechGenerationCommand,
  buildStudioSpeechGenerationCommand,
  createStudioSpeechGenerationCommand,
  detachedStudioSpeechGenerationCommand,
  type StudioSpeechGenerationCommand,
  type StudioSpeechGenerationFullParams,
  type StudioSpeechGenerationInput,
  type StudioSpeechParamKey,
  type StudioSpeechParams,
  STUDIO_SPEECH_OPERATION,
  STUDIO_SPEECH_SCHEMA_VERSION,
} from '../features/studio/speechGenerationSpec'

export {
  assertStudioSpeechGenerationCommand,
  buildStudioSpeechGenerationCommand,
  createStudioSpeechGenerationCommand,
  detachedStudioSpeechGenerationCommand,
  STUDIO_SPEECH_OPERATION,
  STUDIO_SPEECH_SCHEMA_VERSION,
}
export type {
  StudioSpeechGenerationCommand,
  StudioSpeechGenerationFullParams,
  StudioSpeechGenerationInput,
  StudioSpeechParamKey,
  StudioSpeechParams,
}

export type SpeechGenerationTaskResult = GenerationTaskResult

export interface SpeechGenerationReceipt extends GenerationReceiptLike {
  version: 1
  operation: typeof STUDIO_SPEECH_OPERATION
  result: SpeechGenerationTaskResult
}

export class SpeechGenerationCommandError extends GenerationCommandError {
  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message, intentId, workspace, {
      ...options,
      code: options.code ?? 'speech_generation_command_failed',
    })
    this.name = 'SpeechGenerationCommandError'
  }
}

const speechCommandClient = createGenerationCommandClient<StudioSpeechGenerationCommand, SpeechGenerationReceipt>({
  storagePrefix: 'hocuspocus.generation.speech-commands.v2:',
  contextStoragePrefix: 'hocuspocus.generation.speech-command-context.v1:',
  pendingChangedEvent: 'hocuspocus:generation-speech-commands-changed',
  operation: STUDIO_SPEECH_OPERATION,
  label: 'Speech generation',
  receiptFallbackVersion: STUDIO_SPEECH_SCHEMA_VERSION,
  detach: detachedStudioSpeechGenerationCommand,
  errorClass: SpeechGenerationCommandError,
  castReceipt: value => value as SpeechGenerationReceipt,
})

export const newSpeechGenerationIntentId = speechCommandClient.newIntentId
export const pendingSpeechGenerationCommands = speechCommandClient.pendingCommands
export const pendingSpeechGenerationCommand = speechCommandClient.pendingCommand

export type SubmitSpeechGenerationCommandOptions = SubmitGenerationCommandOptions<StudioSpeechGenerationCommand>

export const submitSpeechGenerationCommand = speechCommandClient.submit
export const fetchSpeechGenerationCommandReceipt = speechCommandClient.fetchReceipt
export const getSpeechGenerationCommandReceipt = fetchSpeechGenerationCommandReceipt

export function subscribeSpeechGenerationCommands(callback: () => void): () => void {
  return speechCommandClient.subscribe(callback)
}

/**
 * Symmetric name for callers that already distinguish legacy Speech from the
 * typed Studio envelope. The builder still receives the complete native map.
 */
export const createSpeechGenerationCommand = createStudioSpeechGenerationCommand
