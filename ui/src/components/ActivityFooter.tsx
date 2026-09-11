import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, CircleSlash2, ListVideo, Loader2, Eraser } from 'lucide-react'
import * as api from '../api/client'
import type { CanonicalTask } from '../api/client'
import { applyCanonicalTaskEvent, canonicalTaskVisualState, reconcileCanonicalTaskSnapshot } from '../lib/canonicalTaskEvents'
import { useStore } from '../stores/useStore'
import { listenForAgentActivityDetails, type ActivityDetailsRequest } from '../features/agent/agentUiBus'
import { useUiTranslation } from '../i18n'
import { publishCanonicalTasks } from '../features/activity/canonicalTaskFeed'
import {
  findActivityGroup,
  groupActivityTasks,
  isLiveStatus,
  taskProgressPercent,
} from '../features/activity/lineage'
import { ActivityExecutionDetail, type TaskControlAction, type TaskControlFailure } from '../features/activity/executionDetail'
import { openActivityArtifact, openActivityProject } from '../features/activity/openTargets'
import {
  estimatedRemainingSeconds,
  fallbackPhaseLabel,
  formatElapsed,
  formatEta,
  generationInitiator,
  generationPrompt,
  generationRecipe,
  PHASE_KEYS,
  truncatePrompt,
} from '../features/activity/taskPresentation'

const CONNECTED_RECONCILE_MS = 60_000
const DISCONNECTED_POLL_MS = 5_000
const HIDDEN_HISTORY_STORAGE_PREFIX = 'maestro-activity-hidden-v1:'

function hiddenHistoryStorageKey(workspace: string): string {
  return `${HIDDEN_HISTORY_STORAGE_PREFIX}${workspace}`
}

function readHiddenHistory(workspace: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(hiddenHistoryStorageKey(workspace))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [])
  } catch {
    return new Set()
  }
}

function afterPaint(callback: () => void): void {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback)
  else queueMicrotask(callback)
}

function writeHiddenHistory(workspace: string, ids: Set<string>): void {
  try {
    const key = hiddenHistoryStorageKey(workspace)
    if (ids.size) window.localStorage.setItem(key, JSON.stringify([...ids]))
    else window.localStorage.removeItem(key)
  } catch {
    // Hiding history is still useful for the current session if storage is
    // blocked (private browsing, disabled cookies, or a quota error).
  }
}

