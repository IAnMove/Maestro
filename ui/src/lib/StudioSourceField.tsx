import type { AssetKind } from '../api/assets'
import type { ApiOutput } from '../api/outputs'
import { AssetInput } from '../features/asset-picker/AssetInput.tsx'
import { useUiTranslation } from '../i18n'

export function StudioSourceField({
  label,
  items,
  accept,
  kinds,
  workspaceId,
  onChoose,
}: {
  label: string
  items: ApiOutput[]
  accept: string
  kinds: readonly AssetKind[]
  workspaceId?: string
  onChoose: (item: ApiOutput) => void
}) {
  const { t } = useUiTranslation('common')
  return (
    <AssetInput
      label={label}
      placeholder={t('picker.fromLibrary')}
      items={items}
      accept={accept}
      workspaceId={workspaceId}
      constraints={{ kinds, maxCount: 1, optional: false }}
      onChoose={item => { if (item) onChoose(item) }}
    />
  )
}
