import { useEffect, useId, useState } from 'react'
import { Info } from 'lucide-react'
import { useUiTranslation } from '../../i18n'

type Status = { enabled: boolean; managedByEnvironment: boolean; endpoint: string; token?: string }
export function McpSettingsPanel() {
  const { t } = useUiTranslation('settings')
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [token, setToken] = useState(''), [help, setHelp] = useState(false)
  const id = useId()
  useEffect(() => {
    const abort = new AbortController()
    void fetch('/api/v1/settings/mcp', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error(t('mcp.failed'))
      setStatus(await response.json() as Status)
    }).catch(e => { if (!abort.signal.aborted) setError(String(e)) })
    return () => abort.abort()
  }, [t])
  const update = async (enabled: boolean, rotate = false) => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/v1/settings/mcp', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, rotate }) })
      if (!response.ok) throw new Error(t('mcp.failed'))
      const next = await response.json() as Status
      setStatus(next); if (next.token) setToken(next.token)
      if (!enabled) setToken('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const endpoint = status ? new URL(status.endpoint, window.location.origin).href : ''
  return <section className="space-y-3 rounded-lg border border-border p-3" data-testid="mcp-settings">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t('mcp.title')}</h3>
      <button type="button" aria-label={t('mcp.info')} aria-expanded={help} aria-controls={id} onMouseEnter={() => setHelp(true)} onMouseLeave={() => setHelp(false)} onFocus={() => setHelp(true)} onBlur={() => setHelp(false)} onClick={() => setHelp(true)} onKeyDown={event => { if (event.key === 'Escape') setHelp(false) }} className="min-h-9 min-w-9"><Info size={18} /></button>
    </div>
    {help && <div id={id} role="tooltip" className="space-y-2 rounded border border-border bg-bg-tertiary p-3 text-xs leading-relaxed">
      <p>{t('mcp.help')}</p><p>{t('mcp.access')}</p><p>{t('mcp.use')}</p>
    </div>}
    <p className="text-xs text-text-muted">{t('mcp.summary')}</p>
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" disabled={!status || busy} checked={status?.enabled ?? false} onChange={e => void update(e.target.checked)} />{t('mcp.enable')}</label>
    {status && <>
      <label className="block text-xs">{t('mcp.endpoint')}<input readOnly value={endpoint} className="mt-1 w-full rounded border border-border bg-bg-tertiary p-2" /></label>
      {status.managedByEnvironment && <p className="text-xs">{t('mcp.environment')}</p>}
      {token && <label className="block text-xs">{t('mcp.token')}<input type="password" readOnly value={token} className="mt-1 w-full rounded border border-border bg-bg-tertiary p-2" /><button type="button" onClick={() => { void navigator.clipboard.writeText(token).catch(() => setError(t('mcp.copyFailed'))) }} className="min-h-9">{t('mcp.copyToken')}</button></label>}
      <details className="text-xs"><summary className="min-h-9 cursor-pointer">{t('mcp.example')}</summary><pre className="overflow-x-auto rounded bg-bg-tertiary p-2">{JSON.stringify({ mcpServers: { hocuspocus: { url: endpoint, headers: { Authorization: 'Bearer <YOUR_TOKEN>' } } } }, null, 2)}</pre><p className="mt-2">{t('mcp.client')}</p></details>
      {status.enabled && !status.managedByEnvironment && <button type="button" disabled={busy} onClick={() => void update(true, true)} className="min-h-9 rounded border border-border px-2 text-xs">{t('mcp.rotate')}</button>}
    </>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </section>
}
