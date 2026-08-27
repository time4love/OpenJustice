# Rebuild the factual layer, one level at a time

**Written 2026-08-26, restructured 2026-08-27** after the production thesis walk stopped at its
drafting step and a day of measurement established that the layer beneath it cannot be patched into
correctness.

**Implementation started 2026-08-27.** Two decisions taken that session, both recorded below:
**Level 10 supersedes rather than deletes, and there is only ever one registry** (§4 Level 10);
**staging is finished before any production data is migrated** (§6).

Companions: `docs/gf-framing-assessor-defects.md` (four defects, with reproduction cases),
`docs/gf-production-thesis-replay-plan.md` (how they were found).

---

## 1. The decision

**Rebuild the factual layer from the archive, upward, with each level's integrity enforced in code
before the next is built. Keep the existing corpus untouched as a comparison. Supersede it last —
**nothing is ever deleted, and there is only ever one registry.**

Not a patch-in-place. Three findings make patching indefensible:

- **The extraction discards a third of every page, and a *different* third on different captures.**
  Measured on staging: 60–69% retained. That is what manufactures changes that never happened.
- **7 of 81 diffs are contradicted by the raw archived documents.** Measured, not sampled
  (`forensics:measure-divergence`, 2026-08-27). Three of the seven report the same sentence as both
  REMOVED and ADDED while it sits in both documents. Two of those three are among the seven diffs
  classified legally significant.
- **A false claim built on this reached a published thesis** and is still published.

And the reason a patch would not hold: **every one of these was already documented in a comment.**
`src/lib/archiveText.ts`, authored 2026-08-23, states that the extraction dropped *"the sentence a real
thesis went on to claim had been ADDED the following day"*. `evidenceCapture.ts` records a dropped
byline date corrupting `evidenceDate`. `createEvidenceFromUrl.ts` records an unstable counter. Three
encounters, three comments, no change to the storage decision.

**A comment is not a control. A tool a human must remember to run is not a control either.**

---

## 2. The clean model

### Archiving is the pipeline. A direct fetch is a step in it, not a kind of capture

`create_evidence_from_url` creates **zero** snapshots. A live-URL submission produces an `Evidence` row
with no capture beneath it, and `EvidenceCapture.evidenceId` is `@unique`, so **that URL's history is
structurally capped at one observation forever**. It can never appear in a diff, a trajectory,
`list_captures`, or a boilerplate corpus.

*(Correcting an earlier version of this document: it claimed such evidence "cannot be recomputed" and
that this was "very likely why 5 of 7 anchored records were unrecomputable". Both are false. The
identity function is self-contained and recomputes fine, and the row counts make the inference
impossible — **staging holds 0 `EvidenceCapture` rows and production holds 1**. The claim was reasoned
from plausibility instead of counted, in a document about exactly that failure. The defect is loss of
**history**, not of recomputability.)*

**A URL submission is a request to track a URL**, and the pipeline is always the same:

1. **Ask CDX what the Archive already holds.** A submitted URL with fifty captures yields a forensic
   timeline immediately — that is the product, not plumbing.
2. **If nothing is held, ask Save Page Now to create one.**
3. **Evidence is created from the archived capture**, once it is available.

So there is no `WAYBACK`-versus-`DIRECT` axis of equals. **A direct fetch is a transient precursor**,
and it persists as a first-class provenance only in the case where archiving is genuinely impossible.

| provenance | meaning | expected frequency |
|---|---|---|
| `WAYBACK` | the Archive holds it; a stranger can re-check it | the normal case, and the destination of every submission |
| `DIRECT` | we fetched it and the Archive has not (yet) indexed it | **transient**, or permanent only for a page the Archive cannot take |
| `ASSERTED` | text supplied to us; nobody we control observed the page | the exception path — see below |

That collapses the trust problem rather than managing it: the weak branch of *can a stranger re-check
this?* stops being a standing feature of the model and becomes a labelled exception.

**Three things this requires:**

- **Submission is queued, never blocking.** Save Page Now returns quickly but CDX indexing lags —
  minutes, sometimes far longer. A pending record plus a job that completes when the capture appears;
  never a request that waits.
- **Some pages cannot be archived.** robots.txt exclusions, paywalls, login-gated pages, sites that
  block the Archive. `DIRECT` is that exception path, recorded as such — rare and visibly labelled
  rather than routine.
- **Keep our own fetch and reconcile it.** We fetch at `T`; the Archive captures at `T+δ`, and the page
  can change in between. Discarding our observation loses what the page said when the researcher
  looked. Compare the two when the capture lands: identical is corroboration; **different is a
  finding** — either a real change inside the gap or a fault in our fetch; unavailable is
  `UNAVAILABLE`, never a pass.

Everything structural is shared across provenances, so diffs, trajectories, identity and boilerplate
detection work over the merged history without knowing which is which. Only *evidential standing*
differs, and Level 9 must know: an `ASSERTED` record is never citable at the standing of a captured
document.

**The website-submission and screenshot-recovery paths are `ASSERTED`.** `/confirm` receives
client-scraped text and the server never fetches the page. Storing that in the document column to
satisfy a `NOT NULL` constraint would be the dishonest-empty-string failure in a new costume. They keep
their own store and are named as assertions.

**Settled 2026-08-27:**
- `@@unique([trackedUrlId, capturedAt])`, second resolution. Simplest thing that works.
- **An unchanged re-fetch is dropped.** But see Level 1 — the existing scanner's `seenDigests` set
  appears to drop non-consecutive reverts too, and a page returning to a former state is forensically
  significant. Two answers to "is this capture new?" must not ship in one write path.
- Extend `UrlSnapshot` rather than renaming it to `Capture`: `fullText`'s ~40 call sites move one at a
  time, and a rename turns that into a big-bang for no gain.

### Identity may change. It may not change unrecorded

Nothing in this plan is constrained by wanting to avoid orphaned anchors. **Level 10 forbids deleting
records, not superseding them** — `previousFileHash` and the `ORPHANED_ANCHOR` verdict exist precisely
so an identity can move while every anchor stays explainable, and that path was already exercised on
2026-08-23. An orphan *with* a record is the supported case; an orphan with none is the forbidden one.

An earlier revision of this document conflated the two and told an implementer that changing identity
was forbidden. It is not. **The guiding principles are model clarity, data integrity and future-proof
ids** — the cost of re-anchoring is not an argument against any of them, and state may be rebuilt from
scratch if that produces cleaner code.

