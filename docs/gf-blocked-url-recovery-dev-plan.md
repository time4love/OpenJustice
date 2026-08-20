# GF Blocked-URL Evidence Recovery — Dev Plan

**Status:** Phase 1 ✅ DONE 2026-08-20, committed on `refactor/gf-evidence-shared-helpers`
(`c13baba`), pushed, PR not yet opened. Phase 2 ✅ DONE 2026-08-20, committed on
`schema/gf-evidence-additional-screenshot-urls` (`a3496fe`), pushed, PR not yet opened, migration
**applied to the staging DB** — see §5. Phases 3, 4, 5, and 5.1 (`delete_evidence`, unplanned — see §5)
all ✅ DONE 2026-08-20, all on `feat/gf-evidence-recovery-phase3` (branched from
`schema/gf-evidence-additional-screenshot-urls`, merged with `refactor/gf-evidence-shared-helpers` so
both Phase 1 and Phase 2 are ancestors — those two branches never shared a common base, both forked
independently from `master`). **This feature is now fully implemented and live-verified end-to-end**;
only PR review/merge remains. Supersedes the first draft (same date): the permission model and
multi-screenshot handling were
reconsidered and locked in below before any implementation began, per explicit user request to agree on
the solution first.

Phase 2's migration surfaced a pre-existing, unrelated schema/DB drift risk (Prisma's auto-diff
proposing to drop the raw-SQL `evidence_embeddings` table) — fixed separately on
`fix/gf-evidence-embeddings-schema-drift` (`2de874b`), not folded into this feature's branches since it's
orthogonal. See [gf-prisma-migrate-dev-gotcha.md](/Users/jonathand/.claude/projects/-Users-jonathand-OpenJustice/memory/gf-prisma-migrate-dev-gotcha.md)
for the root cause and the prevention mechanism now in place (`npm run db:check-drift`, documented in the
root `CLAUDE.md`).
**Created:** 2026-08-20. **Revised:** 2026-08-20 (permission tier + multi-screenshot resolved).
**Scope:** Glass Fortress backend (`apps/glass-fortress/backend`) + a small, necessary frontend addition
(`apps/glass-fortress/frontend`) so reviewers can actually see multi-screenshot evidence. No Bronze
Fortress impact.

---

## 0. Why this exists

Some government/health sites are blocked from direct fetch and not archived by the Wayback Machine —
neither `create_evidence_from_url` (MCP) nor `POST /api/evidence/intake` (REST) can retrieve them, and
neither path persists anything when the fetch fails (confirmed by reading both call sites — see §1). The
only way to get the content in is a researcher manually capturing it — and since screenshots are far
harder to fabricate at the pixel level than typed text, they should be treated closer to today's public
file-upload trust tier than to the researcher-only `create_evidence_from_text` tier that a plain "paste
the text instead" flow would have needed.

---

## 1. Current state (confirmed by reading the code, not assumed)

