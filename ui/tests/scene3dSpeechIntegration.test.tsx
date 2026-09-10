import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import type { Scene3DDocument } from '../src/features/scene3d/types'
import type { Scene3DStageHandle } from '../src/features/scene3d/Scene3DStage'
import type { FacePlacement } from '../src/features/scene3d/speech/types'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement, Event: dom.window.Event, MutationObserver: dom.window.MutationObserver })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })
const face: FacePlacement = { meshIndex: 0, center: [0, 1.5, .1], size: [.1, .08], skin: [.5, .3, .2],
  eyes: { left: [-.04, 1.55, .1], right: [.04, 1.55, .1], size: [.04, .02], skinLeft: [.5, .3, .2], skinRight: [.5, .3, .2] } }
const makeDocument = async () => {
  const { buildSpeechProduction } = await import('../src/features/scene3d/speech/production')
  return buildSpeechProduction({ kind: 'song', title: 'Song', workspace: 'one', duration: 8, offset: 0,
    audio: { workspaceId: 'one', filename: 'song.wav', url: '/audio.wav' },
    cast: [{ id: 'mira', name: 'Mira', model: { workspaceId: 'one', filename: 'mira.glb', url: '/profile-test-mira.glb' } }] })
}
test('auto-calibration restores a saved profile even with an empty clip catalog and no automatic landmark', async () => {
  const { renderHook, waitFor, cleanup } = await import('@testing-library/react')
  const { useSpeechProfiles } = await import('../src/features/scene3d/speech/useSpeechProfiles')
  const doc = await makeDocument()
  let updated: Scene3DDocument | undefined
  globalThis.fetch = async url => {
    const value = String(url)
    return value.includes('/profiles/') ? Response.json({ digest: value.split('/').at(-1)!.split('?')[0], revision: 1, settings: { face } }) : new Response('profile-model-bytes')
  }
  const stage = { current: { facePlacement: () => undefined, ready: () => { throw new Error('Export readiness is not calibration readiness') } } as unknown as Scene3DStageHandle }
  try {
    renderHook(() => useSpeechProfiles(doc, 'one', {}, stage, update => { updated = update(doc) }, false))
    await waitFor(() => assert.deepEqual(updated?.slots[0].speech?.face, face))
    assert.deepEqual(updated!.slots[0].speech!.clips, doc.slots[0].speech!.clips)
  } finally { cleanup() }
})
test('late calibration cannot overwrite a manual edit or mutate an unmounted editor', async () => {
  const { renderHook, waitFor, act, cleanup } = await import('@testing-library/react')
  const { useSpeechProfiles } = await import('../src/features/scene3d/speech/useSpeechProfiles')
  const doc = await makeDocument()
  let resolve: ((response: Response) => void) | undefined, responseUrl = '', commits = 0
  globalThis.fetch = async url => {
    responseUrl = String(url)
    return new Promise<Response>(done => { resolve = done })
  }
  const stage = { current: { facePlacement: () => face } as unknown as Scene3DStageHandle }
  try {
    const hook = renderHook(() => useSpeechProfiles(doc, 'one', {}, stage, () => { commits++ }, false))
    await waitFor(() => assert.ok(resolve))
    hook.unmount()
    await act(async () => resolve!(Response.json({ digest: responseUrl.split('/').at(-1)!.split('?')[0], revision: 1, settings: { face } })))
    assert.equal(commits, 0)
  } finally { cleanup() }
})
test('production entry cancels on close, reopens usable and resets asset choices after a workspace switch', async () => {
  const { render, fireEvent, waitFor, screen, cleanup } = await import('@testing-library/react')
  const { SpeechProductionEntry } = await import('../src/features/scene3d/speech/SpeechProductionEntry')
  let finishAudio: ((response: Response) => void) | undefined
  globalThis.fetch = async url => {
    if (String(url) === '/audio.wav') return new Promise<Response>(done => { finishAudio = done })
    if (String(url).includes('upload')) return Response.json({ filename: 'mira.glb', url: '/mira.glb', path: 'mira.glb' })
    return Response.json({ outputs: [], total: 0 })
  }
  const props = { kind: 'song' as const, title: 'Song', audio: { workspaceId: 'one', filename: 'song.wav', url: '/audio.wav' } }
  try {
    const view = render(<SpeechProductionEntry {...props} workspace="one" />)
    const details = view.container.querySelector('details')!
    details.open = true; fireEvent(details, new dom.window.Event('toggle'))
    await screen.findByRole('button', { name: 'Prepare shot in Video 3D' })
    fireEvent.change(screen.getAllByTestId('asset-input-file')[0], { target: { files: [new File(['glb'], 'mira.glb', { type: 'model/gltf-binary' })] } })
    const prepare = screen.getByRole('button', { name: 'Prepare shot in Video 3D' }) as HTMLButtonElement
    await waitFor(() => assert.equal(prepare.disabled, false))
    fireEvent.click(prepare)
    await waitFor(() => assert.ok(finishAudio))
    details.open = false; fireEvent(details, new dom.window.Event('toggle'))
    details.open = true; fireEvent(details, new dom.window.Event('toggle'))
    await waitFor(() => assert.equal((screen.getByRole('button', { name: 'Prepare shot in Video 3D' }) as HTMLButtonElement).disabled, false))
    view.rerender(<SpeechProductionEntry {...props} workspace="two" />)
    const fresh = view.container.querySelector('details')!
    assert.equal(fresh.open, false)
    fresh.open = true; fireEvent(fresh, new dom.window.Event('toggle'))
    await waitFor(() => assert.equal((screen.getByRole('button', { name: 'Prepare shot in Video 3D' }) as HTMLButtonElement).disabled, true))
  } finally { finishAudio?.(new Response('', { status: 410 })); cleanup() }
})
test('existing Story song panel exposes native 3D preparation with the selected original audio', async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { StoryMusicProductionSong } = await import('../src/features/stories/StoryMusicProductionSong')
  globalThis.fetch = async () => Response.json({ outputs: [], total: 0 })
  const candidate = { id: 'song-1', name: 'song.wav', source: '/audio.wav', provider: 'local', model: 'existing', durationSeconds: 8 }
  const option = { label: 'Selected song', candidate }
  const snapshot = JSON.stringify(candidate)
  try {
    const view = render(<StoryMusicProductionSong {...{ musicCandidateOptions: [option], musicProductionCandidateId: candidate.id,
      setMusicProductionCandidateId: () => {}, selectedMusicOption: option, workspace: 'one' } as never} />)
    const summary = screen.getByText('Lip-sync with 3D characters')
    const details = summary.closest('details')!
    details.open = true; fireEvent(details, new dom.window.Event('toggle'))
    assert.ok(await screen.findByRole('button', { name: 'Prepare shot in Video 3D' }))
    assert.match(view.container.textContent ?? '', /song.wav/)
    assert.equal(JSON.stringify(candidate), snapshot)
  } finally { cleanup() }
})