**Identity hashes the whole document.** Today direct-URL evidence hashes `url + text[0:40k]`, which
means **any two pages identical for forty thousand characters and divergent after share one identity**.
That is the same failure family as the diff truncation this entire plan descends from — an arbitrary
cap applied at write time, invisible in the output, silently deciding what counts. The repository has
now been burned by it three times: the 8-chunk diff cap, `MIN_CLAIM_LENGTH = 40`, and this. One rule
for snapshots and evidence alike: no cap, no unexamined tail.

### Storage is lossless. Filtering is a versioned view that MARKS and never DELETES

There is no reason to *store* an extraction; there may be a reason to *compute* a view. Every original
justification for extracting at write time has dissolved: the Archive's toolbar is removed by the `id_`
URL, identical chrome produces no diff line and cancels itself, and only *changed* chunks ever reach a
model.

The deeper objection is not cost. **Extraction requires deciding what a page is about before you know
what you are looking for**, and a forensic archive's premise is that you do not know yet. This corpus
proves it: the finding the investigation rests on is that the *adverse-event reporting channel* was
removed — a link, and Readability classifies links as chrome by design. An instrument tuned to find
"the article" is blindest to exactly the parts of a government page that carry obligations rather than
prose: reporting channels, committee protocols, contraindication notes, links to forms. Those are what
a ministry edits when it changes what it is telling people.

### The chain attests to the document

`contentHash` is SHA-256 of the *extraction*, so today the chain attests to less than the platform
claims. Anchoring the document makes *"this page held exactly this text on this date"* true for the
first time, and it happens **once**: a document is fixed forever, so its anchor never moves again.

The cleaned view then becomes derived, versioned state — carrying a `boilerplateVersion` and the
`sourceStateHash` it was computed against. It can be improved forever without touching the chain.
That also resolves what would otherwise sink corpus-derived boilerplate: a growing corpus means a
changing view, which is normal for derived state and fatal for anchored state.

### Boilerplate is a property of the template, not of one page's history

A rule of "a block appearing across most captures of this page is chrome" **degenerates at N=1**: with
one capture every block scores 1/1, so the rule classifies the whole page as chrome. It inverts rather
than weakening — and a live URL is N=1.

Chrome is **what repeats across a corpus**, and the corpus extends along either axis:

| axis | corpus | works when |
|---|---|---|
| **time** | many captures of one URL | the page has history |
| **space** | many pages of one site | the page has siblings, including at N=1 in time |

With one page, one capture and no siblings there is no evidence, and the only honest behaviour is to
filter nothing and record that nothing could be judged. **Confidence therefore belongs in the stored
verdict**: a block called chrome on the evidence of 83 captures and one called chrome on 3 are not the
same claim.

**The safety property that makes a mistake affordable: classification MARKS, it never DELETES.** A
misclassification then costs noise in a report. Today's extraction deletes, so a misclassification
costs a phantom change or an invisible edit — and this corpus contains one of each.

---

## 3. Every check result is stored state

A check that runs and is not recorded has not been performed, as far as anything downstream can tell.
**The verdict is the deliverable, not the check.**

| kind of check | treatment |
|---|---|
| function of data already held | **derive on read** |
| **observation of an external system** | **must be stored** — it cannot be re-derived |
| expensive function of held data | **cached verdict**, invalidated by version |

### `UNAVAILABLE` is a verdict about a CHECK, never about DATA

A check may legitimately be unavailable — the Archive was down, so this claim is unverified. **A
mandatory attribute may not.** Conflating them is how "we could not check" becomes indistinguishable
from "we never stored it". A metric counting rows that lack mandatory data is an admission that the
schema permits invalid rows; the answer is to make them impossible and pay for the migration.

### The record

Mirroring `ClaimTrajectoryComputation`, which already stores `sourceStateHash` / `detectionVersion` /
`computedAt`:

| field | why |
|---|---|
| subject (type + id) | what was checked |
| `checkType` | a subject has several |
| `verdict` | `VERIFIED` · `CONTRADICTED` · `UNAVAILABLE` |
| `detail` | for `CONTRADICTED`, what disagreed — **this is the pipeline-defect record** |
| `checkedAt` | when |
| **`verifierVersion`** | if the verifier changes, every stored `VERIFIED` becomes unproven |
| **`sourceStateHash`** | makes staleness computable rather than assumed |

The last two are not optional: this repository has invented that provenance axis after the fact four
times already (`classifierVersion`, `summaryVersion`, `diffInputVersion`, `DETECTION_VERSION`).

**Open design decision:** one polymorphic `IntegrityCheck` table, or verdict columns per subject.
Recommendation: the table — a subject carries several check types, history matters across re-checks,
and it yields a coverage report for free.

---

## 4. The levels

**A level is not finished until code makes its invariant unbreakable. No level begins until the one
below it can no longer produce bad data.** That ordering is the entire method: it is what separates
this from the three previous encounters with the same defect.

**An enforcement is not proven until it has been observed to FAIL.** Level 0 was validated by breaking
the extractor deliberately — returning `""` fails 18 tests, returning the extraction instead of the
document fails 11. A guard watched only in its green state has not been demonstrated to guard anything,
and this repository already records that lesson twice. Every level's enforcement gets the same
treatment before it counts as done.

Each level below names its **invariant** (what must always be true) and its **enforcement** (the code
that makes violating it impossible or impossible-to-miss).

### Level 0 — the instrument · **DONE**

*Invariant:* the extractor's behaviour is pinned to real captures, so a regression cannot silently make
every verification agree with whatever it checks.

*Enforcement:* `test/extraction/extractorPinnedToRealCaptures.test.ts` — three frozen `id_` captures,
16 tests, mutation-verified (returning `""` fails 18; returning the extraction instead of the document
fails 11).

### Level 1 — the capture

*Invariant:* every capture holds the document as fetched. No capture exists without one.

*Enforcement:* `document` is `NOT NULL`; the write path takes it as a required parameter, so no code
path can construct an incomplete capture; `documentHash = sha256(document)` over the **whole** document,
computed at write. **One write path** — `recordCapture({ trackedUrlId, provenance, capturedAt,
waybackTimestamp?, document, extraction })` — with `WaybackScraper` and the URL-tracking path both as
callers.

*Schema:* extend `UrlSnapshot` rather than renaming it. `provenance` enum `NOT NULL` (existing rows
backfill to `WAYBACK`); `capturedAt` `NOT NULL`, derived from `waybackTimestamp` for archived captures
and from the fetch moment otherwise; `waybackTimestamp` becomes nullable, since only archived captures
have one. Keep `@@unique([trackedUrlId, waybackTimestamp])` — Postgres does not collide on NULLs — and
add `@@unique([trackedUrlId, capturedAt])`.

