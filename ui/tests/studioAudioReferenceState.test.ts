import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })
window.matchMedia = (() => ({ matches: false })) as typeof window.matchMedia
const { useStore } = await import('../src/stores/useStore')
const { createStudioMusicGenerationCommand } = await import('../src/features/studio/musicGenerationSpec')
const speechRef = '/api/v1/file/voice.wav?workspace=speech-source'
const musicRef = '/api/v1/file/beat.wav?workspace=music-source'
const voice = { name: 'Tentri', filename: 'voice.wav', path: speechRef }

async function withStudio(run: () => Promise<void> | void) {
  const before = useStore.getState(), beforeFetch = globalThis.fetch
  try {
    globalThis.fetch = async input => {
      assert.match(String(input), /\/defaults\/|model-selections/)
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    useStore.setState({ generationMode: 'audio', audioSubMode: 'speech',
      activeWorkspace: 'audio-refs-test', audioReferenceStash: {},
      selectedModelPerAudioSubMode: {},
      models: [
        { model_type: 'kugelaudio_0_open', name: 'Kugel', family: 'tts', is_downloaded: true },
        { model_type: 'ace_step_v1_5_xl_sft_lm_4b', name: 'ACE', family: 'tts', is_downloaded: true },
        { model_type: 'mmaudio_v2', name: 'MMAudio', family: 'audio', is_downloaded: true },
      ] as typeof before.models,
      params: { ...before.params, model_type: 'kugelaudio_0_open', audio_prompt_type: 'AN',
        audio_guide: speechRef, audio_guide2: undefined, _tts_voice_count: 1,
        _tts_speaker_name1: 'Tentri', _tts_original_prompt: 'Tentri: Hello.' },
      ttsVoices: [{ ...voice }], ttsVoiceCount: 1, ttsSpeakerName1: 'Tentri',
      ttsSpeakerName2: '', ttsSpeakerNamesManual: true,
      audioGuideFilename: 'voice.wav', audioGuide2Filename: null,
      loadModelOptions: async () => {}, loadLoras: async () => {},
    })
    await run()
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    await new Promise(resolve => setTimeout(resolve, 20))
    useStore.setState(before); globalThis.fetch = beforeFetch
  }
}

function musicCommand() {
  const state = useStore.getState()
  return createStudioMusicGenerationCommand(JSON.parse(JSON.stringify({
    workspace: state.activeWorkspace, model_type: state.params.model_type,
    prompt: '  [Verse]\nTentri: watches over the city  ', alt_prompt: '',
    duration_seconds: 20, generation_mode: 'audio', _audio_sub_mode: 'music',
    audio_prompt_type: state.params.audio_prompt_type, audio_guide: state.params.audio_guide,
    _tts_voice_count: state.params._tts_voice_count,
    _tts_speaker_name1: state.params._tts_speaker_name1,
  })), 'audio-reference-command')
}

function chooseMusicReference() {
  useStore.getState().setParams({ audio_prompt_type: 'A', audio_guide: musicRef })
  useStore.getState().setAudioGuideFilename('beat.wav')
}

test('Speech → Music clears speech references visibly and preserves a new ACE reference despite the retained voice count', async () => {
  await withStudio(() => {
    useStore.getState().setAudioSubMode('music')
    let state = useStore.getState()
    assert.equal(state.params.audio_guide, undefined)
    assert.equal(state.params.audio_prompt_type, '')
    assert.equal(state.audioGuideFilename, null)
    assert.equal(state.params._tts_voice_count, undefined)
    assert.equal(state.params._tts_original_prompt, undefined)
    assert.equal(state.ttsVoiceCount, 1, 'the Speech voice remains available for its own tab')
    chooseMusicReference()
    assert.equal(musicCommand().input.params.audio_guide, musicRef)
    useStore.getState().setAudioSubMode('speech')
    state = useStore.getState()
    assert.equal(state.params.audio_prompt_type, 'AN')
    assert.equal(state.params.audio_guide, speechRef)
    assert.deepEqual(state.ttsVoices, [voice])
    assert.equal(state.audioGuideFilename, 'voice.wav')
    useStore.getState().setAudioSubMode('music')
    assert.equal(useStore.getState().audioGuideFilename, 'beat.wav')
    assert.equal(musicCommand().input.params.audio_guide, musicRef)
  })
})

test('Music → Mixer → SFX → Music retains the music reference and leaves SFX without an audio selector', async () => {
  await withStudio(() => {
    useStore.getState().setAudioSubMode('music'); chooseMusicReference()
    useStore.getState().setAudioSubMode('mixer')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    useStore.getState().setAudioSubMode('sfx')
    assert.equal(useStore.getState().params.audio_prompt_type, '')
    assert.equal(useStore.getState().params.audio_guide, undefined)
    useStore.getState().setAudioSubMode('music')
    assert.equal(musicCommand().input.params.audio_guide, musicRef)
  })
})

test('an incomplete Music selector remains invalid rather than being silently rewritten during a tab round trip', async () => {
  await withStudio(() => {
    useStore.getState().setAudioSubMode('music')
    useStore.getState().setParams({ audio_prompt_type: 'A', audio_guide: undefined })
    useStore.getState().setAudioSubMode('speech')
    useStore.getState().setAudioSubMode('music')
    assert.equal(useStore.getState().params.audio_prompt_type, 'A')
    assert.throws(musicCommand, /audio_guide/)
  })
})

test('Music model options cannot clamp hidden Speech voices or overwrite the Music selector', async () => {
  await withStudio(async () => {
    const originalLoad = (await import('../src/stores/useStore')).useStore.getInitialState().loadModelOptions
    useStore.getState().setAudioSubMode('music'); chooseMusicReference()
    useStore.setState({ ttsVoiceCount: 3, ttsVoices: [voice, voice, voice] })
    await new Promise(resolve => setTimeout(resolve, 0))
    globalThis.fetch = async input => {
      assert.match(String(input), /model-options/)
      return new Response(JSON.stringify({ audio_only: true, fps: 1, guidance_max_phases: 1,
        max_voice_count: 0, duration_slider: { min: 1, max: 600, default: 120 } }),
        { headers: { 'content-type': 'application/json' } })
    }
    await originalLoad('ace_step_v1_5_xl_sft_lm_4b')
    assert.equal(useStore.getState().params.audio_prompt_type, 'A')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    assert.equal(useStore.getState().ttsVoiceCount, 3)
    assert.equal(useStore.getState().ttsVoices.length, 3)
  })
})

test('Music lyrics with speaker-like labels do not rename the preserved Speech voices', async () => {
  await withStudio(() => {
    useStore.getState().setAudioSubMode('music')
    useStore.setState({ ttsSpeakerNamesManual: false })
    useStore.getState().setParam('prompt', 'Alice: Hello\nBob: Goodbye')
    assert.deepEqual(useStore.getState().ttsVoices, [voice])
    assert.equal(useStore.getState().ttsSpeakerName1, 'Tentri')
  })
})

test('Load Settings for Music preserves the previous Speech references and the newly loaded Music reference', async () => {
  await withStudio(async () => {
    useStore.setState({ selectedOutputMeta: { params: {
      model_type: 'ace_step_v1_5_xl_sft_lm_4b', _audio_sub_mode: 'music',
      prompt: '[Verse]\nSaved music', alt_prompt: '', audio_prompt_type: 'A',
      audio_guide: musicRef, duration_seconds: 20, _tts_voice_count: 0,
    }, upload_filenames: { audio_guide: 'beat.wav' } } as never })
    await useStore.getState().loadSettingsFromOutput()
    assert.equal(useStore.getState().audioSubMode, 'music')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    assert.equal(musicCommand().input.params.audio_guide, musicRef)
    useStore.getState().setAudioSubMode('speech')
    assert.equal(useStore.getState().params.audio_guide, speechRef)
    assert.deepEqual(useStore.getState().ttsVoices, [voice])
    useStore.getState().setAudioSubMode('music')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    assert.equal(useStore.getState().audioGuideFilename, 'beat.wav')
  })
})

test('direct Music commands still reject active TTS metadata', () => {
  assert.throws(() => createStudioMusicGenerationCommand({
    workspace: 'audio-refs-test', model_type: 'ace_step_v1_5_xl_sft_lm_4b',
    prompt: '[Verse]\nSaved music', alt_prompt: '', duration_seconds: 20,
    _tts_voice_count: 1, audio_prompt_type: 'A', audio_guide: musicRef,
  }, 'invalid-tts-residue'), /_tts_voice_count/)
})

for (const [model, subMode] of [['mmaudio_v2', 'sfx'], ['ace_step_v1_5_xl_sft_lm_4b', 'music'], ['kugelaudio_0_open', 'speech']] as const) {
  test(`entering Audio aligns its tab with the saved ${model} model`, async () => {
    await withStudio(() => {
      useStore.setState({ generationMode: 'video', audioSubMode: 'speech',
        selectedModelPerMode: { audio: model },
        params: { ...useStore.getState().params, model_type: 'ltx2_22B_distilled_1_1' },
      })
      useStore.getState().setGenerationMode('audio')
      assert.equal(useStore.getState().params.model_type, model)
      assert.equal(useStore.getState().audioSubMode, subMode)
    })
  })
}

test('selecting Speech repairs a mismatched SFX model instead of remembering it as a Speech model', async () => {
  await withStudio(() => {
    useStore.setState({ params: { ...useStore.getState().params, model_type: 'mmaudio_v2' },
      audioSubMode: 'speech', selectedModelPerAudioSubMode: { speech: 'mmaudio_v2' } })
    useStore.getState().setAudioSubMode('speech')
    assert.equal(useStore.getState().params.model_type, 'kugelaudio_0_open')
  })
})
