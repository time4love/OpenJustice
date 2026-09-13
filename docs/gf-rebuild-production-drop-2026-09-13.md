# The rebuild on production, step 5 — the DROP, the schema back by the pipeline, and the password rotation — 2026-09-13

**Refactor plan §3 step 9, sub-step 5, on PRODUCTION; evidence flows §8; `CLAUDE.md`'s destructive-database
protocol.** A cleanup session with one stated purpose: drop production's `public` schema whole, let the
deploy pipeline rebuild it, rotate the production database password, and nothing else. Steps 1–4 preceded
it on the same day (`docs/gf-rebuild-production-measure-2026-09-13.md`,
`docs/gf-rebuild-production-ledger-2026-09-13.md`, `docs/gf-rebuild-production-new-registry-2026-09-13.md`);
staging rehearsed this session on 2026-09-06 (`docs/gf-rebuild-staging-drop-and-survey-2026-09-06.md`).
Every call and every edit was shown to the researcher and waited on before it ran; every raw return is a
file under `handoffs/P2-*-2026-09-13.*` (the handoffs directory, outside this repository) and every number
here is read from one. No MCP tool was called; nothing was anchored; nothing was spent. **Sub-step 6 — the
survey and the walk — is session 3's, after head deploys.**

## 1 — the environment, before and after

Production is named by its masked Supabase project ref, **`fqmc…lo`**, read from
`EXPECTED_SUPABASE_PROJECT_REF` in the container, never from a connector's or a CLI's name. The
production MCP connector stayed disconnected throughout, on the researcher's word; the `supabase`
connector was not used. The researcher confirmed in the chat, before anything ran, that nothing had been
written to production since the rotation of 13:35Z and that the three backup records of §3 are the ones
relied on.

**Before**, at 13:52Z in deployment `25a6ebcd @ 0ca8d72` (`P2-identity-read-2026-09-13.txt`,
`P2-read-registry-2026-09-13.txt`): `RAILWAY_ENVIRONMENT_NAME` production, `APP_ENV` unset, ref
`fqmc…lo`, `current_database()` `postgres`; `_prisma_migrations` 69 rows, 67 finished, the two rolled-back
retries of 2026-08-27 by name; 42 tables in `public`; the corpus as session 1 exported it — `TrackedUrl` 1,
`UrlSnapshot` 83, `UrlVersionDiff` 81, `Evidence` 8, `IntegrityCheck` 182, `ClaimTrajectory` 214,
`Researcher` 2, `OidcModel` 284, `evidence_embeddings` 8. `forensics:read-registry --env production`
under the guard's banner — *environment production — agreed by Railway, APP_ENV, the database and the
chain*: registry `0xDE42950373BCd0bcb9232aa01745C0bBbf409823`, registrar `0x19a4…ccc8`,
`totalEvidence()` 0, every legacy row NEITHER (83 snapshots, 8 evidence rows, 174 claims UNREGISTERED).
The export was re-hashed on the laptop before the scope was written: 88,659 bytes, sha256
`df329ee8c19eb746bc26f2f6cf890d412f27fe8fb583a3b1a2a7419cd6814033`, equal to session 1's record.

**After**, at 15:00Z in deployment `97c0f5a1 @ 0ca8d72`, the rotated container
(`P2-identity-read-after-rotation-2026-09-13.txt`, `P2-read-registry-after-rotation-2026-09-13.txt`,
`P2-structural-check-after-rotation-2026-09-13.txt`): the same environment, ref and database;
`_prisma_migrations` 67 rows, 67 finished, none rolled back; 42 tables; **every corpus count 0**; the
same registry and registrar, `totalEvidence()` 0, and now NEITHER 0 on both subjects because no row
exists; "No difference detected."

## 2 — the extensions, read before the scope was written

Read in the container at 13:52Z, unchanged from session 1's two reads:

| extension | schema |
|---|---|
| `vector` | **`public`** |
| `pgcrypto`, `uuid-ossp`, `pg_stat_statements` | `extensions` |
| `supabase_vault` | `vault` |
| `plpgsql` | `pg_catalog` |

`vector` in `public` goes with the schema and is recreated by the baseline migration on redeploy
(`20260815000000_baseline/migration.sql`, `CREATE EXTENSION IF NOT EXISTS vector` with no schema clause) —
ruled proceed on staging with that reason, and the same here. `pgcrypto`, which the migration calling
`digest()` needs, sits outside the dropped schema and survives. Read back after the drop (§4): `vector`
gone, the others in place; after the redeploy (§5): `vector` in `public` again, `pgcrypto` in `extensions`.

## 3 — the backup, three records, all taken by session 1 before any deploy

