import type { StudioSfxGenerationCommand } from './sfxGenerationSpec'
import type { SfxGenerationReceipt } from '../../api/sfxGenerationCommands'
import { createAudioCommandPresentation, type AudioPresentation } from './audioCommandPresentation'

const presentation = createAudioCommandPresentation<StudioSfxGenerationCommand, SfxGenerationReceipt>('sfx')
export const SFX_PRESENTATION_EVENT = presentation.presentationEvent
export const SFX_RESULT_EVENT = presentation.resultEvent
export type SfxPresentation = AudioPresentation<StudioSfxGenerationCommand>
export const finishStudioSfxCommand = presentation.finish
export const presentStudioSfxCommand = presentation.present
