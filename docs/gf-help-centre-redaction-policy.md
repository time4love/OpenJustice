# Help Centre Redaction Policy

**Status:** decided 2026-08-25, before the first example was written.
**Governs:** every page under `/guide`, and every example inside one.
**Required by:** `docs/production-help-center-build.md` §5b.
**Reads on:** `defamation-risk.md` (memory), `docs/gf-researcher-playbook.md` *Recording convention*.

This is decided once, on purpose. Per-example judgement calls guarantee inconsistency, and
inconsistency in this particular area is not a tidiness problem — it is the difference between a
teaching page and a publication naming a living official.

---

## The problem this solves

The help centre teaches "Claude chat + MCP". The obvious way to teach that is to show a real chat.
A real chat in this project contains the real thesis, and the real thesis contains allegations about
named, living Israeli officials. Under חוק איסור לשון הרע the burden of proving truth falls on us,
and a teaching page carries **none** of the protections the thesis itself carries: no publication
gate, no hedge-vocabulary check, no public-interest anchor written for it, no legal review.

So the exposure of a help-centre page is *higher* per word than the thesis it describes, while its
public-interest justification is *lower*. The policy follows from that asymmetry.

---

## The six rules

### Rule A — No living individual is named anywhere in the help centre

Not in prose, not in an example request, not in an example response, not in a caption, not in an
alt attribute.

The thesis names officials because the public interest requires it and because the publication gate
enforces Rule 1 and Rule 4 framing on every such sentence. A page teaching *how to run a scan* has
no equivalent need and no equivalent protection. Where an example genuinely needs a subject, it uses
an office with no incumbent attached (`"the ministry"`, `"משרד הבריאות"`) or an obvious placeholder
(`"<figure>"`).

This rule is absolute and has no public-interest exception, because the page itself makes no
public-interest claim.

### Rule B — Requests verbatim, responses as structure only

Inherited unchanged from the playbook's recording convention, and for the same three reasons: the
repository is public; LLM prose is non-deterministic so an example asserting on it teaches a fiction;
and a reader learning the workflow needs the *shape* of the exchange, not one investigation's
conclusions.

Concretely, in an example response:

| Field kind | Shown |
|---|---|
| Field names, types, enum values | **Yes, exactly** |
| Counts, status transitions, ids | **Yes** |
| Hashes, dates, capture counts, URLs | **Yes** |
| Any prose field (`summaryHe`, `rebuttal`, `reasoning`, `body`) | **No** — rendered as `"<prose>"` with its type and length noted |

### Rule C — Images are allowed for INTERFACES and barred for CONTENT

**Amended 2026-08-25.** The original rule barred every image. It was reasoned from screenshots of a
research conversation and then applied to all pictures, which was over-broad: of its four
justifications, only one survives contact with a screenshot of a client's settings dialog.

The line is **what is in the frame**, not whether it is an image.

**Barred — reconstruct as hand-written text instead:**

- Any screenshot of a research conversation, a thesis, a critique, an evidence record, a tool
  response, or a terminal.
- Rationale intact for these: you cannot grep a PNG for an official's name; the picture drifts
  silently the moment a tool's output changes; and terminal captures are the single most likely way a
  project ref or connection string reaches this **public** repository.
- A reconstruction is not a fake. It is the same contract, written by hand, with prose fields elided
  per Rule B — exactly what the playbook already records for every step.

**Allowed — a screenshot of a client's connector or settings interface**, under every condition below.

For "which control do I click", a picture is not a shortcut; it is the correct medium. Prose
describing a dialog drifts too, and drifts *invisibly* — a stale screenshot at least looks stale.
There is also no text reconstruction of a UI to machine-check, so the argument that reconstructions
are checkable buys nothing here.

Conditions, all of which must hold:

1. **No account identity in frame** — no email address, handle, avatar, or profile name. The
   researcher's personal Google account must not become a permanent public artifact.
