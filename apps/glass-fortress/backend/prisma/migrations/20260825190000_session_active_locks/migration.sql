-- One ACTIVE research session per researcher, and one per thesis.
--
-- Enforced in the database rather than in code because a constraint holds
-- against every writer — future code paths, other services, raw SQL — while a
-- check-then-insert only protects the callers that remember to perform it. This
-- repository's most-repeated defect is one rule with several implementations
-- that drift; a constraint cannot drift, because it is not code anyone has to
-- remember.
--
-- PARTIAL, because the rule constrains a SUBSET of rows: a researcher has many
-- CLOSED sessions over time and must be able to open another. A plain UNIQUE on
-- researcherId would permit exactly one session per researcher for all time —
-- forbidding history rather than concurrency.
--
-- These indexes are invisible to schema.prisma: `@@index` in Prisma 5.22 rejects
-- a `where:` argument. Verified against live staging before writing this
-- migration — with a partial index present, `db:check-drift` still reported "No
-- difference detected", and a generated migration did not propose dropping it.
-- Prisma does not model them, so it also does not endanger them. The constraint
-- is documented in schema.prisma on the ResearchSession model, since nothing
-- else there reveals it.

-- thesisId is NULL for a framing session, which opens before its thesis exists.
-- PostgreSQL treats NULLs as DISTINCT in a unique index, so several researchers
-- may frame concurrently while no two can hold the same thesis. That falls out
-- of NULL semantics rather than needing a special case.

-- If either statement fails — two ACTIVE sessions already sharing a researcher
-- or a thesis — PostgreSQL rolls the whole migration back and the deploy aborts
-- with the previous version still serving. A failed deploy, never a half-locked
-- table. Verified before writing: staging holds 1 ACTIVE session, production 0.
CREATE UNIQUE INDEX "ResearchSession_one_active_per_researcher"
    ON "ResearchSession" ("researcherId")
 WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "ResearchSession_one_active_per_thesis"
    ON "ResearchSession" ("thesisId")
 WHERE "status" = 'ACTIVE';
