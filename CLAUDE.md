# Glass Fortress — Claude Instructions

## Communication Style

### Claude's Take
When you have insights, recommendations, or opinions beyond just executing the task, mark them with:

> **💡 Claude's Take:** ...

This allows the user to quickly spot and skip (or engage with) unsolicited opinions.

### General
- Be concise. Lead with the answer or action.
- Do not recap what the user said — just do it.

## Guided Execution — show the prompt, then run it

**When walking a multi-step MCP flow (the thesis walk, a tutorial chapter, any sequence of tool calls
against real data), do not chain the steps. For each step:**

1. **Show the exact prompt/tool call you are about to make**, and what it will change.
2. **Wait.** The user approves it, or tells you to amend it.
3. **Execute only what was approved**, then report what actually happened before proposing the next.

**Why this exists:** the staging thesis walk had steps repeated because bugs were found and fixed
mid-flow. A step executed before it was read is a step that has to be redone once the flow changes
under it — and on a flow that writes evidence, redoing is not free.

It also puts the researcher's judgement where it belongs. The framing question, the tier, what a
thesis claims — these are the researcher's calls, and a prompt they never saw is a call they never
made.

**This is not the same as the irreversibility warning.** That one covers permanent writes. This covers
*every* step in a guided flow, including harmless reads, because the value is the user seeing the
sequence rather than being protected from any one call.

**Do not batch approvals.** "Approve steps 3-7" defeats it: the point is that step 4 is written after
step 3's result is known.

## Code Quality Standard
Above all else, code must be clean and written to the highest standards:
- Every change must leave the codebase in a better or equal state — never worse.
- Eliminate systematic risks proactively: if a pattern could silently fail in production (e.g. schema fields being dropped, type unsafety, unhandled edge cases), add a guard or test for it, not just a fix for the immediate symptom.
- No dead code, no commented-out blocks, no `any` escape hatches.
- If a test was wrong (not the code), fix the test — never weaken assertions to make tests pass.
- **Always choose the clean solution, never the easy one.** Do not keep a compromised design because
  unwinding it is inconvenient. When the clean solution is expensive because live data would need
  migrating, do not quietly pick the easy option and do not silently do the expensive one — state the
  trade-off and discuss it first.

## Code Conventions
- TypeScript: strict mode, no `any`, zod validation for all LLM outputs
- No `.js` extensions on backend imports (CommonJS + ts-node-dev)
- Tests: Jest for TS, Forge for Solidity. Always run tests after changes.
- Never skip hooks (`--no-verify`) — fix the underlying issue instead.

## Memory & Continuity

### `CHECKPOINT` — the save-everything code word
When the user writes **`CHECKPOINT`**, they are about to close the session and want all session
knowledge persisted. Treat it as a command, not a question — do not ask what to save. Sweep for:
decisions and their reasoning, gaps/bugs found but not fixed, architectural rules established, user
corrections and preferences, blocked items and what unblocks them, and the state of work in progress
(branch, test counts, what is already applied to production).

Write each to the right place:
- **Memory files** — reasoning, preferences, decisions, blockers (one fact per file).
- **`MEMORY.md`** — index pointer per memory + a current Next Session Priorities list.
- **Repo docs in git** (`docs/*-dev-plan.md`, `docs/phases/`, `COMPLIANCE.md`) — anything a future
  contributor would need. If it belongs to the project rather than to Claude's memory of it, it goes
  in git.

Then report exactly what was written and where, and name anything deliberately not saved.

`CHECKPOINT` is a backstop, not the mechanism: persist at natural boundaries — phase complete,
significant decision, bug found and deferred — **without being asked**, so `CHECKPOINT` usually finds
little left to do.

## Branching & Deployment Protocol

**Branches**
| Branch | Role | Deploys to |
|---|---|---|
| `master` | production | Railway `production` — GF + BF, 4 services |
| `staging` | integration + testing | Railway `staging` — GF only, 2 services |
| feature branches | all work starts here | nothing |

