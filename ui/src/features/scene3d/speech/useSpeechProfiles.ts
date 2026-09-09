import { useEffect, type RefObject } from 'react'
import type { Scene3DDocument } from '../types'
import type { Scene3DStageHandle } from '../Scene3DStage'
import { loadFaceProfile } from './profiles'
import { defaultSpeech } from './types'

export function useSpeechProfiles(document: Scene3DDocument, workspace: string, readyModels: Record<string, unknown>, stageRef: RefObject<Scene3DStageHandle | null>,
  update: (change: (current: Scene3DDocument) => Scene3DDocument) => void, disabled: boolean) {
  useEffect(() => {
    const stage = stageRef.current
    if (disabled || !stage) return
    let live = true
    for (const slot of document.slots) {
      if (slot.media !== 'model3d' || !slot.sourceUrl || !slot.speech?.enabled || slot.speech.face) continue
      // Saved placement is safe before load because its key is the GLB bytes.
      // Do not use export readiness: it rejects an uncalibrated face.
      const generic = stage.facePlacement?.(slot.id, 'generic')
      void loadFaceProfile(slot.sourceUrl, workspace).catch(() => ({ settings: undefined })).then(profile => {
        if (!live || (!profile.settings && !generic)) return
        update(current => ({ ...current, slots: current.slots.map(item =>
          item.id === slot.id && item.sourceUrl === slot.sourceUrl && item.speech?.enabled && !item.speech.face
            ? { ...item, speech: { ...defaultSpeech(), ...item.speech, ...(profile.settings ?? { face: generic }) } } : item) }))
      })
    }
    return () => { live = false }
  }, [document.slots, workspace, readyModels, stageRef, update, disabled])
}
