import type { StudioMusicGenerationCommand } from './musicGenerationSpec'
import type { MusicGenerationReceipt } from '../../api/musicGenerationCommands'
import i18n from '../../i18n'

export const MUSIC_PRESENTATION_EVENT = 'hocuspocus:studio-music-presentation'
export const MUSIC_RESULT_EVENT = 'hocuspocus:studio-music-result'

export interface MusicPresentation {
  command: StudioMusicGenerationCommand
  active: boolean
  respond: (error?: string) => void
}

export function finishStudioMusicCommand(
  intentId: string,
  receipt?: MusicGenerationReceipt,
  error?: string,
): void {
  window.dispatchEvent(new CustomEvent(MUSIC_RESULT_EVENT, { detail: { intentId, receipt, error } }))
}

async function mountedMusicPanel(): Promise<HTMLElement> {
  window.dispatchEvent(new Event('hocuspocus:studio-music-open'))
  const find = () => document.querySelector<HTMLElement>(
    '[data-studio-music-ready="true"][data-studio-music-listening="true"]',
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
      attributeFilter: ['data-studio-music-ready', 'data-studio-music-listening'],
    })
  })
}

/** Wait for a visible React commit of this exact Music request before POST. */
export async function presentStudioMusicCommand(command: StudioMusicGenerationCommand): Promise<void> {
  const root = await mountedMusicPanel()
  await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!root.isConnected) request.respond(i18n.t('studio:commands.panelUnavailable'))
    })
    const request: MusicPresentation = {
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
    window.dispatchEvent(new CustomEvent<MusicPresentation>(MUSIC_PRESENTATION_EVENT, { detail: request }))
  })
  if (!root.isConnected || root.dataset.studioMusicCommand !== command.intent_id) {
    throw new Error(i18n.t('studio:commands.contextChanged'))
  }
}
