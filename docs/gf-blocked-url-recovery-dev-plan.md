# GF Blocked-URL Evidence Recovery — Dev Plan

**Status:** Phase 1 ✅ DONE 2026-08-20, committed on `refactor/gf-evidence-shared-helpers`
(`c13baba`), pushed, PR not yet opened. Phase 2 ✅ DONE 2026-08-20, committed on
`schema/gf-evidence-additional-screenshot-urls` (`a3496fe`), pushed, PR not yet opened, migration
**applied to the staging DB** — see §5. Phase 3 ✅ DONE 2026-08-20 on `feat/gf-evidence-recovery-phase3`
(branched from `schema/gf-evidence-additional-screenshot-urls`, merged with `refactor/gf-evidence-shared-helpers`
so both Phase 1 and Phase 2 are ancestors — those two branches never shared a common base, both forked
independently from `master`). Phases 4-5 not started. Supersedes the first draft (same date): the
permission model and multi-screenshot handling were reconsidered and locked in below before any
implementation began, per explicit user request to agree on the solution first.

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

### Phase 4 — Public REST routes + MCP tool
§3.3 and §3.4. New tests mirroring the existing route/tool test files: happy path (1 screenshot), happy
path (multiple screenshots → `additionalScreenshotUrls` populated in order), oversized/over-count
rejected, anonymous `createdById: null` on the REST path vs. stamped on the MCP path. Full suite must
stay green end to end (confirm current count before merging — recorded at 612/612 as of the last MCP
OAuth ship, but other work may have moved it since).

### Phase 5 — Frontend: render `additionalScreenshotUrls` on the evidence detail page
`apps/glass-fortress/frontend` — the evidence detail page/component that currently renders `fileUrl`
needs to also render the array, so a reviewer can see every captured screenshot before promoting a
`PENDING_REVIEW` record. Minimal scope: no new UI for *submitting* the multi-screenshot recovery form
itself is included in this plan (that's a separate, larger frontend feature) — this phase only covers
making already-created recovery evidence reviewable. `GET /api/evidence/:id`
([evidenceRoutes.ts:736-761](../apps/glass-fortress/backend/src/routes/evidenceRoutes.ts#L736-L761))
needs `additionalScreenshotUrls: record.additionalScreenshotUrls` added to its response payload first.

---

## 6. How to work this plan

Standard branch protocol: feature branch → PR → `staging` → explicit approval → `master`. Suggested PR
split: Phase 1 (refactor) alone; Phase 2 (schema) alone, since it touches the staging DB directly per the
project's migration protocol; Phase 3-4 (the actual new capability) together; Phase 5 (frontend) separate
since it's a different app directory. Run the backend Jest suite after every phase.
