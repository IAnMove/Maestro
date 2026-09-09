import type { StudioSpeechGenerationCommand } from './speechGenerationSpec'
import type { SpeechGenerationReceipt } from '../../api/speechGenerationCommands'
import { createAudioCommandPresentation, type AudioPresentation } from './audioCommandPresentation'

const presentation = createAudioCommandPresentation<StudioSpeechGenerationCommand, SpeechGenerationReceipt>('speech')
export const SPEECH_PRESENTATION_EVENT = presentation.presentationEvent
export const SPEECH_RESULT_EVENT = presentation.resultEvent
export type SpeechPresentation = AudioPresentation<StudioSpeechGenerationCommand>
export const finishStudioSpeechCommand = presentation.finish
export const presentStudioSpeechCommand = presentation.present
