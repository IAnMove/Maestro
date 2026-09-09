import * as api from '../../api/client'

type Preparation = typeof import('./imageCommandSubmission').prepareStudioSubmission
type Inputs = Parameters<Preparation>
type Loader = () => Promise<{ prepareStudioSubmission: Preparation }>
type SpeechPreparation = typeof import('./speechCommandSubmission').prepareStudioSpeechSubmission
type MusicPreparation = typeof import('./musicCommandSubmission').prepareStudioMusicSubmission
type SfxPreparation = typeof import('./sfxCommandSubmission').prepareStudioSfxSubmission
type StudioSubmission = Awaited<ReturnType<Preparation>> | Awaited<ReturnType<SpeechPreparation>> | Awaited<ReturnType<MusicPreparation>> | Awaited<ReturnType<SfxPreparation>>

/** Preserve the legacy path and surface image chunk failures in the job tile. */
export async function prepareStudioSubmission(
  params: Inputs[0], before: Inputs[1], current: Inputs[2],
  context?: Inputs[3], referenceErrors?: Inputs[4],
  load: Loader = () => import('./imageCommandSubmission'),
): Promise<StudioSubmission> {
  try {
    if (before.generationMode === 'image') {
      const implementation = await load()
      return await implementation.prepareStudioSubmission(params, before, current, context, referenceErrors)
    }
    // Import only the selected modality; all typed failures retain the same
    // rejected submission and cannot fall back to the legacy endpoint.
    if (before.generationMode === 'audio' && before.audioSubMode === 'speech') {
      const implementation = await import('./speechCommandSubmission')
      return await implementation.prepareStudioSpeechSubmission(params, before, current, context, referenceErrors)
    }
    if (before.generationMode === 'audio' && before.audioSubMode === 'music') {
      const implementation = await import('./musicCommandSubmission')
      return await implementation.prepareStudioMusicSubmission(params, before, current, context, referenceErrors)
    }
    if (before.generationMode === 'audio' && before.audioSubMode === 'sfx') {
      const implementation = await import('./sfxCommandSubmission')
      return await implementation.prepareStudioSfxSubmission(params, before, current, context, referenceErrors)
    }
  } catch (error) {
    return { params, submit: () => Promise.reject(error) }
  }
  return { params, submit: () => api.submitGeneration(params) }
}

/** Image references travel as canonical URLs; other native modes retain paths. */
export function studioUploadReference(upload: { path: string; url: string }, mode: string): string {
  return mode === 'image' ? upload.url : upload.path
}
