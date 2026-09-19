# The rebuild on production, the `SHIP` of head and the start of sub-step 6 — head deployed, the researcher and the connector returned, the page surveyed, INDEX 0 written on Base mainnet — 2026-09-13

**Refactor plan §3 step 9 on PRODUCTION: the `SHIP` of head (`staging → master`, the second advance
of `master`) and sub-step 6, the survey and the walk, as RESEARCH ACTS through MCP; evidence flows §8;
interaction flows Flow 1.** Session 3 of 3 of the production rebuild. Sessions 1 and 2 preceded it on
the same day (`docs/gf-rebuild-production-measure-2026-09-13.md`,
`docs/gf-rebuild-production-ledger-2026-09-13.md`, `docs/gf-rebuild-production-new-registry-2026-09-13.md`,
`docs/gf-rebuild-production-drop-2026-09-13.md`); staging rehearsed the order of return and the
survey on 2026-09-06 (`docs/gf-rebuild-staging-drop-and-survey-2026-09-06.md` §6–§7). Every call
and every edit was shown to the researcher and waited on before it ran; every raw return is a file
under `handoffs/P3-*-2026-09-13.*` (the handoffs directory, outside this repository) and every
number here is read from one. **The walk was stopped by the researcher after its first ACQUIRED
capture — index 0, stamped with the anchoring scheme — and sub-step 6 is therefore STARTED, not
complete**: one capture stored and anchored, 132 work-list rows UNFETCHED, resumable from
`20220105113501` under the four rules in force (§7, §9).

## 1 — `SHIP`'s refusals, read as data before the keyword

Read 15:30Z (`P3-refusals-npm-test-2026-09-13.txt`, `P3-refusals-git-2026-09-13.txt`,
`P3-refusals-staging-deploy-list-2026-09-13.json`, `P3-refusals-secret-scan-2026-09-13.txt`):

| condition | read |
|---|---|
| tests | 109 suites, 1,553 tests passed, exit 0, from `apps/glass-fortress/backend` |
| tree | `git status --porcelain` empty |
| staging's deploy | the serving backend deploy `d76ebf3f @ f10fb08` SUCCESS (14:57Z); the two newer rows, `ecdcdb9` and `a581cbf`, SKIPPED — PRs #437 and #438, whose diff over `f10fb08` touches nothing under `apps/`, `contracts/` or `packages/` |
| branches | `origin/master` `0ca8d721011a23d00c8b3f5ebf09bc72c413dafc`, an ancestor of `origin/staging` `a581cbf`; **95 commits** ahead (PRs #397–#438) |
| secret-shaped | 60 matches in `0ca8d72..origin/staging`, every one explained by name: 46 SHA-256 values (20 in the committed mainnet ledger `8453-0x0e21….json`, 21 in thesis and evidence test fixtures, 5 in dated docs); 3 `postgresql://` decoys in tests (`planted:planted@127.0.0.1:9`, a template with password `x`); 6 `supabase` lines (four removed `project-ref.supabase.co` placeholders, two built from `PROD_REF` looked up at runtime from `KNOWN_ENVIRONMENTS`, no ref value in the diff); 4 test-token constants moved between two test files; the `#ev_${fileHash}` citation token |
| `gh auth` | active as `time4love` |

**The identity read at `0ca8d72`** (15:32Z, deployment `97c0f5a1`, `P3-identity-read-2026-09-13.txt`,
`P3-read-registry-2026-09-13.txt`): `RAILWAY_ENVIRONMENT_NAME` production, `APP_ENV` unset, ref
`fqmc…lo`; `_prisma_migrations` 67 rows, 67 finished, none rolled back; 42 tables; every corpus count
0, `Researcher` 0, `OidcModel` 0, `evidence_embeddings` 0; the guard's four axes agreed; registry
`0xDE42950373BCd0bcb9232aa01745C0bBbf409823`, registrar `0x19a4385405643682607c78d7e5c3a940ba2cccc8`,
`totalEvidence()` 0. Production named by the masked ref throughout, never by a connector's name.

**The registrar's wallet, read from the chain with no key** (`P3-wallet-balance-before-2026-09-13.txt`,
`P3-anchor-gas-estimate-2026-09-13.txt`): 0.000975089 ETH at nonce 21, unchanged since the deploy of
session 1; Base gas 0.006 gwei; one `submit(bytes32,string)` from the registrar on the new registry
with the `DOCUMENT_SHA256` scheme estimated at 164,416 gas, about 0.000001 ETH — so the page's upper
bound of 95 byte-distinct captures is about a tenth of the balance at that price. **The researcher
ruled no top-up.**

