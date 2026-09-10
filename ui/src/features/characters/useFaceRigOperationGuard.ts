import { useCallback, useLayoutEffect, useRef } from 'react'
import type { CharacterFaceAnchor, CharacterKit } from '../../lib/characterKit'

type FaceRigScope = {
  kit: CharacterKit
  poseId: string
  workspace: string
  anchor: CharacterFaceAnchor
  disabled?: boolean
}

/** A committed-input scope cannot become current again after leaving and returning. */
export function useFaceRigOperationGuard({ kit, poseId, workspace, anchor, disabled = false }: FaceRigScope) {
  const current = useRef<{ disabled: boolean } | null>(null)
  useLayoutEffect(() => {
    current.current = { disabled }
    return () => { current.current = null }
  }, [kit, poseId, workspace, anchor, disabled])

  return useCallback(() => {
    const started = current.current
    return () => started !== null && !started.disabled && current.current === started
  }, [])
}
