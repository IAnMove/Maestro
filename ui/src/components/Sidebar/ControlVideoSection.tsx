import { useState } from 'react'
import { useStore } from '../../stores/useStore'
import { useUiTranslation } from '../../i18n'
import { ChoiceControl } from '../shared/ChoiceControl'
import type { ApiOutput } from '../../api/outputs'
import { AssetInput } from '../../features/asset-picker/AssetInput.tsx'
import { studioMediaPath, useWorkspaceOutputs } from '../../lib/studioAssetPick.ts'

// Control-media guide: the video/image "process" selector (depth / pose / etc.)
// plus the control-media upload.
//
// Frame INJECTION (image_refs + frames_positions, gated on the KFI process) has
// moved to InputsPanel, which is now the single owner of those params. When the
// user switches the process away from KFI here, we clear the inject params so
// they don't ride along to generation.
export function ControlVideoSection() {
  const { t } = useUiTranslation('studio')
  const modelOptions = useStore(s => s.modelOptions)
  const params = useStore(s => s.params)
  const setParam = useStore(s => s.setParam)
  const generationMode = useStore(s => s.generationMode)
  const [guideFilename, setGuideFilename] = useState<string | null>(null)
  const activeWorkspace = useStore(s => s.activeWorkspace)
  const videoItems = useWorkspaceOutputs(activeWorkspace, 'video')
  const imageItems = useWorkspaceOutputs(activeWorkspace, 'image')

  if (!modelOptions) return null

  const config = modelOptions.guide_preprocessing ||
    (!modelOptions.guide_preprocessing ? modelOptions.guide_custom_choices : null)
  if (!config) return null

  const isImageMode = generationMode === 'image'
  const label = modelOptions.guide_preprocessing
    ? (isImageMode ? t('control.processImage') : t('control.processVideo'))
    : (isImageMode ? t('control.imageProcess') : t('control.videoProcess'))
  // Strip ONLY a trailing "T" — the temporal-alignment flag the extend path
  // appends at gen time (e.g. "KFIT" vs "KFI"). Do NOT strip every "T":
  // LTX-2's union-control values use "T" internally for depth_temporal
  // ("Transfer Depth (Temporal)"=TVG, "Motion + Temporal Depth"=PTVG,
  // "Temporal Depth + Edges"=TEVG). A global strip mapped PTVG→PVG, snapping
  // the <select> back to "Transfer Human Motion" so those options couldn't be
  // picked. The flag is only ever appended trailing and only when no other
  // "T" is present, so /T$/ removes the flag without touching the process.
  const currentValue = (params.video_prompt_type || config.default || '').replace(/T$/, '')

  const isFramesInjection = currentValue.includes('KFI')
  const showUpload = !isFramesInjection && modelOptions.guide_preprocessing != null && currentValue !== ''

  const handleChoose = (item: ApiOutput) => {
    setParam('video_guide', studioMediaPath(item))
    setGuideFilename(item.name)
  }

  return (
    <div className="space-y-3">
      <ChoiceControl
        config={config}
        value={currentValue}
        onChange={val => {
          setParam('video_prompt_type', val)
          // Leaving frame-injection mode drops the inject params InputsPanel owns.
          if (!val.includes('KFI')) {
            setParam('image_refs', undefined)
            setParam('frames_positions', undefined)
          }
          if (!val) {
            setParam('video_guide', undefined)
            setGuideFilename(null)
          }
        }}
        label={label}
      />

      {/* Standard control media upload */}
      {showUpload && (
        <div>
          <label className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5 block">
            {isImageMode ? t('control.controlImage') : t('control.controlVideo')}
          </label>
          <AssetInput
            label={isImageMode ? t('control.dropImage') : t('control.dropVideo')}
            placeholder={isImageMode ? t('control.dropImage') : t('control.dropVideo')}
            items={isImageMode ? imageItems : videoItems}
            accept={isImageMode ? '.png,.jpg,.jpeg,.webp,.bmp,image/*' : '.mp4,.webm,.avi,.mov,video/*'}
            workspaceId={activeWorkspace}
            optional={Boolean(guideFilename)}
            constraints={{ kinds: isImageMode ? ['image'] : ['video'], maxCount: 1, optional: true }}
            onChoose={item => {
              if (!item) {
                setParam('video_guide', undefined)
                setGuideFilename(null)
                return
              }
              handleChoose(item)
            }}
          />
        </div>
      )}
    </div>
  )
}
