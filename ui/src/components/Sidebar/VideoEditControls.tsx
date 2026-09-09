import { useState } from 'react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import type { ApiOutput } from '../../api/outputs'
import { AssetInput } from '../../features/asset-picker/AssetInput.tsx'
import { studioMediaPath, useWorkspaceOutputs } from '../../lib/studioAssetPick.ts'

function withPromptFlags(current: string, flags: string): string {
  let next = current
  for (const flag of flags) {
    if (!next.includes(flag)) next += flag
  }
  return next
}

export function VideoEditControls() {
  const { t } = useUiTranslation('studio')
  const setParam = useStore(s => s.setParam)
  const activeWorkspace = useStore(s => s.activeWorkspace)
  const videoItems = useWorkspaceOutputs(activeWorkspace, 'video')
  const imageItems = useWorkspaceOutputs(activeWorkspace, 'image')
  const [source, setSource] = useState<ApiOutput | null>(null)
  const [reference, setReference] = useState<ApiOutput | null>(null)

  const chooseSource = (item: ApiOutput | null) => {
    if (!item) {
      setSource(null)
      setParam('video_guide', undefined)
      return
    }
    setSource(item)
    setParam('video_guide', studioMediaPath(item))
    const vpt = String(useStore.getState().params.video_prompt_type || '')
    const next = withPromptFlags(vpt, 'V')
    if (next !== vpt) setParam('video_prompt_type', next)
  }

  const chooseReference = (item: ApiOutput | null) => {
    if (!item) {
      setReference(null)
      setParam('image_refs', undefined)
      return
    }
    setReference(item)
    setParam('image_refs', [studioMediaPath(item)])
    const vpt = String(useStore.getState().params.video_prompt_type || '')
    const next = withPromptFlags(vpt, 'KI')
    if (next !== vpt) setParam('video_prompt_type', next)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5 block">
          {t('videoEdit.source')}
        </label>
        <AssetInput
          label={t('videoEdit.source')}
          placeholder={t('videoEdit.drop')}
          items={videoItems}
          value={source ?? undefined}
          accept=".mp4,.webm,.avi,.mov,video/*"
          workspaceId={activeWorkspace}
          optional={Boolean(source)}
          constraints={{ kinds: ['video'], maxCount: 1, optional: true }}
          onChoose={chooseSource}
        />
      </div>

      <div>
        <label className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5 block">
          {t('videoEdit.reference')} <span className="text-text-muted font-normal">({t('chrome.optional')})</span>
        </label>
        <AssetInput
          label={t('videoEdit.reference')}
          placeholder={t('videoEdit.dropRef')}
          items={imageItems}
          value={reference ?? undefined}
          accept=".png,.jpg,.jpeg,.webp,image/*"
          workspaceId={activeWorkspace}
          optional
          constraints={{ kinds: ['image'], maxCount: 1, optional: true }}
          onChoose={chooseReference}
        />
        <p className="text-[9px] text-text-muted mt-1">
          {t('videoEdit.refHint')}
        </p>
      </div>
    </div>
  )
}