## 2 — what deployed

Printed from the tree before the keyword: 95 commits; 71 migration folders at head against 67
applied, the four after `20260907210000_retire_draft_trusted` with what each meets on empty tables —
`20260908205356_evidence_step_11b` (35 statements; `Evidence.kind` NOT NULL and `DiffDebateSession`'s
thesis column on zero rows), `20260909120000_debate_evidence_not_unique` (2), `20260911120000_thesis_step_18_schema`
(94; 7 tables, 4 types, 5 NOT NULLs, 3 CHECKs on zeros), `20260914120000_r45_legacy_register_and_calibration`
(27; a DO block counting eleven legacy populations that raises on any above 0, then 7 tables, 7
types, `TrackedUrl.status` and `activeArticleRulesetId`, `CdxIndexEntry.comparedToSnapshotId`, the
`CdxEntryStatus` enum swap, and the three `UrlSnapshot` columns the ledger read — `fullText`,
`contentHash`, `snapshotUrl`). Routes head KEEPS: `/api/mcp`, `/api/forensics`, `/api/article-rules`,
`/api/auth`, `/api/reports`, the OAuth mounts, `/.well-known`; DROPS: `/api/evidence`, `/api/arguments`,
`/api/chat`, `/api/figures`, `/api/mentions`, `/api/thesis`. Frontend pages that went dark on
production with them: `/evidence`, `/figures`, `/theses` with its `edit` and `history` pages, `/call`,
`/submit`, `/forensics`. Bronze Fortress: 0 files changed, no rebuild.

**On `SHIP`** (15:35:25Z, `P3-ship-merge-2026-09-13.txt`): `origin/staging` merged into `master` as a
merge commit, **`c2c8933752e68830d068dd05b0757ce61b34d224`**, pushed. Railway built both GF services:
backend **`a0624d45`** and frontend **`fa8ac3d1`**, both created 15:35:31Z; the backend DEPLOYING at
15:37:23Z and **SUCCESS at 15:38:12Z**, the frontend SUCCESS on the read after it
(`P3-deploy-poll-2026-09-13.txt`; each read one `railway deployment list --json` parsed with Python
`strict=False`). The backend's log (`P3-deploy-log-backend-2026-09-13.txt`): "71 migrations found",
the four applied by name in order, "All migrations have been successfully applied.", then
`[startup] Environment: production → fqmc…lo (pinned)`.

## 3 — the taking, and the handshake

In the container at head (`a0624d45 @ c2c8933`, 15:38–15:39Z; `P3-identity-read-head-2026-09-13.txt`,
`P3-structural-check-head-2026-09-13.txt`, `P3-read-registry-head-2026-09-13.txt`):

