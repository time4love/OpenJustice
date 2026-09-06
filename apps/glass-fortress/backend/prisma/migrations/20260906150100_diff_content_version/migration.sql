-- THE WALK, STEP 5 OF docs/gf-refactor-plan.md — the diff in its target shape:
-- DiffContentVersion, docs/gf-evidence-flows.md §3 and A2.
--
-- `UrlVersionDiff` becomes the PAIR — the two snapshot ids it spans, already
-- its unique key — and everything the walk derives from the two texts is a
-- VERSION here: the chunks with their survival (the COMPUTED register, what a
-- thesis pins and check 17 judges), the classifier's whole output (the OPINION
-- register, never in the hash), and the provenance that produced them — the two
-- text hashes and DIFF_VERSION, the differ and the classifier named together.
-- A version is named by what it CONTAINS: `contentVersionHash` is A1's sha256
-- over the chunks alone, so a re-derivation yielding the same chunks writes
-- nothing (the unique index refuses a second row for the same content) and a
-- changed opinion never moves a citation.
--
-- ADDITIVE ONLY. The pair's legacy content columns stay for the readers the
-- evidence steps retire (plan §3b, step 11); nothing here is dropped, renamed
-- or narrowed. ON DELETE CASCADE, as every child of a snapshot or a diff does
-- today — and nothing deletes a diff (walk invariant I2's sibling).
--
-- Generated OFFLINE with `prisma migrate diff` between the amended schema and
-- this one — no database was consulted. `db:check-drift` reported "No
-- difference detected." on staging before the schema was edited.

-- CreateTable
CREATE TABLE "DiffContentVersion" (
    "id" TEXT NOT NULL,
    "diffId" TEXT NOT NULL,
    "beforeTextHash" TEXT NOT NULL,
    "afterTextHash" TEXT NOT NULL,
    "diffVersion" TEXT NOT NULL,
    "chunks" JSONB NOT NULL,
    "contentVersionHash" TEXT NOT NULL,
    "classification" JSONB,
    "survivalVersion" TEXT NOT NULL,
    "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiffContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiffContentVersion_diffId_contentVersionHash_key" ON "DiffContentVersion"("diffId", "contentVersionHash");

-- AddForeignKey
ALTER TABLE "DiffContentVersion" ADD CONSTRAINT "DiffContentVersion_diffId_fkey" FOREIGN KEY ("diffId") REFERENCES "UrlVersionDiff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
