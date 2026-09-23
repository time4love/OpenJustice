# Document layer — PRODUCTION's reads before SHIP (chain rotation, the column drop, the buckets)

Plan `docs/gf-document-refactor-plan.md` :123–:128: *"The same step reads the rotation FROM THE CHAIN and records it … no
step below runs on an environment whose read is not on record … Production's read is taken at SHIP, the same way."*
Staging's read is `docs/gf-document-step-27-chain-read-2026-09-23.md`. This is production's, taken before the first
SHIP of the document layer (steps 28–30; `master` `4a4071a` → `staging` `db0507b`, 20 commits, 4 migrations). Written
the day it was taken; never edited after.

Every read below ran IN THE PRODUCTION CONTAINER through `runOperationalScript`, with the environment stated twice.
Each run printed *"environment production — agreed by Railway, APP_ENV, the database and the chain"*, on deployment
`4095acb3-8296-49c4-82c7-daab676310ca` @ `4a4071a`, and wrote its integrity-ledger record. Nothing was written to any
database or chain.

## 1. THE CHAIN ROTATION — PASSES

`npm run forensics:read-registry -- --env production`, read at 2026-09-23T12:20:48.508Z, exit 0.

| criterion (plan :123–:125) | production |
|---|---|
| the configured registry | `0xDE42950373BCd0bcb9232aa01745C0bBbf409823` (registrar `0x19a4385405643682607c78d7e5c3a940ba2cccc8`) |
| code at it (`eth_getCode` ≠ `0x`) | ✓ — the registry answered `totalEvidence()` and its entries |
| `totalEvidence()` = 0 **or** index 0's category = `ANCHOR_SCHEME` | `totalEvidence()` = **1**; index 0 category = **`DOCUMENT_SHA256`**, `ANCHOR_SCHEME`'s VALUE ✓ on the second arm |
| attribution of the corpus's claims | ATTRIBUTED **1** · FOREIGN_SUBMITTER 0 · UNREGISTERED 0 |

Index 0, written 2026-09-13T16:08:03Z by our registrar, is a `DOCUMENT_HASH` naming the capture of
`corona.health.gov.il/vaccine-for-covid/` at `20211223211940`.

**A stale fact found:** `CLAUDE.md` names production's registry as `0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22`.
Production is configured with `0xDE42…9823`, and its index 0 carries the anchor scheme. `CLAUDE.md` is the
researcher's to correct.

**What this read does not establish:** that `0xDE42…9823` is the address the rotation INTENDED for production. The read
proves what the service is pointed at and what that contract holds, exactly as staging's did; the guard can only
evaluate the registry it is given.

## 2. THE COLUMN DROP — NOT SIMULATED, and why that is the finding

Migration 75 drops `DocumentContentVersion.opinion`. CLAUDE.md requires every destructive statement to be simulated.
`npm run db:simulate -- --env production 'ALTER TABLE "DocumentContentVersion" DROP COLUMN "opinion";'` →
**STATEMENT FAILED — `relation "DocumentContentVersion" does not exist`; nothing was changed** (exit 1).

Production has never held the document layer. The table is created by step 28's migration
(`20260922200000_document_step_28_schema`) in the SAME deploy that runs migration 75, so the drop can only reach a table
created moments earlier, with no row in it. On staging, where the table exists, the same statement simulated LOW RISK,
0 rows (`docs/gf-document-step-30-2026-09-23.md`).

## 3. PRODUCTION's STORAGE BUCKETS — none

The bucket migration inserts `documents` with `ON CONFLICT (id) DO NOTHING`; a PRE-EXISTING public `documents` bucket
would survive it unchanged (the migration's own comment). No read-only script reads `storage.buckets`, so the counts
were taken with `db:simulate` over three SELECTs, which change nothing:

| statement | production | control on STAGING |
|---|---|---|
| `SELECT id FROM storage.buckets WHERE id = 'documents';` | **0** | **1** — the instrument SEES a bucket that is there |
| `SELECT id FROM storage.buckets WHERE public;` | **0** | — |
| `SELECT id FROM storage.buckets;` | **0** | — |

**Production holds no bucket at all.** The migration will create `documents` PRIVATE, with the 50 MB limit, and the
legacy PUBLIC `evidence` bucket exists on STAGING only (one object from 2026-08-20; its disposition is the researcher's,
not this deploy's).

## 4. WHAT FOLLOWS

`SHIP`: the production deploy applies the four document migrations (steps 28, 29, 30's bucket, 30's opinion) through the
pre-deploy step. The post-conditions are read from the
database in the container: the migration ledger inside the deploy window, the `documents` bucket
(`public = false`, `52428800`), and the CHECK `DocumentOpinion_by_writer`. No document exists on production; its first
arrival is a researcher's act.
