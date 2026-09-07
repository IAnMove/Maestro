import { useState } from 'react'
import type { AssetKind } from '../api/assets'
import type { ApiOutput } from '../api/outputs'
import { AssetInput } from '../features/asset-picker/AssetInput.tsx'
import { useUiTranslation } from '../i18n'
import { fileFromOutput } from './studioAssetPick.ts'

export function StudioSourceField({
  label,
  items,
  accept,
  kinds,
  onFile,
}: {
  label: string
  items: ApiOutput[]
  accept: string
  kinds: readonly AssetKind[]
  onFile: (file: File) => void
}) {
  const { t } = useUiTranslation('common')
  const [error, setError] = useState('')
  return (
    <div className="space-y-1">
      <AssetInput
        label={label}
        placeholder={t('picker.fromLibrary')}
        items={items}
        accept={accept}
        constraints={{ kinds, maxCount: 1, optional: false }}
        onChoose={item => {
          if (!item) return
          setError('')
          void fileFromOutput(item).then(onFile).catch(() => setError(t('picker.uploadFailed')))
        }}
      />
      {error && <p className="text-[9px] text-red-300" role="status">{error}</p>}
    </div>
  )
}
