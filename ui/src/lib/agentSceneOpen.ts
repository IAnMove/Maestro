import { fetchOutputs, type ApiOutput } from '../api/client'
import type { Scene } from '../types'
import { sceneFromLibraryPayload, sceneLibraryTitle, sceneOutputMatchesName } from './sceneLibrary'

export type AgentLibrarySceneLoad =
  | { ok: true; scene: Scene; file: ApiOutput; label: string }
  | { ok: false; reason: 'stale' }
  | { ok: false; reason: 'missing'; availableTitles: string[] }
  | { ok: false; reason: 'ambiguous' }
  | { ok: false; reason: 'load-failed' }

/** Resolve a saved compositor scene, but refuse to return it after the footer workspace moves. */
export async function loadAgentLibraryScene(
  sceneName: string,
  workspace: string,
  current: () => boolean,
): Promise<AgentLibrarySceneLoad> {
  if (!current()) return { ok: false, reason: 'stale' }
  const library = await fetchOutputs(0, 0, { mediaType: 'scene', workspace })
  if (!current()) return { ok: false, reason: 'stale' }
  const matches = library.outputs.filter(file => sceneOutputMatchesName(file, sceneName))
  if (!matches.length) {
    return {
      ok: false,
      reason: 'missing',
      availableTitles: library.outputs.slice(0, 8).map(file => sceneLibraryTitle(file.name)),
    }
  }
  if (matches.length > 1) return { ok: false, reason: 'ambiguous' }
  const response = await fetch(matches[0].url)
  if (!current()) return { ok: false, reason: 'stale' }
  if (!response.ok) return { ok: false, reason: 'load-failed' }
  const payload = await response.json()
  if (!current()) return { ok: false, reason: 'stale' }
  return { ok: true, scene: sceneFromLibraryPayload(payload), file: matches[0], label: sceneLibraryTitle(matches[0].name) }
}
