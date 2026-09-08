/** Harness isolation only: media and Wizard requests still use the live backend. */
export function isOwnedWorkspace(name: unknown, prefix: string): name is string {
  return typeof name === 'string' && (name === prefix || name.startsWith(`${prefix}_`))
}

export function liveWriteViolation(method: string, pathname: string, payload: unknown, prefix: string): string | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null
  if (pathname.startsWith('/api/v1/jobs/recovery/')) return 'global queue recovery is excluded; preserve interrupted jobs'
  if (pathname.startsWith('/api/v1/system/')) return 'global runtime controls are excluded'
  if (pathname === '/api/v1/comics' || pathname === '/api/v1/comics/history' || (method === 'PUT' && /^\/api\/v1\/comics\/[^/]+$/.test(pathname))) return 'legacy comic saves use the server active folder; use browser JSON/PDF export for this audit'
  if (/^\/api\/v1\/(?:system-config|services-config|config|settings|models|model-selections|model-visibility|model-folders|production-profile)(?:\/|$)/.test(pathname)) return 'global configuration or model mutation'
  if (method === 'DELETE' && pathname.startsWith('/api/v1/workspaces/')) return 'workspace deletion is excluded; preserve test evidence'
  if (pathname === '/api/v1/workspaces/active') return 'global workspace activation must stay in the browser harness'
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  for (const key of ['workspace', 'workspace_id', 'output_folder']) {
    if (body[key] != null && !isOwnedWorkspace(body[key], prefix)) return `write outside test workspace: ${key}`
  }
  if (pathname === '/api/v1/workspaces' && !isOwnedWorkspace(body.name, prefix)) return 'workspace creation outside test prefix'
  return null
}
