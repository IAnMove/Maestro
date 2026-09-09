import type { StudioSpeechGenerationCommand } from './speechGenerationSpec'
import type { SpeechGenerationReceipt } from '../../api/speechGenerationCommands'
import i18n from '../../i18n'

export const SPEECH_PRESENTATION_EVENT = 'hocuspocus:studio-speech-presentation'
export const SPEECH_RESULT_EVENT = 'hocuspocus:studio-speech-result'

export interface SpeechPresentation {
  command: StudioSpeechGenerationCommand
  active: boolean
  respond: (error?: string) => void
}

export function finishStudioSpeechCommand(
  intentId: string,
  receipt?: SpeechGenerationReceipt,
  error?: string,
): void {
  window.dispatchEvent(new CustomEvent(SPEECH_RESULT_EVENT, { detail: { intentId, receipt, error } }))
}

async function mountedSpeechPanel(): Promise<HTMLElement> {
  window.dispatchEvent(new Event('hocuspocus:studio-speech-open'))
  const find = () => document.querySelector<HTMLElement>(
    '[data-studio-speech-ready="true"][data-studio-speech-listening="true"]',
  )
  const current = find()
  if (current) return current
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      observer.disconnect()
      reject(new Error(i18n.t('studio:commands.panelUnavailable')))
    }, 8000)
    const observer = new MutationObserver(() => {
      const panel = find()
      if (panel) {
        observer.disconnect()
        clearTimeout(timer)
        resolve(panel)
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-studio-speech-ready', 'data-studio-speech-listening'],
    })
  })
}

/** Wait for a visible React commit of this exact Speech request before POST. */
export async function presentStudioSpeechCommand(command: StudioSpeechGenerationCommand): Promise<void> {
  const root = await mountedSpeechPanel()
  await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!root.isConnected) request.respond(i18n.t('studio:commands.panelUnavailable'))
    })
    const request: SpeechPresentation = {
      command: structuredClone(command),
      active: true,
      respond: error => {
        if (!request.active) return
        request.active = false
        clearTimeout(timer)
        observer?.disconnect()
        if (error) reject(new Error(error))
        else resolve()
      },
    }
    const timer = window.setTimeout(() => request.respond(i18n.t('studio:commands.panelUnavailable')), 8000)
    observer.observe(document.body, { childList: true, subtree: true })
    window.dispatchEvent(new CustomEvent<SpeechPresentation>(SPEECH_PRESENTATION_EVENT, { detail: request }))
  })
  if (!root.isConnected || root.dataset.studioSpeechCommand !== command.intent_id) {
    throw new Error(i18n.t('studio:commands.contextChanged'))
  }
}
