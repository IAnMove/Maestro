import type { SpeechGenerationReceipt } from '../../api/speechGenerationCommands'
import {
  pendingSpeechGenerationCommands, submitSpeechGenerationCommand, subscribeSpeechGenerationCommands,
} from '../../api/speechGenerationCommands'
import { useUiTranslation } from '../../i18n'
import type { StudioSpeechGenerationCommand } from './speechGenerationSpec'
import { StudioAudioCommandPanel, type AudioPanelProps, type AudioPanelConfiguration } from './StudioAudioCommandPanel'

function parameters(command: StudioSpeechGenerationCommand): Record<string, unknown> {
  return command.input.params as Record<string, unknown>
}

function referenceCount(params: Record<string, unknown>): number {
  return [
    'audio_guide',
    'audio_guide2',
    'audio_guide3',
    'audio_guide4',
    'audio_guide5',
    'audio_guide6',
  ].reduce((count, field) => count + (params[field] !== undefined && params[field] !== null && params[field] !== '' ? 1 : 0), 0)
}

function RequestSummary({ command }: { command: StudioSpeechGenerationCommand }) {
  const { t } = useUiTranslation('studio')
  const params = parameters(command)
  const originalPrompt = typeof params._tts_original_prompt === 'string'
    ? params._tts_original_prompt
    : params.prompt
  // Zero is a native auto-duration sentinel for models such as DramaBox;
  // showing "0s" would make a valid restored request look empty. Keep null
  // and omitted values on the same display path until model preflight fills
  // its effective default.
  const duration = typeof params.duration_seconds === 'number' && params.duration_seconds > 0
    ? `${params.duration_seconds}s`
    : t('speechCommands.autoDuration')
  const voices = typeof params._tts_voice_count === 'number' ? params._tts_voice_count : 0
  const loras = Array.isArray(params.activated_loras) ? params.activated_loras.length : 0
  return <div className="space-y-1 min-w-0">
    <div className="text-xs break-words">{String(params.model_type)} · {duration} · {command.input.workspace}</div>
    <p className="text-xs whitespace-pre-wrap break-words max-h-24 overflow-auto">{String(originalPrompt ?? '')}</p>
    <div className="text-xs text-text-muted">{t('speechCommands.resources', {
      references: referenceCount(params), voices, loras,
    })}</div>
  </div>
}

const configuration: AudioPanelConfiguration<StudioSpeechGenerationCommand, SpeechGenerationReceipt> = {
  subMode: 'speech', pendingCommands: pendingSpeechGenerationCommands,
  submitCommand: submitSpeechGenerationCommand, subscribeCommands: subscribeSpeechGenerationCommands,
}

export function StudioSpeechCommandPanel(props: AudioPanelProps<SpeechGenerationReceipt>) {
  return <StudioAudioCommandPanel {...props} configuration={configuration}
    renderSummary={command => <RequestSummary command={command} />} />
}
