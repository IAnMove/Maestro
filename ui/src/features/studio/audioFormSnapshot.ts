import type { AppState } from '../../stores/useStore'
import { stableSerialize } from '../../lib/commandContract'
import i18n from '../../i18n'

/** Include shared controls and each tab's inputs outside params in its admission guard. */
function audioFormFingerprint(state: AppState): string {
  return stableSerialize({
    params: state.params, activeWorkspace: state.activeWorkspace,
    generationMode: state.generationMode, audioSubMode: state.audioSubMode,
    durationSeconds: state.durationSeconds,
    settingsOpen: state.settingsOpen, dashboardOpen: state.dashboardOpen,
    sidebarMode: state.sidebarMode,
    ...(state.audioSubMode === 'speech' ? {
      ttsVoiceCount: state.ttsVoiceCount,
      ttsSpeakerName1: state.ttsSpeakerName1,
      ttsSpeakerName2: state.ttsSpeakerName2,
      ttsVoices: state.ttsVoices.map(voice => ({
        name: voice.name,
        filename: voice.filename,
        path: voice.path,
      })),
    } : {}),
    ...(state.audioSubMode === 'music' ? {
      musicDescription: state.musicDescription,
      musicInstrumental: state.musicInstrumental,
    } : {}),
  })
}

export function assertSameAudioForm(before: AppState, current: AppState): void {
  if (audioFormFingerprint(before) !== audioFormFingerprint(current)) {
    throw new Error(i18n.t(before.audioSubMode === 'sfx'
      ? 'studio:sfxCommands.contextChanged' : 'studio:commands.contextChanged'))
  }
}
