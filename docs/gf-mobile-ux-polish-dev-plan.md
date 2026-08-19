# GF Mobile UX Polish — Dev Plan

**Status:** Phases 1–3, 5 ✅ SHIPPED TO STAGING 2026-08-18 — PR #47
(`fix/gf-mobile-ux-polish` → `staging`), merged, branch deleted, both staging services
(`glass-fortress-frontend`, `glass-fortress-backend`) redeployed and verified live/green. Phase 6
✅ DONE 2026-08-19 on branch `fix/gf-evidence-page-header-consistency`, not yet
committed/shipped. Neither is on `master` (no SHIP). Phase 4 (icon scale / chip-color design pass,
now §7) not started. All findings below are confirmed against staging (mobile viewport,
Hebrew/RTL locale) and cross-checked in source — file:line references verified 2026-08-18/19
(Phases 1–3, 5–6's references updated post-implementation; §7 reflects the original investigation
and may shift slightly once actually picked up).
**Created:** 2026-08-18, from a staging UX review requested after the thesis/call-for-evidence
work landed (PR #37–#45, see [gf-thesis-citation-footnotes-dev-plan.md](gf-thesis-citation-footnotes-dev-plan.md)).
**Scope:** Primarily Glass Fortress frontend (`apps/glass-fortress/frontend`) — Phases 1–5 are
frontend-only (rendering/i18n). Phase 6 added one small, targeted backend change (a missing field
on `GET /api/evidence/:id`) once a fix genuinely required data the API didn't expose.

---

## 0. Why this exists

A mobile UX pass on staging (375px viewport, `/he` locale, password-gated env) surfaced one
correctness bug and several design-system inconsistencies matching the user's own observation:
*"our icons are too small to be noticed in most places... there is a mixture of styles between
the dove illustration and the evidence cards, colors, small fonts."* Investigated and confirmed
against source rather than left as screenshot impressions — see §1–§6 for exact locations.

**One review-environment caveat, not a code finding:** the emulated mobile browser used for this
review does not reproduce RTL layout identically to a real phone — the user observed the evidence
card's colored accent border on the correct (right) side on their own device while the review
tool showed it on the left. No fix is proposed for that; it's flagged so a future contributor
doesn't chase a phantom bug based on the review screenshots alone.

---

## 1. How to work this plan

- Standard branch protocol applies: feature branch → PR → `staging` → explicit approval → `master`.
- Phase 1 (truncation bug) is a correctness fix and should ship on its own PR, independent of the
  i18n/design-system phases — it's the only item here that's a bug rather than a design decision.
- Phases 2–4 touch shared, widely-used components (`TierBadge`, `StrengthBadge`, evidence card
  chip colors, icon sizing) — changes ripple across the homepage, `/evidence`, and `/theses/[id]`
  simultaneously. Screenshot before/after on all three pages, mobile viewport, before opening each
  PR.
- Run the frontend's typecheck/lint/tests after every change (this plan doesn't yet know the
  frontend's current test count — check `apps/glass-fortress/frontend/package.json` for the test
  script before starting Phase 1).

---

## 2. Phase 1 — ✅ DONE 2026-08-18 — Citation redesign: footnote markers, not inline text chips

**Files:**
- `apps/glass-fortress/frontend/src/components/TipTapRenderer.tsx:40` — inline footnote chip:
  `const displayLabel = (info?.summary?.slice(0, 35) ?? storedLabel) || id.slice(0, 12);`
- `apps/glass-fortress/frontend/src/app/[locale]/theses/[id]/page.tsx:523` — the "ראיות (N)"
  evidence rollup list (heading at line 517 via `t('evidenceSuggestion')`):
  `const label = info?.summary?.slice(0, 35) || m.refId.slice(0, 8);`

**Problem:** both call sites do a raw `.slice(0, 35)` on the evidence `summary` string with no
word-boundary trim and no ellipsis. On real thesis content this produces citation chips that cut
off mid-word into meaningless fragments — confirmed live on `cmsyrk73800023f8cunfp4r4w`, all 6
citations broken this way (e.g. `#השינוי מחזיר ומקבע טענה ביולוגית גו`, `#העדכון מציג שינוי מבני
מובהק שבו הו`). This is the platform's core credibility mechanism (per-claim evidence citation,
[gf-thesis-citation-footnotes-dev-plan.md](gf-thesis-citation-footnotes-dev-plan.md)) rendering as
visibly broken text — highest priority in this plan.

