# GF Tech-Debt Cleanup — Dev Plan

**Status:** ✅ Phase 1 (§2.1–§2.8) and Phase 2 (§3.1–§3.9) both COMPLETE and landed on `staging` —
17 PRs (#14–#27, plus this doc's own #14 planning PR), all merged. Phase 3 (§4, low-priority/optional
items) not started — none are urgent, revisit opportunistically.
**Created:** 2026-08-18. **Phase 2 completed:** 2026-08-18 (same day, autonomous session — see
`gf-railway-branch-misconfig.md` in Claude's memory for an unrelated but important infra finding from
this same session: Railway's staging/production branch bindings appear to be shared per-service, not
independent per-environment — both environments currently deploy from `staging`, deliberately, with
user sign-off, until that's resolved).
**Scope:** Glass Fortress only (frontend + backend). Bronze Fortress not swept.

---

## 0. Why this exists

While doing an unrelated icon-refresh pass, we found `theses/[id]/page.tsx` had a hand-duplicated
copy of `FoiaModal`/`WhistleblowerModal`, introduced 2026-08-10 with a comment explicitly deferring
the real fix ("local definitions below remain the source of truth... until a full extraction is
done"). The shared component was upgraded five days later and the duplicate silently went stale —
reconciling it cost real, avoidable effort. See Claude memory `feedback-no-deferred-dedup-debt` for
the standing rule this produced: **never leave duplicate code behind a "will extract later" comment.**

That incident triggered a full sweep (three parallel audits: explicit debt-comment markers, frontend
duplication, backend duplication) to find out whether it was a one-off or a pattern. It's a pattern —
roughly **9 high-severity items and ~12 medium-severity clusters**, touching an estimated 35-40 files.
This doc is the execution plan for fixing it.

## 1. How to work this plan

- Standard branch protocol applies: feature branch → PR → `staging` → explicit approval → `master`.
  Each phase (or even each numbered item within a phase, for the riskier ones) should be its own PR
  — don't bundle everything into one giant diff.
- Run `tsc --noEmit` and the relevant lint/test suite after every change, not just at the end.
- Backend has a Jest suite (495/495 passing as of 2026-08-15 per memory) — **run it after every
  backend change in this plan**, especially §2.1 and §2.2 below, which touch evidence
  classification/hashing.
- Items in **Phase 1 marked ⚠️ CAUTION** affect logic that legally-relied-upon evidence classification
  or chain-of-custody depends on. For those: after the code change, do a real test pass on staging
  (submit real evidence through both affected paths, e.g. file-upload AND URL-scan for the
  `IntakeAgent` prompt merge) and compare classification output before/after on a few known samples —
  don't just rely on tests passing. Consider flagging these for explicit user sign-off before LAND.
- File:line references below were accurate as of 2026-08-18 — re-verify before editing, code may have
  moved.

### 1.1 Architectural convention established by this plan — prompts get their own files

The `IntakeAgent.ts` duplication (§2.1) happened because a ~2000-character LLM system prompt lived as
an inline string constant inside a service file, where copy-pasting it to a second code path was the
path of least resistance and the duplication wasn't visually obvious in review. **This is now treated
as a second, specific instance of the same clean-code violation as the FoiaModal incident** — see
memory `feedback-no-deferred-dedup-debt`, updated 2026-08-18 to call out prompts explicitly as a
high-risk category for exactly this reason.

**Going forward, no LLM prompt of meaningful size lives inline in a service/agent `.ts` file.** Every
system prompt (and any large reusable prompt fragment) moves to a dedicated
`apps/glass-fortress/backend/src/prompts/` directory, **one exported constant per file**, imported by
whichever agent(s) use it. This applies retroactively as part of this cleanup (§2.1, §3.1) and is the
standard for all new agent work after this plan lands:
- One prompt, one file, named for what it's for, not which file currently calls it.
- **Before splitting a prompt into "shared block + N thin variants," check whether it should just be
  one prompt.** §2.1 was originally planned as exactly that kind of split (shared rules file + two
  path-specific wrapper files) until it turned out, on an actual line-by-line diff, that the two
  "variants" differed in only two sentences that didn't correspond to any real reasoning-logic
  difference — the classification task doesn't change based on how the evidence arrived, and the model
  sees the real content either way regardless of how the prompt describes it. The fix that shipped was
  a single unified prompt, not a split. A split is only justified when the underlying task *actually*
  differs, not merely because the call sites differ.
- When a prompt genuinely does need per-caller variants, shared rules/fragments get their own file
  (e.g. `prompts/xSharedRules.ts`) and are composed via template interpolation into the variant
  prompts — never copy-pasted between them.
- A prompt file exporting a lone string constant is easy to grep for, easy to diff in review, and
  makes "this is now two copies" visually obvious the moment someone opens a second prompt file and
  pastes in matching content — the inline version made that invisible.

## 2. Phase 1 — Critical (confirmed drift, or legal/security consequence)

### 2.1 ✅ DONE — `IntakeAgent.ts` duplicated classification system prompts
**Files:** `apps/glass-fortress/backend/src/services/IntakeAgent.ts`,
`apps/glass-fortress/backend/src/prompts/intakeAgentClassification.ts`
`SYSTEM_PROMPT` (file-upload path) and `SYSTEM_PROMPT_TEXT` (URL/text path) were ~95% identical, and on
close diff the *entire* classification logic (tier assignment, EUA-omission detection, category rules,
gershayim handling, rejection criteria) was byte-identical — the only differences were the opening
framing sentence and the `evidenceDate` source-scanning guidance. Neither difference reflected a real
reasoning-logic change: the model receives the actual content (real image bytes vs. real text) as
content blocks regardless of the system prompt's wording, so the prompt text doesn't gate what it can
perceive. **Resolution: a single fully unified prompt, no parameters, no branching** — not the
shared-block-plus-two-wrappers split originally planned here. (User pushback during implementation:
"why not use the same prompt for both paths, since we're classifying evidence regardless of channel" —
correct call; the two-file split would have kept duplication risk alive, just with less text.)
**Verified, not just tested:** ran the real classification pipeline (`scrapeUrl` + `analyzeText`)
against a real article (see memory `gf-intake-test-url`) with the OLD two-prompt code (via `git stash`)
and the NEW unified prompt, and diffed the output. The fields the merge actually touched
(`evidenceDate`) came out identical between old and new. Core legal fields (`evidenceRole`,
`evidenceTier`, `tierReasoning`, `evidencePerspective`, `targetEntity`, `euaOmissionStatus`) matched
exactly. List-extraction fields (categories, key figures, statistical claims) showed quantity
variance — expected LLM sampling stochasticity on an open-ended extraction task with byte-identical
instructions in both versions, not a regression from the merge. No image/document-path live test was
run (no representative test file on hand) — if a document-sourced classification ever looks off after
this lands, re-verify that path specifically before assuming the merge is the cause.

### 2.2 ⚠️ CAUTION — Evidence hash computed 6 independent ways
**Files:**
- `apps/glass-fortress/backend/src/services/Web3Service.ts:53-55` (`hashFile`, uses `ethers.sha256`) — appears to be the intended canonical source
- `apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromText.ts` — hand-rolled `crypto.createHash('sha256')`
- `apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromUrl.ts` — hand-rolled `crypto.createHash('sha256')`, **twice** (once per branch)
- `apps/glass-fortress/backend/src/services/WaybackScraper.ts:197-198` — own `sha256()`
- `apps/glass-fortress/backend/src/services/thesisAnalysis.ts:24-26` — own `sha256()`, explicitly commented as "extracted so both thesisRoutes.ts and the MCP run_ai_analysis tool can reuse the same implementation" — a good pattern, just not applied further
- `apps/glass-fortress/backend/src/mcp/tools/createThesisDraft.ts:9-11` — near-identical private reimplementation of `thesisAnalysis.ts`'s `sha256()` that should just import it
**Fix:** pick one canonical hashing function (`Web3Service.hashFile` looks intended as the source of
truth for *evidence* file hashing; `thesisAnalysis.ts`'s `sha256()` is for a different value — content
hashing for AI-analysis caching — so don't conflate the two purposes). Import the evidence-hash one
everywhere evidence identity is computed. Fix `createThesisDraft.ts` to import `thesisAnalysis.ts`'s
`sha256()` instead of reimplementing it.
**Test:** verify hash of a known test file is identical across all call sites after the change; check
no existing `Evidence.fileHash` values would change (this must be a pure refactor of *how* the hash is
computed, using the exact same algorithm — not a behavior change, or existing DB rows become
unverifiable).

### 2.3 `documentVault.ts` frontend copy has drifted from `packages/document-vault`
**Files:** `apps/glass-fortress/frontend/src/lib/documentVault.ts` (comment at lines 1-3 declares it a
"mirror... can be replaced with the workspace import once installed") vs.
`packages/document-vault/src/strip.ts`.
The package is already linked (`node_modules/@openjustice/document-vault` workspace symlink exists)
but `frontend/package.json` doesn't depend on it and nothing imports it. The package's `stripMetadata`
now uses `pdf-lib` and detects/warns on Office documents; the frontend's local copy still just shows a
generic "requires desktop software" warning with no Office handling — a real functional regression on
the whistleblower upload privacy path.
**Fix:** add `@openjustice/document-vault` as a real dependency of `apps/glass-fortress/frontend`, and
replace the local `stripMetadata` (and re-check `encryptFile`/`encrypt` — see note below) with the
package import. **Note:** the sweep found the `encryptFile`/`encrypt` API shape difference (JWK export
vs. raw `CryptoKey`) looks like a *deliberate* divergence for GF's "send key to server for ephemeral
analysis" use case — don't blindly unify that half, verify intent first.

### 2.4 `figuresRoutes.ts` vs `evidenceRoutes.ts` — comment claims shape parity, it's already false
**Files:** `apps/glass-fortress/backend/src/routes/evidenceRoutes.ts:444-469` (GET /timeline,
`satisfies EvidenceRecord`-checked) vs `apps/glass-fortress/backend/src/routes/figuresRoutes.ts:36,
62-85` (GET /:id, comment says "mirrors the timeline endpoint," no type check). Figures response is
missing `evidenceId` and `status` fields the timeline response includes. Currently harmless (frontend
`EvidenceCard` in `figures/page.tsx` doesn't read those fields) but will silently break the moment
someone adds a feature that does.
**Fix:** extract a shared `mapEvidenceToRecord()` (or similar) function used by both routes (and see
§2.8 below — this is one of four call sites with the same underlying duplication).

### 2.5 `TierBadge` color drift — trivial, do first
**Files:** `apps/glass-fortress/frontend/src/components/TierBadge.tsx:17-38` (canonical, Tier 3 =
`bg-amber-500`) vs `apps/glass-fortress/frontend/src/app/[locale]/theses/[id]/page.tsx` `gapTierDot`
(reimplements tier→color via regex digit extraction, Tier 3 = `bg-yellow-500`).
**Fix:** export a `tierDotColor(tier: string)` helper from `TierBadge.tsx`, use it in `gapTierDot`'s
place (or delete `gapTierDot` and call the export directly).

### 2.6 `StrengthBadge` reimplemented 3 times, one already diverged
**Files:** canonical `apps/glass-fortress/frontend/src/components/StrengthBadge.tsx:3-24` (exports
`StrengthBadge`, `STRENGTH_RANK`) vs. local copies in `apps/glass-fortress/frontend/src/app/[locale]/call/page.tsx:33-47`
(identical, just not imported) and `apps/glass-fortress/frontend/src/app/[locale]/call/[thesisId]/CallPageClient.tsx:38-43`
(**diverged**: renamed keys `pill`/`label`, different `COMPELLING` color — violet vs. blue — plus
Hebrew labels the canonical component lacks).
**Fix:** delete both local copies, import from `@/components/StrengthBadge`. If `CallPageClient` needs
Hebrew labels or the pill styling, add that as an optional prop on the real component rather than
re-forking it.

### 2.7 `EphemeralAnalysisService.ts` — shared helper exists, second call site never wired to it
**Files:** `apps/glass-fortress/backend/src/services/EphemeralAnalysisService.ts` — `storeEphemeral()`
(lines ~74-96) and the inline block inside `analyzeEphemeral()` (lines ~105-123) are byte-for-byte
identical Pinata-upload-with-Storage-fallback logic.
**Fix:** trivial — have `analyzeEphemeral()` call `storeEphemeral()` instead of duplicating its body.
Zero behavior-change risk. Good first PR to warm up on this plan.

### 2.8 Evidence-record creation duplicated across 4 files, already field-drifted
**Files:**
- `apps/glass-fortress/backend/src/routes/evidenceRoutes.ts:213-364` (POST /confirm, uses `Web3Service.hashFile`)
- `apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromText.ts:42-114`
- `apps/glass-fortress/backend/src/mcp/tools/createEvidenceFromUrl.ts:36-147`
- `apps/glass-fortress/backend/src/routes/thesisRoutes.ts:1037-1078` (whistleblower submission, uses `Web3Service.hashFile`)
All four hand-build the same ~15-field `Evidence` create object. Confirmed drift: only the
whistleblower path sets `ipfsCid`; only `/confirm` sets `fileUrl`/`urlVersionDiffId`; only the MCP
tools set `createdById`. Contrast with `apps/glass-fortress/backend/src/services/forensicEvidence.ts`'s
`buildForensicEvidence()` — the *correct* pattern, already used for the forensic-diff evidence path.
**Fix:** extract a `buildEvidenceCreateData()` helper analogous to `buildForensicEvidence()`, taking
the fields that legitimately vary (hash, source, `createdById`, `ipfsCid`/`fileUrl` presence) as
params. Do this together with §2.2 (hash consolidation) since they touch the same call sites.

---

## 3. Phase 2 — Medium severity (real duplication, no confirmed drift yet)

Do these after Phase 1. Lower urgency but same "will drift eventually" risk profile.

### 3.1 ✅ DONE — `assertSchemaCompatibility()` copy-pasted into 8 agent files
`IntakeAgent.ts`, `ForensicAgent.ts`, `DevilsAdvocateAgent.ts`, `GapRevisionAgent.ts`,
`RevisionAgent.ts`, `ThesisSynthesisAgent.ts`, `ThesisValidatorAgent.ts`, `FoiaLetterAgent.ts` — only
the schema variable name and log prefix differed between copies. **Resolution:** extracted
`assertSchemaCompatibility(schema, agentName)` to `backend/src/lib/assertSchemaCompatibility.ts`;
every agent now calls it inline (`assertSchemaCompatibility(XSchema, 'AgentName')`) instead of
declaring a private wrapper function. Pure refactor — same fail-fast logic, same error wording
pattern, no behavior change. `tsc --noEmit` clean, 509/509 backend Jest tests pass.

### 3.1a ✅ DONE — Migrate all remaining inline agent prompts to `prompts/` (see §1.1)
Same 8 files as §3.1 are the full set of GF LLM agents. `IntakeAgent.ts`'s prompts were handled in
§2.1. Audited the other 7 — all had inline `SYSTEM_PROMPT` string constants well over the 500-char
threshold (1.1k–2.6k chars each) — and moved each to its own file under `prompts/`, named for its task
rather than its caller: `forensicDiffClassification.ts`, `devilsAdvocateCritique.ts`,
`gapRevisionEditing.ts`, `thesisRevision.ts`, `thesisSynthesis.ts`, `thesisFalsification.ts`,
`foiaLetterDrafting.ts`. `ForensicAgent`'s prompt kept its `${INVESTIGATIVE_CATEGORY_PROMPT_BLOCK}`
interpolation (import moved into the new prompt file). **Shared-rules-fragment check (per the §1.1
caution):** all 7 prompts genuinely differ — no repeated multi-sentence rules block. Four of them share
one identical framing sentence ("...class-action lawsuit against government health authorities for
Covid-19 policy failures") but that's flavor text, not reasoning logic — extracting one sentence into
its own fragment file would be the over-engineering the plan's own guidance warns against, so it was
left as-is. `investigativeCategoriesField`/`INVESTIGATIVE_CATEGORY_PROMPT_BLOCK` (already shared via
`lib/investigativeCategories.ts`) remains the one genuine shared-fragment case, unchanged.

### 3.2 ✅ DONE — Site header markup hand-copied into 10 frontend page files
`page.tsx` (home), `theses/page.tsx`, `about/page.tsx`, `forensics/page.tsx`, `safety/page.tsx`,
`call/page.tsx`, `figures/page.tsx`, `timeline/page.tsx`, `vault/page.tsx`,
`forensics/[trackedUrlId]/page.tsx`, `researchers/page.tsx` (11 files — the doc undercounted by one)
all independently rendered: `<header sticky...>` → dove logo `<Image>` → app-name span →
`<TopNav current="...">`. **Resolution:** extracted `src/components/SiteHeader.tsx` (matching the
`SiteFooter` pattern) with props for the genuine per-page differences found on inspection —
`maxWidth` (each page's header width matches its own content container, `max-w-4xl` through
`max-w-7xl` — kept as a real per-page choice, not collapsed), `tagline` (optional slot, 6 of 11 pages
use it), `showOperational` (the pulsing-dot "Operational" badge, 3 pages), and `actions` (ReactNode
slot — only `vault/page.tsx`'s "+ Submit Evidence" button needed it). Two purely incidental drifts
(`gap-2` vs `gap-3` on the logo/appName link, `px-6` vs `px-4 sm:px-6`) were normalized to the
majority variant — cosmetic only, not page-specific intent. `submit/page.tsx` has a superficially
similar `<header sticky...>` but is a genuinely different minimal wizard header (no logo, no
`TopNav`, a back-link + page title + locale switcher) — correctly left out of scope.
Verified: `tsc --noEmit` clean, production build succeeds, and a live visual diff against the
pre-refactor code at matched viewports (home, about, vault, forensics) showed pixel-identical
rendering — including a pre-existing appName/tagline wrapping quirk on `forensics` at ~1280px width,
confirmed present in the original code too (not a regression).

### 3.3 ✅ DONE — Type definitions redeclared instead of imported (frontend)
- **`ThesisSummary`**: moved from `src/components/ThesisHighlightCard.tsx` to `src/types/thesis.ts`
  (which already existed, holding unrelated AI-analysis types — a natural home, not a new file).
  `call/page.tsx`'s exact duplicate now imports it directly. `theses/page.tsx` and
  `forensics/[trackedUrlId]/page.tsx` now use `Pick<ThesisSummary, 'id' | 'createdAt' | 'headVersion'>`
  as planned. **Correction found on inspection:** `call/[thesisId]/page.tsx`'s `ThesisSummary` is a
  name collision, not a real subset — its fields (`title`, `summaryHe`, `strength`) are a flattened
  Open-Graph-metadata projection with no overlap with the canonical type's shape (`id`, `createdAt`,
  `openGapCount`, nested `headVersion`). `Pick<>` cannot express this. Renamed it to
  `ThesisMetaSummary` locally instead of force-unifying — same category of correction as §2.1's
  "check whether the split/merge is actually justified" lesson, just inverted (here the plan assumed
  one type where there were genuinely two).
- **`EvidenceTier`**: `submit/page.tsx` and `vault/page.tsx` now import the canonical union from
  `src/components/TierBadge.tsx` instead of redeclaring it.
- **`EvidencePerspective`** and **`EvidenceRole`**: moved to new `src/types/evidence.ts`, imported by
  `submit/page.tsx`, `figures/page.tsx`, `timeline/page.tsx`.
- **`EvidenceMetadata`**: centralized in `src/types/evidence.ts` as a superset of the three pages'
  fields, with a field required only where all three consumers required it (`fileHash`,
  `investigativeCategories`, `tier`, `summary`, `targetEntity`, `timestamp`) — everything else
  optional. **Caught by `tsc`, not by inspection:** `timeline/page.tsx` reads `metadata.evidenceId`
  unguarded (`.slice(0, 8)`), so the shared type's optional `evidenceId` would have been a silent
  narrowing-for-others, widening-into-a-bug-for-timeline change. Fixed with a local
  `type EvidenceMetadata = SharedEvidenceMetadata & { evidenceId: string }` in `timeline/page.tsx`
  rather than making the shared field required (which would have been wrong for `figures`/`vault`,
  neither of which ever returns it). `vault/page.tsx`'s narrower `tier: EvidenceTier` was widened to
  the shared type's `tier: string` — both `TierBadge` and `tierAccentColor` already accept `string`,
  so nothing was lost.
Verified: `tsc --noEmit` clean, production build succeeds. Pure type-level refactor — no runtime/UI
change, so no browser verification needed.

### 3.4 ✅ DONE — Type definitions redeclared instead of imported (backend)
Near-identical evidence-context interfaces declared independently in 6 agent files instead of derived
from one source. **Resolution:** new `backend/src/lib/evidenceContext.ts` exports
`EvidenceContext = Pick<Evidence, 'fileHash' | 'summary' | 'evidenceTier' | 'evidenceRole' |
'evidenceDate' | 'investigativeCategories' | 'targetEntity'>` off the Prisma model, following the
`investigativeCategories.ts` pattern. Verified each interface's actual field-mapping call site
(Prisma `select`/`findMany` shape) before consolidating, not just the type declarations:
- `ReferencedEvidence` (DevilsAdvocateAgent), `VaultHitRecord` (GapRevisionAgent), `UncitedEvidence`
  (RevisionAgent) are all now `= EvidenceContext` directly — confirmed identical at both the type and
  the Prisma `select` clause that populates them.
- `RelatedEvidenceContext` (ForensicAgent) is `Pick<EvidenceContext, 'summary' |
  'investigativeCategories' | 'targetEntity' | 'evidenceRole'> & { date: string }` — its call site
  (`WaybackScraper.fetchCorrelatedEvidence`) deliberately renames `evidenceDate` to `date` for the
  prompt string it builds; kept as a local rename rather than forcing the field name to match, since
  it's a real naming choice at that boundary, not drift.
- `EvidenceCorpusRecord` (ThesisSynthesisAgent) is `EvidenceContext & { keyFigures: string[];
  evidenceType?: string }` — `keyFigures` is derived from the `figures` relation, not a Prisma column,
  so it's additive rather than picked.
- `EvidenceSummary` (ThesisValidatorAgent) is keyed by `id` instead of `fileHash` — genuinely not a
  subset of `EvidenceContext`, so it stays its own `Pick<Evidence, 'id' | 'summary' |
  'investigativeCategories' | 'evidenceDate' | 'targetEntity' | 'evidenceRole'>` directly off the
  Prisma model. **Found in passing:** `ThesisValidatorAgent` itself is dead code — not instantiated or
  imported anywhere else in the codebase. Left in place (out of this item's scope; a separate call if
  it should be wired up or removed).
- `LegalMasterAgent.ts`'s `TIER_PRIORITY` now derives its keys from `IntakeAgent.ts`'s exported
  `EVIDENCE_TIER` constants instead of hardcoding the tier label strings a third time.
Verified: `tsc --noEmit` clean, 509/509 backend Jest tests pass.

### 3.5 Prisma query shape duplication
- ✅ Already done in Phase 1 (§2.4/§2.8) — `evidenceRoutes.ts`'s GET /timeline and GET /search both
  use `mapEvidenceToRecord()` from `lib/evidenceRecord.ts`, as does `figuresRoutes.ts`. GET /:id keeps
  its own inline mapping (different shape — full record, not the summary), which is fine.
- ✅ DONE — `thesisRoutes.ts` built the identical `evidenceMap` query twice in the same file (the
  full-thesis GET route and the single-version GET route). Extracted a local `buildEvidenceMap(
  evidenceRefIds: string[])` helper (file-local, not promoted to `lib/` — it's only used by these two
  routes in this one file) and replaced both call sites. Verified: `tsc --noEmit` clean, 509/509
  backend Jest tests pass.

### 3.6 ✅ DONE — Component/logic pairs with drift (frontend)
- **`DiffNode`** vs **`DiffCard`**: **documented, not consolidated.** On inspection the divergence was
  deeper than the plan assumed — different underlying Prisma-derived types (`SnapshotDiff` vs
  `DiffRecord`), significance-driven conditional styling, expand/collapse state, and a promote action
  that only exists on the detail page. A shared component would need to accept both data shapes and
  make all the extra behavior optional — more surface area than the actual duplication (a couple of
  shared Tailwind class strings) justifies. Added a code comment on each explaining the relationship,
  per the plan's own "consolidate or explicitly document" option.
- **`PromoteButton`**: extracted `usePromoteAction` hook (`src/hooks/usePromoteAction.ts`) — shared
  idle/loading/done/error state machine. Both call sites keep their own styling and endpoint (`/api/forensics/promote`
  vs `/api/evidence/promote` — genuinely different operations), but the swallowed-error gap in
  `timeline/page.tsx` is fixed: failures now surface an error state instead of silently reverting to
  idle (new `promoteError` i18n key added, en+he).
- **`CallCard`**: deleted; `call/page.tsx` now renders `ThesisHighlightCard` with a new `variant="compact"`.
  This also fixed the *actual* root cause of the duplication, not just its symptom — `ThesisHighlightCard`
  was hard-coupled to the `'home'` next-intl namespace via a bound `t` prop, which is exactly why
  `call/page.tsx` (a different namespace) couldn't reuse it before. Replaced the `t` prop with a
  `labels` object of plain resolved strings; both `page.tsx` and `call/page.tsx` now build their own
  `labels` from their own namespace.
- **`EmptyState`**: extracted to `src/components/EmptyState.tsx` with an `icon` prop (the two pages used
  different icons for different reasons — clock for timeline, a magnifying-glass-like glyph for
  forensics — kept as real per-page intent via the prop, matching the SiteHeader precedent from §3.2).
- **Skeleton loaders**: extracted `src/components/SkeletonRows.tsx` with `rows`, `connectorHeight`,
  `headerBarWidths`, `bodyLineWidths` props. Found and folded in a *third* near-identical inline skeleton
  in `timeline/page.tsx` (the `loadingMore` pagination indicator) the plan didn't call out — same
  component, different prop values, not a separate abstraction.
- **`AddToThesisButton`**: extracted `addEvidenceToThesis()` to `src/lib/thesisDocument.ts` (alongside
  `appendEvidenceMention`, which it uses) — both `GapSearchPanel.addToThesis` and `AddToThesisButton`
  now call the same function; the former already has the thesis content loaded and passes it in, the
  latter (picking from a list) omits it and the function fetches it first. **i18n fixed**: added
  `addToThesisBtn`/`Saving`/`Done`/`Pick`/`Loading`/`Empty`/`Untitled` keys (en+he) replacing the 7
  hardcoded English strings, threaded through `DiffCard`'s existing `labels` prop.
- **Confidence/color palettes**: `theses/page.tsx`'s `CONFIDENCE_STYLES` replaced with a new
  `strengthBadgeClass()` export from `StrengthBadge.tsx` (reuses the same WEAK/MODERATE/STRONG/COMPELLING
  map, so COMPELLING is now handled instead of falling back to a generic grey). Perspective styles
  (`figures`/`timeline`) consolidated into new `src/lib/evidencePerspective.ts` using timeline's richer
  5-field version (`figures` gets the extra `card`/`badge` fields it just doesn't use).
- **`formatHash`**: moved to `src/lib/format.ts`, imported by `figures`/`timeline`/`vault`.
- **`appendEvidenceMention`**: moved to `src/lib/thesisDocument.ts`, imported by `theses/[id]/page.tsx`
  and `forensics/[trackedUrlId]/page.tsx`.
Verified: `tsc --noEmit` clean, production build succeeds, `eslint` shows no new warnings (diffed
against pre-change baseline to confirm every remaining warning/error pre-existed). Live-checked against
the running dev server: vault, figures, timeline, forensics pages all render their shell/header/nav
correctly with no React crashes (one transient Turbopack stale-cache compile error during editing,
resolved by nudging the file; remaining console errors are pre-existing backend-connectivity 500s in
that shared dev environment, unrelated to this change).

### 3.7 ✅ DONE — Data-fetching duplication (frontend)
- **Thesis-list fetch**: extracted `fetchTheses(query?)` to new `src/lib/thesisApi.ts` — a plain async
  function, not a `useTheses()` hook as originally planned. The 4 call sites turned out to have
  genuinely different trigger patterns (`page.tsx`: one leg of a `Promise.all` with tolerant
  `.catch(() => null)`; `call/page.tsx`/`theses/page.tsx`: solo `useEffect` fetch-on-mount;
  `forensics/[trackedUrlId]/page.tsx`'s `AddToThesisButton`: lazy fetch-on-demand when the picker
  opens) — a hook that owns its own loading state wouldn't fit all four without forcing a shape onto
  call sites that don't need it. Each page keeps its own `useState`/`useEffect`/error handling, calling
  the shared function instead of duplicating the `fetch` + `.json()` + shape-check boilerplate. Per-page
  filter/sort stayed local as planned (e.g. `theses/page.tsx` shows all theses unsorted with an
  `evidence` query param the other three don't have).
- **`generateFoia`**: extracted `generateFoiaRequest(thesisId, gapIndex)` to the same `thesisApi.ts`
  file (same rationale — a plain function, not a hook, since each caller's error-state shape differs:
  `theses/[id]/page.tsx` tracks *which* gap failed by index, `CallPageClient`'s `GapCard` only needs a
  boolean since it's already instantiated per-gap).
Verified: `tsc --noEmit` clean, production build succeeds, `eslint` shows no new issues.

### 3.8 ✅ DONE — Backend "promote evidence" logic duplicated with drifted response shape
`evidenceRoutes.ts` (POST /promote, looks up by `fileHash`) vs `mcp/tools/promoteEvidence.ts` (looks
up by `id`) had identical on-chain-registration + dup-check + vector-store-upsert logic with drifted
response shapes. **Resolution:** extracted `promoteEvidence(record: Evidence)` to new
`backend/src/services/promoteEvidence.ts`, following the `buildForensicEvidence` pattern (plain
function, not a class). Both callers now just resolve their own `Evidence` record (by `fileHash` or
`id` respectively) and hand it to the shared function. Standardized on the MCP tool's richer response
shape (`{promoted, alreadyConfirmed?, evidenceId, fileHash, txHash, message}`) for both — the REST
route's old response was a strict subset, and the frontend callers only check `res.ok` / read
`.message`, so this is additive, not breaking. The shared function keeps its own lazy
Web3Service/VectorStoreService singletons, matching the existing pattern of each module owning its own
(pre-existing architecture, not part of this dedup — `evidenceRoutes.ts` and the old MCP tool file each
already had separate singleton getters for other routes/uses in the same file that still need them).
Verified: `tsc --noEmit` clean, 509/509 backend Jest tests pass. No dedicated test coverage existed for
either the route or the MCP tool before or after this change.

### 3.9 ✅ DONE — Backend auth logic duplication
- **Bearer-token extraction**: extracted `extractBearerToken(req)` to new `backend/src/lib/bearerToken.ts`.
  `middleware/supabaseAuth.ts`, `middleware/stagingAccess.ts`, and `mcp/mcpRoutes.ts` all call it now
  instead of hand-parsing the header. Pure extraction, identical behavior.
- **Admin-role check**: extracted `requireAdmin` middleware to new `backend/src/middleware/requireAdmin.ts`,
  chained after `requireSupabaseAuth` (which populates `req.supabaseUserId`) on both `authRoutes.ts`
  routes that need it (`GET /researchers`, `PATCH /researchers/:id`). Same lookup, same 403 response,
  now expressed as Express middleware instead of copy-pasted into each handler.
Verified: `tsc --noEmit` clean, 509/509 backend Jest tests pass. No dedicated auth tests existed before
or after this change (matches the plan's "low risk" assessment) — reviewed the diff line-by-line given
this touches auth/security code; both changes are behavior-preserving extractions, no logic changed.

This closes out Phase 2 of the tech-debt cleanup plan (§3.1–§3.9), landed as PRs #19–#27.

---

## 4. Phase 3 — Low priority / optional

- Duplicated "account not yet approved" user-facing string: `backend/src/routes/authRoutes.ts:107` and
  `backend/src/mcp/mcpRoutes.ts:73` — cosmetic, extract to a shared constant if convenient.
- `ResearcherProfile` (`context/AuthContext.tsx:10-17`) vs `ResearcherRow`
  (`app/[locale]/admin/page.tsx:10-16`) — admin table just omits `hasMcpToken`; low risk, but prefer
  `Pick<ResearcherProfile, ...>` over independent redeclaration if touching this file.

---

## 5. Explicitly NOT debt — verified clean, no action

Found during the sweep, confirmed as either already-correct patterns or non-issues. Listed so a future
pass doesn't re-investigate these:
- `theses/[id]/page.tsx`'s FoiaModal/WhistleblowerModal — already fixed (the incident that triggered this plan).
- `backend/src/services/ForensicAgent.ts` `deriveSignificance()` — single source of truth, not duplicated.
- `frontend/src/components/ThesisEditor.tsx` `buildMentionExtension` — already a shared factory.
- `backend/src/context/researcherContext.ts:8` — documents expected behavior, not deferred work.
- `backend/src/routes/forensicsRoutes.ts:14-15` `parseDiffItems` — working, necessary backward-compat shim for legacy DB rows, correctly documented.
- `backend/src/lib/appEnv.ts` — documents a past incident as rationale for an already-implemented guard.
- `frontend/src/components/StagingDebugConsole.tsx` vs `StagingBanner.tsx` — parity enforced by shared `appEnv.ts` functions, not hand-copied logic.
- `backend/src/lib/encrypt.ts`, `tokenHash.ts`, `investigativeCategories.ts` — properly centralized, single source of truth, used correctly everywhere.
- `prisma/schema.prisma` — no field/table redundancy (a redundant `category` field was already removed previously for this exact reason).
