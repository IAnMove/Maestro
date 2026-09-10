import type { PresentationPlan, PresentationSpeed } from './commandContract'

export type WizardPresentationStatus = 'replayed' | 'skipped' | 'yielded'

interface ReplayOptions {
  root?: ParentNode
  wait?: (milliseconds: number) => Promise<void>
  reducedMotion?: boolean
  speed?: PresentationSpeed
}

const SPEED_MS: Record<PresentationSpeed, number> = {
  instant: 0,
  normal: 320,
  theatrical: 760,
}

function configuredSpeed(fallback: PresentationSpeed): PresentationSpeed {
  try {
    const stored = window.localStorage.getItem('hocuspocus.wizard_presentation_speed')
    return stored === 'instant' || stored === 'normal' || stored === 'theatrical' ? stored : fallback
  } catch {
    return fallback
  }
}

function editable(element: Element | null): boolean {
  if (!element || typeof HTMLElement === 'undefined') return false
  return (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement)
    || (typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement)
    || (typeof HTMLSelectElement !== 'undefined' && element instanceof HTMLSelectElement)
    || (element instanceof HTMLElement && element.isContentEditable)
}

function focusTarget(anchor: HTMLElement): HTMLElement | null {
  if (editable(anchor) || anchor instanceof HTMLButtonElement) return anchor
  return anchor.querySelector<HTMLElement>('textarea, input, select, button, [contenteditable="true"]')
}

function elementById(root: ParentNode, name: string): HTMLElement | null {
  if (typeof HTMLElement === 'undefined') return null
  if (typeof document !== 'undefined' && (root === document || root === document.documentElement || root === document.body)) {
    const node = document.getElementById(name)
    return node instanceof HTMLElement ? node : null
  }
  const node = root.querySelector(`[id="${name}"]`)
  return node instanceof HTMLElement ? node : null
}

function semanticAnchors(root: ParentNode, names: string[]): HTMLElement[] {
  const wanted = new Set(names)
  const byAttr = [...root.querySelectorAll<HTMLElement>('[data-wizard-anchor]')]
    .filter(element => wanted.has(element.dataset.wizardAnchor || ''))
  const byId = names.flatMap(name => {
    const node = elementById(root, name)
    return node ? [node] : []
  })
  const seen = new Set<HTMLElement>()
  return [...byAttr, ...byId].filter(element => {
    if (seen.has(element)) return false
    seen.add(element)
    return true
  }).sort((left, right) => {
    const leftName = left.dataset.wizardAnchor || left.id
    const rightName = right.dataset.wizardAnchor || right.id
    return names.indexOf(leftName) - names.indexOf(rightName)
  })
}

const defaultWait = (milliseconds: number) => new Promise<void>(resolve => {
  window.setTimeout(resolve, milliseconds)
})

function waitForMountedPanel(): Promise<void> {
  return new Promise(resolve => {
    const frame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0))
    frame(() => frame(() => resolve()))
  })
}

/**
 * Replays an already committed command on semantic UI anchors. It never owns
 * business state: missing/unmounted anchors cannot turn a successful command
 * into a failure.
 */
export async function replayWizardPresentation(
  plan: PresentationPlan | undefined,
  options: ReplayOptions = {},
): Promise<WizardPresentationStatus> {
  if (!plan?.anchors.length || typeof document === 'undefined') return 'skipped'
  const root = options.root || document
  let anchors = semanticAnchors(root, plan.anchors)
  if (!anchors.length) {
    // Store/API mutation happens first. Two presentation frames give a lazy
    // Studio sidebar time to mount; absence after that remains non-fatal.
    await waitForMountedPanel()
    anchors = semanticAnchors(root, plan.anchors)
  }
  if (!anchors.length) return 'skipped'
  if (editable(document.activeElement)) return 'yielded'

  const reduced = options.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const speed = options.speed || configuredSpeed(plan.speed)
  const interval = reduced ? 0 : SPEED_MS[speed]
  const wait = options.wait || defaultWait
  let yielded = false
  const yieldToUser = () => { yielded = true }
  const events: Array<keyof WindowEventMap> = ['keydown', 'input', 'pointerdown']
  events.forEach(event => window.addEventListener(event, yieldToUser, true))

  try {
    for (const [index, anchor] of anchors.entries()) {
      if (yielded) return 'yielded'
      anchor.dataset.wizardMagic = 'active'
      anchor.dataset.wizardReplay = anchor.dataset.wizardAnchor === 'prompt' ? 'fill' : 'confirm'
      if (!reduced) anchor.scrollIntoView?.({ block: 'center', behavior: speed === 'instant' ? 'auto' : 'smooth' })
      if (index === 0 && !reduced) focusTarget(anchor)?.focus({ preventScroll: true })
      if (interval) await wait(interval)
      if (yielded) return 'yielded'
      anchor.dataset.wizardMagic = 'confirmed'
      if (interval) await wait(Math.max(120, Math.round(interval * .45)))
      delete anchor.dataset.wizardMagic
      delete anchor.dataset.wizardReplay
    }
    return 'replayed'
  } finally {
    events.forEach(event => window.removeEventListener(event, yieldToUser, true))
    for (const anchor of anchors) {
      delete anchor.dataset.wizardMagic
      delete anchor.dataset.wizardReplay
    }
  }
}
