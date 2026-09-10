/** Harness isolation only: media and Wizard requests still use the live backend. */
export function isOwnedWorkspace(name: unknown, prefix: string): name is string {
  return typeof name === 'string' && (name === prefix || name.startsWith(`${prefix}_`))
}

/** IDs in legacy control routes still have to resolve to an owned canonical task. */
export function liveTaskTarget(method: string, pathname: string): string | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null
  const patterns = [
    /^\/api\/v1\/cancel\/([^/]+)$/,
    /^\/api\/v1\/tasks\/([^/]+)(?:\/(?:cancel|retry|resume))?$/,
    /^\/api\/v1\/stories\/generate\/(?:cancel|resume)\/([^/]+)$/,
    /^\/api\/v1\/stories\/music-candidates\/jobs\/([^/]+)\/(?:cancel|resume|retry)$/,
    /^\/api\/v1\/series\/(?:plan|render|assembly)\/jobs\/([^/]+)(?:\/(?:cancel|resume|retry|apply|apply-canon))?$/,
    /^\/api\/v1\/director\/pipeline\/([^/]+)\/(?:stop|cancel|resume|retry)$/,
    /^\/api\/v1\/video-editor\/export\/([^/]+)\/(?:cancel|resume|retry)$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(pathname)
    if (match) return decodeURIComponent(match[1])
  }
  return null
}

export function liveQueryViolation(method: string, params: URLSearchParams, prefix: string): string | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null
  for (const key of ['workspace', 'workspace_id', 'output_folder']) {
    if (params.getAll(key).some(value => !isOwnedWorkspace(value, prefix))) return `query outside test workspace: ${key}`
  }
  return null
}

export function liveWriteViolation(method: string, pathname: string, payload: unknown, prefix: string): string | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null
  if (method === 'DELETE') return 'deletion is excluded; preserve existing data and test evidence'
  if (pathname.startsWith('/api/v1/jobs/recovery/')) return 'global queue recovery is excluded; preserve interrupted jobs'
  if (pathname.startsWith('/api/v1/system/')) return 'global runtime controls are excluded'
  if (pathname === '/api/v1/comics' || pathname === '/api/v1/comics/history' || (method === 'PUT' && /^\/api\/v1\/comics\/[^/]+$/.test(pathname))) return 'legacy comic saves use the server active folder; use browser JSON/PDF export for this audit'
  if (/^\/api\/v1\/(?:system-config|services-config|config|settings|models|model-selections|model-visibility|model-folders|production-profile)(?:\/|$)/.test(pathname)) return 'global configuration or model mutation'
  if (pathname === '/api/v1/workspaces/active') return 'global workspace activation must stay in the browser harness'
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  if (method === 'POST' && /^\/api\/v1\/(?:generate|tools\/(?:upscale|revoice|remove-background)|comics\/generate\/minimax(?:\/jobs)?)$/.test(pathname) && !isOwnedWorkspace(body.workspace, prefix)) return 'submission needs an explicit owned workspace in its JSON body'
  for (const key of ['workspace', 'workspace_id', 'output_folder']) {
    if (body[key] != null && !isOwnedWorkspace(body[key], prefix)) return `write outside test workspace: ${key}`
  }
  if (pathname === '/api/v1/workspaces' && !isOwnedWorkspace(body.name, prefix)) return 'workspace creation outside test prefix'
  if (/(?:\/)(?:cancel|resume|retry|retry-item|stop|discard)(?:\/|$)/.test(pathname) && !liveTaskTarget(method, pathname)) return 'unrecognized job control is excluded from shared live acceptance'
  return null
}
