# Glass Fortress — Thesis Provenance UI

**Status:** BUILT 2026-08-24. §9 records what implementing it found. This document remains
canonical — §1-§8 are the design as specified, §9 is what the build changed.
**Designed:** 2026-08-23 with the researcher. Written for a session with **no prior context**.

---

## 1. The gap

Every consequential act on a thesis is already recorded as a `ResearchSessionEvent`. None of it
is reachable from the UI.

- **No REST route** exposes session events.
- **No frontend file** references sessions at all.
- `get_session_summary` reads them but is **MCP-only** — so the record exists, and only a
  researcher driving tools can see it.

That record answers *"how did this thesis come to say what it says"* — the question this platform
exists to answer about its own output, and currently the one thing it cannot show.

## 2. What is already built — do NOT rebuild

Verify each before writing anything; if one is missing, that is a bug report, not a task.

| Already works | Where |
|---|---|
| Draft theses are listed to researchers | `thesisRoutes.ts` list route filters `publishedVersionId: { not: null }` **only** when `viewer === 'PUBLIC'`; a researcher gets `{}` |
| Publication state badge per thesis | `PublicationBadge.tsx` |
| All 13 publication checks rendered, pass/fail, hard/advisory | `ThesisPublicationPanel.tsx` |
| Readiness computed without writing | `POST /api/thesis/:id/publication-readiness` (`requireResearcher`) |
| Publication itself | `POST /api/thesis/:id/publish`, `/unpublish` |

Background on the gate those come from: `docs/gf-thesis-publication-gate-dev-plan.md`.

## 3. The data

`ResearchSessionEventType`, complete:

| Event | Meaning |
|---|---|
| `SESSION_STARTED` · `SESSION_CLOSED` | bookends, automatic |
| `FRAMING_PROPOSED` | a researcher's proposed framing, verbatim |
| `FRAMING_ASSESSED` | the adversarial response; **`description` is assessment JSON** |
| `THESIS_ATTACHED` | the framing produced a thesis; `refId` is the Thesis id |
| `VERSION_CREATED` · `AI_ANALYSIS_RUN` · `GAP_RESOLVED` | automatic, during the work |
| `NOTE` | manual, via `add_session_note` |
| `PUBLICATION_RATIONALE` | the researcher's argued case for publishing |
| `PUBLICATION_ASSESSED` | the assessor's response; **`description` is assessment JSON** |
| `THESIS_PUBLISHED` · `THESIS_UNPUBLISHED` | `refId` is the pinned/unpinned `ThesisVersion` id |
| `SESSION_CLOSED_BY_OTHER` | another researcher closed this session to open theirs; names who and why |

**Querying is simple: `where: { thesisId }`.** `attachThesisToFramingSession`
(`services/thesisFraming.ts`) sets `thesisId` on the framing session at attach time, so a framing
session that produced a thesis is found by the same query as any other. A framing session that
never produced one keeps `thesisId: null` and is **out of scope** — abandoned framings are not a
thesis's provenance.

`ResearchSession.researcherId` is nullable; sessions predating ownership read as legacy with no
actor. Render that as unknown, never as an empty name.

## 4. Build

### 4.1 `GET /api/thesis/:id/provenance` — `requireResearcher`

Returns the thesis's sessions with their events in chronological order: `type`, `createdAt`,
`refId`, `description`, and the session's own `id`, `name`, `question`, `status`, `researcherId`.

**Parse the JSON-bearing events server-side.** `FRAMING_ASSESSED` and `PUBLICATION_ASSESSED` store
assessment JSON in `description`. Return them **structured** — contradictions, unverified
assumptions, candidate framings, verdict, substance — never as a string for the client to parse. A
client that parses prose is a client that breaks when the prose changes.

**A malformed stored assessment must be reported as malformed**, not omitted and not rendered as
empty. "No contradictions" and "the record is broken" are opposite facts.

### 4.2 The provenance timeline — thesis page, researcher-only

The path from question to published, in order:

```
framing question
  → round 1: proposed / assessed  (contradictions, unverified assumptions)
  → round 2 …
  → thesis attached
  → version created · analysis run · gaps resolved
  → publication rationale + assessment
  → published / unpublished
```

Each entry dated, and attributed where an actor is known.

### 4.3 Progress toward approved

Render the current publication checks **beside** the timeline, reusing `ThesisPublicationPanel` —
do not duplicate it.

> The timeline is what has happened. The checks are what remains.

