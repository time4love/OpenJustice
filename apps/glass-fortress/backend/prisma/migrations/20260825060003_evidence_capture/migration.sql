-- FINDING 79: article evidence hashed a LIVE fetch and stored nothing, so a page
-- carrying a view counter produced a different identity on every call and the
-- record could be recomputed from neither the live page nor a stored copy.
--
-- This table holds the exact text a fileHash was computed over, so the identity
-- is checkable from the database alone.
--
-- Purely additive: no column is dropped, no existing row is touched. Records
-- created before this migration simply have no capture, which reads as
-- "cannot be checked" and never as "does not match".
CREATE TABLE "EvidenceCapture" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "extractor" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceCapture_pkey" PRIMARY KEY ("id")
);

-- One capture per evidence record: a second would make "the" stored document
-- ambiguous, and the identity is of one document.
CREATE UNIQUE INDEX "EvidenceCapture_evidenceId_key" ON "EvidenceCapture"("evidenceId");

-- CASCADE: a capture with no evidence is unreachable and unverifiable; it must
-- not outlive the record whose identity it exists to explain.
ALTER TABLE "EvidenceCapture"
    ADD CONSTRAINT "EvidenceCapture_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
