import { reconcileAgentTurnWithRequest } from './agentActions'
import { withWizardRejections } from './wizardTurnReport'

/** A visual answer is evidence only; even an LLM's confirm:true cannot grant action authority. */
export async function reconcileWizardMediaTurn(hasVisualMedia: boolean,
  ...args: Parameters<typeof reconcileAgentTurnWithRequest>) {
  const before = args[1]
  const after = hasVisualMedia ? { ...before, actions: [] } : await reconcileAgentTurnWithRequest(...args)
  return withWizardRejections(before, after, hasVisualMedia ? 'visual_evidence_only' : 'request_policy')
}
