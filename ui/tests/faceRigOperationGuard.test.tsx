import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createCharacterKit, type CharacterFaceAnchor, type CharacterKit } from '../src/lib/characterKit.ts'
import { useFaceRigOperationGuard } from '../src/features/characters/useFaceRigOperationGuard.ts'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

type Scope = {
  kit: CharacterKit
  poseId: string
  workspace: string
  anchor: CharacterFaceAnchor
  disabled?: boolean
}

const anchor: CharacterFaceAnchor = { offsetX: 0, offsetY: -18, scale: .05, rotation: 0 }
const makeScope = (overrides: Partial<Scope> = {}): Scope => ({
  kit: createCharacterKit('Luma'),
  poseId: 'base',
  workspace: 'default',
  anchor,
  ...overrides,
})

test('a captured operation expires on every tracked input change and never revives', async () => {
  const { renderHook } = await import('@testing-library/react')
  const original = makeScope()
  const view = renderHook((scope: Scope) => useFaceRigOperationGuard(scope), { initialProps: original })
  try {
    const changes: Scope[] = [
      makeScope({ kit: { ...original.kit, name: 'Changed' } }),
      makeScope({ poseId: 'reaction' }),
      makeScope({ workspace: 'other-workspace' }),
      makeScope({ anchor: { ...anchor, offsetX: 4 } }),
    ]
    for (const changed of changes) {
      const captured = view.result.current()
      assert.equal(captured(), true)
      view.rerender(changed)
      assert.equal(captured(), false)
      view.rerender(original)
      assert.equal(captured(), false, 'returning to the original values must not revive old work')
      assert.equal(view.result.current()(), true, 'a new operation may start in the new scope')
    }
  } finally {
    view.unmount()
  }
})

test('disabled scopes reject captures, and unmount invalidates them permanently', async () => {
  const { renderHook } = await import('@testing-library/react')
  const original = makeScope()
  const view = renderHook((scope: Scope) => useFaceRigOperationGuard(scope), { initialProps: original })
  const captured = view.result.current()
  try {
    view.rerender({ ...original, disabled: true })
    assert.equal(captured(), false)
    const disabledCapture = view.result.current()
    assert.equal(disabledCapture(), false)
    view.rerender(original)
    assert.equal(disabledCapture(), false)
    assert.equal(view.result.current()(), true)
    const mountedCapture = view.result.current()
    view.unmount()
    assert.equal(mountedCapture(), false)
    assert.equal(mountedCapture(), false)
  } finally {
    // renderHook's unmount is idempotent and keeps this test safe if an assertion fails.
    view.unmount()
  }
})

test('unrelated rerenders do not invalidate a captured operation', async () => {
  const { renderHook } = await import('@testing-library/react')
  const original = makeScope()
  type Props = Scope & { unrelated: number }
  const initial: Props = { ...original, unrelated: 0 }
  const view = renderHook(({ unrelated, ...scope }: Props) => {
    void unrelated
    return useFaceRigOperationGuard(scope)
  }, { initialProps: initial })
  try {
    const captured = view.result.current()
    for (const unrelated of [1, 2, 3]) {
      view.rerender({ ...initial, unrelated })
      assert.equal(captured(), true)
    }
  } finally {
    view.unmount()
  }
})
