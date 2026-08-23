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
