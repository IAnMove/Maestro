import { useEffect, useMemo } from 'react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import type { ApiOutput } from '../../api/outputs'
import { replacementImageModels } from './generation'
import { useReplacementSessions, newReplacementSession, replacementIsBusy, type ReplacementSession } from './session'
import { captureReplacementFrame, generateReplacementImage, generateReplacementVideo, cancelReplacementJob, editReplacementSession } from './actions'

export function useCharacterReplacement() {
  const { t } = useUiTranslation('studio')
  const workspace = useStore(state => state.activeWorkspace)
  const models = useStore(state => state.models)
  const stored = useReplacementSessions(state => state.sessions[workspace])
  const initial = useMemo(() => {
    const studio = useStore.getState()
    const candidate = studio.editVideoUrl || studio.editVideoPath
    const scope = candidate.startsWith('/api/v1/file/')
      ? new URL(candidate, 'http://local.invalid').searchParams.get('workspace') : null
    const url = scope && scope !== workspace ? '' : candidate
    const source: ApiOutput | null = url ? {
      name: url.split('/').pop()?.split('?')[0] || 'video', url, type: 'video', mode: null,
      created_at: 0, size: 0,
    } : null
    return newReplacementSession(t('characterReplacement.defaultPrompt'), source)
  }, [workspace, t])
  useEffect(() => {
    if (!useReplacementSessions.getState().sessions[workspace]) {
      useReplacementSessions.setState(state => ({ sessions: { ...state.sessions, [workspace]: initial } }))
    }
  }, [workspace, initial])
  const session = stored || initial
  const edit = (patch: Partial<ReplacementSession>, invalidate?: 'source' | 'image' | 'video' | 'none') => editReplacementSession(workspace, patch, invalidate)
  return {
    workspace, session, busy: replacementIsBusy(session), imageModels: replacementImageModels(models),
    setSource: (source: ApiOutput | null) => edit({ source }, 'source'),
    setCharacter: (character: ApiOutput | null) => edit({ character }, 'image'),
    setFrameTime: (frameTime: number) => edit({ frameTime }),
    setVideoMetadata: (metadata: { duration: number; width: number; height: number }) => {
      if (Object.values(metadata).every(value => Number.isFinite(value) && value > 0)) edit(metadata)
    },
    captureFrame: (time: number) => captureReplacementFrame(workspace, time),
    setPrompt: (prompt: string) => edit({ prompt }, 'image'),
    setModel: (modelType: string) => edit({ modelType }, 'image'),
    setQuality: (quality: ReplacementSession['quality']) => edit({ quality }, 'video'),
    setAudio: (audio: ReplacementSession['audio']) => edit({ audio }, 'video'),
    generateFrame: () => generateReplacementImage(workspace),
    generateVideo: () => generateReplacementVideo(workspace, size => t('wangp.aspectMismatch', {
      videoWidth: size.width, videoHeight: size.height, imageWidth: size.frameWidth, imageHeight: size.frameHeight,
    })),
    cancelImage: () => cancelReplacementJob(workspace, 'imageJob'),
    cancelVideo: () => cancelReplacementJob(workspace, 'videoJob'),
  }
}