**What actually shipped — bigger than a truncation fix.** While fixing the truncation, the user
raised a more fundamental point live: even cleanly truncated, a ~35-character evidence-summary
chip embedded mid-sentence breaks the paragraph's reading flow and doesn't read as a coherent
narrative. Asked the user to pick a direction (numbered footnote markers vs. shorter text chips vs.
ship-the-truncation-fix-only-and-defer-the-redesign) — they chose footnote markers, matching their
original intent for the citation feature: "a reference from a claim phrased in the thesis to the
evidence that substantiates it," analogous to legal-document footnotes.

**Implementation:**
1. `src/lib/format.ts` — added `truncateLabel(text, maxLen = 35)`: trims to the last word boundary
   at-or-under `maxLen`, appends `…` only when truncation occurred. Fixes the original mid-word-cut
   bug on its own, but is now used for the evidence-list *description* text, not the inline marker.
2. `src/lib/citations.ts` (new) — `buildEvidenceCitationNumbers(doc)`: walks a TipTap doc tree and
   assigns sequential numbers to `evidenceMention` nodes in first-appearance order; the same
   evidence id cited again later reuses its original number (standard footnote behavior — citing
   the same source twice doesn't mint a second footnote).
3. `src/components/TipTapRenderer.tsx` — `evidenceMention` inline rendering changed from a colored
   pill containing truncated summary text to a small superscript-style `[n]` marker
   (`text-[0.7em] align-super`, color-coded red/amber for forensic-diff vs. document evidence, no
   background box), linking to the same evidence page as before. The 🔍 emoji marker (a separately
   confirmed "icon too small" instance, §5) is dropped — color alone now distinguishes forensic-diff
   citations. A native `title` tooltip carries a longer (80-char) truncated summary for desktop
   hover. Numbering computed via `useMemo(() => buildEvidenceCitationNumbers(doc), [doc])` inside
   the component itself — the revision-preview usage of `TipTapRenderer`
   (`theses/[id]/page.tsx:672`) gets independently-scoped numbering for free, no extra wiring.
4. `theses/[id]/page.tsx` — the "ראיות (N)" evidence-rollup list below the thesis body now computes
   the *same* numbering (`buildEvidenceCitationNumbers(thesis.headVersion.userContent)`, via
   `useMemo` placed before the component's early returns per the rules of hooks) and prefixes each
   list item with its matching `[n]`, so a reader can jump between an inline marker and its full
   description in the list. List items also got more room for descriptive text (`truncateLabel(...,
   60)` instead of 35) now that they're the only place carrying the summary prose.

**Verified live** against the real thesis (`cmsyrk73800023f8cunfp4r4w`) on a local frontend+backend
pointed at the staging DB: paragraphs read as coherent Hebrew narrative with small `[1]`–`[6]`
markers at natural clause breaks; the same evidence cited 4 times in one paragraph correctly shows
`[1]` all four times; the evidence list shows clean word-boundary-truncated Hebrew ending in `…`
(no more mid-word fragments). `tsc --noEmit` clean, no new ESLint errors in any touched file
(confirmed by line-number cross-reference against pre-existing unrelated errors in `TopNav.tsx`,
`AuthContext.tsx`, and the TipTap editor extensions file).

**Not in scope for this phase:** whether `summary` itself should be shorter/differently-generated
at synthesis time (backend). No backend truncation was found — the full summary reaches the
frontend and is formatted here. If a shorter, purpose-built "citation label" ever gets generated at
synthesis time instead of reusing the full summary, that's a separate, larger change to
`ThesisSynthesisAgent` and out of scope here.

---

## 3. Phase 2 — ✅ DONE 2026-08-18 — Localize tier/strength/review-status badges

**Problem (confirmed as originally scoped):** every status/strength/tier chip rendered hardcoded
English regardless of locale — `TierBadge.tsx` rendered the raw `{tier}` backend string directly
(no `useTranslations` in the file at all); `StrengthBadge.tsx` did `strength.charAt(0) +
strength.slice(1).toLowerCase()` (a Hebrew `heLabel` existed per strength value but no caller,
including the component itself, ever used it); `"AI reviewed"`/`"Pending AI"` was hardcoded
identically in three files. Confirmed on the homepage top-thesis card, every evidence card
(`Tier 2: Material`), the thesis page header, and the counter-argument strength label (`STRONG`).

**One case investigated and deliberately left alone:** `CallPageClient.tsx` (`/call/[thesisId]`,
the public "call for evidence" page) calls `strengthHeLabel(strength)` directly and always renders
Hebrew regardless of locale — this looked like the same bug at first, but the whole page hardcodes
`dir="rtl"` and unconditional Hebrew copy throughout (10+ places, e.g. `dir="rtl"` at lines 73, 125,
245, 294, 365, 377; literal `צדק לעם` at line 248). That's a deliberate product decision for this
specific public page (presumably Hebrew-reading-audience-only by design), not an i18n gap — left
untouched. `strengthHeLabel()` stays exported as the plain, non-locale-aware helper this one
caller needs; a new `strengthLabel(t, strength)` was added alongside it for every other caller that
*is* locale-aware.

**Implementation:**
1. Added `evidenceTiers` and `strengths` namespaces to `messages/en.json` / `messages/he.json`
   (both files), keyed by the exact backend value (`"Tier 1: Smoking Gun"`, `"WEAK"`, etc.) —
   matching the existing `categories` namespace's convention of using the raw backend identifier as
   the translation key. Hebrew tier copy reuses the existing `dashboard.analytics.tier1-4` Hebrew
   vocabulary (already shipped, presumably reviewed) rather than inventing new phrasing, adapted to
   singular form (e.g. `"ראיה מכרעת"`, singular "this evidence") since the badge describes one
   evidence item, vs. the dashboard's plural aggregate-count labels (`"ראיות מכריעות"`). Hebrew
   strength copy is identical to the pre-existing `heLabel` values, just relocated into the i18n
   system.
2. `TierBadge.tsx` and `StrengthBadge.tsx` both now call `useTranslations(...)` internally
   (`'use client'` added to both) and look up `t.has(value) ? t(value) : value` — falls back to the
   raw value for any unrecognized string, preserving the existing defensive "never throw on an
   unknown tier/strength" behavior. `StrengthBadge`'s lookup is exposed as an exported
   `strengthLabel(t, strength)` helper so non-badge callers (the duplicate strength renderer removed
   in step 3, and the counter-argument strength label) can reuse it with their own translator
   instance.
3. `theses/[id]/page.tsx` had a **second, independent** raw-English strength renderer that wasn't
   in the original investigation's file list: a local `STRENGTH_STYLES` color map (lines 259-264)
   plus `{analysis.overallStrengthAssessment}` rendered directly as text (this is the actual source
   of the `MODERATE` seen on the thesis page during review, not `StrengthBadge` itself). Replaced
   with `<StrengthBadge strength={...} />` directly, deleting the now-dead local color map — fixes
   the i18n gap and removes a duplicated color mapping in the same change. The counter-argument
   strength label (`{ca.strength}`, separate from the above) now goes through
   `strengthLabel(tStrength, ca.strength)`.
4. Added `theses.aiReviewedStatus` / `theses.pendingAiStatus` keys and replaced the ternary at all
   three sites (`theses/page.tsx`, `theses/[id]/page.tsx`, `theses/[id]/history/page.tsx`).

**Verified live**, both locales, no regression: `/he/evidence` and `/he/theses/[id]` now show
`דרגה 2: ראיה מהותית`, `בינוני`, `חזק`, `נבדק על ידי AI`; `/en/evidence` still shows `Tier 2:
Material` unchanged. `tsc --noEmit` clean; no new ESLint errors (cross-referenced by file/line
against the pre-existing unrelated errors in `TopNav.tsx`/`AuthContext.tsx`/`ThesisEditor.tsx`).

---

## 4. Phase 3 — ✅ DONE 2026-08-18 — Legal disclaimer: Hebrew-only, moved beside the AI-status badge

**Original finding confirmed:** `LegalDisclaimer.tsx` unconditionally rendered Hebrew heading +
Hebrew body + an English body paragraph stacked underneath, no locale check anywhere. Separately,
it only ever rendered inside `{analysis && (...)}` on the thesis page (§0's original file:line was
accurate) — meaning a thesis with no AI critique run yet showed **no disclaimer at all**, despite
the component's own comment saying it's "Required on every thesis page... See COMPLIANCE.md."

**Resolved live with the user, in three direct instructions, rather than the two options this
plan originally posed:**
1. **Drop the English paragraph entirely — Hebrew-only, always,** not gated on locale. Matches the
   `/call/[thesisId]` precedent from §3: this codebase already has a place where legal-facing
   Hebrew content is deliberately not bilingual.
2. **Move the disclaimer to sit beside the AI-review status badge** near the top of the page,
   instead of buried before the (optional) AI-analysis section — which also fixes the
   always-rendered gap above, since the status badge is unconditional.
3. **Fold the status badge itself into the disclaimer box** rather than keeping it as a separate
   element beside the date — the "AI reviewed" fact and the "this is AI analysis, not a judicial
   finding" disclaimer are the same underlying fact stated twice in two places; said once now.

**Implementation:** `LegalDisclaimer.tsx` gained an optional `status?: 'COMPLETE' | 'PENDING_AI'`
prop; when given, renders the same green/amber status pill (now via the `theses.aiReviewedStatus`/
`pendingAiStatus` keys from Phase 2) inline next to the disclaimer's heading. The English `<p>` was
deleted outright. `theses/[id]/page.tsx`'s former "Status + date" row lost its badge (now just the
date on its own line) and now renders `<LegalDisclaimer status={hv?.status} />` unconditionally,
directly after the date — replacing the old conditional placement inside the analysis section.
`CallPageClient.tsx`'s `<LegalDisclaimer />` call is unaffected (no `status` prop passed, badge
doesn't render there, matching that page's own separate strength-pill design).