- **(a)** Supabase's restore-only backup of the production project, **2026-09-13 05:38:06 UTC**, read
  from the dashboard by the researcher; no bytes to hash. It predates the export by seven hours and
  nothing the rebuild needs was written in between.
- **(b)** The chain-id export, `handoffs/P1-chain-id-export-2026-09-13.json`, **88,659 bytes, sha256
  `df329ee8…4033`**, re-hashed in this session and equal.
- **(c)** The registry ledger, committed: PR #435 → `staging` `b94a9c2`; its `successor` PR #436 → `f10fb08`.

`pg_dump` is absent in the container and on the laptop, and a laptop dump over a production
`DATABASE_URL` is refused by `CLAUDE.md`; the backup is (a)+(b)+(c). No tool imports a capture from any of
them. **The named-exception list is empty:** the archive served all 83 captures as held on 2026-09-13
(the measure doc §6, `SERVED_VERIFIED` 83 of 83, no 429), so unlike staging's corona `20250423145731`
there is no capture that only the backup holds, and the survey-and-walk can re-acquire every one.

## 4 — the drop

**The scope file**, `.claude/DB_CLEANUP_SESSION` (gitignored; deleted at this session's close), written
with the Write tool after the identity read and before anything destructive, quoted whole:

> ENVIRONMENT: PRODUCTION — Supabase project ref fqmc…lo, as read from EXPECTED_SUPABASE_PROJECT_REF in the production container on 2026-09-13 13:52Z (RAILWAY_ENVIRONMENT_NAME production, deployment 25a6ebcd @ 0ca8d72; the guard's four axes agreed; chain 8453, registry 0xDE42950373BCd0bcb9232aa01745C0bBbf409823 with totalEvidence() 0); raw: handoffs/P2-identity-read-2026-09-13.txt, handoffs/P2-read-registry-2026-09-13.txt
> STATEMENTS, each simulated on its own, executed in this order:
>   1. DROP SCHEMA public CASCADE;
>   2. CREATE SCHEMA public;
> SCOPE: the WHOLE database — every table of apps/glass-fortress/backend/prisma/schema.prisma at 0ca8d72 (42 tables in public), including the raw-SQL evidence_embeddings, the OAuth storage OidcModel, the Researcher rows, and the migration ledger _prisma_migrations. The extension vector (installed in public) goes with the schema and is recreated by the baseline migration on redeploy. Nothing outside public — auth, storage, extensions, vault — is in scope.
> PURPOSE: docs/gf-refactor-plan.md §3 step 9, sub-step 5 (the DROP) on PRODUCTION, then the redeploy that rebuilds the schema and the rotation of the production database password, under CLAUDE.md's destructive-database protocol. Handoff: handoffs/P2-production-cleanup-prompt.md.
> PRECONDITIONS: the identity read done (ref fqmc…lo, commit 0ca8d72, registry 0xDE42…9823 holding 0); the extensions read (done: vector in public, ruled proceed on staging 2026-09-06 and unchanged here — recreated by the baseline migration on redeploy; pgcrypto in extensions, outside the dropped schema); THE BACKUP, three records: (a) Supabase's restore-only backup of the production project, 2026-09-13 05:38:06 UTC; (b) the chain-id export handoffs/P1-chain-id-export-2026-09-13.json, 88,659 bytes, sha256 df329ee8c19eb746bc26f2f6cf890d412f27fe8fb583a3b1a2a7419cd6814033, re-hashed 2026-09-13 in this session; (c) the registry ledger committed, PR #435 → b94a9c2, successor PR #436 → f10fb08. The researcher confirmed all three in the chat.
> DATE: 2026-09-13
> This file is the gate key for .claude/hooks/guard-destructive-db.sh AND the written record of what was authorised. It is deleted when this session closes.

**The risk was stated to the researcher in plain words before anything ran**: what disappears (the one
page with its 83 captures and 81 diffs, the 8 evidence rows, the 182 integrity checks and 214
trajectories, the connector's OAuth state in `OidcModel`, both `Researcher` rows, the migration ledger,
the `vector` extension), that it is recoverable only by restoring the backup of 05:38:06 UTC, and what
rebuilding costs (session 3's survey and walk through MCP, every ACQUIRED capture anchored on mainnet at
real gas from the registrar's thin wallet, evidence by the researcher's own hand, sign-up and the
connector's re-authorization again). The four public self-report tables and `Whistleblower` held 0 rows,
so nothing of the public's was lost.

**Statement 1, simulated** (`db:simulate --env production`, deployment `25a6ebcd @ 0ca8d72`, started
13:56:37Z, exit 2, `P2-simulate-statement-1-2026-09-13.txt`; the simulator printed its own
`*** THIS IS PRODUCTION. ***` line): **⚠️ HIGH RISK OF DATA LOSS — 952 rows across 42 tables would be
permanently lost.** The researcher confirmed that number. Per table (the other 24 held 0):

| table | rows | table | rows |
|---|---|---|---|
| OidcModel | 284 | ReclassificationRun | 2 |
| ClaimTrajectory | 214 | _EvidenceToKeyFigure | 2 |
| IntegrityCheck | 182 | Researcher | 2 |
| UrlSnapshot | 83 | ResearchSession | 1 |
| UrlVersionDiff | 81 | EvidenceCapture | 1 |
| _prisma_migrations | 69 | TrackedUrl | 1 |
| Evidence | 8 | WaybackScrapeJob | 1 |
| evidence_embeddings | 8 | ResearchSessionEvent | 5 |
| KeyFigure | 4 | ClaimTrajectoryComputation | 4 |

952 is the sum session 1's export predicted. The eight small tables the export did not count
(`EvidenceCapture`, `KeyFigure`, the session, reclassification and scrape-job rows) are legacy state that
goes by design.

**Statement 1, executed** at **13:58:59.832Z** in deployment `25a6ebcd`, environment `production`, commit
`0ca8d72`, result 0, exit 0 (`P2-execute-statement-1-2026-09-13.txt`). As on staging, no npm entry
executes a raw statement, so it ran through `node -e` with Prisma's `$executeRawUnsafe` in the container
— `handoffs/P2-execute-statement.js`, carried as base64, which refuses any argument that is not
byte-equal to one of the two simulated texts and prints the container's `RAILWAY_DEPLOYMENT_ID`,
`RAILWAY_ENVIRONMENT_NAME` and commit into the record. One difference from staging's form: the statement
travelled **in the clear as the script's argument**, not inside the base64, so the destructive-DB hook
could match it and the record shows the text that ran. **Verified by data** at 14:01:10Z: `public` held 0
tables and the schema itself was gone, `schemas: []`; `vector` gone with it
(`P2-verify-after-statement-1-2026-09-13.txt`).

**Statement 2**, simulated only after statement 1 had executed (on a database where `public` exists it
fails as "already exists"): **✅ LOW RISK — the statement ran in full and removed nothing**, exit 0, at
14:01:46Z (`P2-simulate-statement-2-2026-09-13.txt`). Executed at **14:03:10.227Z**, result 0
(`P2-execute-statement-2-2026-09-13.txt`); verified at 14:04:02Z: `tables: 0`,
`schemas: [{"nspname":"public"}]` (`P2-verify-after-statement-2-2026-09-13.txt`).

Between 13:58:59Z and the redeploy's start the production backend was up and every database call
failed; nothing was written in that window.

## 5 — the schema, back by the pipeline

`railway redeploy -y --service glass-fortress-backend --environment production` from the repo directory
(`P2-redeploy-2026-09-13.txt`, exit 0 and nothing else) — the serving image redeployed, no build, no
code change. The deployment it produced, **`5ed391de @ 0ca8d72`**, created 14:07:48Z, read BUILDING at
14:07:51Z, 14:08:21Z and 14:09:30Z and **SUCCESS at 14:10:17Z** (`P2-deploy-poll-2026-09-13.txt`; each
read is one `railway deployment list --json` parsed with Python `strict=False`, no loop with hidden
errors). Its log (`P2-redeploy-log-2026-09-13.txt`): the pre-deploy step `prisma migrate deploy` found
**67 migrations**, applied all 67 in order from `20260815000000_baseline` to
`20260907210000_retire_draft_trusted` (67 "Applying migration" lines), "All migrations have been
successfully applied.", then the container started pinned to `fqmc…lo` with the vector store reporting
OK. **Never `db push`, never `migrate dev`, never a hand-applied migration.**

By data at 14:12:38Z in `5ed391de` (`P2-schema-after-redeploy-2026-09-13.txt`): `_prisma_migrations`
**67** rows, 67 finished, **none rolled back** — the two rolled-back retries of 2026-08-27 did not return;
`information_schema.tables` in `public` **42**; `vector` back in `public`, `pgcrypto` still in
`extensions`; `Researcher` 0, `UrlSnapshot` 0, every count 0. The structural check in the container,
`prisma migrate diff --from-schema-datasource … --exit-code`: **"No difference detected."**, exit 0
(`P2-structural-check-after-redeploy-2026-09-13.txt`) — structure only, never the verification of the
drop. `forensics:read-registry --env production` at 14:13:42Z (`P2-read-registry-after-redeploy-2026-09-13.txt`):
the guard's four axes agreed, `0xDE42…9823`, `totalEvidence()` 0, NEITHER 0 on both subjects.

**What returned is `0ca8d72`'s migration history, legacy tables included** — not a defect. Head's four
migrations (`20260908205356_evidence_step_11b`, `20260909120000_debate_evidence_not_unique`,
`20260911120000_thesis_step_18_schema`, `20260914120000_r45_legacy_register_and_calibration`) and every
migration landed since meet these empty tables at session 3's `SHIP`: 11b's NOT NULLs on zero rows,
R45-B's refusal passing on zeros.

## 6 — the password rotation

**The researcher's act, in two dashboards, values never printed here or anywhere.** The credential that
once reached a laptop (`.env.production.local`, the 2026-08-29 postmortem) dies with it.

1. Supabase, project `fqmc…lo` → Project Settings → Database → the database password reset.
2. Railway, production → `glass-fortress-backend` → Variables → `DATABASE_URL` and `DIRECT_URL` with the
   new password segment; `EXPECTED_SUPABASE_PROJECT_REF` unchanged.

The rotation happened between 14:54:10Z — the last read showing no new deployment
(`P2-rotation-deploy-poll-2026-09-13.txt`) — and 14:57:50Z, when Railway created deployment
**`97c0f5a1 @ 0ca8d72`**; SUCCESS read at 15:00:04Z. One thing the rehearsal had not shown: **saving the
variables did not deploy on its own** — the first read after "rotated" found `5ed391de` still serving,
and the deploy appeared only after the researcher pressed Railway's staged-changes **Deploy**. Session 1's
rotation of `EVIDENCE_REGISTRY_ADDRESS` had deployed at once, so the difference is the platform's, not
the operator's; the window between the reset and the deploy is the window in which the running container
holds a dead credential, and nothing was in the database to lose. The rotation deploy's own log
(`P2-rotation-deploy-log-2026-09-13.txt`): "67 migrations found", "No pending migrations to apply.",
the container pinned to `fqmc…lo`.

**Acceptance, in the rotated container** (§1's "after"): the identity read at 15:00:23Z — the masked
ref still `fqmc…lo`, `current_database()` answering, so the connection works on the new credential;
`forensics:read-registry` at 15:00:48Z, the four axes agreed; the structural check "No difference
detected." Bronze Fortress and staging are separate Supabase projects, untouched. On the laptop, by name
only: `apps/glass-fortress/backend/.env`, `.env.dev-jwks.json`, `.env.example`, `.env.staging` — no
`.env.production.local`, and nothing carrying a production `DATABASE_URL`.

## 7 — what this session did not do, and what session 3 takes

No MCP tool was called; the production connector stays disconnected until session 3 re-authorizes it.
No write tool and no `--apply` script that reaches the chain ran: THE FREEZE held, and it ends at head's
deploy, which carries `WRITES_ALLOWED`. No researcher was bootstrapped — `researcher:bootstrap` refuses in
a populated environment and its refusal-then-approval is session 3's proof, after the researcher signs up
on the production frontend. The plan's step-9 note gained no line. The `.claude/DB_CLEANUP_SESSION` file
was removed at close, by the researcher's own hand.

**Sub-step 6 — the survey and walk — is session 3's, after head deploys**:
`handoffs/P3-production-ship-head-prompt.md`. The registrar's wallet holds 0.000975 ETH; every ACQUIRED
capture of the production walk spends from it on mainnet, and topping it up first is the researcher's
call.

## 8 — raw files

`P2-identity-read-2026-09-13.txt` · `P2-read-registry-2026-09-13.txt` · `P2-simulate-statement-1-2026-09-13.txt` ·
`P2-execute-statement-1-2026-09-13.txt` · `P2-verify-after-statement-1-2026-09-13.txt` ·
`P2-simulate-statement-2-2026-09-13.txt` · `P2-execute-statement-2-2026-09-13.txt` ·
`P2-verify-after-statement-2-2026-09-13.txt` · `P2-redeploy-2026-09-13.txt` · `P2-deploy-poll-2026-09-13.txt` ·
`P2-redeploy-log-2026-09-13.txt` · `P2-schema-after-redeploy-2026-09-13.txt` ·
`P2-structural-check-after-redeploy-2026-09-13.txt` · `P2-read-registry-after-redeploy-2026-09-13.txt` ·
`P2-rotation-deploy-poll-2026-09-13.txt` · `P2-rotation-deploy-log-2026-09-13.txt` ·
`P2-identity-read-after-rotation-2026-09-13.txt` · `P2-read-registry-after-rotation-2026-09-13.txt` ·
`P2-structural-check-after-rotation-2026-09-13.txt`; the instruments `P2-identity-read.js`,
`P2-execute-statement.js`, `P2-verify-schema.js`, `P2-after-redeploy.js`, `P2-deploy-read.sh`.

Bears on: refactor plan §3 step 9; `memory/gf-production-rebuild-and-ship-order.md` row 6.
