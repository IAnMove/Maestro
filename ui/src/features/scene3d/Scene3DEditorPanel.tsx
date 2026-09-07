import { useUiTranslation } from '../../i18n'
import { Scene3DWorkspace } from './Scene3DWorkspace.tsx'

export function Scene3DEditorPanel() {
  const { t } = useUiTranslation('scene3d')
  return (
    <div className="flex w-full flex-col gap-3" data-testid="world3d-editor">
      <div>
        <h1 className="text-sm font-semibold text-text-primary">{t('stage.editorTitle')}</h1>
        <p className="text-[10px] leading-relaxed text-text-muted">{t('stage.editorHelp')}</p>
      </div>
      <Scene3DWorkspace width={1280} height={720} />
    </div>
  )
}
