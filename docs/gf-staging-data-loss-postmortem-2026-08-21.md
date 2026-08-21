# Post-mortem — Staging data loss, 2026-08-21

**Status:** cause identified with high confidence; actor and timestamp NOT established.
**Impact:** all Glass Fortress staging application data destroyed. Schema intact. Production untouched.
**Written by:** Claude, at the user's request, from direct database forensics.

---

## 1. What was lost

Every row in every table of staging's `public` schema (project `elwsznbcfmbmkldpntae`):

| Table | Rows now | Known contents before |
|---|---|---|
| `Evidence` | 0 | 2 URL-based evidence records |
| `Thesis` | 0 | 1 thesis |
| `TrackedUrl` / `UrlVersionDiff` | 0 | 1 scanned URL history, the thesis's basis |
| `Report` + both domain tables | 0 | 1 medical adverse-outcome report (the 2026-08-20 end-to-end test) |
| `Researcher` | 0 | the project's researcher account |
| all others (20 tables total) | 0 | — |

**Survived:** `auth.users` (1 row — the owner's account). The `auth` schema was untouched, which is why
login still works even though the `Researcher` row that login maps to is gone.

**Not affected:** production (`fqmczumacfbunffgodlo`). Verified separately — this was scoped to one
project.

---

## 2. Cause

A single statement, recovered from `pg_stat_statements` on the staging database:

```
DROP SCHEMA "public" CASCADE      -- 1 call, role: postgres
```

This is the only statement in the buffer capable of destroying everything at once, and it explains
every observation, including the two that a simple "someone deleted the rows" theory cannot:

- **`_prisma_migrations` no longer exists at all** — not empty, *dropped*. `to_regclass` returns null.
  A `DELETE`/`TRUNCATE` cannot do that; a `DROP SCHEMA … CASCADE` does it by definition.
- **`auth.users` survived.** The drop was scoped to `public`, so the `auth` schema was never in range.

### 2.1 What most likely issued it

**`prisma db push --force-reset`, or a manual `DROP SCHEMA` followed by `prisma db push`.**

`db push --force-reset` issues exactly this statement and then recreates tables *from `schema.prisma`*,
which fits every remaining fact:

| Observation | Explained by `db push` |
|---|---|
| 20 tables exist and are empty | recreated from the schema, with no data |
| `npm run db:check-drift` reports "No difference detected" | true by construction — the tables *were* built from that schema |
| `_prisma_migrations` absent | `db push` never writes the ledger; only `migrate deploy` does |
| Newest columns present (`vaccinationStatus`, `employmentSector`, `remedyPursued`, `relationshipAffected`, `occurredDuring`) | they are in `schema.prisma`, so a push creates them regardless of migration history |

**Ruled out — `prisma migrate reset`.** It also drops the schema, but then *replays the migrations*,
which would have rebuilt `_prisma_migrations` with 19 rows. The ledger is gone, so this was not a
completed `migrate reset`.

---

## 3. What could not be established

Stated plainly, because the gaps matter more than the guesses:

- **When.** `pg_stat_statements` records call counts, not timestamps. Its buffer has been collecting
  since **2026-08-15 16:39 UTC**, so on that evidence alone the `DROP SCHEMA` could sit anywhere in a
  six-day window — including staging's original setup.

  One inference narrows it: `_prisma_migrations` was created once and received **19 inserts**, matching
  the 19 migrations, and it is now gone. So the drop happened *after* migrations had been applied and
  recorded — not during initial setup. That places it late, but does not date it.

- **Who.** The role is `postgres`. That is the same superuser used by the application's
  `DATABASE_URL`, by the Supabase SQL editor, and by any local Prisma CLI invocation. It does not
  discriminate between a person, a dashboard action, and a script.

- **From where.** Not recoverable from the database. **Supabase's own dashboard logs (Database →
  Logs) do carry timestamps and client information and would settle both questions.** That is the
  next step for anyone who wants certainty, and it must be done reasonably soon — those logs have a
  retention window.

---

## 4. Was it this session?

Audited directly against this session's transcript, because it is the obvious first question.

**Every database-mutating command run in this session:**

1. `prisma migrate deploy` — twice (`20260820090000_cancer_course_unknown`,
   `20260820100000_social_report_vaccination_status`). Both applied pending migration files. Neither
   drops anything.
