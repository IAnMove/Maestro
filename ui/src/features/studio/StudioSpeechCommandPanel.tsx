import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SpeechGenerationReceipt } from '../../api/speechGenerationCommands'
import {
  pendingSpeechGenerationCommands,
  submitSpeechGenerationCommand,
  subscribeSpeechGenerationCommands,
} from '../../api/speechGenerationCommands'
import i18n, { useUiTranslation } from '../../i18n'
import {
  SPEECH_PRESENTATION_EVENT,
  SPEECH_RESULT_EVENT,
  type SpeechPresentation,
} from './speechCommandPresentation'
import type { StudioSpeechGenerationCommand } from './speechGenerationSpec'

function parameters(command: StudioSpeechGenerationCommand): Record<string, unknown> {
  return command.input.params as Record<string, unknown>
}

function referenceCount(params: Record<string, unknown>): number {
  return [
    'audio_guide',
    'audio_guide2',
    'audio_guide3',
    'audio_guide4',
    'audio_guide5',
    'audio_guide6',
  ].reduce((count, field) => count + (params[field] !== undefined && params[field] !== null && params[field] !== '' ? 1 : 0), 0)
}

function RequestSummary({ command }: { command: StudioSpeechGenerationCommand }) {
  const { t } = useUiTranslation('studio')
  const params = parameters(command)
  const originalPrompt = typeof params._tts_original_prompt === 'string'
    ? params._tts_original_prompt
    : params.prompt
  // Zero is a native auto-duration sentinel for models such as DramaBox;
  // showing "0s" would make a valid restored request look empty. Keep null
  // and omitted values on the same display path until model preflight fills
  // its effective default.
  const duration = typeof params.duration_seconds === 'number' && params.duration_seconds > 0
    ? `${params.duration_seconds}s`
    : t('speechCommands.autoDuration')
  const voices = typeof params._tts_voice_count === 'number' ? params._tts_voice_count : 0
  const loras = Array.isArray(params.activated_loras) ? params.activated_loras.length : 0
  return <div className="space-y-1 min-w-0">
    <div className="text-xs break-words">{String(params.model_type)} · {duration} · {command.input.workspace}</div>
    <p className="text-xs whitespace-pre-wrap break-words max-h-24 overflow-auto">{String(originalPrompt ?? '')}</p>
    <div className="text-xs text-text-muted">{t('speechCommands.resources', {
      references: referenceCount(params), voices, loras,
    })}</div>
  </div>
}

interface Props {
  workspace: string
  model: string
  visible: boolean
  onRecovered: (receipt: SpeechGenerationReceipt) => Promise<void>
}

export function StudioSpeechCommandPanel({ workspace, model, visible, onRecovered }: Props) {
  const { t } = useUiTranslation('studio')
  const [shown, setShown] = useState<StudioSpeechGenerationCommand | null>(null)
  const [pending, setPending] = useState<StudioSpeechGenerationCommand[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<SpeechGenerationReceipt | null>(null)
  const current = useRef({ workspace, model, visible })
  const root = useRef<HTMLDivElement>(null)
  const waiting = useRef<SpeechPresentation | null>(null)
  useLayoutEffect(() => { current.current = { workspace, model, visible } }, [workspace, model, visible])

  useEffect(() => {
    const refresh = () => {
      try { setPending(pendingSpeechGenerationCommands(workspace)) }
      catch { setError(i18n.t('studio:speechCommands.pendingInvalid')) }
    }
    refresh()
    return subscribeSpeechGenerationCommands(refresh)
  }, [workspace])

  useLayoutEffect(() => {
    const elementAtSetup = root.current
    const receive = (event: Event) => {
      const request = (event as CustomEvent<SpeechPresentation>).detail
      const view = current.current
      if (!view.visible || request.command.input.workspace !== view.workspace
          || String(parameters(request.command).model_type) !== view.model || waiting.current?.active) {
        request.respond(i18n.t('studio:speechCommands.contextChanged'))
        return
      }
      waiting.current = request
      setShown(request.command)
      setBusy(true)
      setReceipt(null)
      setError('')
    }
    window.addEventListener(SPEECH_PRESENTATION_EVENT, receive)
    if (elementAtSetup) elementAtSetup.dataset.studioSpeechListening = 'true'
    // React StrictMode can simulate an effect cleanup while retaining the DOM
    // node. Defer rejection until after that probe; real navigation removes
    // the node and still receives a deterministic pre-POST failure.
    return () => {
      if (elementAtSetup) elementAtSetup.dataset.studioSpeechListening = 'false'
      const request = waiting.current
      queueMicrotask(() => {
        if (request?.active && (!elementAtSetup || !elementAtSetup.isConnected)) {
          request.respond(i18n.t('studio:speechCommands.panelUnavailable'))
        }
      })
      window.removeEventListener(SPEECH_PRESENTATION_EVENT, receive)
    }
  }, [])

  useEffect(() => {
    const complete = (event: Event) => {
      const result = (event as CustomEvent<{ intentId: string; receipt?: SpeechGenerationReceipt; error?: string }>).detail
      if (result.intentId !== shown?.intent_id) return
      setBusy(false)
      setReceipt(result.receipt || null)
      setError(result.error || '')
    }
    window.addEventListener(SPEECH_RESULT_EVENT, complete)
    return () => window.removeEventListener(SPEECH_RESULT_EVENT, complete)
  }, [shown])

  useLayoutEffect(() => {
    const request = waiting.current
    if (!request?.active || request.command !== shown || !root.current) return
    root.current.dataset.studioSpeechCommand = request.command.intent_id
    root.current.scrollIntoView?.({ block: 'nearest' })
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const view = current.current
        const valid = root.current?.isConnected && view.visible
          && view.workspace === request.command.input.workspace
          && view.model === String(parameters(request.command).model_type)
        request.respond(valid ? undefined : i18n.t('studio:speechCommands.contextChanged'))
        waiting.current = null
      })
    })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [shown])

  const recover = async (command: StudioSpeechGenerationCommand) => {
    setBusy(true)
    setError('')
    setShown(command)
    try {
      const admitted = await submitSpeechGenerationCommand(command)
      setReceipt(admitted)
      await onRecovered(admitted)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally { setBusy(false) }
  }

  return <div ref={root} data-studio-speech-ready={visible ? 'true' : 'false'} className="px-3 space-y-2">
    {shown && <section role="status" className="border border-border rounded-lg p-2 space-y-1 bg-bg-tertiary">
      <strong className="text-xs">{receipt ? t('speechCommands.admitted', { id: receipt.result.job_id }) : t('speechCommands.prepared')}</strong>
      <RequestSummary command={shown} />
    </section>}
    {pending.filter(command => !busy || command.intent_id !== shown?.intent_id).map(command => <section key={command.intent_id} className="border border-border rounded-lg p-2 space-y-2">
      <strong className="text-xs">{t('speechCommands.pending')}</strong>
      <RequestSummary command={command} />
      <button type="button" disabled={busy} onClick={() => void recover(command)}
        className="text-xs border border-border rounded px-2 py-1 disabled:opacity-50">{t('speechCommands.recover')}</button>
    </section>)}
    {error && <p role="alert" className="text-xs text-indicator-error break-words">{error}</p>}
  </div>
}
