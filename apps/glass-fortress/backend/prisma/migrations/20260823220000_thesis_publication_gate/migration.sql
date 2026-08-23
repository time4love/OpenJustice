-- Thesis publication gate (docs/gf-thesis-publication-gate-dev-plan.md §3).
--
-- Purely additive: nullable columns, one unique index, three foreign keys, five
-- enum values. No drops, no defaults that rewrite rows.
--
-- Every existing thesis becomes a DRAFT (publishedVersionId IS NULL) and must be
-- published deliberately. Before this, public reads followed headVersionId, so
-- whatever last ran the Devil's Advocate was what the public saw — the least
-- gated write in the system, on the one artifact that names living officials.
-- Publication is now a pinned version: editing or re-analysing the head changes
-- nothing public until a researcher publishes again.
--
-- ResearchSession.researcherId: sessions gain an owner so that only one session
-- may be ACTIVE at a time across the system and a publication attaches to the
-- named piece of work that did it. Existing rows stay NULL and read as legacy.

-- AlterEnum
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'PUBLICATION_RATIONALE';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'PUBLICATION_ASSESSED';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'THESIS_PUBLISHED';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'THESIS_UNPUBLISHED';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'SESSION_CLOSED_BY_OTHER';

-- AlterTable
ALTER TABLE "Thesis" ADD COLUMN     "publicInterestStatement" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "publishedVersionId" TEXT;

-- AlterTable
ALTER TABLE "ResearchSession" ADD COLUMN     "researcherId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_publishedVersionId_key" ON "Thesis"("publishedVersionId");

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "ThesisVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