*Notes:* `rawText`/`rawContentHash` and the backfill already exist and become this level's foundation.
`fullText` does not survive into the new model — consumers move across one at a time, since ~40 call
sites read it and swapping a column's meaning underneath them creates a different silent inconsistency.

*Verified 2026-08-27 — the reading was right, and the code's own comment named the case it discarded*
(*"non-consecutive ones where content reverts to a previously-seen digest"*). Fourth instance of §1's
pattern: documented in a comment, and the comment mistaken for a control.

There were **three** disagreeing answers to "is this capture new?", not two: CDX's server-side
`collapse=digest` (consecutive only), the client-side `seenDigests` Set (any repeat within one batch of
50), and the write path itself, which keyed on `(trackedUrlId, waybackTimestamp)` and was digest-blind.

Measured against the live CDX index and the staging database:

| term | count |
|---|---|
| captures CDX holds for the tracked page, after its own consecutive-collapse | 95 |
| distinct digests among them | 83 |
| rows CDX returned in batch 1 / batch 2 | 51 / 44 |
| within-batch reverts dropped in batch 1 / batch 2 | 8 / 3 |
| captures stored from batch 1 / batch 2 | 43 / 40 (one further capture FAILED to fetch) |
| **stored total** | **43 + 40 = 83** |

The twelfth revert, `20220703090600`, **is** stored — its twin fell in the previous batch, where the
per-batch Set could not see it. Whether a page state was recorded depended on **CDX pagination**, which
is why narrowing the rule could not have fixed it.

#### Level 1 REOPENED 2026-08-27 — the fix reproduced the bug it was fixing

**`rawText` was a filter masquerading as storage.**

The plan diagnosed Readability as discarding at write time and prescribed storing the document. The
implementation stored `normaliseText(htmlToText(html))` — HTML stripped to text — and named it the
document. **`NOT NULL` then enforced that SOMETHING was present, not that it was the document: a
constraint standing in for a guarantee, inside the level built to remove exactly that.** The fix
reproduced the bug at a lower loss rate.

**The concrete cost, not an abstract one:** `htmlToText` discards hrefs while keeping anchor text, and
this platform's central finding is that a **reporting-channel link was removed**. Two different links
with the same visible text are, to a text-only store, the same page.

*Measured, not argued:* CDX rows 6, 7 and 8 of the tracked page carry two distinct payload digests
(`J25UK…`, `L7PKZ…`, `J25UK…`) and collapse to **one** stored hash. Recovering row 8 with
`--limit 1 --apply` on 2026-08-27 returned `UNCHANGED`, wrote nothing, and never reached the anchoring
twin path. Predicted from reading `extractRawText` before the run, then confirmed by it — had all twelve
run blind, the report would have read "recovery complete, 0 created" and the corpus would have been
called repaired.

*How it was found is the method working:* a single capture, run first, against a prediction.

**The fix — option (1), storing bytes.** Not for fidelity to a written invariant but because **you can
derive text from bytes and never bytes from text**: storing the payload preserves every future
definition of "changed", and storing text commits now, irreversibly, to one. The alternatives were
rejected — accepting it would be "complete by our own definition", where the definition was chosen by
accident; keying novelty on the CDX digest would give "is this capture new?" two answers again, and
that digest is over the HTTP payload rather than anything of ours to borrow.

| stored | over | used for |
|---|---|---|
| `document` (Bytes) + `documentContentType` | the payload as fetched | integrity; where the anchor moves at Level 3 |
| `documentHash` | those bytes | the `EXISTS` comparison — bytes, because comparing text is what hid this |
| `text` + `textHash` + `textExtractionVersion` | the normalised text | **novelty and diffing**, cached per §3 with its version |

**Novelty stays on `textHash`, deliberately.** Byte-identity is too sensitive — a rotating cache-buster
or a timestamp in a comment would make every capture distinct and store hundreds of near-identical
payloads. Nothing is discarded either way, because the payload is kept whole; only whether a new ROW
appears changes. The sensitivity question is now answered explicitly rather than decided by accident
inside an extractor.

*Cost:* `rawContentHash` was never anchored — the chain holds `contentHash = sha256(fullText)` — so
re-hashing all 83 rows **moves nothing on-chain and orphans nothing**. Storage ~500KB → ~4.3MB.

**The recount target of 94 was computed under a definition the system does not use.** It was derived
from CDX digests, which are byte-level; our novelty rule is text-level. Those were never the same
measure, and the gap between them is what the single capture exposed. It is re-derived after the bytes
are stored, by re-running recovery and counting how many of the eleven are **text-distinct** — a number
nobody currently knows.

*Found while building the fix, and it is the same lesson again:* exposing the anchoring outcome made
`anchoring` a promise callers may ignore, and the first version documented *"the promise never rejects"*
while that guarantee lived in **another module**. The suite did not fail an assertion — it **crashed a
Jest worker** on an unhandled rejection, which on the scanner's path would end the process during a
routine scan. Fixed by making the guarantee local (`anchorNeverRejecting`).

*Every one of the 21 mutations proved before the reopening was re-proved, none carried:* a mutation is
evidence about an implementation, and the implementation changed. One re-run **survived** —
blanking `TEXT_EXTRACTION_VERSION` passed, because the test asserted the constant against itself. A
tautology, the same shape as the hash-shape assertions caught here before; now pinned to its literal
value.

**Next decision, already agreed and not to be designed against:** the observation / document split —
`Capture(trackedUrlId, provenance, capturedAt, waybackTimestamp, documentId)` and
`Document(hash, bytes, derived text)`. Whether bytes match should decide whether a new DOCUMENT is
stored, never whether we record that the Archive looked. Three of this level's problems have resolved to
that distinction: the `seenDigests` discards, the continuity-proof gap, and this one. **The split needs
no re-fetch once the bytes are stored.**

#### Level 1: CLOSED ON STAGING, not done

Every invariant holds on staging — 83/83 captures hold their payload, both hashes recompute with 0
mismatches, `document`/`documentHash`/`provenance`/`capturedAt` are `NOT NULL`, and "is this capture
new?" has one answer in `recordCapture`. The corpus is complete: **0 text-distinct captures missing.**

**Production lacks all three migrations and the backfill.** By the standard set when production was
last caught up, *a level enforced in one environment and absent in the other is half-applied* — so
production catch-up is the gating item, via the four-step procedure above.

*Correction to an earlier prediction in this document:* the 7 stale diffs and 18 new pair-rows never
materialised, because **no capture was inserted**. Level 5 inherits **no re-pairing debt** from Level 1.

##### A permanent gap: capture `20240829085520`

