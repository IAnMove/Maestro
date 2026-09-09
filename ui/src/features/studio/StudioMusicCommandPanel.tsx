import {
  pendingMusicGenerationCommands, submitMusicGenerationCommand, subscribeMusicGenerationCommands,
  type MusicGenerationReceipt, type StudioMusicGenerationCommand,
} from '../../api/musicGenerationCommands'
import { useUiTranslation } from '../../i18n'
import { StudioAudioCommandPanel, type AudioPanelProps, type AudioPanelConfiguration } from './StudioAudioCommandPanel'

const configuration: AudioPanelConfiguration<StudioMusicGenerationCommand, MusicGenerationReceipt> = {
  subMode: 'music', pendingCommands: pendingMusicGenerationCommands,
  submitCommand: submitMusicGenerationCommand, subscribeCommands: subscribeMusicGenerationCommands,
}

function MusicSummary({ command }: { command: StudioMusicGenerationCommand }) {
  const { t } = useUiTranslation('studio')
  const params = command.input.params
  const references = ['audio_guide', 'audio_guide2'].filter(field => Boolean(params[field as keyof typeof params])).length
  return <div className="space-y-1 min-w-0">
    <div className="text-xs break-words">
      {String(params.model_type)} · {params.duration_seconds === undefined
        ? t('musicCommands.defaultDuration') : `${String(params.duration_seconds)}s`} · {command.input.workspace}
    </div>
    <p className="text-xs whitespace-pre-wrap break-words max-h-24 overflow-auto" aria-label={t('musicCommands.lyrics')}>
      {String(params.prompt ?? '')}
    </p>
    <p className="text-xs whitespace-pre-wrap break-words max-h-24 overflow-auto" aria-label={t('musicCommands.caption')}>
      {String(params.alt_prompt ?? '')}
    </p>
    <div className="text-xs text-text-muted">{t('musicCommands.resources', {
      references, loras: Array.isArray(params.activated_loras) ? params.activated_loras.length : 0,
    })}</div>
  </div>
}

export function StudioMusicCommandPanel(props: AudioPanelProps<MusicGenerationReceipt>) {
  return <StudioAudioCommandPanel {...props} configuration={configuration}
    renderSummary={command => <MusicSummary command={command} />} />
}
