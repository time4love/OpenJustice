import type { Evidence } from '@prisma/client';

/**
 * The common evidence fields every thesis/forensic-analysis agent needs as
 * context, picked directly off the Prisma model so a schema change can't
 * silently desync this from what agents actually receive.
 */
export type EvidenceContext = Pick<
  Evidence,
  | 'fileHash'
  | 'summary'
  | 'evidenceTier'
  | 'evidenceRole'
  | 'evidenceDate'
  | 'investigativeCategories'
  | 'targetEntity'
>;