| read | value |
|---|---|
| `_prisma_migrations` | **71** rows, 71 distinct, 71 finished, none rolled back; the last four are the four above |
| tables in `public` | **35** (42 minus R45-B's seven) |
| R45-B's seven dropped tables and `evidence_embeddings`; its six dropped columns | none present; none present |
| every corpus count, `Thesis`, `Researcher`, `OidcModel` | 0 |
| extensions | `vector` in `public`, `pgcrypto` in `extensions`, unchanged |
| `prisma migrate diff --from-schema-datasource … --exit-code` | **"No difference detected."**, exit 0 |
| `forensics:read-registry --env production` | the four axes agreed; `0xDE42…9823`; registrar `0x19a4…ccc8`; `totalEvidence()` 0 |

**The handshake** (15:40Z, `P3-handshake-2026-09-13.txt`): one JSON-RPC `initialize` to the production
`/api/mcp`, HTTP 200, one SSE event: `serverInfo` `tzedek-laam-covid` / צדק לעם — תיק הקורונה / 1.0.0,
capabilities `tools`, `prompts`, `resources`, `instructions` **17,106 chars** — the length the
connector-instructions record names for head after PR #429. The build the merge produced, observed
from outside.

## 4 — the order of return

1. **Sign-up.** The researcher signed up on the production frontend; the handle-setup step created
   the `Researcher` row at 15:41:53Z (`P3-researcher-rows-before-bootstrap-2026-09-13.txt`: one row,
   handle `יהונתן`, role `RESEARCHER`, `approved` false, id `cmtzzf9yn0000ab4gwc12jqs5`). The Supabase
   login had survived the drop, `auth` being outside `public`.
2. **Bootstrap** (`P3-bootstrap-2026-09-13.txt`): `researcher:bootstrap --env production --handle 'יהונתן'`
   in the container, environment stated twice, under the guard's banner naming `a0624d45 @ c2c8933`:
   **Approved `יהונתן`**, role unchanged, exit 0, 15:42:54Z. No refusal this time — the handle given was
   the registered one; staging's first run had refused `jonathan` and listed the registered handle. The
   script's own last line named the next act: reconnect the connector, since the OAuth flow resolves an
   account only for an approved researcher. `--make-admin` was not run.
3. **Re-authorization.** The researcher reconnected the production connector in claude.ai's connector
   settings — the OAuth flow of `docs/gf-mcp-oauth-dev-plan.md` — signing in as the approved account.
   **A departure from the prompt, the researcher's:** they then attached that production connector to
   the ship-head session itself, and every MCP call below ran from this session on their word, each
   shown first and its raw return saved, rather than being typed in claude.ai and pasted. The
   container reads after each write are the verification either way.
4. **`get_environment`, the first MCP call** (15:47Z, `P3-get-environment-2026-09-13.json`), quoted:
   `environment production`, `verdict CONFIRMED`, no warnings; database `fqmc…lo`, pinned; chain
   reachable, `chainId 8453`, `registryAddress 0xDE42950373BCd0bcb9232aa01745C0bBbf409823`,
   `registryDeployed true`, matches; corpus `trackedUrls 0, snapshots 0, diffs 0, evidence 0, theses 0`.

## 5 — the survey

`survey_wayback_captures` on `https://corona.health.gov.il/vaccine-for-covid/` at 15:48Z
(`P3-survey-corona-2026-09-13.json`), the one write tool that never reaches the chain:

| `captures` today · staging 09-06 | `byteDistinct` today · 09-06 | `held` | `appended` | `unservable` | `span` | `created` |
|---|---|---|---|---|---|---|
| **133** · 133 | **95** · 95 | 0 | 133 | 0 | 2021-12-23 → 2026-05-22 | true, `trackedUrlId` `a6f92c0e-9b6f-44cd-9f10-50183a61685f` |

The archive answered — rows and a span, no `ARCHIVE_UNAVAILABLE`; its index has not grown since
staging's survey; `held` 0 is correct on the empty database. In the container right after
(`P3-identity-read-after-survey-2026-09-13.txt`): `TrackedUrl` 1, `CdxIndexEntry` **133**, `Researcher`
1, `OidcModel` 9 (the connector's fresh OAuth state), every other count 0. The page is attributed to
`יהונתן`, the one approved researcher.

## 6 — the first capture, the marking, index 0

**Gate 0** (15:50Z, `P3-scan-1-gate0-2026-09-13.json`): `scan_captures maxCaptures=1` walked 1, acquired
0, stopped on the earliest capture **`20211223211940`** with empty material — no rules exist — and
returned the marking URL. Nothing stored, nothing anchored, nothing spent, as Flow 1 Phase 1 designs.

**The marking, on the production marking page.** The researcher's draft named five elements, 885
characters: the accessibility skip-links list, the MOH `#header`, the MOH `#footer` down to `© 2021`,
the back-to-top control, and a two-link list at the top of the article — *שאלון תופעות לוואי* (the
side-effect questionnaire) and *מוקדי התחסנות* (the vaccination centres). Claude flagged the fifth, once,
without deciding: the questionnaire link is the adverse-event reporting channel, the record the
connector's own instructions name for Article 7, and a rule taking it means Gate 1 can never fire on
its later removal, since text never kept cannot change sides. **The researcher removed that rule from
the draft** and saved it at 16:03:49.502Z: four new rules, none ending. The page's save writes a
DRAFT; the rules read empty by tool until the approval, which is the tool call. `approve_article_rules`
at 16:06:50Z (`P3-approve-rules-1-2026-09-13.json`), the return as it came: four rules added —
`ul.skipMenu.noPrint.list-unstyled.d-none.d-lg-block`, `#footer`, `#header`, `div.back-top.d-none` — all
`validFrom` `20211223211940`, none trusted; `changes` 4 added, 0 ended, 0 extended;
`decisionSequence` **2**.

**Index 0** (`P3-scan-2-index0-2026-09-13.json`, `P3-check-on-chain-index0-2026-09-13.json`,
`P3-index0-cast-2026-09-13.txt`): the second `scan_captures maxCaptures=1` walked 1, **acquired 1**, no
stop, `next` `20220105113501`. Read from the chain with `cast`, not only by the tool:

| index 0 on `0xDE42950373BCd0bcb9232aa01745C0bBbf409823`, Base mainnet | value |
|---|---|
| hash | `0x5887afdfb92ad807f4f3206116bd9bfbed3df36f7255d2506f4de9057b19b0c1` |
| submitter | `0x19a4385405643682607c78d7e5c3a940ba2cccc8`, the registrar |
| block time | 1789315683 = **2026-09-13T16:08:03Z** |
| **category** | **`DOCUMENT_SHA256`** — the anchoring scheme, stamped by the first entry |
| `totalEvidence()` · `isRegistered(hash)` | 1 · true at index 0 |
| the spend | 0.000975089 → 0.000974117 ETH = **0.00000097 ETH**; nonce 21 → 22 |

`check_on_chain_status` on the capture agreed from the platform's side, twice, at 16:08Z and again in
§8: `documentHash` equal to the hash above, registered at index 0, submitter the registrar,
**ATTRIBUTED**, `anchoredHash` matching, stored verdict VERIFIED by chain state
(`v2-attribution-from-chain-state`, 16:08:04Z); the registry reached: chain 8453, `0xde42…9823`.
`WRITES_ALLOWED` now holds on the first entry's category, not on emptiness: the freeze of the
new-registry record's §3 ended at head's deploy, by refusal, as designed.

## 7 — the walk, stopped

**The researcher stopped the walk here**, before the second batch: "we proved prod is working on
master and no point in doing a full walk" — back to the refactor dev plan on staging. Read as the
ruling it is: sub-step 6 on production is STARTED, its first anchor and its scheme in place, and the
rest of the walk is scheduled later. What that leaves, so it is not discovered:

- The corpus holds one page, **one ACQUIRED capture** (`20211223211940`, snapshot
  `cmu00cus50048ab4gp0tkjwhr`, ruleset `df48f92e`), **132 UNFETCHED rows**, no diff, no trajectory, no
  evidence. Thesis steps 20–26 on production need the walk before a thesis can cite a trajectory there
  — the order the ship-order memory's row 9 already states.
- `scan_captures` resumes from the first UNFETCHED row, `20220105113501`, under the four rules in
  force; on staging that same capture fired Gate 4 on the footer's copyright year. Every ACQUIRED
  capture from there on spends from the registrar's 0.000974 ETH; the top-up question moves to the
  day the walk resumes.
- Nothing is half-written: the last write was index 0 and its VERIFIED check, and the chain and the
  database agree (§8).

## 8 — after

| read | value |
|---|---|
| `forensics:read-registry --env production`, 18:26Z, `a0624d45 @ c2c8933` (`P3-read-registry-after-2026-09-13.txt`) | the four axes agreed; `totalEvidence()` **1**; entries by kind DOCUMENT_HASH 1, UNEXPLAINED 0; captures by verdict ATTRIBUTED **1**, FOREIGN_SUBMITTER 0, UNREGISTERED 0; index 0 → snapshot `cmu00cus50048ab4gp0tkjwhr`, `20211223211940` |
| `db:check-drift` in the container (`P3-check-drift-after-2026-09-13.txt`) | **"No difference detected."**, exit 0 |
| `check_on_chain_status` on `20211223211940`, second read | equal to the first — ATTRIBUTED, VERIFIED |
| `list_captures outcome=ACQUIRED` | exactly one row, `stale` false, no stop gates |
| the ledger's `successor` | already names this registry (session 1); nothing to edit |

A page-wide `check_on_chain_status` (url alone) refuses `NOT_A_CAPTURE`: the contract takes a capture
or a record name, never a page. The prompt's "over the corpus" was met capture by capture — one today.

## 9 — what this session did not do, and what remains

No thesis, no evidence, no framing (thesis steps 20–26, the researcher's own hand, later). No second
page. No `--apply` script; no maintenance write from a laptop; no destructive statement. The walk past
index 0 (§7). Two instrument notes for the next in-container session: a script copied to `/tmp` cannot
resolve `@prisma/client` there — the `node -e "$(echo <base64> | base64 -d)"` shape from the backend
directory is the one that works; and the marking page's save is a draft, invisible to
`get_article_rules` until `approve_article_rules` runs, so an empty rules read after "saved" is not a
failed save.

## 10 — raw files

`P3-wallet-balance-before-2026-09-13.txt` · `P3-anchor-gas-estimate-2026-09-13.txt` ·
`P3-refusals-npm-test-2026-09-13.txt` · `P3-refusals-git-2026-09-13.txt` ·
`P3-refusals-staging-deploy-list-2026-09-13.json` · `P3-refusals-secret-scan-2026-09-13.txt` ·
`P3-identity-read-2026-09-13.txt` · `P3-read-registry-2026-09-13.txt` · `P3-ship-merge-2026-09-13.txt` ·
`P3-deploy-poll-2026-09-13.txt` and the `P3-deploy-list-*.json` reads · `P3-deploy-log-backend-2026-09-13.txt` ·
`P3-identity-read-head-2026-09-13.txt` · `P3-structural-check-head-2026-09-13.txt` ·
`P3-read-registry-head-2026-09-13.txt` · `P3-handshake-2026-09-13.txt` ·
`P3-researcher-rows-before-bootstrap-2026-09-13.txt` · `P3-bootstrap-2026-09-13.txt` ·
`P3-get-environment-2026-09-13.json` · `P3-survey-corona-2026-09-13.json` ·
`P3-wallet-balance-before-walk-2026-09-13.txt` · `P3-identity-read-after-survey-2026-09-13.txt` ·
`P3-scan-1-gate0-2026-09-13.json` · `P3-approve-rules-1-2026-09-13.json` · `P3-scan-2-index0-2026-09-13.json` ·
`P3-check-on-chain-index0-2026-09-13.json` · `P3-index0-cast-2026-09-13.txt` ·
`P3-read-registry-after-2026-09-13.txt` · `P3-check-drift-after-2026-09-13.txt`; the instruments
`P3-identity-read-head.js`, `P3-researcher-rows.js`, `P3-deploy-poll.sh`, `P3-merge-message.txt`.

Bears on: refactor plan §3 step 9; `memory/gf-production-rebuild-and-ship-order.md` rows 7–8.
