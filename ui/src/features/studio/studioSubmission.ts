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
  if (before.generationMode === 'image') {
    try {
      const implementation = await load()
      return await implementation.prepareStudioSubmission(params, before, current, context, referenceErrors)
    } catch (error) {
      return { params, submit: () => Promise.reject(error) }
    }
  }
  // Speech gets the same durable snapshot/ACK boundary as typed image jobs.
  // Keep this import inside the selected sub-mode so opening Studio Image or
  // another audio tool does not pull the speech contract into the main chunk.
  if (before.generationMode === 'audio' && before.audioSubMode === 'speech') {
    try {
      const implementation = await import('./speechCommandSubmission')
      return await implementation.prepareStudioSpeechSubmission(params, before, current, context, referenceErrors)
    } catch (error) {
      return { params, submit: () => Promise.reject(error) }
    }
  }
  if (before.generationMode === 'audio' && before.audioSubMode === 'music') {
    try {
      const implementation = await import('./musicCommandSubmission')
      return await implementation.prepareStudioMusicSubmission(params, before, current, context, referenceErrors)
    } catch (error) {
      return { params, submit: () => Promise.reject(error) }
    }
  }
  if (before.generationMode === 'audio' && before.audioSubMode === 'sfx') {
    try {
      const implementation = await import('./sfxCommandSubmission')
      return await implementation.prepareStudioSfxSubmission(params, before, current, context, referenceErrors)
    } catch (error) {
      return { params, submit: () => Promise.reject(error) }
    }
  }
  return { params, submit: () => api.submitGeneration(params) }
}

/** Image references travel as canonical URLs; other native modes retain paths. */
export function studioUploadReference(upload: { path: string; url: string }, mode: string): string {
  return mode === 'image' ? upload.url : upload.path
}