The Archive **indexes this capture but will not serve it** — `HTTP 404`, reproduced on 2026-08-27, and
the reason the original scan recorded it `FAILED`. That is a durable third-party fact, not a transient
failure, and it is recorded here so nobody keeps retrying it. The recount target is therefore **83, not
94 and not 95**.

*Level 2 item:* this state currently lives inside a JSON blob on the scan job record. A capture the
Archive indexes but will not serve should be **first-class queryable state** — §3's own rule, that a
check which runs and is not recorded has not been performed.

#### Level 4 opening measurement — href changes, run 2026-08-27

`forensics:measure-href-changes` over all 82 consecutive pairs. Local, deterministic, no Archive, no
model. **The result is non-zero, so link-aware extraction stays a live line of work.**

```
83 captures, 82 consecutive pairs.
Pairs whose href set changed: 17
Of those, INVISIBLE to the derived text: 2
```

| invisible pair | change |
|---|---|
| 2022-07-03 → 2022-07-08 | `+ /daily-guidances/` |
| 2024-01-17 → 2024-03-05 | `+ /confirmed-cases-and-patients/risk-groups/` |

*The eleven-pair sample said zero; the full run disagreed.* The sample was too small to settle it.

**Read the result as TWO findings, not one — and the corroboration is the larger half.**

##### (1) The temporal argument is STRENGTHENED by an independent derivation

The href layer reproduces the two-stage movement on its own: 2022-08-05 removes
`/vaccine-for-covid/4th-dose/` and the four health-fund vaccination links and adds ~14 scientific
citations; **2022-09-06 reverses it exactly.**

**The href layer and the text layer share no inputs.** Two independent derivations agreeing on the same
two-stage movement is a materially stronger evidentiary position than one — this is a *strengthening of
the central claim*, not a footnote to the problem below it. Recorded first deliberately: destabilising
findings are more interesting to write down, and this is the half that would otherwise be forgotten.

##### (2) A separate claim is left IMPRECISE

```
captures whose HREFS contain https://t.me/MOHreport : 83  (2021-12-23 .. 2026-03-05)
captures whose derived TEXT contains "MOHreport"    : 0
```

Something the platform could never see was present throughout. What it IS, though, is not established
— and the honest record is **three** statements, not two:

| statement | status |
|---|---|
| the page's own adverse-event reporting link was removed for six weeks | **supported** — trajectory data on `לדיווח על תופעות לוואי >`, unaffected by any of this |
| a Telegram social icon linking to `t.me/MOHreport` was present throughout | **supported** — measured |
| that icon constituted a **reporting channel** | **undetermined** — not established by anything in the vault, and not establishable from the archive |

*Why the third row is undetermined rather than supported.* An earlier draft of this section asserted
that "a Ministry route did remain reachable from the page throughout". **That was an inference from a
URL slug.** `t.me/MOHreport` reads equally well as *"MOH reports"* — a broadcast channel the ministry
publishes to — as it does *"report to MOH"*. Reading a capability out of a handle name is the same move
as reading page content out of a classifier summary: an assertion derived from a LABEL rather than from
evidence, which is the error class this level exists to remove. **A concession written into a plan
becomes a fact someone cites later**, and this one would have been a fact about a Telegram handle
nobody has looked at.

Everything actually measured about it says chrome: anchor text **empty**, `title="טלגרם"`, an icon in
the site-wide social bar between Facebook and the rest, one label-state across all 83 captures.

```html
<li class="social-item">
  <a href="https://t.me/MOHreport" target="_blank" title="טלגרם" class="social-link">
    <img src="/media/oc1ftq3z/fill-2-3x.svg" ... />
```

*Caveat, which does not shrink:* the pattern matched one reporting-shaped link. A reporting route behind
an opaque URL would not match, so this is not proof that nothing else survived.

**What to flag, and how.** Evidence summary `0x66acc98f…` asserts *"במקביל להשמטת ערוצי דיווח על תופעות
לוואי"* — plural channels. That is `CONFIRMED`, anchored, and cited by staging's published thesis. Flag
it as **IMPRECISE**: the supported claim is about *the page's own reporting link*, singular, and
"removed from where a reader would look for it". Do **not** flag it as contradicted by a surviving
channel — nothing establishes that a channel survived.

That is a **third** item on that document, alongside the FDA line and `קלים וחולפים בלבד`. **It is a
Level 9 decision and belongs to whoever owns the claim**, with this measurement in hand. The same
sentence is in the production thesis draft, which is unwritten — the only reason this is not worse.

**All three were found by instruments built AFTER the thesis was published.** That is the argument for
the instruments, and the argument for not publishing the production thesis until they exist there too.

#### Level-agnostic: `noUncheckedIndexedAccess` is off, and the linter argues from it

`extractHrefs` reads regex capture groups. Written as `m[2] ?? m[3] ?? m[4]`, the linter called the
fallbacks redundant — because with `noUncheckedIndexedAccess` off TypeScript types **every** capture
group as `string`, while an unmatched group is `undefined` at runtime. **Deleting the `??` to satisfy
the linter would have made `href='...'` extract as the empty string.**

A linter arguing from types that do not describe reality gives confidently wrong advice. This is a
project-wide configuration issue rather than a local one: **every regex-group and array-index read in
this codebase carries the same false guarantee.** Not owned by any level; recorded so it is decided
deliberately rather than discovered again.

#### Storage gain, not yet a detection gain — measured 2026-08-27

The payloads are stored: **83 of 83 captures**, 4157 kB, every `documentHash` recomputing from its
stored bytes and every `textHash` from its stored text, one `Content-Type` throughout
(`text/html; charset=utf-8`), 0 unanchored. **82 `href` attributes are now held on the first capture
alone, where zero survived the old text-only column.** That is the vindication of reopening the level.

**But nothing can read them yet, and the distinction must not be blurred.** `htmlToText` strips every
tag with `.replace(/<[^>]*>/g, '')`, so `text` still holds anchor text and no targets — and diffs,
trajectories, the classifier and the verification tools all read `text`, not `document`. The honest
sentence is:

> **The payload now holds link targets; no analysis layer can see them yet.**

*What that says about findings already drawn.* Every diff, trajectory and evidence record in this corpus
was computed over text with **no link targets at all**, so the platform's central finding — that the
adverse-event **reporting channel** was removed — rests entirely on **anchor text**. Two blind spots
follow, and neither has ever been looked for:

- **A link whose TARGET changed while its text stayed identical is invisible.** The reporting channel
  could have been *redirected* rather than removed, and nothing would have been recorded.
