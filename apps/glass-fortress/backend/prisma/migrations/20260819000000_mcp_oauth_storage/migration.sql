-- MCP OAuth 2.1 storage (docs/gf-mcp-oauth-dev-plan.md, Phase 1).
-- Generic key-value table for the oidc-provider library's Adapter interface.
-- Hand-written (not `prisma migrate dev --create-only`) because the schema's auto-diff
-- against the live DB proposes dropping `evidence_embeddings` (the pgvector table,
-- created via raw SQL and not modeled in schema.prisma at all) — same pre-existing gap
-- noted in 20260818000000_evidence_onchain_integrity. This migration touches only the
-- new OidcModel table.

CREATE TABLE "OidcModel" (
    "modelName" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "grantId" TEXT,
    "userCode" TEXT,
    "uid" TEXT,
    "accountId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OidcModel_pkey" PRIMARY KEY ("modelName", "id")
);

CREATE UNIQUE INDEX "OidcModel_modelName_userCode_key" ON "OidcModel"("modelName", "userCode");

CREATE UNIQUE INDEX "OidcModel_modelName_uid_key" ON "OidcModel"("modelName", "uid");

CREATE INDEX "OidcModel_modelName_grantId_idx" ON "OidcModel"("modelName", "grantId");

CREATE INDEX "OidcModel_modelName_accountId_idx" ON "OidcModel"("modelName", "accountId");
