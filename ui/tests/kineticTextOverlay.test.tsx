import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KineticTextOverlay } from '../src/components/common/KineticTextOverlay'
import { parseKineticTexts } from '../src/lib/kineticText'

Object.assign(globalThis, { React })

test('preview text does not allocate an export-sized canvas for large scene imports', () => {
  const cues = parseKineticTexts([{ id: 'title', text: 'Large project', start: 0, end: 3 }])
  const html = renderToStaticMarkup(<KineticTextOverlay cues={cues} seconds={1} width={8192} height={8192} />)
  assert.match(html, /width="720" height="720"/)
  assert.equal(renderToStaticMarkup(<KineticTextOverlay seconds={0} width={8192} height={8192} />), '')
})