2. One scoped delete, at the user's explicit request, of the single ambiguous social test report:
   `$transaction([report.delete({where:{id}}), socialEconomicImpactReport.delete({where:{id}})])` —
   two rows, by primary key.
3. `prisma generate`, `prisma validate`, `prisma format`, `prisma migrate diff` (offline),
   `prisma migrate status`, `npm run db:check-drift` — all read-only or local-file-only.

**Never run in this session:** `db push`, `migrate reset`, `migrate dev`, `TRUNCATE`, `DROP`.

Corroborating evidence that the loss came later: immediately after the scoped delete, this session
verified and printed `MEDICAL reports (must still be 1): 1` and `orphaned social domain rows: 0`. The
medical report was intact at that point and is gone now, so the destructive event happened afterwards.

That is not a claim that nothing in this session contributed — only that no command issued here is
capable of this, and the one deletion performed is accounted for row by row.

---

## 5. The live hazard this created

**Independent of cause, staging is now in a state that will break the next backend migration.**

`prisma migrate status` reports **all 19 migrations as "not yet applied"**, because the ledger that
recorded them was destroyed. The tables, however, already exist. So the next `prisma migrate deploy`
against staging will try to replay all 19 migrations onto a schema that already has their objects, and
fail — `CREATE TABLE … already exists` — possibly part-way, leaving a worse mess than the current one.

Mitigating for the moment: this project's Railway deploy does **not** run migrations. `build` is
`prisma generate && tsc`, `start` is `node dist/server.js`, and no run-command variable overrides that.
So a routine deploy will not trigger it. It is a trap waiting for the next person who writes a
migration — which, given the feature work in flight, is soon.

### 5.1 Remedy

Rebuild the ledger **without re-running any SQL**, marking each migration as already applied:

```bash
cd apps/glass-fortress/backend
for m in prisma/migrations/*/; do
  npx prisma migrate resolve --applied "$(basename "$m")"
done
npx prisma migrate status   # must then report: up to date
```

`migrate resolve --applied` only writes the ledger row; it does not execute the migration body. This is
the documented remedy for exactly this situation. **Do this before writing the next migration.**

Not done in this session: it is a write against a shared environment, following an unexplained
destructive event, and it should be a deliberate decision rather than a reflex.

---

## 6. What this says about the guard rails

The `db:check-drift` script and migration rules landed **hours before this** (PR #79) — and they would
not have prevented it. Worth being honest about why:

- The rules forbid `prisma migrate dev`. The statement here was `DROP SCHEMA … CASCADE`, which is what
  **`db push --force-reset`** issues. That command is not named in the rules.
- `db:check-drift` reports **"No difference detected"** right now, on a database that has just lost
  everything. It compares *structure*, not *contents*, so a wipe-and-rebuild is invisible to it. It is
  working exactly as designed and is still worth having — it simply does not answer this question.

**Recommended additions**, none of which are in place today:

1. Extend the CLAUDE.md rule to name `prisma db push` explicitly — `--force-reset` on any shared
   database, and `db push` at all against staging or production, since it bypasses the migration
   history that makes the environment reproducible.
2. A row-count check to sit beside the drift check, so "the schema is fine" and "the data is fine" stop
   being the same question.
3. Consider revoking or rotating broad `postgres` credentials for day-to-day use, so routine work
   cannot issue a `DROP SCHEMA` at all. This is the only change here that would have actually stopped
   it.

---

## 7. Recovery

- **Reports**: 1 medical test report, submitted by the owner. Reproducible in minutes through the
  intake form; nothing of research value lost.
- **Evidence / thesis / tracked URL**: 2 URL-based evidence records, 1 scanned URL history, 1 thesis
  derived from them. Re-creatable by re-running the intake and scan flows against the same URLs, which
  is also a genuine end-to-end exercise of those paths.
- **Researcher account**: must be re-registered. `auth.users` still holds the owner's account, so
  login works; the `Researcher` row is recreated through the handle-setup step at
  `/login?step=handle`. **Until that is done, `/reports/patterns` is unreachable** — it is
  researcher-gated and there are currently zero researchers.

No production data was involved, and no backup restore is required for anything above.
