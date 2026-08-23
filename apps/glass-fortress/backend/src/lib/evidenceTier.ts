// ---------------------------------------------------------------------------
// Evidence tier — business/legal classification of a record.
//
// A pure constant, kept apart from the agents that assign it so that code
// which only needs to COMPARE tiers (the publication gate's Tier 2 floor) does
// not pull an LLM client into its module graph.
// ---------------------------------------------------------------------------

export const EVIDENCE_TIER = {
  ANECDOTAL: 'Tier 4: Anecdotal',
  SUPPORTING: 'Tier 3: Supporting',
  MATERIAL: 'Tier 2: Material',
  SMOKING_GUN: 'Tier 1: Smoking Gun',
} as const;

export type EvidenceTier = (typeof EVIDENCE_TIER)[keyof typeof EVIDENCE_TIER];
