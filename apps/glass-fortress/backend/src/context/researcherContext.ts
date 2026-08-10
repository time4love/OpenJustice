import { AsyncLocalStorage } from 'async_hooks';

// ---------------------------------------------------------------------------
// Researcher request context
//
// Set in mcpRoutes once a write-tool bearer token is validated.
// Write tool handlers call getResearcherId() to stamp createdById on DB writes.
// Returns null for unauthenticated read tools or legacy code paths.
// ---------------------------------------------------------------------------

interface ResearcherStore {
  researcherId: string;
}

export const researcherContext = new AsyncLocalStorage<ResearcherStore>();

export function getResearcherId(): string | null {
  return researcherContext.getStore()?.researcherId ?? null;
}
