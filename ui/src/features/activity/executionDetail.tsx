import { AlertCircle, CheckCircle2, CircleSlash2, Copy, Loader2 } from 'lucide-react'
import { canResumeCanonicalTask, canonicalTaskVisualState } from '../../lib/canonicalTaskEvents'
import { formatAppAction, formatAppTimestamp } from '../../lib/locale'
import { useUiTranslation } from '../../i18n'
import type { CanonicalTask } from '../../api/client'
import {
  isLiveStatus,
  taskProgressPercent,
  type ActivityAttempt,
  type ActivityGroup,
  type ActivityJob,
  type ActivityReadingState,
} from './lineage'
import {
  estimatedRemainingSeconds,
  fallbackPhaseLabel,
  formatElapsed,
  formatEta,
  generationInitiator,
  generationPrompt,
  generationRecipe,
  PHASE_KEYS,
  resourceSummary,
  truncatePrompt,
} from './taskPresentation'

export type TaskControlAction = 'cancel' | 'resume' | 'dismiss'
export interface TaskControlFailure {
  action: TaskControlAction
  message: string
}

interface ActivityExecutionDetailProps {
  group: ActivityGroup
  clock: number
  selected: boolean
  expanded: boolean
  inspectedAttemptId?: string
  busyIds: Set<string>
  controlFailures: Record<string, TaskControlFailure>
  onSelect: () => void
  onToggleExpand: () => void
  onInspectPrevious: () => void
  onControl: (task: CanonicalTask, action: TaskControlAction) => void
  onCopyId: (task: CanonicalTask) => void
  onCopyPrompt: (task: CanonicalTask) => void
  onOpenArtifact: (name: string) => void
  onOpenProject: () => void
}

function readingClass(state: ActivityReadingState): string {
  if (state === 'failed') return 'text-red-400'
  if (state === 'running') return 'text-accent-blue'
  if (state === 'partial') return 'text-amber-300'
  if (state === 'completed') return 'text-emerald-400'
  if (state === 'admitted' || state === 'prepared') return 'text-violet-300'
  return 'text-text-muted'
}

function StatusIcon({ status }: { status: string }) {
  const visual = canonicalTaskVisualState(status)
  if (visual === 'active') return <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-accent-blue" />
  if (visual === 'error') return <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-400" />
  if (visual === 'cancelled') return <CircleSlash2 size={12} className="mt-0.5 shrink-0 text-text-muted" />
  return <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" />
}

function AttemptRow({
  attempt,
  inspected,
}: {
  attempt: ActivityAttempt
  inspected: boolean
}) {
  const { t } = useUiTranslation('activity')
  return (
    <p
      data-attempt-id={attempt.id}
      data-inspected={inspected ? 'true' : undefined}
      className={`text-[8px] ${inspected ? 'text-amber-200' : 'text-text-muted'}`}
    >
      {t('lineage.previousAttempt', { n: attempt.attempt })}
      {attempt.error ? ` · ${attempt.error}` : attempt.message ? ` · ${attempt.message}` : ''}
      {attempt.resultRefs.length ? ` · ${attempt.resultRefs.join(', ')}` : ''}
    </p>
  )
}