### 4.4 Two fixes that belong with this, not after it

Both are small, both are backend, and both determine whether the timeline in §4.2 has anything
to show.

**(a) `create_thesis_draft` must DERIVE the framing session, not accept it optionally.**

`framingSessionId` is `.optional()`, attached only at creation, and `attachThesisToFraming` has
exactly **one** caller. Omit the parameter and both rows still exist, a human can see the
relationship in the timestamps, and **nothing in the system can ever record it.** Provenance lost
by a missing argument, with no repair path. The tool's own description says as much and then
leaves it to the caller.

One ACTIVE session is now enforced system-wide, which removes the ambiguity that justified the
parameter: if a thesis is being created and exactly one framing session is active, there is no
question which one it came from.

- Derive the link from the single active session.
- Warn loudly when there is none — do not fail silently.
- Keep the parameter as a manual override for the unusual case.
- Add a repair path so a thesis created without a link can be attached afterwards.
  `attachThesisToFraming` already refuses when `session.thesisId` is set; keep that, so a repair
  can never overwrite an existing link.

Why this matters more than it looks: **the provenance page's value is that it cannot be curated.**
A researcher who could quietly create a thesis without its framing session — the one holding an
adversary's objections and a correction they were asked to make — could publish a narrative whose
reasoning trail is simply absent, and it would look identical to a thesis that never had one.
Deriving the link removes the choice.

**(b) The theses list empty state asserts a fact about the world instead of describing what this
viewer can see.**

`theses/page.tsx` renders one string for everyone: *"אין תזות עדיין. היה/י הראשון/ה לכתוב."*
Correct while zero theses exist. Once drafts exist, a **public** visitor is told there are none
while theses exist and are simply unpublished. Not a leak — the inverse: a false statement made to
avoid one.

- PUBLIC, nothing published → *"no theses have been published yet"*
- RESEARCHER, nothing exists → *"no theses yet — be the first to write one"*

Do not reveal counts or titles to the public. The fix is honesty about the **scope of the answer**,
not disclosure of what is hidden.

## 5. Constraints

- **Researcher-only, all of it.** Route behind `requireResearcher`; the page 404s to the public
  exactly as a draft does. This view holds rejected framings, recorded dissent, and an adversary's
  objections about named living officials — deliberation the platform deliberately does not
  publish. `defamation-risk.md` ranks AI-generated text about named individuals as the top risk
  surface, and this page is a concentrated feed of precisely that. It is also the most interesting
  page on the site, which is exactly why someone will eventually argue for making it public.
- **No new MCP tool.** This is a UI read of existing data; `get_session_summary` already covers the
  MCP path.
- **Show dissent.** A `DISPUTES` verdict published over is the most important thing in the record,
  not something to hide behind a "published" badge.
- **Empty is a state, not a blank.** A thesis with no attached session must say so. Legacy theses
  have none, and *"no provenance recorded"* and *"provenance failed to load"* must never look
  identical — the same rule as `NO_SOURCE_TEXT` vs a passing check elsewhere in this codebase.
- **Hebrew-first RTL**, both locales, consistent with the rest of the app.

## 6. Tests

- The route refuses an anonymous caller.
- A framing session that produced a thesis appears in that thesis's provenance.
- A framing session that produced **no** thesis does **not** appear anywhere.
- `FRAMING_ASSESSED` returns structured contradictions, not a JSON string.
- A **malformed** stored assessment is reported as malformed, not as absent.
- A thesis with no session renders the empty state rather than an empty list.
- A publication carrying a `DISPUTES` verdict shows the objection.
- An event whose session has no `researcherId` renders as unknown, not blank.
- A thesis created while one framing session is ACTIVE is linked to it **without** the parameter
  being passed.
- Creating a thesis with **no** active session warns rather than silently producing an orphan.
- The repair path attaches a framing session to a thesis that has none, and **refuses** when the
  session is already bound to a different thesis.
- With ≥1 draft and 0 published, the public list renders the "none published" message and the
  researcher list renders the drafts.

## 7. Non-goals

- No public-facing provenance view. See §5.
- No editing or deleting events. The record is append-only.
- No abandoned-framing browser. Out of scope; revisit only if asked.
- No new MCP surface.

## 8. Verify first

`GET /api/thesis/:id/provenance` needs a thesis to exist, and staging currently has **0**. The
thesis walk (Part III of `gf-researcher-playbook.md`) is producing the first one. Either wait for
it, or build against fixtures and verify live afterwards — but do not conclude the route works
because it returned an empty list against an empty database.

