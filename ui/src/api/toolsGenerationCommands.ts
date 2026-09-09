import {
  createGenerationCommandClient,
  GenerationCommandError,
  type GenerationCommandErrorOptions,
  type GenerationReceiptLike,
  type GenerationTaskResult,
  type SubmitGenerationCommandOptions,
} from './generationCommandClient'
import {
  buildStudioToolsUpscaleGenerationCommand,
  createStudioToolsUpscaleGenerationCommand,
  detachedToolsUpscaleGenerationCommand,
  TOOLS_UPSCALE_OPERATION,
  TOOLS_UPSCALE_SCHEMA_VERSION,
  type ToolsUpscaleGenerationCommand,
} from '../features/studio/toolsGenerationSpec'

export {
  assertToolsUpscaleGenerationCommand,
  buildStudioToolsUpscaleGenerationCommand,
  canonicalToolsSource,
  createStudioToolsUpscaleGenerationCommand,
  detachedToolsUpscaleGenerationCommand,
  TOOLS_UPSCALE_OPERATION,
  TOOLS_UPSCALE_SCHEMA_VERSION,
} from '../features/studio/toolsGenerationSpec'
export type {
  ToolsUpscaleGenerationCommand,
  ToolsUpscaleGenerationFullParams,
  ToolsUpscaleGenerationInput,
  ToolsUpscaleParamKey,
  ToolsUpscaleParams,
} from '../features/studio/toolsGenerationSpec'

export type ToolsUpscaleTaskResult = GenerationTaskResult

export interface ToolsUpscaleGenerationReceipt extends GenerationReceiptLike {
  version: 1
  operation: typeof TOOLS_UPSCALE_OPERATION
  result: ToolsUpscaleTaskResult
}

export class ToolsUpscaleGenerationCommandError extends GenerationCommandError {
  constructor(
    message: string,
    intentId: string,
    workspace: string,
    options: GenerationCommandErrorOptions = {},
  ) {
    super(message, intentId, workspace, {
      ...options,
      code: options.code ?? 'tools_upscale_command_failed',
    })
    this.name = 'ToolsUpscaleGenerationCommandError'
  }
}

const toolsUpscaleCommandClient = createGenerationCommandClient<
  ToolsUpscaleGenerationCommand,
  ToolsUpscaleGenerationReceipt
>({
  storagePrefix: 'hocuspocus.generation.tools-upscale-commands.v2:',
  contextStoragePrefix: 'hocuspocus.generation.tools-upscale-command-context.v1:',
  pendingChangedEvent: 'hocuspocus:generation-tools-upscale-commands-changed',
  operation: TOOLS_UPSCALE_OPERATION,
  label: 'Tools upscale',
  receiptFallbackVersion: TOOLS_UPSCALE_SCHEMA_VERSION,
  detach: detachedToolsUpscaleGenerationCommand,
  errorClass: ToolsUpscaleGenerationCommandError,
  castReceipt: value => value as ToolsUpscaleGenerationReceipt,
})

export const newToolsUpscaleGenerationIntentId = toolsUpscaleCommandClient.newIntentId
export const pendingToolsUpscaleGenerationCommands = toolsUpscaleCommandClient.pendingCommands
export const pendingToolsUpscaleGenerationCommand = toolsUpscaleCommandClient.pendingCommand

export type SubmitToolsUpscaleGenerationCommandOptions = SubmitGenerationCommandOptions<ToolsUpscaleGenerationCommand>

export const submitToolsUpscaleGenerationCommand = toolsUpscaleCommandClient.submit
export const fetchToolsUpscaleGenerationCommandReceipt = toolsUpscaleCommandClient.fetchReceipt
export const getToolsUpscaleGenerationCommandReceipt = fetchToolsUpscaleGenerationCommandReceipt

export function subscribeToolsUpscaleGenerationCommands(callback: () => void): () => void {
  return toolsUpscaleCommandClient.subscribe(callback)
}

/** Symmetric short aliases used by Tools callers. */
export const createToolsUpscaleCommand = createStudioToolsUpscaleGenerationCommand
export const buildToolsUpscaleCommand = buildStudioToolsUpscaleGenerationCommand
