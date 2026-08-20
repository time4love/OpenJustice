-- Per-category conditional follow-ups for the social/economic domain.
--
-- The medical domain has had conditional blocks since Phase 1 (oncology,
-- cognitive); this domain had none, so every category — a firing, a discharge,
-- a broken family bond — was described by the same six generic fields. These
-- three add the follow-ups that only make sense for a specific cluster, with
-- the same "set only when applicable, null otherwise" rule enforced at the
-- intake boundary rather than by the database.
--
--   employmentSector      EMPLOYMENT_TERMINATION / DEMOTION_REASSIGNMENT /
--                         DENIED_HIRE. Sector is the axis the EEOC's own
--                         COVID-era charge data is stratified by, and
--                         healthcare workers were the most-mandated group.
--   remedyPursued         those three plus MILITARY_DISCHARGE — the categories
--                         with a formal process to escalate through. Ordinal
--                         (NONE < INTERNAL_APPEAL < REGULATOR_COMPLAINT <
--                         LITIGATION) rather than a boolean beside an outcome
--                         enum, so "complaint upheld, never complained" is not
--                         a representable state — the medicalCareEngagement fix
--                         from §2.9 applied again.
--   relationshipAffected  FAMILY_RELATIONSHIP_RUPTURE / SOCIAL_OSTRACIZATION.
--                         The weakest-evidenced cluster in the schema (§2.5);
--                         recording which bond broke is what could make it
--                         studiable rather than anecdotal.
--
-- Two candidates were rejected rather than added, per §2.9 (a field that
-- restates another is a defect, not extra detail):
--   - "what access was denied": the ACCESS_DENIAL_* categories already say it,
--     and a second field could contradict the first.
--   - a military discharge characterisation: the real published taxonomies are
--     US DoD's, which do not describe IDF service. Inventing one for a
--     Hebrew-first audience would manufacture authority. remedyPursued covers
--     escalation and outcomeStatus.RESOLVED_REVERSED covers reinstatement.
--
-- Purely additive: three CREATE TYPE, three nullable ADD COLUMN, no existing
-- row touched and no default backfilled. Nullable is correct and not laziness —
-- null means "this category does not ask that question", which is exactly what
-- the conditional rule encodes.

-- CreateEnum
CREATE TYPE "EmploymentSector" AS ENUM ('HEALTHCARE', 'EDUCATION', 'PUBLIC_SECTOR', 'PRIVATE_SECTOR', 'SECURITY_SERVICES', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemedyPursued" AS ENUM ('NONE', 'INTERNAL_APPEAL', 'REGULATOR_COMPLAINT', 'LITIGATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelationshipAffected" AS ENUM ('SPOUSE_PARTNER', 'PARENT', 'CHILD', 'SIBLING', 'EXTENDED_FAMILY', 'FRIENDS_COMMUNITY', 'MULTIPLE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "SocialEconomicImpactReport" ADD COLUMN     "employmentSector" "EmploymentSector",
ADD COLUMN     "relationshipAffected" "RelationshipAffected",
ADD COLUMN     "remedyPursued" "RemedyPursued";
