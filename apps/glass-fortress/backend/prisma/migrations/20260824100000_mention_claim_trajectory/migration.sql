-- Citing a claim trajectory (docs/gf-trajectory-citation-dev-plan.md §3.1).
--
-- Purely additive: one enum value, no columns, no drops, no rewrites.
--
-- ThesisMention.refId holds a ClaimTrajectory.id for this type, NOT a claimHash.
-- The id belongs to exactly one detection pass, so a citation resolves
-- permanently to the pass that was cited. A claimHash would follow the claim
-- across recomputations, and a thesis saying "removed and never restored" would
-- quietly become false the moment a later scan found the claim back.
--
-- No backfill exists or is possible: before this, a trajectory could not be
-- cited at all.

-- AlterEnum
ALTER TYPE "MentionType" ADD VALUE 'CLAIM_TRAJECTORY';
