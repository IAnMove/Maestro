// Manual/automated review harness: the actual editor, not an alternate renderer.
import { createRoot } from 'react-dom/client'
import { Scene3DWorkspace } from '../../src/features/scene3d/Scene3DWorkspace'
import { requestWorld3DWorkflow } from '../../src/features/scene3d/world3dAgent'
import { parseScene3DDocument } from '../../src/features/scene3d/document'
import { setUiLanguage } from '../../src/i18n'
import '../../src/index.css'

await setUiLanguage('es')
const initialDocument = new URLSearchParams(location.search).has('fresh') ? null : await fetch('/api/review/files/portrait.world3d.json').then(async response =>
  response.ok ? parseScene3DDocument(await response.json()) : null).catch(() => null)
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-6xl space-y-5 p-6">
  <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-cyan-300">Hocuspocus · vista local de integración</p>
    <h1 className="text-3xl font-semibold text-text-primary">Personajes que hablan</h1>
    <p className="text-sm text-text-secondary">Editor 3D real · servicios de generación desconectados en esta revisión. Importa el kit de Taberna y prueba voz, expresiones y MP4.</p>
    <a className="text-sm text-cyan-300 underline" href="/api/review/files/portrait.world3d.json" download>Descargar escena de ejemplo para «Abrir escena»</a>
  </header>
  <Scene3DWorkspace width={1280} height={720} initialDocument={initialDocument ?? undefined} />
</main>)
if (!initialDocument) void requestWorld3DWorkflow({ type: 'mount_world3d_template', templateId: 'speech-portrait' })