**Verified live:** the thesis page now shows one consolidated card near the top — Hebrew disclaimer
heading with the green `נבדק על ידי AI` (or amber `בהמתנה לבדיקת AI`) pill inline, Hebrew body only,
directly above the thesis text — on every thesis regardless of whether AI analysis has run.

---

## 5. Phase 5 — ✅ DONE 2026-08-18 — Live polish round, driven directly by the user watching the
Phase 1–3 work land in the browser in real time. Eleven items across the thesis page and the
`/evidence` timeline, all verified live on `cmsyrk73800023f8cunfp4r4w` / the staging evidence set:

1. **Thesis title was never rendered anywhere on its own page.** The `Thesis` interface (frontend
   type) was missing `title` entirely even though the backend's `GET /api/thesis/:id` already
   returns it (`prisma.thesis.findUnique` with no `select`, so `title` was present in the JSON, just
   untyped/unused). Added `title: string | null` to the interface and an `<h1>` right below the
   header nav, above the historical-version banner.
2. **Date moved from a standalone row into the thesis-body card**, top-left corner, "letterhead"
   style — explicitly the *physical* left (`style={{ textAlign: 'left' }}`, not the logical
   `text-start`/`ms-`/`ps-` utilities used elsewhere in this RTL app), since the user's ask was
   about where dates conventionally sit on a document regardless of reading direction.
