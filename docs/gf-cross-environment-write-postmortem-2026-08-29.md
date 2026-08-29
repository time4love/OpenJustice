# Postmortem — the cross-environment write, 2026-08-29

A local operational run read **production's database** and **staging's chain**, and wrote 91 integrity
verdicts into production that do not mean what they say: 90 `VERIFIED` computed against Base Sepolia,
and one `CONTRADICTED` against the corpus's strongest record, which production's own service disproves.

No evidence, snapshot, capture or tracked URL was altered — verified byte-identical against a
before-state captured that morning — and nothing was written to any chain. The damage was confined to
`IntegrityCheck`, a table created hours earlier that nothing consumed yet.

**Status: closed.** `master == staging == a790c0b`. Both environments verified by data; the 91 rows are
preserved, superseded, and countable.

---

## 1. Mechanism

`.env.production.local` defined `DATABASE_URL` and **no chain variables at all**. `dotenv` never
overrides an already-set variable, so loading it pinned the database to production and the
application's own `.env` then filled the chain gaps from **staging**.

Two internally valid halves, one invalid whole, no error, full confidence.

**The database was confirmed BY DATA on every run**, correctly, and the run refused when it did not
match. That check was right and it was irrelevant: it confirmed one axis while the failure was on
another. *A confirmation line naming the axis you checked reads as proof about the axis you didn't.*

**The machinery to catch it already existed and was never called.** `environmentIdentity.ts` emits:

> CONTRADICTION: this deployment calls itself 'production', which anchors to chain 8453, but its RPC
> reports chain 84532.

With `APP_ENV` unset the run self-declared as production, so that message would have printed verbatim,
with the correct diagnosis, before a single row was written. **The defect was an uncalled check, not a
missing one.**

## 2. Why the previous rule was insufficient

The rule in force authorised local production runs via `.env.production.local`, requiring only that the
environment be confirmed by data first. It was followed. It was not enough.

Three lessons, in order of what they cost:

- **Confirming the database is not confirming the environment.** Any script touching a database *and* a
  chain must confirm both, the way `get_environment` does.
- **A partial credential file is more dangerous than none.** The gaps are what get filled, silently,
  from whatever is loaded next.
- **Prefer removing the capability over forbidding its use.** `.env.production.local` should not exist
  on a laptop, and no longer does.

## 3. What changed in code

### 3.1 The environment arrives whole, or nothing runs

`RAILWAY_DEPLOYMENT_ID` is set **only inside a running deployment** — absent locally and absent under
`railway run`. `src/lib/operationalContext.ts` refuses without it. Railway supplies every variable of an
environment or none, so the database and the chain can no longer come from different places, and there
is no partial credential file left for `dotenv` to fill the gaps around.

Two further properties follow from *where* the command runs, which nobody has to remember: the container
is built from `master`, so *fix real data with landed code only* becomes an attribute of the runner
rather than a rule; and `RAILWAY_GIT_COMMIT_SHA` names the commit, so an operational write records what
produced it.

### 3.2 The environment is stated twice, and cross-examined

`railway ssh --environment X` is a human assertion exactly as `.env.production.local` was, and a typo
still connects you somewhere you did not mean. So every operational script also takes a required
`--env`, cross-checked against four things the container independently knows about itself:

| voice | production | staging |
|---|---|---|
| `RAILWAY_ENVIRONMENT_NAME` | `production` | `staging` |
| `APP_ENV`, pinned to its database | unset → production | `staging` |
| `DATABASE_URL`'s project ref | production's ref | staging's ref |
| chain id, read from the RPC | 8453 | 84532 |

Every disagreement is reported, not just the first.

**Why this is more than "more checks."** The old failure was *incoherent* — production's database with
staging's chain, a state no flag described, each half internally valid, undetectable on any single axis.
A wrong `--environment` is *coherent*: everything arrives from one place, so every axis agrees with every
other and disagrees only with the operator. **Coherent-and-wrong is catchable; incoherent-and-confident
is not.**

**A fifth, content-derived axis was considered and rejected.** An earlier draft listed a `TrackedUrl` id
known to one environment. Environment identity derived from CONTENT is what `environmentIdentity.ts` was
written to replace — first "production holds 7 evidence records", which broke the moment production
gained an eighth; then a hand-maintained `fileHash` in a markdown handoff. A hand-maintained row id is
the same shape and rots when the row is legitimately removed. The rule is **configuration and chain,
never corpus.**

