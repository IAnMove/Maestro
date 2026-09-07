import type { Scene3DCameraFamily, Scene3DDocument, Scene3DSlotId } from './types.ts'
import { applyScene3DTemplate, type Scene3DTemplateId } from './templates.ts'

export type World3DWizardRequest = {
  type: 'mount_world3d_template'
  templateId: Scene3DTemplateId
  bindings?: Partial<Record<Scene3DSlotId, { url: string; name?: string; media?: 'model3d' | 'image' }>>
  cameraFamily?: Scene3DCameraFamily
}

export type World3DWizardResult = {
  message: string
  templateId: Scene3DTemplateId
  slotIds: string[]
}

const EVENT = 'hocuspocus:world3d-workflow-request'

type Pending = {
  request: World3DWizardRequest
  resolve: (result: World3DWizardResult) => void
  reject: (error: Error) => void
}

const pending: Pending[] = []

export function requestWorld3DWorkflow(request: World3DWizardRequest): Promise<World3DWizardResult> {
  return new Promise((resolve, reject) => {
    pending.push({ request, resolve, reject })
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
  })
}

export function listenForWorld3DWorkflow(
  listener: (request: World3DWizardRequest) => Promise<World3DWizardResult>,
): () => void {
  let active = true
  const drain = async () => {
    while (active && pending.length) {
      const item = pending.shift()
      if (!item) continue
      try { item.resolve(await listener(item.request)) }
      catch (error) { item.reject(error instanceof Error ? error : new Error(String(error))) }
    }
  }
  const handler = () => { void drain() }
  if (typeof window === 'undefined') return () => { active = false }
  window.addEventListener(EVENT, handler)
  void drain()
  return () => { active = false; window.removeEventListener(EVENT, handler) }
}

export function documentFromWorld3DRequest(request: World3DWizardRequest): Scene3DDocument {
  const document = applyScene3DTemplate(request.templateId)
  if (request.cameraFamily) document.camera = { ...document.camera, family: request.cameraFamily }
  const bindings = request.bindings ?? {}
  document.slots = document.slots.map(slot => {
    const bound = bindings[slot.slot]
    if (!bound) return slot
    return {
      ...slot,
      sourceUrl: bound.url,
      media: bound.media ?? slot.media,
      clip: null,
    }
  })
  return document
}
