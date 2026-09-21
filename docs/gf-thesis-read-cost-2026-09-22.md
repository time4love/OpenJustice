# The thesis read's cost — what a page that would not load measured, 2026-09-22

> **A FINDINGS RECORD. It corroborates; it decides nothing.** The rulings it reports were the researcher's or
> a cold read's, and each names the line that carries it. Nothing here amends a design: where an amendment is
> owed, this doc says so and names the clause.

## How it was found, which is the point

UI-8's working view landed (chunk 7a, PR #558) with a green suite, `tsc` and lint clean, and roughly fifty
reviewer decoys over it across two rounds. **The first person to open the page got a 500 inside a minute.**

Three chunks of instruments never touched it, and the reason is structural: **every instrument in this
repository asserts a SHAPE — a count, a key set, a rendered node — and none asserts a DURATION.** A read that
is correct in every particular and takes half a minute passes all of them. This is the measurement the
protocol's *"the researcher's review surface is a running page"* rule (`docs/gf-two-session-protocol.md`) was
adopted for, on its first use.

## What it was not

`Failed to proxy … socket hang up (ECONNRESET)` — the gated read never returned, so Next's dev proxy cut the
socket and the frontend surfaced a 500. **The backend logged nothing, because it never finished.**

It was **not** the database being unreachable, though the first error in the log said exactly that and was an
hour stale: DNS resolved, TCP connected on both 6543 and 5432, and `db:check-drift` answered throughout.
It was **not** a misconfiguration: `pgbouncer=true` is set and a `DIRECT_URL` exists, which is the documented
Supabase/Prisma shape.

## The measurements

All against run B's thesis (`3` EVIDENCE citations, `37` transcript turns) with Prisma `$use` middleware
counting and timing every delegate call.

| | |
|---|---|
| public read, warm, from a laptop | 28.2 / 19.7 / 14.8 s |
| the same read, deployed beside the database | **~2.0 s** |
| gated read | **39 delegate calls across 19 delegates** |
| **per-query floor, laptop → the database's region** | **~550 ms** |

The floor was measured with `SELECT 1` ten times in one process: 4047, 955, 556, 559, 544, 543, 470, 812,
806, 497 ms. TCP round trip to the host is 120–240 ms, so a trivial query costs **three to four round trips**
of pooler, TLS and protocol. Ten `SELECT 1` in PARALLEL took 1343 ms — **concurrency works; the floor does
not move.**

**THE ARITHMETIC IS THE FINDING: 39 queries × 550 ms is ~21 s sequential. No code change reaches a loadable
page from a laptop one region away.** The fixes below matter where a query costs ~50 ms and the round-trip
COUNT is the whole cost — which is every deployed environment. A reviewing seat conflated the two for several
exchanges and optimised toward a target it could not hit; that is recorded here so the next one does not.

**Almost every table is read more than once in one request:** `ThesisMention` ×4 · `Evidence` ×4 ·
`UrlSnapshot` ×3 · `ThesisGapDecision` ×3 · `ThesisVersion.findUnique` ×3 · and ×2 each for `ThesisVersion`,
`Framing`, `Withdrawal`, `ThesisAnalysis`, `Note`, `Researcher`, `TrackedUrl`, `UrlVersionDiff`.

**Because the body is assembled THREE times** over the same rows: the state arm (`thesisContextOf`), the
fingerprint (`loadHead`), and the transcript (`history`). Three correct implementations of clauses that
describe one set of rows.

## What was fixed on 2026-09-22

Five sites, all in the tree, suite **181 / 3094 / 0** throughout. Each carries its measurement in a comment.

- **Four sites where INDEPENDENT reads were awaited in sequence** — `publicRecordOf` (four reads, every one
  keyed on `thesisId`, the PARAMETER), `pageOf` (five), `thesisContextOf` (four), and `recordsByName`'s
  captures/diffs siblings. Measured before: **12 ms of overlap in a 16,258 ms wall** — no concurrency at all.
- **One true N+1**: `criticMaterial.ts` called `resolveRecordByName` once per citation, and that function IS
  `recordsByName([x])` (`corpusReads.ts` :511–:512) — so it walked the whole corpus once per citation. Three
  citations, three walks, ~9 s. **47 → 39 calls.**

## Six claims the cold read corrected, and the two that matter

