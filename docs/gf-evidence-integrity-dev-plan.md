# GF Evidence On-Chain Integrity & Forensic-Diff Model — Dev Plan

**Status:** Phase 0 (auto-promote bug fix) ✅ DONE. Phase 1 (schema migration) ✅ DONE 2026-08-18 —
**migration applied directly to the staging Supabase DB**, not just written locally (see §3.7). Phase 2
(shared on-chain-registration helper) ✅ DONE 2026-08-18 (§4.1) — fixed the §0.2 drift bug by
construction — **then strengthened same-day (§4.2)** after user review caught two further gaps: a
duplicate-registration path that could leave `CONFIRMED` without real proof, and a content-hash
collision (different diff, same evidence) the manual promote route didn't handle. Both fixed; 524/524
tests passing. **Phase 3 investigated and REJECTED 2026-08-18 (§5)** — its premise didn't survive
scrutiny (`UrlVersionDiff` is write-once, so no drift is possible; implementing it would have broken an
existing "Evidence survives its diff's deletion" guarantee) — not implemented, no code changed. That
investigation surfaced a real, much bigger question deliberately deferred to its own session: Evidence
versioning across rescans, given theses may already cite existing evidence (§8). **Phase 5 (process-doc
update) ✅ DONE 2026-08-18 (§7).** Phase 4 (optional backfill audit) not started, low priority.
Everything uncommitted to git.
**Created:** 2026-08-18.
**Scope:** Glass Fortress backend only (`apps/glass-fortress/backend`). No Bronze Fortress impact —
BF has its own separate evidence/allegation model.

---

## 0. Why this exists

While merging the Vault/Timeline pages into a single Evidence page (separate, already-shipped UX work
this session), the user spotted that staging showed far fewer evidence records than expected and
hypothesized significant forensic diffs weren't being auto-promoted. Investigating that led through
three layers, each deeper than the last:

1. **Confirmed bug, fixed this session (Phase 0 below):** `WaybackScraper.ts`'s `autoPromoteToEvidence()`
   *does* run automatically whenever a scan flags a diff significant — but it wrote `status: 'CONFIRMED'`
   unconditionally, without ever calling `registerEvidenceHash()`. Auto-promoted evidence was claiming
   to be on-chain (`CONFIRMED` = "Registered on-chain and indexed in Pinecone" per the schema's own enum
   comment) when it had never touched the chain.

2. **Duplication, found while fixing #1:** the register-on-chain-and-treat-duplicates-as-success pattern
   is copy-pasted across `evidenceRoutes.ts` (`/confirm`), `promoteEvidence.ts`, and (until Phase 0)
   `WaybackScraper.ts`. One of the four call sites — `forensicsRoutes.ts` `/promote` (manual promotion)
   — is missing the `DuplicateEvidenceError` handling its three siblings have, so a researcher manually
   promoting a diff whose hash is already on-chain gets a confusing 500 instead of completing normally.

3. **Root cause, found while diagnosing #2:** `Evidence.status` is the *only* signal for on-chain state.
   There is no `onChainTxHash` column on `Evidence` — unlike `UrlSnapshot`, which already has one for
   exactly this purpose. Worse, the schema default is `status EvidenceStatus @default(CONFIRMED)` —
   backwards from a safety standpoint. Any future insert that forgets to set `status` explicitly
   silently becomes "verified on-chain." (`evidenceRoutes.ts` `/confirm` already relies on this default
   implicitly today — see §3.3.)

4. **Related domain-model issue, surfaced discussing #3:** promoting a `UrlVersionDiff` to `Evidence`
   currently *copies* `summary`/`investigativeCategories`/`evidenceDate`/`sourceUrl`/`targetEntity` into
   a second row (`buildForensicEvidence`) instead of referencing the diff, which already holds the same
   data (`UrlVersionDiff.aiSignificance`/`investigativeCategories`/`afterDate`/`snapshotUrl`) — same
   duplication-with-no-sync shape as #3, one level up the domain model. The FK
   (`Evidence.urlVersionDiffId`) is also currently a to-many relation at the schema level
   (`UrlVersionDiff.evidence: Evidence[]`); only an application-level 409 check in `/promote` enforces
   1:1 today.