function JobRow({
  job,
  clock,
  inspectedAttemptId,
  onCopyId,
  onCopyPrompt,
}: {
  job: ActivityJob
  clock: number
  inspectedAttemptId?: string
  onCopyId: (task: CanonicalTask) => void
  onCopyPrompt: (task: CanonicalTask) => void
}) {
  const { t } = useUiTranslation('activity')
  const child = job.task
  const recipe = generationRecipe(child)
  const resources = resourceSummary(child)
  const prompt = generationPrompt(child)
  const initiator = generationInitiator(child)
  const previous = job.attempts.filter(attempt => attempt.id !== `${child.id}:${child.attempt || 1}`)
  return (
    <div key={job.id} className="mb-1 last:mb-0" title={child.detail || child.message} data-job-id={job.id} data-reading-state={job.readingState}>
      <p>
        <span className={readingClass(job.readingState)}>{t(`lineage.reading.${job.readingState}`)}</span>
        {' · '}
        {t(`phases.${PHASE_KEYS[child.phase || ''] || 'fallback'}`, { phase: fallbackPhaseLabel(child), defaultValue: fallbackPhaseLabel(child) })}
        {' · '}
        {formatElapsed(child, clock)}
        {' · '}
        {child.message}
        {isLiveStatus(child.status) && formatEta(estimatedRemainingSeconds(child, clock)) && (
          ` · ${t('eta', { value: formatEta(estimatedRemainingSeconds(child, clock)) })}`
        )}
      </p>
      <p className="flex flex-wrap gap-x-2 text-[8px] text-text-muted">
        {recipe && <span className="text-amber-300">{recipe}</span>}
        {initiator && <span className="text-violet-300">{t('startedBy', { name: initiator })}</span>}
        {child.server_origin && <span>{t('server', { origin: child.server_origin })}</span>}
        {resources && <span className="text-accent-blue">{t(`resources.${resources.kind}`, { value: resources.value })}</span>}
        <span>{t('attempt', { current: child.attempt || 1, max: child.max_attempts || 1 })}</span>
        {!!child.token_usage?.total && (
          <span>
            {t('tokens', {
              total: child.token_usage.total.toLocaleString(),
              prompt: child.token_usage.prompt || 0,
              completion: child.token_usage.completion || 0,
            })}
          </span>
        )}
        <button type="button" onClick={() => onCopyId(child as CanonicalTask)} className="font-mono hover:text-text-primary" title={t('copyChildTaskId')}>
          {child.id}
        </button>
      </p>
      {prompt && (
        <button
          type="button"
          onClick={() => onCopyPrompt(child as CanonicalTask)}
          className="block max-w-full truncate text-left text-[8px] text-text-secondary hover:text-text-primary"
          title={t('copyPromptTitle', { prompt })}
          aria-label={t('copyPrompt', { title: child.title || child.id })}
        >
          {t('prompt')}: {truncatePrompt(prompt, 140)} <Copy size={8} className="inline" />
        </button>
      )}
      {previous.map(attempt => (
        <AttemptRow key={attempt.id} attempt={attempt} inspected={attempt.id === inspectedAttemptId} />
      ))}
    </div>
  )
}

