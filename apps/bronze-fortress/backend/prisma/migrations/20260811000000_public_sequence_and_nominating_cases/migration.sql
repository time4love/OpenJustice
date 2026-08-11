-- Remove PendingKeyFigure — threshold model replaced by legal-review gate.
-- First proposal now creates KeyFigure(PENDING) directly; no count threshold.
DROP TABLE IF EXISTS "PendingKeyFigure";

-- Stable anonymous public identifier assigned at activation.
-- Scoped per KeyFigureType: rendered as "{localizedRoleLabel} {publicSequence}".
-- Real name is never exposed publicly.
ALTER TABLE "KeyFigure" ADD COLUMN "publicSequence" INTEGER;
CREATE UNIQUE INDEX "KeyFigure_type_publicSequence_key" ON "KeyFigure"("type", "publicSequence");

-- Track which cases have nominated this figure (deduplicated).
-- Replaces PendingKeyFigure.nominatingFamilyIds.
ALTER TABLE "KeyFigure" ADD COLUMN "nominatingCaseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
