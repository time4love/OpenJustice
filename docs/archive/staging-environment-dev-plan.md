# Staging Environment — Dev Plan

> **ARCHIVED 2026-09-04 — succeeded by `CLAUDE.md`, Branching & Deployment Protocol.** Staging is live and
> its rules are stated there; the Railway branch-binding root cause recorded below (§9) is the one finding
> worth reading from here.

**Status:** Phases 0, 0b, 1, 2, 3 and 4 COMPLETE — **staging is live, password-gated and `noindex`**,
and the backend API is now gated too (§9). Phase 3 **shipped to production** 2026-08-15 (`ebbcc29`);
production is unchanged except that the backend now logs its database identity at boot and
`/icon.png` is served again. **Phase 5 (demo prep) is unblocked and ready to run** — both blockers
(backend API gate, on-chain registration) closed 2026-08-16. Homepage redesign + hero animation +
staging debug console landed 2026-08-16/17 (§9).
**Last updated:** 2026-08-17 — frontend typechecks clean, production build succeeds.

✅ **Railway branch binding: RESOLVED 2026-08-18.** After breaking three times (see §9 history below),
the real root cause was found: the CLI's `railway service source connect` calls a service-level
mutation with no per-environment scoping, so it always overwrote every environment's binding at once.
The actual per-environment setting is a separate `DeploymentTrigger` object per (service, environment)
pair, reachable only via `railway api ... deploymentTriggerUpdate`. Production is now durably on
`master`, staging durably on `staging`, confirmed independent. **Standing rule: `LAND` and `SHIP` must
never call the Railway API or CLI to trigger a deploy — only push/merge on GitHub, then read Railway's
status.** Deployment happens purely because the branch push matches that environment's
`DeploymentTrigger.branch`; nudging it manually is reserved for a deliberate, explicitly-requested
infra fix, never a routine step. Full story: `gf-railway-branch-misconfig` in Claude's memory.

| | |
|---|---|
| Staging frontend | https://glass-fortress-frontend-staging.up.railway.app |
| Staging backend | https://glass-fortress-backend-staging.up.railway.app |
| Staging Supabase | project `glass-fortress-staging`, eu-central-1, **paid** ($10/mo, Pro org) — no idle pause |
| Credentials | `apps/glass-fortress/backend/.env.staging` (gitignored) |
| Local `.env` | points at **staging**; production preserved in `.env.production.local` |

🔒 **Staging is password-gated and `noindex`** as of Phase 3. The shared password lives in Railway as
`STAGING_ACCESS_SECRET` on `glass-fortress-frontend` (staging environment only) — never in git.
`DEMO_MODE=true` hides the staging chip during a demo without weakening the gate.
**Created:** 2026-08-15
**Scope:** Glass Fortress only (backend + frontend). Bronze Fortress is out of scope.

---

## 1. Goals

1. **A place to test new features** — scanning new URLs, building test theses — without writing to
   production data or deploying to the public site.
2. **A demo environment for journalists** — a real, working, reachable URL where a live MOH page scan
   can be performed in front of an editor, without that site being publicly discoverable or indexed.
3. **Stop local development writing to the production database** (this is happening today).

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Scope | Glass Fortress only — 2 Railway services, not 4 |
| Data isolation | New Supabase project; staging **and** local dev both point at it |
| Demo hosting | Same staging environment, password-gated + `noindex` |
| Git flow | `staging` branch deploys to staging; `master` stays production |

---

## 3. Findings from investigation

### 3.1 There is no isolation today
Local `npm run gf:backend` uses the same `DATABASE_URL` as production. Every test scan, thesis and
tracked URL created during development is already in the production database.

### 3.2 Pinecone is dead config
`VectorStoreService` is backed by Supabase pgvector via Prisma raw queries. Nothing under
`apps/glass-fortress/backend/src/` references `PINECONE_*`. The block in `.env.example` is stale and
should be deleted. **Consequence: one new Supabase project isolates DB + vector store + storage in a
single move.** No second vector service to provision.

### 3.3 PRODUCTION BUG — semantic search is silently dead
Verified against the production Supabase project (`fqmczumacfbunffgodlo`):

- The `vector` extension **is** installed (0.8.2, `public` schema).
- The `match_evidence(vector, int)` function **exists** and selects `FROM evidence_embeddings`.
- The `evidence_embeddings` table **does not exist** — in any schema.

Effects in production right now:

| Call site | Behaviour |
|---|---|
| `VectorStoreService.upsertEvidence` | `INSERT` into a nonexistent table → throws |
| `VectorStoreService.searchSimilarEvidence` | `match_evidence` fails → **caught and swallowed**, returns `[]` |

