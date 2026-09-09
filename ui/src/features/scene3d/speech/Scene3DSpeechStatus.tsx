import type { Scene3DDocument } from '../types'
import { mouthAt } from './track'
import { VISEMES } from './types'
import { speechClips } from './timeline'
import { useUiTranslation } from '../../../i18n'
/** Live readout helps identify whose turn needs manual timing/calibration. */
export function Scene3DSpeechStatus({ document, seconds }: { document: Scene3DDocument; seconds: number }) {
  const { t } = useUiTranslation('scene3dEditor')
  return <div className="flex flex-wrap gap-2 text-xs" aria-label={t('speech.interventions')}>
    {document.slots.filter(slot => slot.speech?.enabled).map(slot => {
      const speech = slot.speech!, viseme = VISEMES[mouthAt(speech, seconds).b]
      const clip = speechClips(speech).find(item => seconds >= item.start && seconds < (item.end ?? 600))
      return <span key={slot.id} data-testid="speech-state" data-speaker={slot.id} data-viseme={viseme}
        className={'max-w-full truncate rounded border px-3 py-2 ' + (viseme === 'rest' ? 'border-border text-text-muted' : 'border-cyan-400/50 text-cyan-200')}>
        {slot.character?.name || slot.slot} · {viseme === 'rest' ? t('speech.resting') : clip?.text || t('speech.speaking')}
      </span>
    })}
  </div>
}