1. **`recordsByName` runs TWICE per gated read, not four times** — `criticMaterial.ts` :70 and
   `publishedThesis.ts` :356. The "four" came from grepping the profiler's WHOLE OUTPUT, which repeats every
   call in its ten-slowest section. **The reviewer's own final table said `TrackedUrl ×2` and it did not read
   it.** *An instrument's output is not its measurement.*
2. **The page makes a SECOND READ the design does not list.** `ResearchThesis.tsx` :97 and :99 read
   `/api/research/theses/:id` AND `/api/research/reviews`; `docs/gf-ui-flows.md` §10 :370–:371 is a CLOSED
   LIST naming only the first, plus `get_framing`/`get_debate` on demand. **Chunk 7a introduced it and argued
   it into that file's comments without checking the closed list.** See OPEN below.

Also corrected: §41 is `gf-ui-flows.md` :1091–:1094 (not the plan's :1093, which is the *"composing a second
read"* hazard); the body is assembled three times, not two; `thesisContextOf` :199–:249 and `history`'s
fourteen awaits at :610–:699 remain serial; and **framings and debates are NOT lazy-loaded** — the body
carries their rounds and events as turns, and `get_framing`/`get_debate` re-read one thread through the same
builders (thesis §9 :974).

## Ruled by the cold read — NONE of these needs an amendment

- **§41 licenses nothing today.** `gf-ui-flows.md` :1093–:1094's axis is HISTORY's **size at phone width** and
  its instrument is a **cursor**; §12 :464–:466 gives the reason (*"the history is loaded whole, because a
  thesis's history is small"*). A cursor bounds the wire, not the database, and would not move a query count.
  **That measurement is still OWED by plan :799.**
- **Per-tab loading is FORBIDDEN** by §10 :370–:371's closed list — *"Nothing else is fetched; nothing is
  derived that the body does not carry"* — and plan :727's *"one read … and two sheets on demand"*. §12 :464
  is about FILTERS and a tab is not a filter, but the closed list forbids it on its own.
- **Sharing one load between the state arm and the transcript is IMPLEMENTATION, not design** — §9 :974's
  *"the SAME builders, one spelling"* pushes toward it, and `getThesisContext.ts` :246–:248 already hands one
  computation into another for exactly that reason.
- **The corpus-wide walk is #547's defect one level down** and no clause licenses it. But see the correction
  below: it is *inherent* for an unpromoted citation.
- **THE DESIGNS ARE SILENT ON READ-VIEW PERFORMANCE.** The only performance clauses are thesis §10
  :1056–:1057 (an index *"the day a measurement says the read is too slow"*), thesis :1210, and ui §41 :1093
  (size) and §13 :473 (a paint ORDER, not a budget). **The silence is itself the finding**, and the remedy is
  to record 2 s and the call count in UI-8's dated doc — not to invent a budget in a design.

## THE TARGET SHAPE — proposed, not ruled

> **THIS SECTION IS DERIVED. Its SOURCE is kept verbatim at
> `~/.claude/projects/-Users-jonathand-OpenJustice/handoffs/R70-fable-design-source-2026-09-22.md`** —
> the cold reader's proposal as written, with the `ThesisRows` interface, the wave contents, the
> function map, the resolution pseudo-code and its own list of what it was guessing. **Go there when a
> detail here looks thin, and before implementing.** It is kept because this section was first written
> from a SUMMARY of that answer rather than from the answer, and lost the concrete detail until the
> researcher asked where it had been saved. **A compression reads afterwards exactly like a
> transcription, which is why the source is kept beside the derivation.**

### Chunk A — no design amendment; one plan line

**One loader, three waves, everything downstream pure.** A `services/thesisRows.ts` holding the only `prisma`
for this read: wave 1, eight queries keyed on `thesisId`; wave 2, five keyed on wave 1's ids; wave 3,
`handlesOf`. Then `history` → `transcriptOf(rows)`, `versionView` → a lookup in `rows.versions`, `loadHead` →
`headFrom(rows, cited)`, `headFingerprint` → `fingerprintOf(head)` — pure functions of rows.
`citationsByVersion` → `citationsFrom(rows, versionIds)`, its mention query becoming a filter.

**IT SATISFIES `criticMaterial.ts` :33–:34 LITERALLY, NOT BY PARITY.** That clause makes `headFingerprint`
the ONE loader `run_analysis` refuses on, so the read and the refusal cannot disagree. The exported entry
point stays and is rebuilt on the shared loader; the three writers (`runAnalysis.ts` :72,
`draftFoiaRequest.ts` :70, `publicationEvaluation.ts` :113) pay ~15 queries instead of 7, against a paid LLM
call. **A slimmer loader for writers plus a parity test was considered and REJECTED: a second loader is
precisely what the constraint forbids.**

**Record resolution keeps its signature and every caller.** Only `corpusReads.ts` :553 changes: when every
name hit the `Evidence` lookup, walk the cited pages only; otherwise fall back to the full walk. Public
`resolve_record`/`NOT_A_RECORD` is unchanged BY CONSTRUCTION — an arbitrary string misses the lookup and gets
the full walk.

> **THE CORRECTION THAT SHAPES THIS, and it was the reviewer's second self-correction of the day:** *not
> every EVIDENCE citation is promoted.* `docs/gf-thesis-flows.md` :439 — *"a record not yet promoted … all
> legal"* — and `corpusReads.ts` :497–:500, which is what lets a draft cite first and argue after. An
> UNARGUED citation has no `Evidence` row and the mention stores only `name` + `contentVersionHash`, so its
> page is recoverable only by recomputing. **The walk is INHERENT for that name.** Run B's three are all
> argued, so its walk is pure waste — but the general case is not.
>
> **A stored pointer on `ThesisMention` is RULED OUT** at `corpusReads.ts` :504–:509: *"a column any code
> path writes … a second answer beside `documentHash`, with a write path that can mis-write it."* The
> design's own named remedy is a DATABASE-GENERATED column at pgcrypto's price — and `db:verify-migrations`
> records pgcrypto as undeclared. **Not this chunk.**

#### The loader, concretely

**NEW `services/thesisRows.ts`** — the only module holding `prisma` for this read:

```
ThesisRows = { thesis, versions (WITH text/claim/contentHash/parent), mentions (all versions, + id +
               debateSession), framings, rounds, debates, debateEvents, analyses, decisions, attempts,
               withdrawals, notes, handles: Map<researcherId, handle> }
loadThesisRows(thesisId): Promise<ThesisRows | null>        // null = NO_THESIS
```

**Three waves, each one `Promise.all`:**
- **W1 — eight, all keyed on `thesisId`:** thesis · versions · framings · debates · decisions · attempts ·
  withdrawals · thesis notes.
- **W2 — five, keyed on W1's ids:** mentions (`versionId in`) · rounds (`framingId in`) · debateEvents
  (`sessionId in`) · analyses (`versionId in`) · framing notes (`framingId in`).
- **W3 — one:** `handlesOf` over every researcher id the rows name.

**The function map — everything downstream becomes pure:**

| today | becomes |
|---|---|
| `history(thesisId, opts)` — loads at :610–:699 | `transcriptOf(rows, opts)` — those loads deleted, :712–:742 kept verbatim |
| `versionView` :322–:351 — two `findUnique`s | a lookup in `rows.versions`; the `findUnique`s go |
| `loadHead(thesisId, headVersionId)` | `headFrom(rows, resolved)` — pure; `LoadedHead`'s shape :25–:33 unchanged, so `critiqueMaterial`/`draftMaterial` do not move |
| `headFingerprint(thesisId, headVersionId)` | **stays exported** for the three writers, rebuilt as `fingerprintOf(headFrom(rows, cited))`; :100–:114 unchanged |
| `citationsByVersion(thesisId, versionIds)` :327 | `citationsFrom(rows, versionIds)` — its mention query :335 becomes a filter over `rows.mentions` |

The three writers are `runAnalysis.ts` :72, `draftFoiaRequest.ts` :70, `publicationEvaluation.ts` :113. They
pay ~15 queries instead of 7 — against a paid LLM call, nothing. `get_framing` and `get_debate` do NOT change:
they already call the builders with their own thread loads (`getFraming.ts` :83, `debateState.ts` :210).

#### Record resolution, concretely — only `corpusReads.ts` :553–:559 changes

```
promoted        ← evidence.findMany({ fileHash in names })        // :536, as today
ids             ← every name promoted ? [the cited pages only]
                  : all trackedUrl ids                            // :553, the full walk, ONLY on a miss
captures, diffs ← capturesByPage(ids) ∥ diffsByPage(ids)          // :559
match           ← :561–:573, unchanged
```

`Evidence.snapshotId` / `urlVersionDiffId` are `@unique` FKs, so a promoted name's page always holds the
match and :570 breaks on it — the other pages' rows were loaded and never examined. **Test:** a fixture where
every name is promoted asserts **no `trackedUrl.findMany`**; one unpromoted name asserts the walk runs once.

#### The serial chains, and which need the loader

| chain | parallelism alone | needs the loader |
|---|---|---|
| `thesisContextOf` :199 → :201 → :203 → :249 | no — these are queries that should not exist | **yes**; the chain is DELETED, not parallelised |
| `history` :610–:699, fourteen awaits | collapses by `Promise.all` | absorbed into W1/W2/W3 |
| `citationsByVersion` :356–:358 | **yes** — `recordsByName ∥ verifiedFor ∥ flaggedFor ∥ resolveTrajectoryCitations`, then `heldTextsFor` (depends on records) | no |
| `heldTextsFor` :606–:611, one `findUnique` per superseded pin | one `findMany` with `OR` over compound keys | no — small; +1 per pin until rewritten |

#### Chunk B, concretely

`reviewsOf(rows, cited): ReviewEntry[]` — a pure function; `ReviewEntry` is `thesisPredicates.ts` :43, the
type that already exists. FLAGGED comes from `flaggedFor` over PUBLISHED's mentions (already run at :358),
STALE_TRAJECTORY from the currency `resolveTrajectoryCitations` already returns (:347), UNARGUED from the
body's own field. `list_thesis_reviews` becomes `for each thesis in scope: reviewsOf(await
loadThesisRows(id), …)`, which is what removes its own N+1 at `thesisReviews.ts` :173–:174. ARRIVED
(document flows) lands in `reviewsOf` when it exists.

#### The seam between the chunks

**Chunk A delivers on its own** — no design amendment, one plan line (:779's lift naming the backend files),
39 → ~21 calls, every growth term removed but the unpromoted walk, G-cases green, two new cases (no walk when
every name is promoted; the count does not grow with turns). **Chunk B is independent of it** except that
`reviewsOf` takes `ThesisRows`.

| | today | chunk A |
|---|---|---|
| delegate calls | 39 | **~21** |
| serial round trips | ~35 | **~7 waves** |
| growth with citations · with turns | — | **0 · 0 queries** |
| growth with corpus | two walks | **0 when every cited name is promoted** |

**Plan `:779`'s KEEP lift must name the backend files it touches.** No design line moves.

### Chunk B — the researcher's ruling first

**The envelope gains `owed`**, and `ResearchThesis.tsx` :99 is deleted. Every input is already in the
loader's rows: FLAGGED from `flaggedFor` over PUBLISHED's mentions, STALE_TRAJECTORY from the currency the
citation resolver already returns, UNARGUED from the body's own field — **zero extra queries**. The
precedent is the appendix's own, twice: ui §6.1 :241 (*"without a second read"*) and A4 :1476's `pages`
clause (*"the gated door must not take a second read for a fact its own read can carry"*), with T6 :876–:877
(*"repeated here so one read answers the question"*).

The alternative — §10's closed list gains `/api/research/reviews` — costs a read over **every thesis on the
platform** to keep one row, a cost growing with the platform.

`list_thesis_reviews`' own N+1 (`thesisReviews.ts` :173–:174, one corpus walk per entry) disappears under
the envelope option, because the records come from the shared resolution rather than per name.

**Amends:** A4 :1476 (in place, one line, moves no cite) · ui §10 :367–:369 · §11 :402 · plan :727–:730.

## OPEN, and each is the researcher's

1. **Chunk B's ruling** — `owed` on the envelope, or §10 gains a third read. **Until it is ruled, the working
   view makes a read the design does not list.**
2. **Whether chunk A is UI-8's work at all.** The cold read's view: it is a backend cost change, while UI-8
   closes on the history-size measurement (:799) and its lift (:779) names files by purpose. Filing it beside
   #547 keeps `gate:ui-8` honest rather than parking backend debt inside a UI step.
3. **§41's owed measurement** — HISTORY's size at phone width, which plan :799 already requires of UI-8's
   closing record, and which today's work did not take.
4. **Local review remains blocked by the ~550 ms floor**, not by code. The practical unblock is to point the
   local frontend at the deployed staging backend (`next.config` :24's destination is env-driven).

## What no one verified

The ~21 calls and ~0.4 s of chunk A are counted from the code, not profiled. `storedAttributionFor` inside
`verifiedFor` was counted as one query, unread. Whether `resolveTrajectoryCitations` adds per-computation
reads when TRAJECTORY citations exist was not tested — run B has none.
