import type { APIRequestContext } from '@playwright/test'

/** Retry observations only. Submission/cancellation must never be replayed. */
export async function liveJson(request: Pick<APIRequestContext, 'get'>, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    let response
    try {
      response = await request.get(path, { timeout: 20_000 })
    } catch (error) {
      if (attempt >= 3 || !/ECONNRESET|ECONNREFUSED|socket hang up|closed before receiving/i.test(String(error))) throw error
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
      continue
    }
    if (!response.ok()) throw Error(`${path}: HTTP ${response.status()} ${await response.text()}`)
    return await response.json()
  }
}
