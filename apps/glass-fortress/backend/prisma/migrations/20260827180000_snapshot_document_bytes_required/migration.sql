-- Level 1, step two of two: make the payload mandatory.
--
-- Separate from 20260827170000 because these columns cannot be derived in SQL
-- from anything already stored — the bytes have to come back from the Archive.
-- `forensics:backfill-document-bytes` does that, and this migration is what turns
-- a completed backfill into an enforced invariant.
--
-- ON AN ENVIRONMENT THAT HAS NOT BEEN BACKFILLED THIS FAILS, and that is the
-- design. ERROR 23502 aborts the migration, the deploy aborts with it, and the
-- previous version keeps serving. A capture without its payload is what this
-- level exists to make impossible; a failed deploy is the cheapest possible way
-- to be told the backfill has not run yet.
--
-- Verified on staging before writing: 83 of 83 captures hold a payload, every
-- documentHash recomputes from its stored bytes, and every textHash recomputes
-- from its stored text.

ALTER TABLE "UrlSnapshot" ALTER COLUMN "document" SET NOT NULL;
ALTER TABLE "UrlSnapshot" ALTER COLUMN "documentHash" SET NOT NULL;
