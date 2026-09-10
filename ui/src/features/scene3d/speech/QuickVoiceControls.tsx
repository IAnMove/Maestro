import { useEffect, useRef, useState } from 'react'
import { useUiTranslation } from '../../../i18n'
import { recordMicrophone } from './microphone'
import { speechInput } from './FaceControls'
import { VoicePreview } from './VoicePreview'

export function QuickVoiceControls({ disabled, onAudio, onExample, onBusyChange }: {
  disabled: boolean; onAudio: (audio: Blob) => void; onExample: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const [state, setState] = useState<'idle' | 'permission' | 'recording'>('idle')
  const [preview, setPreview] = useState<{ url: string; blob: Blob }>(), [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null), stop = useRef<() => void>(() => {}), url = useRef('')
  useEffect(() => () => { controller.current?.abort(); URL.revokeObjectURL(url.current) }, [])
  useEffect(() => { onBusyChange(state !== 'idle'); return () => onBusyChange(false) }, [state, onBusyChange])
  const clearPreview = () => { URL.revokeObjectURL(url.current); url.current = ''; setPreview(undefined) }
  const fail = (caught: unknown) => {
    setState('idle')
    setError(t((caught as Error)?.name === 'NotAllowedError' ? 'speech.microphoneDenied' : 'speech.recordingFailed'))
  }
  const start = () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('speech.microphoneUnavailable')); return
    }
    clearPreview(); setError(''); setState('permission')
    const request = new AbortController(); controller.current = request
    void recordMicrophone(request.signal, {
      onRecording: () => setState('recording'),
      onComplete: blob => { url.current = URL.createObjectURL(blob); setPreview({ url: url.current, blob }); setState('idle') },
      onError: fail,
    }).then(finish => { if (!request.signal.aborted) stop.current = finish }).catch(error => { if (!request.signal.aborted) fail(error) })
  }
  return <div className="space-y-2 rounded border border-border p-2" data-testid="speech-quick-voice">
    <div className="flex flex-wrap gap-2">
      {state === 'idle' ? <>
        <button type="button" className={speechInput} disabled={disabled} onClick={onExample}>{t('speech.exampleVoice')}</button>
        <button type="button" className={speechInput} disabled={disabled} onClick={start}>{t('speech.recordVoice')}</button>
      </> : <>
        {state === 'recording' && <button type="button" className={speechInput + ' border-red-400'} onClick={() => stop.current()}>{t('speech.stopRecording')}</button>}
        <button type="button" className={speechInput} onClick={() => { controller.current?.abort(); setState('idle') }}>{t('speech.cancelRecording')}</button>
      </>}
    </div>
    {state !== 'idle' && <p role="status" className="text-xs">{t(state === 'recording' ? 'speech.recording' : 'speech.microphonePermission')}</p>}
    {preview && <div className="space-y-2">
      <VoicePreview url={preview.url} disabled={disabled} label={t('speech.recordingPreview')} />
      <button type="button" className={speechInput} disabled={disabled} onClick={() => onAudio(preview.blob)}>{t('speech.useRecording')}</button>
      <button type="button" className={speechInput} disabled={disabled} onClick={clearPreview}>{t('speech.discardRecording')}</button>
    </div>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>
}
