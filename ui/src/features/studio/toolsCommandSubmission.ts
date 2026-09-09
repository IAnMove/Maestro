import * as api from '../../api/client'
import { stableSerialize } from '../../lib/commandContract'
import type { AppState } from '../../stores/useStore'
import type { GenerationSubmissionContext } from './generationProvenance'
import {
  createStudioToolsUpscaleGenerationCommand,
  canonicalToolsSource,
} from './toolsGenerationSpec'
import {
  finishStudioToolsCommand,
  presentStudioToolsCommand,
} from './toolsCommandPresentation'
import {
  newToolsUpscaleGenerationIntentId,
  submitToolsUpscaleGenerationCommand,
  type ToolsUpscaleGenerationReceipt,
} from '../../api/toolsGenerationCommands'
import i18n from '../../i18n'

type StudioState = AppState
type NativeReceipt = Awaited<ReturnType<typeof api.submitGeneration>>

export interface ToolsUpscaleSubmission {
  /** Native-shaped params for callers that display the submitted snapshot. */
  params: Record<string, unknown>
  command?: ReturnType<typeof createStudioToolsUpscaleGenerationCommand>
  receipt?: ToolsUpscaleGenerationReceipt
  submit: () => Promise<NativeReceipt>
}

function toolsFormFingerprint(state: StudioState): string {
  return stableSerialize({
    activeWorkspace: state.activeWorkspace,
    generationMode: state.generationMode,
    toolsTool: state.toolsTool,
    toolsSourcePath: state.toolsSourcePath,
    toolsSourceName: state.toolsSourceName,
    toolsSourceUrl: state.toolsSourceUrl,
    toolsSourceAssetId: state.toolsSourceAssetId,
    toolsSourceWorkspace: state.toolsSourceWorkspace,
    toolsSourceKind: state.toolsSourceKind,
    toolsUpscaleMethod: state.toolsUpscaleMethod,
    seed: state.params.seed,
    wangpProcessorSettings: state.params.wangp_processor_settings,
    settingsOpen: state.settingsOpen,
    dashboardOpen: state.dashboardOpen,
    sidebarMode: state.sidebarMode,
  })
}

function assertSameToolsForm(before: StudioState, current: StudioState): void {
  if (toolsFormFingerprint(before) !== toolsFormFingerprint(current)) {
    throw new Error(i18n.t('studio:commands.contextChanged'))
  }
}

/**
 * Prepare one Tools form snapshot for the shared durable command gateway.
 * Resolution of legacy filenames happens before this function; the builder
 * itself receives only a canonical local URL or exact asset ID.
 */
export async function prepareStudioToolsUpscaleSubmission(
  params: Record<string, unknown>,
  before: StudioState,
  current: () => StudioState,
  context?: GenerationSubmissionContext,
): Promise<ToolsUpscaleSubmission> {
  if (before.generationMode !== 'tools' || before.toolsTool !== 'upscale') {
    const error = new Error(i18n.t('studio:toolsCommands.contextChanged'))
    return {
      params,
      submit: () => Promise.reject(error),
    }
  }

  let snapshot = params
  try {
    snapshot = JSON.parse(stableSerialize(params)) as Record<string, unknown>
    assertSameToolsForm(before, current())
    const command = createStudioToolsUpscaleGenerationCommand(
      snapshot,
      context?.commandId || newToolsUpscaleGenerationIntentId(),
    )
    const submission: ToolsUpscaleSubmission = {
      params: { ...command.input.params, workspace: command.input.workspace },
      command,
      submit: async () => {
        try {
          const receipt = await submitToolsUpscaleGenerationCommand(command, {
            submissionContext: context,
            onSnapshotReady: async frozen => {
              assertSameToolsForm(before, current())
              await presentStudioToolsCommand(frozen)
              assertSameToolsForm(before, current())
            },
          })
          submission.receipt = receipt
          finishStudioToolsCommand(command.intent_id, receipt)
          return { ...receipt.result, status: receipt.status }
        } catch (error) {
          finishStudioToolsCommand(
            command.intent_id,
            undefined,
            error instanceof Error ? error.message : String(error),
          )
          throw error
        }
      },
    }
    return submission
  } catch (error) {
    return {
      params: snapshot,
      submit: () => Promise.reject(error),
    }
  }
}

/** Build the full command input from the flat store state. */
export function toolsUpscaleParamsFromState(state: StudioState): Record<string, unknown> {
  // A catalog selection carries a stronger identity than its display URL.
  // Keep that asset ID in the command so the server can resolve the exact
  // lineage rather than treating a similarly named upload as a new source.
  const source = state.toolsSourceAssetId || canonicalToolsSource(
    state.toolsSourcePath,
    state.toolsSourceUrl,
    state.toolsSourceWorkspace,
    state.activeWorkspace,
  )
  return {
    workspace: state.activeWorkspace,
    source,
    source_kind: state.toolsSourceKind,
    method: state.toolsUpscaleMethod,
    ...(state.toolsSourceAssetId && state.toolsSourceWorkspace
      ? { source_workspace: state.toolsSourceWorkspace }
      : {}),
    seed: state.params.seed ?? -1,
    wangp_processor_settings: state.params.wangp_processor_settings ?? null,
  }
}
