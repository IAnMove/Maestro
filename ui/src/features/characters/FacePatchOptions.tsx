import { useUiTranslation } from '../../i18n'
import { isFacePatchCompatible } from '../../lib/characterFacePatch'
import type { CharacterKitAsset } from '../../lib/characterKit'
import { CharacterFacePatchPanel, type CharacterFacePatchPanelProps } from './CharacterFacePatchPanel'

export function FacePatchTextureNotice({ asset }: { asset?: CharacterKitAsset }) {
  const { t } = useUiTranslation('characters')
  return asset?.facePatch ? <p className="text-[8px] text-amber-100">{t('facePatch.keepTexture')}</p> : null
}

export function FacePatchOptions(props: CharacterFacePatchPanelProps) {
  const { t } = useUiTranslation('characters')
  const pose = props.poseId === 'base' ? props.kit.base : props.kit.poses[props.poseId]
  const mouth = props.kit.mouth[props.state as keyof typeof props.kit.mouth]
  return <>
    <details className="rounded border border-violet-300/30 p-1.5">
      <summary className="cursor-pointer text-[10px] text-violet-100">{t('facePatch.title')}</summary>
      <CharacterFacePatchPanel {...props} />
    </details>
    {!isFacePatchCompatible(mouth, props.poseId, pose?.source) && <p className="text-[9px] text-amber-200">{t('facePatch.stalePose')}</p>}
  </>
}
