import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileStoryVisualRequest } from '../src/features/agent/storyVisualRequest.ts'

const character = { type: 'generate_story_visuals', scope: 'characters', targetNames: ['Nara'], targetStoryTitle: 'Entre dos mundos', confirm: true }
const location = { ...character, scope: 'locations', targetNames: ['Colina al crepúsculo'] }
const turn = actions => ({ reply: 'Already generated!', actions, conversationLanguage: 'es' })

test('preserves confirmed Story identities, order and project instead of Studio fallback', () => {
  const input = turn([character, location])
  const actual = reconcileStoryVisualRequest('Genera ahora las imágenes de Nara y Colina al crepúsculo del proyecto con MiniMax Image-01.', input)
  assert.deepEqual(actual.actions, input.actions)
  assert.equal(actual.conversationLanguage, 'es')
  assert.doesNotMatch(actual.reply, /Already generated/)
})

test('other-media and other-target prohibitions cannot veto the authorized Story artwork', () => {
  const actual = reconcileStoryVisualRequest('Genera ahora exactamente dos imágenes: Nara y Colina al crepúsculo en Story Lab. NO generes el mundo general ni el Puente todavía. No generes vídeo, música ni TTS.', turn([character, location, { type: 'start_generation', confirm: true }]))
  assert.deepEqual(actual.actions, [character, location])
})

test('negative image, target, scope and read-only requests remain fail-closed', () => {
  for (const request of ['No generes las imágenes de Nara en Story Lab.', 'Cómo genero la imagen de Nara en Story Lab?', 'Genera la imagen de Nara. No generes imágenes todavía.', 'Genera la imagen de Nara. No generes personajes.', 'Genera la imagen de Nara. No generes nada.', 'Genera la imagen de Nara, pero no Nara.']) {
    assert.deepEqual(reconcileStoryVisualRequest(request, turn([character])).actions, [], request)
  }
})

test('does not silently switch a scoped or remote image request to Studio/local', () => {
  const studio = turn([{ type: 'prepare_image', prompt: 'Nara' }, { type: 'start_generation', confirm: true }])
  for (const request of ['Genera la imagen de Nara en Story Lab.', 'Genera un retrato con MiniMax Image-01.']) {
    assert.deepEqual(reconcileStoryVisualRequest(request, studio).actions, [])
    assert.deepEqual(reconcileStoryVisualRequest(request, turn([])).actions, [])
  }
  assert.equal(reconcileStoryVisualRequest('Genera una imagen de un gato naranja.', studio), undefined)
})

test('does not invent target authorization or broaden a named request to all targets', () => {
  const unknown = { ...character, targetNames: ['Teo'] }
  const broad = { ...character, scope: 'all', targetNames: [] }
  assert.deepEqual(reconcileStoryVisualRequest('Genera la imagen de Nara en Story Lab.', turn([character, unknown, broad])).actions, [character])
  assert.deepEqual(reconcileStoryVisualRequest('Genera la imagen de Nara en Story Lab.', turn([{ ...character, confirm: false }])).actions, [])
})

test('English targets and explicit full-scope commands work; Story creation stays unchanged', () => {
  assert.deepEqual(reconcileStoryVisualRequest('Generate the image of Nara in Story Lab. Do not generate video.', turn([character])).actions, [character])
  const all = { ...character, scope: 'characters', targetNames: [] }
  assert.deepEqual(reconcileStoryVisualRequest('Genera todos los personajes en Story Lab.', turn([all])).actions, [all])
  assert.equal(reconcileStoryVisualRequest('Crea el proyecto Story Lab con el personaje Nara.', turn([{ type: 'create_story', title: 'test' }])), undefined)
})

test('broad scopes cannot silently include excluded targets', () => {
  const broad = { ...character, scope: 'all', targetNames: [] }
  for (const restriction of ['No generes el mundo general.', 'No generes localizaciones.', 'No generes a Nara.']) {
    assert.deepEqual(reconcileStoryVisualRequest(`Genera todas las imágenes de Story Lab. ${restriction}`, turn([broad])).actions, [])
  }
  assert.deepEqual(reconcileStoryVisualRequest('Genera todos los personajes en Story Lab. No generes a Nara.', turn([{ ...character, targetNames: [] }])).actions, [])
})

test('creating an inventory or comic does not authorize hallucinated Story artwork', () => {
  for (const request of ['Crea el proyecto Story Lab con el personaje Nara.', 'Create a Story Lab project with character Nara.']) {
    assert.deepEqual(reconcileStoryVisualRequest(request, turn([character])).actions, [])
  }
  assert.deepEqual(reconcileStoryVisualRequest('Crea una imagen de Nara en Story Lab.', turn([character])).actions, [character])
})

test('preserves Story creation dependencies and leaves generic project/local and comic routing to existing handlers', () => {
  const create = { type: 'create_story', title: 'Entre dos mundos', premise: 'A journey' }
  assert.deepEqual(reconcileStoryVisualRequest('Crea el proyecto Story Lab con el personaje Nara y genera su imagen en Story Lab.', turn([create, character])).actions, [create, character])
  const studio = turn([{ type: 'prepare_image', prompt: 'a house' }])
  assert.equal(reconcileStoryVisualRequest('Genera una imagen de un proyecto de casa.', studio), undefined)
  assert.equal(reconcileStoryVisualRequest('No quiero MiniMax, usa el proveedor local para generar una imagen de Nara.', studio), undefined)
  assert.equal(reconcileStoryVisualRequest('Crea un cómic con Nara.', turn([character])), undefined)
})

test('preserves useful read-only answers instead of replacing them with an execution warning', () => {
  const answer = { reply: 'Here are the requested prompts.', actions: [] }
  assert.deepEqual(reconcileStoryVisualRequest('Explica los prompts de imágenes de Story Lab con MiniMax. No generes imágenes.', answer), answer)
})
