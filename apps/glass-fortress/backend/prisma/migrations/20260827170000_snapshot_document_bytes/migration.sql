-- Level 1, REOPENED. Store the payload as fetched, not a filtered view of it.
--
-- The first attempt reproduced the bug it was fixing at a lower loss rate:
-- `rawText` was `normaliseText(htmlToText(html))` — HTML stripped to text — and
-- NOT NULL then enforced that something was present, not that it was the
-- document. htmlToText discards hrefs while keeping anchor text, and this
-- platform's central finding is that a reporting-channel link was removed.
--
-- Renames make the existing columns say what they are, and the new columns hold
-- what was never held. `text`/`textHash` keep their values untouched: the
-- derivation that produced them is unchanged, only its name and its status
-- (source of truth -> cached derivation) change.

-- Say what the stored text actually is.
ALTER TABLE "UrlSnapshot" RENAME COLUMN "rawText" TO "text";
ALTER TABLE "UrlSnapshot" RENAME COLUMN "rawContentHash" TO "textHash";

-- The payload, and what is needed to interpret it.
--
-- Nullable here, NOT NULL in 20260827180000 once the backfill has run. This
-- cannot be derived in SQL from anything already stored — the bytes have to come
-- back from the Archive — which is exactly why it is two migrations and not one.
ALTER TABLE "UrlSnapshot" ADD COLUMN "document" BYTEA;
ALTER TABLE "UrlSnapshot" ADD COLUMN "documentHash" TEXT;
ALTER TABLE "UrlSnapshot" ADD COLUMN "documentContentType" TEXT;

-- The provenance axis for the cached text, built now rather than invented after
-- the fact for a fifth time.
ALTER TABLE "UrlSnapshot" ADD COLUMN "textExtractionVersion" TEXT;

-- Backfillable in SQL, unlike the bytes: every existing `text` was produced by
-- the derivation this version names, so the value is known rather than guessed.
UPDATE "UrlSnapshot"
SET "textExtractionVersion" = 'v1-htmltotext-normalised'
WHERE "textExtractionVersion" IS NULL;

ALTER TABLE "UrlSnapshot" ALTER COLUMN "textExtractionVersion" SET NOT NULL;
