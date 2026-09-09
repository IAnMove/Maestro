import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
})
window.matchMedia = () => ({ matches: false })

function emptyLabs() {
  return {
    story: { project_id: '', active_cue_title: '', selected_song_id: '' },
    series: { series_id: '', episode_id: '', shots: 0, approved: 0 },
  }
}

test('AgentAssistantPanel sends wizardLlmRequestSchema, not only registeredCapabilitySchemas', async () => {
  const panel = readFileSync(new URL('../src/features/agent/AgentAssistantPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /json_schema:\s*wizardLlmRequestSchema\(\)/)
  assert.doesNotMatch(panel, /json_schema:\s*registeredCapabilitySchemas\(\)/)
  const {
    HOCUSPOCUS_AGENT_RESPONSE_SCHEMA,
    wizardLlmRequestSchema,
  } = await import('../src/features/agent/agentActions.ts')
  const { listCapabilities, registeredCapabilitySchemas } = await import('../src/features/agent/capabilityRegistry.ts')
  const sent = wizardLlmRequestSchema()
  assert.equal(sent, HOCUSPOCUS_AGENT_RESPONSE_SCHEMA)
  const typeEnum = sent.properties.actions.items.properties.type.enum
  assert.deepEqual([...typeEnum].sort(), listCapabilities().map(item => item.name).sort())
  const sentKeys = new Set(Object.keys(sent.properties.actions.items.properties))
  for (const schema of registeredCapabilitySchemas()) {
    for (const key of Object.keys(schema.properties || {})) {
      if (key === 'type') continue
      assert.ok(sentKeys.has(key), `registry field ${key} missing from the schema sent to the LLM`)
    }
  }
  assert.notEqual(JSON.stringify(sent), JSON.stringify(registeredCapabilitySchemas()))
  assert.ok(sentKeys.has('series_id'))
  assert.ok(sentKeys.has('episode_id'))
  assert.ok(typeEnum.includes('stage_series_comic'))
})

test('Wizard availability distinguishes executable, needs data, blocked and off-tab navigation', async () => {
  const {
    projectWizardContextCapabilities,
    revalidateWizardCapability,
    wizardCapabilityExecutionError,
  } = await import('../src/features/agent/wizardCapabilityAvailability.ts')

  const onStory = projectWizardContextCapabilities({
    location: { tab: 'story_lab' },
    labs: {
      story: { project_id: 'story-1', active_cue_title: 'Cue', selected_song_id: 'song-1' },
      series: { series_id: 'series-1', episode_id: 'ep-1', shots: 2, approved: 2 },
    },
  })
  assert.ok(onStory.available.includes('update_story'))
  assert.ok(onStory.available.includes('update_series_episode'))
  assert.ok(onStory.statuses.some(item => item.name === 'update_series_episode' && item.status === 'requires_navigation'))
  assert.ok(onStory.available.includes('stage_series_comic'))
  assert.equal(onStory.blocked.some(item => item.name === 'update_series_episode'), false)

  const empty = projectWizardContextCapabilities({
    location: { tab: 'series_lab' },
    labs: emptyLabs(),
  })
  assert.ok(empty.available.includes('create_series_episode'))
  const updateBlocked = empty.blocked.find(item => item.name === 'update_series_episode')
  assert.ok(updateBlocked?.reason)
  assert.equal(
    wizardCapabilityExecutionError(revalidateWizardCapability('update_series_episode', {
      location: { tab: 'series_lab' },
      labs: emptyLabs(),
    })),
    updateBlocked.reason,
  )
  assert.equal(
    wizardCapabilityExecutionError(revalidateWizardCapability('create_series_episode', {
      location: { tab: 'series_lab' },
      labs: emptyLabs(),
    })),
    null,
  )

  const pending = projectWizardContextCapabilities({
    location: { tab: 'series_lab' },
    labs: {
      story: { project_id: '', active_cue_title: '', selected_song_id: '' },
      series: { series_id: 'series-1', episode_id: 'ep-1', shots: 2, approved: 0 },
    },
    pendingQuestion: { id: 'question:workflow-1:step-1' },
  })
  const render = pending.statuses.find(item => item.name === 'render_series_shots')
  assert.equal(render.status, 'blocked')
  const assemble = pending.blocked.find(item => item.name === 'assemble_series_episode')
  assert.ok(assemble?.reason)
})

test('create_series_episode with create_if_missing stays a valid series-creating action', async () => {
  const { parseRegisteredCapability } = await import('../src/features/agent/capabilityRegistry.ts')
  const { HOCUSPOCUS_AGENT_SYSTEM_PROMPT } = await import('../src/features/agent/agentKnowledge.ts')
  const created = parseRegisteredCapability('create_series_episode', {
    type: 'create_series_episode',
    series_title: 'Taller',
    episode_premise: 'El hechizo sale mal.',
    create_if_missing: true,
  })
  assert.equal(created?.type, 'create_series_episode')
  assert.equal(created?.createIfMissing, true)
  const refused = parseRegisteredCapability('create_series_episode', {
    type: 'create_series_episode',
    series_title: 'Taller',
    episode_premise: 'El hechizo sale mal.',
  })
  assert.equal(refused?.createIfMissing, false)
  assert.match(HOCUSPOCUS_AGENT_SYSTEM_PROMPT, /create_if_missing=true/)
  assert.match(HOCUSPOCUS_AGENT_SYSTEM_PROMPT, /Never say series creation is impossible/)
})

test('stage_series_comic parses through the registry onto the Series comic handoff', async () => {
  const { parseRegisteredCapability, getCapability } = await import('../src/features/agent/capabilityRegistry.ts')
  const action = parseRegisteredCapability('stage_series_comic', {
    type: 'stage_series_comic',
    series_title: 'Mesa para cuatro',
    target_episode_title: 'Piloto',
    page_count: 6,
    panels_per_page: 5,
    confirm: true,
  })
  assert.deepEqual(action, {
    type: 'stage_series_comic',
    seriesTitle: 'Mesa para cuatro',
    targetEpisodeTitle: 'Piloto',
    seriesId: '',
    episodeId: '',
    title: '',
    pageCount: 6,
    panelsPerPage: 5,
    confirm: true,
  })
  assert.equal(parseRegisteredCapability('stage_series_comic', {
    type: 'stage_series_comic', page_count: 6, panels_per_page: 5,
  }), null)
  const capability = getCapability('stage_series_comic')
  assert.equal(capability.confirmation, 'required')
  assert.equal(capability.presentation.destination, 'comics')
  const calls = []
  const outcome = await capability.execute(action, {
    adapters: {
      seriesLab: {
        async stageComic(received) {
          calls.push(received)
          return { message: 'Prepared comic', target: { kind: 'comic', id: 'comic-1', title: 'Piloto' } }
        },
      },
    },
  })
  assert.equal(outcome.message, 'Prepared comic')
  assert.equal(calls[0].type, 'stage_series_comic')
})

test('a how-to generate question does not keep generating actions', async () => {
  const { isHowToGenerateQuestion, reconcileAgentTurnWithRequest } = await import('../src/features/agent/agentActions.ts')
  assert.equal(isHowToGenerateQuestion('¿cómo genero?'), true)
  assert.equal(isHowToGenerateQuestion('how do I generate a video?'), true)
  assert.equal(isHowToGenerateQuestion('genera un vídeo de un mago'), false)
  const turn = await reconcileAgentTurnWithRequest('¿cómo genero?', {
    reply: 'Voy a generar.',
    actions: [
      { type: 'open_tab', tab: 'studio' },
      { type: 'prepare_video', prompt: 'A wizard.' },
      { type: 'start_generation', confirm: true },
    ],
  })
  assert.deepEqual(turn.actions.map(action => action.type), ['open_tab'])
})

test('runner refuses needs_data before execute and allows off-tab navigation', async () => {
  const { resolveAndRunRegisteredCapability } = await import('../src/features/agent/capabilityRunner.ts')
  const empty = {
    location: { tab: 'series_lab' },
    labs: emptyLabs(),
  }
  await assert.rejects(
    () => resolveAndRunRegisteredCapability('update_series_episode', {
      type: 'update_series_episode', episode_title: 'Nuevo título',
    }, {
      workspace: 'demo',
      availability: empty,
      adapters: { seriesLab: { async updateEpisode() { throw new Error('must not execute') } } },
    }),
    /create_series_episode|episodio|serie/,
  )

  const stages = []
  const result = await resolveAndRunRegisteredCapability('open_tab', {
    type: 'open_tab', tab: 'series_lab',
  }, {
    workspace: 'demo',
    availability: empty,
    adapters: {
      async openTab(tab) {
        return { message: `Opened ${tab}`, target: { kind: 'application_section', id: tab, title: tab } }
      },
    },
    onStage: current => stages.push(current),
  })
  assert.equal(result.ok, true)
  assert.ok(stages.includes('revalidate'))
})
