-- LEVEL 4 — THE DRAFT THE MARKING PAGE HANDS BACK.
--
-- The researcher's ruling, recorded in `docs/gf-factual-layer-rebuild-dev-plan.md`
-- under Level 4 and superseding "THE UI WRITES DECISIONS": the page is a visual
-- instrument for checking and correcting a ruleset against ONE capture. It takes
-- a ruleset in and returns a corrected ruleset. It writes no decision and applies
-- no effect; the verdict and the approval are made through tools.
--
-- WHY A COLUMN AND NOT A DECISION. Writing a `RULESET_CORRECTED` per edit is what
-- made the browser a writer, and it produced this level's swallowed clicks, its
-- eight correction rows for one capture's worth of exploration, and a page that
-- raced itself into a 409 with no other tab open. A draft records nothing about
-- whether the rules are RIGHT — it is work in progress, kept so that a dying tab
-- does not take twenty minutes of marking with it, which happened on 2026-09-01.
--
-- `draftSnapshotId` NULL means there is no draft. `draftReturnedAt` NULL means the
-- draft is still being edited — which is how "saved as I go" is told apart from
-- "I am done", the distinction the whole handoff turns on.
--
-- PURELY ADDITIVE, AND DELIBERATELY SO. Three nullable columns on one table.
-- Nothing is altered in place, nothing is dropped, and no row anywhere changes:
-- staging's two open runs keep every decision they hold, and production has not
-- yet created this table at all — the Level 4 migration that creates it is still
-- pending there, so these columns arrive on an empty table with no backfill.
--
-- NOT FOLDED INTO THAT PENDING MIGRATION, though it would have been tidier.
-- 20260831120000 is already applied to staging, and editing an applied migration
-- breaks Prisma's checksum for it — a repaired ledger is a worse problem than a
-- second file.
--
-- Generated offline with `prisma migrate diff --from-schema-datamodel <old>
-- --to-schema-datamodel <new> --script`, which needs no database connection and
-- therefore cannot propose dropping a raw-SQL object it does not model. Read
-- before applying, per CLAUDE.md.

-- AlterTable
ALTER TABLE "CalibrationRun" ADD COLUMN     "draftReturnedAt" TIMESTAMP(3),
ADD COLUMN     "draftSelectors" TEXT[],
ADD COLUMN     "draftSnapshotId" TEXT;
