-- ---------------------------------------------------------------------------
-- DOCUMENT REFACTOR STEP 28 — THE SCHEMA, ON THE TARGET SCHEMA.
--
-- docs/gf-document-flows.md A2 :1262-:1323, on the rebuilt database, so NOTHING IS
-- MIGRATED: the eight models, the enums they need, `ThesisMention.kind`'s third value,
-- `DebateSession.recordCommitment`, and FIVE CHECK CONSTRAINTS Prisma cannot express.
--
-- NOTHING IS REMOVED HERE. The step's own body says so in terms (plan :141). `Whistleblower`
-- and `CaptureProvenance`'s `DIRECT` and `ASSERTED` stand until step 36, which owns them;
-- four other columns this plan once listed as surviving went early, at evidence step 11b
-- (`20260908205356_evidence_step_11b/migration.sql` :168-:171).
--
-- THE ONE DROP BELOW IS NOT A REMOVAL. `DebateSession_one_record_key` is WIDENED from two
-- arms to three, and a CHECK's definition cannot be widened in place: it is dropped and
-- re-added in one statement pair, in this one file, leaving the constraint present under
-- the same name throughout the history. The same is true of `ThesisMention_fields_by_kind`.
--
-- ONE TRANSACTION, AND NO `BEGIN`/`COMMIT`. Prisma 5.22.0 — the backend's pinned copy, what
-- the pre-deploy step resolves — sends a migration file as ONE `simple_query`, and Postgres
-- runs a multi-statement simple query as one implicit transaction
-- (docs/gf-thesis-step-18-2026-09-11.md §6, read from the engine's source). An explicit
-- COMMIT would end that transaction midway; `test/migrationsOneTransaction.test.ts` holds
-- that no migration carries one.
--
-- `ALTER TYPE … ADD VALUE` IS SAFE HERE AND THE CHECK BELOW IS WRITTEN SO IT STAYS SAFE.
-- It is permitted inside Prisma's per-migration transaction on PostgreSQL 12+ (Supabase
-- runs 17) SO LONG AS THE NEW VALUE IS NOT *USED* IN THE SAME TRANSACTION — the note at
-- `20260903120000_walk_step_1_additive/migration.sql` :40-:42, and seven landed migrations
-- before it. `ThesisMention_fields_by_kind` therefore says `"kind" = 'TRAJECTORY' OR …`
-- rather than naming 'DOCUMENT': with three values those are the same set, and only one of
-- them can be written in the transaction that adds the value. Section 10 says it again
-- where it is written.
--
-- RESTRICT ON EVERY KEY, never CASCADE and never SET NULL on delete — thesis step 18's
-- ruling 4, "I don't think we should really delete anything from DB". `ON UPDATE CASCADE`
-- is the house default and matches all 28 keys step 18 landed.
--
-- THE PRIMARY KEY IS `docId` AND EVERY FOREIGN KEY POINTS AT `commitment`. The identity is
-- GATED and the commitment is the PUBLIC NAME (§7 :765-:770), so the gated value never
-- propagates into another table: seven foreign keys below reference `Document("commitment")`
-- and none references `Document("docId")`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The enums. Each value is named by A2 and none is invented here.
-- ---------------------------------------------------------------------------

CREATE TYPE "ArrivalDoor" AS ENUM ('INTAKE', 'RESEARCHER');

CREATE TYPE "ArrivalDecisionValue" AS ENUM ('DISMISSED');

CREATE TYPE "DocumentDerivedFrom" AS ENUM ('AT_RECEIPT', 'HELD_BYTES');

CREATE TYPE "DocumentOpening" AS ENUM ('PASSAGE', 'CONTENT', 'BYTES');

CREATE TYPE "PassageVerdictValue" AS ENUM ('PRESENT', 'ABSENT', 'UNCHECKED');

CREATE TYPE "ShedCause" AS ENUM ('SENDER', 'OPERATOR');

-- ---------------------------------------------------------------------------
-- 2. THE DOCUMENT — §2, A2 :1262-:1276.
-- ---------------------------------------------------------------------------

CREATE TABLE "Document" (
    "docId" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "salt" BYTEA NOT NULL,
    "cid" TEXT,
    "bytes" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAtReceipt" TIMESTAMP(3),
    "assertedUrl" TEXT,
    "assertedAt" TIMESTAMP(3),
    "derivedFromCommitment" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("docId")
);

CREATE UNIQUE INDEX "Document_commitment_key" ON "Document"("commitment");

-- ---------------------------------------------------------------------------
-- 3. THE ARRIVAL, its grouping and its decisions — §5, §9, A2 :1278-:1294.
-- ---------------------------------------------------------------------------

