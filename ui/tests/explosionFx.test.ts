import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from 'three'
import { effectsTemplateDocument } from '../src/features/scene3d/effectsTemplates'
import { parseScene3DDocument } from '../src/features/scene3d/document'
import { parseWorldSfx, WORLD_SFX_KINDS, createWorldSfx } from '../src/features/sceneFx/world'
import { syncWorldSfx } from '../src/features/sceneFx/worldRuntime'
import { parseSceneFx } from '../src/features/sceneFx/types'
import { paintSceneFx } from '../src/features/sceneFx/paint'

test('explosion is a world SFX with a short ground blast default', () => {
  assert.ok((WORLD_SFX_KINDS as readonly string[]).includes('explosion'))
  const cue = createWorldSfx('explosion', 8)
  assert.equal(cue.kind, 'explosion')
  assert.ok(cue.end <= 2.6)
  assert.equal(cue.position.y, 0.42)
  assert.equal(parseWorldSfx([{ id: 'x', kind: 'explosion', start: 0, end: 2, color: '#ff6a32' }])[0].kind, 'explosion')
})

test('ground blast template roundtrips 3D explosion plus 2D overlay', () => {
  const doc = effectsTemplateDocument('blast-stage')!
  const parsed = parseScene3DDocument(JSON.parse(JSON.stringify(doc)))!
  assert.equal(parsed.templateId, 'blast-stage')
  assert.equal(parsed.duration, 6)
  assert.ok(parsed.worldSfx?.some(cue => cue.kind === 'explosion'))
  assert.ok(parsed.worldSfx?.some(cue => cue.kind === 'shockwave'))
  assert.ok(parsed.sfx?.some(cue => cue.kind === 'explosion'))
  assert.equal(parsed.environment?.reflectiveFloor, true)
})

test('3D explosion nodes seek and release like other cinematic kinds', () => {
  const scene = new Scene(), nodes = new Map()
  const cues = parseWorldSfx([{ id: 'blast', kind: 'explosion', start: 1, end: 3, seed: 4, intensity: 1.2 }])
  syncWorldSfx(scene, nodes, cues, 1.4, [])
  assert.equal(nodes.size, 1)
  assert.equal(nodes.get('blast')?.root.visible, true)
  const fireball = nodes.get('blast')!.root.children.find(child => child.userData.kind === 'fireball')
  assert.ok(fireball)
  const scaleA = fireball!.scale.x
  syncWorldSfx(scene, nodes, cues, 2.2, [])
  assert.notEqual(fireball!.scale.x, scaleA)
  syncWorldSfx(scene, nodes, cues, 0, [])
  assert.equal(nodes.get('blast')?.root.visible, false)
  syncWorldSfx(scene, nodes, [], 0, [])
  assert.equal(nodes.size, 0)
})

test('2D explosion painter is seeded and draws flash, rings and debris', () => {
  const cue = parseSceneFx([{ id: 'e', kind: 'explosion', start: 0, end: 1, x: 50, y: 50, size: 80, intensity: 1.2, seed: 9 }])[0]
  const ops: string[] = []
  const gradient = { addColorStop: () => { ops.push('stop') } }
  const ctx = {
    save() { ops.push('save') }, restore() { ops.push('restore') },
    translate() {}, scale() {}, rotate() {}, beginPath() { ops.push('path') },
    arc() { ops.push('arc') }, fill() { ops.push('fill') }, stroke() { ops.push('stroke') },
    moveTo() {}, lineTo() {},
    createRadialGradient() { ops.push('grad'); return gradient },
    fillRect() {}, measureText: () => ({ width: 0 }),
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'left',
  } as unknown as CanvasRenderingContext2D
  paintSceneFx(ctx, 96, 96, 0.08, [cue])
  const first = ops.join(',')
  ops.length = 0
  paintSceneFx(ctx, 96, 96, 0.08, [cue])
  assert.equal(ops.join(','), first)
  assert.ok(first.includes('grad'))
  assert.ok(first.includes('arc'))
  assert.ok(first.includes('stroke'))
  ops.length = 0
  paintSceneFx(ctx, 96, 96, 0.8, [cue])
  assert.ok(ops.filter(op => op === 'grad').length >= 8)
})
