-- An evidence record's classification — tier, role, categories, summary, date —
-- is LLM output written once and never recomputed. When the rubric changes, rows
-- either side of the change mean different things and nothing says which is
-- which. On 2026-08-25 the tier rubric moved from grading by FORM to grading by
-- CONTENTS: the same article gave Tier 3 with four key figures under the old
-- rubric and Tier 1 with two under the new one. Both rows look equally
-- authoritative.
--
-- UrlVersionDiff has carried classifierVersion + classifierPromptHash since
-- August. The intake path never got it. This is that rule applied where it was
-- also true.
--
-- Purely additive and nullable: no column dropped, no row rewritten. Records
-- created before this simply carry no stamp, which reads as "unknown" and never
-- as "current".
-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "intakePromptHash" TEXT,
ADD COLUMN     "intakeVersion" TEXT;