export function ActivityFooter() {
  const { t: tCommon } = useUiTranslation('common')
  const { t: tActivity } = useUiTranslation('activity')
  const activeWorkspace = useStore(state => state.activeWorkspace)
  const workspaceRef = useRef(activeWorkspace)
  workspaceRef.current = activeWorkspace
  const setVideoWorkflowsOpen = useStore(state => state.setDashboardOpen)
  const [tasks, setTasks] = useState<CanonicalTask[]>([])
  const tasksRef = useRef<CanonicalTask[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const [controlFailures, setControlFailures] = useState<Record<string, TaskControlFailure>>({})
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<Set<string>>(() => new Set())
  const hiddenHistoryIdsRef = useRef<Set<string>>(new Set())
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set())
  const [inspectedAttemptByGroup, setInspectedAttemptByGroup] = useState<Record<string, string>>({})
  const pendingFocusRef = useRef<ActivityDetailsRequest | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const detailsOpenRef = useRef(detailsOpen)
  detailsOpenRef.current = detailsOpen
  const [focusNonce, setFocusNonce] = useState(0)

  useEffect(() => {
    const loaded = readHiddenHistory(activeWorkspace)
    hiddenHistoryIdsRef.current = loaded
    setHiddenHistoryIds(loaded)
    setSelectedGroupId(null)
    setExpandedGroupIds(new Set())
    setInspectedAttemptByGroup({})
    pendingFocusRef.current = null
  }, [activeWorkspace])

  useEffect(() => listenForAgentActivityDetails(request => {
    if (!detailsOpenRef.current) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : toggleRef.current
    }
    setDetailsOpen(true)
    if (request?.taskId || request?.intentId || request?.receiptId) {
      pendingFocusRef.current = request
      setFocusNonce(value => value + 1)
    }
  }), [])

  useEffect(() => {
    let mounted = true
    let refreshPending = false
    let streamConnected = false
    let pollTimer: number | null = null
    let closeEvents: () => void = () => undefined
    let unknownTaskBaseline = 0

    const commitTasks = (next: CanonicalTask[]) => {
      tasksRef.current = next
      setTasks(next)
      publishCanonicalTasks(next)
    }
    const refresh = async (): Promise<number | null> => {
      if (refreshPending) return null
      refreshPending = true
      try {
        const result = await api.fetchCanonicalTasks(activeWorkspace, 'all')
        if (mounted) {
          const snapshotBoundary = Math.max(
            unknownTaskBaseline,
            ...result.tasks.map(task => Number(task.updated_at || 0)),
          )
          unknownTaskBaseline = snapshotBoundary
          commitTasks(reconcileCanonicalTaskSnapshot(
            tasksRef.current,
            result.tasks,
            snapshotBoundary,
          ))
        }
        return Number(result.latest_event_id || 0)
      } catch {
        return null
      } finally {
        refreshPending = false
      }
    }

    const schedulePoll = () => {
      if (!mounted) return
      if (pollTimer !== null) window.clearTimeout(pollTimer)
      pollTimer = window.setTimeout(async () => {
        pollTimer = null
        await refresh()
        schedulePoll()
      }, streamConnected ? CONNECTED_RECONCILE_MS : DISCONNECTED_POLL_MS)
    }

    const connectAfterSnapshot = async () => {
      const initialEventId = await refresh()
      if (!mounted) return
      // Never replay from zero after a failed snapshot. Retrying the small
      // snapshot request first is bounded; opening SSE without its cursor is
      // not bounded on a long-lived workspace.
      if (initialEventId === null) {
        pollTimer = window.setTimeout(() => {
          pollTimer = null
          void connectAfterSnapshot()
        }, DISCONNECTED_POLL_MS)
        return
      }
      closeEvents = api.subscribeCanonicalTaskEvents(
        activeWorkspace,
        event => {
          const result = applyCanonicalTaskEvent(tasksRef.current, event, unknownTaskBaseline)
          if (result.tasks !== tasksRef.current) commitTasks(result.tasks)
          if (result.needsRefresh) void refresh()
        },
        () => undefined,
        state => {
          if (!mounted) return
          streamConnected = state === 'open'
          schedulePoll()
        },
        initialEventId,
      )
      schedulePoll()
    }

    tasksRef.current = []
    setTasks([])
    publishCanonicalTasks([])
    setControlFailures({})
    void connectAfterSnapshot()
    return () => {
      mounted = false
      closeEvents()
      if (pollTimer !== null) window.clearTimeout(pollTimer)
    }
  }, [activeWorkspace])

  const visibleTasks = useMemo(
    () => tasks.filter(task => !hiddenHistoryIds.has(task.id) || isLiveStatus(task.status)),
    [hiddenHistoryIds, tasks],
  )
  const groups = useMemo(
    () => groupActivityTasks(visibleTasks, { workspace: activeWorkspace }),
    [activeWorkspace, visibleTasks],
  )
  const liveGroups = groups.filter(group => (
    group.readingState === 'prepared' || group.readingState === 'admitted' || group.readingState === 'running'
  ))
  const historicalGroups = groups.filter(group => !liveGroups.includes(group))
  const primaryGroup = liveGroups[0] || groups[0] || null
  const primary = primaryGroup?.primary as CanonicalTask | undefined

  useEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending || !groups.length) return
    const match = findActivityGroup(groups, pending)
    if (!match) return
    setSelectedGroupId(match.id)
    setExpandedGroupIds(current => new Set(current).add(match.id))
    if (pending.inspectPreviousAttempt && match.previousAttempt) {
      setInspectedAttemptByGroup(current => ({ ...current, [match.id]: match.previousAttempt!.id }))
    }
    pendingFocusRef.current = null
    afterPaint(() => {
      const node = panelRef.current?.querySelector(`[data-group-id="${match.id}"]`)
      if (node instanceof HTMLElement) node.focus()
    })
  }, [focusNonce, groups])

  const closePanel = () => {
    setDetailsOpen(false)
    const restore = restoreFocusRef.current || toggleRef.current
    restoreFocusRef.current = null
    afterPaint(() => restore?.focus())
  }

  const openPanel = () => {
    if (!detailsOpen) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : toggleRef.current
    }
    setDetailsOpen(true)
  }

  const togglePanel = () => {
    if (detailsOpen) closePanel()
    else openPanel()
  }

  useEffect(() => {
    if (!detailsOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      closePanel()
    }
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [detailsOpen])

  const clearHistory = () => {
    const next = new Set(hiddenHistoryIdsRef.current)
    for (const task of tasksRef.current) {
      if (!isLiveStatus(task.status)) next.add(task.id)
    }
    hiddenHistoryIdsRef.current = next
    setHiddenHistoryIds(next)
    writeHiddenHistory(activeWorkspace, next)
    if (!liveGroups.length) closePanel()
  }

  useEffect(() => {
    if (!liveGroups.length) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [liveGroups.length])

  const runControl = (task: CanonicalTask, action: TaskControlAction) => {
    if (busyIds.has(task.id)) return
    const workspace = activeWorkspace
    const taskId = task.id
    setBusyIds(current => new Set(current).add(taskId))
    const operation = action === 'cancel'
      ? api.cancelCanonicalTask(taskId, workspace)
      : action === 'resume'
        ? api.resumeCanonicalTask(taskId, workspace)
        : api.dismissCanonicalTask(taskId, workspace)
    void operation.then(result => {
      if (workspaceRef.current !== workspace) return
      const next = action === 'dismiss'
        ? tasksRef.current.filter(item => item.id !== taskId)
        : tasksRef.current.map(item => item.id === taskId && Number((result as CanonicalTask).updated_at) >= Number(item.updated_at) ? result as CanonicalTask : item)
      tasksRef.current = next
      setTasks(next)
      publishCanonicalTasks(next)
      setControlFailures(current => {
        if (!current[taskId]) return current
        const nextFailures = { ...current }
        delete nextFailures[taskId]
        return nextFailures
      })
    }).catch(reason => {
      if (workspaceRef.current !== workspace) return
      const message = reason instanceof Error ? reason.message : String(reason)
      setControlFailures(current => ({
        ...current,
        [taskId]: { action, message },
      }))
      openPanel()
    }).finally(() => {
      setBusyIds(current => {
        const next = new Set(current)
        next.delete(taskId)
        return next
      })
    })
  }

  const copyId = (task: CanonicalTask) => {
    void navigator.clipboard?.writeText(task.id)
  }

  const copyPrompt = (task: CanonicalTask) => {
    const prompt = generationPrompt(task)
    if (prompt) void navigator.clipboard?.writeText(prompt)
  }

  const isActive = liveGroups.length > 0
  const hasError = !isActive && (primary?.status === 'failed' || primary?.status === 'interrupted' || primaryGroup?.readingState === 'failed')
  const primaryVisualState = primary ? canonicalTaskVisualState(primary.status) : 'neutral'
  const primaryMessage = primary?.error?.message || primary?.detail || primary?.message || tActivity('ready')
  const primaryEta = primary ? formatEta(estimatedRemainingSeconds(primary, clock)) : ''
  const primaryActiveChild = primaryGroup?.jobs.map(job => job.task).find(child => isLiveStatus(child.status) && child.id !== primary?.id)
  const primaryChildEta = primaryActiveChild
    ? formatEta(estimatedRemainingSeconds(primaryActiveChild, clock))
    : ''
  const primaryPhase = primary
    ? tActivity(`phases.${PHASE_KEYS[primary.phase] || 'fallback'}`, { phase: fallbackPhaseLabel(primary), defaultValue: fallbackPhaseLabel(primary) })
    : ''

  return (
    <footer className="relative h-10 shrink-0 border-t border-border bg-bg-secondary px-3 sm:px-4 flex items-center gap-3 text-[10px] z-40">
      {detailsOpen && groups.length > 0 && createPortal(
        <div
          ref={panelRef}
          id="activity-details"
          data-testid="activity-details"
          role="dialog"
          aria-modal="false"
          aria-label={tActivity('panelTitle')}
          tabIndex={-1}
          className="fixed bottom-12 left-3 right-3 z-[110] text-[10px] max-h-[min(70dvh,calc(100dvh-4.5rem))] overflow-y-auto rounded-lg border border-border bg-bg-secondary p-2 shadow-2xl sm:right-auto sm:w-[min(48rem,calc(100vw-1.5rem))] sm:max-h-[min(24rem,calc(100dvh-4rem))]"
        >
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="font-semibold text-text-primary">{tActivity('panelTitle')}</span>
            <div className="flex items-center gap-2">
              {historicalGroups.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] text-text-muted hover:text-text-primary"
                  title={tActivity('clearHistoryTitle')}
                  aria-label={tActivity('clearHistoryAria')}
                >
                  <Eraser size={10} /> {tActivity('clearHistory')}
                </button>
              )}
              <span className="text-text-muted">{tActivity('activeDurable', { count: liveGroups.length })}</span>
              <button type="button" onClick={closePanel} aria-label={tCommon('actions.close')} className="rounded border border-border px-2 py-1">{tCommon('actions.close')}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {groups.map(group => (
              <ActivityExecutionDetail
                key={group.id}
                group={group}
                clock={clock}
                selected={selectedGroupId === group.id}
                expanded={expandedGroupIds.has(group.id)}
                inspectedAttemptId={inspectedAttemptByGroup[group.id]}
                busyIds={busyIds}
                controlFailures={controlFailures}
                onSelect={() => setSelectedGroupId(group.id)}
                onToggleExpand={() => setExpandedGroupIds(current => {
                  const next = new Set(current)
                  if (next.has(group.id)) next.delete(group.id)
                  else next.add(group.id)
                  return next
                })}
                onInspectPrevious={() => {
                  if (!group.previousAttempt) return
                  setSelectedGroupId(group.id)
                  setExpandedGroupIds(current => new Set(current).add(group.id))
                  setInspectedAttemptByGroup(current => ({ ...current, [group.id]: group.previousAttempt!.id }))
                }}
                onControl={runControl}
                onCopyId={copyId}
                onCopyPrompt={copyPrompt}
                onOpenArtifact={name => { openActivityArtifact(name) }}
                onOpenProject={() => { if (group.project) openActivityProject(group.project) }}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}

      <button
        ref={toggleRef}
        type="button"
        onClick={togglePanel}
        className="flex items-center gap-1.5 shrink-0"
        aria-expanded={detailsOpen}
        aria-controls={detailsOpen ? 'activity-details' : undefined}
        title={tActivity('openHistory')}
      >
        {isActive
          ? <Loader2 size={13} className="animate-spin text-accent-blue" />
          : hasError
            ? <AlertCircle size={13} className="text-red-400" />
            : primaryVisualState === 'cancelled'
              ? <CircleSlash2 size={13} className="text-text-muted" />
              : <CheckCircle2 size={13} className="text-emerald-400" />}
        <span className="font-medium text-text-primary">{tActivity('title')}</span>
        {liveGroups.length > 0 && <span className="rounded-full bg-accent-blue/15 px-1.5 py-0.5 text-accent-blue tabular-nums">{liveGroups.length}</span>}
        {detailsOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
      </button>

      <div className="min-w-0 flex-1 flex items-center gap-2">
        {primary && <span className="hidden sm:inline shrink-0 capitalize text-text-muted">{primaryPhase}</span>}
        {primary && <span className="shrink-0 tabular-nums text-text-muted">{formatElapsed(primary, clock)}</span>}
        {primaryEta && <span className="hidden sm:inline shrink-0 tabular-nums text-accent-blue" title={tActivity('etaTitle')}>{tActivity('eta', { value: primaryEta })}</span>}
        {primaryActiveChild && (
          <span className="hidden lg:inline shrink-0 max-w-56 truncate text-violet-300" title={tActivity('activeSubtask', { phase: primaryActiveChild.message })}>
            {tActivity('subtask', { phase: tActivity(`phases.${PHASE_KEYS[primaryActiveChild.phase || ''] || 'fallback'}`, { phase: fallbackPhaseLabel(primaryActiveChild), defaultValue: fallbackPhaseLabel(primaryActiveChild) }) })}
            {primaryChildEta ? ` · ${tActivity('eta', { value: primaryChildEta })}` : ''}
          </span>
        )}
        {primary?.model && <span className="hidden md:inline max-w-64 shrink-0 truncate rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-amber-300" title={generationRecipe(primary)}>{primary.model}</span>}
        {primary && generationInitiator(primary) && <span className="hidden lg:inline max-w-48 shrink-0 truncate text-violet-300" title={generationInitiator(primary)}>{generationInitiator(primary)}</span>}
        {primary && generationPrompt(primary) && (
          <button type="button" onClick={() => copyPrompt(primary)} className="hidden xl:block min-w-0 max-w-80 truncate text-left text-text-secondary hover:text-text-primary" title={tActivity('copyPromptTitle', { prompt: generationPrompt(primary) })} aria-label={tActivity('copyBarPrompt', { title: primary.title })}>
            “{truncatePrompt(generationPrompt(primary), 100)}”
          </button>
        )}
        <span className={`truncate ${hasError ? 'text-red-400' : isActive ? 'text-text-secondary' : 'text-text-muted'}`} title={primaryMessage}>{primaryMessage}</span>
      </div>

      {isActive && primary && (
        <div className="hidden sm:flex items-center gap-2 w-52 shrink-0">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
            <div className="h-full rounded-full bg-accent-blue transition-[width] duration-500" style={{ width: `${Math.max(taskProgressPercent(primary), taskProgressPercent(primary) > 0 ? 2 : 0)}%` }} />
          </div>
          <span className="w-10 text-right tabular-nums text-text-secondary">{primary.total > 0 ? `${primary.current}/${primary.total}` : `${Math.round(taskProgressPercent(primary))}%`}</span>
        </div>
      )}
      {primary && isLiveStatus(primary.status) && primary.cancelable && (
        <button type="button" disabled={busyIds.has(primary.id)} onClick={() => runControl(primary, 'cancel')} className="flex shrink-0 items-center gap-1 rounded-md border border-red-400/40 px-2 py-1 text-red-300 disabled:opacity-50">
          {busyIds.has(primary.id) && <Loader2 size={11} className="animate-spin" />}
          <span>{busyIds.has(primary.id) ? tActivity('cancelling') : tCommon('actions.cancel')}</span>
        </button>
      )}
      <button onClick={() => {
        useStore.getState().setMediaFilter('runs')
        setVideoWorkflowsOpen(false)
      }} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent-blue/50 hover:text-accent-blue transition-colors shrink-0" title={tActivity('workspacesTitle')}>
        <ListVideo size={12} /><span className="hidden sm:inline">{tActivity('workspaces')}</span>
      </button>
    </footer>
  )
}
