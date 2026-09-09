import {
  pendingSfxGenerationCommands, submitSfxGenerationCommand, subscribeSfxGenerationCommands,
  type SfxGenerationReceipt, type StudioSfxGenerationCommand,
} from '../../api/sfxGenerationCommands'
import { useUiTranslation } from '../../i18n'
import { StudioAudioCommandPanel, type AudioPanelProps, type AudioPanelConfiguration } from './StudioAudioCommandPanel'

const configuration: AudioPanelConfiguration<StudioSfxGenerationCommand, SfxGenerationReceipt> = {
  subMode: 'sfx', pendingCommands: pendingSfxGenerationCommands,
  submitCommand: submitSfxGenerationCommand, subscribeCommands: subscribeSfxGenerationCommands,
}

function SfxSummary({ command }: { command: StudioSfxGenerationCommand }) {
  const { t } = useUiTranslation('studio')
  const params = command.input.params
  return <div className="space-y-1 min-w-0">
    <div className="text-xs break-words">{String(params.model_type)} · {command.input.workspace}</div>
    <p className="text-xs whitespace-pre-wrap break-words max-h-24 overflow-auto">
      {String(params.MMAudio_prompt || params.prompt || '')}
    </p>
    <p className="text-xs text-text-muted">{params.video_guide
      ? t('sfxCommands.videoDuration') : t('sfxCommands.duration', { seconds: params.duration_seconds })}</p>
    {Boolean(params.video_guide) && <p className="text-xs break-all">{String(params.video_guide)}</p>}
  </div>
}

export function StudioSfxCommandPanel(props: AudioPanelProps<SfxGenerationReceipt>) {
  return <StudioAudioCommandPanel {...props} configuration={configuration}
    renderSummary={command => <SfxSummary command={command} />} />
}
