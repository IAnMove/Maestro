import assert from 'node:assert/strict'
import test from 'node:test'
import { demoArtwork } from '../src/features/sceneTemplates/demoArtwork.ts'

const keys = ['subject', 'partner', 'background', 'foreground', 'prop', 'space', 'planet', 'laser', 'shield', 'burst', 'debris', 'stage']
const dataPrefix = 'data:image/svg+xml;charset=utf-8,'

const decode = source => {
  assert.ok(source.startsWith(dataPrefix), 'artwork must be an inline SVG data URI')
  return decodeURIComponent(source.slice(dataPrefix.length))
}

const dimensions = svg => {
  const match = /^<svg[^>]+width="(\d+)"[^>]+height="(\d+)"/.exec(svg)
  assert.ok(match, 'SVG dimensions are explicit')
  return [Number(match[1]), Number(match[2])]
}

test('demo artwork exposes the stable twelve-asset contract', () => {
  const coral = demoArtwork()
  assert.deepEqual(Object.keys(coral), keys)
  for (const key of keys) {
    assert.equal(coral[key].name, `demo-${key}-coral`)
    assert.equal(coral[key].type, 'image')
    const svg = decode(coral[key].source)
    assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /viewBox="0 0 /)
    assert.doesNotMatch(svg, /<script|foreignObject|href\s*=|xlink:href|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i)
    assert.doesNotMatch(svg, /blob:|\/api\/|\.png|\.jpe?g|\.webp/i)
  }
})

test('artwork dimensions match the compositor contracts and characters are closed-mouth cutouts', () => {
  const assets = demoArtwork('teal')
  assert.deepEqual(dimensions(decode(assets.subject.source)), [400, 600])
  assert.deepEqual(dimensions(decode(assets.partner.source)), [400, 600])
  for (const key of ['background', 'foreground', 'space', 'stage']) assert.deepEqual(dimensions(decode(assets[key].source)), [1280, 720])
  for (const key of ['prop', 'planet', 'laser', 'shield', 'burst', 'debris']) assert.deepEqual(dimensions(decode(assets[key].source)), [512, 512])
  for (const key of ['subject', 'partner']) {
    const svg = decode(assets[key].source)
    assert.match(svg, /data-role="eyes"/)
    assert.match(svg, /data-role="closed-mouth"/)
    assert.doesNotMatch(svg, /data-role="(?:open|small|wide|round|blink)-mouth"/)
    assert.doesNotMatch(svg, /M(?:174 253Q200 264 226 253|164 250Q200 264 236 250)/, `${key} has no second white mouth line`)
  }
  const foreground = decode(assets.foreground.source)
  assert.doesNotMatch(foreground, /M0 548H1280V720H0Z/, 'foreground does not cover the whole floor')
  assert.match(foreground, /M0 684H92L120 720H0Z/)
  assert.match(foreground, /M1280 684H1188L1160 720H1280Z/)
  assert.match(foreground, /M0 705H1280/)
  assert.match(decode(assets.laser.source), /<path[^>]+M22 256H490/)
  assert.match(decode(assets.shield.source), /<ellipse/)
  assert.match(decode(assets.burst.source), /<circle/)
  assert.match(decode(assets.debris.source), /<path/)
})

test('default coral output is deterministic and teal changes the actual artwork', () => {
  const coralA = demoArtwork()
  const coralB = demoArtwork('coral')
  const teal = demoArtwork('teal')
  assert.deepEqual(coralA, coralB)
  for (const key of keys) {
    assert.notEqual(coralA[key].source, teal[key].source, `${key} must have a real variant`)
  }
  assert.notEqual(decode(coralA.subject.source), decode(teal.subject.source))
  assert.notEqual(decode(coralA.background.source), decode(teal.background.source))
  assert.notEqual(decode(coralA.stage.source), decode(teal.stage.source))
})
