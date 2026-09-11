import test from 'node:test'
import assert from 'node:assert/strict'
import {
  keepCurrentOption,
  textModelOptions,
} from '../src/lib/productionProfileCatalog.ts'

test('text model options keep the current value and filter by provider', () => {
  const models = [
    { id: 'gemma-local', label: 'Gemma', size_hint: 'local', provider: 'local' },
    { id: 'qwen3:32b', label: 'qwen3:32b (Ollama)', size_hint: 'ollama', provider: 'ollama' },
  ]
  const ollama = textModelOptions(models, 'ollama', 'MiniMax-M3')
  assert.deepEqual(ollama.map(option => option.id), ['MiniMax-M3', 'qwen3:32b'])
  const local = textModelOptions(models, 'local', 'gemma-local')
  assert.deepEqual(local.map(option => option.id), ['gemma-local'])
})

test('keepCurrentOption does not duplicate an id that is already listed', () => {
  const options = keepCurrentOption([{ id: 'a', label: 'A' }], 'a')
  assert.equal(options.length, 1)
})
