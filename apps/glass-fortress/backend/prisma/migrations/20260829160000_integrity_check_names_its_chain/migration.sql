-- A verdict about a registry is not a fact until it names the registry it asked.
--
-- On 2026-08-29 a local run read PRODUCTION's database and STAGING's chain and
-- wrote 91 anchor verdicts into production that do not mean what they say. Every
-- other column on those rows is indistinguishable from a correct one, so the
-- corpus could not tell them apart even in principle.
--
-- ADDITIVE, and deliberately so. The 91 rows stay: they are the evidence that
-- the pipeline was wrong, and deleting them would delete the finding. They
-- become visibly provenance-incomplete instead — NULL here is read by
-- auditOnChainAnchors as no current answer, never as a pass.
ALTER TABLE "IntegrityCheck" ADD COLUMN "chainId" INTEGER;
ALTER TABLE "IntegrityCheck" ADD COLUMN "registryAddress" TEXT;
