-- Remove Evidence.category.
--
-- It was a second, coarser classification of the same axis as
-- investigativeCategories ('Side Effect Withholding' → WITHHOLDING_INFORMATION,
-- 'Coercion' → COERCION_MANDATE, and so on), judged independently by the model
-- and therefore able to contradict it. Its remaining value, 'Factual Baseline',
-- only restated evidenceRole = 'ContextAnchor'.
--
-- No data migration: the table is empty and EvidenceRegistry is not yet deployed,
-- so nothing on-chain refers to the old labels.

ALTER TABLE "Evidence" DROP COLUMN "category";
