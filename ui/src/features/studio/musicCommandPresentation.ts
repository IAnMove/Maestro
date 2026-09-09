import type { StudioMusicGenerationCommand } from './musicGenerationSpec'
import type { MusicGenerationReceipt } from '../../api/musicGenerationCommands'
import { createAudioCommandPresentation, type AudioPresentation } from './audioCommandPresentation'

const presentation = createAudioCommandPresentation<StudioMusicGenerationCommand, MusicGenerationReceipt>('music')
export const MUSIC_PRESENTATION_EVENT = presentation.presentationEvent
export const MUSIC_RESULT_EVENT = presentation.resultEvent
export type MusicPresentation = AudioPresentation<StudioMusicGenerationCommand>
export const finishStudioMusicCommand = presentation.finish
export const presentStudioMusicCommand = presentation.present
