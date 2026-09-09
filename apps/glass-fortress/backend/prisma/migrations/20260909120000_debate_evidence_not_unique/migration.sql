-- EVIDENCE STEP 13 — one debate per (thesis, record), MANY debates per Evidence row.
--
-- `DiffDebateSession_evidenceId_key` was created by
-- 20260822120000_diff_debate_session under the legacy model, where one diff had
-- one debate and one debate made one evidence row. Under the target a record is
-- promoted once and argued once PER THESIS: evidence A2 calls `evidenceId` "the
-- row this argument created OR JOINED", and thesis T3 has the second thesis
-- joining the row rather than creating it. The unique index refuses exactly that
-- join, with a constraint violation rather than a refusal the contract names.
--
-- The column stays the join key the standing audit reads the relation through,
-- so the unique index is REPLACED by a plain one rather than simply dropped.
-- Both statements are declared in schema.prisma (`evidenceId String?` with no
-- @unique, and `@@index([evidenceId])`), so `db:check-drift` is clean after this
-- and the offline generator proposes the same two.
--
-- Data-independent: dropping and creating an index cannot lose a row and cannot
-- abort on a non-empty table, unlike 11b's NOT NULL adds.

DROP INDEX "DiffDebateSession_evidenceId_key";

CREATE INDEX "DiffDebateSession_evidenceId_idx" ON "DiffDebateSession"("evidenceId");
