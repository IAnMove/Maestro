import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Monitor, X } from 'lucide-react'
import type { ApiOutput } from '../../api/outputs'
import { useUiTranslation } from '../../i18n'
import { AssetExplorerDialog, AssetPickTrigger } from '../../components/common/AssetExplorerDialog'
import type { AssetConstraints } from './types.ts'
import { createUploadSession } from './upload.ts'

export function AssetInput({
  label,
  placeholder,
  items,
  value,
  accept,
  optional,
  constraints,
  disabled,
  onChoose,
}: {
  label: string
  placeholder: string
  items: ApiOutput[]
  value?: ApiOutput
  accept?: string
  optional?: boolean
  constraints?: AssetConstraints
  disabled?: boolean
  onChoose: (item: ApiOutput | null) => void
}) {
  const { t } = useUiTranslation('common')
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useRef(createUploadSession())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => upload.current.abort(), [])

  const pickLocal = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const uploaded = await upload.current.run(file)
      onChoose({
        name: uploaded.filename,
        type: uploaded.kind === 'model3d' ? 'model3d' : uploaded.kind === 'audio' ? 'audio' : uploaded.kind === 'video' ? 'video' : 'image',
        mode: null,
        size: file.size,
        created_at: Date.now() / 1000,
        url: uploaded.url,
        thumbnail_url: uploaded.kind === 'image' ? uploaded.url : '',
      })
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(t('picker.uploadFailed'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1" onDrop={event => { event.preventDefault(); if (!disabled && !busy) void pickLocal(event.dataTransfer.files[0]) }} onDragOver={event => event.preventDefault()}>
      <AssetPickTrigger label={label} selected={value} placeholder={busy ? t('picker.uploading') : placeholder} disabled={disabled || busy} onOpen={() => setOpen(true)} />
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] text-text-secondary disabled:opacity-40">
          <Monitor size={10} />{t('picker.fromDevice')}
        </button>
        <button type="button" disabled={disabled || busy} onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] text-text-secondary disabled:opacity-40">
          <FolderOpen size={10} />{t('picker.fromLibrary')}
        </button>
        {optional && value && (
          <button type="button" disabled={disabled || busy} onClick={() => onChoose(null)} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] text-text-secondary disabled:opacity-40">
            <X size={10} />{t('picker.remove')}
          </button>
        )}
      </div>
      {error && <p className="text-[9px] text-red-300">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        data-testid="asset-input-file"
        onChange={event => { void pickLocal(event.target.files?.[0]) }}
      />
      <AssetExplorerDialog
        open={open}
        title={label}
        items={items}
        selectedName={value?.name}
        allowNone={optional}
        constraints={constraints}
        onClose={() => setOpen(false)}
        onChoose={item => { onChoose(item); setOpen(false) }}
      />
    </div>
  )
}
