# GF Thesis Citation Footnotes — Dev Plan

**Status:** In progress — design settled, test-first implementation underway.
**Started:** 2026-08-18, during the first real end-to-end run of the evidence-first thesis
workflow (`suggest_thesis` → discussion → `create_thesis_draft`) on staging.

## 1. Problem

`COMPLIANCE.md` Rule 2 ("Stay Within the Evidence") requires every factual claim in AI-generated
thesis content to be traceable to a specific, cited evidence hash. In practice, traceability today
exists only at the **document level**: `create_thesis_draft` takes a flat `evidenceHashes: string[]`
and `buildTipTapDoc` ([tipTapUtils.ts](../apps/glass-fortress/backend/src/utils/tipTapUtils.ts))
appends them as a single trailing paragraph of evidence-mention chips. There is no way to tell
*which sentence* a given piece of evidence supports — a reader (or a court) has to take the
narrative on faith once past the citation list.

Surfaced live: running `suggest_thesis` against the real staging evidence vault (topic: MOH
concealment of vaccine side-effect data, 6-record corpus) produced a strong, readable Hebrew
narrative, but the only way to check any individual claim against the underlying evidence was to
manually re-read all 6 records and cross-reference by eye.

## 2. Decision

Add inline, per-claim footnote citations to `narrativeBody`, generated **at synthesis time** by
`ThesisSynthesisAgent` — not attached in a second pass.

**Why generation-time, not a post-hoc citation-finder pass:** a second LLM call asked to find
citations for already-written text has to reverse-engineer which evidence a sentence was "really"
based on. It can confabulate a plausible-but-wrong match, which reintroduces exactly the
untraceability problem behind a footnote that now *looks* authoritative. The model that writes a
claim already knows, at write time, which evidence record it is drawing from — asking it to cite
inline as it composes is a stronger anchor, and forces self-discipline: if it cannot cite a claim,
it should weaken or drop it, not merely assert it.

The correct second pass is **verification**, not citation generation: checking that a citation's
hash actually supports the claim next to it. `DevilsAdvocateAgent` already does a document-level
version of this ("Identify claims that the cited evidence does not actually support" — see
[devilsAdvocateCritique.ts](../apps/glass-fortress/backend/src/prompts/devilsAdvocateCritique.ts)).
Extending it to per-footnote granularity is a natural follow-up once footnotes exist, not part of
this change.

## 3. Design

### Schema (`ThesisSynthesisAgent.ts`)

- New field `citations: { id: number; fileHashes: string[] }[]`. `fileHashes` is an array (not a
  single string) so one footnote can rest on more than one record; the same `fileHash` may also
  appear across multiple citation entries, so one piece of evidence can back several distinct
  claims. This is the flexibility the researcher explicitly asked for.
- `narrativeBody` must cite every factual claim inline with standard Markdown footnote markers
  (`[^1]`, `[^2]`, …) immediately after the claim; every marker must have a matching `citations`
  entry.
- **`supportingHashes` is dropped as an LLM-generated field.** It was redundant with (and could
  drift from) `citations`, and derivable mechanically. The MCP tool layer now derives it from
  `citations` by flattening + deduping `fileHashes` in first-appearance order — first-cited reads
  as most-load-bearing in the narrative anyway, so this doesn't lose the "strongest first"
  ordering the old field tried to capture by LLM judgment. One fewer AI-generated field is one
  fewer way for the output to become internally inconsistent.
- **Post-parse consistency check, not a Zod `.refine()`.** `assertSchemaCompatibility` (existing
  guard, see [assertSchemaCompatibility.ts](../apps/glass-fortress/backend/src/lib/assertSchemaCompatibility.ts))
  fails the build if a field would be dropped by LangChain's `zodToJsonSchema` conversion for
  function-calling — which effectively rules out cross-field `.refine()`/`.superRefine()` on the
  schema passed to `withStructuredOutput`. So the marker⇄citation consistency check (every `[^n]`
  in `narrativeBody` has a matching `citations` entry, and every `citations` entry is referenced by
  at least one marker) is a plain post-parse validation function in `synthesize()`, run after
  `ThesisSynthesisOutputSchema.parse()` succeeds. Independently unit-testable.

### Rendering (`tipTapUtils.ts`)

- `buildTipTapDoc` gains an optional `citations` param. When present, `parseInline` recognizes
  `[^n]` tokens inside paragraph/heading/list-item text and splices in `evidenceMention` node(s) at
  that exact position — one node per hash in the citation's `fileHashes` — instead of leaving it as
  literal text.
- When `citations` is absent (legacy callers — humans writing via the UI, or any MCP caller still
  using the flat `evidenceHashes` array), behavior is **unchanged**: the existing trailing
  evidence-chip paragraph still renders. This keeps `create_thesis_draft`'s existing contract
  backward-compatible.
