-- THESIS STEP 18 — THE SCHEMA, ON THE TARGET SCHEMA. (APPROVED by the researcher 2026-09-11.)
--
-- Plan: docs/gf-thesis-refactor-plan.md §3 step 18, governed by the DECIDED note above step 17 (:52–:84; RULED
-- 2026-09-11). Contract: docs/gf-thesis-flows.md A2 (:1257–:1356) and T4 :628; evidence A2's DebateSession
-- (:958), the rename evidence step 13 deferred here. The researcher's rulings of 2026-09-11: the debate's
-- opener stored; its companions renamed; RESTRICT, never CASCADE and never SET NULL — nothing is deleted, a
-- thesis is only unpublished, and a nulling arm is a deletion path standing open; the "REQUIRED on X" arms held
-- by CHECKs.
--
-- ONE TRANSACTION, AND IT IS VERSION-PINNED. This file carries no BEGIN / COMMIT. Prisma 5.22.0 — the backend's
-- pinned copy, what `npm run db:deploy --workspace=glass-fortress-backend` resolves — sends a migration file as
-- ONE `client.simple_query(script)` (schema-engine/connectors/sql-schema-connector/src/flavour/postgres/
-- connection.rs:161–:165 @ tag 5.22.0), which Postgres runs as one implicit transaction: any failure rolls every
-- statement back, the pre-deploy step fails, and THE PREVIOUS VERSION KEEPS SERVING. Prisma 6.19.3 (hoisted at
-- the monorepo root) does the same; prisma-engines `main` SPLITS a script into statements. An explicit COMMIT in
-- a file ends the implicit transaction midway, today.
--
-- THE PRECONDITION WAS MEASURED, NOT ASSUMED — 2026-09-10T21:02Z, deployment 73ab5fa1 @ 3903de1, staging, the
-- environment agreed on all four axes: the nine tables this migration drops, renames or reshapes hold 0 rows.
-- AND THE PLATFORM HOLDS THE SAME LINE: every NOT NULL, CHECK and cast below refuses a table holding a row that
-- fails it, so a non-empty table aborts the deploy rather than corrupting anything.
--
-- HAND-WRITTEN, then cross-checked against the offline generator. Where the two disagree this file lands: the
-- generator renders the renames below as drops and recreations (destroying every debate), alters
-- ThesisMention."kind" inside its own BEGIN/COMMIT before the column exists, and cannot write a CHECK.
--
-- Markers:  [D] destructive — drops a table, a column, a type, or a value
--           [N] NOT NULL added or set — aborts on a table holding a row without the value
--           [T] a column's type changes — aborts on a value with no successor
--           [C] a CHECK added to an existing table — aborts on a row that fails it
--           [K] a key re-created SET NULL → RESTRICT (ruling 4, extended 2026-09-11) — constraint-only

-- ---------------------------------------------------------------------------
-- 1. THE DEBATE — evidence A2's `DebateSession`, and by ruling its companions
-- ---------------------------------------------------------------------------
-- RENAMED, never dropped and recreated: the generator proposes the latter, which would destroy every debate
-- and orphan its events. Every object the migration history named after either table is renamed with it —
-- or re-created under the new name where its delete action changes — because `db:check-drift` compares
-- constraint and index names.
ALTER TABLE "DiffDebateSession" RENAME TO "DebateSession";
ALTER TABLE "DebateSession" RENAME CONSTRAINT "DiffDebateSession_pkey" TO "DebateSession_pkey";
ALTER INDEX "DiffDebateSession_openKey_key" RENAME TO "DebateSession_openKey_key";
ALTER INDEX "DiffDebateSession_evidenceId_idx" RENAME TO "DebateSession_evidenceId_idx";
ALTER TABLE "DebateSession" RENAME CONSTRAINT "DiffDebateSession_thesisId_fkey" TO "DebateSession_thesisId_fkey";
ALTER TABLE "DebateSession" RENAME CONSTRAINT "DiffDebateSession_recordSnapshotId_fkey" TO "DebateSession_recordSnapshotId_fkey";
ALTER TABLE "DebateSession" RENAME CONSTRAINT "DiffDebateSession_recordDiffId_fkey" TO "DebateSession_recordDiffId_fkey";
-- The evidence key is RE-CREATED rather than renamed, because it changes: SET NULL → RESTRICT.
ALTER TABLE "DebateSession" DROP CONSTRAINT "DiffDebateSession_evidenceId_fkey";                      -- [K]
ALTER TABLE "DebateSession" ADD CONSTRAINT "DebateSession_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;          -- [K]
-- Prisma cannot see a CHECK; renamed so one table carries one name.
ALTER TABLE "DebateSession" RENAME CONSTRAINT "DiffDebateSession_one_record_key" TO "DebateSession_one_record_key";
-- Who opened the argument — HISTORY attributes the debate (evidence T3 :371). Written by open_debate at create.
ALTER TABLE "DebateSession" ADD COLUMN "researcherId" TEXT NOT NULL;                                   -- [N]
ALTER TABLE "DebateSession" ADD CONSTRAINT "DebateSession_researcherId_fkey"
  FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The event table and the two enums follow the session (ruling 3). The event's session key is RE-CREATED