**The flow is: feature branch → PR → `staging` → (explicit approval) → `master`.**

1. **Never commit directly to `master` or `staging`.** Create a feature branch.
2. Open a **pull request against `staging`**. Merge it there once green.
3. Test on the staging environment — it runs against the **staging** Supabase project, not
   production. Project refs and connection details live in `.env.staging` (gitignored), never here:
   this repo is public.
4. **Merging `staging` → `master` requires specific, explicit approval from the user, every time.**
   It is a production deployment. Never merge to `master` on your own initiative, and never treat
   general permission to commit or push as permission to deploy. Ask, and wait for a clear yes.

Local `.env` points at the **staging** database. Production credentials are preserved in
`.env.production.local` (gitignored) — restore them only for a deliberate production query.

### Git keywords — Claude executes all git commands

The user does not run git. These uppercase keywords are commands; act on them without asking what
they mean or what to include.

| Keyword | Action |
|---|---|
| `COMMIT` | Stage the relevant changes, write the message, commit, push. **If on `master` or `staging`, create a feature branch first** — the protocol must not be violated by accident. |
| `PR` | Push and open a pull request against `staging`, or update the existing one. |
| `LAND` | Merge the open PR into `staging`, delete the branch, confirm the staging deploy is green. |
| `SHIP` | Merge `staging` → `master`. **This is a production deploy and the keyword is the approval** — do not ask again, but do print what is about to deploy. |
| `SYNC` | Fetch, bring `staging` up to date with `master`, update the current branch. |

**Refuse to execute, and say why, when:**
- `COMMIT` — nothing staged-worthy, or the diff contains anything secret-shaped (keys, tokens,
  connection strings, project refs). This repo is **public**.
- `PR` / `LAND` — tests are failing, or the PR is not mergeable.
- `SHIP` — tests not green, uncommitted changes present, staging's latest deploy is not `SUCCESS`,
  `staging` is not ahead of `master`, or anything secret-shaped is in the diff.

Report what was actually done — branch names, commit SHAs, PR numbers, deploy status — never just
"done". If a git command fails, say so plainly; never let a shell chain report success for a failed
push.

## Schema Migrations Deploy Themselves

Migration SQL lives in git — `apps/glass-fortress/backend/prisma/migrations/<timestamp>_<name>/migration.sql`,
one folder per migration, reviewed in the PR alongside the code that needs it. **Never apply a migration
by hand.**

`apps/glass-fortress/backend/railway.json` declares a **pre-deploy step**
(`npm run db:deploy --workspace=glass-fortress-backend` → `prisma migrate deploy`) that runs after the
build and *before* the new version starts serving.

**It only takes effect if the service's "Railway Config File" path points at that file.** These
services have **no Root Directory set** — they build from the repo root with `--workspace` commands —
so Railway does not find a config file on its own, and a repo-root `railway.json` would wrongly apply
GF's migration step to Bronze Fortress and the frontends too. The path must be set per service, per
environment, in the dashboard. So the order is guaranteed by the platform
rather than by remembering:

```
push → build → migrate deploy → new version goes live
```

Two properties make this safe, and both matter:

- **`migrate deploy` only applies committed migration files.** It never auto-diffs the live database
  against `schema.prisma`, so it cannot propose dropping something that exists but isn't modelled —
  the failure mode that nearly destroyed `evidence_embeddings` and that `migrate dev` invites.
- **If the migration fails, the deploy aborts and the previous version keeps serving.** A broken
  migration becomes a failed deploy, not a live site talking to a half-migrated database.

It also removes the reason anyone needed production database credentials on a laptop. That manual step
was the real weakness: it is why production drifted 11 migrations behind, and it is the same class of
access that wiped staging. **Prefer changing the deploy pipeline over acquiring the credential.**

The `prisma` CLI is therefore a **dependency, not a devDependency** — a pre-deploy step cannot rely on
packages that may be pruned from the deploy container. Do not move it back.

Manual `migrate deploy` remains correct in exactly one situation: an environment whose ledger is
damaged, or a one-off repair, done under the cleanup-session protocol below.

