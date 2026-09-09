import * as api from '../../api/client'
import { assertSameAudioForm } from './audioFormSnapshot'
import { canonicalAudioReferences } from './audioCommandReferences'
import { stableSerialize } from '../../lib/commandContract'
import type { AppState } from '../../stores/useStore'
import type { GenerationSubmissionContext } from './generationProvenance'
import { neutralizeSfxOwnedFormFields } from './sfxFormResidue'
import {
  createStudioMusicGenerationCommand,
  neutralizeStudioMusicSpeechResidue,
  projectStudioMusicFormParams,
  type StudioMusicGenerationCommand,
} from './musicGenerationSpec'
import {
  finishStudioMusicCommand,
  presentStudioMusicCommand,
} from './musicCommandPresentation'
import {
  newMusicGenerationIntentId,
  submitMusicGenerationCommand,
  type MusicGenerationReceipt,
} from '../../api/musicGenerationCommands'
import i18n from '../../i18n'

type StudioState = AppState
type NativeReceipt = Awaited<ReturnType<typeof api.submitGeneration>>

export interface MusicSubmission {
  params: Record<string, unknown>
  receipt?: MusicGenerationReceipt
  submit: () => Promise<NativeReceipt>
}


function nativeParams(command: StudioMusicGenerationCommand): Record<string, unknown> {
  return { ...command.input.params, workspace: command.input.workspace }
}

/** Route Music through the durable generation.music ACK/receipt gateway. */
export async function prepareStudioMusicSubmission(
  params: Record<string, unknown>,
  before: StudioState,
  current: () => StudioState,
  context?: GenerationSubmissionContext,
  referenceErrors: string[] = [],
): Promise<MusicSubmission> {
  if (before.generationMode !== 'audio' || before.audioSubMode !== 'music') {
    return { params, submit: () => api.submitGeneration(params) }
  }

  let snapshotParams = params
  try {
    if (referenceErrors.length) throw new Error(i18n.t('studio:commands.referenceFailed'))
    snapshotParams = JSON.parse(stableSerialize(params)) as Record<string, unknown>
    // Speech voice clones share this form. Strip that residue before the
    // closed music builder sees an orphan selector or an active TTS count.
    snapshotParams = neutralizeStudioMusicSpeechResidue(snapshotParams, {
      speechVoiceCount: before.ttsVoiceCount,
    })
    // Load Settings/reroll restores the shared Studio form, which can carry
    // known video/H3 controls alongside the music fields. Project only that
    // explicit form residue; the command builder remains closed for direct
    // Wizard/MCP envelopes and rejects every other unknown key.
    snapshotParams = projectStudioMusicFormParams(
      neutralizeSfxOwnedFormFields(snapshotParams),
    ).params
    assertSameAudioForm(before, current())
    await canonicalAudioReferences(snapshotParams)
    assertSameAudioForm(before, current())
    const command = createStudioMusicGenerationCommand(
      snapshotParams,
      context?.commandId || newMusicGenerationIntentId(),
    )
    const submission: MusicSubmission = {
      params: nativeParams(command),
      submit: async () => {
        try {
          const receipt = await submitMusicGenerationCommand(command, {
            submissionContext: context,
            onSnapshotReady: async frozen => {
              assertSameAudioForm(before, current())
              await presentStudioMusicCommand(frozen)
              assertSameAudioForm(before, current())
            },
          })
          submission.receipt = receipt
          finishStudioMusicCommand(command.intent_id, receipt)
          return { ...receipt.result, status: receipt.status }
        } catch (error) {
          finishStudioMusicCommand(
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