- `create_evidence_from_url` ([createEvidenceFromUrl.ts:14](../apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromUrl.ts#L14)) does a raw `fetch()`, throws on non-2xx or too-short content, uncaught — surfaces as a generic 500 in [mcpRoutes.ts:228](../apps/glass-fortress/backend/src/mcp/mcpRoutes.ts#L228). Nothing about the failure is persisted.
- `POST /api/evidence/intake` ([evidenceRoutes.ts:144](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts#L144)) uses a different implementation (`scrapeUrl()`, axios + Readability, [webScraper.ts:11](../apps/glass-fortress/backend/src/utils/webScraper.ts#L11)); on 403/401 it already tells the human to screenshot the page and upload it as a file ([webScraper.ts:57-62](../apps/glass-fortress/backend/src/utils/webScraper.ts#L57-L62)). Also persists nothing about the failure.
- **Two genuinely different trust tiers already exist in production, not one:**
  - **Public REST** (`/intake` + `/confirm`, no auth) — anyone can submit a file or a *server-fetched* URL; `/confirm` registers on-chain and sets `status: 'CONFIRMED'` directly, with **no human review step** ([evidenceRoutes.ts:296-317](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts#L296-L317)).
  - **MCP researcher tools** (bearer token, admin-approved `Researcher` row required) — always save `status: 'PENDING_REVIEW'`, held for human review before anything reaches chain.
  - `create_evidence_from_text` ([createEvidenceFromText.ts:12](../apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromText.ts#L12)) is the closest existing precedent to this feature: it takes a `url` field that's accepted for provenance but **never fetched or verified** — and it sits on the cautious side (researcher-gated + reviewed), not the public/direct-to-chain side. That distinction is *why* the source-URL claim, not the submitter's identity, is what determines the review gate in the design below.
- The REST file-upload path (`multer`, [evidenceRoutes.ts:28-40](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts#L28-L40)) already accepts `image/jpeg`/`image/png` and already runs them through `IntakeAgent.analyzeEvidence()`, which already does vision analysis ([IntakeAgent.ts:228-247](../apps/glass-fortress/backend/src/services/IntakeAgent.ts#L228-L247)) — live, tested code, not a gap.

---

## 2. Decisions

### 2.1 Permission tier — resolved
**Open submission, still reviewed.** No researcher gate: any visitor can submit screenshot-based
recovery, matching the reasoning that a screenshot doesn't need a vetted submitter any more than a
regular photo upload does. **But it still saves as `PENDING_REVIEW`, never straight to `CONFIRMED`** —
because the *paired source URL* is an unverified claim regardless of who submits it, same reasoning that
already keeps `create_evidence_from_text` review-gated (§1). The rule that decides review-gating for any
Evidence-creation call site, present and future: **was the source URL actually fetched and verified by
the server, or merely asserted?** Server-fetched → can go straight to `CONFIRMED` (unchanged, existing
behavior). Merely asserted (text-paste today; screenshot-recovery here) → always `PENDING_REVIEW`,
regardless of caller.

This means two entry points, one shared core:
- A **public REST path** (no auth) for any visitor using the website.
- A **thin MCP tool** (still bearer-gated, since MCP has no unauthenticated write tier structurally) for
  the in-chat agentic researcher workflow — the original scenario: Claude hits a blocked URL mid-research
  and needs to hand off a screenshot without the human leaving the conversation.

Both call the same underlying persistence function — see §3.2 — so the "who can call this" difference
never becomes a second implementation of "how evidence gets created."

### 2.2 Multi-screenshot — resolved
**Additive array field.** A long page needing several captures is **one** piece of evidence, not several
— matching how the URL-fetch path already treats a whole page as one `Evidence` row. Add
`Evidence.additionalScreenshotUrls String[] @default([])` alongside the existing single `fileUrl` (which
holds the first/primary screenshot). Purely additive — no migration of existing rows, no change to any
existing consumer of `fileUrl`. A single new `IntakeAgent` method analyzes all images **together** in one
vision call, synthesizing one `IntakeOutput` (one `summary`, one `evidenceTier`, one `evidenceDate` — not
one per image) — this is the part that actually makes "the combination of all screenshots is the
evidence" real, not just a storage convention.

Combined `fileHash` = hash of the ordered concatenation of every image buffer (`Web3Service.hashFile
(Buffer.concat(buffers))`) — order-dependent, so the caller must submit screenshots in reading order
(documented in the tool/route description).

**Frontend implication (necessary, not optional):** a `PENDING_REVIEW` record only gets promoted by a
human who can actually see what they're reviewing. The evidence detail page must render
`additionalScreenshotUrls` alongside `fileUrl`, or a reviewer literally cannot see captures 2..N before
promoting. Included as Phase 5 below.

---

## 3. Architecture

### 3.1 `IntakeAgent.analyzeMultiImageEvidence` — new method, existing method untouched
[IntakeAgent.ts](../apps/glass-fortress/backend/src/services/IntakeAgent.ts). New method, not a
modification of `analyzeEvidence` (which keeps its single existing caller, the plain file-upload path,
unchanged and untouched):
```ts
async analyzeMultiImageEvidence(
  images: { buffer: Buffer; mimeType: string }[],
  contextNote?: string,
): Promise<IntakeOutput>
```
Builds one `image_url` content block per image via the existing `buildFileContentBlock` helper (already
image-format-aware), plus an instruction that these are sequential parts of **one** document to be
synthesized as a single analysis, not scored independently — and an optional leading text block
(`contextNote`) carrying `failedUrl`/`failureReason`, mirroring how `analyzeText` already prepends
`Source URL: ...` ([IntakeAgent.ts:311-313](../apps/glass-fortress/backend/src/services/IntakeAgent.ts#L311-L313)).
This `contextNote` is the mechanism that satisfies
[feedback-evidentiary-proof-standard.md](/Users/jonathand/.claude/projects/-Users-jonathand-OpenJustice/memory/feedback-evidentiary-proof-standard.md):
the AI's own `summary`/`missingInformation` output documents that this is a screenshot recovery of an
unfetched URL, visible to the human reviewer on the record itself.

### 3.2 Shared persistence core — one function, three callers
New `apps/glass-fortress/backend/src/lib/persistScreenshotEvidence.ts`:
```ts
export async function persistScreenshotEvidence(input: {
  images: { buffer: Buffer; mimeType: string }[]; // order matters — reading order
  analysis: IntakeOutput;                          // already computed by analyzeMultiImageEvidence
  sourceUrl: string;                               // the failed/blocked URL — never fetched here
  createdById: string | null;                      // null for public/anonymous submissions
}): Promise<PersistedEvidenceResult>
```
Does: `Web3Service.hashFile` on the concatenated buffers → duplicate check (`prisma.evidence.findUnique`,
same pattern as every other creation path) → `upsertKeyFigures` (Phase 1, shared helper — see below) →
upload every image via `StorageService.uploadEvidenceFile` (first → `fileUrl`, rest →
`additionalScreenshotUrls`) → `prisma.evidence.create({ ...buildEvidenceAnalysisData(analysis), status:
'PENDING_REVIEW', sourceUrl, fileUrl, additionalScreenshotUrls, createdById })`. `createdById` is `null`
for anonymous public submissions, mirroring how `getResearcherId()` already returns `null` for
unauthenticated contexts elsewhere in this codebase — no new null-handling pattern introduced.

Callers:
- REST `POST /api/evidence/recover-confirm` (public, §3.3)
- MCP tool `recover_evidence_from_screenshot` (researcher bearer token, §3.4) — calls
  `analyzeMultiImageEvidence` itself first (one-shot, same UX pattern the other two MCP tools already
  use), then this function.

### 3.3 New public REST routes (no auth, `aiCostLimiter`-protected like existing routes)
In [evidenceRoutes.ts](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts). Dedicated routes
rather than a third branch bolted onto the already two-branch `/intake`/`/confirm` handlers — matches
this file's existing pattern of one route per distinct submission shape:

- `POST /api/evidence/recover-intake` — `multer.array('screenshots', 10)` + body `{ sourceUrl,
  failureReason? }`. Calls `analyzeMultiImageEvidence`, returns the draft analysis (mirrors `/intake`'s
  role — no persistence).
- `POST /api/evidence/recover-confirm` — same multipart shape, plus the already-computed `analysis` JSON
  (the frontend round-trips it after the user reviews the draft, exactly like the existing `/confirm`
  flow does today for both its branches). Calls `persistScreenshotEvidence`. `createdById: null` (no
  researcher context exists on this public route).

Multer: reuse the existing `ALLOWED_MIME_TYPES`/size-cap constants (extracted in Phase 1 below), plus a
count cap (10 screenshots) on the new `.array(...)` config.

### 3.4 New MCP tool: `recover_evidence_from_screenshot`
New `apps/glass-fortress/backend/src/mcp/tools/recoverEvidenceFromScreenshot.ts`:
```ts
export const recoverEvidenceFromScreenshotSchema = {
  failedUrl: z.string().url()
    .describe('The source URL that could not be fetched directly (blocked, not in Wayback Machine)'),
  failureReason: z.string().optional()
    .describe('Why the direct fetch failed, e.g. "HTTP 403" — becomes provenance context'),
  screenshots: z.array(z.object({
    base64: z.string(),
    mimeType: z.enum(['image/jpeg', 'image/png']),
  })).min(1).max(10)
    .describe('One or more screenshots, in reading order, together covering the full page'),
};
```
Handler: `analyzeMultiImageEvidence(images, contextNote)` → `persistScreenshotEvidence({ ..., createdById:
getResearcherId() })`. Registered in [mcpServer.ts](../apps/glass-fortress/backend/src/mcp/mcpServer.ts)
alongside the other two evidence tools, added to `writeTools` in
[mcpRoutes.ts:254](../apps/glass-fortress/backend/src/mcp/mcpRoutes.ts#L254) — still bearer-gated,
because MCP write tools have no lower tier today, but this is now purely a routing/access-surface fact,
not a "researchers are more trusted for this content type" claim (§2.1 already resolved that question the
other way).

---

## 4. Explicitly out of scope

- Merging the two different URL-fetch implementations (raw `fetch()` in the MCP url tool vs.
  `axios`+Readability in `webScraper.ts`) — pre-existing duplication, orthogonal to this feature since
  recovery never fetches anything itself.
- Updating `mapEvidenceToRecord`/timeline/search card views to show every screenshot — those are list/
  thumbnail views; only the detail page (where review/promotion actually happens) needs the full set.
- A machine-queryable "this record was screenshot-recovered" flag — `sourceUrl` + `fileUrl` set together
  is already a legible signal (no existing call site sets both today), same conclusion as the first
  draft.

---

## 5. Implementation phases

### Phase 1 — ✅ DONE 2026-08-20 — Extract shared helpers (mechanical, no behavior change)
- `src/lib/upsertKeyFigures.ts` — extracted the KeyFigure-upsert block. Turned out to be duplicated at
  **4** call sites, not the 3 found during design: `createEvidenceFromUrl.ts`, `createEvidenceFromText.ts`,
  REST `/confirm` (`evidenceRoutes.ts`), and — found while implementing, not during design research — the
  whistleblower/thesis ephemeral-evidence submission path (`thesisRoutes.ts` ~line 1028, inside
  `POST /api/thesis/:id/attachments` or equivalent). All four now call the shared helper; the Phase 3-4
  code will be a fifth caller, not a fifth copy.
- `src/lib/evidenceFileConstraints.ts` — extracted `ALLOWED_EVIDENCE_MIME_TYPES` and
  `MAX_EVIDENCE_FILE_BYTES` out of `evidenceRoutes.ts`'s multer config; `evidenceRoutes.ts` now imports
  both instead of defining `ALLOWED_MIME_TYPES`/`10 * 1024 * 1024` inline. Ready for Phase 4's new multer
  config and the MCP tool's manual size check to reference the same values.
- Typecheck clean, full Jest suite green: **34 suites / 623 tests passed**, zero test changes needed (pure
  refactor, confirming no behavior change). Work is on branch `refactor/gf-evidence-shared-helpers`,
  uncommitted pending explicit go-ahead to commit/PR.

### Phase 2 — ✅ DONE 2026-08-20 — Schema migration
```prisma
additionalScreenshotUrls String[] @default([])
```
added to `Evidence` ([schema.prisma:193-234](../apps/glass-fortress/backend/prisma/schema.prisma#L193-L234)).

**Important process finding:** `prisma migrate dev --create-only` cannot be used in this project —
running it surfaced that Prisma's auto-diff proposes **dropping `evidence_embeddings`** (6 rows), a
raw-SQL pgvector table that isn't modeled in `schema.prisma` by design (documented in the two most recent
migrations, `20260818000000_evidence_onchain_integrity` and `20260819000000_mcp_oauth_storage` — this is
a known, already-worked-around gap, not something new). Followed the same established pattern: wrote
`prisma/migrations/20260820000000_evidence_additional_screenshot_urls/migration.sql` by hand (single
`ALTER TABLE "Evidence" ADD COLUMN ...`), then applied with `prisma migrate deploy` (which runs pending
migration files directly, no auto-diff, no drop risk) — never `migrate dev`.

Applied to staging, verified post-apply: `information_schema.columns` shows the new column as
`text[] default '{}'::text[]`; `evidence_embeddings` still has all 6 rows (untouched); all 7 existing
`Evidence` rows correctly read back `additionalScreenshotUrls: []`. Typecheck clean, full suite green
(34/34 suites, 623/623 tests) after `prisma generate` picked up the new field. **Production migration
deferred** to just before the eventual `staging` → `master` ship, per the project's standard migrate-then-
deploy sequencing (see `docs/gf-evidence-integrity-dev-plan.md` §3.7 for the precedent) — not run this
session.

### Phase 3 — ✅ DONE 2026-08-20 — `IntakeAgent.analyzeMultiImageEvidence` + `persistScreenshotEvidence`
Implemented as designed in §3.1 and §3.2, both on branch `feat/gf-evidence-recovery-phase3`.

- `IntakeAgent.analyzeMultiImageEvidence(images, contextNote?)` — new method
  ([IntakeAgent.ts](../apps/glass-fortress/backend/src/services/IntakeAgent.ts)), `analyzeEvidence` and
  `analyzeText` untouched. Builds one content block per image via the existing `buildFileContentBlock`,
  an optional leading `contextNote` text block, and — when more than one image is submitted — an explicit
  synthesis instruction telling the model to treat the images as one document. Shares the same
  gershayim-artifact `keyFigures` filter as the other two methods.
- `persistScreenshotEvidence()` — new
  ([persistScreenshotEvidence.ts](../apps/glass-fortress/backend/src/lib/persistScreenshotEvidence.ts)).
  `Web3Service.hashFile(Buffer.concat(...))` on the images in submitted order → duplicate check → returns
  early with the existing record's fields for a duplicate hash (no upload, no create, no KeyFigure upsert)
  → `upsertKeyFigures` → uploads every image via `StorageService.uploadEvidenceFile` in parallel
  (`Promise.all`, order preserved by array index — first becomes `fileUrl`, the rest
  `additionalScreenshotUrls`) → `prisma.evidence.create` with `status: 'PENDING_REVIEW'`, no on-chain
  registration, no vector-store upsert (mirrors `createEvidenceFromUrl`/`createEvidenceFromText`, not the
  public `/confirm` route). Because every upload happens before `create()`, a mid-upload `StorageService`
  failure throws before any `Evidence` row is written — no row with a partially-uploaded image set is
  possible.
- New unit tests: [IntakeAgent.test.ts](../apps/glass-fortress/backend/test/IntakeAgent.test.ts) (8 new
  cases — zero-image guard, single synthesized output for multiple images, per-image content-block
  encoding and order, the multi-image synthesis instruction, contextNote as a leading block, its absence
  when omitted, the keyFigures filter, error propagation) and
  [persistScreenshotEvidence.test.ts](../apps/glass-fortress/backend/test/persistScreenshotEvidence.test.ts)
  (7 new cases — zero-image guard, hash order-dependence via a forward/reverse comparison, duplicate
  short-circuit, upload-failure abort, `fileUrl`/`additionalScreenshotUrls` ordering, `createdById`
  stamped-vs-omitted, KeyFigure upsert call). Typecheck clean, full suite green: **35/35 suites, 632/632
  tests** (`npx prisma generate` was required first — the checked-out `@prisma/client` predated Phase 2's
  schema field). `npx eslint` on both new/changed files surfaces only the same
  `restrict-template-expressions` (number in a template literal) and `dot-notation` findings that already
  exist throughout the codebase (e.g. `createEvidenceFromUrl.ts`, `ThesisSynthesisAgent.ts`) — pre-existing
  repo-wide lint debt, not a regression introduced here.

**Branch topology note:** Phase 1 (`refactor/gf-evidence-shared-helpers`) and Phase 2
(`schema/gf-evidence-additional-screenshot-urls`) were each branched independently from `master` and never
merged into each other, so `feat/gf-evidence-recovery-phase3` had to merge both to get `upsertKeyFigures`/
`evidenceFileConstraints` (Phase 1) and the `additionalScreenshotUrls` column (Phase 2) together. One
conflict, in this doc's own status/Phase-2 sections (both branches had edited them); resolved in favor of
the more current content. Worth resolving before Phase 4: get PR #71 and #72 merged to `staging` so future
branches fork from a single base instead of repeating this merge.

### Phase 4 — ✅ DONE 2026-08-20 — Public REST routes + MCP tool
Implemented as designed in §3.3 and §3.4, on branch `feat/gf-evidence-recovery-phase3` (same branch as
Phase 3 — not split into its own branch as originally suggested in §6, since both are small and land
together cleanly).

- `POST /api/evidence/recover-intake` and `POST /api/evidence/recover-confirm`
  ([evidenceRoutes.ts](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts)) — a new
  `uploadScreenshots` multer config (JPEG/PNG only, no PDF; `.array('screenshots', 10)`), both behind
  `aiCostLimiter` like every other AI/chain-triggering route. `/recover-intake` calls
  `analyzeMultiImageEvidence` and returns the draft analysis, no persistence (mirrors `/intake`).
  `/recover-confirm` validates the round-tripped `analysis` JSON against `IntakeOutputSchema`, then calls
  `persistScreenshotEvidence` with `createdById: null` — always anonymous, since this route has no
  researcher context. Both reuse `MAX_EVIDENCE_FILE_BYTES` from the Phase 1 shared constants.
- `recover_evidence_from_screenshot`
  ([recoverEvidenceFromScreenshot.ts](../apps/glass-fortress/backend/src/mcp/tools/recoverEvidenceFromScreenshot.ts))
  — schema exactly as designed in §3.4. Decodes each screenshot's base64, rejects any over
  `MAX_EVIDENCE_FILE_BYTES` before calling the LLM, builds a `contextNote` from `failedUrl`/
  `failureReason`, calls `analyzeMultiImageEvidence` then `persistScreenshotEvidence` with
  `createdById: getResearcherId()`. Registered in
  [mcpServer.ts](../apps/glass-fortress/backend/src/mcp/mcpServer.ts) and added to both `WRITE_TOOLS`
  (the actual auth gate) and the `GET /api/mcp` health-check tool list in
  [mcpRoutes.ts](../apps/glass-fortress/backend/src/mcp/mcpRoutes.ts) — bearer-gated, same as the other
  two `create_evidence_from_*` tools.
- New tests: [recoverEvidenceFromScreenshot.test.ts](../apps/glass-fortress/backend/test/recoverEvidenceFromScreenshot.test.ts)
  (9 cases — synthesized-analysis happy path, image order/decoding, contextNote construction with/without
  `failureReason`, oversized-screenshot rejection before the LLM call, `createdById` stamped inside a
  `researcherContext.run()` vs. unset outside one, duplicate short-circuit, error propagation) and
  [evidenceRecoverRoutes.test.ts](../apps/glass-fortress/backend/test/evidenceRecoverRoutes.test.ts) (16
  cases over real HTTP via `supertest` — happy path for both routes, multi-screenshot ordering, no-file/
  missing-body/bad-JSON/schema-invalid 400s, non-image and >10-file multer rejections, duplicate
  short-circuit, and an upload-failure abort). Full suite green: **37/37 suites, 656/656 tests**.
  Typecheck clean; `eslint` on all four touched/new files surfaces only the same pre-existing repo-wide
  findings confirmed in Phase 3 (deprecated `z.string().url()`/`.flatten()`/`server.tool()`, number-in-
  template-literal) — every one already present on unrelated pre-existing lines in the same files, not
  something these changes introduced.
- **Two real bugs found and fixed while writing the route/tool tests, not during design** — worth keeping
  as testing lessons for this codebase specifically:
  1. `evidenceRoutes.ts`'s `getIntakeAgent()` (and `getStorageService()`) are **module-level singletons**
     — constructed once and reused for the process's lifetime. A test file that reassigns
     `MockIntakeAgent.mockImplementation(...)` fresh inside `beforeEach` (the pattern
     `mcpTools.test.ts` uses safely, because its MCP-tool `getAgent()` calls are un-cached, `new
     IntakeAgent()` per request) silently breaks against these two routes: the singleton is captured on
     whichever test runs first, and every later test's assertions read an unused mock while the real
     calls go to the first test's stale one. Fix: declare the mock function reference once at module
     scope and reconfigure *it* (`.mockReset().mockResolvedValue(...)`) per test, never reassign
     `mockImplementation` itself after the first construction.
  2. `mockResolvedValueOnce`/`mockRejectedValueOnce` queues are **not** cleared by `clearMocks: true` /
     `jest.clearAllMocks()` (those only clear call history, not queued implementations). A test that
     queues N "Once" values but only consumes M < N leaks the remainder into the next test's first calls.
     Fix: `.mockReset()` immediately before re-queuing Once values in a shared `beforeEach`.
  Neither bug is specific to this feature — both are latent traps for any future test file that mocks a
  cached-singleton dependency or shares an Once-queued mock across a `beforeEach`.

### Phase 5 — ✅ DONE 2026-08-20 — Frontend: render `additionalScreenshotUrls` on the evidence detail page
Implemented as designed, on branch `feat/gf-evidence-recovery-phase3`.

- Backend: `additionalScreenshotUrls: record.additionalScreenshotUrls` added to `GET /api/evidence/:id`'s
  response payload ([evidenceRoutes.ts](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts)).
- Frontend: a new "צילומי מסך"/"Screenshots" `Section` on the evidence detail page
  ([page.tsx](../apps/glass-fortress/frontend/src/app/[locale]/evidence/[id]/page.tsx)), rendered only
  when `additionalScreenshotUrls` is non-empty — ordinary evidence's existing "View Source" link is
  untouched. Shows `[fileUrl, ...additionalScreenshotUrls]` as a clickable thumbnail grid (`next/image`,
  order preserved) so a reviewer can see every capture, not just the first, before promoting a
  `PENDING_REVIEW` record. `additionalScreenshotUrls` added to the shared
  [evidence.ts](../apps/glass-fortress/frontend/src/types/evidence.ts) type. New translation keys
  (`screenshots`, `screenshotAlt`) added to both `messages/en.json` and `messages/he.json`.
- `next.config.ts`: added `images.remotePatterns` for `**.supabase.co/storage/v1/object/public/evidence/**`
  — previously unset, since no existing code path rendered `fileUrl` as an image (only as a link).
- Minimal scope honored as designed: no submission-form UI included.
- **Verified live**, not just code-reviewed: ran the full pipeline end-to-end against real staging
  infrastructure — two real test screenshots through `recover-intake` → real Gemini vision call
  (correctly returned `isRelevant: false` for blank test images) → `recover-confirm` → a real
  `PENDING_REVIEW` row with real Supabase Storage URLs → loaded in the frontend, both images rendered
  correctly via `next/image`'s optimizer. The throwaway record and its two files were deleted after
  (see `delete_evidence` below — this test is exactly why it exists). Surfaced and fixed one real
  environment issue along the way: this local sandbox defaults to Node 20, but `@supabase/supabase-js`'s
  Realtime client needs Node ≥22's native WebSocket support (package.json already declares
  `"node": ">=22"`, and real deployments run it) — re-ran the backend dev server under Node 22 (`fnm`) to
  match; not a code bug, purely a local-environment mismatch.
- Typecheck and `eslint` clean on all touched frontend files (zero findings, not even pre-existing-pattern
  ones). Backend: full suite green, **40/40 suites, 670/670 tests** (one unrelated file,
  `oauthInteractionRoutes.test.ts`, failed on a single full-suite run from cross-file test-order pollution
  pre-existing to this codebase, not touched by this feature — passed clean both in isolation and on
  re-run).

### Phase 5.1 — ✅ DONE 2026-08-20 — `delete_evidence` MCP tool (unplanned, added mid-Phase-5)
Surfaced directly by Phase 5's live verification: cleaning up the throwaway test record required a raw
Prisma script, since **no delete capability existed anywhere** — not in the MCP tool set, not as a REST
route. Added `delete_evidence` (MCP-only, bearer-gated via `WRITE_TOOLS` — deliberately no REST route,
since this is an admin/researcher cleanup action the public site has no reason to expose):
- `src/services/deleteEvidence.ts` — shared service, mirrors `promoteEvidence.ts`'s
  "resolve the record, hand it a shared function" shape. Refuses three cases, each returning a `deleted:
  false` result with an explanatory message rather than throwing:
  1. **Status ≠ `PENDING_REVIEW`** — once `CONFIRMED` (on-chain), a record is meant to be immutable;
     deleting the DB row would create a permanent, unrecoverable mismatch with the blockchain
     ([[feedback-evidentiary-proof-standard]]). User-confirmed scope decision, not assumed.
  2. **Non-null `ipfsCid`** — that field is only ever set by the separate whistleblower/thesis-attachment
     path (`EphemeralAnalysisService.ts`'s Pinata upload), never by this feature or any other
     Evidence-creation call site (confirmed: `persistScreenshotEvidence` and every other creation path
     write to Supabase Storage only, never Pinata — screenshot-recovery evidence is public-page capture,
     not sensitive whistleblower material, so it doesn't need IPFS's decentralized-resilience property).
     No verified Pinata delete/unpin implementation exists yet, and IPFS unpinning wouldn't guarantee the
     content is unreachable if another node has it cached — refusing outright beats silently leaving an
     orphaned pin. User-confirmed scope decision: research Pinata's real v3 delete API as a separate,
     dedicated task rather than guessing at it here.
  3. **Cited by a thesis** (`ThesisMention.refId` matches the fileHash) — that field is a plain string
     reference, not a real foreign key, so deleting Evidence underneath an existing citation would
     silently leave it dangling.
  Otherwise: `StorageService.deleteEvidenceFiles()` (new method, extracts the storage path from each
  public URL, batches into one `remove()` call) for `[fileUrl, ...additionalScreenshotUrls]`, then
  `prisma.evidence.delete()`.
- `src/mcp/tools/deleteEvidence.ts` — thin MCP wrapper, same shape as `promoteEvidence.ts`'s tool file.
  Registered in `mcpServer.ts`, added to both `WRITE_TOOLS` and the `GET /api/mcp` health-check tool list
  in `mcpRoutes.ts`.
- New tests: `deleteEvidence.test.ts` (7 cases — happy path with/without files, all three refusal cases,
  citation-check scoping, storage-failure propagation), `storageServiceDelete.test.ts` (4 cases — empty-
  array no-op, URL→path extraction across multiple files in one call, unrecognised-URL rejection, Supabase
  error propagation), `deleteEvidenceTool.test.ts` (3 cases — not-found, delegation, refusal pass-through).
  Full suite green: **40/40 suites, 670/670 tests**. Typecheck clean; lint shows only the same
  pre-existing repo-wide patterns (deprecated `z.string().uuid()`, `process.env[...]` dot-notation,
  number-in-template-literal) confirmed throughout Phases 3-4.
- Used for real immediately: deleted the Phase 5 QA test record it was built to clean up
  (`eacf2147-5a8f-4819-88ef-9c8156fd7fbc`) — confirmed gone via a 404 on re-fetch.

---

## 6. How to work this plan

Standard branch protocol: feature branch → PR → `staging` → explicit approval → `master`. Suggested PR
split: Phase 1 (refactor) alone; Phase 2 (schema) alone, since it touches the staging DB directly per the
project's migration protocol; Phase 3-4 (the actual new capability) together; Phase 5 (frontend) separate
since it's a different app directory. Run the backend Jest suite after every phase.
