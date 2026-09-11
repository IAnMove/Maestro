import { useMemo, useState } from 'react'
import type { ApiOutput } from '../../api/outputs'
import { AssetInput } from '../asset-picker'
import { ModalShell } from '../../components/common/ModalShell.tsx'
import { interpolate, transferCopy } from './copy.ts'
import { collectAssetUses, uniqueAssetUses } from './format.ts'
import { preflightFile, type PreflightReport } from './preflight.ts'
import { canImport, pickerToReassign, repairAssets, type ReassignEntry } from './reassign.ts'
import { downloadBlob, exportScenePackage, importScenePackage, preflightScenePackage } from './transferApi.ts'

export function ProjectTransferDialog({
  open,
  onClose,
  workspace,
  documents,
  catalogItems = [],
  onImported,
}: {
  open: boolean
  onClose: () => void
  workspace: string
  documents: unknown[]
  catalogItems?: ApiOutput[]
  onImported?: (scenes: Array<{ name: string }>) => void
}) {
  const copy = transferCopy()
  const [tab, setTab] = useState<'export' | 'import'>('export')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<PreflightReport | null>(null)
  const [reassign, setReassign] = useState<Record<string, ReassignEntry>>({})
  const uses = useMemo(() => uniqueAssetUses(documents.flatMap((document, index) => collectAssetUses(document, `shot-${index + 1}`))), [documents])
  const repairs = report ? repairAssets(report) : []
  const ready = report ? canImport(report, Object.keys(reassign)) : false

  const resetImport = () => {
    setFile(null)
    setReport(null)
    setReassign({})
  }

  const runExport = async () => {
    setBusy(true); setError(''); setNote('')
    try {
      const blob = await exportScenePackage({ workspace, documents, title })
      downloadBlob(blob, `${(title || 'scene-package').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'scene-package'}.scene-package.zip`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.blocked)
    } finally { setBusy(false) }
  }

  const inspect = async (next: File | undefined) => {
    if (!next) return
    setBusy(true); setError(''); setNote(''); setFile(next); setReassign({})
    try {
      let inspected: PreflightReport
      try {
        inspected = await preflightScenePackage(next)
      } catch {
        inspected = await preflightFile(next)
      }
      setReport(inspected)
      if (!inspected.canImport && inspected.issues.some(issue => issue.code === 'template')) setError(copy.templateRejected)
    } catch (caught) {
      setReport(null)
      setError(caught instanceof Error ? caught.message : copy.blocked)
    } finally { setBusy(false) }
  }

  const runImport = async () => {
    if (!file || !ready) return
    setBusy(true); setError(''); setNote('')
    try {
      const result = await importScenePackage({ workspace, file, reassign: Object.values(reassign) })
      setNote(interpolate(copy.imported, { count: result.scenes.length }))
      onImported?.(result.scenes)
      resetImport()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.blocked)
    } finally { setBusy(false) }
  }

  return (
    <ModalShell open={open} title={copy.title} onClose={onClose} className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-auto rounded-xl border border-border bg-bg-primary p-4 text-sm text-text-primary">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{copy.title}</h2>
          <button type="button" className="min-h-10 rounded-lg border border-border px-3" onClick={onClose}>{copy.close}</button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="min-h-10 rounded-lg border border-border px-3" aria-pressed={tab === 'export'} onClick={() => setTab('export')}>{copy.exportTab}</button>
          <button type="button" className="min-h-10 rounded-lg border border-border px-3" aria-pressed={tab === 'import'} onClick={() => setTab('import')}>{copy.importTab}</button>
        </div>
        {tab === 'export' ? (
          <div className="space-y-3">
            <p>{copy.exportHelp}</p>
            <p>{interpolate(copy.shots, { count: documents.length })} · {interpolate(copy.assetsUsed, { count: uses.length })}</p>
            <label className="block">{copy.packageName}
              <input className="mt-1 min-h-10 w-full rounded-lg border border-border bg-bg-secondary px-3" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
            </label>
            <button type="button" className="min-h-10 rounded-lg border border-border px-3" disabled={busy || documents.length === 0} onClick={() => void runExport()}>
              {busy ? copy.exporting : copy.exportAction}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p>{copy.importHelp}</p>
            <label className="block">
              {copy.chooseZip}
              <input type="file" accept=".zip,application/zip" className="mt-1 block w-full" aria-label={copy.chooseZip} disabled={busy}
                onChange={event => { void inspect(event.target.files?.[0]); event.target.value = '' }} />
            </label>
            {busy && !report && <p role="status">{copy.inspecting}</p>}
            {report && (
              <div className="space-y-2">
                <p role="status">{ready ? copy.ready : repairs.length ? copy.repairNeeded : copy.blocked}</p>
                {report.unknownFields.length > 0 && (
                  <div>
                    <p>{copy.unknownFields}</p>
                    <ul>{report.unknownFields.map(field => <li key={field}>{field}</li>)}</ul>
                  </div>
                )}
                {repairs.map(asset => (
                  <AssetInput
                    key={asset.sha256}
                    label={interpolate(asset.status === 'tampered' ? copy.tamperedAsset : copy.missingAsset, { name: asset.filename || asset.sha256.slice(0, 8) })}
                    placeholder={interpolate(copy.replaceAsset, { name: asset.filename || asset.sha256.slice(0, 8) })}
                    items={catalogItems}
                    workspaceId={workspace}
                    constraints={{ kinds: ['model3d', 'audio', 'image', 'video'], maxCount: 1, optional: false }}
                    onChoose={item => {
                      if (!item) {
                        setReassign(current => {
                          const next = { ...current }
                          delete next[asset.sha256]
                          return next
                        })
                        return
                      }
                      setReassign(current => ({ ...current, [asset.sha256]: pickerToReassign(asset.sha256, item, workspace) }))
                    }}
                  />
                ))}
                <button type="button" className="min-h-10 rounded-lg border border-border px-3" disabled={busy || !ready} onClick={() => void runImport()}>
                  {busy ? copy.importing : copy.importAction}
                </button>
              </div>
            )}
          </div>
        )}
        {note && <p role="status" className="mt-3">{note}</p>}
        {error && <p role="alert" className="mt-3">{error}</p>}
      </div>
    </ModalShell>
  )
}
