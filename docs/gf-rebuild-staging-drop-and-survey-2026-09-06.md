# The rebuild on staging, steps 5 and 6 — the DROP and the SURVEY — 2026-09-06

**Refactor plan §3 step 9, sub-steps 5 and 6; evidence flows §8; `CLAUDE.md`'s destructive-database
protocol.** A cleanup session with one stated purpose: drop staging's database whole and re-survey the
three pages onto the new registry, and nothing else. Steps 1–4 preceded it
(`docs/gf-rebuild-staging-measure-2026-09-06.md`, `docs/gf-rebuild-staging-ledger-2026-09-06.md`,
`docs/gf-rebuild-staging-new-registry-2026-09-06.md`). Every call and every edit was shown to the
researcher and waited on before it ran; every raw return is a file under
`handoffs/R28-*-2026-09-06.*` (the handoffs directory, outside this repository) and every number here
is read from one. The reviewer session ruled on the execution's form (§4) and on what this document
must say (§2, §3).

## 1 — the environment, before and after

`get_environment` before anything ran, on the staging connector, identified from the return and
never from the connector's name: `environment: staging`, `verdict: CONFIRMED`, chain `84532`,
registry `0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`, `registryDeployed: true`, database project
ref `elws…ae`; corpus 3 pages · 112 snapshots · 109 diffs · 9 evidence · 1 thesis
(`R28-environment-2026-09-06.json`). The same call after the drop, the redeploy, the bootstrap and the
connector's re-authorization: the same environment, verdict, chain and address, and every corpus
count 0 (`R28-environment-after-drop-2026-09-06.json`). The environment is named by that ref
throughout.

## 2 — the extensions, read before the scope was written

`select extname, nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace`, in the
container, read-only (`R28-extensions-2026-09-06.txt`):

| extension | schema |
|---|---|
| `vector` | **`public`** |
| `pgcrypto` | `extensions` |
| `uuid-ossp`, `pg_stat_statements` | `extensions` |
| `supabase_vault` | `vault` |
| `plpgsql` | `pg_catalog` |

`vector` in `public` was the session's stop condition, reported, and **ruled proceed by the
researcher with this reason:** `vector` sat in `public` because the baseline migration created it
there (`20260815000000_baseline/migration.sql` line 339, `CREATE EXTENSION IF NOT EXISTS vector;`
with no schema clause) after the 2026-08-21 wipe, and the redeploy's baseline recreates it the same
way before the first table that needs it; `pgcrypto`, which no migration declares, sits in
`extensions`, outside the dropped schema, and survives — and the one migration that calls its
`digest()` names both schemas in its `search_path`. Read back after the redeploy (§5): `vector` in
`public`, `pgcrypto` in `extensions`, as predicted.

## 3 — the dump

**The dump is a restore-only Supabase physical backup of the staging project, taken
2026-09-06T05:41:23Z, so no byte size and no sha256 exist for it** — it cannot be downloaded, only
restored from the dashboard (Database → Backups). `pg_dump` is absent in the container (`which`
exit 1, `R28-which-pg-dump-2026-09-06.txt`) and absent on the researcher's laptop, so no logical dump
was possible without an install, which was not taken. **The backup predates everything written on
09-06 after 05:41Z** — possibly part of measurement part 2's marking, and the integrity-check row
the rotation's acceptance wrote — **and nothing the rebuild needs from it was written then**: walla
was marked at 23:18Z on 09-05 and corona at 03:33Z on 09-06, both before it, and the bytes of
corona `20250423145731` are from August. The researcher ruled it sufficient; the post-backup writes
were ruled disposable and were not enumerated.

**NO TOOL IMPORTS A CAPTURE FROM A DUMP.** The measurement doc §4 found the archive serves corona
`20250423145731` as the 04-25 record, byte-identical to the next capture, so the survey-and-walk
cannot bring that capture back as held. **After this drop its bytes exist only in the backup above,
and it is a KNOWN LOSS from the live corpus** until a tool that imports a capture from a dump exists,
which is unbuilt and was not this session's to build. The text it attested at the old registry's
index 19 stays reproducible from the archive through the 04-25 capture; only its raw bytes as held
are gone, and those were never anchored anywhere.

