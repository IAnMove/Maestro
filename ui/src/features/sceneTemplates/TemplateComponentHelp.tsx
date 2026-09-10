import { useState } from 'react'
import { templateComponentPrompt } from './componentContract'
import { getCandidateSceneTemplate } from './catalog'

export function TemplateComponentHelp({ templateId }: { templateId: string }) {
  const [message, setMessage] = useState('')
  const contract = templateComponentPrompt(templateId)
  const motion = getCandidateSceneTemplate(templateId).motionIntensity
  const copy = async () => {
    try { await navigator.clipboard.writeText(contract); setMessage('Contrato copiado. No ejecuta acciones ni genera assets.') }
    catch { setMessage('No se pudo copiar. Abre el contrato y selecciónalo manualmente.') }
  }
  return <div className="rounded border border-border p-3 text-xs">
    {motion && <p className="mb-2 text-amber-100">Movimiento {motion === 'high' ? 'fuerte' : 'moderado'} dentro del plano, no transición de montaje. Revisa los giros y evita encadenarlos densamente si provocan mareo. El alpha y la pose de las imágenes requieren revisión visual.</p>}
    <button type="button" onClick={() => void copy()} className="rounded border border-cyan-400/40 px-3 py-1.5">Copiar contrato para el Wizard</button>
    <details className="mt-2"><summary>Ver componentes y requisitos</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px]">{contract}</pre></details>
    {message && <p role="status" className="mt-2">{message}</p>}
  </div>
}