---

## 9. What the build found — 2026-08-24

Implemented as specified, including both fixes in §4.4. Five things worth recording.

### 9.1 §8 was stale, in our favour

The plan said staging held **0** theses and to build against fixtures. It now holds **one** —
`cmt5jffqy000lf52mn6t56f3l` — with an ACTIVE session carrying 9 events. The service was therefore
verified against real data, not only fixtures:

```
counts: { sessions: 1, events: 9, malformedAssessments: 0 }   empty: false   dissent: 0
  SESSION cmt5gm7lr0005f52m6v5fiy3r  status=ACTIVE  actor=יהונתן
    SESSION_STARTED · FRAMING_PROPOSED · FRAMING_ASSESSED (1 contradiction, 2 candidates)
    FRAMING_PROPOSED · FRAMING_ASSESSED (0 contradictions) ×2
    THESIS_ATTACHED · AI_ANALYSIS_RUN
  SESSIONS WITH NO THESIS: 2 (both CLOSED) — absent from the output above, as required
```

All three stored `FRAMING_ASSESSED` rows parsed and **validated** against the real
`ThesisFramingAssessmentSchema`. That is the check that mattered: had the schema been wrong, every
one would have read as `malformed` and the page would have shouted about a defect that was mine.

### 9.2 Two of the harder test cases had live data, not fixtures

Both CLOSED sessions carry `thesisId: null` — the abandoned framings §3 puts out of scope — and both
carry `researcherId: null`, the legacy actor that must render as *unknown* rather than blank. Neither
needed to be invented.

### 9.3 The publication half of the timeline has no live data at all

Staging holds `SESSION_STARTED`, `FRAMING_PROPOSED`, `FRAMING_ASSESSED`, `THESIS_ATTACHED` and
`AI_ANALYSIS_RUN` — and **zero** `PUBLICATION_RATIONALE`, `PUBLICATION_ASSESSED` or
`THESIS_PUBLISHED`, because the thesis is still a draft. So the `DISPUTES` requirement in §6 and the
publication tail of the timeline are covered by **fixtures only** until the walk publishes. Stated
here rather than left to be discovered, because an empty section reading as a passing one is the
failure this page exists to prevent.

### 9.4 A malformed assessment did not merely render badly — it threw

`getThesisFraming` parsed the newest stored assessment with a bare `JSON.parse`. A malformed row did
not read as malformed: it **threw**, taking the whole `get_thesis_framing` tool down with it. Found
while clearing a lint error two functions away from the new code.

It now shares the provenance parser and reports `latestAssessmentMalformed: { reason }` beside
`latestAssessment: null`, so "no assessment has been made" and "the stored assessment is broken" stay
apart. Three tests cover it. The parser validates against the zod schema rather than merely parsing
JSON, because `{}` parses fine and would render as an assessment that found no contradictions —
indistinguishable from a real one that found none.

### 9.5 The repair path is a REST route, not an MCP tool

§7 rules out new MCP surface, and the provenance page is where a missing link is noticed, so
`POST /api/thesis/:id/provenance/repair` sits beside the read. It refuses a session already bound to
a different thesis and a thesis that already has one — a repair able to overwrite an existing link is
not a repair, it is a way to rewrite provenance.

This dovetails with something already built: publication **check 13, `FRAMING_ATTACHED`** (advisory)
already reports *"No framing session is attached — the reasoning that chose this framing is not on
record."* The gate names the defect, the provenance page shows it, and the repair route fixes it.

### 9.6 What is verified, and what is not

| Verified | How |
|---|---|
| The service against real staging data | Run directly against the staging DB (§9.1) |
| The route refuses an anonymous caller | Live `401 Missing Authorization: Bearer <token>` against a local backend |
| Both provenance routes mount `requireResearcher` | `thesisRoutes.test.ts`, asserted on the router stack |
| Assessment parsing, malformed handling, dissent, actors, scope | `thesisProvenance.test.ts` (15) |
| Derivation and repair | `thesisFraming.test.ts` (25) |
| Every event type has a label in both locales | `provenanceLabelParity.test.ts` |
| The frontend compiles with the panel mounted | `next build` |

**Not verified: the researcher view rendered in a browser.** It requires signing in as an approved
researcher, which is the maintainer's own account. The public branch of the §4.4b empty state is
likewise unverified visually; both locale strings are asserted present and distinct by test. Someone
with a researcher login should open a thesis page and confirm the timeline renders RTL in both
locales before this reaches production.