3. **Disclaimer + thesis-body card pulled out of the page's outer `space-y-8` rhythm** into their
   own `space-y-2` wrapper, so they read as one attached unit (disclaimer immediately above the
   card) instead of two independently-spaced boxes.
4. **Deleted the standalone "דמויות מפתח" (Key Figures) rollup section** (was directly below the
   thesis card, `keyFigureMentions` array + its only render site) — this is exactly the
   "duplication" flagged as investigated-not-a-bug in Phase 1's memory notes; the user's call was to
   just remove the redundant rollup rather than reconcile the two. The inline `@name` chips inside
   the thesis body (via `TipTapRenderer`'s `keyFigureMention` node) are the only remaining place
   figures appear. The now-unused `keyFigureMentions` variable was removed too (the `keyFiguresLabel`
   i18n key stays — still used by `evidence/page.tsx` and `submit/page.tsx`).
5. **Counter-arguments redesigned**: vertical stack → horizontal `overflow-x-auto snap-x
   snap-mandatory` row (native swipe on mobile, no JS), cards `w-[85%] sm:w-[380px] shrink-0
   snap-start`. Text: `ca.claim` is now `font-bold` (was `font-medium`); `ca.rebuttal` dropped
   `text-red-700` for plain `text-slate-700`, matching the "no red text, black text only" ask
   exactly.
6. **Evidence-gap cards got the same horizontal-scroll treatment** (`GapSearchPanel` instances and
   the historical read-only variant both wrapped in the same snap-scroll pattern as #5). Freed-up
   width was used to restyle `GapSearchPanel`'s FOIA/Tip buttons from a small inline icon+label pill
   (14px icon) to a stacked icon-on-top/caption-below layout at 28px icon size (`flex-col items-center`).
7. **Removed the "סקירת נתונים" stats dashboard from `/evidence`** (both the 5-card tier-stat grid
   and the category-breakdown bar chart) per direct feedback that it provides little value on the
   timeline page. Removed as dead code rather than left disabled: `StatCard`/`CategoryBar`
   components, `EvidenceStats`/`ZERO_STATS`, the `/api/evidence/stats` fetch effect, and the
   now-unused `tCat`/`INVESTIGATIVE_CATEGORIES`/`EvidenceTier`/`InvestigativeCategory` imports were
   all deleted from `evidence/page.tsx` — confirmed each had no other call site in the file first.
   **Not implemented, explicitly open:** the user floated relocating this dashboard elsewhere (e.g.
   behind the homepage hero's stat numbers) as something to *think about*, not a decided
   destination — noted here so it isn't lost, but nothing was built toward it.
8. **`EvidenceTimeline.tsx`'s statistical-claims list collapsed by default, click to expand.** Each
   evidence card was unconditionally rendering every entry in `metadata.statisticalClaims` (often
   11–15 full-sentence strings, one per pill, each wrapping onto its own line) — a major contributor
   to per-card bulk on the timeline. `TimelineNode` (already a standalone per-record component, so
   local state is safely scoped per card) gained collapse state; the list header became a `<button>`
   toggle showing `{label} ({count})` plus a rotating `▾`, and the pill list only renders when
   expanded. First landed for statistical claims only — items 10 below extended the same treatment
   to the other three metadata sections once the user saw it live and asked for those too.
9. **Evidence-card footer decluttered — no more raw hex shown to the reader.** The footer previously
   showed the evidence's own truncated `evidenceId` as its *only* link label (e.g. `86d76c48…`) and
   a second, separate truncated `fileHash` as inert mono text (`formatHash()`, e.g.
   `0x9e470f9d…ede6e982`) — both meaningless identifiers to a reader, not decoration. Removed the
   fileHash display entirely (the file gained `EvidenceTimeline.tsx`'s previously-unused `formatHash`
   import removed too — no other call site needed it); the evidenceId link's text changed from raw
   hex to a proper label (`viewEvidence`, a new i18n key added to the `timeline` namespace in both
   `messages/*.json`, reusing the exact `"צפה בראיה"`/`"View Evidence"` string already established by
   `EvidenceHighlightCard.tsx` on the homepage rather than inventing new copy). All four footer links
   (View Evidence / View Source / View Diff History / Theses Citing This) were then grouped together
   under one `ms-auto` wrapper with consistent `↗`-suffixed styling, instead of one link floating
   alone with different styling and the rest scattered around the raw hex text — `metadata.targetEntity`
   (the domain chip) is now the only non-link content in the footer, standing alone on the other side.
10. **Extended the item-8 collapse pattern to figures, regulatory mentions, and (per a follow-up ask
    once the user saw items 8/9 land) medical context too** — all four metadata sections now behave
    identically. Extracted the inline toggle logic into a shared `CollapsibleChipRow` component
    (label/count/expanded/onToggle/children) instead of copy-pasting the button+conditional a third
    and fourth time. `TimelineNode`'s single `claimsExpanded` boolean was refactored into
    `expandedSections: Set<string>` + a `toggleSection(key)` helper, so each of the four sections
    (`figures`/`medicalConditions`/`statisticalClaims`/`regulatoryMentions`) toggles independently
    per card without adding a new `useState` for every future collapsible section.
11. **Footer's bare `metadata.targetEntity` text was unlabeled** (e.g. just `"משרד הבריאות"` with no
    indication of what that string represents) — added a `targetEntityLabel` i18n key to the
    `timeline` namespace, reusing the exact `"גורם מטרה"`/`"Target Entity"` wording already
    established in the separate `evidence` namespace (single evidence detail page) rather than
    inventing new copy, rendered as `{label}: {value}` ahead of the entity name.

Verified: `tsc --noEmit` clean; lint diff against a pre-change baseline showed zero new
errors/warnings anywhere (only line-number drift on the same pre-existing unrelated errors in
`evidence/page.tsx` and this file, both `react-hooks/set-state-in-effect` on code untouched by this
work).

---

## 6. Phase 6 — ✅ DONE 2026-08-19 — Evidence detail page: header consistency + real title

Raised by the user as "before we continue" fixes needed across screens, from directly using the
evidence detail page (`apps/glass-fortress/frontend/src/app/[locale]/evidence/[id]/page.tsx`)
after Phase 5 landed. Four items, one required a small backend change:

1. **Page had no title at all**, unlike the thesis page (Phase 5 item 1). Fixed as part of item 2
   below — the heading now always renders something, forensic-diff or not.
2. **For `FORENSIC_DIFF` evidence, the scanned page's URL + snapshot date + a change icon needed to
   be the page's actual heading — not buried lower in a `tierReasoning` block.** Investigated what
   `tierReasoning` actually contains for this evidence type: `forensicTierReasoning(url, afterDate,
   categories)` in the backend (`src/lib/investigativeCategories.ts:102-115`) generates nothing but
   `"שינוי מתועד בדף ממשלתי רשמי ({url}) בתאריך {afterDate}..."` — literally just the URL and date
   restated as a sentence, confirming the user's read that this section is redundant once elevated
   to the heading. (For non-diff `DOCUMENT` evidence, `tierReasoning` is genuine per-record
   chain-of-thought from `IntakeAgent`'s classification prompt — real content, kept as-is.)
   **Backend:** the live tracked-page URL wasn't returned by `GET /api/evidence/:id` at all (only
   embedded inside the `tierReasoning` prose) — added `trackedUrl: { select: { url: true } }` to the
   `urlVersionDiff` include and a new `trackedUrl` field on the response (`evidenceRoutes.ts`).
   **Frontend, first pass:** an `<h1>` rendering `icon_diff.png` + `evidence.trackedUrl` for
   `FORENSIC_DIFF`, or (per a same-session follow-up ask, "the heading is a good place to show the
   diff or evidence icon") `icon_target_entity.png` + `evidence.targetEntity` otherwise, with the
   snapshot date on its own line below. **Refined the same session after the user flagged the
   heading as "very wasteful" of space and the URL as noisy:** split into two elements for
   `FORENSIC_DIFF` — a small caption row above the heading (`icon_diff.png` + new `editChangeLabel`
   i18n key, "שינוי עריכה מתאריך {date}" / "Edit change from {date}") that folds in what was the
   separate date line, and the `<h1>` itself now shows only the tracked URL run through a new
   `displayUrl()` helper (`src/lib/format.ts`) that strips the `https://`/`http://` protocol and any
   `?query` string — reads as a page name, not a raw address. Non-diff evidence keeps the original
   single-line icon+targetEntity heading (nothing to fold in, so no caption row needed there). The
   `tierReasoning` block still only renders when `evidenceType !== 'FORENSIC_DIFF'`.
3. **Page was missing the site header entirely on mobile — confirmed root cause.** The page rendered
   bare `<TopNav current="evidence" />` instead of `<SiteHeader current="evidence" />`. `TopNav` is
   *only* the nav-links/hamburger-button — no logo, no app name, no bordered header bar; `SiteHeader`
   is the actual header chrome that wraps `TopNav` inside it. Grepped every page for this same
   bare-`TopNav`-without-`SiteHeader` pattern — this was the **only** page with the bug; every other
   page already used `SiteHeader` correctly. Fixed by swapping to `<SiteHeader current="evidence"
   maxWidth="max-w-3xl" />` (matching this page's own content width).
4. **Back link always pointed at `/evidence`** (`t('backLink')`, "→ Evidence"), regardless of
   whether the user actually arrived from the timeline, a thesis citation, search, etc. Replaced with
   a `<button onClick={() => router.back()}>` using a new generic `backGeneric` i18n key ("→ חזרה" /
   "← Back") instead of naming a fixed destination that's no longer accurate. The old `evidence.
   backLink` key was unused anywhere else in the codebase after this change — deleted from both
   `messages/*.json` rather than left as dead config.

5. **Same header-consistency question extended to the thesis detail page** (`theses/[id]/page.tsx`)
   after the user asked directly: is there shared header code, or does every page roll its own?
   Answer, checked precisely: `SiteHeader`/`TopNav` is the shared implementation and most pages use
   it, but **5 pages hand-roll their own separate `<header>`** instead —
   `submit`, `theses/new`, `theses/[id]`, `theses/[id]/edit`, `theses/[id]/history`. Of those, only
   `theses/[id]` had an actual bug (not just duplication): its header linked back to `/theses`, the
   researcher-gated thesis builder — but the thesis *detail* page itself is public, reachable via
   citations/share links/`/call`, so most visitors landing on that back-link couldn't use its
   destination. The other four back-links point to same-audience pages (edit→detail, history→
   detail, etc.) — duplicated code, but not the same wrong-audience bug, so left alone this round.
   Fixed `theses/[id]/page.tsx` by replacing its bespoke header with `<SiteHeader current="theses"
   maxWidth="max-w-4xl" actions={...} />`, passing the page's existing History/Edit/Call-for-
   Witnesses buttons through `SiteHeader`'s `actions` prop (which already existed for exactly this)
   — the back-link is simply gone, not replaced with anything, since `SiteHeader`'s own logo-links-
   home and hamburger nav already cover general navigation. Removed the now-unused `tc =
   useTranslations('common')` from the file.
6. **That change surfaced a real bug in `SiteHeader` itself**, caught live by the user: with a wide
   `actions` block (3 buttons), the mobile hamburger button rendered *between* the actions and the
   logo instead of at the true screen edge — `SiteHeader.tsx` rendered `<TopNav>` (hamburger) before
   `{actions}` in the JSX, and in a `flex` row that inner ordering reads right-to-left in RTL, so
   actions pushed the hamburger inward from the edge. Fixed at the component level (reordered to
   `{actions}` then `<TopNav>`) rather than worked around per-page, since every other `SiteHeader`
   caller with any `actions` content had the same latent bug, just less visible with narrower
   content (e.g. `evidence/page.tsx`'s single "Submit Evidence" button). Verified no regression on
   that page post-fix.
7. **Evidence-card "View Evidence" link replaced with a fully clickable card** — the whole
   `EvidenceTimeline.tsx` `TimelineNode` card now navigates to `/evidence/:id` on click
   (`role="link"`, `tabIndex`, `Enter`-key support, `router.push()` from `@/i18n/navigation`),
   instead of requiring a separate small link at the bottom. Since the card contains real nested
   interactive elements (`CollapsibleChipRow` toggle buttons, figure chip links, the promote button,
   and the remaining footer links), each of those regions got `onClick={(e) =>
   e.stopPropagation()}` on its wrapper rather than wrapping the whole card in an `<a>`/`<Link>`
   (which would be invalid HTML with buttons/links nested inside it, and would double-fire
   navigation). Verified: clicking the summary text navigates to the evidence page; clicking a
   collapsible-section toggle only toggles, no navigation; clicking a remaining footer link (e.g.
   "Investigations citing this") goes to *its own* destination, not the card's. The now-orphaned
   `viewEvidence` label was removed from `NodeLabels`, its construction site in `evidence/page.tsx`,
   and the `timeline` i18n namespace in both `messages/*.json` — dead code, not left behind.
8. **"תזות המצטטות ראיה זו" (Theses citing this) → relabeled, then removed entirely once the real
   bug surfaced.** First pass: renamed to "חקירות המצטטות ראיה זו" (Investigations citing this) —
   "תזה" is the internal/researcher term (matches "Glass Fortress"/"Bronze Fortress" being
   backend-only naming), "חקירה" is the established public-facing term (`nav.calls` is labeled
   "חקירות" / "Investigations"). **The user then tested the actual link and caught a real bug the
   label change alone didn't fix**: its destination, `/theses?evidence=...`, is the researcher-only
   Thesis Builder (`t('pageTitle')` literally renders "בונה תזות משפטיות", tagline framed around
   drafting/tagging/critique) — the exact same wrong-audience-link shape as items 3/4/5 above, just
   not caught until actually followed. Checked for a legitimate public alternative first: `/call`
   (the public investigations list) exists but has no evidence-filtering support today. Given the
   choice of (a) remove the link, (b) point at `/call` unfiltered, or (c) leave the researcher-only
   destination and flag it, **the user chose (a)** — removed the link entirely rather than send
   visitors to a wrong-audience page or a less-useful unfiltered one. `viewCitingTheses` removed
   from `NodeLabels`, its construction site, and both `messages/*.json` (dead code, not left
   behind). The sibling `evidence.citingTheses` key on the single evidence detail page (which lists
   *actual* citing theses by ID/title, fetched by that page's own API — not a raw link into the
   builder) is a genuinely different, correctly-scoped feature and wasn't touched.

**Verified live**, both evidence types, reached via a direct URL and via a real in-app thesis
citation link: `FORENSIC_DIFF` shows the diff icon + full scanned URL + date as the heading, no
tier-reasoning block; `DOCUMENT` shows the target-entity icon + entity name as the heading, *with*
its genuine tier-reasoning block intact further down; the full header bar (logo, nav, hamburger) now
renders; the back button correctly returned to the thesis page it was reached from, not `/evidence`;
the thesis detail page's header now matches the rest of the site with the hamburger correctly at the
edge. Backend: full Jest suite 568/568 passing (no existing coverage targeted this route
specifically). Frontend: `tsc --noEmit` clean throughout, zero new lint errors.

**Not done, explicitly flagged rather than silently left:** `submit`, `theses/new`,
`theses/[id]/edit`, and `theses/[id]/history` still hand-roll their own header markup instead of
`SiteHeader` — duplicated code, four more near-identical implementations, but none currently have
a wrong-audience back-link bug like the one just fixed. Worth a dedicated cleanup pass if the user
wants full consistency, not bundled into this session since it's a larger, lower-urgency change.
Frontend: `tsc --noEmit` clean, lint diff against baseline shows zero new errors.

---

## 7. Phase 4 — Icon scale & chip-color design pass

**Confirmed scale mismatch:**
- Homepage mission icons (`src/app/[locale]/page.tsx:31-33` data, rendered lines 171-177): `next/image`
  at `width={88} height={88}`, Tailwind `w-20 h-20` → displayed **80px**, illustrated PNG style.
- External-link arrow (`↗`): `src/components/EvidenceTimeline.tsx:314`,
  `src/app/[locale]/evidence/[id]/page.tsx:188`, `src/components/SiteFooter.tsx:32` — bare
  `<span aria-hidden="true">↗</span>` inheriting the surrounding `text-xs` (**12px**) link, no
  dedicated icon size class anywhere.
- 🔍 citation marker: `src/components/TipTapRenderer.tsx:57` — `<span className="opacity-70">🔍</span>`,
  same `text-xs` (12px) inheritance, shown only for forensic-diff evidence mentions.

**Confirmed chip-color sprawl** (evidence card, used on homepage "latest evidence" feed via
`EvidenceHighlightCard.tsx` and on `/evidence` via `EvidenceTimeline.tsx`):
- `EvidenceHighlightCard.tsx`: tier badge + accent border (line 34-38, red/orange/amber/slate by
  tier via `tierAccentColor()`), `targetEntity` chip (line 42, hardcoded
  `bg-cyan-50 text-cyan-700 border-cyan-200`), category tags (line 50, `CategoryBadges`, colors
  from `src/lib/investigativeCategories.ts:36-49` — purple/rose/blue/amber by category).
- `EvidenceTimeline.tsx` adds on top: perspective badge (~150), role badge (red/slate, 157-169),
  category badges (172, `max={2}`), pending badge (amber, 176-179), plus body-metadata chips —
  figures (blue-50, 239), medical (purple-50, 254), statistical (emerald-50, 269), regulatory
  (amber-50, 284).
- No single centralized palette object covers all of these — tier and category each have a
  dedicated mapping function (`tierAccentColor()`, `categoryStyle()`), everything else is inline
  Tailwind color literals scattered per-component.

**This phase is a design-system decision, not a mechanical fix** — unlike Phases 1–3, there's no
single "correct" answer to extract from the code as it stands today. Suggested approach when
picked up:
1. Introduce one shared icon-size scale (e.g. `sm`/`md`/`lg` tokens) and move `↗` and 🔍 onto it at
   a size that's actually legible on mobile (the user's core complaint) — likely 16-20px minimum
   for functional icons, distinct from the 80px illustration tier.
2. Either consolidate the ad-hoc Tailwind color literals (figures/medical/statistical/regulatory
   chips) into `investigativeCategories.ts`'s existing `categoryStyle()` pattern, or make a
   deliberate call to reduce the total number of distinct hues shown on one card — this needs a
   design pass, not just a refactor, since the colors currently carry real taxonomic meaning
   (per-category color consistency was itself a deliberate choice, not an accident).

---

## 6. Minor / lower-confidence — pick up opportunistically

- **`aria-label` language inconsistency:** `src/components/TopNav.tsx:245` hardcodes
  `aria-label="Open navigation menu"` (also line 143, `"Close navigation menu"`), never calling
  `useTranslations`, while `src/components/FloatingChatWidget.tsx:214/128` correctly resolve
  `t('openLabel')`/`t('closeLabel')` from `messages/he.json:559-560` /
  `messages/en.json:559-560`. Invisible to sighted users but a real accessibility/i18n gap — fix by
  adding two keys and wiring `TopNav.tsx` the same way `FloatingChatWidget.tsx` already does.
- **Key Figures apparent duplication — investigated, not a bug, no fix planned:** the same person
  chip can render twice on a thesis page — once inline via the `keyFigureMention` TipTap node
  wherever it appears in the body (`TipTapRenderer.tsx:62-73`, including inside numbered
  claims/`listItem`s, lines 116-121), and again in the thesis-level rollup under "דמויות מפתח"
  (`theses/[id]/page.tsx:412` filters `hv.mentions` for `type === 'KEY_FIGURE'`, rendered
  lines 495-511). These are two genuinely different, intentional code paths (per-mention inline tag
  vs. a full rollup of every mention record) that happen to visually repeat when a figure is
  mentioned in the body text. Leaving as-is; revisit only if it keeps reading as confusing once the
  other phases land and the page is less visually noisy overall.

---

## 7. Explicitly out of scope

- Any left/right, RTL-mirroring-specific claim not independently confirmed against `dir="rtl"` in
  two different contexts (see §0's caveat) — the review tool's RTL rendering doesn't reliably match
  a real device.
- Backend changes — every finding here traces to frontend rendering/i18n; no backend data model or
  API change identified as necessary.
- Evidence/diff versioning, forensic classification precision, and other open items tracked
  separately in `docs/gf-evidence-integrity-dev-plan.md` and memory — unrelated to this UI-polish
  pass.
