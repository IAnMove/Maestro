import { useEffect, useMemo, useState } from 'react'
import { Check, Download, RefreshCw, X } from 'lucide-react'
import { isSameProduction } from './activityOpen.ts'
import { interpolate, reviewCopy, type ReviewCopy } from './copy.ts'
import { approveShot, persistCommandsFor, rejectShot, setShotNotes } from './decisions.ts'
import { exportApprovedSelection } from './exportSelection.ts'
import { applyRegenPlan, planSubsetRegeneration, queuedTakeFromJob, rerunCommands } from './regenerate.ts'
import { canApproveTake, isTakeCompleted } from './status.ts'
import { comparePair, selectExactTake, setCompareTake } from './takes.ts'
import type {
  ActivityOpenSource, PersistCommand, RegenOutcome, RegenPlan, ReviewDesk, ReviewShot, ReviewTake,
} from './types.ts'

const chip = 'rounded border border-border px-2 py-1 text-[10px]'
const action = `${chip} inline-flex items-center gap-1 hover:bg-bg-hover disabled:opacity-40`

export interface ProductionReviewDeskProps {
  desk: ReviewDesk
  onChange: (desk: ReviewDesk) => void
  onPersist?: (commands: PersistCommand[]) => void | Promise<void>
  onRegenerate?: (plan: RegenPlan) => Promise<RegenOutcome[]>
  activityTarget?: ActivityOpenSource | null
  fileUrl?: (filename: string) => string
}

function durationLabel(copy: ReviewCopy, seconds: number | null | undefined): string {
  if (seconds == null) return copy.noDuration
  return interpolate(copy.duration, { seconds: Number(seconds).toFixed(1) })
}