## Operational scripts are COMPILED, not interpreted

`apps/glass-fortress/backend/scripts/*.ts` compile into `dist/scripts/*.js` and every npm entry runs
them with plain `node`. **They therefore require `npm run build` first** — locally, and in a deploy
container where the build has already run.

This replaced `ts-node --transpile-only scripts/X.ts`, which could not run in a deploy container at
all: `tsconfig` included only `src/**/*`, `ts-node` was not a dependency of this workspace (it
resolved by hoisting from the monorepo root), and `typescript` is a devDependency that deploy
containers prune. Nine scripts were affected, `db:simulate` among them — a rule mandating a tool the
environment cannot execute is not a control, it is an assumption.

Running compiled output is preferred over moving `ts-node` into `dependencies`: it ships no compiler
to production and it type-checks the scripts at build time. That checking is not theoretical —
including `scripts/` in `tsconfig` immediately caught `forensics:trajectories` importing
`computeClaimTrajectories`, an export that had been renamed to `getClaimTrajectories`. That script had
been broken for as long as nothing compiled it.

`npm run dev` still uses `ts-node-dev`, which is fine: it is local-only and never runs in a container.

**`npm run lint` still covers `src/` only.** `scripts/` now compiles and type-checks but is not
linted; extending it means fixing ~70 pre-existing errors, which is its own change.

## On-chain writes go through MCP. Always.

**Any operation that registers evidence on-chain — `promote_scan_findings`, `promote_evidence`, any
path reaching `registerEvidenceOnChain` — must run through the MCP tools against the deployed
service. Never from a local script, and never with `.env.production.local` loaded.**

The reason is not preference. `.env.production.local` was once found holding a wrong
`EVIDENCE_REGISTRY_ADDRESS`: `0x5FbDB2315678afecb367f032d93F642f64180aa3`, the standard Hardhat/Anvil
first-deployment address, with **no contract at it on Base** (`eth_getCode` returns `0x`). Production's
real registry is `0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22`, confirmed by reading an existing
anchoring transaction off chain 8453.

**Checked 2026-08-27: the file currently defines no `EVIDENCE_REGISTRY_ADDRESS` at all** — absent, not
wrong. **The rule survives that anyway, and this is why:** the file is gitignored and can change without
notice, so a session must not depend on having checked its contents once. The hazard is a state the file
can return to at any time, and the cost of it returning unnoticed is permanent false `CONFIRMED`
evidence on Base mainnet. Verify what a tool can actually reach; never carry forward a belief about a
file you cannot see in git.

**The failure mode is silent and produces false evidence.** A transaction sent to an address with no
code does not revert — it succeeds as a plain transfer and returns a perfectly valid `txHash`. The
promotion path would then mark the record `CONFIRMED` and store that hash as proof of anchoring. The
result is an evidence record whose chain of custody is fabricated: a real transaction, a real hash,
anchoring nothing. That is the same fake-CONFIRMED class as the 2026-08-20 audit, manufactured fresh.

**The split is RESEARCH ACT versus MAINTENANCE ACT, not chain-write versus not.** The rule above names
research acts — `promote_evidence`, `promote_scan_findings`, anything where a researcher decides that a
record becomes evidence. A **maintenance** pass that happens to write to the chain — a re-anchoring
sweep, a repair that registers a hash the corpus already claims — runs in the deploy container via
`railway ssh`, never MCP and never a laptop, exactly as every other operational script does.

That is not a loophole in the rule; it is the rule's own reasoning applied. The hazard was a LAPTOP
with a partial env file silently mixing production's database with staging's chain. A deploy container
cannot do that — Railway supplies every variable or none — so the container is the *safest* place for a
maintenance chain write, and the researcher's standing rule already says maintenance tools do not
belong on the MCP surface. `docs/gf-factual-layer-rebuild-dev-plan.md` rules the same way for
`forensics:recover-captures`.

Reads are unaffected — verifying, planning and measuring against production locally is fine and is
covered by the rule below. The line is the chain write.

