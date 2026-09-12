import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import { applyPersistCommands } from '../src/features/production-review/persist'
import { projectReviewDesk } from '../src/features/production-review/project'
import { selectExactTake } from '../src/features/production-review/takes'
import { exportApprovedSelection } from '../src/features/production-review/exportSelection'
import { regenerateReview } from '../src/features/production-review/runtime'
import type { SavedPipelineState } from '../src/types'
import type { PipelineLike } from '../src/features/production-review/types'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage, React, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

function pipeline(): PipelineLike {
  return { pipeline_id: 'review-1', workspace: 'original', status: 'completed', clips: [
    { index: 0, video_filename: 'new.mp4', video_prompt: '  literal\nprompt  ', video_attempts: [
      { id: 'old-id', filename: 'old.mp4' }, { id: 'new-id', filename: 'new.mp4' }] },
    { index: 1, video_filename: 'approved.mp4', tag: 'good' },
  ] }
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('mounted production review saves, reloads and exports the actual approved selection', async context => {
  const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
  const { ProductionReviewHost } = await import('../src/features/production-review/ProductionReviewHost')
  let saved = pipeline()
  let exported: Record<string, unknown> | null = null
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit = {}) => {
    if (url.endsWith('/review')) {
      const body = JSON.parse(String(options.body))
      assert.equal(body.workspace, 'original')
      saved = applyPersistCommands(saved, body.commands)
      return response(saved)
    }
    if (url.endsWith('/probe')) return response({ duration: 1, width: 640, height: 360, fps: 24, has_audio: true })
    if (url.endsWith('/export')) {
      exported = JSON.parse(String(options.body))
      return response({ job_id: 'export-real', status: 'completed', filename: 'selection.mp4', message: 'Ready' })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const view = (key: string) => <ProductionReviewHost key={key} workspace="original" pipeline={saved as SavedPipelineState} />
  try {
    const root = render(view('first'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'old-id' })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Approve' })))
    assert.equal(saved.clips[0].selected_video_filename, 'old.mp4')
    assert.equal(saved.clips[0].tag, 'good')
    root.rerender(view('reload'))
    assert.equal(screen.getByRole('button', { name: 'old-id' }).getAttribute('aria-pressed'), 'true')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export approved selection' })))
    assert.ok(exported)
    const body = exported as { workspace: string; clips: Array<{ name: string; source: string }> }
    assert.equal(body.workspace, 'original')
    assert.deepEqual(body.clips.map(clip => clip.name), ['old.mp4', 'approved.mp4'])
    assert.ok(body.clips.every(clip => clip.source.endsWith('workspace=original')))
    assert.match(screen.getByRole('link', { name: 'Download MP4' }).getAttribute('href') || '', /selection.mp4.*original/)
  } finally { cleanup() }
})

test('failed persistence keeps the current take and displays the error', async context => {
  const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
  const { ProductionReviewHost } = await import('../src/features/production-review/ProductionReviewHost')
  context.mock.method(globalThis, 'fetch', async () => response({ detail: 'Production is busy' }, 409))
  try {
    render(<ProductionReviewHost workspace="original" pipeline={pipeline() as SavedPipelineState} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'old-id' })))
    assert.equal(screen.getByRole('button', { name: 'new-id' }).getAttribute('aria-pressed'), 'true')
    assert.match(screen.getByRole('alert').textContent || '', /Production is busy/)
  } finally { cleanup() }
})

test('regeneration reads a real saved attempt and does not fabricate queued success', async context => {
  const saved = pipeline(), desk = projectReviewDesk({ pipeline: saved })
  const calls: string[] = []
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit = {}) => {
    calls.push(url)
    if (url.endsWith('/rerun-video')) {
      assert.equal(JSON.parse(String(options.body)).prompt, '  literal\nprompt  ')
      saved.clips[0].video_attempts!.push({ id: 'persisted-id', filename: 'regenerated.mp4' })
      return response({ filename: 'regenerated.mp4', clip_index: 0 })
    }
    return response(saved)
  })
  const results = await regenerateReview(desk, { productionId: desk.productionId, keepShotIds: [desk.shots[1].id], jobs: [
    { shotId: desk.shots[0].id, clipIndex: 0, prompt: '  literal\nprompt  ', refs: [], parentTakeId: 'new-id' },
  ] })
  assert.equal(calls.length, 2)
  assert.equal(results[0].take?.id, 'persisted-id')
  assert.equal(results[0].take?.filename, 'regenerated.mp4')
  assert.equal(saved.clips[1].tag, 'good')
})

test('approval belongs to the exact take, and frame counts are not guessed as seconds', () => {
  const source = pipeline()
  source.clips[0].tag = 'good'
  source.clips[0].video_attempts![0].video_length = 83
  const desk = projectReviewDesk({ pipeline: source })
  const selected = selectExactTake(desk, desk.shots[0].id, 'old-id')
  assert.equal(selected.shots[0].decision, 'pending')
  assert.equal(selected.shots[0].takes[0].durationSeconds, null)
  assert.deepEqual(exportApprovedSelection(selected).clips.map(clip => clip.filename), ['approved.mp4'])
})