2. **No secret in frame** — no token, `Authorization` header, OAuth `code`, `state`, or
   `access_token`, in a field or a URL bar. This is Rule E, and an image is where it is hardest
   to notice.
3. **Nothing incidental in frame** — no other browser tabs, bookmarks, notifications, or desktop.
   Crop to the dialog.
4. **Redaction is baked into the pixels.** A CSS overlay or a black `div` over an image is not a
   redaction; the original is still in the file.
5. **Declared, not dropped in.** The file lives under `public/guide/` and is named in the phase
   manifest. An image nobody listed is an image nobody reviewed.
6. **Reviewed as permanent and public**, because committing it to this repository is exactly that.

### Rule D — Deterministic artifacts may be quoted; allegations may not

The help centre may quote anything that is a **fact about a document**: capture counts, flip dates,
absence durations, trajectory labels, claim hashes, content hashes, transaction hashes, tracked URLs,
record ids, gate check names and their pass/fail results.

It may not quote anything that is an **assertion about a person**, including the thesis body, the
Devil's Advocate critique, evidence summaries, and framing-session rationales — even hedged, even
already published.

The line is deliberately drawn at "about a document" vs "about a person" rather than at
"published" vs "unpublished", because publication changes the thesis's legal footing and not the
help centre's.

### Rule E — Identifiers: opaque ids yes, infrastructure no

Showable: thesis ids, version ids, computation ids, session ids, evidence ids, on-chain transaction
hashes, the public MCP endpoint URL, tracked government URLs, Wayback capture URLs.

Never: Supabase project refs, connection strings, API keys, bearer tokens, OAuth client secrets,
Railway internal hostnames, `.env` contents, or any value from `.env.staging` /
`.env.production.local`. This holds for prose, examples, and the `alt`/`title` of anything.

### Rule F — Any example of AI output carries the Rule 3 label

If a page shows what an AI-generated field looks like — even as `"<prose>"` — the surrounding block
carries the standard label:

> ניתוח AI — אינו מהווה קביעה שיפוטית

so that a reader who copies the example into their own work copies the label with it.

---

## What this costs, stated honestly

The help centre will be less vivid than one built from screenshots of a real conversation. That is
the intended trade. What it loses in immediacy it gains in three things that matter more here:
it stays true as the tools change, it can be reviewed by reading a diff, and it cannot become the
platform's least-defensible publication.

---

## How this is enforced

**Mechanically, at build time** — `apps/glass-fortress/frontend/scripts/check-guide-content.mjs`,
wired into `npm run build`, so a violation fails the deploy rather than shipping:

- **Rule C** — an image may be referenced only by a phase that declares `screenshots` in the
  manifest, only by a filename that phase lists, and only from `public/guide/`. The file must exist.
  An image reference appearing in *message content* is still a violation: prose is not where a
  picture gets smuggled in. Conditions 1–4 and 6 are review rules — no checker can see what is inside
  a PNG.
- **Rule E** — connection strings, credentials in URLs, JWTs, API keys, Supabase project refs,
  Railway internal hostnames, key material, and environment-variable names.

**By the type system, at compile time** — `src/lib/guide.ts`:

- Every message key the pages render is derived from a slug and a step id that are typed against
  `messages/he.json` itself, so a key with no translation behind it is a type error rather than a
  Hebrew page displaying its own key name.
- The two locales are locked to the same key shape, in every namespace, by mutual assignability of
  the two JSON module types. Deleting a key from one locale fails `tsc`.

**By review, and only by review** — Rules **A**, **B**, **D** and **F**.

Rule A is the one worth being explicit about: a regex cannot recognise "a living official's name",
and a check that pretends to would be worse than no check, because everyone downstream would stop
looking. It is enforced by the person writing the page and the person reviewing the diff — which is
also why the rule is absolute and admits no exception: an absolute rule is one a human reviewer can
actually apply.
