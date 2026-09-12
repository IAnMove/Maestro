import { useEffect, useMemo, useState } from 'react'
import type { SavedPipelineState } from '../../types'
import { fetchVideoEditorExport, type VideoEditorExportJob } from '../../api/video-editor'
import { ProductionReviewDesk } from './ProductionReviewDesk'
import { projectReviewDesk } from './project'
import { exportReview, persistReview, regenerateReview, reviewFileUrl } from './runtime'
import { reviewCopy } from './copy'

export function ProductionReviewHost({ pipeline, workspace }: { pipeline: SavedPipelineState; workspace: string }) {
  const desk = useMemo(() => projectReviewDesk({ pipeline: { ...pipeline, workspace } }), [pipeline, workspace])
  const [job, setJob] = useState<VideoEditorExportJob | null>(null)
  const [error, setError] = useState('')
  const copy = reviewCopy()
  useEffect(() => {
    if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return
    let stopped = false
    const timeout = window.setTimeout(() => {
      void fetchVideoEditorExport(job.job_id).then(next => {
        if (!stopped) setJob(next)
      }).catch(reason => { if (!stopped) setError(String(reason)) })
    }, 1000)
    return () => { stopped = true; window.clearTimeout(timeout) }
  }, [job])
  return <div>
    <ProductionReviewDesk desk={desk} onChange={() => undefined}
      onPersist={commands => persistReview(desk, commands)}
      onRegenerate={plan => regenerateReview(desk, plan)}
      onExport={async selection => { setError(''); setJob(await exportReview(desk, selection)) }}
      fileUrl={filename => reviewFileUrl(filename, workspace)} />
    {job && <p role="status" className="p-2 text-sm">{job.message}
      {job.status === 'completed' && job.filename && <a className="ml-2 underline" href={reviewFileUrl(job.filename, workspace)} download>{copy.download}</a>}
    </p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