### 9.7 Where the code lives

| Piece | File |
|---|---|
| Provenance assembly + assessment parsing | `backend/src/services/thesisProvenance.ts` |
| Derive + repair the framing link | `backend/src/services/thesisFraming.ts` |
| `GET /:id/provenance`, `POST /:id/provenance/repair` | `backend/src/routes/thesisRoutes.ts` |
| Derivation wired into the tool | `backend/src/mcp/tools/createThesisDraft.ts` |
| The timeline | `frontend/src/components/ThesisProvenancePanel.tsx` |
| Types + fetch | `frontend/src/types/thesis.ts`, `frontend/src/lib/thesisApi.ts` |
| Viewer-dependent empty state | `frontend/src/app/[locale]/theses/page.tsx`, `messages/{he,en}.json` |

### 9.8 Deferred here, then done — the repo-wide fetch refactor

`ThesisProvenancePanel` originally added one `react-hooks/set-state-in-effect` lint error — the
ordinary fetch-on-mount shape, which this frontend already used in eight other places including
`AuthContext`, `theses/[id]/page.tsx` and `evidence/page.tsx`. Contorting one component to dodge a
rule the app violated everywhere would have made it inconsistent with every sibling for no runtime
gain, so it was deferred to its own task. That task has now run, and the panel uses the shared hook
like everything else.

**`src/hooks/useAsyncData.ts` is the one fetch-on-mount shape in this app.** Hand it a memoised
fetcher — `useMemo` returning the fetcher, or `null` when there is nothing to fetch yet — and it
reports exactly one of `idle | loading | ok | error`.

The design point worth keeping: **the hook never writes `loading`.** It caches a settled result
tagged with the fetcher that produced it, and derives the state during render:

```ts
const state = cache && cache.key === fetcher ? cache.settled : fetcher ? LOADING : IDLE;
```

Change the fetcher and the previous answer is stale in the *same* render pass. Nothing has to write
`loading` back from inside an effect, which is what the lint rule objects to — and every call site
that used to clear its own state by hand before refetching (`setEvidence([])`, `setRecords([])`,
`setCells(null)`) lost that step, along with the chance of forgetting it.

Three rules the call sites depend on:

- **The fetcher's identity IS the cache key.** It must be memoised, and its deps must be values, not
  functions — three sites originally had next-intl's `t` in the dep array, which would have been a new
  key on every render and an endless refetch loop if `t` is ever not referentially stable. They depend
  on the resolved *string* instead, which is stable by value regardless.
- **`idle` is not `loading`, and neither is an empty `ok`.** "You have not selected a figure",
  "we are fetching", and "there is nothing" are three different statements and the UI says all three.
- **`reload()` never rejects.** It returns the settled result, so `void reload()` is safe in an
  `onClick` and a poller reads the same value the UI renders. It does not blank the view: a refresh
  after a mutation leaves the previous result on screen until the new one lands.

Fetchers take an `AbortSignal`, so a slow first request can no longer overwrite a faster second one,
and `lib/api.ts`'s `fetchJson` keeps transport failure, status failure and abort as three separate
outcomes rather than collapsing them.

Three sites are *not* fetch-on-mount and would have been wrong to force through the hook. They get
the matching React primitive instead, and the reason is the same in each case — a client-only value
that React itself can switch, rather than state an effect has to write:

| Site | Was | Now |
|---|---|---|
| `TopNav` portal flag | `useState(false)` + effect setting `true` | `hooks/useIsHydrated.ts` (`useSyncExternalStore`) |
| `reports/new` magic link | mount effect reading `window.location.hash` and seeding three states | `hooks/useMagicLinkFragment.ts`, derived + explicit override |
| `ThesisEditor` mention list | effect resetting the index on list change | selection tagged with the list length it was made in |

`ThesisEditor` also lost two refs that wrapped a `useState` setter and a ref object "so the closure is
never stale" — neither value can go stale, and the wrapper meant writing refs during render. Two
`react-hooks/refs` disables remain there, both commented: the rule cannot see that
`buildMentionExtension` *stores* its callback for TipTap rather than calling it during render.

`npm run lint` went from 24 problems to 0. The frontend still has no test framework, so the guard is
`npm run lint` + `npx tsc --noEmit` + `npm run build`, plus a live pass over every affected page.