`check_on_chain_status` is the check that catches it either way: it compares what the database claims
against what the contract actually holds. Call it after any promotion.

## Operational scripts run ONLY inside a deployment — every environment, no exceptions

**Never run an operational script from a laptop against staging or production.** Not with
`.env.production.local`, not with `.env`, not with `railway run`. The only invocation is:

```bash
railway ssh --environment production --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:audit-anchors -- --env production"
```

**The environment is stated TWICE on purpose** — once to Railway, telling it where to connect, and once
to the script, declaring what the operator believes. `--env` is required; omitting it is a refusal.

`--environment` is still a human assertion, exactly as `.env.production.local` was, and a typo still
sends you somewhere you didn't mean. What changed is that a single wrong assertion is now **detectable**,
because the container independently knows four other things about itself:

| voice | production | staging |
|---|---|---|
| `RAILWAY_ENVIRONMENT_NAME` | `production` | `staging` |
| `APP_ENV`, pinned to its database | unset → production | `staging` |
| `DATABASE_URL`'s project ref | production's ref | staging's ref |
| chain id, read from the RPC | 8453 | 84532 |

`assertOperationalContext` (`src/lib/operationalContext.ts`) compares all four against `--env` and
refuses on any disagreement, reporting *every* one rather than the first. To defeat that you would
have to make the *same* mistake twice, in two different places, consistently.

**A fifth, content-derived axis was considered and deliberately rejected.** An earlier draft listed a
`TrackedUrl` id known to one environment and not the other. Environment identity derived from CONTENT
is exactly what `environmentIdentity.ts` was written to replace — first "production holds 7 evidence
records", which broke the moment production gained an eighth; then a hand-maintained `fileHash` in a
markdown handoff. A hand-maintained row id is the same shape, it rots when the row is legitimately
removed, and the four axes above already make a wrong `--env` detectable. The rule is: **configuration
and chain, never corpus.**

The chain axis is required for **every** script, including ones that never touch a chain. A per-script
"does this one need it?" flag would be one rule with twenty implementations — this repository's
dominant defect shape — and the script that got the flag wrong would be the one that needed it. The
cost is that an RPC outage refuses an unrelated script, loudly and with a message saying so.

**That is the property the old rule lacked, and it is not merely "more checks".** The old failure was
*incoherent* — production's database with staging's chain, a state no flag described, each half
internally valid, undetectable by any single axis. A wrong `--environment` is *coherent*: everything
arrives from one place, so every axis agrees with every other and disagrees only with the operator.
Coherent-and-wrong is catchable. Incoherent-and-confident is not.

Name the service every time too — the CLI context has silently reset to staging with no service linked.

Three properties follow from *where* the command runs, none of which anyone has to remember:

- **The environment is whole.** Railway supplies every variable or none, so the database and the chain
  cannot come from different environments.
- **The code is landed.** The container is built from `master`, so *fix real data with landed code only*
  stops being a rule and becomes a fact about the runner.
- **The runner is identifiable.** `RAILWAY_GIT_COMMIT_SHA` names the exact commit, so an operational
  write can record what produced it.

### Enforced, not requested

`RAILWAY_DEPLOYMENT_ID` is set **only inside a running deployment** — absent locally and absent under
`railway run`. Every operational script refuses without it:

```
Operational scripts run only inside a deployment.
  railway ssh --environment <env> --service <service> "cd apps/glass-fortress/backend && npm run <script>"
```

**`runOperationalScript` is the only entry point**, and it takes the script's body as a value — so the
body cannot run before the context is asserted. There is no ordering to get wrong and nothing to opt
out of; a source scan (`test/operationalScriptsGuarded.test.ts`) holds that no script invents a second
way in, and that no `src/` module imports the guard. This does not apply to `npm run dev` or to tests,
which never touch an operational path.

> **`railway ssh` propagates the remote exit code faithfully — but a pipe inside the remote command
> throws it away.** `… "npm run x | tail"` returns `0` whatever `x` did. When the exit code is the
> gate, capture first and filter afterwards. This cost three false green readings in one session.

