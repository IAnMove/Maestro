import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })
window.matchMedia = (() => ({ matches: false })) as typeof window.matchMedia
const { useStore } = await import('../src/stores/useStore')
const { createStudioSfxGenerationCommand, projectStudioSfxFormParams } = await import('../src/features/studio/sfxGenerationSpec')
const { createStudioMusicGenerationCommand, projectStudioMusicFormParams } = await import('../src/features/studio/musicGenerationSpec')
const speechRef = '/api/v1/file/voice.wav?workspace=speech-source'
const musicRef = '/api/v1/file/beat.wav?workspace=music-source'
const sfxGuide = '/api/v1/file/clip.mp4?workspace=sfx-source'
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
        { model_type: 'mmaudio_v2', name: 'MMAudio', family: 'tts', is_downloaded: true },
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

/** Same leftover the real Generate adapter sees: live form video_guide, not a curated omit. */
function musicFormCommand() {
  const state = useStore.getState()
  return createStudioMusicGenerationCommand(projectStudioMusicFormParams({
    workspace: state.activeWorkspace, model_type: 'ace_step_v1_5_xl_sft_lm_4b',
    prompt: '  [Verse]\nTentri: watches over the city  ', alt_prompt: '',
    duration_seconds: 20, generation_mode: 'audio', _audio_sub_mode: 'music',
    audio_prompt_type: state.params.audio_prompt_type, audio_guide: state.params.audio_guide,
    video_guide: state.params.video_guide, _tts_voice_count: state.params._tts_voice_count,
    _tts_speaker_name1: state.params._tts_speaker_name1,
  }).params, 'audio-reference-form')
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
    assert.equal(useStore.getState().durationSeconds, 20)
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    assert.equal(useStore.getState().params.video_guide, undefined)
    assert.equal(musicCommand().input.params.audio_guide, musicRef)
    assert.equal(musicFormCommand().input.params.audio_guide, musicRef)
    useStore.getState().setAudioSubMode('speech')
    assert.equal(useStore.getState().params.audio_guide, speechRef)
    assert.deepEqual(useStore.getState().ttsVoices, [voice])
    useStore.getState().setAudioSubMode('music')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    assert.equal(useStore.getState().audioGuideFilename, 'beat.wav')
  })
})

