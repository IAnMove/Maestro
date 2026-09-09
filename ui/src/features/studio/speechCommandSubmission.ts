import * as api from '../../api/client'
import { assertSameAudioForm } from './audioFormSnapshot'
import { canonicalAudioReferences } from './audioCommandReferences'
import { stableSerialize } from '../../lib/commandContract'
import type { AppState } from '../../stores/useStore'
import type { GenerationSubmissionContext } from './generationProvenance'
import { neutralizeSfxOwnedFormFields } from './sfxFormResidue'
import {
  createStudioSpeechGenerationCommand,
  projectStudioSpeechFormParams,
  type StudioSpeechGenerationCommand,
} from './speechGenerationSpec'
import {
  finishStudioSpeechCommand,
  presentStudioSpeechCommand,
} from './speechCommandPresentation'
import {
  newSpeechGenerationIntentId,
  submitSpeechGenerationCommand,
  type SpeechGenerationReceipt,
} from '../../api/speechGenerationCommands'
import i18n from '../../i18n'

type StudioState = AppState
type NativeReceipt = Awaited<ReturnType<typeof api.submitGeneration>>

export interface SpeechSubmission {
  params: Record<string, unknown>
  receipt?: SpeechGenerationReceipt
  submit: () => Promise<NativeReceipt>
}


function nativeParams(command: StudioSpeechGenerationCommand): Record<string, unknown> {
  return { ...command.input.params, workspace: command.input.workspace }
}

/** Route Speech through the durable generation.speech ACK/receipt gateway. */
export async function prepareStudioSpeechSubmission(
  params: Record<string, unknown>,
  before: StudioState,
  current: () => StudioState,
  context?: GenerationSubmissionContext,
  referenceErrors: string[] = [],
): Promise<SpeechSubmission> {
  if (before.generationMode !== 'audio' || before.audioSubMode !== 'speech') {
    return { params, submit: () => api.submitGeneration(params) }
  }

  let snapshotParams = params
  try {
    if (referenceErrors.length) throw new Error(i18n.t('studio:commands.referenceFailed'))
    snapshotParams = JSON.parse(stableSerialize(params)) as Record<string, unknown>
    // Load Settings/reroll restores the shared Studio form, which can carry
    // known video/H3 controls alongside the speech fields. Project only that
    // explicit form residue; the command builder remains closed for direct
    // Wizard/MCP envelopes and rejects every other unknown key.
    snapshotParams = projectStudioSpeechFormParams(
      neutralizeSfxOwnedFormFields(snapshotParams),
    ).params
    assertSameAudioForm(before, current())
    await canonicalAudioReferences(snapshotParams)
    assertSameAudioForm(before, current())
    const command = createStudioSpeechGenerationCommand(
      snapshotParams,
      context?.commandId || newSpeechGenerationIntentId(),
    )
    const submission: SpeechSubmission = {
      params: nativeParams(command),
      submit: async () => {
        try {
          const receipt = await submitSpeechGenerationCommand(command, {
            submissionContext: context,
            onSnapshotReady: async frozen => {
              assertSameAudioForm(before, current())
              await presentStudioSpeechCommand(frozen)
              assertSameAudioForm(before, current())
            },
          })
          submission.receipt = receipt
          finishStudioSpeechCommand(command.intent_id, receipt)
          return { ...receipt.result, status: receipt.status }
        } catch (error) {
          finishStudioSpeechCommand(
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
