import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import { ImageRefSection } from './ImageRefSection'
import { WangpMediaInput } from './WangpMediaInput'

export function WangpReferenceControls() {
  const { t } = useUiTranslation('studio')
  const params = useStore(s => s.params)
  const setParams = useStore(s => s.setParams)
  if (!String(params.model_type).startsWith('h3_advanced_ref2va')) return null
  const flags = String(params.video_prompt_type || '')
  const imageFlags = flags.includes('I') ? 'I' : ''
  const tileFlags = flags.includes('~') ? '~' : ''
  return <section className="space-y-2">
    <ImageRefSection />
    <WangpMediaInput label={t('wangp.referenceVideo')} kind="video" path={String(params.video_guide || '')} onChoose={item => setParams({ video_guide: item?.url || '', video_prompt_type: imageFlags + (item ? 'V-U' : '') + tileFlags })} />
    <WangpMediaInput label={t('wangp.referenceAudio')} kind="audio" path={String(params.audio_guide || '')} onChoose={item => setParams({ audio_guide: item?.url || '', audio_prompt_type: item ? 'A' : '' })} />
    <p className="text-[11px] text-text-muted">{t('wangp.referenceHint')}</p>
  </section>
}