-- rather than renamed, because it changes: CASCADE → RESTRICT (ruling 4).
ALTER TABLE "DiffDebateEvent" RENAME TO "DebateEvent";
ALTER TABLE "DebateEvent" RENAME CONSTRAINT "DiffDebateEvent_pkey" TO "DebateEvent_pkey";
ALTER TABLE "DebateEvent" DROP CONSTRAINT "DiffDebateEvent_sessionId_fkey";
ALTER TABLE "DebateEvent" ADD CONSTRAINT "DebateEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "DebateSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TYPE "DiffDebateStatus" RENAME TO "DebateStatus";
ALTER TYPE "DiffDebateEventType" RENAME TO "DebateEventType";

-- ---------------------------------------------------------------------------
-- 2. THE MENTION — renamed in place to A2's words
-- ---------------------------------------------------------------------------
ALTER TABLE "ThesisMention" RENAME COLUMN "thesisVersionId" TO "versionId";
ALTER TABLE "ThesisMention" RENAME COLUMN "type" TO "kind";
ALTER TABLE "ThesisMention" RENAME COLUMN "refId" TO "name";
-- RESTRICT, not CASCADE: nothing is deleted after the rebuild (A2 :1355; ruling 4).
ALTER TABLE "ThesisMention" DROP CONSTRAINT "ThesisMention_thesisVersionId_fkey";
ALTER TABLE "ThesisMention" ADD CONSTRAINT "ThesisMention_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A2's two kinds: CLAIM_TRAJECTORY becomes TRAJECTORY; KEY_FIGURE and TRACKED_URL have no successor.
-- Postgres cannot drop an enum value, so the column moves to a new type; a row still holding either removed
-- value FAILS THE CAST and aborts the deploy — loud, never a silent remap.
ALTER TYPE "MentionType" RENAME VALUE 'CLAIM_TRAJECTORY' TO 'TRAJECTORY';
CREATE TYPE "MentionType_new" AS ENUM ('EVIDENCE', 'TRAJECTORY');
ALTER TABLE "ThesisMention" ALTER COLUMN "kind" TYPE "MentionType_new" USING ("kind"::text::"MentionType_new");  -- [T]
DROP TYPE "MentionType";                                                                               -- [D]
ALTER TYPE "MentionType_new" RENAME TO "MentionType";
CREATE UNIQUE INDEX "ThesisMention_versionId_kind_name_key" ON "ThesisMention"("versionId", "kind", "name");
-- AN EVIDENCE MENTION CARRIES ITS PIN — A2 :1284, "REQUIRED on EVIDENCE". Requires, forbids nothing. The
-- document plan's DOCUMENT arm (document flows A2, "REQUIRED on DOCUMENT") is added by addition at its step.
ALTER TABLE "ThesisMention" ADD CONSTRAINT "ThesisMention_fields_by_kind" CHECK (
  "kind" <> 'EVIDENCE' OR "contentVersionHash" IS NOT NULL
);                                                                                                     -- [C]

