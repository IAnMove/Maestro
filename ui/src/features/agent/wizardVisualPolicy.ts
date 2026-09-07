import { reconcileAgentTurnWithRequest } from './agentActions'

/** A visual answer is evidence only; even an LLM's confirm:true cannot grant action authority. */
export async function reconcileWizardMediaTurn(hasVisualMedia: boolean,
  ...args: Parameters<typeof reconcileAgentTurnWithRequest>) {
  if (hasVisualMedia) return { ...args[1], actions: [] }
  return reconcileAgentTurnWithRequest(...args)
}
