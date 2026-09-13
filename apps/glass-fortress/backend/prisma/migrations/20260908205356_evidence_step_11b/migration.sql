-- EVIDENCE STEP 11b — THE BUILD, on the ground the legacy switch emptied.
--
-- Plan: docs/gf-refactor-plan.md §3b, step 11, and the DECIDED note above it.
-- Contract: docs/gf-evidence-flows.md APPENDIX A2, as amended by
-- docs/gf-document-flows.md A2 (kind DOCUMENT, the third record key) and
-- docs/gf-thesis-flows.md A2 (the mention's pin and argument; `role` withdrawn).
-- Reasoning: docs/gf-architecture-target.md §9. What left the tree first, and
-- why nothing here can be read by anything: docs/gf-legacy-switch-2026-09-08.md.
--
-- ---------------------------------------------------------------------------
-- THE PRECONDITION, AND IT IS READ RATHER THAN ASSUMED.
--
-- These tables are EMPTY on the environment this applies to:
--
--     Evidence · EvidenceCapture · SummaryCorrection · DiffDebateSession ·
--     DiffDebateEvent · ThesisMention · ThesisGapResolution ·
--     _EvidenceToKeyFigure · evidence_embeddings
--
-- The database was rebuilt at refactor step 9 by survey and walk, and the walk
-- writes captures, versions and diffs and NEVER an evidence row, a mention or a
-- decision (architecture target §9.8). The researcher reads the counts in the
-- container before LAND; this file does not assume them.
--
-- AND THE PLATFORM HOLDS THE SAME LINE INDEPENDENTLY. Every column added below
-- is NOT NULL with no default, which PostgreSQL refuses on a table that holds
-- rows. So a non-empty table does not corrupt anything: the statement fails, the
-- pre-deploy step fails, THE DEPLOY ABORTS AND THE PREVIOUS VERSION KEEPS
-- SERVING (CLAUDE.md, "Schema migrations deploy themselves"). The read is belt;
-- the braces are the platform's.
-- ---------------------------------------------------------------------------
--
-- `AnchorCheckOutcome` IS NOT DROPPED. It is shared with
-- `UrlSnapshot.anchorCheck`, which stays: a capture's anchor is the corpus's and
-- the chain attests it. Only `Evidence.anchorCheck` leaves, because nothing
-- above the corpus is anchored (evidence §5).
--
-- `db:check-drift` reported "No difference detected." (exit 0) on this
-- environment BEFORE `schema.prisma` was edited.
--
-- HAND-WRITTEN, then cross-checked against
--   prisma migrate diff --from-schema-datamodel <staging> --to-schema-datamodel <new> --script
-- generated OFFLINE with no database consulted. Where the two disagree the
-- hand-written file lands and the difference is reported; the four foreign keys
-- below are RESTRICT where the generator proposed SET NULL, because nothing is
-- deleted after the rebuild and a cascade is a deletion path standing open.

-- ---------------------------------------------------------------------------
-- 1. UrlVersionDiff becomes THE PAIR
-- ---------------------------------------------------------------------------

-- A row whose two sides are one capture describes a transition that did not
-- happen and is unfalsifiable by construction: a document always contains
-- itself. Ruled 2026-09-04 (pre-design triage); the appendix asks for a CHECK
-- rather than a convention, and Prisma cannot express one.
ALTER TABLE "UrlVersionDiff"
  ADD CONSTRAINT "UrlVersionDiff_pair_is_two_captures"
  CHECK ("beforeSnapshotId" <> "afterSnapshotId");

-- The index cannot outlive the column it orders on.
DROP INDEX "UrlVersionDiff_trackedUrlId_afterDate_idx";

-- Twenty-four columns: the two date strings and the replay URL, four text
-- columns, the classifier's five provenance axes and its prose, the seven
-- survival columns, and the categories. Every one of them is a VERSION's, and
-- holding them on the row is what let a re-derivation move a verdict under a
-- promoted record after the fact (finding 27). Nothing has read them since
-- refactor step 5 PR 1; the compiler proved it across three deletion PRs.
ALTER TABLE "UrlVersionDiff"
  DROP COLUMN "beforeDate",
  DROP COLUMN "afterDate",
  DROP COLUMN "snapshotUrl",
  DROP COLUMN "deletedText",
  DROP COLUMN "addedText",
  DROP COLUMN "rawDeletedText",
  DROP COLUMN "rawAddedText",
  DROP COLUMN "aiSignificance",
  DROP COLUMN "isLegallySignificant",
  DROP COLUMN "investigativeCategories",
  DROP COLUMN "classifierVersion",
  DROP COLUMN "classifierPromptHash",
  DROP COLUMN "classifierModel",
  DROP COLUMN "classifierDraws",
  DROP COLUMN "classifiedInputVersion",
  DROP COLUMN "summaryVersion",
  DROP COLUMN "diffInputVersion",
  DROP COLUMN "survivalVerdict",
  DROP COLUMN "survivalCheckedAt",
  DROP COLUMN "survivalSourceStateHash",
  DROP COLUMN "survivalTextVersion",
  DROP COLUMN "survivalCheckVersion",
  DROP COLUMN "survivalContradicted",
  DROP COLUMN "survivalChunksChecked";

-- Its one column is gone. The TS union of the same three values lives on in
-- src/lib/diffSurvival.ts, where a chunk's survival is written into a
-- DiffContentVersion's JSON — which is the only place it was ever a fact about
-- a chunk rather than about a whole row.
DROP TYPE "SurvivalVerdict";

-- ---------------------------------------------------------------------------
-- 2. The tables whose whole subject left the row
-- ---------------------------------------------------------------------------

-- The text an evidence hash was computed from, kept so the identity could be
-- recomputed from the database alone. The target recomputes from the CORPUS —
-- CAPTURE_ID over url, timestamp and the bytes as served — so there is nothing
-- for a private copy to answer.
DROP TABLE "EvidenceCapture";

-- Corrections to a model's prose about a diff. The row carries no prose.
DROP TABLE "SummaryCorrection";

-- `figures` was LLM output written at promotion. A figure is named by a thesis,
-- and that link is the thesis flows'; `KeyFigure` itself leaves at thesis step 25.
DROP TABLE "_EvidenceToKeyFigure";

-- ---------------------------------------------------------------------------
-- 3. The vector store, which now has neither a source nor a reader
-- ---------------------------------------------------------------------------
--
-- `search_evidence` ranked evidence rows by an embedding of their SUMMARIES,
-- filtered by tier: a catalogue of selections with the unselected hidden
-- (evidence §5). The tool went in 11a-evidence, its writer with `/confirm` in
-- 11a-document, and the row it embedded carries no prose after this migration.
-- The function is dropped by the exact signature the baseline migration created
-- (20260815000000, line 349), because `match_evidence` takes a defaulted
-- argument and an unqualified name would be ambiguous if a second ever existed.
-- PLAIN DROPS, NOT `IF EXISTS`. The baseline migration created both, so their
-- absence is not a state this environment can legitimately be in — and a
-- statement that shrugs at a missing object cannot tell a rebuilt database
-- from a half-applied one. Absence deserves a loud failure.
DROP FUNCTION match_evidence(vector, integer);
DROP TABLE evidence_embeddings;

-- The `vector` EXTENSION stays: it is a database capability, not this design's
-- state, and dropping it would be a decision about every future use of pgvector
-- taken inside a migration about evidence.

-- ---------------------------------------------------------------------------
-- 4. Evidence — the marked record
-- ---------------------------------------------------------------------------

CREATE TYPE "EvidenceKind" AS ENUM ('CAPTURE', 'DIFF', 'DOCUMENT');

-- Twenty-seven columns. PROSE and OPINION (a tier is a strength score nothing
-- verifies and was dropped rather than moved; a role is relative to a thesis;
-- the rest is a model's reading). CHAIN STATE (nothing above the corpus is
-- anchored, so an evidence row has none). STORAGE (a document's bytes are the
-- document layer's). `createdById` goes with them: the row records a PROMOTION,
-- and `promotedById` below says so in the tense the act has.
ALTER TABLE "Evidence"
  DROP CONSTRAINT "Evidence_createdById_fkey",
  DROP COLUMN "createdById",
  DROP COLUMN "summary",
  DROP COLUMN "evidenceTier",
  DROP COLUMN "evidenceRole",
  DROP COLUMN "evidencePerspective",
  DROP COLUMN "tierReasoning",
  DROP COLUMN "investigativeCategories",
  DROP COLUMN "evidenceDate",
  DROP COLUMN "targetEntity",
  DROP COLUMN "canonicalTargetEntity",
  DROP COLUMN "medicalConditions",
  DROP COLUMN "statisticalClaims",
  DROP COLUMN "regulatoryMentions",
  DROP COLUMN "euaOmissionStatus",
  DROP COLUMN "sourceUrl",
  DROP COLUMN "fileUrl",
  DROP COLUMN "additionalScreenshotUrls",
  DROP COLUMN "ipfsCid",
  DROP COLUMN "intakeVersion",
  DROP COLUMN "intakePromptHash",
  DROP COLUMN "onChainTxHash",
  DROP COLUMN "anchoredHash",
  DROP COLUMN "anchorCheck",
  DROP COLUMN "previousFileHash",
  DROP COLUMN "previousOnChainTxHash",
  DROP COLUMN "evidenceType";

-- PENDING_REVIEW and CONFIRMED went with the confirmation act; there is no
-- SUPERSEDED because identity never moves. The column is dropped and re-added
-- rather than renamed through a `_new` type: at zero rows that is one statement
-- fewer and says plainly that no value survives the change.
ALTER TABLE "Evidence" DROP COLUMN "status";
DROP TYPE "EvidenceStatus";
DROP TYPE "EvidenceType";
CREATE TYPE "EvidenceStatus" AS ENUM ('PROMOTED', 'WITHDRAWN');

-- NOT NULL with NO DEFAULT, all five. There is no state to fail closed into:
-- both statuses are live claims about a human's standing decision, and a
-- default would let a forgetful write assert one.
ALTER TABLE "Evidence"
  ADD COLUMN "kind" "EvidenceKind" NOT NULL,
  ADD COLUMN "snapshotId" TEXT,
  ADD COLUMN "documentCommitment" TEXT,
  ADD COLUMN "status" "EvidenceStatus" NOT NULL,
  ADD COLUMN "affirmedContentVersionHash" TEXT NOT NULL,
  ADD COLUMN "promotedById" TEXT NOT NULL,
  ADD COLUMN "promotedAt" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "Evidence_snapshotId_key" ON "Evidence"("snapshotId");
CREATE UNIQUE INDEX "Evidence_documentCommitment_key" ON "Evidence"("documentCommitment");

-- RESTRICT, not SET NULL. Nothing is deleted after the rebuild (§9), so a
-- cascade or a nulling arm is a deletion path standing open for a delete nobody
-- intends to write. `documentCommitment` gets NO foreign key: the `Document`
-- table is document refactor step 28's, and the CHECK below holds its arm until
-- then.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_promotedById_fkey"
  FOREIGN KEY ("promotedById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EXACTLY ONE RECORD KEY, AND IT MATCHES THE KIND. A2 asks for a CHECK "not a
-- convention": a row that fails this is MALFORMED, and a tool that repaired it
-- would hide how it got that way.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_one_record_key" CHECK (
     ("kind" = 'CAPTURE'  AND "snapshotId" IS NOT NULL AND "urlVersionDiffId" IS NULL     AND "documentCommitment" IS NULL)
  OR ("kind" = 'DIFF'     AND "snapshotId" IS NULL     AND "urlVersionDiffId" IS NOT NULL AND "documentCommitment" IS NULL)
  OR ("kind" = 'DOCUMENT' AND "snapshotId" IS NULL     AND "urlVersionDiffId" IS NULL     AND "documentCommitment" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 5. EvidenceDecision — the record's review log, append-only
-- ---------------------------------------------------------------------------

CREATE TYPE "EvidenceDecisionType" AS ENUM ('REAFFIRM', 'WITHDRAW');

CREATE TABLE "EvidenceDecision" (
    "id"              TEXT NOT NULL,
    "fileHash"        TEXT NOT NULL,
    "sequence"        INTEGER NOT NULL,
    "type"            "EvidenceDecisionType" NOT NULL,
    "researcherId"    TEXT NOT NULL,
    "fromVersionHash" TEXT,
    "toVersionHash"   TEXT,
    "reason"          TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceDecision_pkey" PRIMARY KEY ("id")
);

-- The compare-and-set, as the page's decision log has: a write that finds the
-- sequence moved refuses and the researcher re-reads.
CREATE UNIQUE INDEX "EvidenceDecision_fileHash_sequence_key"
  ON "EvidenceDecision"("fileHash", "sequence");

ALTER TABLE "EvidenceDecision" ADD CONSTRAINT "EvidenceDecision_fileHash_fkey"
  FOREIGN KEY ("fileHash") REFERENCES "Evidence"("fileHash") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceDecision" ADD CONSTRAINT "EvidenceDecision_researcherId_fkey"
  FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- REAFFIRM names BOTH hashes, so the log says what was stood behind and what
-- replaced it; WITHDRAW requires its reason. NEITHER ARM FORBIDS THE OTHER'S
-- FIELDS: A2 states what is required and excludes nothing, and a migration is
-- not the place to invent a rule the contract does not carry.
ALTER TABLE "EvidenceDecision" ADD CONSTRAINT "EvidenceDecision_fields_by_type" CHECK (
     ("type" = 'REAFFIRM' AND "fromVersionHash" IS NOT NULL AND "toVersionHash" IS NOT NULL)
  OR ("type" = 'WITHDRAW' AND "reason" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 6. The debate gains its thesis and its record
-- ---------------------------------------------------------------------------
--
-- The model keeps its name until evidence step 13, where A4 renames it
-- `DebateSession` with the tools that drop 'diff' from theirs.
--
-- `openKey` IS THE PARTIAL UNIQUE INDEX PRISMA CANNOT EXPRESS. A2 asks for one
-- OPEN debate per (thesis, record). Written as a partial index in raw SQL it
-- would leave `db:check-drift` permanently dirty, and "No difference detected."
-- is the standing precondition of every migration after this one. So the
-- condition becomes a nullable column — `thesisId:recordFileHash` while OPEN,
-- NULL once the session closes — under an ordinary unique index: Postgres does
-- not collide NULLs, so any number of closed sessions coexist for one pair.
ALTER TABLE "DiffDebateSession"
  DROP CONSTRAINT "DiffDebateSession_urlVersionDiffId_fkey",
  DROP COLUMN "urlVersionDiffId",
  ADD COLUMN "thesisId"         TEXT NOT NULL,
  ADD COLUMN "recordFileHash"   TEXT NOT NULL,
  ADD COLUMN "recordSnapshotId" TEXT,
  ADD COLUMN "recordDiffId"     TEXT,
  ADD COLUMN "openKey"          TEXT;

CREATE UNIQUE INDEX "DiffDebateSession_openKey_key" ON "DiffDebateSession"("openKey");

ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_thesisId_fkey"
  FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_recordSnapshotId_fkey"
  FOREIGN KEY ("recordSnapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_recordDiffId_fkey"
  FOREIGN KEY ("recordDiffId") REFERENCES "UrlVersionDiff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one record key. The third arm, `recordCommitment`, is document
-- refactor step 28's and is added BY ADDITION there.
ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_one_record_key" CHECK (
  ("recordSnapshotId" IS NOT NULL) <> ("recordDiffId" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 7. The mention gains the pin and the argument
-- ---------------------------------------------------------------------------
--
-- The pin is (fileHash, contentVersionHash): a citation names a record AND the
-- version of its content the argument was made against, as a text citation pins
-- (snapshotId, textHash). The argument is the debate, by reference — one "why",
-- written once and assessed once. NO `role` column: evidence A2 offered one and
-- the thesis flows withdrew it (T2).
--
-- Both nullable here. The thesis layer's own step 20 gives the mention the shape
-- that makes each required per kind, and this migration does not reach into it.
ALTER TABLE "ThesisMention"
  ADD COLUMN "contentVersionHash" TEXT,
  ADD COLUMN "debateSessionId"    TEXT;

ALTER TABLE "ThesisMention" ADD CONSTRAINT "ThesisMention_debateSessionId_fkey"
  FOREIGN KEY ("debateSessionId") REFERENCES "DiffDebateSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