- **A link whose TEXT changed while its target stayed is recorded as a removal PLUS an addition** — one
  edit reported as two.

*The measurement, and where it belongs.* `forensics:measure-href-changes` extracts `href` sets per
capture and diffs consecutive sets — purely local, no Archive, no model, no cost. A non-zero answer is a
class of change this platform has never been able to see, on the page its whole argument is about; zero
is worth knowing too. **It is Level 4 reconnaissance** — what the view keeps — so it is written now and
run only after Level 1 closes. Acting on it is a `textExtractionVersion` bump, which is exactly what
that axis was built for.

#### Charset: a green result from a mechanism that does not check

All 83 captures declare `charset=utf-8`, and the recomputed text matched the stored text on every row.
That is a pass, but not for the reason it appears to be: the stored text came from axios
`responseType: 'text'`, which **defaults to UTF-8 in Node and ignores the charset a response declares**.
It agreed with the truth here only because the truth was UTF-8. A `windows-1255` capture — plausible on
a Hebrew government page — would have been silently mangled into mojibake that passes every structural
test. `decodeDocument` now reads the declared charset, and `documentContentType` is stored so the bytes
can be re-decoded forever.

**A green result from a mechanism that does not check is not the same as a mechanism that checks.**

#### Catching production up — the standard procedure, not a discovery

Production drifts further behind at each level, and the catch-up is now a known four-step dance rather
than something to work out again. Written down because discovering it a second time would be the exact
pattern this level is about:

1. **Ship.** The `NOT NULL` migration fails on data it cannot derive, and the deploy aborts with the
   previous version still serving. **That is the ordering guarantee working, not a broken deploy.**
