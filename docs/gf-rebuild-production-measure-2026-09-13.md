# The rebuild on production, step 1 — the deploy of `0ca8d72` and MEASURE, read-only — 2026-09-13

**Refactor plan §3 step 9, sub-step 1, on PRODUCTION; evidence flows §8; the order in the step-9 note
(`:327–:340`) and its 2026-09-13 amendment.** The same path staging walked on 2026-09-06
(`docs/gf-rebuild-staging-measure-2026-09-06.md`), run once on the environment where the registry is a
custody claim. One deploy preceded the measurements, because nothing at `master`'s head could read
production's legacy rows: `0ca8d72`, the last commit before the legacy switch, was pushed to `master` as
a fast-forward and its nine additive migrations applied by the pre-deploy step. Then three measurements,
all read-only, all in the production container. Nothing was written to any database, nothing was
anchored, nothing was spent. Every number here is read from a raw file under `handoffs/P1-*-2026-09-13.*`
(the handoffs directory, outside this repository), never transcribed.

Every in-container run carries the guard's banner — *environment production — agreed by Railway,
APP_ENV, the database and the chain* — and names the deployment: `dd76cf6f @ 9661206` before the deploy,
`12f29fb4 @ 0ca8d72` after it. Production is named by its masked Supabase project ref, `fqmc…lo`, read
from `EXPECTED_SUPABASE_PROJECT_REF` in the container and never from a connector's name.

## 1 — stage 0: the preconditions, and what the day's reads corrected

The production MCP connector was disconnected from claude.ai for the duration, on the researcher's
word; the `supabase` connector was not used. `gh auth` active as `time4love`; `origin/master` `9661206`,
an ancestor of `0ca8d72`; `contracts/` unchanged between them (`P1-precondition-3-2026-09-13.txt`).
Every production service on branch `master`, all SUCCESS; staging's latest deploy `734b3de` SUCCESS; the
required `glass-fortress-backend` check green on PRs #433 and #434; the tree clean; staging 360 commits
ahead of master; nothing secret-shaped — 74 matches, all explained by name: 70 SHA-256 hashes, four
placeholder connection strings in tests, and nine masked project refs in dated docs, no full ref
(`P1-railway-status-2026-09-13.json`).

