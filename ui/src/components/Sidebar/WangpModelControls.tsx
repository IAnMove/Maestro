import { useStore } from '../../stores/useStore'
import { WangpFrameInputs } from './WangpFrameInputs'
import { WangpReferenceControls } from './WangpReferenceControls'
import { WangpAdvancedControls } from './WangpAdvancedControls'

export function WangpModelControls() {
  const mode = useStore(s => s.generationMode)
  if (mode !== 'video' && mode !== 'image') return null
  return <>
    {mode === 'video' && <><WangpReferenceControls /><WangpFrameInputs /></>}
    <WangpAdvancedControls />
  </>
}
