import * as api from '../../api/client'

type Preparation = typeof import('./imageCommandSubmission').prepareStudioSubmission
type Inputs = Parameters<Preparation>
type Loader = () => Promise<{ prepareStudioSubmission: Preparation }>

/** Preserve the legacy path and surface image chunk failures in the job tile. */
export async function prepareStudioSubmission(
  params: Inputs[0], before: Inputs[1], current: Inputs[2],
  context?: Inputs[3], referenceErrors?: Inputs[4],
  load: Loader = () => import('./imageCommandSubmission'),
): ReturnType<Preparation> {
  if (before.generationMode !== 'image') return { params, submit: () => api.submitGeneration(params) }
  try {
    const implementation = await load()
    return await implementation.prepareStudioSubmission(params, before, current, context, referenceErrors)
  } catch (error) {
    return { params, submit: () => Promise.reject(error) }
  }
}

/** Image references travel as canonical URLs; other native modes retain paths. */
export function studioUploadReference(upload: { path: string; url: string }, mode: string): string {
  return mode === 'image' ? upload.url : upload.path
}