## 4 — the drop

**The scope file**, `.claude/DB_CLEANUP_SESSION` (gitignored; deleted at this session's close),
written before anything destructive and quoted whole:

> ENVIRONMENT: STAGING — Supabase project ref elws…ae, as returned by get_environment on 2026-09-06 (verdict CONFIRMED, chain 84532, registry 0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73); raw: handoffs/R28-environment-2026-09-06.json
> STATEMENTS, each simulated on its own, executed in this order:
>   1. DROP SCHEMA public CASCADE;
>   2. CREATE SCHEMA public;
> SCOPE: the WHOLE database — every table of apps/glass-fortress/backend/prisma/schema.prisma, including the raw-SQL evidence_embeddings, the OAuth storage OidcModel, the Researcher rows, and the migration ledger _prisma_migrations. The extension vector (installed in public) goes with the schema and is recreated by the baseline migration on redeploy. Nothing outside public — auth, storage, extensions, vault — is in scope.
> PURPOSE: docs/gf-refactor-plan.md §3 step 9, sub-step 5 (the DROP) then sub-step 6 (the survey), under CLAUDE.md's destructive-database protocol. Handoff: handoffs/R28-rebuild-cleanup-prompt.md.
> PRECONDITIONS: get_environment CONFIRMED (done); the extensions read (done: vector in public, ruled proceed — recreated by the baseline migration on redeploy; pgcrypto in extensions); the dump: Supabase's physical backup of 2026-09-06T05:41:23.166Z, restore-only, ruled sufficient by the researcher (done).
> DATE: 2026-09-06
> This file is the gate key for .claude/hooks/guard-destructive-db.sh AND the written record of what was authorised. It is deleted when this session closes.

**The risk was stated to the researcher in plain words before anything ran**: what disappears, that
it is recoverable only by a restore of the backup, and what rebuilding costs.

**Statement 1, simulated** (`db:simulate --env staging`, deployment `fe9db808 @ 4da8679`, exit 2,
`R28-simulate-statement-1-2026-09-06.txt`): **⚠️ HIGH RISK OF DATA LOSS — 2,008 rows across 41
tables would be permanently lost.** The researcher confirmed that number. Per table:

| table | rows | table | rows |
|---|---|---|---|
| ArticleRuleset | 44 | ResearchSession | 4 |
| CalibrationDecision | 88 | ResearchSessionEvent | 31 |
| CalibrationReset | 1 | **Researcher** | **2** |
| CalibrationRun | 3 | Rule | 60 |
| CdxIndexEntry | 169 | RuleMatch | 0 |
| CdxQuery | 8 | RulesetObservation | 23 |
| ClaimTrajectory | 275 | ScanRelevanceAssessment | 2 |
| ClaimTrajectoryComputation | 7 | SocialEconomicImpactReport | 1 |
| DiffDebateEvent | 7 | SummaryCorrection | 81 |
| DiffDebateSession | 1 | TextVersion | 0 |
| Evidence | 9 | Thesis | 1 |
| EvidenceCapture | 0 | ThesisGapResolution | 0 |
| IntegrityCheck | 233 | ThesisMention | 121 |
| KeyFigure | 3 | ThesisVersion | 7 |
| MedicalAdverseEventReport | 1 | TrackedUrl | 3 |
| **OidcModel** | **481** | UrlSnapshot | 112 |
| PageDecision | 20 | UrlVersionDiff | 109 |
| ReclassificationRun | 11 | WaybackScrapeJob | 3 |
| Report | 2 | Whistleblower | 0 |
| _EvidenceToKeyFigure | 6 | _prisma_migrations | 64 |
| evidence_embeddings | 15 | | |

`Researcher` held 2 rows and `OidcModel` 481, as measured; the handoff had said one and had not
counted the other. The 60 rules, 20 decisions and 3 calibration runs of the marking walks went with
the database by design (plan §3 step 9, §9.6); their record is
`docs/gf-walk-step-6-measurements-part-2-2026-09-06.md`.

**Statement 1, executed** at 10:59:52Z in deployment `fe9db808`, environment `staging`, result 0,
exit 0 (`R28-execute-statement-1-2026-09-06.txt`). No npm entry executes a raw statement — the
simulator always rolls back — so it ran through `node -e` with Prisma's `$executeRawUnsafe` in the
container, the one write this session made by that path, the simulated text byte for byte, the
container's `RAILWAY_DEPLOYMENT_ID` and `RAILWAY_ENVIRONMENT_NAME` printed into the record (the
reviewer's two changes). The destructive-DB hook matched the statement and showed its confirmation
prompt with the scope file's first 400 bytes; the researcher answered it with "approve once", so
the deny stood for every command after it. **Verified by data** thirty seconds later: `public`
held 0 tables and the schema itself was gone, `schemas: []`
(`R28-verify-after-statement-1-2026-09-06.txt`).

**Statement 2** could only be simulated after statement 1 had executed — on a database where
`public` exists, `CREATE SCHEMA public` fails as "already exists" and the simulator reports that as
`STATEMENT FAILED`, never `LOW RISK`; the handoff's order was corrected for that. Simulated: **✅ LOW
RISK — the statement ran in full and removed nothing**, exit 0
(`R28-simulate-statement-2-2026-09-06.txt`). Executed at 11:02:51Z, result 0
(`R28-execute-statement-2-2026-09-06.txt`); verified: `tables: 0`, `schemas: [{"nspname":"public"}]`
(`R28-verify-after-statement-2-2026-09-06.txt`).

## 5 — the schema, back by the pipeline

`railway redeploy --service glass-fortress-backend --environment staging` (`R28-redeploy-2026-09-06.txt`,
exit 0 and nothing else). The deployment it produced, `d26bd47a @ 4da8679`, is named by the guard's
banner on every run made after it (`R28-bootstrap-2026-09-06.txt`) and by `RAILWAY_DEPLOYMENT_ID` in
the schema read below; its status word, `SUCCESS`, was read from `railway deployment list` in the
terminal and not recorded to a file. Its log (`R28-redeploy-log-2026-09-06.txt`): the pre-deploy
step `prisma migrate deploy` found 64 migrations, applied all 64 in order from
`20260815000000_baseline` to `20260903120000_walk_step_1_additive`, "All migrations have been
successfully applied", and the container started pinned to `elws…ae` with the vector store
reporting OK — and then answered every read below. **Never `db push`, never `migrate dev`, never a
hand-applied migration.**

By data at 11:07:33Z (`R28-schema-after-redeploy-2026-09-06.txt`): `migrationsApplied: 64`,
`tables: 41`, `vector` in `public`, `pgcrypto` in `extensions`, `researchers: 0`. `db:check-drift`,
structural only and not the verification of the drop: "No difference detected", exit 0
(`R28-check-drift-2026-09-06.txt`). **What returned is today's migration history, legacy tables
included** — §9.6's one baseline in the target shape needs step 8 and was not this session's; the
history was not squashed and the legacy tables' return is not a defect.

## 6 — the order of return

1. The researcher signed in on the staging frontend — the Supabase login survived, `auth` being
   outside `public` — and the handle-setup step created the `Researcher` row.
2. `researcher:bootstrap --env staging`: first refused, `No researcher with handle "jonathan"`,
   listing the one registered handle, `יהונתן` — that refusal's return was captured to
   `R28-bootstrap-2026-09-06.txt` and then overwritten by the approved run's, so it survives only in
   the session transcript, quoted here from it; then run with that handle: **approved**,
   `cmtppmtp90000bu2qzuagrwsw`, role unchanged, exit 0, deployment `d26bd47a`
   (`R28-bootstrap-2026-09-06.txt`). `--make-admin` was not run: the handoff named the approval only.
3. The researcher re-authorized the claude.ai connector — the OAuth flow, authority
   `docs/gf-mcp-oauth-dev-plan.md` — after the approval, as the script's own next line requires.
4. `get_environment`, the first MCP call after that: §1's second return, a corpus of zeros.

## 7 — the survey

`survey_wayback_captures`, through the connector, one page at a time, each shown and waited on —
the one write tool this session called, permitted because it never reaches the chain. Ruled before
the first call: on the empty database every survey reports `held: 0`; the numbers to read against
the 09-05 table (`docs/gf-walk-step-2-survey-verified-2026-09-05.md`) are `captures` and
`byteDistinct`, with `appended` equal to `captures`.

| page | `captures` today · 09-05 | `byteDistinct` today · 09-05 | `held` | `appended` | `unservable` | `span` | raw |
|---|---|---|---|---|---|---|---|
| `https://news.walla.co.il/item/3403847` | **8** · 9 | 8 · 8 | 0 | 8 | 0 | 2020-12-09 → 2025-03-26 | `R28-survey-walla-2026-09-06.json` |
| `https://rtmag.co.il/health/the-israeli-moh-hid-…-ordered` | 28 · 28 | 25 · 25 | 0 | 28 | 0 | 2022-08-21 → 2026-06-05 | `R28-survey-rtmag-2026-09-06.json` |
| `https://corona.health.gov.il/vaccine-for-covid/` | 133 · 133 | 95 · 95 | 0 | 133 | 0 | 2021-12-23 → 2026-05-22 | `R28-survey-corona-2026-09-06.json` |
| total | 169 | | 0 | 169 | 0 | | |

`created: true` on all three; each `TrackedUrl` is attributed to `יהונתן` — inferred from the
bootstrap, the one approved researcher, since the survey's return carries no creator. The archive was seen
answering the container in every return — rows, a span, no `ARCHIVE_UNAVAILABLE`. Walla's
`captures` 8 against 09-05's 9 is the 09-05 doc's own finding: the index returned `20210612183110`
twice that day, and the survey has since de-duplicated the archive's answer by timestamp, so 8 is
the count of distinct captures and `byteDistinct` is unchanged. The 169 rows written equal the
`CdxIndexEntry` count the simulation measured as lost.

**Sub-step 6 ends at the survey here and resumes after step 5 lands.** `scan_captures` is the
reporting walk only (plan §3 step 4): it stores nothing and anchors nothing, and it was not called.
Index 0 on the new registry, stamped with the anchoring scheme, is written by step 5's first ACQUIRED
capture. No write tool and no `--apply` script that reaches the chain ran; the freeze ruled
2026-09-06 held throughout.

## 8 — raw files

`R28-environment-2026-09-06.json` · `R28-extensions-2026-09-06.txt` · `R28-which-pg-dump-2026-09-06.txt` ·
`R28-simulate-statement-1-2026-09-06.txt` · `R28-execute-statement-1-2026-09-06.txt` ·
`R28-verify-after-statement-1-2026-09-06.txt` · `R28-simulate-statement-2-2026-09-06.txt` ·
`R28-execute-statement-2-2026-09-06.txt` · `R28-verify-after-statement-2-2026-09-06.txt` ·
`R28-redeploy-2026-09-06.txt` · `R28-redeploy-log-2026-09-06.txt` · `R28-schema-after-redeploy-2026-09-06.txt` ·
`R28-check-drift-2026-09-06.txt` · `R28-bootstrap-2026-09-06.txt` · `R28-environment-after-drop-2026-09-06.json` ·
`R28-survey-{walla,rtmag,corona}-2026-09-06.json`.

Bears on: refactor plan §3 step 9.