**Note for future sweeps:** `docs/gf-tech-debt-cleanup-dev-plan.md` §5 explicitly lists
`prisma/schema.prisma — no field/table redundancy` as verified clean. That was true of the specific
redundancy checked at the time (the removed `category` field); it did not check for missing columns
(no `onChainTxHash`) or cross-table field duplication (`Evidence` vs `UrlVersionDiff`). See §6 below —
this is now a standing checklist item for future sweeps: **audit every call site of any function that
writes to the blockchain or asserts external verification, together, as one unit** — a duplication
scanner or per-file review will not surface decision-logic drift between non-adjacent files (as
happened with #2), and a "does this table look redundant" pass will not surface a *missing* field.

---

## 1. How to work this plan

- Standard branch protocol applies: feature branch → PR → `staging` → explicit approval → `master`.
  Phase 1 (schema) should be its own PR, separate from Phase 2 (call-site consolidation) — each is
  independently reviewable and revertible. (Phase 3 was investigated and rejected without any code
  change — see §5.)
- Run the backend Jest suite after every change (517/517 passing as of Phase 0, 2026-08-18).
- **Phase 1 touches the staging Supabase database directly** (local `.env` points at staging, per
  `.env`'s own header comment). Do not run `prisma migrate dev` without explicit go-ahead at the time —
  confirm the migration SQL first, especially the `@unique` constraint (see §3.5, must check for
  existing violations before applying).
- This plan assumes Phase 0's fix is already merged/landed before Phase 1 starts, since Phase 2
  subsumes and extends Phase 0's `WaybackScraper.ts` change.

---

## 2. Phase 0 — ✅ DONE (uncommitted this session)

`autoPromoteToEvidence()` in `WaybackScraper.ts` now attempts `registerEvidenceHash()` before deciding
status: success or `DuplicateEvidenceError` → `CONFIRMED`; unavailable/unconfigured Web3Service or any
other registration failure → `PENDING_REVIEW` (never silently dropped, surfaces in the Evidence
timeline with the existing manual "Promote to Evidence" retry path). 5 new tests added across
`WaybackScraperAutoPromote.pending.test.ts` and `WaybackScraperAutoPromote.confirmed.test.ts`. Full
suite: 517/517 passing, typecheck clean.

This phase's logic will be **subsumed into the shared helper in Phase 2** — the conditional
registration/status logic currently inline in `autoPromoteToEvidence` moves into
`registerEvidenceOnChain()` (or equivalent) alongside the other three call sites.

---

## 3. Phase 1 — Schema migration

**File:** `apps/glass-fortress/backend/prisma/schema.prisma`, `model Evidence`.

### 3.1 Add `onChainTxHash`
```prisma
onChainTxHash String?  // Blockchain tx hash once fileHash is registered on-chain — mirrors UrlSnapshot.onChainTxHash
```
Nullable — safe for existing rows (see §3.6 for what nullable-and-CONFIRMED existing rows mean).

### 3.2 Flip the default
```prisma
status EvidenceStatus @default(PENDING_REVIEW)  // was @default(CONFIRMED)
```

### 3.3 ⚠️ Sequencing risk — `evidenceRoutes.ts` `/confirm` relies on the old default
This route (`POST /api/evidence/confirm` and `/url-confirm`) registers on-chain first, then creates the
Evidence row via `prisma.evidence.upsert(...)` **without ever setting `status` explicitly** — it rides
today's `@default(CONFIRMED)`. If §3.2 lands without also fixing this call site in the *same* change,
newly-submitted evidence via intake would silently become `PENDING_REVIEW` even though it did register
on-chain successfully. **§3.2 and the corresponding call-site fix (§4, this route is one of the four
consolidated onto the shared helper) must land together, not as separate PRs.**

### 3.4 Add `@unique` to the diff relation
```prisma
urlVersionDiffId String?  @unique
```
Enforces 1:1 between `UrlVersionDiff` and `Evidence` at the DB level — today it's a to-many relation
(`UrlVersionDiff.evidence: Evidence[]`) with only an application-level 409 check in
`forensicsRoutes.ts` `/promote` preventing duplicates.

### 3.5 Pre-migration check (must run before writing the migration)
```sql
SELECT "urlVersionDiffId", COUNT(*) FROM "Evidence"
WHERE "urlVersionDiffId" IS NOT NULL
GROUP BY "urlVersionDiffId" HAVING COUNT(*) > 1;
```
If this returns any rows, the `@unique` migration will fail and those duplicates need manual resolution
first (they'd represent the exact bug class this whole plan exists to prevent — worth investigating
individually, not just picking one to keep).

### 3.6 What this migration does *not* fix retroactively
Existing `Evidence` rows with `status: CONFIRMED` and (post-migration) `onChainTxHash: NULL` are exactly
the rows Phase 0 fixed the write path for — this migration doesn't tell you which existing rows are
genuinely on-chain vs. incorrectly marked. See Phase 4 (optional, follow-up).

### 3.7 ✅ DONE — applied 2026-08-18
- Pre-migration check (§3.5) run against staging first: **zero duplicate `urlVersionDiffId` rows** —
  safe to add the unique index.
- **Not** generated via `prisma migrate dev --create-only`: its auto-diff proposed `DROP TABLE
  evidence_embeddings` (the pgvector table, created via raw SQL in the baseline migration, isn't
  modeled in `schema.prisma` at all — a pre-existing, known gap between the Prisma schema and the real
  DB, not something introduced here). Migration SQL hand-written instead
  (`prisma/migrations/20260818000000_evidence_onchain_integrity/migration.sql`), touching only the
  `Evidence` table, then applied with `prisma migrate deploy` (non-interactive, applies pending
  migration files as-is — no auto-diff step, so no drop risk).
- Applied to the **staging Supabase DB directly** (local `.env` points there). Verified after: new
  columns/index present with correct types and defaults; existing 6 Evidence rows and all 6
  `evidence_embeddings` rows completely unchanged (migration doesn't rewrite existing data, only
  changes the default for *future* inserts).
- §3.3's sequencing risk closed in the same change: `evidenceRoutes.ts` `/confirm` now explicitly sets
  `status: 'CONFIRMED', onChainTxHash: txHash` in both the `update` and `create` branches of its
  upsert (previously relied on the default). This is *not* yet routed through the Phase 2 shared
  helper — that consolidation is still pending — it's the minimum fix needed to keep this one call site
  correct now that the default changed.
- Backend: 517/517 tests passing, `tsc --noEmit` clean.
- Not yet committed to git (schema.prisma, the new migration folder, and the evidenceRoutes.ts fix are
  all uncommitted working-tree changes) — the DB migration is applied regardless of git commit status,
  since `prisma migrate deploy` acts on the live database directly, independent of version control.

---

## 4. Phase 2 — Shared on-chain-registration helper

**New file (suggested):** `apps/glass-fortress/backend/src/services/evidenceOnChain.ts` (name TBD at
implementation time — finalize alongside checking for a more idiomatic home, e.g. as a `Web3Service`
method).

```ts
export interface OnChainRegistration {
  confirmed: boolean;        // true = safe to mark CONFIRMED — either just registered, or already was
  txHash: string | null;     // the tx hash if this call performed the registration; null if it was
                              // already registered by a prior call (DuplicateEvidenceError) or if
                              // registration was skipped/failed
}

export async function registerEvidenceOnChain(
  web3: Web3Service | null,
  fileHash: string,
  categories: readonly InvestigativeCategory[],
  evidenceRole: string,
): Promise<OnChainRegistration> { ... }
```

Encapsulates: skip if `web3` is null (unconfigured — caller decides whether that's fatal or
fall-through-to-PENDING_REVIEW), call `registerEvidenceHash(fileHash, ethers.ZeroAddress,
onChainCategoryLabel(categories, evidenceRole))`, treat `DuplicateEvidenceError` as
`{confirmed: true, txHash: null}`, let any other error propagate to the caller (fail-loud callers
rethrow to their HTTP handler; fire-and-forget callers like `WaybackScraper` catch and fall back to
`PENDING_REVIEW`).

**Four call sites to migrate onto this helper**, each setting `status` + `onChainTxHash` together from
its return value — never one without the other:

| Call site | Current behavior | File:line (as of 2026-08-18, re-verify before editing) |
|---|---|---|
| `evidenceRoutes.ts` `/confirm`, `/url-confirm` | Registers, then creates relying on implicit `@default(CONFIRMED)` (§3.3) | `evidenceRoutes.ts:258` |
| `promoteEvidence.ts` `promoteEvidence()` | Registers, handles duplicate, marks CONFIRMED, **drops `txHash`** | `promoteEvidence.ts:57,91` |
| `forensicsRoutes.ts` `/promote` (manual) | Registers, **missing duplicate handling** (the drift bug from §0.2), **drops `txHash`** | `forensicsRoutes.ts:511` |
| `WaybackScraper.ts` `autoPromoteToEvidence()` | Fixed in Phase 0, inline — should be refactored onto the shared helper here | `WaybackScraper.ts:~247` |

Fixing `forensicsRoutes.ts`'s missing duplicate-handling and every site's dropped `txHash` are both
direct consequences of consolidating onto one helper — not separate line items.

Update the 5 Phase-0 tests to import from the new shared location if `autoPromoteToEvidence` is
refactored to call it rather than reimplementing inline; add equivalent coverage for the other three
call sites if not already present (check `test/` for existing coverage of `/confirm` and
`/forensics/promote` duplicate-handling before assuming a gap).

### 4.1 ✅ DONE — 2026-08-18
- `src/services/evidenceOnChain.ts` created, matching the sketch above exactly (final home — not
  folded into `Web3Service`, since it composes `Web3Service` + `onChainCategoryLabel` + the
  duplicate-as-success policy decision, which is a level above what `Web3Service` itself should know).
- **3 of the 4 call sites now route through it**, each setting `status`+`onChainTxHash` together:
  `promoteEvidence.ts`, `forensicsRoutes.ts /promote` (this is where the drift bug from §0.2 lived —
  fixed by construction, the shared helper's duplicate handling applies automatically, no separate
  fix needed), `WaybackScraper.ts autoPromoteToEvidence()` (Phase 0's inline logic refactored onto the
  helper, behavior-preserving — same 5 Phase-0 tests still pass unmodified).
- **`evidenceRoutes.ts` `/confirm`, `/url-confirm` deliberately NOT routed through the helper** —
  reconsidered from the original plan. That route's duplicate-hash semantics are genuinely different:
  a duplicate there means a second, independent submission of the same content and is correctly
  *rejected* (409, per existing behavior), not silently accepted as already-confirmed like the other
  three "promote an existing internal record" call sites. Forcing it through a helper built to swallow
  `DuplicateEvidenceError` would have either lost the 409 or required exposing the raw error anyway,
  defeating the point. Its §3.3 fix (explicit `status`/`onChainTxHash`, done in Phase 1) stands as
  final for this route.
- On the duplicate path, the first pass (superseded by §4.2 below — kept here for the record) stored
  `onChainTxHash: null` rather than fabricating a placeholder string.
- Test coverage: new `test/evidenceOnChain.test.ts` covers the helper directly rather than re-mocking
  the same duplicate-handling logic through 3 separate HTTP/Prisma harnesses — the extraction's entire
  point was concentrating this decision in one place, so that's also where it's tested. Did **not**
  add new route-level (supertest) tests for `forensicsRoutes.ts /promote` or a unit test for
  `promoteEvidence.ts` directly — both call sites now do near-zero independent branching (they just
  plumb the helper's already-tested return value into a Prisma call), a judgment call given no
  existing test infrastructure for either and full typecheck coverage on the plumbing itself.
- Verified: 522/522 backend tests passing (was 517 — +5 new), `tsc --noEmit` clean, zero new ESLint
  errors introduced (confirmed by line-number cross-reference — all flagged errors in the touched
  files predate this change).

### 4.2 ✅ DONE — 2026-08-18, same day — user pushback corrected two real gaps in §4.1

User objection 1: **`CONFIRMED` + `onChainTxHash: null` is itself a data-integrity error** — for
evidence that may need to stand up in court, "it's confirmed, trust us, we just don't have the
transaction" is not an acceptable answer for *any* record, including the duplicate-registration case.
Fix: `EvidenceRegistry.sol`'s `submit()` emits `event EvidenceSubmitted(bytes32 indexed fileHash, ...)`
— the contract never stores a tx hash itself (it can't know its own transaction hash during execution),
but the indexed event log is a complete, independently-queryable record of it. Added
`Web3Service.findRegisteringTxHash(fileHash)` (queries `contract.filters.EvidenceSubmitted(fileHash)`
via `queryFilter`, returns `logs[0]?.transactionHash`). `registerEvidenceOnChain()`'s
`DuplicateEvidenceError` branch now calls this and only returns `confirmed: true` if a real hash comes
back; if the lookup itself comes up empty (should not normally happen — defensive only), the result is
`confirmed: false`, identical to an outright registration failure. `OnChainRegistration` was rewritten
from an interface to a discriminated union (`{confirmed: true; txHash: string} | {confirmed: false;
txHash: null}`) specifically so `txHash: string | null` independent of `confirmed` can't compile —
callers that check `if (!registration.confirmed) return` get `txHash` narrowed to `string` afterward,
enforced by the type checker, not just documented.

User objection 2 (probing question, not yet a claimed bug): does a duplicate-on-chain hash guarantee
the same Evidence row already exists locally? Answer, worked out precisely rather than assumed:
- `promoteEvidence.ts` — yes, always. It operates on an `Evidence` row already looked up by the
  caller; `fileHash` is `@unique`, so there is no second row this could refer to. Nothing to lose by
  correcting status — the row was never at risk.
- `forensicsRoutes.ts /promote` — **no, not guaranteed, and this was a real second gap.**
  `fileHash` is content-addressed from `url + afterDate + deletedText + addedText` — the date IS part
  of the hash (so "same edit, different date" already produces different hashes, contrary to one
  hypothesis raised and checked), but nothing stops the *same* snapshot pair from being diffed into
  **two separate `UrlVersionDiff` rows** (e.g. a rescan re-processing an already-covered date range).
  Confirmed by checking the schema: `UrlSnapshot` has `@@unique([trackedUrlId, waybackTimestamp])`;
  `UrlVersionDiff` has no equivalent constraint. Per the user, this recurrence itself is expected and
  fine — "no different than uploading the same PDF twice" — the requirement is that the system
  recognize it as a duplicate cleanly, not that it be prevented from happening. Before this fix, the
  route's blind `prisma.evidence.create()` would have hit `Evidence.fileHash`'s unique constraint and
  thrown, falling through to a generic 500 "Promotion failed" (not a regression from §4.1 — the *old*
  code 500'd here too, just via `registerEvidenceHash` never getting past the on-chain duplicate
  check). Fix: added an explicit `prisma.evidence.findUnique({ where: { fileHash } })` check before
  attempting registration at all — if it already exists (under any `urlVersionDiffId`, not just this
  diff's own), respond `409 already_promoted` pointing at the existing record, mirroring the existing
  by-diffId 409 one branch up. `WaybackScraper.ts`'s auto-promote needed no change here — it already
  used `upsert` (not `create`) keyed by `fileHash`, which was never at risk of this failure mode.
- `registration.confirmed === false` reaching the `create`/`update` call (an unrecoverable duplicate,
  §4.2's first fix) is now also handled explicitly in `forensicsRoutes.ts` and `promoteEvidence.ts`
  (mirroring the ternary `WaybackScraper.ts` already had): the record lands `PENDING_REVIEW`, never
  `CONFIRMED`, with the existing manual promote flow as the retry path once the tx hash becomes
  recoverable.
- Test coverage: `evidenceOnChain.test.ts` gained a case for the unrecoverable-duplicate path (must
  return `confirmed: false`, never a fabricated hash); `WaybackScraperAutoPromote.confirmed.test.ts`
  gained matching cases plus an `onChainTxHash` assertion on every existing case (previously only
  asserted `status`). No new test added for the `forensicsRoutes.ts` `existingByHash` check itself —
  same judgment call as §4.1 (simple, direct Prisma logic; the risky branching it depends on is
  covered where it actually lives, in `evidenceOnChain.test.ts`).
- Verified: 524/524 tests passing (+2 more), `tsc --noEmit` clean, zero new lint errors (one
  introduced-then-fixed dot-notation nit in `Web3Service.ts`, confirmed clean on re-check).

Not yet committed to git.

---

## 5. Phase 3 — ❌ NOT IMPLEMENTED, investigated and rejected 2026-08-18

**Original plan (below, kept for the record) was reconsidered and dropped before writing any code.**
The premise — that `Evidence` copying `summary`/`investigativeCategories`/`evidenceDate`/`sourceUrl`/
`targetEntity` from its source `UrlVersionDiff` at promotion time is a duplication-with-drift-risk bug,
the same class as the on-chain integrity issue — turned out not to hold up:

1. **`UrlVersionDiff` is write-once.** Grepped every `prisma.urlVersionDiff.*` call in the codebase:
   `.create()`, `.findMany()`, `.findUnique()`, `.count()`, `.deleteMany()` — never `.update()`. No
   reclassification endpoint exists. There is no mutable source for the copy to drift away from, so
   "derive at read time instead of copying" would fix a divergence that cannot occur.
2. **The codebase already has an explicit, deliberate design decision Phase 3 would have broken.**
   `forensicsRoutes.ts`'s delete-`TrackedUrl` route does this before deleting the diffs:
   ```ts
   // Unlink Evidence records (keep them — they are on-chain)
   await prisma.evidence.updateMany({
     where: { urlVersionDiff: { trackedUrlId } },
     data: { urlVersionDiffId: null },
   });
   ```
   Evidence is explicitly designed to survive deletion of the diff that produced it, because it's an
   on-chain, legally durable record. A join-based derivation would have nothing left to join to the
   moment this already-exercised code path runs — a currently-complete Evidence record would go blank.
   That's a regression in the *opposite* direction from this whole plan's purpose.

**Conclusion:** the copying is ordinary, safe denormalization — not a bug. The one real problem in the
original finding (multiple `Evidence` rows able to point at the same diff) was already fixed by
Phase 1's `@unique` constraint, independent of copy-vs-derive. No further action needed here.

**This investigation surfaced a separate, much bigger question — deliberately NOT designed here, own
session:** see §8 below (Evidence/diff versioning & rescan lifecycle).

<details>
<summary>Original Phase 3 plan (not implemented — collapsed for reference)</summary>

Decided direction as originally proposed: promoting a `UrlVersionDiff` still creates a **new**
`Evidence` row, 1:1-linked via `urlVersionDiffId`. What would have changed is *what that new row
stores*: stop copying `summary`/`investigativeCategories`/`evidenceDate`/`sourceUrl`/`targetEntity`
from the diff at promotion time, derive them by joining to `UrlVersionDiff` at read time instead, for
`evidenceType === 'FORENSIC_DIFF'` rows only, via `mapEvidenceToRecord()` (`src/lib/evidenceRecord.ts`)
extended to accept an optional joined `UrlVersionDiff` row. Three read consumers would have needed
their Prisma queries extended with the join (`GET /api/evidence/timeline`, `GET /api/evidence/search`,
`GET /api/figures/:id`), plus a verification sweep for other direct readers (MCP tools
`suggestThesis.ts`, `getResearchAgenda.ts`), plus shrinking `buildForensicEvidence()`'s return value
and rewriting `test/forensicEvidence.test.ts`. None of this was implemented.

</details>

---

## 6. Phase 4 — Backfill / audit (optional follow-up, not blocking Phases 1–3)

Script to cross-check existing `status: CONFIRMED` Evidence rows (both types) against the on-chain
registry, to find any incorrectly marked before Phase 0 landed. For rows verifiably on-chain, backfill
`onChainTxHash` from the chain's event log. For rows that aren't, demote to `PENDING_REVIEW` (with a
clear audit trail — don't silently rewrite legal-evidence status without a record of why). Offered to
the user 2026-08-18, not yet commissioned — ask before starting, this reads on-chain history and
touches the staging DB in bulk.

---

## 7. Phase 5 — ✅ DONE 2026-08-18 — Process improvement (non-code)

Added `docs/gf-tech-debt-cleanup-dev-plan.md` §1.2 (new section, matching that doc's existing pattern
of recording lessons-that-became-standing-rules — see its §1.1) and annotated its §5 "Explicitly NOT
debt" schema-redundancy bullet with a correction pointing at this gap. The rule: any function that
writes to the blockchain, mutates external/ledger state, or flips a record's status to a value
asserting outside verification gets every one of its call sites diffed against each other directly, as
its own explicit checklist step in future sweeps — not discovered incidentally, not assumed covered by
a duplication scanner or a "does this look redundant" schema pass, which catch a different failure
shape. See §0's "Note for future sweeps" here for the original framing.

---

## 8. Evidence/diff versioning & rescan lifecycle — deferred, needs its own dedicated session

**Not designed, not scoped, not started.** Raised by the user 2026-08-18 while closing out Phase 3, as
the real question behind that investigation: given `Evidence` is explicitly designed to survive
deletion of its source `UrlVersionDiff` (§5, point 2), and diffs/evidence may already be **cited by
theses**, how should a deliberate "rescan a URL clean and recreate its diffs/evidence" actually work?
Today the only rescan mechanism is `forensicsRoutes.ts`'s delete-`TrackedUrl` route — full delete of
`TrackedUrl` + all its `UrlVersionDiff`/`WaybackScrapeJob` rows (Evidence unlinked and kept, snapshots
presumably also deleted — not yet checked), then start over as if the URL were never tracked. There is
no notion of "this Evidence was superseded by a newer scan's re-detection of the same change" — a
rescan's newly-created diff/evidence would be entirely unrelated, from the data model's perspective, to
whatever a thesis already cited from the old scan.

The user's framing: this is shaped like an **event-sourcing / versioned-entity problem** — "a rescan
could create a new version of the same hash and thus we get a new updated version of the same
evidence." Some threads a future session would need to pull on, noted here only so they aren't
re-discovered from scratch, not to pre-decide anything:
- What does "the same evidence, new version" even mean when `fileHash` is content-addressed —
  identical content always hashes identically (that's the point), so a genuinely "corrected" rescan
  produces a *different* hash, i.e. an unambiguously different `Evidence` row. Versioning would need
  its own identity concept above the content hash (e.g. "these N `Evidence` rows are different
  observations of the same real-world claim/URL-at-roughly-this-time"), not reuse `fileHash` for it.
- How does a thesis's citation (by `fileHash`, today) behave when the evidence it cites is superseded —
  does the thesis need to be notified, does the UI show "a newer version of this evidence exists," does
  the old citation stay valid forever (immutable citation) even if the newer scan found the old one was
  wrong?
- Whether "supersedes" is even the right relationship, vs. both scans' evidence coexisting
  side-by-side as independent, individually-citable observations (which is closer to what already
  happens today, just without any explicit link between them).
- What the *current* delete-and-rescan operational flow actually does to `UrlSnapshot` rows and
  `WaybackScrapeJob` history — not verified as part of this session's investigation, worth confirming
  before designing on top of it.

## 9. Explicitly out of scope

- Bronze Fortress — separate evidence/allegation model, not touched by this plan.
- `registerSnapshotOnChain()` in `WaybackScraper.ts` (registers `UrlSnapshot.contentHash`, not
  `Evidence`) — different table, different stakes (snapshot provenance, not evidentiary status), lower
  priority. Could adopt the same shared helper later if it turns out to need the same rigor, but not
  bundled into this plan.
- `evidenceRoutes.ts`'s duplicate-handling on `/confirm` already returns 409 correctly today (§0 table)
  — no behavior change needed there beyond routing through the shared helper (§4) for the
  `onChainTxHash` write.
- Evidence/diff versioning & rescan lifecycle (§8) — explicitly deferred to its own dedicated session,
  not part of this plan's scope.
