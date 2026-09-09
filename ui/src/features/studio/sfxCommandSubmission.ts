import * as api from '../../api/client'
import { canonicalVideoReference } from './videoCommandReferences'
import { stableSerialize } from '../../lib/commandContract'
import type { AppState } from '../../stores/useStore'
import type { GenerationSubmissionContext } from './generationProvenance'
import {
  createStudioSfxGenerationCommand,
  projectStudioSfxFormParams,
  type StudioSfxGenerationCommand,
} from './sfxGenerationSpec'
import {
  finishStudioSfxCommand,
  presentStudioSfxCommand,
} from './sfxCommandPresentation'
import {
  newSfxGenerationIntentId,
  submitSfxGenerationCommand,
  type SfxGenerationReceipt,
} from '../../api/sfxGenerationCommands'
import i18n from '../../i18n'

type StudioState = AppState
type NativeReceipt = Awaited<ReturnType<typeof api.submitGeneration>>

export interface SfxSubmission {
  params: Record<string, unknown>
  receipt?: SfxGenerationReceipt
  submit: () => Promise<NativeReceipt>
}

/** Include all visible sfx inputs in the pre-admission guard. */
function sfxFormFingerprint(state: StudioState): string {
  return stableSerialize({
    params: state.params, activeWorkspace: state.activeWorkspace,
    generationMode: state.generationMode, audioSubMode: state.audioSubMode,
    durationSeconds: state.durationSeconds,
    settingsOpen: state.settingsOpen, dashboardOpen: state.dashboardOpen,
    sidebarMode: state.sidebarMode,
  })
}

function assertSameSfxForm(before: StudioState, current: StudioState): void {
  if (sfxFormFingerprint(before) !== sfxFormFingerprint(current)) {
    throw new Error(i18n.t('studio:sfxCommands.contextChanged'))
  }
}

function nativeParams(command: StudioSfxGenerationCommand): Record<string, unknown> {
  return { ...command.input.params, workspace: command.input.workspace }
}

/** Route Sfx through the durable generation.sfx ACK/receipt gateway. */
export async function prepareStudioSfxSubmission(
  params: Record<string, unknown>,
  before: StudioState,
  current: () => StudioState,
  context?: GenerationSubmissionContext,
  referenceErrors: string[] = [],
): Promise<SfxSubmission> {
  if (before.generationMode !== 'audio' || before.audioSubMode !== 'sfx') {
    return { params, submit: () => api.submitGeneration(params) }
  }

  let snapshotParams = params
  try {
    if (referenceErrors.length) throw new Error(i18n.t('studio:commands.referenceFailed'))
    snapshotParams = JSON.parse(stableSerialize(params)) as Record<string, unknown>
    // Load Settings/reroll restores the shared Studio form, which can carry
    // known video/H3 controls alongside the sfx fields. Project only that
    // explicit form residue; the command builder remains closed for direct
    // Wizard/MCP envelopes and rejects every other unknown key.
    snapshotParams = projectStudioSfxFormParams(snapshotParams)
    assertSameSfxForm(before, current())
    await canonicalVideoReference(snapshotParams)
    assertSameSfxForm(before, current())
    const command = createStudioSfxGenerationCommand(
      snapshotParams,
      context?.commandId || newSfxGenerationIntentId(),
    )
    const submission: SfxSubmission = {
      params: nativeParams(command),
      submit: async () => {
        try {
          const receipt = await submitSfxGenerationCommand(command, {
            submissionContext: context,
            onSnapshotReady: async frozen => {
              assertSameSfxForm(before, current())
              await presentStudioSfxCommand(frozen)
              assertSameSfxForm(before, current())
            },
          })
          submission.receipt = receipt
          finishStudioSfxCommand(command.intent_id, receipt)
          return { ...receipt.result, status: receipt.status }
        } catch (error) {
          finishStudioSfxCommand(
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
    return { params: snapshotParams, submit: () => Promise.reject(error) }
  }
}
