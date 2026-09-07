import { useCallback } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import { VideoTimelineSelector } from '../shared/VideoTimelineSelector'
import * as api from '../../api/client'
import { StudioSourceField } from '../../lib/StudioSourceField.tsx'
import { useWorkspaceOutputs } from '../../lib/studioAssetPick.ts'

export function RetakeControls() {
  const { t } = useUiTranslation('studio')
  const editVideoFile = useStore(s => s.editVideoFile)
  const editVideoPath = useStore(s => s.editVideoPath)
  const editVideoUrl = useStore(s => s.editVideoUrl)
  const editVideoDuration = useStore(s => s.editVideoDuration)
  const editStartTime = useStore(s => s.editStartTime)
  const editEndTime = useStore(s => s.editEndTime)
  const editRetakeStrength = useStore(s => s.editRetakeStrength)
  const editRetakeEngine = useStore(s => s.editRetakeEngine)
  const editRegenerateAudio = useStore(s => s.editRegenerateAudio)
  const setEditVideo = useStore(s => s.setEditVideo)
  const clearEditVideo = useStore(s => s.clearEditVideo)
  const activeWorkspace = useStore(s => s.activeWorkspace)
  const videoItems = useWorkspaceOutputs(activeWorkspace, 'video')

  const handleUpload = useCallback(async (file: File) => {
    try {
      const result = await api.uploadImage(file)
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.src = url
      video.onloadedmetadata = () => {
        const duration = video.duration && isFinite(video.duration) ? video.duration : 0
        const resolution = `${video.videoWidth}x${video.videoHeight}`
        setEditVideo(file, result.path, url, duration, resolution)
      }
    } catch {
      console.error('Failed to upload video')
    }
  }, [setEditVideo])

  return (
    <div className="space-y-3">
      {!editVideoFile ? (
        <StudioSourceField
          label={t('chrome.dropVideo')}
          items={videoItems}
          accept="video/*"
          kinds={['video']}
          onFile={handleUpload}
        />
      ) : (
        <div className="relative">
          <button onClick={clearEditVideo}
            className="absolute top-1.5 right-1.5 z-20 p-1 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors">
            <X size={14} />
          </button>
          <VideoTimelineSelector
            videoUrl={editVideoUrl}
            duration={editVideoDuration}
            startTime={editStartTime}
            endTime={editEndTime}
            onStartChange={t => useStore.setState({ editStartTime: t })}
            onEndChange={t => useStore.setState({ editEndTime: t })}
          />
          <p className="text-[9px] text-text-muted mt-1 truncate">{editVideoFile.name}</p>
        </div>
      )}

      {/* Regenerate Audio toggle — native engine only */}
      {editRetakeEngine === 'native' && editVideoPath && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={editRegenerateAudio}
            onChange={e => useStore.setState({ editRegenerateAudio: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-border accent-accent-blue" />
          <span className="text-[10px] text-text-secondary">{t('retake.regenerateAudio')}</span>
          <span className="text-[9px] text-text-muted ml-auto">
            {editRegenerateAudio ? t('retake.newAudio') : t('retake.keepSource')}
          </span>
        </label>
      )}

      {/* Strength — legacy engine only */}
      {editRetakeEngine === 'legacy' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-text-muted uppercase tracking-wider">{t('retake.strength')}</label>
            <span className="text-[10px] text-text-secondary">{editRetakeStrength.toFixed(2)}</span>
          </div>
          <input type="range" min={0.1} max={1} step={0.05} value={editRetakeStrength}
            onChange={e => useStore.setState({ editRetakeStrength: parseFloat(e.target.value) })} className="w-full" />
        </div>
      )}

      {/* Engine toggle */}
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">{t('retake.engine')}</label>
        <div className="flex gap-1">
          <button onClick={() => useStore.setState({ editRetakeEngine: 'native' })}
            className={`flex-1 px-2 py-1.5 text-[10px] rounded transition-colors ${
              editRetakeEngine === 'native' ? 'bg-accent-blue text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}>
            {t('retake.native')}
          </button>
          <button onClick={() => useStore.setState({ editRetakeEngine: 'legacy' })}
            className={`flex-1 px-2 py-1.5 text-[10px] rounded transition-colors ${
              editRetakeEngine === 'legacy' ? 'bg-accent-blue text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}>
            {t('retake.legacy')}
          </button>
        </div>
        <p className="text-[9px] text-text-muted mt-0.5">
          {editRetakeEngine === 'native'
            ? t('retake.nativeHint')
            : t('retake.legacyHint')}
        </p>
      </div>
    </div>
  )
}
