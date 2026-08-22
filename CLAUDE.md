# Glass Fortress — Claude Instructions

## Communication Style

### Claude's Take
When you have insights, recommendations, or opinions beyond just executing the task, mark them with:

> **💡 Claude's Take:** ...

This allows the user to quickly spot and skip (or engage with) unsolicited opinions.

### General
- Be concise. Lead with the answer or action.
- Do not recap what the user said — just do it.

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

## `REVIEW` — one adversarial review cycle

A command like `CHECKPOINT`, not a question. **One `REVIEW` runs exactly one cycle.** The user
decides whether there is another; Claude never decides that a change is done being reviewed.

That division exists because the obvious alternative is broken. A loop that runs "until a review
comes back clean" terminates on the first *shallow* review, and a review finding nothing is
ambiguous between good code and a reviewer that did not look. On 2026-08-22 a review of the
trajectory change verified five claims from the author's description and reported that all held;
a second pass over the same change read the diff and found three real defects, one of them a
coverage set leaking across tracked URLs. The first pass would have ended an automatic loop.

### What a cycle does

1. **Write the review request** in the format that works (playbook FINDING 32): every decision
   stated with its reasoning, what was kept separated from what was overturned, and an explicit
   list of what is **not** fixed so it cannot read as a completion certificate.

   The reviewer has *less* context than the author, not more — the reverse of the exchange that
   produced this format. So decisions must be stated as **defensible claims to attack**, never as
   questions about intent. "I decided X because Y — attack Y."

2. **Spawn the reviewer in an isolated worktree.** Never a shared checkout: two sessions in one
   working tree nearly saw one commit the other's uncommitted draft, and a reviewer running tests
   in a dirty tree gets results that are not about the change.

3. **Give it the request, the full diff, and this instruction**: *verify the description against
   the code and report where they disagree.* Without that sentence the reviewer reviews the
   description, which is how the shallow pass above happened.

   Give it the failure lenses this repo actually keeps hitting: mechanism right / summary wrong;
   keyed to a transition instead of to current state; a set that looks complete and is truncated;
   a classification that no longer matches what the tool does.

4. **Require stated coverage.** The reviewer reports what it examined *and what it could not
   verify*. A review that reports findings without stating scope is not a clean review, and must
   be reported as inconclusive rather than as passing.

5. **Report back interactively, then stop.** State: what was examined, what was not, each finding
   with Claude's own assessment, and which findings were **rejected and why**. Then say plainly
   that the cycle is complete and ask whether to run another. Recording rejections matters as much
   as recording fixes — without them a later cycle cannot tell a settled question from an
   unexamined one, the same reason a diff debate stores dissent instead of treating a sustained
   objection as a refusal.

### When it is worth invoking

Not "complex or sensitive" — too vague to act on. Invoke it when **a defect in this change would
be silent**: no test catches it, no type catches it, and it surfaces only when someone relies on
the wrong answer. Every defect this project has found by review rather than by running was of that
kind.

### Refuse to run, and say why, when

- there is nothing to review — clean tree and no branch diff;
- **another session's uncommitted work is in the tree** — authorship cannot be separated and the
  reviewer would be handed someone else's change;
- tests are currently failing — that reviews the breakage, not the change.

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
cd apps/glass-fortress/backend
npm run db:simulate -- '<the exact statement>'
```

It runs the statement **for real** inside a transaction, measures what it destroys, and rolls back.
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

## Workflow
- Do not commit unless explicitly asked.
- Do not push unless explicitly asked.

## npm Installs (Frontend)
The global `~/.npmrc` routes all npm traffic through Wix's internal registry (`npm.dev.wixpress.com`), which requires Wix VPN. Direct access to `registry.npmjs.org` is also blocked by the corporate firewall (EBADF).
- **On VPN:** `npm install <pkg>` works as-is — Wix registry proxies public npm.
- **Off VPN:** Both registries fail. Cannot install packages without VPN.