So every semantic-similarity lookup returns no results and logs an error nobody reads. The
`ForensicAgent` cross-referencing in `WaybackScraper` — the exact feature the journalist demo depends
on — is running with zero correlated evidence.

This must be fixed as part of this work, because the staging baseline migration has to create the
table anyway. The same migration repairs production.

No data has been lost — see §3.7, production is empty — but this would have bitten silently the
moment the first real evidence record landed.

### 3.4 The schema has no migration history
`apps/glass-fortress/backend/prisma/` has no `migrations/` directory. The `_prisma_migrations` table
exists in production but is **empty** — the schema was only ever `prisma db push`ed. There is
therefore no reproducible way to stand up an identical database, and prod/staging would drift
silently. A baseline migration is a prerequisite, not an optional tidy-up.

### 3.5 `evidence_embeddings` is not a Prisma model
It is referenced only from raw SQL. `prisma db push` / `migrate` will never create it from
`schema.prisma`. It must live in the migration SQL by hand, alongside `match_evidence`.

**Open decision — vector dimension.** `GoogleGenerativeAIEmbeddings` is constructed with
`gemini-embedding-001` and no `outputDimensionality`, so it returns the model default (expected 3072
— verify by embedding one string and checking `.length` before writing the migration). pgvector's
`hnsw`/`ivfflat` indexes cap at 2000 dimensions.

- **Option A (recommended):** `vector(3072)`, no ANN index, exact sequential scan. Zero code change.
  The corpus is small; exact search is fast enough and more accurate.
- **Option B:** set `outputDimensionality: 1536` and add an `hnsw` index. Faster at scale, but
  changes application code and invalidates any embedding written under Option A.

Start with A. Revisit only if the corpus grows past a few thousand documents.

### 3.6 The production database is empty
Every table in GF production holds **zero rows** — `Evidence`, `Thesis`, `ThesisVersion`,
`TrackedUrl`, `UrlSnapshot`, `UrlVersionDiff`, `KeyFigure`, `Researcher`, `Whistleblower`. Verified
against `fqmczumacfbunffgodlo`, confirmed to be the same project referenced by the local `.env`.

Three consequences:

1. **No embedding backfill is needed.** Dropped from Phase 0.
2. **This is the cheapest possible moment to split environments.** There is no data to migrate and
   none to protect. Doing it after the first real evidence lands means untangling instead.
3. **The demo corpus does not exist yet and has to be built.** The journalist demo cannot be "show
   the production system" — production currently renders an empty site. Build the corpus in staging,
   verify it there, then promote what holds up. This makes Phase 5 the longest phase, not the
   shortest.

### 3.7 Tooling available
| Tool | Status |
|---|---|
| Railway CLI | Installed, authenticated as `ourtime4love@gmail.com`, linked to `bubbly-youthfulness`. Supports `environment new --duplicate`, `service delete`, `service source`, `variable set`. |
| Supabase MCP | Bound to **GF production only** (`fqmczumacfbunffgodlo`). No `create_project` tool exists. |
| Supabase CLI | Not installed. |
| `psql` | Not installed. |

**Implication:** the staging Supabase project must be created by hand in the dashboard. After that,
Prisma reaches it over `DATABASE_URL`, so no MCP binding to staging is needed.

---

## 4. Who does what

| # | Task | Owner |
|---|---|---|
| 1 | Verify embedding dimension; write baseline migration incl. `evidence_embeddings` + `match_evidence` | Claude |
| 2 | Baseline the migration against production (`migrate resolve --applied`) | Claude (Supabase MCP + Prisma) |
| 3 | Apply the missing `evidence_embeddings` table to **production** | Claude (Supabase MCP) |
| 4 | **Create Supabase project `glass-fortress-staging`** | **You** |
| 5 | **Supply staging connection strings + API keys** | **You** |
| 6 | Apply schema to staging (`migrate deploy`) | Claude |
| 7 | Create the `evidence` storage bucket on staging | Claude (Storage REST API + service-role key) |
| 8 | Create `staging` git branch | Claude |
| 9 | Duplicate the Railway environment, delete the two BF services | Claude (Railway CLI) |
| 10 | Point staging services at the `staging` branch | Claude (CLI; dashboard fallback) |
| 11 | Set staging environment variables | Claude (Railway CLI) |
| 12 | Repoint local `.env` at staging | Claude |
| 13 | `APP_ENV` config, password gate middleware, `noindex`, staging banner | Claude |
| 14 | Delete dead `PINECONE_*` from `.env.example` | Claude |
| 15 | Choose + verify demo URLs, rehearse | You + Claude |