- No frontend change needed: `TipTapRenderer.tsx` already renders `evidenceMention` nodes as inline
  chips wherever they appear in a paragraph's content array — inline placement was already
  supported, only the backend ever generated them exclusively in a trailing block.
- `parseMentions.ts` needs no change — it already walks the whole node tree recursively and dedupes
  by `type:refId`, so inline mentions are picked up identically to trailing-block ones.

### MCP contract (`createThesisDraft.ts` / `suggestThesis.ts`)

- `create_thesis_draft` gains an optional `citations` param (same shape), passed through to
  `buildTipTapDoc`. `evidenceHashes` stays as-is for backward compatibility and as the fallback
  when a caller has no per-claim citations to offer.
- `suggest_thesis`'s `readyForDraft` now includes `citations` alongside `title`/`body`/`keyFigures`,
  and top-level `supportingHashes` in the response is the derived (not LLM-generated) flattened
  list described above.

## 4. Test-first plan

Written before implementation, per explicit instruction to protect thesis quality across the
change:

1. `ThesisSynthesisAgent.test.ts` — schema accepts `citations` with repeated `fileHash` values
   across entries and multiple hashes per entry; post-parse validator rejects a marker with no
   matching citation, rejects a citation never referenced by a marker, accepts a fully consistent
   pair.
2. New `tipTapUtils.test.ts` — inline `[^n]` → `evidenceMention` splicing at the correct position;
   multiple hashes in one footnote → multiple consecutive mention nodes; no `citations` param →
   byte-identical output to pre-change behavior (regression guard); heading/list-item text also
   supports inline markers, not just paragraphs.
3. `mcpTools.test.ts` (`createThesisDraftHandler`, `suggestThesisHandler`) — end-to-end citations
   passthrough; existing tests that omit `citations` continue to pass unmodified (backward-compat
   regression guard); `supportingHashes` derivation from `citations` (order + dedup).

## 5. Status log

- 2026-08-18 — Design agreed with user after live-testing `suggest_thesis` twice (pre- and
  post-legal-framing-fix, see `docs/gf-thesis-synthesis-legal-framing` context in git history /
  PR #38). Dev-plan written. Implementation starting test-first.
- 2026-08-18 — **Implemented, test-first, all green (551/551 backend tests, both frontend and
  backend typecheck clean).** Built in this order: `ThesisSynthesisAgent.test.ts` updated first
  (new `citations` fixture shape, `validateCitationConsistency`/`deriveSupportingHashes` test
  coverage) → schema + validator + derivation helper implemented in `ThesisSynthesisAgent.ts` →
  prompt updated in `thesisSynthesis.ts` (also re-applied the LEGAL FRAMING / causes-of-action /
  keyFigures rules from PR #38, since checking out `master` mid-session reverted this file to its
  pre-fix state — both changes now land together on this branch) → new `tipTapUtils.test.ts`
  written first, then `buildTipTapDoc`/`parseInline` extended for inline `[^n]` splicing →
  `createThesisDraft.ts` + `suggestThesis.ts` wired, with `mcpTools.test.ts` updated/extended for
  end-to-end + backward-compat coverage → frontend `ThesisSuggestion` type in `theses/page.tsx`
  extended to match.
  - Two real bugs caught and fixed while wiring the MCP/REST layer, not designed for up front:
    (1) `createThesisDraftHandler`'s `evidenceLinked` count and "no evidence" warning only looked
    at the flat `evidenceHashes` array, so a caller citing evidence only via `citations` would
    have been incorrectly told "no evidence provided" — fixed to union both sources.
    (2) `POST /api/thesis/draft`'s `DraftThesisSchema` (Zod, REST wrapper consumed by
    `theses/page.tsx`) had no `citations` field, and Zod strips unknown keys by default — the
    frontend-driven creation flow would have silently dropped every citation the suggestion
    included, even though the MCP tool itself fully supported it. Caught by checking the REST
    layer explicitly, not just the MCP layer — the two are separate schemas over the same handler.
  - Known gap, not backfilled here (pre-existing, not introduced by this change): `thesisRoutes.ts`
    has no test file coverage for `/api/thesis/draft` or `/api/thesis/suggest` at all — the fix
    above is protected by `DraftThesisSchema`'s type-level shape but not by a REST-level regression
    test. Worth a follow-up if this route gets touched again.
  - Not yet done: extending `DevilsAdvocateAgent` to verify each footnote's citation against its
    claim (the "verification, not generation" second pass described in §2) — out of scope for this
    change, flagged there as a natural follow-up, not started.
  - Next: land to staging, re-run `suggest_thesis` live against the real evidence vault a third
    time to confirm inline footnotes actually render as expected end-to-end, then (finally) create
    the first real thesis.
