import type { ApiOutput } from '../../api/outputs'
import { AssetInput } from '../asset-picker/AssetInput.tsx'

export function StoryAudioPicker({
  workspace,
  projectId,
  label,
  accept,
  disabled,
  selectedName,
  onChoose,
}: {
  workspace: string
  projectId?: string
  label: string
  accept: string
  disabled?: boolean
  selectedName?: string
  onChoose: (item: ApiOutput | null) => void
}) {
  return (
    <AssetInput
      key={`${workspace}:${projectId || ''}:${label}`}
      label={label}
      placeholder={selectedName || label}
      items={[]}
      accept={accept}
      disabled={disabled}
      workspaceId={workspace}
      constraints={{ kinds: ['audio'], maxCount: 1, optional: false }}
      onChoose={onChoose}
    />
  )
}
