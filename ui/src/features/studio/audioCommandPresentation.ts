import i18n from '../../i18n'

export interface AudioPresentation<C> {
  command: C
  active: boolean
  respond: (error?: string) => void
}

/** One ACK lifecycle for each native audio panel, with domain-specific events. */
export function createAudioCommandPresentation<C extends { intent_id: string }, R>(
  subMode: 'speech' | 'music' | 'sfx',
) {
  const presentationEvent = `hocuspocus:studio-${subMode}-presentation`
  const resultEvent = `hocuspocus:studio-${subMode}-result`
  function finish(intentId: string, receipt?: R, error?: string): void {
    window.dispatchEvent(new CustomEvent(resultEvent, { detail: { intentId, receipt, error } }))
  }

  async function mountedPanel(): Promise<HTMLElement> {
    window.dispatchEvent(new Event(`hocuspocus:studio-${subMode}-open`))
    const find = () => document.querySelector<HTMLElement>(
      `[data-studio-${subMode}-ready="true"][data-studio-${subMode}-listening="true"]`,
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
        attributeFilter: [`data-studio-${subMode}-ready`, `data-studio-${subMode}-listening`],
      })
    })
  }

  /** Wait for a visible React commit of this exact audio request before POST. */
  async function present(command: C): Promise<void> {
    const root = await mountedPanel()
    await new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!root.isConnected) request.respond(i18n.t('studio:commands.panelUnavailable'))
      })
      const request: AudioPresentation<C> = {
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
      window.dispatchEvent(new CustomEvent<AudioPresentation<C>>(presentationEvent, { detail: request }))
    })
    if (!root.isConnected || root.getAttribute(`data-studio-${subMode}-command`) !== command.intent_id) {
      throw new Error(i18n.t('studio:commands.contextChanged'))
    }
  }

  return { present, finish, presentationEvent, resultEvent }
}
