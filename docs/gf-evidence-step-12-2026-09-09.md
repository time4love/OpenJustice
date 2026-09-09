# Evidence step 12 — the reads, 2026-09-09

**A dated record, never edited — written the evening after the step landed, from the loop's own
log (`handoffs/R33-review-state.md`) and the tree, by the REVIEW seat on the researcher's
instruction.** The R33 sessions that built and reviewed it closed at ~699k (DEV) and ~693k (REVIEW)
tokens without writing this; the numbers below are the ones they recorded on the day — the SHAs,
the diffstat, the file states and the surface count the tree confirms; the suite counts are
`359c313`'s and are not re-measured tonight.

The step is `docs/gf-refactor-plan.md` §3b, step 12, built to `docs/gf-evidence-flows.md` §5 and
A3–A4, A7 as amended by `docs/gf-thesis-flows.md` (T2: the record's name on every timeline entry;
T6/A3: PUBLIC_PAGE over EVER-published) and `docs/gf-document-flows.md` (A3's FLAGGED gains SHED;
`list_findings` gains a documents register at document step 30 — not this step's). Landed as PR
#402 (`32d3b9e`, 23 files, +3,576 / −37) → `staging` `359c313`; backend deploy SUCCESS; CI lint
debt unchanged at 92. The MCP surface went 13 → 17.

---

## 1. WHY THE STEP WAS PULLED FORWARD, AND WHAT IT ANSWERS

`docs/gf-walk-corrective-pass-2026-09-08.md` records a researcher driving walla's corrective pass
through the connector and being told the corpus held nothing — `raw` empty, `diffInputVersion`
null, survival `UNCHECKED` — every reading accurate and the conclusion false: `get_diff_input` read
the legacy diff columns the walk had stopped writing at step 5, and `DiffContentVersion` had one
writer and no reader anywhere under `src/`. Steps 11 and 12 were ruled to run before corpus step 10
so that a researcher could see the corpus they had just corrected. This is the step that gives
`DiffContentVersion` its first reader, and its rule for every negative is that it carries a name:
`current: null` with `awaitingDerivation: true`, `opinion: null`, `evidence: null`,
`attributed: null`, and `AWAITING_DERIVATION` as a refusal wherever one diff is asked about.

## 2. SIX RULINGS BEFORE THE CODE, FROM THE SKETCH'S SEVEN QUESTIONS

The sketch (`handoffs/R33-chunk-1-sketch.md`) was reviewed twice; the researcher accepted every
recommendation in one line on 2026-09-08 (`memory/gf-step-12-rulings-2026-09-08.md`):

| the tree could not serve | ruling |
|---|---|
| A4 types `attributed: bool` per capture on a PUBLIC timeline, but the stored anchor verdict recorded a REGISTRATION (`registered`, `registryEvidenceId`) and no submitter; ATTRIBUTED was computed only by `registryState.attributeClaim` over the whole registry, and a live read per capture would have made the public timeline unbounded work — `WRITE_TOOLS` by `mcpRoutes.ts`'s own criterion | `attributed` is read from the STORED verdict, `true \| false \| null` (null = no verdict ever stored under the current rule — never a two-valued bool); the anchor-time check gains the submitter comparison through the ONE ATTRIBUTED function, `ON_CHAIN_CHECK_VERSION` v1 → v2; `list_findings` stays PUBLIC with no chain call; captures anchored before the change get one MAINTENANCE re-check in the container |
| A4's `list_findings` put `fileHash` only inside `evidence`, null until promotion — while thesis T2 says the read returns "the name of every record on a page's timeline, promoted or not", the premise of citation-first | every capture and diff entry carries `fileHash = recordId(record)`, computed at read and stored nowhere; the flows win over the appendix |
| PUBLIC_PAGE's "EVER published" arm (thesis T6) reads `Withdrawal` rows and superseded publications; the tree has neither, and no act can move `Thesis.publishedVersionId` at all | `publicPage` evaluates over the current pin; the EVER arm is held by a RED CASE BY NAME in the acceptance suite, owed to thesis step 24 |
| `check_on_chain_status` was PUBLIC without `NOT_PUBLIC` — a capture's anchor on a page no published thesis cites says "under investigation" (the framing risk §9.5 ranks first); and its `{ fileHash }` form naming nothing had no code | `NOT_PUBLIC` like its three siblings; `NOT_A_RECORD`, the code A4 already defines |
| A4's `resolve_record` returns RECOMPUTABLE, VERIFIED and FLAGGED, which the acceptance suite labelled steps 14 and 15 | `recomputable`, `verified`, `flagged` BUILT HERE; `argued` (13) and `publishable` (15) stay red; `recomputable` extracted from `auditEvidence.ts`, where it was spelled inline twice, and the instrument calls it |
| the citing version's body is TipTap JSON until thesis step 20; `NOT_A_RECORD` is defined over the corpus, not the evidence table, and CAPTURE_ID is deliberately not stored | the text is plain text through the existing `thesisClaimAudit.extractText`, imported dynamically (the jsdom boundary), never raw TipTap; a name resolves through `Evidence.fileHash` first, then a computed `recordId` pass over the corpus — cost recorded (three SHA-256 per diff, in process), §2's generated column named as the future if it ever measures slow |

Also ruled: ATTRIBUTED keeps ONE spelling — `attributeClaim` gains an entry-lookup parameter
(`entriesAlreadyRead` for the ledger and audits, `entryFromChain` for one hash) so one function
serves four callers; the one-symbol scan gains `attributed` with a correct count of ZERO in the tree.

## 3. WHAT WAS BUILT

- **`src/services/evidencePredicates.ts`** — A3's predicates, one symbol each: `currentVersionOf`
  returns a DISCRIMINATED `Current` (never a nullable — a caller holding `null` can forget which of
  two things it means); `needsReview`, `citationCurrent`, `narrowed`, `intervening`, `recomputable`
  pure and sync; `publicPage`, `verified`, `flagged` async and querying, so the step-15 gate asks the
  same function these tools ask. `flagged` has two arms (WITHDRAWN, NOT_CITATION_CURRENT) and says
  so in every answer — SHED needs a Document table. `storedAttributionFor` reads the newest
  ON_CHAIN_ANCHOR verdict per capture in ONE query for a whole page.
- **`src/services/corpusReads.ts`** — the loading the four reads share, in TIMESTAMP order and no
  other (a list sorted by an opinion presents the opinion as the ranking); `opinionOf` validates the
  STORED classification against `recordDiff.CLASSIFICATION_KEYS` (exported for it) and PROJECTS to
  A4's six — a half row THROWS naming the diff, because absent is a fact and half is nothing the
  design names; `resolveRecordByName`; `captureName` / `diffName`; `loadEvidenceLinkage`, published
  citations only, for everyone.
- **The four PUBLIC reads** — `list_findings`, `get_diff_input` by the pair (never a date pair;
  `NOT_A_CAPTURE` says WHICH of three states it was — not fourteen digits, not on the page's
  work-list at all, or on the work-list with another outcome), `resolve_record`, `check_on_chain_status` over a
  capture (chain STATE through `attributeClaim`, never a receipt; `CHAIN_UNAVAILABLE` is a verdict
  about the check) — in their own closed refusal union (`evidenceRefusals.ts`), because
  `src/walk/refusals.ts` may not be edited; ONE `openPage` gate deciding ACCESS only: the bytes are
  identical with and without an identity, asserted per tool.
- `forensicsRoutes.ts`: PUBLIC_PAGE before the anonymous trajectory read (404 `NOT_PUBLIC`).
  `onChainVerification.ts` stores `attributed`, `attributionVerdict`, `submitter` at anchor time.
  `test/opinionsNotFacts.test.ts`: A7's shape test as a PROPERTY over key sets, with a decoy.

## 4. WHAT THE REVIEW FOUND, AND WHAT THE DECOYS PROVED

**Two MEDIUM on the sketch:** the `opinion` zod was stated over A4's six names while the stored
column carries the writer's fourteen — the schema must validate the STORED shape and project;
ATTRIBUTED was composed inline in two tools while `attributeClaim` already spelled it — the
one-function refactor was needed under every ruling, not one.

**Two MEDIUM on the code:** the EVER arm's red case asserted `model Withdrawal {` in the schema — it
would have gone green at thesis 18's migration whether or not `publicPage` read the row — and was
rewritten to fail on the BEHAVIOUR (a thesis with no pin whose withdrawn version cites the page →
expect true; it fails today on `publicPage`'s own answer); `resolve_record` reported
`recomputable: true` as a LITERAL while `verified()` computed the real value and dropped it — a row
whose `fileHash` is a valid name of one record but keyed to another would have published a verified
block beside a name that is not its own.

**FOUND, and it changes how the suite is read:** `test/evidence/predicates.test.ts` had NEVER
compiled at baseline — 11b's "58 cases" were the other four files. Two declared non-assertion edits
made it run; its cases have been counted since.

**The reviewer's own decoys, each restored `cmp`-identical:** a generic `function attributed<T>(`
in another module — the one-symbol scan's first spelling required `(` right after the name and was
BLIND to generics, three of which this step declares; widened to `[<(]`, the decoy is planted in
both shapes; `significance` hoisted to a diff entry → `opinions-not-facts` fires; `viewer:
getResearcherId()` in a read's body → the byte-identical case fires; `new Web3Service()` in
`list_findings` → the no-chain-call case fires; `attributed` read two-valued → the older-version
NULL case fires; the predicates module stubbed to `export {}` → the suite refuses to compile, the
stronger form. Red-first by stub: `recomputable` stubbed true → two `auditEvidence` cases red by
name; the `recomputable` literal reverted → the new case red alone.

**The suite at landing:** `tsc` 0 · `npm test` 95 / 1,310 · `test:walk` 20 / 424, `src/walk` 0 lines
· `test:evidence` 92: 89 green, 3 red BY NAME (ARGUED 13, PUBLISHABLE 15, the EVER arm) · KEEP sweep
21 files, all 0 · eslint exit 0 on the 13 touched files, the errors in `mcpRoutes.ts` (5) and
`mcpServer.ts` / `forensicsRoutes.ts` (5 + 2) proven staging's own through `--stdin`.

## 5. THE MAINTENANCE RE-CHECK, CLOSED THE NEXT DAY

Ruling 1 made every anchor verdict stored under v1 read as `attributed: null` until re-checked —
"a public timeline calling an anchored capture unattributed is a false claim, not archaeology".
The instrument already existed: `forensics:backfill-anchor-checks` targets every subject not at a
current VERIFIED check, and the version bump made the old ones STALE. Run on 2026-09-09 in the
staging container, environment agreed on all four axes, `--dry-run` first: **the corpus holds FOUR
anchored captures, not the "six" the loop's records said** — walla's, at registry indexes 0–3. All
four re-checked, one chain read each, 4 VERIFIED at `v2-attribution-from-chain-state`,
`attributed: true`, read back by data; the four v1 verdicts kept as history.

## 6. RECORDED, NOT APPLIED

`check_on_chain_status` given both `url` and `fileHash` lets `fileHash` win silently (answered in
step 13's `open_debate` by a union of strict objects; this tool untouched) · the one-symbol scan
cannot see `export const name = (` · `readOnChainClaim`'s Evidence arm and the `NOT_IN_VAULT` /
`ORPHANED_ANCHOR` verdicts are dead vocabulary under the target — `onChainVerdict`'s own rebase ·
`src/mcp/tools/listCaptures.ts` has had no importer since the switch · `src/mcp/tutorial/chapters.ts`
is dead since 11a-thesis (the tutorial's change) · two refusal unions, one per layer, until
`src/walk` may be edited · the TIMESTAMP regex spelled thrice before `isWaybackTimestamp` was
exported · the DEV session's stash push/pop on the shared tree: reported by DEV, the tree found
intact, ruled NO CONSEQUENCE, the rule stands · ruling 5 built `verified` and `flagged` here, and
`test/evidence/predicates.test.ts`'s symbol cases still label them "built at evidence step 15" and
"step 14" — green with stale labels, a comment on an acceptance file, not edited to tidy prose.

## 7. WHAT THIS STEP DOES NOT CLAIM

That the reads were looked at live. The recommended look — a NEW claude.ai chat with the connector
reconnected, `list_findings` on walla, `get_diff_input` on one pair, `resolve_record` on a name the
timeline handed out, `check_on_chain_status` on one capture — was not taken before step 13 was
sketched; step 13's sketch was written against the return shapes as the code and the tests hold
them. Every PUBLIC read refuses `NOT_PUBLIC` to an anonymous caller on every page today, because
no published thesis exists on staging and none can until thesis step 23. **Ruled 2026-09-09
(evening): the look is still OWED, placed at thesis step 21's staging exercise** — the first act
that can publish a thesis and open a page — and it is that exercise's transcript that closes it.