export function ActivityExecutionDetail({
  group,
  clock,
  selected,
  expanded,
  inspectedAttemptId,
  busyIds,
  controlFailures,
  onSelect,
  onToggleExpand,
  onInspectPrevious,
  onControl,
  onCopyId,
  onCopyPrompt,
  onOpenArtifact,
  onOpenProject,
}: ActivityExecutionDetailProps) {
  const { t } = useUiTranslation('activity')
  const { t: tCommon } = useUiTranslation('common')
  const task = group.primary as CanonicalTask
  const taskChildren = group.jobs.filter(job => job.id !== task.id)
  const activeChild = group.jobs.map(job => job.task).find(child => isLiveStatus(child.status) && child.id !== task.id)
  const recipe = generationRecipe(task)
  const prompt = generationPrompt(task)
  const initiator = generationInitiator(task)
  const controlFailure = controlFailures[task.id]
  const updatedAt = formatAppTimestamp(task.updated_at)
  const taskEta = formatEta(estimatedRemainingSeconds(task, clock))
  const active = isLiveStatus(task.status)
  const resources = resourceSummary(task)
  const inspected = group.previousAttempt && group.previousAttempt.id === inspectedAttemptId
    ? group.previousAttempt
    : group.jobs.flatMap(job => job.attempts).find(attempt => attempt.id === inspectedAttemptId)

  return (
    <div
      key={group.id}
      data-task-id={task.id}
      data-group-id={group.id}
      data-reading-state={group.readingState}
      data-receipt-id={group.receiptId || undefined}
      data-intent-id={group.intentId || undefined}
      role="group"
      aria-current={selected ? 'true' : undefined}
      aria-expanded={expanded}
      aria-label={t('lineage.groupAria', { title: group.title, state: t(`lineage.reading.${group.readingState}`) })}
      tabIndex={-1}
      className={`rounded-md border bg-bg-primary p-2 ${selected ? 'border-accent-blue/70' : 'border-border'}`}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={task.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={onSelect} className="min-w-0 text-left font-medium text-text-primary">
              {task.title}
            </button>
            <div className="flex items-center gap-2">
              <span className={`capitalize ${readingClass(group.readingState)}`}>{t(`lineage.reading.${group.readingState}`)}</span>
              <span className="tabular-nums text-text-muted" title={updatedAt ? `${formatAppAction('updated')}: ${updatedAt}` : undefined}>{formatElapsed(task, clock)}</span>
              {active && taskEta && <span className="tabular-nums text-accent-blue" title={t('etaTitle')}>{t('eta', { value: taskEta })}</span>}
              {updatedAt && <span className="hidden md:inline text-text-muted">{updatedAt}</span>}
              <span className="capitalize text-text-muted">
                {t(`phases.${PHASE_KEYS[task.phase] || 'fallback'}`, { phase: fallbackPhaseLabel(task), defaultValue: fallbackPhaseLabel(task) })}
              </span>
              {active && task.cancelable && (
                <button type="button" disabled={busyIds.has(task.id)} onClick={() => onControl(task, 'cancel')} className="rounded border border-red-400/40 px-1.5 py-0.5 text-[9px] text-red-300">
                  {busyIds.has(task.id) ? t('cancelling') : tCommon('actions.cancel')}
                </button>
              )}
              {!active && canResumeCanonicalTask(task) && (
                <button type="button" disabled={busyIds.has(task.id)} onClick={() => onControl(task, 'resume')} className="rounded border border-border px-1.5 py-0.5 text-[9px] text-accent-blue">{tCommon('actions.resume')}</button>
              )}
              {!active && (
                <button type="button" disabled={busyIds.has(task.id)} onClick={() => onControl(task, 'dismiss')} className="rounded border border-border px-1.5 py-0.5 text-[9px] text-text-muted">{t('dismiss')}</button>
              )}
            </div>
          </div>
          <p className="text-[9px] text-text-muted">
            {t('lineage.progressLabel')} {Math.round(group.progress)}%
            {' · '}
            {t('lineage.resultLabel')} {t(`lineage.reading.${group.readingState}`)}
            {group.jobs.length > 1 ? ` · ${t('lineage.jobs', { count: group.jobs.length })}` : ''}
          </p>
          <p className={task.status === 'failed' || task.status === 'interrupted' ? 'text-red-400' : 'text-text-secondary'} title={task.detail || task.message}>
            {task.error?.message || task.detail || task.message}
          </p>
          {recipe && <p className="mt-0.5 break-words text-[9px] text-amber-300">{recipe}</p>}
          {initiator && <p className="mt-0.5 text-[9px] text-violet-300">{t('startedBy', { name: initiator })}</p>}
          {prompt && (
            <div className="mt-1 flex min-w-0 items-center gap-1 rounded border border-border/70 bg-bg-tertiary/40 px-1.5 py-1 text-[9px]">
              <span className="shrink-0 text-text-muted">{t('prompt')}</span>
              <button
                type="button"
                onClick={() => onCopyPrompt(task)}
                className="min-w-0 flex-1 truncate text-left text-text-secondary hover:text-text-primary"
                title={t('copyPromptTitle', { prompt })}
                aria-label={t('copyPrompt', { title: task.title })}
              >
                {truncatePrompt(prompt)}
              </button>
              <button type="button" onClick={() => onCopyPrompt(task)} className="shrink-0 text-text-muted hover:text-text-primary" title={t('copyPromptIcon', { title: task.title })} aria-label={t('copyPromptIcon', { title: task.title })}>
                <Copy size={10} />
              </button>
            </div>
          )}
          {resources && <p className="text-[9px] text-accent-blue">{t(`resources.${resources.kind}`, { value: resources.value })}</p>}
          {active && activeChild && (
            <p className="text-[9px] text-violet-300">
              {t('activeSubtask', { phase: t(`phases.${PHASE_KEYS[activeChild.phase || ''] || 'fallback'}`, { phase: fallbackPhaseLabel(activeChild), defaultValue: fallbackPhaseLabel(activeChild) }) })}
              {formatEta(estimatedRemainingSeconds(activeChild, clock)) && ` · ${t('eta', { value: formatEta(estimatedRemainingSeconds(activeChild, clock)) })}`}
            </p>
          )}
          {group.recoveryReason && (
            <p role="status" className="mt-1 text-[9px] text-red-300">{t('lineage.recoveryReason', { reason: group.recoveryReason })}</p>
          )}
          {controlFailure && (
            <div aria-live="polite" className="mt-1.5 flex items-center justify-between gap-2 rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-[9px] text-red-300">
              <span>{t('controlFailed', { action: controlFailure.action[0].toUpperCase() + controlFailure.action.slice(1), message: controlFailure.message })}</span>
              <button
                type="button"
                disabled={busyIds.has(task.id)}
                onClick={() => onControl(task, controlFailure.action)}
                className="shrink-0 rounded border border-red-300/50 px-1.5 py-0.5 font-medium disabled:opacity-50"
                aria-label={t('retryAction', { action: controlFailure.action })}
              >
                {tCommon('actions.retry')}
              </button>
            </div>
          )}
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-text-muted">
            {task.server_origin && <span>{t('server', { origin: task.server_origin })}</span>}
            <span>{t('attempt', { current: task.attempt, max: task.max_attempts })}</span>
            {!!task.token_usage?.total && (
              <span>
                {t('tokens', {
                  total: task.token_usage.total.toLocaleString(),
                  prompt: task.token_usage.prompt || 0,
                  completion: task.token_usage.completion || 0,
                })}
              </span>
            )}
            <button type="button" onClick={() => onCopyId(task)} className="font-mono hover:text-text-primary" title={t('copyTaskId')}>{task.id}</button>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.artifacts.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => onOpenArtifact(name)}
                className="rounded border border-emerald-400/30 px-1.5 py-0.5 text-[9px] text-emerald-300"
              >
                {t('lineage.openArtifact', { name })}
              </button>
            ))}
            {group.readingState === 'admitted' && !group.hasArtifact && (
              <span className="text-[9px] text-violet-300">{t('lineage.admittedWaiting')}</span>
            )}
            {group.project && (
              <button type="button" onClick={onOpenProject} className="rounded border border-border px-1.5 py-0.5 text-[9px] text-text-secondary">
                {t('lineage.openProject')}
              </button>
            )}
            {group.previousAttempt && (
              <button type="button" onClick={onInspectPrevious} className="rounded border border-border px-1.5 py-0.5 text-[9px] text-text-secondary" aria-pressed={Boolean(inspected)}>
                {t('lineage.inspectPrevious')}
              </button>
            )}
            {(group.jobs.length > 1 || group.previousAttempt || group.artifacts.length > 0) && (
              <button type="button" onClick={onToggleExpand} className="rounded border border-border px-1.5 py-0.5 text-[9px] text-text-muted">
                {expanded ? t('lineage.hideDetails') : t('lineage.showDetails')}
              </button>
            )}
          </div>
          {taskChildren.length > 0 && (
            <div className="mt-1 border-l border-border pl-2 text-[9px] text-text-muted">
              {taskChildren.map(job => (
                <JobRow
                  key={job.id}
                  job={job}
                  clock={clock}
                  inspectedAttemptId={inspectedAttemptId}
                  onCopyId={onCopyId}
                  onCopyPrompt={onCopyPrompt}
                />
              ))}
            </div>
          )}
          {expanded && inspected && (
            <div data-testid="activity-previous-attempt" className="mt-1 rounded border border-amber-400/30 bg-amber-400/5 px-1.5 py-1 text-[9px] text-amber-100">
              <AttemptRow attempt={inspected} inspected />
            </div>
          )}
          {active && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                <div className="h-full rounded-full bg-accent-blue transition-[width] duration-300" style={{ width: `${Math.max(taskProgressPercent(task), taskProgressPercent(task) > 0 ? 2 : 0)}%` }} />
              </div>
              <span className="w-12 text-right tabular-nums text-text-muted">{task.total > 0 ? `${task.current}/${task.total}` : `${Math.round(taskProgressPercent(task))}%`}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
