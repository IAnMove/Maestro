import type { ToolsUpscaleGenerationCommand, ToolsUpscaleGenerationReceipt } from '../../api/toolsGenerationCommands'
import i18n from '../../i18n'

export const TOOLS_PRESENTATION_EVENT = 'hocuspocus:studio-tools-upscale-presentation'
export const TOOLS_RESULT_EVENT = 'hocuspocus:studio-tools-upscale-result'

export interface ToolsPresentation {
  command: ToolsUpscaleGenerationCommand
  active: boolean
  respond: (error?: string) => void
}

export function finishStudioToolsCommand(
  intentId: string,
  receipt?: ToolsUpscaleGenerationReceipt,
  error?: string,
): void {
  window.dispatchEvent(new CustomEvent(TOOLS_RESULT_EVENT, { detail: { intentId, receipt, error } }))
}

async function mountedPanel(): Promise<HTMLElement> {
  const find = () => document.querySelector<HTMLElement>(
    '[data-studio-tools-ready="true"][data-studio-tools-listening="true"]',
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
      if (!panel) return
      observer.disconnect()
      clearTimeout(timer)
      resolve(panel)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-studio-tools-ready', 'data-studio-tools-listening'],
    })
  })
}

/** Wait for a visible React commit of this exact Tools request before POST. */
export async function presentStudioToolsCommand(command: ToolsUpscaleGenerationCommand): Promise<void> {
  const root = await mountedPanel()
  await new Promise<void>((resolve, reject) => {
    const request: ToolsPresentation = {
      command: structuredClone(command),
      active: true,
      respond: error => {
        if (!request.active) return
        request.active = false
        clearTimeout(timer)
        observer.disconnect()
        if (error) reject(new Error(error))
        else resolve()
      },
    }
    const timer = window.setTimeout(() => request.respond(i18n.t('studio:commands.panelUnavailable')), 8000)
    const observer = new MutationObserver(() => {
      if (!root.isConnected) request.respond(i18n.t('studio:commands.panelUnavailable'))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.dispatchEvent(new CustomEvent<ToolsPresentation>(TOOLS_PRESENTATION_EVENT, { detail: request }))
  })
  if (!root.isConnected || root.dataset.studioToolsCommand !== command.intent_id) {
    throw new Error(i18n.t('studio:commands.contextChanged'))
  }
}
