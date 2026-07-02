// lib/llm-client.ts
// Barrel re-export — kept for import-path stability after the Phase 2
// "10x rebuild" split of the original 1745-line god module into
// lib/engine/{model,prompt,parse,orchestrator,worker,memo,budget,events}.ts.
//
// Do NOT add new logic here. New code goes in the relevant lib/engine/*.ts
// module; this file only re-exports the public surface that existed before
// the split, so no other file's imports need to change.
//
// Server-side ONLY — never import from a client component.

export { CLOUD_MODEL, getModel, callLLM, callEmbeddings } from './engine/model'
export { buildFinalPrompt, buildOrcContext } from './engine/prompt'
export { checkTokenBudget } from './engine/budget'
export { logEvent } from './engine/events'
export type { ApprovalRequest } from './engine/parse'
export { parseApprovalRequest } from './engine/parse'
export { runOrchestratorTask, runOrcReport } from './engine/orchestrator'
export { runWorkerTask } from './engine/worker'
