import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
}

installDom()

test('Tools exposes exact library images for background removal', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { ToolsPanel } = await import('../src/components/Sidebar/ToolsPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const requestUrl = typeof input === 'string' ? input : (input as Request).url || String(input)
    if (requestUrl.includes('/api/v1/assets')) {
      return new Response(JSON.stringify({
        total: 1,
        assets: [{
          id: 'asset-hero', kind: 'image', filename: 'hero.png', size_bytes: 12,
          created_at: 1, completed_at: 2, metadata_status: 'canonical', workspace_ids: ['default'],
          locations: [{ workspace_id: 'default', filename: 'hero.png', url: '/api/v1/file/hero.png?workspace=default' }],
          url: '/api/v1/file/hero.png?workspace=default',
          origin: { tool: 'studio' }, execution: {}, model: { provider: 'local', id: 'flux' },
          prompt_preview: 'hero', manifest: { technical: { width: 1920, height: 1080 } },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  useStore.setState({
    toolsTool: 'remove_background', toolsSourcePath: null, toolsSourceName: null,
    toolsSourceUrl: null, toolsSourceAssetId: null, toolsSourceWorkspace: null, toolsSourceKind: null,
    toolsSubmitting: false,
    activeWorkspace: 'default', outputs: [], selectedOutput: -1,
  } as never)
  try {
    render(<ToolsPanel />)
    const buttonByText = (label: string) => {
      const match = [...document.querySelectorAll('button')].find(button => button.textContent?.includes(label))
      assert.ok(match, label)
      return match as HTMLButtonElement
    }
    const runButton = buttonByText('Remove Background')
    assert.equal(runButton.disabled, true)
    assert.ok(buttonByText('From HocusPocus'))
    assert.ok(buttonByText('From my computer'))
    assert.match(document.querySelector('[role="status"]')?.textContent || '', /Choose an image from the library/i)
  } finally {
    cleanup()
    globalThis.fetch = previousFetch
  }
})

test('upscale accepts an image while revoice remains video-only', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { ToolsPanel } = await import('../src/components/Sidebar/ToolsPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  const previousSetInterval = globalThis.setInterval
  const toolPosts: Array<{ url: string; body?: Record<string, unknown> }> = []
  globalThis.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : (input as Request).url || String(input)
    if (requestUrl.includes('/api/v1/assets')) {
      return new Response(JSON.stringify({ total: 0, assets: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (requestUrl.includes('/api/v1/tools/')) {
      toolPosts.push({ url: requestUrl, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(JSON.stringify({ job_id: 'image-upscale-1' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  useStore.setState({
    toolsTool: 'remove_background',
    toolsSourcePath: 'hero.png',
    toolsSourceName: 'hero.png',
    toolsSourceUrl: '/api/v1/file/hero.png',
    toolsSourceAssetId: 'asset-hero',
    toolsSourceWorkspace: 'default',
    toolsSourceKind: 'image',
    toolsRevoiceRefs: [{ filename: 'voice.wav', path: '/tmp/voice.wav' }, null],
    jobs: [],
    activeWorkspace: 'default',
    outputs: [],
    selectedOutput: -1,
  } as never)
  globalThis.setInterval = (() => 1) as unknown as typeof setInterval
  try {
    render(<ToolsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Upscale' }))
    assert.equal(useStore.getState().toolsTool, 'upscale')
    assert.equal(useStore.getState().toolsSourceKind, 'image')
    const upscaleButton = screen.getByRole('button', { name: 'Upscale Image' })
    assert.equal(upscaleButton.disabled, false)
    fireEvent.click(upscaleButton)
    await useStore.getState().runTool()
    assert.equal(toolPosts.length, 1)
    assert.equal(toolPosts[0].url, '/api/v1/tools/upscale')
    assert.equal(toolPosts[0].body?.source, 'hero.png')
    assert.equal(toolPosts[0].body?.source_kind, 'image')
    assert.equal(toolPosts[0].body?.video_path, undefined)

    fireEvent.click(screen.getByRole('button', { name: 'Revoice' }))
    assert.equal(useStore.getState().toolsTool, 'revoice')
    const revoiceButton = screen.getByRole('button', { name: 'Replace Voice' })
    assert.equal(revoiceButton.disabled, true)
    fireEvent.click(revoiceButton)
    await useStore.getState().runTool()
    assert.equal(toolPosts.length, 1)

    fireEvent.click(screen.getByRole('button', { name: /^Remove background$/ }))
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(screen.getByRole('button', { name: /^Remove Background$/ }).disabled, false)
  } finally {
    cleanup()
    globalThis.fetch = previousFetch
    globalThis.setInterval = previousSetInterval
  }
})

test('video tools can run only with a video source', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { ToolsPanel } = await import('../src/components/Sidebar/ToolsPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const requestUrl = typeof input === 'string' ? input : (input as Request).url || String(input)
    if (requestUrl.includes('/api/v1/assets')) {
      return new Response(JSON.stringify({ total: 0, assets: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  useStore.setState({
    toolsTool: 'upscale',
    toolsSourcePath: 'clip.mp4',
    toolsSourceName: 'clip.mp4',
    toolsSourceUrl: '/api/v1/file/clip.mp4',
    toolsSourceAssetId: null,
    toolsSourceWorkspace: null,
    toolsSourceKind: 'video',
    toolsRevoiceRefs: [{ filename: 'voice.wav', path: '/tmp/voice.wav' }, null],
    activeWorkspace: 'default',
    outputs: [],
    selectedOutput: -1,
  } as never)
  try {
    render(<ToolsPanel />)
    assert.equal(screen.getByRole('button', { name: 'Upscale Clip' }).disabled, false)
    fireEvent.click(screen.getByRole('button', { name: 'Revoice' }))
    assert.equal(screen.getByRole('button', { name: 'Replace Voice' }).disabled, false)
    fireEvent.click(screen.getByRole('button', { name: /^Remove background$/ }))
    assert.equal(screen.getByRole('button', { name: /^Remove Background$/ }).disabled, true)
  } finally {
    cleanup()
    globalThis.fetch = previousFetch
  }
})

test('Tools submits background removal only once while the request is pending', { concurrency: false }, async () => {
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  const previousSetInterval = globalThis.setInterval
  let submissions = 0
  let release!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { release = resolve })
  globalThis.fetch = async input => {
    const requestUrl = typeof input === 'string' ? input : (input as Request).url || String(input)
    if (requestUrl.includes('/api/v1/tools/remove-background')) {
      submissions += 1
      return pending
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  globalThis.setInterval = (() => 1) as unknown as typeof setInterval
  useStore.setState({
    toolsTool: 'remove_background', toolsSourcePath: 'hero.png', toolsSourceName: 'hero.png',
    toolsSourceUrl: '/api/v1/file/hero.png?workspace=default', toolsSourceAssetId: 'asset-hero',
    toolsSourceWorkspace: 'default', toolsSourceKind: 'image', toolsSubmitting: false,
    activeWorkspace: 'default', jobs: [],
  } as never)
  try {
    const first = useStore.getState().runTool()
    await new Promise(resolve => setTimeout(resolve, 0))
    const second = useStore.getState().runTool()
    assert.equal(submissions, 1)
    assert.equal(useStore.getState().toolsSubmitting, true)
    release(new Response(JSON.stringify({ job_id: 'job-bg-1' }), { status: 200 }))
    await first
    assert.equal(useStore.getState().toolsSubmitting, false)
    await second
  } finally {
    globalThis.fetch = previousFetch
    globalThis.setInterval = previousSetInterval
    useStore.setState({ toolsSubmitting: false, jobs: [] } as never)
  }
})
