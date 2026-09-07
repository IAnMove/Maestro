import { useState } from 'react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import { WangpMediaInput } from './WangpMediaInput'

export function ViggleControls() {
  const { t } = useUiTranslation('studio')
  const source = useStore(s => s.editVideoPath)
  const restoreError = useStore(s => s.wangpRestoreError)
  const sourceUrl = useStore(s => s.editVideoUrl)
  const reference = useStore(s => s.editRecastMappings[0])
  const setVideo = useStore(s => s.setEditVideo)
  const clearVideo = useStore(s => s.clearEditVideo)
  const setReference = useStore(s => s.setEditRecastRef)
  const editFrame = useStore(s => s.sendFrameToImageMode)
  const audio = useStore(s => s.params.viggle_audio_mode)
  const setParam = useStore(s => s.setParam)
  const resolution = useStore(s => s.editRecastResolutionProfile)
  const setResolution = (value: '480p' | '512p' | '704p') => useStore.setState({ editRecastResolutionProfile: value })
  const [editing, setEditing] = useState(false)
  return <section className="space-y-3" aria-label="Viggle-Animate">
    <p className="text-xs text-text-secondary">{t('wangp.viggleHint')}</p>
    {!!restoreError && <p role="alert" className="text-xs text-red-400">{String(restoreError)} {t('wangp.reselectMedia')}</p>}
    <WangpMediaInput label={t('wangp.controlVideo')} kind="video" path={source} url={sourceUrl} onChoose={item => {
      clearVideo()
      setReference(null, '', '', false)
      if (item) setVideo(null, item.url, item.url, 0, '')
    }} />
    {sourceUrl && <video key={sourceUrl} src={sourceUrl} controls preload="metadata" className="w-full rounded-lg"
      onLoadedMetadata={event => {
        const video = event.currentTarget
        if (Number.isFinite(video.duration)) useStore.setState({ editVideoDuration: video.duration, editVideoResolution: `${video.videoWidth}x${video.videoHeight}` })
      }} />}
    <button type="button" disabled={!source || editing} className="w-full rounded-lg border border-border p-2 text-xs disabled:opacity-40"
      onClick={async () => { setEditing(true); try { await editFrame('recast') } finally { setEditing(false) } }}>
      {t('wangp.editFrame')}
    </button>
    <WangpMediaInput label={t('wangp.editedFrame')} kind="image" path={reference?.refPath} url={reference?.refUrl}
      onChoose={item => setReference(null, item?.url || '', item?.url || '', true)} />
    {reference?.refUrl && <img src={reference.refUrl} alt={t('wangp.editedFrame')} className="w-full rounded-lg" />}
    <label className="block text-xs">{t('wangp.resolution')}
      <select className="w-full bg-bg-tertiary border border-border rounded-lg p-2" value={resolution} onChange={event => setResolution(event.target.value as '480p' | '512p' | '704p')}>
        <option value="480p">480p</option><option value="512p">512p</option><option value="704p">704p</option>
      </select>
    </label>
    <label className="block text-xs">{t('wangp.audio')}
      <select className="w-full bg-bg-tertiary border border-border rounded-lg p-2" value={audio === 'generated' ? 'generated' : 'source'} onChange={event => setParam('viggle_audio_mode', event.target.value === 'generated' ? 'generated' : 'source')}>
        <option value="source">{t('wangp.sourceAudio')}</option><option value="generated">{t('wangp.generatedAudio')}</option>
      </select>
    </label>
    <p className="text-[11px] text-text-muted">{t('wangp.viggleSampling')}</p>
  </section>
}
