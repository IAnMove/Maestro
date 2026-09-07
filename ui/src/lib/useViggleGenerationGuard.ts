import { useEffect, useRef, useState } from 'react'
import { useStore } from '../stores/useStore'
import { useUiTranslation } from '../i18n'

/** Validate before submission without creating a failed job or starting a download. */
export function useViggleGenerationGuard() {
  const { t } = useUiTranslation('studio')
  const generationMode = useStore(s => s.generationMode)
  const editSubMode = useStore(s => s.editSubMode)
  const editVideoPath = useStore(s => s.editVideoPath)
  const [checkingFrame, setCheckingFrame] = useState(false)
  const [frameError, setFrameError] = useState('')
  const frameCheck = useRef<AbortController | null>(null)

  const editVideoUrl = useStore(s => s.editVideoUrl)
  const reference = useStore(s => s.editRecastMappings[0])
  const modelType = useStore(s => s.params.model_type)
  const workspace = useStore(s => s.activeWorkspace)
  const isViggle = generationMode === 'avatar' && editSubMode === 'recast' && modelType === 'viggle_animate'
  useEffect(() => {
    frameCheck.current?.abort()
    frameCheck.current = null
    setCheckingFrame(false)
    setFrameError('')
    return () => frameCheck.current?.abort()
  }, [isViggle, editVideoPath, editVideoUrl, reference?.refPath, reference?.refUrl, workspace])

  const checkBeforeGenerate = async () => {
    if (frameCheck.current) return false
    if (isViggle) {
      const controller = new AbortController()
      frameCheck.current = controller
      setCheckingFrame(true)
      setFrameError('')
      try {
        const { inspectViggleFrame, viggleFrameProblem } = await import('./viggleFrame')
        const size = await inspectViggleFrame(editVideoUrl || editVideoPath, reference?.refUrl || reference?.refPath || '', controller.signal)
        if (controller.signal.aborted) return false
        if (viggleFrameProblem(size)) {
          setFrameError(t('wangp.aspectMismatch', { videoWidth: size.width, videoHeight: size.height, imageWidth: size.frameWidth, imageHeight: size.frameHeight }))
          return false
        }
      } catch {
        if (!controller.signal.aborted) setFrameError(t('wangp.mediaUnreadable'))
        return false
      } finally {
        if (frameCheck.current === controller) {
          frameCheck.current = null
          setCheckingFrame(false)
        }
      }
      const current = useStore.getState()
      if (current.params.model_type !== modelType || current.generationMode !== generationMode
        || current.editSubMode !== editSubMode || current.activeWorkspace !== workspace
        || current.editVideoPath !== editVideoPath || current.editRecastMappings[0]?.refPath !== reference?.refPath) return false
    }
    return true
  }
  return { checkingFrame, frameError, checkBeforeGenerate }
}
