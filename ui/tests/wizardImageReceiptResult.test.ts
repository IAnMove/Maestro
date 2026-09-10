import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Import the store and application adapters only after a browser-shaped global
// exists.  This keeps the test on the same navigation/store seams used by the
// Wizard without rendering the whole application or contacting a provider.
const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  localStorage: dom.window.localStorage,
})
window.matchMedia = () => ({ matches: false }) as MediaQueryList

const { useStore } = await import('../src/stores/useStore.ts')
const { createDefaultApplicationAdapters } = await import('../src/features/agent/applicationAdapters.ts')
const { resolveAndRunRegisteredCapability } = await import('../src/features/agent/capabilityRunner.ts')

const WORKSPACE = 'wizard-image-receipt-result-test'

function queuedReceipt(commandId: string, taskId: string, operation = 'generation.image') {
  return {
    version: 1 as const,
    commandId,
    operation,
    status: 'queued' as const,
    entities: [],
    artifacts: [],
    taskIds: [taskId],
    pipelineIds: [],
    result: {
      job_id: `job-${taskId}`,
      task_id: taskId,
      workspace: WORKSPACE,
      status: 'queued' as const,
    },
    commandVersion: 2 as const,
    fingerprintVersion: 2 as const,
    contentFingerprint: 'b'.repeat(64),
  }
}

function availability() {
  return {
    location: { tab: 'studio' },
    labs: {
      story: { project_id: '' },
      series: { series_id: '', episode_id: '', shots: 0, approved: 0 },
    },
  }
}

function snapshotStore() {
  const state = useStore.getState()
  return {
    generationMode: state.generationMode,
    activeWorkspace: state.activeWorkspace,
    sidebarMode: state.sidebarMode,
    sidebarOpen: state.sidebarOpen,
    settingsOpen: state.settingsOpen,
    dashboardOpen: state.dashboardOpen,
    startGeneration: state.startGeneration,
    setSidebarOpen: state.setSidebarOpen,
  }
}

function installAdmittedGeneration(
  receipt: ReturnType<typeof queuedReceipt>,
  options: { navigationVisible: boolean },
): { calls: () => number; restore: () => void } {
  const before = snapshotStore()
  let calls = 0
  useStore.setState({
    generationMode: 'image',
    activeWorkspace: WORKSPACE,
    sidebarMode: 'studio',
    sidebarOpen: options.navigationVisible,
    settingsOpen: false,
    dashboardOpen: false,
    startGeneration: async () => {
      calls += 1
      return receipt
    },
    ...(options.navigationVisible ? {} : { setSidebarOpen: () => undefined }),
  })
  return {
    calls: () => calls,
    restore: () => { useStore.setState(before) },
  }
}

async function runStartGeneration() {
  return resolveAndRunRegisteredCapability('start_generation', {
    type: 'start_generation', confirm: true,
  }, {
    workspace: WORKSPACE,
    adapters: createDefaultApplicationAdapters(),
    availability: availability(),
  })
}

test.afterEach(() => {
  document.body.replaceChildren()
})

test('Wizard result keeps the admitted V2 receipt through the real Studio adapter and runner', { concurrency: false }, async () => {
  const receipt = queuedReceipt('receipt-visible', 'task-receipt-visible')
  const generation = installAdmittedGeneration(receipt, { navigationVisible: true })
  try {
    const result = await runStartGeneration()
    assert.ok(result)
    assert.equal(generation.calls(), 1)
    assert.equal(result.commandResult?.status, 'queued')
    assert.equal(result.commandResult?.taskIds[0], receipt.result.task_id)
    assert.equal(result.report?.metadata?.commandId, receipt.commandId)
    assert.deepEqual(result.report?.metadata?.receipt, receipt)
    assert.equal(result.report?.metadata?.presentationWarning, undefined)
  } finally {
    generation.restore()
  }
})

test('Wizard result keeps the receipt and presentation warning when Studio cannot show the admitted task', { concurrency: false }, async () => {
  const receipt = queuedReceipt('receipt-warning', 'task-receipt-warning')
  const generation = installAdmittedGeneration(receipt, { navigationVisible: false })
  try {
    const result = await runStartGeneration()
    assert.ok(result)
    assert.equal(generation.calls(), 1)
    assert.equal(result.commandResult?.status, 'queued')
    assert.deepEqual(result.report?.metadata?.receipt, receipt)
    assert.equal(result.report?.metadata?.commandId, receipt.commandId)
    const warning = result.report?.metadata?.presentationWarning
    assert.equal(typeof warning, 'string')
    assert.ok(warning)
    assert.equal(result.report?.message, warning)
  } finally {
    generation.restore()
  }
})


test('Wizard admission names the operation from its receipt even if the selected form differs', { concurrency: false }, async () => {
  const { setUiLanguage } = await import('../src/i18n/index.ts')
  for (const [language, expected] of [
    ['en', 'Sound effect queued'], ['es', 'Efecto de sonido en cola'],
  ] as const) {
    await setUiLanguage(language)
    const receipt = queuedReceipt('receipt-sfx', 'task-sfx', 'generation.sfx')
    // Deliberately keep the current form on Image. The durable receipt, not
    // mutable navigation state, determines what was actually admitted.
    const generation = installAdmittedGeneration(receipt, { navigationVisible: true })
    try {
      const result = await runStartGeneration()
      assert.ok(result?.report?.message.includes(expected), result?.report?.message)
      assert.deepEqual(result.report.metadata?.receipt, receipt)
      assert.equal(generation.calls(), 1)
    } finally { generation.restore() }
  }
})
