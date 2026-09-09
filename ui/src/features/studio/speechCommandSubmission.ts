import * as api from '../../api/client'
import { BASE } from '../../api/http'
import { stableSerialize } from '../../lib/commandContract'
import type { AppState } from '../../stores/useStore'
import type { GenerationSubmissionContext } from './generationProvenance'
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

const AUDIO_FIELDS = [
  'audio_guide',
  'audio_guide2',
  'audio_guide3',
  'audio_guide4',
  'audio_guide5',
  'audio_guide6',
] as const

type VoiceSnapshot = {
  name: string
  filename: string | null
  path: string | null
}

function voiceSnapshot(state: StudioState): VoiceSnapshot[] {
  return state.ttsVoices.map(voice => ({
    name: voice.name,
    filename: voice.filename,
    path: voice.path,
  }))
}

/**
 * Speech has controls outside `params`. Include each one in the admission
 * guard so editing a voice, its file or duration while refs are resolving can
 * never post a snapshot that no longer describes the visible form.
 */
function speechFormFingerprint(state: StudioState): string {
  return stableSerialize({
    params: state.params,
    activeWorkspace: state.activeWorkspace,
    generationMode: state.generationMode,
    audioSubMode: state.audioSubMode,
    durationSeconds: state.durationSeconds,
    ttsVoiceCount: state.ttsVoiceCount,
    ttsSpeakerName1: state.ttsSpeakerName1,
    ttsSpeakerName2: state.ttsSpeakerName2,
    ttsVoices: voiceSnapshot(state),
    settingsOpen: state.settingsOpen,
    dashboardOpen: state.dashboardOpen,
    sidebarMode: state.sidebarMode,
  })
}

function assertSameSpeechForm(before: StudioState, current: StudioState): void {
  if (speechFormFingerprint(before) !== speechFormFingerprint(current)) {
    throw new Error(i18n.t('studio:commands.contextChanged'))
  }
}

/** Convert legacy upload paths to canonical references without reading files. */
async function canonicalAudioReferences(params: Record<string, unknown>): Promise<void> {
  const fields = AUDIO_FIELDS.filter(field => {
    const value = params[field]
    return value !== undefined && value !== null && value !== ''
  })
  // Do this validation before constructing the compact reference request. A
  // restored form can contain a malformed value in one voice slot while a
  // later slot is valid. Filtering non-strings would shift the later value
  // into the earlier slot and silently attach the wrong voice after resolve.
  for (const field of fields) {
    if (typeof params[field] !== 'string') {
      throw new Error(`${field} must be a string audio reference`)
    }
  }
  const references = fields.map(field => params[field] as string)
  if (!references.length) return
  const response = await fetch(`${BASE}/api/v1/generation/commands/references`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references, media_kind: 'audio' }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: { message?: string } }
    throw new Error(body.detail?.message || i18n.t('studio:commands.referenceFailed'))
  }
  const result = await response.json() as { references?: unknown }
  if (!Array.isArray(result.references) || result.references.length !== references.length
      || result.references.some(value => typeof value !== 'string')) {
    throw new Error(i18n.t('studio:commands.referenceFailed'))
  }
  const resolved = result.references as string[]
  fields.forEach((field, index) => { params[field] = resolved[index] })
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
    snapshotParams = projectStudioSpeechFormParams(snapshotParams).params
    assertSameSpeechForm(before, current())
    await canonicalAudioReferences(snapshotParams)
    assertSameSpeechForm(before, current())
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
              assertSameSpeechForm(before, current())
              await presentStudioSpeechCommand(frozen)
              assertSameSpeechForm(before, current())
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