CREATE TABLE "Arrival" (
    "id" TEXT NOT NULL,
    "door" "ArrivalDoor" NOT NULL,
    "thesisId" TEXT,
    "gapId" TEXT,
    "researcherId" TEXT,
    "termsHash" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arrival_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Arrival_thesisId_receivedAt_idx" ON "Arrival"("thesisId", "receivedAt");

CREATE TABLE "ArrivalDocument" (
    "arrivalId" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,

    CONSTRAINT "ArrivalDocument_pkey" PRIMARY KEY ("arrivalId","commitment")
);

CREATE INDEX "ArrivalDocument_commitment_idx" ON "ArrivalDocument"("commitment");

CREATE TABLE "ArrivalDecision" (
    "id" TEXT NOT NULL,
    "arrivalId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "decision" "ArrivalDecisionValue" NOT NULL,
    "reason" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArrivalDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArrivalDecision_arrivalId_sequence_key" ON "ArrivalDecision"("arrivalId", "sequence");

-- ---------------------------------------------------------------------------
-- 4. CONTENT AS A VERSION — §3, A2 :1296-:1305.
--
-- `@@unique([commitment, contentVersionHash])` is what makes "a re-derivation with
-- identical text is not a new row" true rather than remembered (A2 :1304).
-- ---------------------------------------------------------------------------

CREATE TABLE "DocumentContentVersion" (
    "id" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "text" TEXT,
    "contentVersionHash" TEXT NOT NULL,
    "extractor" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derivedFrom" "DocumentDerivedFrom" NOT NULL,
    "opinion" JSONB,

    CONSTRAINT "DocumentContentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentContentVersion_commitment_contentVersionHash_key" ON "DocumentContentVersion"("commitment", "contentVersionHash");

CREATE INDEX "DocumentContentVersion_commitment_derivedAt_idx" ON "DocumentContentVersion"("commitment", "derivedAt");

-- ---------------------------------------------------------------------------
-- 5. THE OPENING AND THE PASSAGE VERDICTS — §7, A2 :1307-:1317.
-- ---------------------------------------------------------------------------

CREATE TABLE "DocumentOpeningDecision" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "opening" "DocumentOpening" NOT NULL,
    "researcherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentOpeningDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentOpeningDecision_thesisId_commitment_sequence_key" ON "DocumentOpeningDecision"("thesisId", "commitment", "sequence");

CREATE INDEX "DocumentOpeningDecision_commitment_idx" ON "DocumentOpeningDecision"("commitment");

CREATE TABLE "PassageVerdict" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "verdict" "PassageVerdictValue" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassageVerdict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PassageVerdict_versionId_idx" ON "PassageVerdict"("versionId");

CREATE INDEX "PassageVerdict_mentionId_idx" ON "PassageVerdict"("mentionId");

-- ---------------------------------------------------------------------------
-- 6. SHED — §8 :907-:918, A2 :1319-:1323.
--
-- One shed per document, EVER: the commitment is the primary key, so a second is
-- refused by the key rather than by a rule someone has to remember.
-- ---------------------------------------------------------------------------

CREATE TABLE "Shed" (
    "commitment" TEXT NOT NULL,
    "cause" "ShedCause" NOT NULL,
    "researcherId" TEXT,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shed_pkey" PRIMARY KEY ("commitment")
);

-- ---------------------------------------------------------------------------
-- 7. The two columns the sibling layers gain — A2 :1332-:1341.
-- ---------------------------------------------------------------------------

ALTER TABLE "DebateSession" ADD COLUMN "recordCommitment" TEXT;

ALTER TYPE "MentionType" ADD VALUE 'DOCUMENT';

-- ---------------------------------------------------------------------------
-- 8. THE FOREIGN KEYS — RESTRICT on delete, every one.
--
-- Seven point at `Document("commitment")`, the PUBLIC name, and none at `docId`.
-- `Evidence_documentCommitment_fkey` is the key `schema.prisma`'s own note deferred to
-- this step in terms: "the `Document` table is document refactor step 28's, and a key to
-- a table that does not exist cannot be declared."
-- ---------------------------------------------------------------------------

ALTER TABLE "Document" ADD CONSTRAINT "Document_derivedFromCommitment_fkey" FOREIGN KEY ("derivedFromCommitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Arrival" ADD CONSTRAINT "Arrival_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Arrival" ADD CONSTRAINT "Arrival_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArrivalDocument" ADD CONSTRAINT "ArrivalDocument_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "Arrival"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArrivalDocument" ADD CONSTRAINT "ArrivalDocument_commitment_fkey" FOREIGN KEY ("commitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArrivalDecision" ADD CONSTRAINT "ArrivalDecision_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "Arrival"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArrivalDecision" ADD CONSTRAINT "ArrivalDecision_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentContentVersion" ADD CONSTRAINT "DocumentContentVersion_commitment_fkey" FOREIGN KEY ("commitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentOpeningDecision" ADD CONSTRAINT "DocumentOpeningDecision_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentOpeningDecision" ADD CONSTRAINT "DocumentOpeningDecision_commitment_fkey" FOREIGN KEY ("commitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentOpeningDecision" ADD CONSTRAINT "DocumentOpeningDecision_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PassageVerdict" ADD CONSTRAINT "PassageVerdict_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ThesisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PassageVerdict" ADD CONSTRAINT "PassageVerdict_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "ThesisMention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shed" ADD CONSTRAINT "Shed_commitment_fkey" FOREIGN KEY ("commitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shed" ADD CONSTRAINT "Shed_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_documentCommitment_fkey" FOREIGN KEY ("documentCommitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DebateSession" ADD CONSTRAINT "DebateSession_recordCommitment_fkey" FOREIGN KEY ("recordCommitment") REFERENCES "Document"("commitment") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. THE CHECK CONSTRAINTS — A2's "REQUIRED on X" arms, which Prisma cannot express.
--
-- EACH REQUIRES AND FORBIDS NOTHING BEYOND WHAT A2 STATES — thesis step 18's ruling 7,
-- and evidence 11b's line before it: "A2 states what is required and excludes nothing."
-- Where A2 writes "iff" it states BOTH directions, and the arm below says both.
--
-- A CHECK IS INVISIBLE TO PRISMA AND TO `db:check-drift`, so the case holding one is the
-- ONLY thing that holds it. `test/documentGuards.test.ts`, in the UNIT project — the run
-- that gates a merge — holds all five across the whole ordered migration history.
-- ---------------------------------------------------------------------------

-- A2 :1280-:1284. One arm per door, the shape `Evidence_one_record_key` already takes for
-- an "iff by an enum". `gapId` is unconstrained on the INTAKE arm and NULL on the other:
-- "INTAKE only", and a thesis alone is enough for a document that answers no appeal.
ALTER TABLE "Arrival" ADD CONSTRAINT "Arrival_fields_by_door" CHECK (
     ("door" = 'INTAKE'     AND "thesisId" IS NOT NULL AND "termsHash" IS NOT NULL AND "researcherId" IS NULL)
  OR ("door" = 'RESEARCHER' AND "thesisId" IS NULL     AND "termsHash" IS NULL     AND "researcherId" IS NOT NULL AND "gapId" IS NULL)
);

-- A2 :1319-:1323. A sender's withdrawal is attributed to NOBODY and carries no reason: a
-- consent the platform could decline to un-give is not consent (§8 :885-:890).
ALTER TABLE "Shed" ADD CONSTRAINT "Shed_fields_by_cause" CHECK (
     ("cause" = 'OPERATOR' AND "researcherId" IS NOT NULL AND "reason" IS NOT NULL)
  OR ("cause" = 'SENDER'   AND "researcherId" IS NULL     AND "reason" IS NULL)
);

-- A2 :1271. `title` is REQUIRED at the RESEARCHER's door, and the researcher's door is HELD
-- always (§2 :163; architecture §11.7 :704) — so on the row itself that reads: bytes present
-- implies a title. THE DOOR IS THE ARRIVAL'S AND A CHECK CANNOT SPAN TABLES, and custody is
-- derived from this row's own columns (A2 :1274), so this is the one formulation available
-- and it is EXACTLY equivalent given door-implies-custody.
-- It REQUIRES and forbids nothing: a SEALED document may gain a title later, which A2 :1271
-- leaves to step 32; and SHED nulls `bytes`, so a shed document keeps the title it had.
ALTER TABLE "Document" ADD CONSTRAINT "Document_title_required_when_held" CHECK (
  "bytes" IS NULL OR "title" IS NOT NULL
);

-- A2 :1339-:1341 — WIDENED from two arms to three, the direct parallel of
-- `Evidence_one_record_key`. A debate carries no `kind` column, so "matching the record's
-- kind" is exactly "exactly one key is set": the kind IS which one.
-- Dropped and re-added under the SAME NAME, in this one file, because a CHECK's definition
-- cannot be widened in place. `num_nonnulls` is a Postgres builtin (9.6+; Supabase runs 17).
ALTER TABLE "DebateSession" DROP CONSTRAINT "DebateSession_one_record_key";

ALTER TABLE "DebateSession" ADD CONSTRAINT "DebateSession_one_record_key" CHECK (
  num_nonnulls("recordSnapshotId", "recordDiffId", "recordCommitment") = 1
);

-- ---------------------------------------------------------------------------
-- 10. `ThesisMention_fields_by_kind`, WIDENED — and why it does not name 'DOCUMENT'.
--
-- Thesis A2 :1284 requires the pin on EVIDENCE; document flows A2 :1335 requires it on
-- DOCUMENT. The one-armed constraint would have let a DOCUMENT mention through with no pin,
-- which is exactly as malformed as an EVIDENCE one with none.
--
-- THE ARM IS WRITTEN AS "NOT TRAJECTORY" AND THAT IS NOT A STYLE CHOICE. `ALTER TYPE …
-- ADD VALUE` in section 7 above adds 'DOCUMENT' inside this migration's one implicit
-- transaction, and Postgres refuses to USE a new enum value in the transaction that added
-- it. With three values, "not TRAJECTORY" IS {EVIDENCE, DOCUMENT} — the same set, and the
-- only one of the two spellings this file can carry. It is also the safer direction: a
-- fourth kind added later would require a pin by default rather than escape the constraint.
-- ---------------------------------------------------------------------------

ALTER TABLE "ThesisMention" DROP CONSTRAINT "ThesisMention_fields_by_kind";

ALTER TABLE "ThesisMention" ADD CONSTRAINT "ThesisMention_fields_by_kind" CHECK (
  "kind" = 'TRAJECTORY' OR "contentVersionHash" IS NOT NULL
);