test('an SFX video guide does not block Music or Speech and returns on the SFX tab', async () => {
  await withStudio(() => {
    useStore.getState().setAudioSubMode('sfx')
    useStore.getState().setParams({ video_guide: sfxGuide })
    useStore.getState().setAudioSubMode('music')
    assert.equal(useStore.getState().params.video_guide, undefined)
    assert.equal(musicFormCommand().input.params.video_guide, undefined)
    useStore.getState().setAudioSubMode('speech')
    assert.equal(useStore.getState().params.video_guide, undefined)
    useStore.getState().setAudioSubMode('sfx')
    assert.equal(useStore.getState().params.video_guide, sfxGuide)
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

test('late model defaults cannot disable restored Speech or newly chosen Music references', async () => {
  await withStudio(async () => {
    const defaults: Array<() => void> = []
    globalThis.fetch = async input => {
      if (String(input).includes('/defaults/')) {
        return new Promise<Response>(resolve => { defaults.push(() => resolve(new Response(
          JSON.stringify({ audio_prompt_type: '' }), { headers: { 'content-type': 'application/json' } },
        ))) })
      }
      assert.match(String(input), /model-selections/)
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    useStore.getState().setAudioSubMode('music'); chooseMusicReference()
    assert.equal(defaults.length, 1)
    defaults.shift()!()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(useStore.getState().params.audio_prompt_type, 'A')
    assert.equal(useStore.getState().params.audio_guide, musicRef)
    useStore.getState().setAudioSubMode('speech')
    assert.equal(defaults.length, 1)
    defaults.shift()!()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(useStore.getState().params.audio_prompt_type, 'AN')
    assert.equal(useStore.getState().params.audio_guide, speechRef)
  })
})

for (const nativeAlias of [true, false]) {
  test(`Load Settings for SFX restores literal fields and duration (native alias: ${nativeAlias})`, async () => {
    await withStudio(async () => {
      const literal = '  a glass chime\nwith a long tail  '
      useStore.getState().setParams({ MMAudio_prompt: 'stale sound', MMAudio_neg_prompt: 'stale negative', sfx_text_weight: 4 } as never)
      useStore.setState({ selectedOutputMeta: { params: {
        model_type: 'mmaudio_v2', _audio_sub_mode: 'sfx', sfx_mode: true,
        prompt: literal, ...(nativeAlias ? { MMAudio_prompt: literal } : {}),
        MMAudio_neg_prompt: '', sfx_text_weight: 0, guidance_scale: 0,
        duration_seconds: 7.5, video_length: 0, num_inference_steps: 25,
      } } as never })
      await useStore.getState().loadSettingsFromOutput()
      const state = useStore.getState()
      assert.equal(state.audioSubMode, 'sfx')
      assert.equal(state.params.MMAudio_prompt, literal)
      assert.equal(state.params.MMAudio_neg_prompt, '')
      assert.equal(state.params.sfx_text_weight, 0)
      assert.equal(state.params.guidance_scale, 0)
      assert.equal(state.durationSeconds, 7.5, 'audio duration is not derived from video frames')
      const submitted = createStudioSfxGenerationCommand(projectStudioSfxFormParams({
        ...state.params, workspace: state.activeWorkspace, duration_seconds: state.durationSeconds,
      }), `restore-sfx-${nativeAlias}`)
      assert.equal(submitted.input.params.MMAudio_prompt, literal)
      assert.equal(submitted.input.params.duration_seconds, 7.5)
    })
  })
}

function sfxMetadata(prompt: string) {
  return { source: 'json', params: { model_type: 'mmaudio_v2', _audio_sub_mode: 'sfx',
    prompt, MMAudio_prompt: prompt, duration_seconds: 3, num_inference_steps: 25 } }
}

test('Load Settings pins the clicked file even if gallery scrolling changes the selected output', async () => {
  await withStudio(async () => {
    useStore.setState({ outputs: [{ name: 'clicked.wav', type: 'audio' }, { name: 'scrolled.wav', type: 'audio' }] as never,
      mediaFilter: 'all', selectedOutput: 0, selectedOutputMeta: sfxMetadata('Stale metadata') as never })
    let finish!: (response: Response) => void
    globalThis.fetch = input => {
      assert.equal(String(input), '/api/v1/outputs/clicked.wav/metadata?workspace=audio-refs-test')
      return new Promise(resolve => { finish = resolve })
    }
    const load = useStore.getState().loadSettingsFromOutput({ name: 'clicked.wav', workspace: 'audio-refs-test' })
    await Promise.resolve()
    assert.equal(typeof finish, 'function', 'the source must be fetched by its exact identity')
    useStore.setState({ selectedOutput: 1, selectedOutputMeta: sfxMetadata('Scrolled metadata') as never })
    finish(new Response(JSON.stringify(sfxMetadata('Clicked literal'))))
    assert.equal(await load, true)
    assert.equal(useStore.getState().params.MMAudio_prompt, 'Clicked literal')
  })
})

test('a slower earlier Load Settings response cannot overwrite the newer clicked file', async () => {
  await withStudio(async () => {
    const responses = new Map<string, (value: Response) => void>()
    globalThis.fetch = input => new Promise(resolve => { responses.set(String(input), resolve) })
    const first = useStore.getState().loadSettingsFromOutput({ name: 'first.wav', workspace: 'audio-refs-test' })
    const second = useStore.getState().loadSettingsFromOutput({ name: 'second.wav', workspace: 'audio-refs-test' })
    await Promise.resolve()
    assert.equal(responses.size, 2)
    responses.get('/api/v1/outputs/second.wav/metadata?workspace=audio-refs-test')!(new Response(JSON.stringify(sfxMetadata('Newer click'))))
    assert.equal(await second, true)
    responses.get('/api/v1/outputs/first.wav/metadata?workspace=audio-refs-test')!(new Response(JSON.stringify(sfxMetadata('Older click'))))
    assert.equal(await first, false)
    assert.equal(useStore.getState().params.MMAudio_prompt, 'Newer click')
  })
})

test('a workspace change during metadata fetch cancels reroll instead of generating elsewhere', async () => {
  await withStudio(async () => {
    let finish!: (value: Response) => void, generations = 0
    globalThis.fetch = () => new Promise(resolve => { finish = resolve })
    useStore.setState({ startGeneration: async () => { generations += 1 } })
    const reroll = useStore.getState().rerollGeneration({ name: 'clicked.wav', workspace: 'audio-refs-test' })
    await Promise.resolve()
    assert.equal(typeof finish, 'function')
    useStore.setState({ activeWorkspace: 'another-output', params: { ...useStore.getState().params, prompt: 'Current draft' } })
    finish(new Response(JSON.stringify(sfxMetadata('Outdated file'))))
    await reroll
    assert.equal(generations, 0)
    assert.equal(useStore.getState().params.prompt, 'Current draft')
  })
})