### The rule this replaces was falsified on 2026-08-29, and the reason matters

The previous rule authorised local production runs via `.env.production.local`, requiring only that the
environment be confirmed BY DATA first. That check was performed on every run, correctly, and was **not
enough** — because it confirmed one axis and the failure was on another.

`.env.production.local` defines `DATABASE_URL` and **no chain variables at all**. `dotenv` never
overrides a variable that is already set, so loading it pinned the database to production and the
application's own `.env` then filled the chain gaps from **staging**. A `forensics:backfill-anchor-checks`
run therefore read production's database and Base **Sepolia's** registry, reported 90 `VERIFIED` and one
`CONTRADICTED` with complete confidence, and wrote 91 integrity verdicts into production that do not
mean what they say — including Sepolia registry indices stored as though they were mainnet facts. No
evidence, snapshot or anchor was altered, and nothing was written to any chain; the damage was contained
to a table created that morning.

Three lessons, in order of what they cost:

- **Confirming the database is not confirming the environment.** Any script touching a database *and* a
  chain must confirm both, the way `get_environment` does. A confirmation line naming the axis you
  checked reads as proof about the axis you didn't.
- **A partial credential file is more dangerous than none.** The gaps are what get filled, silently, from
  whatever is loaded next. `.env.production.local` should not exist on a laptop.
- **Prefer removing the capability over forbidding its use** — the principle already stated above as
  *prefer changing the deploy pipeline over acquiring the credential*, which this section had been
  contradicting.

Chain **writes** remain MCP-only regardless, per the section above.

## Data Loss — Absolute Rules

**Data is never lost unintentionally. Not on staging, and NEVER on production.** This is not a
best-effort aspiration; it is the constraint every other convenience yields to. Staging data is real
work — scans, theses, evidence, real submissions — and re-creating it costs hours nobody planned to
spend. See `docs/gf-staging-data-loss-postmortem-2026-08-21.md` for what it cost once.

### Deleting data requires its own session

**Never clean a database mid-work.** Not "while we're in here", not "quickly before the next step".
A destructive database operation gets a **new, dedicated session** whose *sole stated purpose* is that
cleanup, because the failure mode being prevented is inattention, and attention is exactly what a
half-finished feature takes away.

That session must:

1. **State its purpose in its opening message** — this session exists to clean data, and nothing else.
2. **Name the environment explicitly** — STAGING or PRODUCTION, by project ref, not by assumption.
3. **Write the exact intended scope** to `.claude/DB_CLEANUP_SESSION` — which tables, which rows, which
   date range. This file is the gate key AND the written record of what was authorised.
4. **Make the user aware of the risk before anything runs**, in plain terms: what disappears, whether
   it is recoverable, and what it costs to rebuild.
5. **Do the cleanup and stop.** No feature work in a cleanup session, no cleanup in a feature session.

### Simulate before every destructive statement — no exceptions

```bash
railway ssh --environment <env> --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run db:simulate -- --env <env> '<the exact statement>'"
```

`db:simulate` is an operational script like any other: it runs **only inside a deployment**, and the
environment is stated twice. The `--env` flag is stripped from the statement before it is simulated —
without that it would be joined into the SQL, since this is the one script that reads its argument
positionally.

It runs the statement **for real** inside a transaction, measures what it destroys, and rolls back.
**One statement per run** — Prisma sends raw SQL as a single prepared statement, and the simulator
reports a multi-command input as `NOT SIMULATED` (exit 1), never as a measurement. Migration files
are not its input; they apply through `prisma migrate deploy` in the pipeline.
PostgreSQL has transactional DDL, so this works for `DROP` and `TRUNCATE` as well as `DELETE` — the
damage reported is **measured, not guessed**.

Then **announce the predicted outcome before executing**, in exactly these terms:

- **`⚠️ HIGH RISK OF DATA LOSS`** — N rows across these tables would be permanently lost. State N.
  Do not run it until the user confirms **that number** is what they intended.
