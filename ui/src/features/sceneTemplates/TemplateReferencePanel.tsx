import { useState } from 'react'
import { APPROVED_REFERENCE_JSON } from './approvedReferences'

const REFERENCE_BASE = 'https://github.com/IAnMove/hocuspocus/releases/download/procedural-style-reference-v1'

export function TemplateReferencePanel({ templateId, disabled, onOpen }: {
  templateId: string; disabled: boolean; onOpen: (file: File) => void
}) {
  const [show, setShow] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!Object.hasOwn(APPROVED_REFERENCE_JSON, templateId)) return <p role="status" className="rounded border border-amber-300/30 p-3 text-xs text-amber-100">Coreografía nueva: referencia visual pendiente de revisión. Puedes crearla con tus assets y editarla; no hay un original aprobado publicado.</p>
  return <div className="rounded border border-border p-3 text-xs">
    <button type="button" onClick={() => setShow(value => !value)} className="rounded border border-cyan-400/40 px-3 py-1.5">{show ? 'Ocultar referencia' : 'Ver vídeo de referencia (GitHub)'}</button>
    {show && !failed && <video aria-label="Vídeo original de referencia" controls playsInline preload="metadata" src={`${REFERENCE_BASE}/${templateId}.mp4`} onError={() => setFailed(true)} className="mt-2 max-h-64 w-full rounded bg-black" />}
    {failed && <p role="status" className="mt-2">Referencia no disponible. Puedes seguir con tus assets; no sustituimos el vídeo por una preview ficticia.</p>}
    <p className="mt-2 text-text-muted">Original coral v1: composición con SVG/GLB, 4 segundos, sin audio. No representa el aspecto de tus imágenes ni los cambios posteriores del compilador.</p>
    <a href={`${REFERENCE_BASE}/${templateId}.json`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-cyan-200 underline">Descargar configuración original ↗</a>
    <p className="mt-1 text-text-muted">Para abrir el original, descarga su JSON y selecciónalo aquí tras confirmar el reemplazo al final. Verificamos SHA-256; requiere localhost o HTTPS. El botón inferior crea una escena nueva con tus assets.</p>
    <label className="mt-2 block">Abrir JSON original verificado<input aria-label="Abrir JSON original verificado" type="file" accept="application/json,.json" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) onOpen(file) }} className="mt-1 block w-full disabled:opacity-40" /></label>
  </div>
}
