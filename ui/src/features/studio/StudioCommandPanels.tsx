import { lazy, Suspense } from 'react'
import type { GenerationReceiptLike } from '../../api/generationCommandClient'
import { useStore } from '../../stores/useStore'

const ImagePanel = lazy(() => import('./StudioImageCommandPanel').then(module => ({ default: module.StudioImageCommandPanel })))
const SpeechPanel = lazy(() => import('./StudioSpeechCommandPanel').then(module => ({ default: module.StudioSpeechCommandPanel })))
const MusicPanel = lazy(() => import('./StudioMusicCommandPanel').then(module => ({ default: module.StudioMusicCommandPanel })))

async function reconnect(receipt: GenerationReceiptLike): Promise<void> {
  await useStore.getState().reconnectJobs()
  if (useStore.getState().activeWorkspace === receipt.result.workspace) {
    await useStore.getState().maybeRefreshGallery()
  }
}

interface Props {
  mode: string
  audioSubMode: string
  workspace: string
  model: string
  visible: boolean
}

/** Only load the durable presentation for the selected Studio operation. */
export function StudioCommandPanels({ mode, audioSubMode, workspace, model, visible }: Props) {
  const Panel = mode === 'image' ? ImagePanel : mode === 'audio'
    ? (audioSubMode === 'speech' ? SpeechPanel : audioSubMode === 'music' ? MusicPanel : null) : null
  if (!Panel) return null
  return <Suspense fallback={null}>
    <Panel workspace={workspace} model={model} visible={visible} onRecovered={reconnect} />
  </Suspense>
}