The chain axis is required for **every** script, including ones that never touch a chain. A per-script
"does this one need it?" flag would be one rule with twenty implementations — this repository's dominant
defect shape — and the script that got the flag wrong would be the one that needed it.

### 3.3 The guard cannot be bypassed by forgetting it

`runOperationalScript` takes the script's body **as a value**, so the body cannot execute before the
context is asserted. There is no ordering to get wrong and nothing to opt out of. `test/operationalScriptsGuarded.test.ts`
holds that no script invents a second way in, and that no `src/` module imports the guard — which is what
keeps `npm run dev` and the test suite out of it.

### 3.4 A verdict names the registry it asked

`IntegrityCheck` gained `chainId` and `registryAddress` (migration `20260829160000`). `auditOnChainAnchors`
reads a missing or mismatched chain as a third `STALE` axis, beside rule-moved and claim-moved.

**The stamp comes off the OBSERVATION, never off configuration.** In the incident the deployment believed
it was production while its RPC was Sepolia; stamping the belief would have written `8453` onto rows read
off `84532` and made them indistinguishable a second time — with a provenance field vouching for the wrong
answer. A provenance value that can be derived from configuration is not provenance.

## 4. The cleanup, and why its order was load-bearing

**The 91 rows were kept, not deleted.** This project's own argument for storing a contradiction rather than
refusing it is that refusing would delete the evidence the pipeline is wrong — and these rows are that
evidence.

1. Add the columns. Additive; existing rows get `NULL`.
2. **Define a NULL chain as NOT A PASS.** Without this the column lands and the 91 rows keep counting as
   `VERIFIED`, which is the same failure one layer up.
3. Re-run the backfill in-container.
4. Verify by data.

**Never step 3 before step 1.** That writes 91 correct rows indistinguishable from 91 wrong ones, and then
they cannot be told apart even in principle.

## 5. Final state — measured, not argued

| | subjects | VERIFIED | STALE | checks | superseded | not naming their chain |
|---|---|---|---|---|---|---|
| production | 91 | 91 | 0 | 182 | 91 | 91 |
| staging | 113 | 113 | 0 | 226 | 113 | 113 |

The last claim to be closed was the one that looked safest. Every state the audit reports reads the
**newest check per subject**, so a corpus whose old checks were *replaced* and one whose old checks were
*superseded* are identical from up there. "The 91 are still there" rested on the table being append-only:
true, and an **argument** rather than a **measurement** — the same substitution that once let
`db:check-drift` report *"No difference detected"* about a database that had just lost every row.

PR #228 added the three counts above. Computing them over the newest row per subject instead of over the
whole table reads **zero exactly when the count starts to mean something**, and a reader would take that
zero as proof the incident had been cleaned *away* rather than recorded.

## 6. A related fail-open, found in the same sweep

`requireStagingAccess` gated the staging API only when `APP_ENV=staging`, and unset means production. So
losing one variable on the staging deployment removed the gate silently and left the public Railway URL
open — the exact hole the middleware exists to close. **Absence is safe for a LABEL and unsafe for a
GATE**, and one variable was doing both jobs.

Fixed two ways that do not depend on each other: the process refuses to **boot** when a recognised project
ref names a different environment than the label, and the **gate** applies unless both voices say
production. The asymmetry is deliberate — "staging, unlabelled" is a hole and is gated; "production,
unrecognised ref" is an outage and is not.

## 7. Known and deliberately not done

- **Ten `UrlVersionDiff` rows read `UNRECORDED`** for classification input provenance. Nothing in the data
  separates them from other pre-column rows, and backfilling `diffInputVersion` into
  `classifiedInputVersion` would assert exactly the pairing those rows were caught asserting falsely.
  Re-classifying is a research decision, not a repair.
- **Supabase project refs are committed to this public repository** — `src/lib/dbEnvironment.ts`,
  `scripts/verifyMigrations.js` and two test files. This contradicts `CLAUDE.md`. Pre-existing; it deserves
  its own change. `dbEnvironment.ts` now exports the map so nothing else needs to copy them.
- **The production database password was printed into a session transcript on 2026-08-29** and should be
  rotated.

## 8. See also

- `CLAUDE.md` — *Operational scripts run ONLY inside a deployment*
- `docs/gf-staging-data-loss-postmortem-2026-08-21.md` — the earlier incident whose lesson ("a rule alone
  was not enough") this one repeats on a different axis
