-- ONE SPELLING FOR `anchoredHash`: bare, lower-case, no `0x`.
--
-- WHY THIS EXISTS. The column had two writers and two spellings. `claimAnchor`
-- on the write path stored `documentHash` bare; `forensics:confirm-anchors`
-- stored the value ethers returns from the transaction log, which carries `0x`.
-- Both were internally consistent, so nine repaired fixtures and a simulated-flip
-- test all passed.
--
-- `capturesAnchoredBy` compares a NORMALISED ARGUMENT against the RAW COLUMN, and
-- SQL cannot normalise the column side. A row confirmed by that pass therefore
-- matched neither arm of the lookup, which:
--
--   1. dropped `readOnChainClaim`'s snapshot count from 1 to 0, moving
--      `onChainSourceStateHash` and making the write-time verdict STALE -- so
--      `VERIFIED` was UNREACHABLE for every snapshot that has ever existed;
--   2. blinded the twin lookup, which would re-register a duplicate document and
--      have the registry reject it (FINDING 41's shape);
--   3. armed the `ORPHANED_ANCHOR` regression that already misreported 12 of
--      production's 19 registrations as custody incidents.
--
-- Found 2026-08-30 by the Level 3 clause 1 positive control, which anchored seven
-- captures correctly and then watched all seven audit STALE. Full record in
-- `docs/gf-positive-control-2026-08-30.md`.
--
-- THIS IS A DATA MIGRATION, and it is the right vehicle rather than a repair
-- script: the code that lands with it reads the column as a key, so the rows must
-- carry one spelling BEFORE the new version serves. The deploy pipeline
-- guarantees exactly that ordering, and a failure aborts the deploy with the
-- previous version still running.
--
-- LOSSLESS AND IDEMPOTENT. Stripping a `0x` prefix and lower-casing hexadecimal
-- changes no value, only its spelling; the guard clause means a second run
-- touches nothing. No row is removed and no column is dropped. It is safe to
-- re-apply and safe to leave applied.
--
-- The paired guarantee lives in the type system, not here: `StoredAnchorHash` is
-- a branded type only `storedAnchorHash()` can produce, and both write sites
-- require it, so a third writer cannot introduce a third spelling. A migration
-- alone would only clean up after a defect that could recur next week.

UPDATE "UrlSnapshot"
SET "anchoredHash" = lower(regexp_replace("anchoredHash", '^0x', '', 'i'))
WHERE "anchoredHash" IS NOT NULL
  AND "anchoredHash" <> lower(regexp_replace("anchoredHash", '^0x', '', 'i'));

UPDATE "Evidence"
SET "anchoredHash" = lower(regexp_replace("anchoredHash", '^0x', '', 'i'))
WHERE "anchoredHash" IS NOT NULL
  AND "anchoredHash" <> lower(regexp_replace("anchoredHash", '^0x', '', 'i'));
