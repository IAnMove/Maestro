import { useEffect, useRef } from 'react'

type Kind = '2d' | '3d'
type Pending = { kind: Kind; document: unknown; resolve: () => void; reject: (error: Error) => void }
const event = 'hocuspocus:scene-command-document'
let pending: Pending | undefined

export function presentSceneDocument(kind: Kind, document: unknown): Promise<void> {
  if (pending) return Promise.reject(new Error('Another scene presentation is pending.'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending === item) pending = undefined
      reject(new Error('Scene preparation completed, but its editor did not open. The returned document remains recoverable.'))
    }, 20000)
    const item: Pending = { kind, document, resolve: () => { clearTimeout(timer); resolve() }, reject: error => { clearTimeout(timer); reject(error) } }
    pending = item; window.dispatchEvent(new Event(event))
  })
}

export function useSceneDocumentHandoff(kind: Kind, apply: (document: unknown) => void) {
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply }, [apply])
  useEffect(() => {
    const receive = () => {
      if (!pending || pending.kind !== kind) return
      const item = pending; pending = undefined
      try { applyRef.current(item.document); item.resolve() }
      catch (error) { item.reject(error instanceof Error ? error : new Error(String(error))) }
    }
    window.addEventListener(event, receive); receive()
    return () => window.removeEventListener(event, receive)
  }, [kind])
}
