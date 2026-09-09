import type { AgentActionResult, AgentTurn } from './agentActions'
import { stableSerialize } from './agentContract'
import type { AgentVisualState } from './AgentAvatar'

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
  for (const action of after.actions) {
    const key = stableSerialize(action)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const rejections = [...(before.rejections || [])]
  for (const rejection of after.rejections || []) {
    if (!rejections.some(item => stableSerialize(item) === stableSerialize(rejection))) rejections.push(rejection)
  }
  before.actions.forEach((action, index) => {
    const key = stableSerialize(action)
    const remaining = counts.get(key) || 0
    if (remaining) counts.set(key, remaining - 1)
    else rejections.push(rejectedWizardAction(action, before.proposalIndices?.[index] ?? index, code))
  })
  return { ...after, ...(rejections.length ? { rejections } : {}) }
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/** Conservative presentation policy, not an authorization or execution classifier. */
function allowsExplanation(request: string): boolean {
  // JS `\b` is ASCII-only. Fold accents so "Qué" / "por qué" keep a word boundary.
  const text = request.trim().replace(/^[¿¡]+/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/^(?:hola|hello|hi|gracias|thanks)[\s!.]*$/i.test(text)) return true
  // An informational prefix does not erase a later imperative in a mixed turn.
  if (/(?:[,;.!?\n]|\b(?:and|then|also|y|luego|despu[eé]s))\s*(?:(?:please|por favor)[,\s]+)?(?:create|generate|make|update|delete|remove|add|save|export|start|retry|run|open|select|crea\w*|genera\w*|haz\w*|actualiza\w*|elimina\w*|borra\w*|a[nñ]ade\w*|guarda\w*|exporta\w*|inicia\w*|reintenta\w*|ejecuta\w*|abre|selecciona\w*)\b/i.test(text)) return false
  return /^(?:(?:please|por favor)[,\s]+)?(?:how\b|what\b|which\b|why\b|where\b|explain\b|describe\b|tell me (?:about|how|what|why)\b|(?:can|could) you (?:explain|describe)\b|c[oó]mo\b|qu[eé]\b|cu[aá]l\b|por qu[eé]\b|d[oó]nde\b|explica(?:me|rme)?\b|describe\b|descr[ií]beme\b|(?:puedes|podr[ií]as) explica(?:r|rme)\b)/i.test(text)
}

export function wizardResultState(result: AgentActionResult) {
  const states = [result.commandResult?.status, result.report?.state]
  if (states.includes('failed')) return 'failed'
  if (states.includes('awaiting_input')) return 'awaiting_input'
  if (!result.ok) return 'failed'
  for (const state of ['partial', 'queued', 'running', 'prepared', 'completed'] as const) {
    if (states.includes(state)) return state
  }
  return 'reported'
}

/** Use one defensive state for text, cards and the avatar; retain real receipt IDs. */
export function normalizeWizardResult(result: AgentActionResult): AgentActionResult {
  const state = wizardResultState(result)
  if (state === 'reported') return result
  return {
    ...result,
    ok: result.ok && !['failed', 'awaiting_input'].includes(state),
    ...(result.commandResult && state !== 'running' && state !== 'prepared'
      ? { commandResult: { ...result.commandResult, status: state } } : {}),
    ...(result.report ? { report: { ...result.report, state } } : {}),
  }
}

export function wizardTurnVisualState(turn: AgentTurn, results: AgentActionResult[]): AgentVisualState {
  const states = results.map(wizardResultState)
  if (turn.rejections?.length || states.some(state => ['failed', 'partial'].includes(state))) return 'error'
  if (states.some(state => state === 'queued' || state === 'running')) return 'acting'
  return states.length && states.every(state => state === 'completed') ? 'success' : 'idle'
}

/** Free-form model prose cannot certify the result of an action-bearing turn. */
export function formatWizardTurnReply(turn: AgentTurn, results: AgentActionResult[], t: Translate, request = ''): string {
  const hasActions = Boolean(turn.actions.length || results.length || turn.rejections?.length)
  const explanation = !hasActions && allowsExplanation(request)
  const paragraphs: string[] = []
  if (explanation && turn.reply) paragraphs.push(turn.reply)
  if (results.length) {
    const lines = results.map(result => {
      const label = t(`executionState.${wizardResultState(result)}`)
      return `- **${label}.** ${result.message}`
    })
    paragraphs.push(`### ${t('actionReport')}\n${lines.join('\n')}`)
  } else if (!explanation) paragraphs.push(t('noActionReceipt'))
  if (turn.rejections?.length) {
    const lines = turn.rejections.map(rejection => `- ${t('rejectedAction', {
      action: rejection.actionType,
      reason: t(`rejectionReason.${rejection.code}`),
    })}`)
    paragraphs.push(`### ${t('rejectedActions')}\n${lines.join('\n')}`)
  }
  return paragraphs.join('\n\n') || t('emptyReply')
}