2. **Backfill against production**, locally — authorised by `CLAUDE.md` because it is not a chain write.
   Confirm the environment BY DATA first (`get_environment`, or production's `trackedUrl` `0e755b7d-…`)
   and capture a before-state.
3. **`prisma migrate resolve --rolled-back`** the failed migration, so the ledger reflects what happened.
4. **Re-deploy.** The migration now applies.

As of this level production lacks **the provenance/`capturedAt` migration, the payload columns, and the
payload backfill** — and that backfill is now ~83 Archive fetches and ~4 MB rather than a text-only
pass. (*Corrected 2026-08-27: production is FURTHER ALONG than this document previously said. Its
latest applied migration is `20260827120000_snapshot_document_required`, not `20260826140000`, and its
`rawText` is fully backfilled — the four-step dance below has already been run once, and the ledger
still carries the `ROLLED_BACK` row that proves it.*)

##### THE LIMIT OF THIS PROCEDURE — read before using it a third time

**`migrate deploy` commits each migration in its own transaction.** When the third fails, the first two
have already committed, and the deploy aborts with the OLD CODE serving against the NEW SCHEMA.

> **The abort-and-recover pattern is safe only when every migration that commits before the failing one
> is backward-compatible with the currently-running code. A rename is not. A `NOT NULL` without a
> default is not.**

The first run of this procedure was safe because its committed migration only added *nullable* columns,
which old code ignores. **The second run is not**, and the difference is worth being exact about:

| commits before the failure | effect on the running build |
|---|---|
| `rawText` → `text` rename | the old Prisma client selects `rawText`; every read of it fails |
| `provenance` / `capturedAt` `NOT NULL`, **no DEFAULT** | the old `urlSnapshot.create` omits them; every write fails |

So the window is **read-AND-write degraded**: touch nothing until the redeploy. The absent DEFAULT is
deliberate — a default "would silently accept a row whose provenance nobody established" — which is
correct for the schema and is exactly what makes the window worse.

**Why the second run was shipped anyway, which is NOT a general licence:** production has **no
audience** yet. The window costs nothing external, and restructuring into expand-contract would mean
three migrations plus a later drop, buying safety that does not apply — while the rename is *wanted*,
since `text` is the honest name for a derivation and carrying `rawText` beside it would keep the
dishonest one in the schema longer.

Recorded because otherwise the next person reads "we did this twice and it was fine" and infers a rule
from two cases that were safe for **two different reasons** — something that worked for a reason nobody
wrote down, which is the exact failure this level exists to remove.

*Standard for every constraint-adding migration:* **verify the constraint is satisfiable against the
target environment's real data BEFORE shipping it.** Production pre-flight for `20260827160000`: 83
captures, 0 malformed timestamps, 0 null `rawText`, 83 distinct `(trackedUrlId, capturedAt)` pairs. That
check is what stops an unpredicted failure landing inside a sequence that already contains a predicted
one.

#### Level 1 is not closed until the capture layer is complete

##### WITHDRAWN: "~13% incomplete, precisely on the pattern trajectories exist to detect"

**That claim was wrong, and it was repeated into three reviews and two handoff prompts before it was
measured.** It was derived from CDX digests, which are **byte-level**, and asserted about a corpus whose
novelty rule is **text-level** — the identical mistake as the 94 recount target, one layer up: a number
taken from one measure and stated about another. The error is sharper than the target's, because the
target's version had already been diagnosed and the diagnosis was not applied to the claim the target
was serving.

*Measured 2026-08-27, by re-running recovery after the payloads were stored:*

| the eleven "missing reverts", against their immediate predecessor | count |
|---|---|
| payload-distinct | **8 of 11** |
| **text-distinct** | **0** |
| href-distinct | **0** |

**There was never a content gap.** The eleven were byte-level noise — cache-busters and timestamps —
reverting. Eight genuinely differ in bytes and were correctly dropped by the text-level novelty rule,
which is the sensitivity trade-off behaving as specified rather than by luck. Three differ by neither
our decoding nor our hashing, which says something about CDX digests worth remembering: they
distinguish things our fetch path cannot see at all.

So no trajectory was understated, and Level 10's comparison baseline was never incomplete. **The corpus
was already complete at the level the system actually uses.** Reporting the `0` alone would have been
misleading in the opposite direction; the table is what makes it interpretable.

**Recount target: 94, not 95.** CDX holds 95 rows; the 95th is capture `20240829085520`, recorded
`FAILED` in the scan job's `snapshotsList` JSON and existing nowhere else. That gap is honest but
invisible — `get_environment` reports 83 snapshots with no indication that 84 were attempted, which is
§3's "a check that runs and is not recorded has not been performed".

##### Where the boundary falls, and why it moved

Recovering the captures makes 7 existing diffs stale — they claim a direct transition between captures
that are no longer consecutive. Repairing that is **Level 5** work, so requiring it to close Level 1
would invert the level ordering this whole method depends on. The boundary moves instead:

> **Level 1 is done when the CAPTURE layer is complete.** The diff layer is then knowingly stale, and
> that staleness is recorded here rather than silently carried. **Re-pairing is Level 5's opening act.**

Derivation of the damage, so it can be checked rather than believed:

| | |
|---|---|
| captures now / consecutive pairs | 83 / **82** |
| captures after recovery / pairs | 94 / **93** |
| existing pairs destroyed (a recovered capture falls inside them) | **7** |
| surviving existing pairs | 82 − 7 = **75** |
| **new pair-rows Level 5 must create** | 93 − 75 = **18** |

Three reasons for deferring, the first being money:

1. **The classifications would be paid for twice.** Level 5's invariant is that every reported change
   survives the raw documents, checked at write. Diffs created now, under the current unverified
   classifier, get re-verified when Level 5 lands. Create them once, verified.
2. **A `SUPERSEDED` marker and Level 5's `CONTRADICTED` verdict are the same mechanism** — both say
   "this row is no longer operative, and here is why". Building a bespoke marker now and a verdict
   system later is two records of one idea, which is what this plan rejected when it declined a
   tombstone table. **So no schema marker is added.** The 7 stale diffs are left unmarked for the
   interval, which is acceptable *only because it is written down here* — that is the whole difference
   between a known gap and a silent one.
3. Only instrument 1 needs reviewing before it touches the corpus, which is a much smaller thing to get
   right.

##### Why leaving them stale is safe — checked, not assumed

**None of the 7 straddled diffs is legally significant, and none backs an evidence record.** Verified
against staging on 2026-08-27, pair by pair. No anchored hash and no `fileHash` is touched, so this is a
routine repair rather than a Level 7 evidence-integrity event. Had even one been significant, the
boundary could not have moved and this would have been Level 7 work — the check is what made this a
decision rather than a chore.

##### Two blockers found while planning the rescan — findings, not obstacles

- **A scan that fetches nothing reports success.** `runFullScan` asks `computeNextFromDate` whether
  more batches exist, and that returns `null` when the last batch held fewer than `MAX_SNAPSHOTS` rows.
  Staging's `COMPLETED` job (`totalSnapshots: 41`) therefore short-circuits to `COMPLETED` without one
  request to the Archive. Same family as the silent truncations. **Level 2 item.**
- **`UrlVersionDiff` has no unique constraint on the snapshot pair it spans**, and diffs are written
  with `create` across six call sites — so a from-scratch rescan would duplicate every existing diff.
  **Make "a diff is uniquely identified by the pair it spans" a Level 5 invariant.** With the
  constraint the hazard is removed rather than avoided: a rescan then *cannot* duplicate diffs.

##### Instrument 1 — `forensics:recover-captures`

Because of those two blockers the ordinary scan cannot do this job. `forensics:recover-captures` fetches
the full CDX index with no pagination and no client-side dedup, and records anything missing through
`recordCapture`. **Capture layer only: no diffs, no classification, no LLM call.** Dry run is the
default. Maintenance, so it runs in the deploy container (`railway ssh`) — never a laptop, never MCP —
which also keeps its chain writes on the correct registry.

Every recovered capture is byte-identical to one already stored (that is what made it a revert), so each
should reach `anchorOneSnapshot`'s **twin path** and copy an existing transaction rather than register a
duplicate. That branch is the reason production holds 71 rows with a null `onChainTxHash`, and this is
its first exercise against real data — so the tool reports the anchoring branch **per capture**, never
as an aggregate "anchored".

*Found while building it, and it belongs to this level's own lesson:* exposing the anchoring outcome
turned `anchoring` into a promise callers may ignore, and the first version documented *"the promise
never rejects"* while that guarantee was actually enforced in **another module**. The suite did not
report a failed assertion — it **crashed a Jest worker** on an unhandled rejection, which on the
scanner's path would end the process during a routine scan. A guarantee asserted in a comment and
enforced somewhere else is the same defect class this level exists to remove, found inside the
instrument built to remove it. Fixed by making the guarantee local (`anchorNeverRejecting`), proven by
mutation.

##### Open question — the platform cannot prove a page was UNCHANGED over an interval

Not a defect; it follows from two deliberate rulings that are individually correct and jointly
subtractive:

- **CDX `collapse=digest` discards unchanged observations on the way in.** Consecutive-collapse removes
  exactly the captures that prove continuity — "at T2 the page still said A".
- **`recordCapture`'s novelty rule discards them at the door.** An unchanged re-fetch is dropped, as
  settled in §2.

Together they remove a *category of provable claim*. The strongest statement the corpus can support is
**"we hold no capture in between"** — the weaker claim `list_captures` already warns about — never "the
page did not change in between", which is what a reader will hear.

*(Correcting the reason given for keeping `collapse=digest` in `recoverMissingCaptures`: it was
justified as "the one form of de-duplication that discards no observation", which is false. The
behaviour is still right — the eleven are non-consecutive reverts, and any unchanged observation that
survived collapse would be dropped by the novelty rule anyway — so the reason changed, not the code.)*

Revisiting it depends on a schema decision that comes after this rescan, so it is filed here rather
than acted on.

### Level 2 — the source

*Invariant:* the bytes stored are the bytes the source served, and a later change on the source's side
is detectable.

*Enforcement:* persist the CDX `digest` — already fetched by `WaybackScraper`, used only to
de-duplicate, and thrown away — and compare it against what was fetched. Also fix `archiveHttp`'s error
message, which reports `HTTP 200` when axios throws for a non-status reason: a success code presented
as a failure.

#### Archiving, and reconciling our own fetch against it

Save Page Now is not a twin bolted onto a direct capture — it is **step 2 of the submission pipeline**
(§2). Ask CDX what the Archive already holds; if nothing, ask SPN to create a capture; create evidence
from the archived capture when it is available. Submission is **queued, never blocking**: SPN answers
quickly but CDX indexing lags, sometimes far beyond a request's lifetime.

Our own fetch is kept as the pending precursor and **reconciled** when the archived capture lands. We
fetched at `T`; the Archive captured at `T+δ`, and the page can change in between — so this is not
proof of our bytes, it is a second observation whose value is precisely that it can disagree:

| outcome | meaning |
|---|---|
| byte-identical | corroboration — an independent party observed the same document |
| **different** | a real change inside the gap, **or** a fault in our fetch. Either is a finding. |
| unavailable | SPN is rate-limited, and some pages cannot be archived at all. **Not a pass** — `UNAVAILABLE` per §3. |

Treating the archived capture as proof of the direct one would repeat the error this plan exists to
undo: agreement between two readings of one artifact is not corroboration, and here they are not even
readings of the same moment.

*Also at this level, added 2026-08-27:* **a scan that fetches nothing reports success.**
`computeNextFromDate` returns `null` when the final batch held fewer than `MAX_SNAPSHOTS` rows, so
`runFullScan` marks the URL `COMPLETED` without one request to the Archive. Staging sat in exactly that
state (`totalSnapshots: 41`), which is why Level 1's recovery needed its own instrument. Silence is
indistinguishable from "nothing new" — the same family as the silent truncations.

*Also at this level:* **`list_captures` must partition by provenance.** Only archived captures may be
cross-checked against the CDX index — listing a direct capture there would report it as a gap in the
Archive, which is a fabricated finding produced by the tool built to detect fabricated findings.

### Level 3 — the anchor

*Invariant:* the on-chain record attests to the document, and the database's claim about it is checked
rather than asserted.

*Enforcement:* anchor `documentHash`; run `check_on_chain_status` automatically on the write path and
record the verdict. Never a rule a human must remember.

### Level 4 — the view

*Invariant:* no block unique to a capture is ever classified chrome; the view is versioned and marks
rather than deletes.

*Enforcement:* corpus-derived classification along the time and/or space axis, storing
`boilerplateVersion`, `sourceStateHash` and **the observation count behind each judgement**.

*Known hard case, not solved:* **changing chrome** — `createEvidenceFromUrl.ts` records a live visitor
counter on this same domain that differs every fetch, so frequency reads it as content. Marking rather
than deleting is what keeps this affordable.

### Level 5 — the diff

*Invariant:* a change the platform reports survives the documents. A chunk said to be REMOVED is absent
from the after document; a chunk said to be ADDED was absent from the before one.

*Enforcement:* the check runs at write and stores a verdict. **A `CONTRADICTED` diff is written, not
refused** — refusing it would delete the evidence that the pipeline is wrong, which is how this was
found. It is simply never promotable.

*Also at this level, added 2026-08-27:*

- **A diff is uniquely identified by the pair it spans.** `UrlVersionDiff` has no unique constraint on
  `(beforeSnapshotId, afterSnapshotId)` and diffs are written with `create` across six call sites, so a
  from-scratch rescan duplicates every existing diff. The constraint removes the hazard rather than
  avoiding it.
- **Level 5 opens by re-pairing the diff layer** after Level 1's capture recovery: **7** existing diffs
  are stale (they span captures no longer consecutive) and **18** new pair-rows are needed. Deferred
  here deliberately so the classifications are paid for once, verified — see Level 1's boundary note.
  The 7 are safe to leave unmarked because none is legally significant and none backs an evidence
  record; `CONTRADICTED` is the mechanism that supersedes them, so no bespoke marker is added.

*Note:* `measureExtractionDivergence` already implements this check as a measurement; Level 5 is the
same logic moved to write time. **Granularity is not a detail** — whole-chunk matching found 2 of 81
and missed the case this work exists for; sentence granularity found 7.

### Level 6 — the trajectory

*Invariant:* every reported flip is confirmed against the documents at that boundary.

*Enforcement:* verified at computation, verdict stored with `DETECTION_VERSION` and `sourceStateHash`.

*Carried forward:* `MIN_CLAIM_LENGTH = 40` still filters trajectory candidates — the same
length-as-significance assumption that had to be removed from the diff classifier, surviving in a
second subsystem. A short claim can be the load-bearing one; "אין סיכוי לחלות בקורונה בגלל החיסון" is
not long. Changing it bumps `DETECTION_VERSION` and recomputes every trajectory, so it belongs in this
level rather than after it.

### Level 7 — the evidence

*Invariant:* identity is recomputable from its captures, and a summary attributes nothing to a page
that the page does not contain.

*Enforcement:* recomputability asserted at write and audited standing — **5 of 7 anchored records were
unrecomputable on 2026-08-23**. Summary phrases checked against the capture they describe.

*Hard case, needs design before code:* the fabrication `לתסמינים קלים וחולפים בלבד` carries **no
quotation marks**, so quoted-span checking misses it entirely. Content n-gram checking needs an
explicit false-positive policy — a summary legitimately characterises as well as describes, and only
the second is checkable. A gate that cries wolf gets disabled.

### Level 8 — the opinions

*Invariant:* nothing presents a model's judgement as a computed fact.

*Enforcement:* `isLegallySignificant`, `evidenceTier`, categories and key figures **cannot be
verified** — no archive lookup settles an opinion. Their controls are complete provenance, honest
variance (`classifierDraws` is null on older rows, meaning a single draw was stored as though it were a
measurement, and null must render as that sentence), and rendering separation. The tutorial's own
`COMMON_RULES` already forbids mixing the two registers in one table; `get_forensic_timeline` already
breaks it. `evidenceTier` matters most — publication check 6 gates on it, and the check reports itself
as NON-BINDING because every confirmed record currently sits at or above Tier 2.

*Also at this level:* `get_forensic_timeline` returns **no evidence linkage at all**. Its query is a
flat `select` of nine `UrlVersionDiff` columns and never traverses `Evidence.urlVersionDiffId`, which
is a `@unique` FK — so the tool reports that a legally significant change occurred while staying silent
on whether it is backed by anchored evidence. A researcher cannot distinguish *"we detected this"* from
*"we can prove this"* without a second tool and a manual join on dates. One `include` and two fields
per row.

### Level 9 — the thesis

*Invariant:* a thesis cites nothing that is not `VERIFIED`.

*Enforcement:* the publication gate consumes the verdicts instead of `audit_thesis_claims` merely
reporting. Known blind spot carried forward: Hebrew number-words, which the auditor already declares it
cannot check.

*Three defects in the surrounding pipeline belong to this level, all recorded in
`docs/gf-framing-assessor-defects.md`:*

- **`researcherClaim` is a free-text paraphrase slot** with no verbatim constraint and no validation.
  Across four framing runs — two environments, two corpora, five days apart — the assessor produced the
  same three errors every time: dropped a trailing conjunct, inserted a causal phrase the researcher
  never wrote, and asserted page wording that `verify_claim_text` shows is absent. Reproducibility is
  the signature of a systematic prior, not of sampling noise. Fix: require it to be a whitespace-
  collapsed substring of `proposedFraming`. The open decision is what happens when the model will not
  comply — dropping the contradiction suppresses possibly-real ones, retrying burns calls, flagging
  `claimQuoteVerified: false` suppresses nothing. Queued as task `task_3e0501b3`.
- **`whatEvidenceShows` is equally unconstrained and nothing checks it against the archive.** The
  researcher's thesis prose is audited mechanically; the critic's assertions never are. The one
  participant whose claims go unverified is the one the researcher is told to defer to.
- **`FIGURES_HEDGED` passes silently on a name the system has never recorded.** The check states this
  itself. On production, `פרופ' מתי ברקוביץ'` is not a registered key figure, so a sentence naming him
  would pass **unchecked rather than verified** — a silent pass wearing the face of a real one, which
  is the same failure shape as `UNAVAILABLE` counting as `VERIFIED`.

*And one gap in the session record itself:* **`add_session_note` requires a `thesisId`**, so a framing
session with no thesis attached has no way to record a correction — during exactly the phase where
corrections are discovered. A seven-versus-five error found mid-framing on 2026-08-27 could not be
written to the session it belonged to.

### Level 10 — supersede the old corpus

*Invariant:* every anchored hash stays explainable forever.

*Enforcement:* the old rows are marked `SUPERSEDED` and excluded from every read, query and thesis
path. **Nothing is deleted — not evidence, not theses, not snapshots, not diffs, at any point in the
rebuild.**

The existing data is kept throughout as the **comparison**: rebuilding from the archive and diffing the
result against what is stored is what turns "7 of 81" into a complete account of what the old pipeline
got wrong. That role is now **permanent rather than temporary**, which is the better outcome — the
measurement stays reproducible forever instead of disappearing with the data.

#### Why deleting is wrong

Removing an evidence row does not invalidate its on-chain anchor. It removes our ability to *explain*
that anchor, and **an unexplained anchor is indistinguishable from a tampered one.**

The schema already says this. `Evidence.previousFileHash` exists to record a deliberately created
orphan, so that a future audit finds it explained rather than — in the comment's own words — reasonably
concluding "the vault had been tampered with". Level 10 as originally written would have manufactured
exactly that condition **at scale, deliberately, for ~90 permanent public transactions.**

**This level forbids DELETION, not supersession.** Identity is free to move — see §2, "Identity may
change. It may not change unrecorded." An orphan *with* a record is the supported case and has been
exercised once already; an orphan with none is what is forbidden. No design decision elsewhere in this
plan should be constrained by a wish to avoid orphaning an anchor.

**No new tombstone table.** `previousFileHash` and the `ORPHANED_ANCHOR` verdict
(`checkOnChainStatus.ts`) already provide the mechanism, and the superseded rows are what explain their
own anchors. A tombstone would be a second record of something the retained row already states.

#### One registry, forever, append-only

**No replacement `EvidenceRegistry` is deployed.** Considered and rejected, for six reasons:

1. It rotates `EVIDENCE_REGISTRY_ADDRESS`, the most dangerous variable in the system. A transaction to
   a codeless address **succeeds** and produces false `CONFIRMED` evidence; `Web3Service`'s
   `assertRegistryDeployed` exists solely because a wrong value was once found one command from use.
2. Multi-registry lookup adds a failure mode that does not exist today: an old hash queried against the
   new registry returns "not registered", which reads as **"never anchored"** — strictly worse than an
   orphan, because it is a confident wrong answer rather than a flagged one.
3. It taxes independent verification. One address, one query, runnable by a stranger, **is** the
   product.
4. The old snapshot anchors are **not wrong**. They attest that a text really was in our store on that
   date — only narrower than the platform claimed. Narrower is not false.
5. `contracts/src/EvidenceRegistry.sol` is **shared source** with Bronze Fortress. The variables are
   namespaced (`EVIDENCE_REGISTRY_ADDRESS` vs `BF_EVIDENCE_REGISTRY_ADDRESS`), which mitigates the
   blast radius but does not remove it: shared source makes a redeployment feel routine across both
   apps, and it is expensive to get wrong in either.
6. **An append-only log containing its own corrections is more credible than a clean one.** A registry
   wiped at the moment its operator discovered problems is precisely what a tampering auditor looks
   for. Chain of custody is not a feature here — it is the product.

**The same choice applies on staging**, even though Sepolia history is disposable. Divergent
architecture would stop staging being a faithful rehearsal of production, which is the only reason
staging earns its cost.

#### No cleanup session is required

The dedicated-session requirement is dropped from this level — **not because the rule weakens, but
because no destructive operation remains to trigger it.** `CLAUDE.md` §"Deleting data requires its own
session" stays in force, and any future proposal to actually delete any of this must satisfy it in
full.

---

## 5. What is already done

| | |
|---|---|
| Level 0 | complete — 16 tests, mutation-verified |
| `get_environment` | shipped to production `930be6c`; identity by configuration and chain, never by content |
| documents stored | `rawText`/`rawContentHash` columns, one fetch, both readings; **staging backfilled 83/83** |
| the measurement | `forensics:measure-divergence` — **7 of 81 contradicted**, 0 uncheckable, lowest retention 60% |

## 6. Open questions

- **Production.** This plan rebuilds staging. Production holds the same 8 records and 83 captures and
  is the environment the public reads.
  **Sequencing settled 2026-08-27: staging is finished first, and no production data is migrated until
  it is.** Whether production then receives the same rebuild is still open.
  *Measured that day, and worse than the handoff assumed:* production does not merely lack the
  backfill, it **lacks the columns** — `rawText`/`rawContentHash` are absent, because migration
  `20260827050000_snapshot_raw_text` sits in the 13 commits `master` is behind. Production's latest
  applied migration is `20260826140000_classifier_draws`. So the order is forced and cannot be
  compressed: ship migration A → backfill production's 83 captures → only then can `SET NOT NULL`
  apply there. Attempting it in one ship aborts the production deploy, which is the pre-deploy
  guarantee working as designed, not a hazard.
- **Staging's published thesis** is still published and still contains the false claim.
- **Correcting evidence summary `0x7517947a…`**, which describes its source falsely
  (`קלים וחולפים בלבד`, none of which is on the page). **Superseding does not resolve this and never
  did** — a superseded row is retained and explainable, not corrected, and **production holds the same
  record** regardless. This item stays open on its own merits. The
  mechanism exists (`forensics:resummarize` → `SummaryCorrection`, safe because evidence identity is
  snapshot-derived so a rewritten summary does not orphan the anchor), but re-running the same model
  over the same extracted items guarantees nothing: the prior that produced the phrase is still there.
  Needs a before/after design asserting the rewritten summary contains no phrase absent from the
  capture it describes.
- **The production thesis walk** is held at `create_thesis_draft`, framing session
  `cmta7d2zs0001fd7pxtbezflk` ACTIVE with `rounds: 2`, `contradictions: []`.
- `IntegrityCheck` as one table or per-subject columns (§3).
- Level 7's false-positive policy.
