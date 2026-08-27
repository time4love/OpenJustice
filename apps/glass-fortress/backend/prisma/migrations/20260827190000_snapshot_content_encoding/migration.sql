-- Store the Content-Encoding, because the meaning of the payload depends on it.
--
-- Level 1 reopened a SECOND time on 2026-08-27. `document` was storing bytes
-- axios had already inflated: it decompresses transparently in Node, so a
-- gzipped archived record arrived inflated and was stored under the name of the
-- payload. A derivative under the name of the original — the same defect as
-- rawText, one layer lower and better disguised, because `responseType:
-- 'arraybuffer'` looks like it settles the question and does not.
--
-- 76 of 83 captures matched their CDX digest anyway, because the Archive served
-- those uncompressed and the inflate was a no-op. A green result from a
-- mechanism that never checked.
--
-- `document` now holds the bytes AS SERVED, so this column is what says how to
-- read them. Nullable: most responses declare no encoding.
--
-- No backfill in SQL — the value comes from a response header, so it arrives
-- with the re-backfill that replaces the seven inflated payloads.

ALTER TABLE "UrlSnapshot" ADD COLUMN "documentContentEncoding" TEXT;
