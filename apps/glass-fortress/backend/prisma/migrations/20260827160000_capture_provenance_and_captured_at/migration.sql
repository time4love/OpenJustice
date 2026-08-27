-- Level 1 of docs/gf-factual-layer-rebuild-dev-plan.md: the capture model.
--
-- Adds provenance and capturedAt as mandatory attributes, and releases
-- waybackTimestamp from being mandatory now that a capture need not be archived.
--
-- Both new columns are added nullable, backfilled, and only then constrained.
-- The alternative (NOT NULL with a DEFAULT) would silently accept a row whose
-- provenance nobody established, which is the failure this level exists to
-- remove.

-- CreateEnum
CREATE TYPE "CaptureProvenance" AS ENUM ('WAYBACK', 'DIRECT', 'ASSERTED');

-- AlterTable: add nullable
ALTER TABLE "UrlSnapshot" ADD COLUMN "provenance" "CaptureProvenance";
ALTER TABLE "UrlSnapshot" ADD COLUMN "capturedAt" TIMESTAMP(3);

-- Backfill provenance. Every capture predating this column was created by
-- WaybackScraper, which fetches only from the Archive and has no other source.
UPDATE "UrlSnapshot" SET "provenance" = 'WAYBACK' WHERE "provenance" IS NULL;

-- Backfill capturedAt from the Archive's own timestamp.
--
-- make_timestamp, not to_timestamp: to_timestamp parses in the SESSION time
-- zone and yields timestamptz, so the same migration would produce different
-- instants on two servers configured differently. make_timestamp builds a
-- timestamp WITHOUT time zone from integer fields and cannot depend on it.
-- waybackTimestamp is UTC by definition (YYYYMMDDHHMMSS).
UPDATE "UrlSnapshot"
SET "capturedAt" = make_timestamp(
      substring("waybackTimestamp" from 1 for 4)::int,
      substring("waybackTimestamp" from 5 for 2)::int,
      substring("waybackTimestamp" from 7 for 2)::int,
      substring("waybackTimestamp" from 9 for 2)::int,
      substring("waybackTimestamp" from 11 for 2)::int,
      substring("waybackTimestamp" from 13 for 2)::double precision
    )
WHERE "capturedAt" IS NULL
  AND "waybackTimestamp" ~ '^[0-9]{14}$';

-- Enforce. If any row failed to backfill — a malformed waybackTimestamp — these
-- raise 23502 and abort the whole migration, so a half-populated column can
-- never reach a running deployment.
ALTER TABLE "UrlSnapshot" ALTER COLUMN "provenance" SET NOT NULL;
ALTER TABLE "UrlSnapshot" ALTER COLUMN "capturedAt" SET NOT NULL;

-- Release waybackTimestamp: only archived captures have one.
ALTER TABLE "UrlSnapshot" ALTER COLUMN "waybackTimestamp" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UrlSnapshot_trackedUrlId_capturedAt_key" ON "UrlSnapshot"("trackedUrlId", "capturedAt");
