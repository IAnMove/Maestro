export type ProgrammaticVideoGenerationPolicy = 'provided_only' | 'no_video_generation'

export interface ProgrammaticVideoPreparation {
  intent: string
  generationPolicy: ProgrammaticVideoGenerationPolicy
  workspace: string
  outputNames: string[]
}

export interface ProgrammaticVideoPreparationAck {
  message: string
  policy: string
}

export type ProgrammaticVideoPreparationListener = (
  request: ProgrammaticVideoPreparation,
) => ProgrammaticVideoPreparationAck | Promise<ProgrammaticVideoPreparationAck>

export const PROGRAMMATIC_VIDEO_PREPARATION_TIMEOUT_MS = 20_000

const PROGRAMMATIC_VIDEO_PREPARATION_EVENT = 'hocuspocus:programmatic-video-preparation'
const MAX_INTENT_LENGTH = 12_000
const MAX_OUTPUT_NAMES = 32
const MAX_OUTPUT_NAME_LENGTH = 300

type PendingPreparation = {
  request: ProgrammaticVideoPreparation
  resolve: (ack: ProgrammaticVideoPreparationAck) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

let pendingPreparation: PendingPreparation | null = null
let activePreparation: PendingPreparation | null = null
let preparationListener: ProgrammaticVideoPreparationListener | null = null

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function settlePending(
  pending: PendingPreparation,
  outcome: { ack: ProgrammaticVideoPreparationAck } | { error: Error },
): void {
  if (pending.settled) return
  pending.settled = true
  clearTimeout(pending.timer)
  if ('ack' in outcome) pending.resolve(outcome.ack)
  else pending.reject(outcome.error)
}

function notifyListener(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(PROGRAMMATIC_VIDEO_PREPARATION_EVENT))
  }
}

async function drainPreparation(): Promise<void> {
  if (!preparationListener || activePreparation || !pendingPreparation) return
  const pending = pendingPreparation
  pendingPreparation = null
  activePreparation = pending
  const listener = preparationListener
  try {
    const ack = await listener(pending.request)
    if (!ack || typeof ack.message !== 'string' || typeof ack.policy !== 'string') {
      throw new Error('Programmatic Video3D form returned an invalid acknowledgement.')
    }
    settlePending(pending, { ack })
  } catch (reason) {
    settlePending(pending, { error: new Error(errorMessage(reason)) })
  } finally {
    if (activePreparation === pending) activePreparation = null
  }
}

function validatePreparation(request: ProgrammaticVideoPreparation): ProgrammaticVideoPreparation {
  if (!request || typeof request !== 'object') throw new Error('Programmatic Video3D preparation is required.')
  const intent = typeof request.intent === 'string' ? request.intent : ''
  if (!intent.trim()) throw new Error('Programmatic Video3D preparation needs an intent.')
  if (intent.length > MAX_INTENT_LENGTH) throw new Error('Programmatic Video3D intent is too long.')
  if (request.generationPolicy !== 'provided_only' && request.generationPolicy !== 'no_video_generation') {
    throw new Error('Programmatic Video3D preparation has an invalid generation policy.')
  }
  const workspace = typeof request.workspace === 'string' ? request.workspace.trim() : ''
  if (!workspace) throw new Error('Programmatic Video3D preparation needs a workspace.')
  if (!Array.isArray(request.outputNames)) throw new Error('Programmatic Video3D preparation needs output names.')
  if (request.outputNames.length > MAX_OUTPUT_NAMES) throw new Error('Programmatic Video3D preparation has too many output names.')
  const outputNames = request.outputNames.map(name => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Programmatic Video3D output names must be non-empty strings.')
    if (name.length > MAX_OUTPUT_NAME_LENGTH) throw new Error('A Programmatic Video3D output name is too long.')
    return name
  })
  if (new Set(outputNames).size !== outputNames.length) throw new Error('Programmatic Video3D output names must be unique.')
  return { intent, generationPolicy: request.generationPolicy, workspace, outputNames }
}

/**
 * Hand one preparation to the mounted Video3D recipe form.
 *
 * There is deliberately one bounded handoff rather than a queue: navigation
 * may mount the lazy panel after this call, but a second request is rejected
 * and an unmounted panel cannot retain work forever.
 */
export function requestProgrammaticVideoPreparation(
  request: ProgrammaticVideoPreparation,
): Promise<ProgrammaticVideoPreparationAck> {
  let normalized: ProgrammaticVideoPreparation
  try {
    normalized = validatePreparation(request)
  } catch (reason) {
    return Promise.reject(new Error(errorMessage(reason)))
  }
  if (pendingPreparation || activePreparation) {
    return Promise.reject(new Error('A Programmatic Video3D preparation is already in progress.'))
  }
  return new Promise<ProgrammaticVideoPreparationAck>((resolve, reject) => {
    const pending: PendingPreparation = {
      request: normalized,
      resolve,
      reject,
      timer: setTimeout(() => {
        if (pendingPreparation === pending) pendingPreparation = null
        if (activePreparation === pending) activePreparation = null
        settlePending(pending, { error: new Error('Timed out waiting for the Video3D recipe form to mount.') })
      }, PROGRAMMATIC_VIDEO_PREPARATION_TIMEOUT_MS),
      settled: false,
    }
    pendingPreparation = pending
    notifyListener()
    void drainPreparation()
  })
}

/**
 * Listen for one preparation at a time. The listener is responsible for
 * checking the current workspace and acknowledging only after its React form
 * has reflected the request.
 */
export function listenForProgrammaticVideoPreparation(
  listener: ProgrammaticVideoPreparationListener,
): () => void {
  if (preparationListener) throw new Error('A Programmatic Video3D preparation listener is already mounted.')
  preparationListener = listener
  const handler = () => { void drainPreparation() }
  if (typeof window !== 'undefined') window.addEventListener(PROGRAMMATIC_VIDEO_PREPARATION_EVENT, handler)
  void drainPreparation()
  return () => {
    if (preparationListener !== listener) return
    preparationListener = null
    if (typeof window !== 'undefined') window.removeEventListener(PROGRAMMATIC_VIDEO_PREPARATION_EVENT, handler)
    if (pendingPreparation) {
      const pending = pendingPreparation
      pendingPreparation = null
      settlePending(pending, { error: new Error('The Video3D recipe form was unmounted before preparation.') })
    }
    if (activePreparation) {
      const active = activePreparation
      activePreparation = null
      settlePending(active, { error: new Error('The Video3D recipe form was unmounted before preparation.') })
    }
  }
}