function TakeStage({
  label, take, copy, fileUrl, selected, onSelect,
}: {
  label: string
  take: ReviewTake | null
  copy: ReviewCopy
  fileUrl: (filename: string) => string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <article data-testid={label === copy.takeA ? 'take-a' : 'take-b'} className={`rounded-lg border p-2 ${selected ? 'border-emerald-400 bg-emerald-500/10' : 'border-border'}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
        <span>{label}</span>
        <span>{take ? interpolate(copy.status, { value: copy[take.status] || take.status }) : copy.noTake}</span>
      </div>
      {take?.filename
        ? <video className="aspect-video w-full rounded bg-black" src={fileUrl(take.filename)} controls data-take-id={take.id} />
        : <div className="flex aspect-video items-center justify-center rounded bg-black/70 text-[10px] text-text-muted">{take ? copy[take.status] : copy.noTake}</div>}
      <p className="mt-1 truncate font-mono text-[9px]" title={take?.id}>{take ? interpolate(copy.take, { id: take.id }) : copy.noTake}</p>
      <p className="text-[9px] text-text-muted">{durationLabel(copy, take?.durationSeconds)}</p>
      {take && <button type="button" className={`${action} mt-1`} onClick={onSelect} aria-pressed={selected}>{copy.selectTake}</button>}
    </article>
  )
}

function ShotRail({
  desk, copy, focusId, picked, onFocus, onToggle,
}: {
  desk: ReviewDesk
  copy: ReviewCopy
  focusId: string
  picked: string[]
  onFocus: (id: string) => void
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <nav className="max-h-[40rem] overflow-y-auto border-b border-border p-2 lg:border-b-0 lg:border-r" aria-label={copy.title}>
      {desk.shots.map((shot, index) => (
        <div key={shot.id} className={`mb-1.5 rounded border p-2 ${shot.id === focusId ? 'border-violet-400 bg-violet-500/15' : 'border-border'}`}>
          <label className="flex items-center gap-2 text-[10px]">
            <input
              type="checkbox"
              checked={picked.includes(shot.id)}
              disabled={shot.decision === 'approved'}
              onChange={event => onToggle(shot.id, event.target.checked)}
              aria-label={interpolate(copy.shot, { n: index + 1 })}
            />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onFocus(shot.id)}>
              <span>{interpolate(copy.shot, { n: index + 1 })}</span>
              <span className="ml-2 text-text-muted">{copy[shot.decision]}</span>
              {shot.selectedTakeId && <span className="mt-1 block truncate font-mono text-[8px]" data-selected-take={shot.selectedTakeId}>{shot.selectedTakeId}</span>}
            </button>
          </label>
        </div>
      ))}
    </nav>
  )
}

function DecisionBar({
  shot, copy, onApprove, onReject, onNotes,
}: {
  shot: ReviewShot
  copy: ReviewCopy
  onApprove: () => void
  onReject: () => void
  onNotes: (value: string) => void
}) {
  const take = shot.takes.find(item => item.id === shot.selectedTakeId)
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[10px] text-text-muted">{durationLabel(copy, take?.durationSeconds ?? shot.durationSeconds)}</p>
      <p className="text-[10px] text-text-muted">{shot.refs.length ? interpolate(copy.refs, { list: shot.refs.join(', ') }) : copy.noRefs}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={action} disabled={!canApproveTake(take)} onClick={onApprove}><Check size={12} />{copy.approve}</button>
        <button type="button" className={action} onClick={onReject}><X size={12} />{copy.reject}</button>
      </div>
      <label className="block text-[10px]">{copy.notes}
        <textarea
          className="mt-1 min-h-16 w-full rounded border border-border bg-bg-secondary p-2 text-[11px]"
          value={shot.notes}
          placeholder={copy.notesPlaceholder}
          aria-label={copy.notes}
          onChange={event => onNotes(event.target.value)}
        />
      </label>
    </div>
  )
}

function ConfirmRegen({
  copy, count, onCancel, onConfirm,
}: {
  copy: ReviewCopy
  count: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div role="dialog" aria-label={copy.regenerateConfirmTitle} className="mt-3 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-[11px]">
      <p className="font-medium">{copy.regenerateConfirmTitle}</p>
      <p className="mt-1">{interpolate(copy.regenerateConfirm, { count })}</p>
      <p className="mt-1 text-text-muted">{copy.keepApproved}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className={action} onClick={onConfirm}>{copy.confirm}</button>
        <button type="button" className={action} onClick={onCancel}>{copy.cancel}</button>
      </div>
    </div>
  )
}

export function ProductionReviewDesk({
  desk, onChange, onPersist, onRegenerate, activityTarget, fileUrl,
}: ProductionReviewDeskProps) {
  const copy = reviewCopy()
  const [current, setCurrent] = useState(desk)
  const [focusId, setFocusId] = useState(desk.shots[0]?.id || '')
  const [picked, setPicked] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [exportNote, setExportNote] = useState('')
  useEffect(() => { setCurrent(desk) }, [desk])
  const shot = current.shots.find(item => item.id === focusId) || current.shots[0]
  const pair = useMemo(() => shot ? comparePair(shot) : { a: null, b: null }, [shot])
  const media = fileUrl || ((filename: string) => `#${filename}`)
  const fromActivity = isSameProduction(current, activityTarget)
  const persist = (next: ReviewDesk) => {
    setCurrent(next)
    onChange(next)
    void onPersist?.(persistCommandsFor(next))
  }

  const togglePick = (id: string, checked: boolean) => {
    setPicked(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id))
  }

  const runExport = () => {
    const selection = exportApprovedSelection(current)
    setExportNote(selection.clips.length
      ? interpolate(copy.exportReady, { count: selection.clips.length })
      : copy.exportEmpty)
  }

  const runRegen = async () => {
    const plan = planSubsetRegeneration(current, picked, { confirm: true, copy })
    const outcomes = onRegenerate
      ? await onRegenerate(plan)
      : plan.jobs.map(job => ({ shotId: job.shotId, ok: true, take: queuedTakeFromJob(job, `queued:${job.shotId}`) }))
    const next = applyRegenPlan(current, plan, outcomes, { copy })
    persist(next)
    void onPersist?.(rerunCommands(current, plan))
    setConfirm(false)
    setPicked([])
  }

  if (!shot) {
    return <section role="region" className="rounded-xl border border-border p-4 text-sm" aria-label={copy.title}><h2>{copy.title}</h2><p>{copy.empty}</p></section>
  }

  return (
    <section role="region" className="rounded-xl border border-border bg-bg-secondary p-3 text-text-primary" aria-label={copy.title} data-production-id={current.productionId}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{copy.title}</h2>
        {fromActivity && <span className="text-[10px] text-violet-300">{copy.openedFromActivity}</span>}
        <button type="button" className={action} onClick={() => setConfirm(true)} disabled={!picked.length}><RefreshCw size={12} />{copy.regenerate}</button>
        <button type="button" className={action} onClick={runExport}><Download size={12} />{copy.export}</button>
      </header>
      {exportNote && <p role="status" className="mb-2 text-[10px]">{exportNote}</p>}
      {confirm && <ConfirmRegen copy={copy} count={picked.length} onCancel={() => setConfirm(false)} onConfirm={() => void runRegen()} />}
      <div className="grid min-h-72 overflow-hidden rounded-lg border border-border lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ShotRail desk={current} copy={copy} focusId={shot.id} picked={picked} onFocus={setFocusId} onToggle={togglePick} />
        <div className="p-2">
          <p className="mb-2 text-[11px]">{copy.compare}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <TakeStage label={copy.takeA} take={pair.a} copy={copy} fileUrl={media} selected={pair.a?.id === shot.selectedTakeId} onSelect={() => pair.a && persist(selectExactTake(current, shot.id, pair.a.id))} />
            <TakeStage label={copy.takeB} take={pair.b} copy={copy} fileUrl={media} selected={pair.b?.id === shot.selectedTakeId} onSelect={() => pair.b && persist(selectExactTake(current, shot.id, pair.b.id))} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1" aria-label={copy.selectTake}>
            {shot.takes.map(take => (
              <button
                key={take.id}
                type="button"
                data-take-id={take.id}
                className={`${chip} ${take.id === shot.selectedTakeId ? 'bg-emerald-500/20' : ''}`}
                aria-pressed={take.id === shot.selectedTakeId}
                onClick={() => persist(selectExactTake(current, shot.id, take.id))}
                onContextMenu={event => { event.preventDefault(); persist(setCompareTake(current, shot.id, take.id)) }}
              >
                {take.id}{isTakeCompleted(take) ? '' : ` · ${copy[take.status]}`}
              </button>
            ))}
          </div>
          <DecisionBar
            shot={shot}
            copy={copy}
            onApprove={() => persist(approveShot(current, shot.id))}
            onReject={() => persist(rejectShot(current, shot.id))}
            onNotes={value => persist(setShotNotes(current, shot.id, value))}
          />
        </div>
      </div>
    </section>
  )
}