-- ---------------------------------------------------------------------------
-- 3. THE VERSION — the text and the claim; the TipTap body, the analysis and the status leave
-- ---------------------------------------------------------------------------
ALTER TABLE "ThesisVersion" DROP COLUMN "userContent";                                                -- [D]
ALTER TABLE "ThesisVersion" DROP COLUMN "aiAnalysis";                                                 -- [D]
ALTER TABLE "ThesisVersion" DROP COLUMN "analysisInputHash";                                          -- [D]
ALTER TABLE "ThesisVersion" DROP COLUMN "status";                                                     -- [D]
DROP TYPE "ThesisVersionStatus";                                                                      -- [D]
ALTER TABLE "ThesisVersion" ADD COLUMN "text" TEXT NOT NULL;                                          -- [N]
ALTER TABLE "ThesisVersion" ADD COLUMN "claim" TEXT NOT NULL;                                         -- [N]
ALTER TABLE "ThesisVersion" ALTER COLUMN "createdById" SET NOT NULL;                                  -- [N]
ALTER TABLE "ThesisVersion" DROP CONSTRAINT "ThesisVersion_thesisId_fkey";
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_thesisId_fkey"
  FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisVersion" DROP CONSTRAINT "ThesisVersion_createdById_fkey";
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisVersion" DROP CONSTRAINT "ThesisVersion_parentVersionId_fkey";                    -- [K]
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_parentVersionId_fkey"
  FOREIGN KEY ("parentVersionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;  -- [K]

-- ---------------------------------------------------------------------------
-- 4. THE THESIS — the provision arrives, the title leaves, the author is required
-- ---------------------------------------------------------------------------
ALTER TABLE "Thesis" DROP COLUMN "title";                                                             -- [D]
ALTER TABLE "Thesis" ADD COLUMN "provision" TEXT;
ALTER TABLE "Thesis" ALTER COLUMN "createdById" SET NOT NULL;                                         -- [N]
ALTER TABLE "Thesis" DROP CONSTRAINT "Thesis_createdById_fkey";
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The two pointers and the publisher: a nulling arm is a deletion path standing open (the 11b record :40).
ALTER TABLE "Thesis" DROP CONSTRAINT "Thesis_headVersionId_fkey";                                   -- [K]
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_headVersionId_fkey"
  FOREIGN KEY ("headVersionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;   -- [K]
ALTER TABLE "Thesis" DROP CONSTRAINT "Thesis_publishedVersionId_fkey";                              -- [K]
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;  -- [K]
ALTER TABLE "Thesis" DROP CONSTRAINT "Thesis_publishedById_fkey";                                   -- [K]
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;     -- [K]

-- ---------------------------------------------------------------------------
-- 5. WHAT A2 REMOVES (:1350–:1352) — Whistleblower excepted, document step 28's
-- ---------------------------------------------------------------------------
-- Child before parent: each drop takes the table's own foreign keys with it.
DROP TABLE "ThesisGapResolution";                                                                     -- [D]
DROP TABLE "ResearchSessionEvent";                                                                    -- [D]
DROP TABLE "ResearchSession";      -- its two raw-SQL partial unique indexes go with it                 [D]
DROP TABLE "KeyFigure";                                                                               -- [D]
DROP TYPE "ResearchSessionEventType";                                                                 -- [D]
DROP TYPE "ResearchSessionStatus";                                                                    -- [D]

-- ---------------------------------------------------------------------------
-- 6. WHAT A2 ADDS — seven tables, append-only but the framing's thesis pointer
-- ---------------------------------------------------------------------------
CREATE TYPE "FramingRoundType" AS ENUM ('PROPOSED', 'ASSESSED', 'CHOSEN');
CREATE TYPE "GapDecisionValue" AS ENUM ('OPEN', 'CITED', 'REQUESTED', 'CALLED', 'CONCEDED', 'DISMISSED');
CREATE TYPE "PublicationVerdict" AS ENUM ('SUPPORTS', 'DISPUTES');
CREATE TYPE "PublicationOutcome" AS ENUM ('PUBLISHED', 'REFUSED');

CREATE TABLE "Framing" (
    "id"           TEXT NOT NULL,
    "question"     TEXT NOT NULL,
    "provision"    TEXT,
    "researcherId" TEXT NOT NULL,
    "thesisId"     TEXT,
    "fromRunId"    TEXT,
    "clusterIndex" INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Framing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FramingRound" (
    "id"           TEXT NOT NULL,
    "framingId"    TEXT NOT NULL,
    "sequence"     INTEGER NOT NULL,
    "type"         "FramingRoundType" NOT NULL,
    "content"      JSONB NOT NULL,
    "researcherId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FramingRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ThesisAnalysis" (
    "id"               TEXT NOT NULL,
    "versionId"        TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "opinion"          JSONB NOT NULL,
    "model"            TEXT NOT NULL,
    "promptVersion"    TEXT NOT NULL,
    "runAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThesisAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ThesisGapDecision" (
    "id"           TEXT NOT NULL,
    "thesisId"     TEXT NOT NULL,
    "versionId"    TEXT NOT NULL,
    "gapId"        TEXT NOT NULL,
    "description"  TEXT NOT NULL,
    "sequence"     INTEGER NOT NULL,
    "decision"     "GapDecisionValue" NOT NULL,
    "citedName"    TEXT,
    "request"      JSONB,
    "callItem"     JSONB,
    "reason"       TEXT,
    "researcherId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThesisGapDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicationAttempt" (
    "id"           TEXT NOT NULL,
    "thesisId"     TEXT NOT NULL,
    "versionId"    TEXT NOT NULL,
    "rationale"    TEXT NOT NULL,
    "assessment"   JSONB NOT NULL,
    "verdict"      "PublicationVerdict",
    "outcome"      "PublicationOutcome" NOT NULL,
    "refusedBy"    TEXT[],
    "researcherId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Withdrawal" (
    "id"           TEXT NOT NULL,
    "thesisId"     TEXT NOT NULL,
    "versionId"    TEXT NOT NULL,
    "reason"       TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Note" (
    "id"           TEXT NOT NULL,
    "thesisId"     TEXT,
    "framingId"    TEXT,
    "text"         TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FramingRound_framingId_sequence_key" ON "FramingRound"("framingId", "sequence");
CREATE UNIQUE INDEX "ThesisAnalysis_versionId_inputFingerprint_key" ON "ThesisAnalysis"("versionId", "inputFingerprint");
CREATE UNIQUE INDEX "ThesisGapDecision_thesisId_gapId_sequence_key" ON "ThesisGapDecision"("thesisId", "gapId", "sequence");

-- RESTRICT throughout: nothing is deleted after the rebuild (A2 :1355; ruling 4).
ALTER TABLE "Framing" ADD CONSTRAINT "Framing_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Framing" ADD CONSTRAINT "Framing_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FramingRound" ADD CONSTRAINT "FramingRound_framingId_fkey" FOREIGN KEY ("framingId") REFERENCES "Framing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FramingRound" ADD CONSTRAINT "FramingRound_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisAnalysis" ADD CONSTRAINT "ThesisAnalysis_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisGapDecision" ADD CONSTRAINT "ThesisGapDecision_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisGapDecision" ADD CONSTRAINT "ThesisGapDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThesisGapDecision" ADD CONSTRAINT "ThesisGapDecision_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_framingId_fkey" FOREIGN KEY ("framingId") REFERENCES "Framing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EACH DECISION CARRIES WHAT A2 :1324–:1329 REQUIRES OF IT — CITED its record, REQUESTED its request,
-- CALLED its call item, CONCEDED and DISMISSED a reason. Requires, forbids nothing; OPEN requires nothing. A
-- Json arm must be an OBJECT, not merely non-NULL: Prisma writes `Prisma.JsonNull` as the JSON value `null`,
-- which `IS NOT NULL` accepts, and A2 gives both shapes as objects ({ text, authority, … } · { whatIsNeeded, … }).
ALTER TABLE "ThesisGapDecision" ADD CONSTRAINT "ThesisGapDecision_fields_by_decision" CHECK (
      ("decision" <> 'CITED'     OR "citedName" IS NOT NULL)
  AND ("decision" <> 'REQUESTED' OR ("request"  IS NOT NULL AND jsonb_typeof("request")  = 'object'))
  AND ("decision" <> 'CALLED'    OR ("callItem" IS NOT NULL AND jsonb_typeof("callItem") = 'object'))
  AND ("decision" NOT IN ('CONCEDED', 'DISMISSED') OR "reason" IS NOT NULL)
);

-- EXACTLY ONE TARGET — A2 :1343 asks for "a CHECK constraint", not a convention.
ALTER TABLE "Note" ADD CONSTRAINT "Note_one_target" CHECK (("thesisId" IS NOT NULL) <> ("framingId" IS NOT NULL));