**The identity read** at `9661206` (`P1-identity-read-2026-09-13.txt`): `RAILWAY_ENVIRONMENT_NAME`
production, `APP_ENV` unset, ref `fqmc…lo`, `current_database()` `postgres`; the five chain and database
variables present by name; extensions `vector` in **`public`** and `pgcrypto` in `extensions` (as
staging: the baseline migration creates `vector` without a schema clause; `pgcrypto` is Supabase's,
outside the schema the cleanup session removes). **`_prisma_migrations` held 60 rows against 58 folders
at `9661206`** — read in full (`P1-migrations-ledger-2026-09-13.txt`): 58 distinct names, exactly the
folders; two names appear twice, `20260827120000_snapshot_document_required` and
`20260827180000_snapshot_document_bytes_required`, each with a first row marked rolled back on
2026-08-27 with zero steps applied and a second row that finished. Prisma's own retry shape; `migrate
deploy` skips rolled-back rows. Not a finding.

**Two facts carried into this session that the day's read corrected.** Production holds ONE tracked
page — corona `vaccine-for-covid`, 83 captures — not three: walla and rtmag exist only on staging. And
production holds no calibration runs and no decisions: the schema at `9661206` had no calibration
tables at all, so "three runs, 88 decisions" was staging's number. Neither changes the order.

## 2 — the backup, three records, before anything was deployed

- **(a)** Supabase's restore-only backup of the production project, **2026-09-13 05:38:06 UTC**, read
  from the dashboard by the researcher; no bytes to hash (the staging precedent). It predates the export
  below by seven hours, and nothing the rebuild needs was written to production in between.
- **(b)** The chain-id export, read-only at `9661206`, saved verbatim to
  `handoffs/P1-chain-id-export-2026-09-13.json` — **88,659 bytes, sha256
  `df329ee8c19eb746bc26f2f6cf890d412f27fe8fb583a3b1a2a7419cd6814033`**, exported 12:57:08Z. Every
  `UrlSnapshot` with its hashes, anchor columns and page URL; every `Evidence` with `fileHash`,
  `previousFileHash`, both transaction hashes, `anchoredHash`, `anchorCheck`, status and type; every
  `TrackedUrl`; every `UrlVersionDiff` with both snapshot ids; `IntegrityCheck` grouped by type and
  verdict; the row count of every table in `public`, counts only for the PII-bearing tables
  (`Researcher` 2, `OidcModel` 284, the four report tables 0).
- **(c)** The ledger — `docs/gf-rebuild-production-ledger-2026-09-13.md`.

| the corpus at the export | value |
|---|---|
| `TrackedUrl` | 1 |
| `UrlSnapshot` | 83, all `WAYBACK`, all 83 with `onChainTxHash` and `anchoredHash` |
| `Evidence` | 8, all `CONFIRMED` (1 DOCUMENT, 7 FORENSIC_DIFF), none with `previousFileHash` |
| `UrlVersionDiff` | 81 |
| `IntegrityCheck` | 182 — 181 VERIFIED, 1 CONTRADICTED, all `ON_CHAIN_ANCHOR` |
| `CdxIndexEntry` | 0 |

## 3 — stage 1: `0ca8d72` deployed to production, the first of two advances of `master`

The pre-read that could refuse the deploy — a duplicate `(trackedUrlId, waybackTimestamp)` in
`CdxIndexEntry` — was answered by the export: the table holds 0 rows. Nine migrations scanned at
`0ca8d72` for anything that could refuse on production's rows: every unique index is on a table the same
migration creates, or on `CdxIndexEntry` (0 rows), or on the new nullable
`TrackedUrl.activeArticleRulesetId` (1 row, null); no NOT NULL column added without a default to a
populated table; the one column drop removes what the sixth migration added.

On the researcher's keyword `SHIP 0ca8d72`: `git push origin 0ca8d72:refs/heads/master`, a fast-forward
of 273 commits, `refs/heads/master` = `0ca8d721011a23d00c8b3f5ebf09bc72c413dafc`
(`P1-push-master-2026-09-13.txt`). Railway built both GF services from `master`: backend deployment
`12f29fb4`, frontend `cb55a0a6`, both created 13:01:57Z, both **SUCCESS** at 13:04Z
(`P1-deploy-poll-2026-09-13.txt`). Bronze Fortress's services did not rebuild (0 files). The backend's
pre-deploy step (`P1-deploy-log-backend-2026-09-13.txt`): "67 migrations found", the nine applied by name
in order from `20260831120000_level4_article_rulesets_and_calibration` to
`20260907210000_retire_draft_trusted`, "All migrations have been successfully applied."

After, in the container at `0ca8d72` (`P1-post-deploy-read-2026-09-13.txt`,
`P1-structural-check-after-0ca8d72-2026-09-13.txt`): `_prisma_migrations` 69 rows, 67 finished; 42
tables in `public`; `prisma migrate diff --from-schema-datasource … --exit-code` **"No difference
detected."**, exit 0; the corpus counts unchanged against the export; extensions unchanged.

## 4 — measurement (b): the old registry, read from STATE

`forensics:read-registry --env production`, read at 13:06:51Z (`P1-read-registry-2026-09-13.txt`).
For every index below `totalEvidence()`, `getEvidence(index)` from the contract's storage — hash,
submitter, block time, category — and the total re-read afterwards; then every hash column of every
corpus row asked of `isRegistered`, and each entry classified by the column that produced it. No receipt
and no log was read.

| fact | value |
|---|---|
| registry | `0x0e21561Bbfbb8716713bd60cd21EC5730a4d0D22`, Base mainnet (8453) |
| registrar (from the deployment's wallet) | `0x19a4385405643682607c78d7e5c3a940ba2cccc8` |
| `totalEvidence()` | **20** at 13:06:51Z, unchanged after every index was read |
| submitters | one — the registrar above, on all 20 |
| block times | 2026-08-25 09:19:17Z to 2026-08-26 09:38:49Z |

**Entries by the column that produced them:**

| kind | entries | category on the chain |
|---|---|---|
| CONTENT_HASH — SHA-256 of Readability's article; one entry covers every byte-identical twin | 12 (indexes 1–12) | `Wayback Snapshot` |
| EVIDENCE_FILE_HASH — an evidence name under the retired formula, current | 8 (indexes 0, 13–19) | classifier category lists |
| DOCUMENT_HASH | 0 | |
| EVIDENCE_PREVIOUS_FILE_HASH | 0 | |
| UNEXPLAINED | **0** | |
| AMBIGUOUS | 0 | |

**Per subject:** snapshots 83 — all 83 attributed by `contentHash`, 0 by `documentHash`, NEITHER **0**;
evidence rows 8 — all 8 by `fileHash`, NEITHER **0**. Per column asked, 174 claims: ATTRIBUTED 91 ·
UNREGISTERED 83 · FOREIGN_SUBMITTER 0 (a legacy snapshot is registered on exactly one of its two
columns, so UNREGISTERED equals the snapshot count by construction).

Evidence flows §8 read this registry on 2026-09-03 as 20 entries, 12 extraction anchors and 8 evidence
names, nothing after 2026-08-26. The day's read agrees on every count. **No entry is unexplained; no
ruling was needed; `ORPHANED_BY_REGISTRY` carries no production key and `PRE_WIPE` does not apply.**

## 5 — measurement (a): extractor equality per capture

`forensics:measure-custody --env production --url https://corona.health.gov.il/vaccine-for-covid/`,
no fetch, finished 13:07:54Z (`P1-measure-custody-corona-2026-09-13.txt`). For each archived capture:
`sha256(extractArticleText(captureHtml(document), rawCaptureUrl(ts, url)))` against the stored
`contentHash` — the same function, under the same `id_` URL, that the writer ran when the row was
recorded — and, apart from it, `sha256(fullText)` against `contentHash`.

