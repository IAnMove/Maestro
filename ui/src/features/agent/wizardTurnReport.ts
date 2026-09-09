import type { AgentActionResult, AgentTurn } from './agentActions'

export type WizardRejectionCode = 'invalid_action' | 'invalid_action_list' | 'action_limit'
  | 'preparation_required' | 'duplicate_generation' | 'request_policy' | 'visual_evidence_only'

export interface WizardActionRejection {
  index: number
  actionType: string
  code: WizardRejectionCode
}

/** Retain bounded diagnostics, never arbitrary model payloads or model-supplied reasons. */
export function rejectedWizardAction(value: unknown, index: number,
  code: WizardRejectionCode = 'invalid_action'): WizardActionRejection {
  const type = value && typeof value === 'object' && 'type' in value ? value.type : ''
  return { index, actionType: typeof type === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(type) ? type : 'unknown', code }
}

/** Reconciliation may replace a proposal; keep the exclusions when it builds a new turn. */
export function withWizardRejections(before: AgentTurn, after: AgentTurn,
  code: 'request_policy' | 'visual_evidence_only'): AgentTurn {
  const counts = new Map<string, number>()
  for (const action of after.actions) counts.set(action.type, (counts.get(action.type) || 0) + 1)
  const rejections = [...(before.rejections || [])]
  before.actions.forEach((action, index) => {
    const remaining = counts.get(action.type) || 0
    if (remaining) counts.set(action.type, remaining - 1)
    else rejections.push(rejectedWizardAction(action, index, code))
  })
  return { ...after, ...(rejections.length ? { rejections } : {}) }
}

const PRESENTATION_ACTIONS = new Set(['open_tab', 'open_story_section', 'open_series_section', 'select_workspace'])
type Translate = (key: string, options?: Record<string, unknown>) => string

/** Free-form model prose cannot certify the result of an action-bearing turn. */
export function formatWizardTurnReply(turn: AgentTurn, results: AgentActionResult[], t: Translate): string {
  const hasActions = turn.actions.some(action => !PRESENTATION_ACTIONS.has(action.type))
    || results.some(result => !PRESENTATION_ACTIONS.has(result.action.type))
    || Boolean(turn.rejections?.length)
  const paragraphs: string[] = []
  if (!hasActions && turn.reply) paragraphs.push(turn.reply)
  if (results.length) {
    const lines = results.map(result => {
      const state = result.commandResult?.status || result.report?.state
      const knownStates = ['completed', 'queued', 'running', 'prepared', 'awaiting_input', 'partial', 'failed', 'cancelled']
      const label = state && knownStates.includes(state)
        ? t(`executionState.${state}`)
        : t(result.ok ? 'executionState.reported' : 'executionState.failed')
      return `- **${label}.** ${result.message}`
    })
    paragraphs.push(`### ${t('actionReport')}\n${lines.join('\n')}`)
  } else if (hasActions) paragraphs.push(t('noActionReceipt'))
  if (turn.rejections?.length) {
    const lines = turn.rejections.map(rejection => `- ${t('rejectedAction', {
      action: rejection.actionType,
      reason: t(`rejectionReason.${rejection.code}`),
    })}`)
    paragraphs.push(`### ${t('rejectedActions')}\n${lines.join('\n')}`)
  }
  return paragraphs.join('\n\n') || t('emptyReply')
}