Only steps 4, 5 and 15 need your hands.

---

## 5. Phases

### Phase 0 — Schema baseline and production repair
*No new infrastructure. Safe to do before the Supabase project exists.*

1. Embed one string with the current config; record the vector length.
2. Generate a baseline migration from `schema.prisma`:
   `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
3. Hand-append to that migration SQL:
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `CREATE TABLE evidence_embeddings (id text PRIMARY KEY, content text NOT NULL, embedding vector(N) NOT NULL);`
   - `CREATE OR REPLACE FUNCTION match_evidence(...)` — reproduce the definition already in production.
4. Mark it applied on production without re-running it:
   `prisma migrate resolve --applied <migration_name>`
5. Apply **only** the `evidence_embeddings` table to production, via Supabase MCP. This is additive —
   a new empty table, no existing object touched. No backfill needed (§3.6).
6. Add `VectorStoreService.healthCheck()` and call it at server startup. A unit test cannot detect a
   missing table — that is runtime database state — so the boot check is the real guard. The
   `catch → return []` in `searchSimilarEvidence` stays (callers treat the vector store as optional),
   but the failure is now loud at startup instead of invisible forever.
7. Unit-test both methods, including the exact production failure shape.

**Exit:** production has a working vector store; the schema is reproducible from migrations.

**✅ Done 2026-08-15.** Embedding width measured at 3072. Baseline migration
`20260815000000_baseline` generated and marked applied on production. `evidence_embeddings` and
`match_evidence` created and verified end to end (probe vector returned similarity 1.0000, probe row
removed). `VectorStoreService.healthCheck()` added and wired into server startup. `prisma migrate
status` reports up to date. Dead `PINECONE_*` block removed from `.env.example`. 453/453 tests.

Migration `20260815010000_evidence_investigative_categories` also applied — adds
`Evidence.investigativeCategories`, required by the forensic classification work below.

### Phase 0b — Forensic classification gate (adjacent, completed same session)

Not originally part of this plan; added because auto-promotion was creating evidence from any change
`ForensicAgent` found interesting, under a prompt explicitly tuned to over-flag.

- `INVESTIGATIVE_CATEGORIES` — seven standing concerns of the Covid investigation
  (`WITHHOLDING_INFORMATION`, `INFORMED_CONSENT`, `COERCION_MANDATE`,
  `EXPERIMENTAL_STATUS_CONCEALMENT`, `SAFETY_CLAIM_ALTERATION`, `STATISTICAL_MANIPULATION`,
  `ACCOUNTABILITY_EROSION`).
- **Intrinsic, not relational.** Categories are fixed at creation and independent of any `Thesis`,
  because evidence normally predates the theses that cite it. "Does this support thesis X" is a
  separate, re-computable relation over (evidence, thesis) pairs — one record may support several
  theses, and a thesis written later must be able to claim evidence recorded earlier. **Not yet
  built.**
- Significance is now *derived* from classification rather than judged separately, so the flag and
  the categories cannot contradict each other. The model is no longer asked for the boolean.
- Prompt retuned from recall to precision — "err on the side of significance" removed.
- Auto-promotion gates on a non-empty category list, and `tierReasoning` now describes what the
  change did and which concerns it advances, replacing a hardcoded assertion of intent to mislead on
  every record.

### Phase 1 — Staging database

**[YOU]** In the Supabase dashboard:
1. Create a project named `glass-fortress-staging` in **eu-central-1** — the region GF production
   runs in — so demo latency is comparable.
2. ⚠️ The free plan caps active projects **per organization**, and you already have GF + BF. If the
   dashboard refuses, create a **new free organization** and put the staging project there — this is
   cheaper than upgrading, and staging never needs paid features.
3. From *Settings → Database*, copy the **Transaction pooler** URI (port 6543) and the **Session
   pooler / direct** URI (port 5432).
4. From *Settings → API*, copy the project URL, the anon/publishable key, and the service-role key.
5. Paste all six values into the chat. (These are staging-only credentials for a database with no
   real data in it; production keys are not involved.)

**[CLAUDE]** Then:
6. Write `apps/glass-fortress/backend/.env.staging` (gitignored) with those values.
7. `DATABASE_URL=<staging> prisma migrate deploy` — creates every table, the `vector` extension,
   `evidence_embeddings` and `match_evidence` in one shot.
8. Create the `evidence` storage bucket (public) via the Storage REST API using the service-role key.
9. Smoke-test: connect, list tables, insert and read back one embedding.

**Exit:** staging database is schema-identical to production and empty.

**✅ Done 2026-08-15.** All four migrations applied. `pgvector`, `evidence_embeddings` and
`match_evidence` verified end to end (round-trip returned `similarity: 1`, probe row removed). Public
`evidence` storage bucket created via the Storage REST API.

### Phase 2 — Branch and Railway environment

**[CLAUDE]**
1. `git checkout -b staging && git push -u origin staging`
2. `railway environment new staging --duplicate production`
3. `railway service delete` the two `bronze-fortress-*` services in the `staging` environment only.
   *(Verify the `-e staging` scoping before running — deleting from production would take the live BF
   site down. I will confirm the target environment on each call.)*
4. Point both GF services at the `staging` branch:
   `railway environment edit -e staging --service-config glass-fortress-backend source.branch staging`
   (and likewise for the frontend). Dashboard fallback if the dot-path is rejected.
5. Set the staging variables per the matrix in §6.
6. Trigger a deploy and confirm both services come up.

**Exit:** two Railway URLs serving the `staging` branch against the staging database.

**✅ Done 2026-08-15.** Environment duplicated, both Bronze Fortress services deleted **from staging
only**, GF services pointed at the `staging` branch, all variables overwritten, both services deployed
`SUCCESS` and tested by the user.

⚠️ **Railway service IDs are shared across environments** — `bronze-fortress-backend` has the same ID
in both. `railway service delete` is environment-scoped via `-e`, but always pass it explicitly and
verify the other environment before and after each delete.

⚠️ **Duplicating an environment copies production credentials.** Staging came up pointing at the
production `DATABASE_URL`; a deploy before the overwrite would have written to the live vault.
Overwrite variables *before* the first deploy. `PINATA_JWT`, `REGISTRAR_PRIVATE_KEY`,
`EVIDENCE_REGISTRY_ADDRESS` and `RPC_URL` were deleted outright — a wallet private key has no place
in staging. `MCP_WRITE_TOKEN`, `TOKEN_HMAC_SECRET` and `PII_SECRET_KEY` are staging-only values.

**Railway cost:** measured $0.64 over 5 days for 4 services ≈ **$1/service/month**; staging adds ~$2.
Usage limits could **not** be set — they require an active subscription and the project is still on
the free trial. Upgrade to Hobby before it lapses, then set a soft limit.

### Phase 3 — Access control and environment awareness

**[CLAUDE]** All in `apps/glass-fortress/frontend`:
1. `src/lib/appEnv.ts` — read `APP_ENV` once, typed `'production' | 'staging'`, no scattered
   `process.env` checks.
2. `src/middleware.ts` — when `APP_ENV !== 'production'`, require a cookie holding a shared secret
   (`STAGING_ACCESS_SECRET`); otherwise redirect to `/unlock`. Must not disturb `[locale]` routing —
   the app has no middleware today, so the matcher has to exclude `_next`, static assets and the
   unlock route itself.
3. `src/app/[locale]/unlock/page.tsx` — minimal password form; sets an httpOnly cookie on success.
4. `robots.txt` route + `robots: { index: false, follow: false }` in metadata when not production.
   Belt and braces: the gate should mean crawlers never get in, but a misconfigured matcher shouldn't
   put unreviewed allegations in Google's index.
5. Staging banner — small fixed corner chip, rendered only when `APP_ENV === 'staging'`.
   Suppressed by `DEMO_MODE=true` so it is not on screen during a journalist meeting.
6. Delete the dead `PINECONE_*` block from `apps/glass-fortress/backend/.env.example`.
7. Backend: refuse to boot if `APP_ENV === 'production'` and `DATABASE_URL` points at the staging
   host, or vice versa. Cheap guard against the failure mode that motivated this whole plan.

**Exit:** staging is unreachable without the password and invisible to search engines.

**✅ Done 2026-08-15.** All seven items shipped; item 6 had already been done in Phase 0. Verified
locally against a dev server in both modes before deploying: gated (`/`, `/he`, `/he/vault`,
`/en/theses` all → `/unlock`), unlocked, wrong password rejected, cookie invisible to
`document.cookie`, `DEMO_MODE` toggling the chip, and `APP_ENV=production` restoring today's exact
behaviour (site serves, `/unlock` 404s, `robots.txt` allows, no `noindex`, no chip). 495/495 tests.

Three corrections to the plan as written:

- **The file is `src/proxy.ts`, not `src/middleware.ts`.** Next.js 16 renamed the convention;
  `middleware.ts` is deprecated. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **The app *does* have one, and always did** — `src/proxy.ts` runs `next-intl`'s middleware and is
  what produces the `/` → `/he` redirect. The gate composes in front of it rather than replacing it.
- **`APP_ENV` is unset on the production Railway services**, so unset has to mean production. A
  missing variable must never be able to put the public site behind a password. An unrecognised
  value throws instead of falling back, so a typo fails loudly rather than un-gating staging.

Design notes worth keeping:

- The cookie holds a **SHA-256 of the secret, not the secret**, compared with `timingSafeEqual`. A
  leaked cookie jar does not hand over a password someone may have reused.
- `APP_ENV != production` with no `STAGING_ACCESS_SECRET` set returns **503, not the site**. Failing
  open would recreate exactly the state this phase exists to end.
- **The backend guard compares database *identity*, not hostname.** The plan assumed staging and
  production have different DB hosts. They do not — both are
  `aws-0-eu-central-1.pooler.supabase.com`, and the project ref lives in the connection *username*
  (`postgres.<ref>`). So the guard: (a) always requires `DATABASE_URL`, `DIRECT_URL` and
  `SUPABASE_URL` to name one project — this catches a half-overwritten environment; and (b) enforces
  `EXPECTED_SUPABASE_PROJECT_REF` when set — the only thing that catches credentials copied
  wholesale, which is what the Railway environment duplication actually did. Refs are never
  hardcoded and are masked in every log line, because this repo is public.

Fixed in passing: the intl matcher was rewriting `/icon.png` to `/he/icon.png`, so the **deployed
favicon 404'd**. Metadata routes and `public/` assets are now excluded from the matcher.

⚠️ **Still open — the backend API is not gated.** The gate covers the frontend only, as this phase
specified. `glass-fortress-backend-staging.up.railway.app` remains open, and the frontend's
`/api/*` path is excluded from the matcher by necessity. Nothing is exposed today because staging
holds no data — but this must be closed **before Phase 5 seeds real MOH findings**. See §9.

### Phase 4 — Local development repoint

**[CLAUDE]**
1. Repoint `apps/glass-fortress/backend/.env` at the staging database.
2. Preserve the production values in a gitignored `.env.production.local` for the rare occasion you
   need to query prod deliberately.
3. Confirm `npm run gf:backend` now writes to staging.

**Exit:** local development can no longer touch production data by accident.

**✅ Done 2026-08-15.** `.env` repointed at staging; production preserved in `.env.production.local`.
Both DB URLs, all three Supabase values and both secrets swapped. 477/477 tests still pass and
production verified still empty.

### Phase 5 — Demo preparation

1. **[CLAUDE]** Seed staging by running the real intake and forensics flows — do **not** copy
   production rows. The `Whistleblower` table holds encrypted contact information for real people;
   copying it into an environment whose password will be typed in front of journalists is an
   unnecessary exposure. Genuine seeded data also demonstrates the pipeline actually works.
2. **[CLAUDE]** Run 6–10 candidate MOH URLs through `WaybackScraper`. Record for each: number of
   snapshots, number of legally significant diffs, and **wall-clock time end to end**.
3. **[YOU + CLAUDE]** Pick the 2–3 with the strongest findings as the spine of the demo.
4. **[YOU]** Rehearse once against staging before any real meeting.

**Demo runbook shape:**
- Open on a pre-verified URL with a known strong finding — establishes that the system works.
- Walk the version diff and the `ForensicAgent` legal-significance explanation.
- *Then* invite the journalist to name any MOH page, and scan it live. If it returns nothing, that is
  a credible outcome you can narrate ("not every page was edited") — but only after they have already
  seen a real hit.

⚠️ `WaybackScraper` only surfaces diffs it judges legally significant. Never open a demo on an
unrehearsed URL.

---

## 6. Environment variable matrix

| Variable | Production | Staging | Notes |
|---|---|---|---|
| `APP_ENV` | `production` | `staging` | New. Drives gate, banner, robots. |
| `DATABASE_URL` | prod pooler | staging pooler | |
| `DIRECT_URL` | prod direct | staging direct | |
| `SUPABASE_URL` | prod | staging | |
| `SUPABASE_ANON_KEY` | prod | staging | |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | staging | |
| `NEXT_PUBLIC_SUPABASE_URL` | prod | staging | frontend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | staging | frontend |
| `FRONTEND_URL` | prod URL | staging URL | CORS allowlist |
| `NEXT_PUBLIC_API_URL` | prod backend | staging backend | |
| `TOKEN_HMAC_SECRET` | prod secret | **new** secret | never share across envs |
| `PII_SECRET_KEY` | prod secret | **new** secret | never share across envs |
| `STAGING_ACCESS_SECRET` | — | new | frontend password gate |
| `STAGING_API_TOKEN` | — | new | backend bearer-token gate (2026-08-16) — **`Web3Service`-style: fails closed (503) if unset while `APP_ENV=staging`, does not disable gracefully** |
| `NEXT_PUBLIC_STAGING_API_TOKEN` | — | new, same value | frontend — patches the global `fetch` |
| `DEMO_MODE` | — | unset / `true` | suppresses the staging banner |
| `PINATA_JWT` | set when live | **unset** | avoid permanently pinning test files to IPFS |
| `EVIDENCE_REGISTRY_ADDRESS` | set after mainnet deploy | Base Sepolia **testnet** contract (2026-08-16) | own contract, own wallet — separate from production's |
| `RPC_URL` | Base mainnet | `https://sepolia.base.org` (2026-08-16) | |
| `REGISTRAR_PRIVATE_KEY` | production wallet | throwaway testnet wallet (2026-08-16) | **never share this value across envs** — see `gf-staging-testnet-chain` in Claude's memory |
| `ANTHROPIC_API_KEY` | shared | shared | token cost only |
| `GEMINI_API_KEY` | shared | shared | token cost only |
| `*_PROVIDER` | same | same | |
| `PORT` | as configured | as configured | do not change |

**Never shared:** anything under `DATABASE_URL`, `SUPABASE_*`, `TOKEN_HMAC_SECRET`, `PII_SECRET_KEY`.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Deleting BF services from the wrong Railway environment | Confirm `-e staging` on every destructive call; take the service list before and after |
| `migrate resolve --applied` run against the wrong database | Read back the connection host before executing |
| Staging indexed by search engines with unreviewed allegations | Password gate **and** `noindex` **and** `robots.txt` |
| Supabase free-tier project cap blocks Phase 1 | New free organization (see §5 Phase 1 step 2) |
| Prod/staging schema drift returning | Everything goes through `prisma/migrations` from now on; `db push` is retired |
| Live demo scan returns nothing | Pre-verified URLs first, free-choice scan last |
| Backfill embeddings cost | One-off Gemini embedding call per evidence record; small corpus, negligible |

## 8. Rollback

Each phase is independently reversible.

- Phase 0 — the new production table is additive and unused by anything that currently works; drop it.
- Phase 1 — delete the Supabase project.
- Phase 2 — `railway environment delete staging`; delete the `staging` branch.
- Phase 3 — code only; revert the commits. Production behaviour is unchanged because every new
  branch is gated on `APP_ENV !== 'production'`.
- Phase 4 — restore `.env` from `.env.production.local`.

Production is never modified except by Phase 0 step 5 (additive table) and step 6 (backfill).

## 9. Open tasks arising (as of 2026-08-15)

### Next up
1. **Phase 5 — demo prep.** Both prior blockers are now resolved (see Done below): the backend API
   is gated, and evidence confirm/promote works end-to-end against a dedicated Base Sepolia testnet
   deploy. Verified with a real scan (the rtmag.co.il MOH vaccine-side-effects article) reaching
   `CONFIRMED` status with an on-chain testnet tx. Seed staging by running the real intake and
   forensics flows (do not copy production rows — `Whistleblower` holds encrypted PII). Run 6–10
   candidate MOH URLs, record findings and wall-clock time, pick the 2–3 strongest, rehearse.
2. **Upgrade Railway to Hobby** before the free trial lapses, then set a usage soft limit.
3. **No rate limit on the unlock form.** Acceptable against a long shared secret over HTTPS, and
   the deployment is a single instance so an in-memory throttle would work if it stops being
   acceptable. Revisit if the password is ever shortened for demo convenience.
4. **"Glass Fortress" is still user-facing** in the browser tab title (`src/app/layout.tsx`) and on
   the login page (`← Glass Fortress`), against the rule that it is backend terminology only. Not
   touched here — it is production-visible branding, outside this phase.

### Done
~~**Create the staging Supabase project** — `glass-fortress-staging`, **eu-central-1** (production's
   region). Try a **new free organization** first ($0); the existing Pro org bills $10/mo for a third
   project. Free-plan projects pause after ~7 days idle — add a weekly ping and always warm it up the
   day before a demo. Then send: pooler URI (6543), direct URI (5432), project URL, anon key,
   service-role key.~~ **✅ Done — project created on the paid Pro org ($10/mo).**

~~**Set `EXPECTED_SUPABASE_PROJECT_REF` on the production Railway services.**~~ **✅ Done 2026-08-15**,
immediately after Phase 3 shipped. Set with `--skip-deploys` and read from production's own
`SUPABASE_URL`, so it could not be wrong and cost no second redeploy. Both environments are pinned.

~~**Gate the backend API before Phase 5 seeds real data.**~~ **✅ Done 2026-08-16.**
`requireStagingAccess` Express middleware, active only when `APP_ENV=staging`: fails closed (503) if
`STAGING_API_TOKEN` isn't set, 401s on a missing/wrong `X-Staging-Token` header, no-ops in
production. Frontend attaches the token via a one-time global `fetch` patch
(`src/lib/stagingApiAuth.ts`), since the browser calls the backend cross-origin on staging and none
of the ~50 call sites shared a wrapper. `STAGING_API_TOKEN` / `NEXT_PUBLIC_STAGING_API_TOKEN` are set
on staging Railway. Verified live: 401 without the token, 200 with it.

**2026-08-18 fix:** the gate originally used `Authorization: Bearer <token>` — the same header
researcher/MCP write-tool auth (`resolveResearcher`) and Supabase auth (`requireSupabaseAuth`) read
on the same requests for a *different* secret, so no request could satisfy both. Moved the gate to a
dedicated `X-Staging-Token` header so `Authorization` is free for researcher/Supabase credentials.

~~**On-chain registration was hard-broken on staging.**~~ **✅ Done 2026-08-16.** Every
evidence-confirming endpoint (`/evidence/confirm`, `/evidence/promote`, `/forensics/promote`)
unconditionally requires `Web3Service` (`RPC_URL`, `REGISTRAR_PRIVATE_KEY`,
`EVIDENCE_REGISTRY_ADDRESS`), which staging had deliberately never set — so evidence could reach
"draft" via `/evidence/intake` but never actually confirm. Fixed with a dedicated `EvidenceRegistry`
deploy to Base Sepolia **testnet**, own throwaway wallet — deliberately separate from the pending
mainnet deploy. Verified end-to-end: a real scan reached `CONFIRMED` with an on-chain testnet
`txHash`. Full story in Claude's memory (`gf-staging-testnet-chain`) if this needs revisiting.

~~**Production Railway services were deploying from the wrong branch.**~~ **✅ Fixed 2026-08-16,
recurred on staging 2026-08-17, fixed again.** `glass-fortress-frontend` and `glass-fortress-backend`
in the `production` Railway environment were configured to track the `staging` branch, not `master` —
meaning every merge to `staging` (LAND) had been silently deploying straight to production, bypassing
the explicit SHIP approval step, for an unknown prior period. Repointed both to `master` via `railway
service source connect --branch master --environment production`, redeployed `--from-source`,
verified live.

The next day, the **staging** services stopped auto-deploying entirely — a LAND produced no new
deployment for 20+ minutes, and manually running `redeploy --from-source` still deployed the *old*
commit while reporting `SUCCESS`, proving the source binding wasn't actually tracking `staging`'s live
tip. Re-running `service source connect --branch staging` (same fix, same command, different branch)
resolved it immediately — but the next day's tech-debt cleanup session flipped production back to
`staging` again, proving each "fix" was just undoing the previous one.

**✅ Root-caused and fixed for real, 2026-08-18.** `railway service source connect` calls the
`serviceConnect` GraphQL mutation, which takes a `serviceId` but **no `environmentId`** — it can't
help but touch every environment at once. The actual data model already supports independent
per-environment branches: each `(service, environment)` pair has its own `DeploymentTrigger` record
(`branch`, `serviceId`, `environmentId`, own `id`), reachable via `railway api`'s GraphQL access
(`deploymentTriggers(projectId, environmentId, serviceId)` to find the id, `deploymentTriggerUpdate(id,
input:{branch})` to set it) — never through the CLI's `source connect` subcommand. Repointed
production's two `DeploymentTrigger` records to `master`, confirmed staging's separate records were
never touched (different ids, never referenced), redeployed, verified live. **This is what makes the
binding durable going forward — no architectural split into 4 services was needed.** Full story:
`gf-railway-branch-misconfig` in Claude's memory.

~~**GF homepage was a bare stats-strip-and-list.**~~ **✅ Redesigned 2026-08-16/17**, three PRs,
all LANDed: (1) magazine-style highlights homepage — animated stats, mission teaser, top theses
re-ranked by strength (was raw open-gap count), a new `GET /api/evidence/latest` endpoint powering a
latest-evidence grid, a whistleblower CTA, framer-motion scroll reveals; (2) hero background redesign
— particles converge into randomized light masses instead of floating independently, each absorption
at the top spawns a gold ray sized to the mass; (3) a staging-only floating debug console (🐞 button,
gated identically to the staging banner) that surfaces console output, uncaught errors, and every
fetch call with status/timing — built because staging showed 0 evidence on a mobile device with
nothing on screen to explain why, most likely a silently-swallowed fetch failure rather than an actual
DB problem. Full decisions (WB CTA button routing, "Smoking Gun" terminology flagged as legally-loaded
but deferred, not fixed) and lessons (merge `staging` into a long-lived parallel branch before opening
its PR, or the diff reverts everything already landed) in Claude's memory:
`gf-homepage-magazine-redesign`.

**Not yet done:** the original mobile "0 evidence" report was never actually diagnosed — the debug
console was built to make the *next* occurrence visible, but nobody has looked at it on the mobile
device that showed the problem yet. Do that next if it recurs.

### Arising from the classification work
2. **Thesis-support relation — not built.** *Does this evidence support thesis X, and which gap does
   it fill?* Must be a computed, re-runnable relation over (evidence, thesis) pairs, not a field: a
   thesis written later has to be able to claim evidence recorded earlier, and one record may support
   several theses differently. Scanning *for* a thesis is the same relation computed eagerly.
3. ~~**Only forensic diffs get classified.**~~ **✅ Done 2026-08-15.** The taxonomy moved to
   `src/lib/investigativeCategories.ts` and is now shared by `ForensicAgent` and `IntakeAgent`, so
   documents, articles and whistleblower uploads are classified on the same scale as page diffs. All
   six evidence-creation sites persist it. `UrlVersionDiff.investigativeCategories` added so manual
   promotion via `/forensics/promote` carries the classification instead of re-running the agent —
   that path also still carried the hardcoded intent assertion, now replaced by the shared
   `forensicTierReasoning()`. Migration `20260815020000_diff_investigative_categories` applied.
4. **Re-tune verification.** The `ForensicAgent` prompt moved from recall-biased to
   precision-biased in one step, unmeasured. Once staging has real scans, check the hit rate against
   URLs you have manually reviewed — the risk now runs the other way, toward missing real changes.

### Shipped on a branch, NOT merged
5. **`feat/investigative-classification`** — 3 commits, pushed. `master` auto-deploys to Railway
   production, so merging is a deliberate deployment decision.

   **All four migrations are already applied to production**, so a merge ships code only. But the
   branch contains **breaking API changes** that the deployed frontend does not yet expect, so
   backend and frontend must go out together:
   - Every evidence-returning endpoint and MCP tool now returns `investigativeCategories: string[]`
     instead of `category: string` (`searchEvidence`, `suggestThesis`, `getFigureDossier`,
     `getResearchAgenda`, `createEvidenceFromText`, `createEvidenceFromUrl`, plus the REST evidence,
     figures, timeline and thesis routes).
   - `POST /api/arguments/generate` takes `concern` (an investigative category) instead of
     `category`, with entirely different accepted values.
   - `GET /api/evidence/stats` → `byCategory` is keyed by the seven concerns, and **counts overlap**:
     a record advancing two concerns is counted under both, so the sum exceeds `total`.
   - `POST /api/evidence/confirm` accepts `investigativeCategories: string[]`.

6. **Verify the deployed MCP clients.** Any external consumer reading `category` off a GF MCP tool
   result breaks on merge. Unknown whether any exist outside this repo.

### Housekeeping
7. **`apps/glass-fortress/backend/render.yaml` is dead config.** Superseded by Railway + `nixpacks.toml`.
   Still references `PINECONE_API_KEY` / `PINECONE_INDEX` (nothing reads them) and an Arbitrum Sepolia
   RPC, though the target is now Base mainnet. Delete unless Render is still a fallback.
8. **`prisma db push` is retired.** The schema now has migration history and a `migration_lock.toml`.
   Every future change goes through `prisma migrate dev` / `migrate deploy`, or prod and staging drift
   again.

## 10. Out of scope

- Bronze Fortress staging
- Preview-per-pull-request environments
- A separate third "demo" environment
- Custom domain for staging (Railway-generated URL is sufficient; revisit if you want to leave
  journalists a memorable link)
- Blockchain anchoring on staging — remains disabled until mainnet deploy
