import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { useUiTranslation } from '../../i18n'
import type { PickerItem } from './types.ts'

const PREVIEW_BYTE_LIMIT = 80 * 1024 * 1024

function pauseMedia(element: HTMLMediaElement | null) {
  if (!element) return
  try { element.pause() } catch { /* jsdom does not implement media playback */ }
  element.removeAttribute('src')
  try { element.load() } catch { /* jsdom does not implement media playback */ }
}

function GlbPreview({ url }: { url: string }) {
  const { t } = useUiTranslation('common')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void import('@google/model-viewer').then(() => {
      if (!cancelled) setReady(true)
    }).catch(() => {
      if (!cancelled) setReady(false)
    })
    return () => { cancelled = true }
  }, [url])
  if (!ready) return <p className="p-2 text-center text-[10px] text-text-muted">{t('explorer.loading')}</p>
  return <model-viewer src={url} camera-controls className="h-full w-full" />
}

export function AssetPreviewPlayer({ item }: { item: PickerItem }) {
  const { t } = useUiTranslation('common')
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [armedUrl, setArmedUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const armed = armedUrl === item.url
  const large = item.sizeBytes > PREVIEW_BYTE_LIMIT

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    return () => {
      pauseMedia(video)
      pauseMedia(audio)
    }
  }, [item.url, armed])

  if (failed) {
    return <p className="p-2 text-center text-[10px] text-text-muted">{t('explorer.previewFailed')}</p>
  }
  if (item.kind === 'scene') {
    return item.thumbnailUrl
      ? <img src={item.thumbnailUrl} alt={t('explorer.previewAria', { name: item.filename })} className="h-full w-full object-contain" onError={() => setFailed(true)} />
      : <p className="p-2 text-center text-[10px] text-text-muted">{t('explorer.selectHint')}</p>
  }
  if (item.kind === 'image') {
    return <img src={item.url} alt={t('explorer.previewAria', { name: item.filename })} className="h-full w-full object-contain" onError={() => setFailed(true)} />
  }
  if (!armed) {
    return (
      <button
        type="button"
        data-testid="asset-preview-arm"
        aria-label={item.kind === 'model3d' ? t('explorer.view3d') : t('explorer.playPreview')}
        onClick={() => { setFailed(false); setArmedUrl(item.url) }}
        className="relative flex h-full w-full items-center justify-center"
      >
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-70" /> : null}
        <span className="relative rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
          {large ? t('explorer.tooLarge') : item.kind === 'model3d' ? t('explorer.view3d') : t('explorer.playPreview')}
        </span>
        {item.kind !== 'model3d' && <Play size={16} className="relative ml-1 text-white" />}
      </button>
    )
  }
  if (item.kind === 'video') {
    return (
      <video
        ref={videoRef}
        data-testid="asset-preview-video"
        src={item.url}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    )
  }
  if (item.kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center px-2">
        <audio
          ref={audioRef}
          data-testid="asset-preview-audio"
          src={item.url}
          controls
          preload="metadata"
          className="w-full"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }
  if (item.kind === 'model3d') {
    return <GlbPreview url={item.url} />
  }
  return <p className="p-2 text-center text-[10px] text-text-muted">{t('explorer.selectHint')}</p>
}
