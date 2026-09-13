-- R45-B — THE LEGACY REGISTER, THE OLD SCAN PATH AND THE RETIRED CALIBRATION SCHEMA LEAVE. (APPROVED by the researcher 2026-09-13 at sha a269872a36c86aace4bfc11d21726bffbb1bfae069585e96317dd7ebf55aeb5a.)
--
-- Plan: docs/gf-refactor-plan.md §2 (:54–:73 — CalibrationRun retire · CalibrationDecision transform · CalibrationReset
-- transform · ArticleRuleset retire · RulesetObservation transform · CdxIndexEntry STORED/UNCHANGED transform ·
-- ScanRelevanceAssessment retire · WaybackScrapeJob retire · TrackedUrl.status transform) and §5 (:574–:575, the target
-- schema on an empty database). Evidence identity is documentHash (docs/gf-evidence-flows.md A1, A3 :1043–:1044); a
-- live registry is explained by documentHash and a frozen one by its committed ledger (A7 :1268–:1273). The
-- researcher's rulings of 2026-09-13: B narrowed (Whistleblower and provenance are the document plan's, steps 28/36);
-- the old scan path joins; a refusal opens the file; the failure direction qualified.
--
-- (i) PRODUCTION: THIS FILE MUST NEVER MEET A DATABASE THAT HAS NOT BEEN DROPPED AND REBUILT.
-- Staging was rebuilt on 2026-09-06: every table this file drops is EMPTY there, and every column it drops is
-- derivable from `document` — measured before this file was written, the counts in the PR. PRODUCTION WAS NOT
-- REBUILT. Its database holds 83 legacy captures, 91 TX_UNREADABLE transactions, three calibration runs with 88
-- decisions, and 20 entries on its old registry — 12 of them extraction anchors over `contentHash` — whose LEDGER IS
-- NOT YET EMITTED; the ledger instruments (measureCaptureCustody, the emitter) READ `contentHash` and `fullText`.
-- This file reaches production ONLY under SHIP's order — docs/gf-refactor-plan.md step 9's note (:327–:338): deploy
-- `0ca8d72` → measure and emit the ledger in the container → the new registry and its rotation → DROP production's
-- database under the cleanup protocol → deploy head, whose migrations then replay on empty tables.
--
-- (ii) THE FAILURE DIRECTION, QUALIFIED.
-- TODAY a head deploy to production before the drop aborts FIRST at 20260908205356_evidence_step_11b (#68), whose
-- five NOT NULL columns refuse production's 8 Evidence rows, and never reaches this file (#71). THIS FILE REFUSES ON
-- ITS OWN: the DO block below raises before any statement drops anything if a table it drops holds a row, if any
-- CdxIndexEntry carries STORED or UNCHANGED or a comparedToSnapshotId, or if any TrackedUrl carries an
-- activeArticleRulesetId or a status other than IDLE — so on production's calibration runs it aborts, the pre-deploy
-- step fails, and the previous version keeps serving. WHAT THE REFUSAL CANNOT PROTECT is the three UrlSnapshot
-- columns: they are populated on every capture of every environment, rebuilt or not, so no count refuses them, and
-- on production they are what the ledger reads. FOR THOSE COLUMNS THE ORDER ABOVE REMAINS THE ONLY CONTROL.
--
-- ONE TRANSACTION, VERSION-PINNED: no BEGIN / COMMIT in this file (Prisma 5.22.0 sends it as one simple query, which
-- Postgres runs as one implicit transaction — the RAISE below rolls back the whole file).
-- test/migrationsOneTransaction.test.ts :32 strips dollar-quoted bodies before it looks, so the DO block's own
-- BEGIN/END passes it — and that test does NOT hold the refusal: it holds only that no statement ends the implicit
-- transaction. The refusal is held by reading this file.
-- HAND-WRITTEN, cross-checked against the offline generator; where they disagree this file lands.
--
-- Markers: [R] refusal · [D] destructive — a table, a column, a type or a value · [T] a column's type changes

-- 0. THE REFUSAL — before anything drops                                                        [R]
DO $$
DECLARE
  occupied text;
BEGIN
  SELECT string_agg(name || ' = ' || n, ', ') INTO occupied FROM (
              SELECT 'CalibrationDecision rows' AS name, count(*) AS n FROM "CalibrationDecision"
    UNION ALL SELECT 'RulesetObservation rows',            count(*) FROM "RulesetObservation"
    UNION ALL SELECT 'CalibrationRun rows',                count(*) FROM "CalibrationRun"
    UNION ALL SELECT 'CalibrationReset rows',              count(*) FROM "CalibrationReset"
    UNION ALL SELECT 'ArticleRuleset rows',                count(*) FROM "ArticleRuleset"
    UNION ALL SELECT 'WaybackScrapeJob rows',              count(*) FROM "WaybackScrapeJob"
    UNION ALL SELECT 'ScanRelevanceAssessment rows',       count(*) FROM "ScanRelevanceAssessment"
    UNION ALL SELECT 'CdxIndexEntry STORED/UNCHANGED',     count(*) FROM "CdxIndexEntry" WHERE "status"::text IN ('STORED', 'UNCHANGED')
    UNION ALL SELECT 'CdxIndexEntry comparedToSnapshotId', count(*) FROM "CdxIndexEntry" WHERE "comparedToSnapshotId" IS NOT NULL
    UNION ALL SELECT 'TrackedUrl activeArticleRulesetId',  count(*) FROM "TrackedUrl" WHERE "activeArticleRulesetId" IS NOT NULL
    UNION ALL SELECT 'TrackedUrl status not IDLE',         count(*) FROM "TrackedUrl" WHERE "status"::text <> 'IDLE'
  ) counts WHERE n > 0;
  IF occupied IS NOT NULL THEN
    RAISE EXCEPTION 'R45-B refuses: this database still holds legacy state (%). It has not been dropped and rebuilt — see this file''s header and docs/gf-refactor-plan.md step 9.', occupied;
  END IF;
END $$;

-- 1. THE CALIBRATION CLOSURE                                                                    [CAL]
ALTER TABLE "TrackedUrl" DROP COLUMN "activeArticleRulesetId";   -- [D] its @unique index and FK go with it; before ArticleRuleset
DROP TABLE "CalibrationDecision";                                -- [D] references CalibrationRun, RulesetObservation, UrlSnapshot
DROP TABLE "RulesetObservation";                                 -- [D] references ArticleRuleset, UrlSnapshot
DROP TABLE "CalibrationRun";                                     -- [D] references ArticleRuleset
DROP TABLE "CalibrationReset";                                   -- [D]
DROP TABLE "ArticleRuleset";                                     -- [D]
DROP TYPE "CalibrationDecisionType";                             -- [D]
DROP TYPE "CalibrationRunStatus";                                -- [D]

-- 2. THE OLD SCAN PATH                                                                           [CAL]
DROP TABLE "WaybackScrapeJob";                                   -- [D] references TrackedUrl
DROP TYPE "WaybackJobStatus";                                    -- [D]
DROP TYPE "WaybackFailureReason";                                -- [D]
DROP TABLE "ScanRelevanceAssessment";                            -- [D] its hand-written CHECK ScanRelevanceAssessment_provenance_complete goes with it
DROP TYPE "MissionVerdict";                                      -- [D]
DROP TYPE "AssessmentAuthor";                                    -- [D]
ALTER TABLE "TrackedUrl" DROP COLUMN "status";                   -- [D]
DROP TYPE "TrackedUrlStatus";                                    -- [D]

-- 3. THE OLD PATH'S CDX VALUES                                                                   [CDX]
ALTER TABLE "CdxIndexEntry" DROP COLUMN "comparedToSnapshotId";  -- [D] its FK goes with it
CREATE TYPE "CdxEntryStatus_new" AS ENUM ('IDENTICAL', 'DUPLICATE', 'ACQUIRED', 'PENDING_JUDGEMENT', 'SKIPPED', 'UNSERVABLE', 'UNFETCHED');
ALTER TABLE "CdxIndexEntry" ALTER COLUMN "status" TYPE "CdxEntryStatus_new" USING ("status"::text::"CdxEntryStatus_new");  -- [T]
DROP TYPE "CdxEntryStatus";                                      -- [D]
ALTER TYPE "CdxEntryStatus_new" RENAME TO "CdxEntryStatus";

-- 4. THE LEGACY REGISTER ON THE CAPTURE                                                          [REG]
ALTER TABLE "UrlSnapshot" DROP COLUMN "fullText";                -- [D]
ALTER TABLE "UrlSnapshot" DROP COLUMN "contentHash";             -- [D]
ALTER TABLE "UrlSnapshot" DROP COLUMN "snapshotUrl";             -- [D]
