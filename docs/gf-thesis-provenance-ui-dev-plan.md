# Glass Fortress — Thesis Provenance UI

**Status:** designed, not built. Canonical spec — implement from this document.
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