- **`✅ LOW RISK`** — the statement ran in full and removed nothing.

The simulator exits `2` on high risk and `0` on low, so it can gate a script as well as a human.

A statement that has not been simulated does not get executed. If it cannot be simulated, that is
itself the finding — say so rather than proceeding on judgement.

### Commands that are blocked outright

`.claude/hooks/guard-destructive-db.sh` (a `PreToolUse` hook) **denies** these unless
`.claude/DB_CLEANUP_SESSION` exists, and downgrades them to an explicit confirmation prompt when it
does:

`DROP SCHEMA` · `DROP DATABASE` · `DROP TABLE` · `TRUNCATE` · `DELETE FROM` · `deleteMany` ·
`prisma db push` · `prisma migrate reset` · `prisma migrate dev` · `--force-reset` ·
`--accept-data-loss`

**`prisma db push` is on that list for a specific reason**: with `--force-reset` it issues
`DROP SCHEMA "public" CASCADE` and rebuilds from `schema.prisma`, destroying every row *and* the
migration ledger, while reporting nothing alarming. It is what caused the 2026-08-21 wipe. It must
never run against staging or production, with or without flags — it bypasses the migration history
that makes an environment reproducible.

The guard **fails open** on internal error, by design: a broken hook must not wedge the session. It is
a net under the rules above, never a substitute for them.

#### It matches statement text ANYWHERE in a Bash command, including prose

Writing documentation, tests, or commit messages that *discuss* `DROP TABLE` / `TRUNCATE` /
`DELETE FROM` will be blocked. This cost four blocks in one session — a code comment, a test string, a
plan paragraph, and a commit message — and diagnosing it from the refusal text is not obvious, because
the command genuinely does contain the words.

**Use the `Write` tool rather than a heredoc, and `git commit -F <file>` rather than `-m`, for anything
that names a destructive statement.**

Failing closed is correct here and the pattern should not be loosened: a guard that tried to tell prose
from intent would be a guard with a bypass in it.

### Why a rule alone was not enough

The migration rules below landed *hours before* the 2026-08-21 wipe and did not prevent it. They named
`migrate dev`; the wipe came via `DROP SCHEMA`/`db push`. And `db:check-drift` reported **"No difference
detected"** on a database that had just lost everything — it compares *structure*, not *contents*.

Hence: a gate that blocks, a simulator that measures, and a session protocol that keeps destructive
work away from distracted attention. Structure being fine and data being fine are **different
questions** — never let one answer stand in for the other.

## Database Migrations (Glass Fortress backend)

`apps/glass-fortress/backend`'s `schema.prisma` and the live DB can drift silently — this has already
happened once (`evidence_embeddings`, a pgvector table reachable only via raw SQL, went unmodeled for
months until a 2026-08-20 fix added it as an `Unsupported()` model). Prevent a repeat:

