# PENDING migration — a diff's two sides must be two different captures

**Status: WRITTEN, DELIBERATELY NOT IN `prisma/migrations/`. It cannot be applied yet.**

## Why it is not in the migrations directory

`prisma/migrations/` is not a place to park SQL. It **is** the apply mechanism: Railway's pre-deploy
step runs `prisma migrate deploy` before the new version serves, so a file placed there is applied on
the next deploy, not on the next decision.

This statement has a **data precondition** — it fails while any offending row exists — so filing it
under `prisma/migrations/` would not "write it without applying it". It would schedule a deploy to
abort. That class of migration has already aborted two production deploys, and here it would abort on
staging with certainty rather than probability.

So it lives here until the row it trips over is resolved, and then it moves — unchanged — into
`prisma/migrations/<timestamp>_diff_pair_is_two_captures/migration.sql`.

## The statement

```sql
ALTER TABLE "UrlVersionDiff"
  ADD CONSTRAINT "UrlVersionDiff_pair_is_two_captures"
  CHECK ("beforeSnapshotId" <> "afterSnapshotId");
```

Add the matching `@@check` or a raw-SQL note to `schema.prisma` in the same change, so the constraint
is modelled rather than existing only in the database — the `evidence_embeddings` rule.

## What blocks it

**One row on staging**, found by the rtmag scan on 2026-08-28:

```
trackedUrlId  82645fb7-2afd-4637-899a-f119546014d7
diffId        fe9684ea-aa9b-490c-bf2c-51dba989f2ed
beforeDate    2022-10-11   →   afterDate 2022-10-17
beforeSnapshotId == afterSnapshotId   (capture 20221011145743)
```

Production is **not** affected — it holds neither this tracked URL nor any self-paired row. Verify
before applying there rather than assuming, because the check is one query.

## Why the row cannot be repaired into validity

The 2022-10-17 capture was **deliberately not stored**. `recordCapture`'s novelty rule found it
text-identical to the 10-11 capture and returned the predecessor's id — the CDX index entry records it
as `UNCHANGED`, which is the correct outcome and not the defect. There is therefore **no correct
`afterSnapshotId` to point the row at**: the capture it would name does not exist, and pointing it at
the *next* stored capture would fabricate a transition across a boundary the scan never observed.

The row records a transition that never happened. It is an artifact of the diff path ignoring the
`UNCHANGED` outcome — fixed in this branch — and evidence of nothing except that bug.

## The decision, which is the researcher's

*Nothing is deleted, ever* is a project rule, and removing this row is a destructive database operation.
Under `CLAUDE.md` it requires **its own dedicated session**: purpose stated up front, environment named
by project ref, scope written to `.claude/DB_CLEANUP_SESSION`, `npm run db:simulate` run on the exact
statement first, and the predicted row count confirmed before anything executes.

Two defensible orders:

1. **Ship the code fix now, add the CHECK later.** The fix stops any new self-paired row being written
   — at both scan sites, and `recordDiff` throws on the case regardless of how it arrives. The
   constraint then becomes a backstop added once the corpus can accept it. Cost: staging carries one
   known-bad row for longer, and it is visible in every diff listing until then.
2. **Resolve the row first, ship both together.** The constraint lands with the code that makes it
   holdable, so the invariant is enforced at the database from the moment it is true. Cost: a cleanup
   session before anything ships.

Neither is obviously right, which is why it is not being chosen here.
