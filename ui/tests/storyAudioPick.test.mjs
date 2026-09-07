import assert from 'node:assert/strict'
import test from 'node:test'
import {
  audioBindingFilename,
  commitStoryAudioChoice,
  coverPatchFromOutput,
  cueCandidateFromOutput,
  isCustomMp3Output,
} from '../src/features/stories/storyAudioPick.ts'

const live = { projectId: 'story-1', cueId: 'cue-1' }
const audio = {
  name: 'ref.mp3',
  type: 'audio',
  mode: null,
  size: 12,
  created_at: 1,
  url: '/api/v1/file/ref.mp3?workspace=film',
  thumbnail_url: '',
  asset_id: 'asset-ref',
  workspace_id: 'film',
  path: 'ref.mp3',
}

test('cover patch stores durable filename and display name without becoming a song candidate', () => {
  const patch = coverPatchFromOutput({ ...audio, path: 'uploads/cover.wav', name: 'My Cover.wav', type: 'audio' })
  assert.equal(patch.mode, 'cover')
  assert.equal(patch.coverReferenceFilename, 'cover.wav')
  assert.equal(patch.coverReferenceName, 'My Cover.wav')
})

test('catalog mp3 keeps asset url as cue source with lyria or custom provenance', () => {
  const lyria = cueCandidateFromOutput(audio, {
    role: 'lyria', id: 'song-1', title: 'Theme', language: 'es', version: 2,
    prompt: 'lyria prompt', lyrics: 'letra', createdAt: '2026-09-07T00:00:00.000Z',
  })
  assert.equal(lyria.provider, 'lyria')
  assert.equal(lyria.model, 'lyria-3-pro-preview')
  assert.equal(lyria.source, audio.url)
  assert.equal(lyria.name, 'ref.mp3')
  const custom = cueCandidateFromOutput(audio, {
    role: 'custom', id: 'song-2', title: 'Theme', language: 'es', version: 3,
    prompt: 'style', lyrics: '', createdAt: '2026-09-07T00:00:00.000Z',
  })
  assert.equal(custom.provider, 'local')
  assert.equal(custom.model, 'custom-audio-upload')
  assert.match(custom.displayName, /custom MP3/)
})

test('stale project or cue is ignored; wav is rejected as custom mp3', () => {
  assert.equal(commitStoryAudioChoice({ ...live, projectId: 'other' }, live, audio).action, 'ignore')
  assert.equal(commitStoryAudioChoice({ ...live, cueId: 'other' }, live, audio).action, 'ignore')
  assert.equal(commitStoryAudioChoice(live, live, null).action, 'clear')
  assert.equal(commitStoryAudioChoice(live, live, { ...audio, type: 'image', name: 'pic.png', path: 'pic.png' }).action, 'reject')
  assert.equal(isCustomMp3Output({ ...audio, name: 'take.wav', path: 'take.wav', url: '/take.wav' }), false)
  assert.equal(commitStoryAudioChoice(live, live, { ...audio, name: 'take.wav', path: 'take.wav', url: '/take.wav' }, true).action, 'reject')
  const applied = commitStoryAudioChoice(live, live, audio, true)
  assert.equal(applied.action, 'apply')
})

test('audioBindingFilename prefers the path basename', () => {
  assert.equal(audioBindingFilename({ ...audio, path: 'workspace/nested/hook.mp3', name: 'Hook.mp3' }), 'hook.mp3')
})