| page | archived captures | EQUAL | UNEQUAL | NO_BYTES | stored text disagreeing with its `contentHash` |
|---|---|---|---|---|---|
| `https://corona.health.gov.il/vaccine-for-covid/` | 83 | **83** | 0 | 0 | 0 |

**What this settles for the ledger (evidence flows §8):** on every capture production holds, the bytes
the rebuild will register on the new contract produce, under the pinned extractor, exactly the text the
old contract's extraction anchor attests. The weaker branch — "a text the bytes no longer reproduce" —
has no population on production. Custody across the two contracts is whole. This measurement was taken
from the deploy still holding `contentHash` (`0ca8d72`); R45-B retired the column from head on
2026-09-13, and it cannot be taken again after the drop.

## 6 — measurement (c): the archive still serving each capture's bytes

The same instrument with `--fetch`: one GET of the raw `id_` capture per row, 4 s between rows, no
retry, the status recorded and on a 200 the served bytes hashed against `documentHash`. Finished
13:14:47Z, exit 0, the guard's banner on the file (`P1-measure-custody-corona-fetch-2026-09-13.txt`).

| page | captures | SERVED_VERIFIED | SERVED_DIFFERENT | NOT_FOUND | RATE_LIMITED | UNAVAILABLE | UNCLASSIFIED |
|---|---|---|---|---|---|---|---|
| corona | 83 | **83** | 0 | 0 | 0 | 0 | 0 |

No 429 in 83 attempts. The archive was seen answering the container on every row. There is no CDX
digest comparison on production — `CdxIndexEntry` holds no rows there — so the verification is against
`documentHash` alone, which is the target's anchor. **The cleanup session's named-exception list is
empty:** unlike staging (corona `20250423145731`, held from the dump), production has no capture the
archive no longer serves as held, so the survey-and-walk can re-acquire every one.

## 7 — what steps 2–4 take from this

- **The registrar is `0x19a4…ccc8`, and it is not staging's.** Every entry on the old mainnet contract was
  submitted by the account behind production's `REGISTRAR_PRIVATE_KEY`. The constructor grants
  `REGISTRAR_ROLE` to the deployer; the new mainnet contract is deployed with that same key, so no
  `grantRole` follows — and `hasRole` is read from the chain either way.
- **The ledger's kinds** are two: CONTENT_HASH (12) and EVIDENCE_FILE_HASH (8); completeness is 20 entries
  against `totalEvidence()` re-read on the day it is emitted. No ruling was required.
- **The window between rotation and session 3's head deploy.** Head carries the `WRITES_ALLOWED` refusal
  and production at `0ca8d72` does not, so the rule is the written one, bounded as staging's was: **no
  write tool and no `--apply` script that reaches the chain runs on production between the rotation and
  session 3's head deploy.** The production MCP connector stays disconnected for the duration.
- **The cleanup session's pre-reads are already taken:** the extensions' schemas (§1), the backup's
  timestamp and the export's sha256 (§2), an empty exception list (§6). After the drop `0ca8d72` replays
  its 67 migrations on the empty schema; the two rolled-back ledger rows do not return.

## 8 — raw files

`P1-precondition-3-2026-09-13.txt` · `P1-railway-status-2026-09-13.json` · `P1-identity-read-2026-09-13.txt` ·
`P1-migrations-ledger-2026-09-13.txt` · `P1-chain-id-export-raw-2026-09-13.txt` and
`P1-chain-id-export-2026-09-13.json` · `P1-push-master-2026-09-13.txt` · `P1-deploy-poll-2026-09-13.txt` ·
`P1-deploy-log-backend-2026-09-13.txt` · `P1-post-deploy-read-2026-09-13.txt` ·
`P1-structural-check-after-0ca8d72-2026-09-13.txt` · `P1-read-registry-2026-09-13.txt` ·
`P1-measure-custody-corona-2026-09-13.txt` · `P1-measure-custody-corona-fetch-2026-09-13.txt`.

Bears on: refactor plan §3 step 9; `memory/gf-production-rebuild-and-ship-order.md` rows 0–2.