- **Never run `prisma migrate dev`** (interactive or `--create-only`) against this project. Its auto-diff
  compares the live DB against `schema.prisma` and will propose dropping anything real that isn't
  modeled — including tables created intentionally via raw SQL for types Prisma can't express natively
  (e.g. pgvector's `vector` type). It has no way to know a raw-SQL object is deliberate.
- **Before writing any new migration**, run `npm run db:check-drift` (in
  `apps/glass-fortress/backend`). It must report "No difference detected." If it reports *anything* —
  even something that looks unrelated to what you're about to change — stop and investigate before
  writing migration SQL; do not assume it's fine to proceed alongside pre-existing drift.
- **To apply a migration**, hand-write the SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`
  scoped to only the intended change, then apply with `prisma migrate deploy` (applies pending migration
  files directly — no auto-diff, so no drop risk). Verify post-apply via `information_schema.columns` or
  an equivalent read-only check.
- **Any object created via raw SQL** (a type Prisma can't model, a DB function, an extension) must also
  get a corresponding `Unsupported("...")` model (with `@@map` to the real table name) in `schema.prisma`
  in the same change, even though Prisma Client can never query it. Skipping this is exactly how
  `evidence_embeddings` went unmodeled in the first place.
- **Read what a generated migration actually says before applying it.** A diff tool computing "the
  truth" from an incomplete model will confidently propose something false — that is how the
  `evidence_embeddings` drop nearly went through. Generating offline
  (`prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new> --script`) needs no
  database connection and is the safe way to produce one.

## Fix what future state needs. Do not invest in repairing legacy state.

**The test is: does this problem recur for state created from now on?** If yes, it is the work. If it
exists only because of rows already written, it is archaeology — record it honestly and move on.

Established 2026-08-30, after four consecutive runs and four landed commits spent trying to attribute
91 legacy anchoring transactions. Every one of those fixes was individually sound and none of them
touched a defect that could happen again:

| the problem | recurs for new state? |
|---|---|
| a transaction's receipt is beyond the RPC's retention horizon | **no** — a new capture's receipt is read seconds after the write, not eight days later |
| `onChainTxHash` says a row is anchored but not *what* was anchored | **no** — `anchoredHash` is written at write time |
| the audit asked "is this hash registered?" rather than "did THIS transaction register it?" | **no** — same fix |
| the log-lookup fallback | **it has no future caller at all** — it exists only to serve those 91 |

That last row is the tell. **An instrument built only to explain legacy rows is an instrument nothing
will call once they are superseded** — and validating it costs as much as building it did.

Nothing in `docs/gf-factual-layer-rebuild-dev-plan.md` asked for that work either. §1 says *"Keep the
existing corpus untouched as a comparison"* — and **comparison does not require attribution.** Keeping
the rows is the whole requirement; proving which transaction anchored each one serves no purpose the
plan names. Re-anchoring the legacy corpus is Level 10's, explicitly.

**The one carve-out, and it is narrow: legacy state that makes a FALSE CLAIM is not archaeology.** An
anchor attesting nothing, a `CONFIRMED` record with no registration, a published thesis containing a
claim the corpus contradicts — those are wrong *now*, in public, and correctness of a live claim is
future work by definition. The line is between a legacy row that is **unexplained** (record it,
supersede it later) and one that is **untrue** (fix it, or mark it so nobody relies on it).

That is why `TX_UNREADABLE` is the right ending for those 91: the anchors are real, the registry holds
every hash, and only the attribution is lost. Recording that as a terminal verdict is honest and costs
nothing. Chasing the attribution was the mistake.

## The two debt ratchets can contradict each other. `.at()` is the answer.

`no-unnecessary-condition` and the `noUncheckedIndexedAccess` ratchet disagree about reading an array
element, and between them they rule out both obvious spellings: `xs[0]` is an unguarded indexed
access, and a `!== undefined` guard on it is a condition the types say can never be false. The same
conflict has now been dodged three separate ways — `?? ''` in `appEnv.ts`, a restructure in
`measureClaimLength.ts`, and a length check in `confirmAnchors.ts`.

**Use `xs.at(0)`.** It is typed `T | undefined` unconditionally, so the guard is genuinely necessary
under both settings and neither linter objects. Neither ratchet is ever to be raised to resolve this.

The same shape appears with `!`: `non-nullable-type-assertion-style` asks for it and
`no-non-null-assertion` forbids it. There the answer is a **loud guard** that throws — the
`requireSnapshotIdentity` pattern — never a silent filter, because a subject quietly dropped from a
pass is a subject reported as nothing to check.

## Workflow
- Do not commit unless explicitly asked.
- Do not push unless explicitly asked.

## npm Installs (Frontend)
The global `~/.npmrc` routes all npm traffic through Wix's internal registry (`npm.dev.wixpress.com`), which requires Wix VPN. Direct access to `registry.npmjs.org` is also blocked by the corporate firewall (EBADF).
- **On VPN:** `npm install <pkg>` works as-is — Wix registry proxies public npm.
- **Off VPN:** Both registries fail. Cannot install packages without VPN.
