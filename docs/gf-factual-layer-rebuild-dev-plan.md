# Rebuild the factual layer, one level at a time

**Written 2026-08-26, restructured 2026-08-27** after the production thesis walk stopped at its
drafting step and a day of measurement established that the layer beneath it cannot be patched into
correctness.

**Implementation started 2026-08-27.** Two decisions taken that session, both recorded below:
**Level 10 supersedes rather than deletes, and there is only ever one registry** (§4 Level 10);
**staging is finished before any production data is migrated** (§6).

**Every level carries a `STATUS:` line directly under its heading.** It exists so that "what is the
state of Level N?" is one `grep -n '^\*\*STATUS:' ` against THIS file rather than a recollection or an
index entry. It is a POINTER, never a replacement: why a level is deferred, or what "partial" covers,
lives in that level's own prose below it and nowhere else.

Added 2026-08-29 after three recommendations in a single session were made from a summary of this
document rather than from the document — twice proposing work it had already ruled out. A memory index
is loaded automatically and this plan is not, so any decision copied out of here is what gets acted on,
and the copy drifts. The status line makes reading the source cheaper than trusting a copy.

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

**For anything a reader sees, these are not three peer categories.** `DIRECT`'s own enum comment calls
it transient — *"we fetched it and the Archive has not (yet) indexed it."* What an outsider needs is
**re-checkability as a state**: archived and independently checkable · pending archival · never
observable by anyone but us. Rendering `DIRECT` beside `WAYBACK` as an equal kind would tell a reader
the opposite of what it means.

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

### The ledger is transported BY HAND. Removing that is the next infrastructure change — DECIDED 2026-08-30

`emitLedgerRecord` (`src/lib/operationalContext.ts`) **prints** a record from inside the container; a
person then copies it into `docs/integrity/ledger.json` and commits it. Its own comment already names
the hazard: a hand-written commit *"makes the board silently wrong in the reassuring direction — it
reports CURRENT for a proof that no longer covers the code."* The published board is additionally a
**build artifact under version control**, so it can drift from its sources; `integrity:check` exists
only to detect that drift, and a pre-commit hook or a CI gate would only guard it.

**Decision: the run writes its own record, and the board becomes a live view served by the platform.**
Not a check that detects drift — the removal of the second copy.

- `runOperationalScript` writes an `IntegrityRun` row instead of printing for transcription. One
  change at the entry point every operational script already routes through — and therefore **tested
  at the hardest caller, never at the one that motivated it.**
- `GET /api/integrity` returns, per level: the plan's claimed `STATUS:`, the stored computed proof,
  the commit and deployment that produced it, and staleness computed from `dependsOn` against the
  current commit. The container has `docs/` — nixpacks builds from the repo root — so the deployment
  can read the plan itself. **It READS stored results and does not recompute inline**; recomputing 83
  snapshots and chain reads per request is a self-inflicted denial of service.
- A page on the site renders it. `tools/integrity-board/`, `docs/integrity/` and `integrity:check`
  are then deleted.
- **CI has no role.** The deployment knows its commit, holds the plan and owns the runs. A second
  computer that knows strictly less is how the hand-transport arose.

**What must survive the move, or the board becomes a self-graded exam:** colour is the plan's CLAIM
and bar length is COMPUTED proof, never merged · whether a non-zero exit is a failure stays a property
of the CHECK, declared once, never re-decided per run · `VACUOUS` scores **below** "never run" · every
field is observed from the container, none typed by a person.

**MEASURED 2026-08-30, and it makes the decision necessary rather than merely nicer:
`integrity:check` CANNOT PASS ON ANY COMMIT.** The board embeds `git rev-parse --short HEAD` at build
time and `--check` compares the whole file, so the commit that lands a freshly built board changes the
HEAD it was stamped with. Verified directly: after committing a board whose substantive staleness was
fully resolved, `--check` still exited 1 with the stamp as the only difference. A pre-commit hook would
stage a board carrying the parent's sha and fail the same way; a CI gate would fail on every pull
request; branch protection would have left `staging` permanently unmergeable. This is the
assertions-that-cannot-fail family inverted — an assertion that cannot succeed — and Level 7 already
states the consequence: *a gate that cries wolf gets disabled*. The committed board is therefore
**permanently stale by construction**, that item is closed as not-actionable rather than open, and no
guard is to be built on `--check`.

**Sequenced AFTER the breadth-first pass**, because several checks it must display do not exist yet —
building it first would be choosing what to display before knowing what there is. Whether the
dashboard is public or researcher-only is a publication decision, not an engineering one, and is the
researcher's. What produced this decision: `docs/gf-published-thesis-fda-claim-2026-08-30.md`.

---

## 4. The levels

**A level is not finished until code makes its invariant unbreakable. No level begins until the one
below it can no longer produce bad data.** That ordering is the entire method: it is what separates
this from the three previous encounters with the same defect.

**A level is done when its invariant is enforced in code, in both environments, AND anything an
outsider needs in order to check it — or to avoid being misled by it — is visible.**

The test for what must surface is not "is it new". Most new columns are internal provenance and showing
them would be noise. It is: *does an outsider need this to check us, or to avoid being misled?* By that
test the CDX verification verdict and a capture's re-checkability must surface; `textExtractionVersion`
and `documentContentEncoding` need not.

**Two things the interface already shows are known to be unreliable, and correcting those precedes
disclosing anything new.** Evidence summary `0x7517947a…` still tells a reader the page said
`קלים וחולפים בלבד`, which is on no reading of that capture. And `get_forensic_timeline` renders a
model's opinion and an anchored record in one table — which the tutorial's own `COMMON_RULES` forbids —
while showing only the opinion half. **A reader misled by what is displayed is worse off than one who
cannot see a new verdict.**

**Level 1 carries a disclosure debt**, recorded rather than acted on: it closed against an external
criterion and nothing in the interface says so. Level 1 is not reopened for it — the verification is
reproducible by anyone holding the tool and the public archive, so the capability is external even
where the display is not. Named here rather than left to be noticed.

**An enforcement is not proven until it has been observed to FAIL.** Level 0 was validated by breaking
the extractor deliberately — returning `""` fails 18 tests, returning the extraction instead of the
document fails 11. A guard watched only in its green state has not been demonstrated to guard anything,
and this repository already records that lesson twice. Every level's enforcement gets the same
treatment before it counts as done.

Each level below names its **invariant** (what must always be true) and its **enforcement** (the code
that makes violating it impossible or impossible-to-miss).

### Level 0 — the instrument · **DONE**

**STATUS: DONE**

*Invariant:* the extractor's behaviour is pinned to real captures, so a regression cannot silently make
every verification agree with whatever it checks.

*Enforcement:* `test/extraction/extractorPinnedToRealCaptures.test.ts` — three frozen `id_` captures,
16 tests, mutation-verified (returning `""` fails 18; returning the extraction instead of the document
fails 11).

### Level 1 — the capture

**STATUS: DONE — closed against the Archive's own digest, both environments**

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

#### LEVEL 1 REOPENED A SECOND TIME — and the "done" declaration is WITHDRAWN

**Withdrawn, not amended.** Level 1 was declared done in both environments on 2026-08-27. It was not,
and both environments were backfilled by the identical defective code.

**The defect: axios decompresses transparently in Node.** A gzipped archived record arrived INFLATED
and was stored as `document` — the payload as served. `responseType: 'arraybuffer'` settles the
*decode* and says nothing about the *inflate*, which is exactly why it looked sufficient.

*How it was found, and why nothing else could have found it.* The CDX index publishes
`base32(SHA-1(response body))` for every capture — an **independent witness** to bytes we hold.
Comparing against it gave **76 of 83 matching**: the Archive served those uncompressed, so the inflate
was a no-op. **A green result from a mechanism that never checked.** The 7 served gzipped did not match,
and re-fetching them with `Accept-Encoding: identity` and `decompress: false` reproduces the CDX digest
exactly, byte for byte.

*A conclusion I drew and had to withdraw:* "we fetched it twice, hours apart, got the same bytes,
therefore the mismatch is the Archive's". **That does not follow.** Two fetches through one path agree
by construction — **reproducibility proves determinism, never fidelity** — and a lossy pipeline returns
the same lossy answer every time. Narrowing Level 2's invariant on that basis would have been choosing
a definition to fit our own defect.

##### The actual lesson: enumerate every transformation between the wire and the column

This level has now reopened twice for **one** reason — *a derivative stored under the name of the
original*. Three transformations sit between the socket and the column, and two were invisible:

| transformation | who does it | was it visible? |
|---|---|---|
| decompress | axios, transparently, by default | **no** |
| decode | axios, by charset guess | **no** |
| extract | `htmlToText` | yes — and still misnamed as `rawText` |

> **Enumerate every transformation between the wire and the column, and either store the input or
> version the transform.**

Applied rather than merely recorded: `document` now holds the bytes **as served**, gzipped where
gzipped; inflate is a named step in a chain the version recites —
`v2-inflate-decode-htmltotext-normalised` — and the rule for headers generalises from the instance:
**store every response header without which the bytes cannot be interpreted.** Today that is
`Content-Type` (charset) and `Content-Encoding`. Charset was the first to prove load-bearing and
happened not to matter; encoding mattered on 8% of captures.

#### LEVEL 1 IS DONE — both environments, closed against an EXTERNAL criterion

**2026-08-27.** `sha1b32(document) == cdx.digest` for all 83 captures on staging (`a43c536`) and
production. First level here declared done against something outside the platform's own assertions.

> **READ THE TWO SECTIONS BELOW BEFORE QUOTING THIS ONE.** The criterion this closed against has since
> gained a second, **internal** axis, and both environments currently FAIL it: `documentHash` holds the
> CDX digest rather than SHA-256 on all 83 rows, pending `forensics:rehash-documents`. The level is not
> reopened — the bytes are correct and externally verified, and the model and write path are right — but
> a reader who stops here would take "done, both environments" for more than it says.

| | staging | production |
|---|---|---|
| `verify-against-cdx` | **83 VERIFIED / 0 CONTRADICTED / 0 UNAVAILABLE** | **83 / 0 / 0** |
| `documentHash` fingerprint | `ccf9a43d96a62968a6652662d3dda108` | **identical** |
| payload total | **3,995,496 bytes** | **identical** |
| `documentContentEncoding` | identity 76, gzip 7 | identity 76, gzip 7 |
| `textExtractionVersion` | 83 at v2 | 83 at v2 |
| `textHash` / `contentHash` | `de77a9bd…` / `c2ec4433…` unchanged | unchanged |
| unanchored | 0 | 0 |

**The convergence was called "the strongest result". THAT CLAIM IS WITHDRAWN — 2026-08-27.**

Two corpora reconciled by *different paths* — staging across an interrupted run, a resumption and a
transient database failure (7 repairs as 4 + 3); production in one clean pass (7 repairs at once) —
arrived at **byte-identical state**: same 83 captures, same 3,995,496 bytes, same fingerprint. All of
that is measured and none of it is retracted.

What is retracted is what it was said to *prove*. **Both environments ran the same code, so
byte-identical state is exactly what a shared defect produces.** Convergence demonstrates sameness, not
correctness — it is `reproducible ≠ faithful` at corpus scale, the same inference this document had
already withdrawn once at capture scale ("we fetched it twice, hours apart, got the same bytes,
therefore the mismatch is the Archive's"). Written by the author who recorded that withdrawal, in the
closing report of the work that produced it.

It was falsified within a day. The `documentHash` corruption below sat in **all 83 rows of both
environments**, and the fingerprints matched throughout — because both environments were wrong in the
identical way. A convergence check would have reported green on the exact defect it was cited as
capable of catching.

*The `contentHash` half still stands*: that column is untouched by the bug, so chain-neutrality remains
proven. The claim that shrinks is the general one about what agreement between two environments is
evidence of.

*The production deploy did NOT abort, and that was predicted before it ran.* `20260827190000` adds a
nullable column with no data precondition, so unlike the previous two ships there was nothing for the
four-step procedure to recover from: applied in 748 ms, one ledger row, no degraded window. Worth
recording because **a procedure that always seems necessary is one nobody is checking the precondition
for** — the prediction made it a test rather than a hope.

##### CORRECTED: a stale measurement explained away instead of re-run

The first report of this result carried a footnote claiming production held **3902 kB** against
staging's **4157 kB**, "expected" because staging's partial run had replaced three payloads early.

**That was wrong, and it contradicted the fingerprint match cited two paragraphs above it.** Identical
`documentHash` on all 83 rows means identical payloads, which means identical byte totals. Both could
not be true.

The real cause: **4157 kB was a stale figure**, measured during the payload backfill while all 83
payloads were still axios-inflated. Reconciliation then stored the 7 gzipped captures as served and the
total fell by ~264 kB. Re-measured: **both environments hold exactly 3,995,496 bytes.**

*This is the second instance in this document of a pattern named in it:* **an accurate fact reported in
place of the relevant one reads as an explanation and stops the next question being asked.** The first
was `archiveHttp` reporting `HTTP 200` for an `ECONNABORTED` timeout. The second was written by the
same author who had recorded the first, two days later, in the closing report of the work that fixed it.
Every component of the explanation was individually true — staging *had* had a partial run, three
captures *were* replaced early — and the conclusion was false, which is what made it convincing enough
to record.

**A wrong explanation in the record is worse than an open question, because nobody re-asks.** One
`SELECT sum(octet_length(document))` settled it.

##### RETRACTED: "the Archive's replay disagrees with its own index"

During the investigation it was said, in two forms, that the Archive was internally inconsistent — and
in review, that *"'independently verifiable' now has a measured error rate"*. **Both are withdrawn.**

Measured on staging after the fix, over all 83 captures:

```
VERIFIED     : 83
CONTRADICTED : 0
UNAVAILABLE  : 0
ARCHIVE_CONTRADICTED : 0
```

**The error rate was ours. The Archive's is zero on this corpus.** Every capture's stored payload now
reproduces the digest the Internet Archive published for it, and the reconciliation found no case where
a fresh fetch disagreed with the index. The apparent inconsistency was axios inflating gzipped records
before we ever saw them.

Recorded next to the original claim because a sentence like *"independently verifiable has a measured
error rate"* is exactly the kind that gets quoted onward, and it would be quoted about the Internet
Archive rather than about a client library's default.

*Independent corroboration, arrived at as a by-product rather than designed:* `documentContentEncoding`
records `gzip` on **exactly the 7 captures** whose digests had disagreed — the same rows identified from
the opposite direction, by the Archive declaring compression rather than by a hash mismatching. Two
independent signals agreeing on which rows were affected is worth more than either alone.

##### Level 1's completion criterion has TWO axes — external AND internal

> **EXTERNAL** `sha1b32(document) == cdx.digest`, for every ARCHIVED capture · *is it what the source served?*
> **INTERNAL** `sha256(document) == documentHash`, for **every** capture · *does the row agree with itself?*

**The second axis was added 2026-08-27, after the first alone proved insufficient — see
"documentHash held the CDX digest" below.** The short statement of why:

> **Level 1 verified its claim about the outside world and never verified its claim about itself.**

`verifyAgainstCdx` recomputes its digest from `document` and never reads `documentHash`. So a repair
tool could write the wrong hash function's output into the integrity column, on all 83 rows in both
environments, while this criterion reported **83/83 VERIFIED** throughout — and did, for a day. The
external axis is the stronger one and it is not the only one needed.

*The internal axis is deliberately NOT scoped by provenance*, while the external one is. Only an
archived capture HAS a published digest to be checked against; but "a row's integrity hash is a hash of
that row's bytes" has nothing to do with the Archive and must hold for a `DIRECT` or `ASSERTED` capture
identically. Folding it into the archive-scoped query would have made it **silently stop covering new
rows the moment Level 2 Phase B creates the first non-archived capture** — a check that narrows as the
data widens, without ever reporting less. A test asserts the internal query carries no `provenance`
key.

*The original statement of the external axis, unchanged:*

> `sha1b32(document) == cdx.digest`, for every capture, in both environments.

`forensics:verify-against-cdx`. This replaces a structural test — *`NOT NULL` is satisfied* — with one
that can be wrong. A structural test says a value is present; it cannot say the value is what the source
served, and Level 1 was declared done on that basis and was wrong twice. `levelOneComplete` requires
**zero CONTRADICTED and zero UNAVAILABLE**: an unavailable check is not a pass, or the level would be
complete by definition again.

*The reversal worth naming:* the CDX check was nearly narrowed for failing to prove provenance. It did
something more useful — it was **the only instrument capable of detecting our own loss**. Without an
external witness, all three transformations would have stayed invisible indefinitely.

##### `documentHash` held the CDX digest — found 2026-08-27, in BOTH environments

**Measured, both environments, by recomputing both candidate digests from the stored bytes:**

| | staging `45ce88aa…` | production `0e755b7d…` |
|---|---|---|
| `documentHash == sha256(document)` | **0 / 83** | **0 / 83** |
| `documentHash == cdxDigestOf(document)` | **83 / 83** | **83 / 83** |

`reconcileAgainstCdx` wrote `cdxDigestOf(payload)` — base32(SHA-1), the Archive's own digest — into a
column `schema.prisma` and `recordCapture` both define as SHA-256 and Level 3 will anchor. The UPDATE
runs on `TEXT_REDERIVED` and `ENCODING_FILLED` as well as `REPAIRED`, so it corrupted **all 83 rows,
not the 7 it repaired**.

**It survived because the wrong function had less friction than the right one.** `cdxDigestOf` was
already in scope from the verifier import at the top of the file; `sha256Bytes` was not imported at all.
Worth stating plainly, because it is a design lever rather than an anecdote: what is already in scope is
what gets used.

*The blast radius, stated exactly rather than dramatically:*

- **Level 1's external criterion is untouched.** It recomputes from `document` and never reads this
  column, so 83/83 VERIFIED was true and remains true. The bytes were never wrong.
- **No anchor moves.** The chain holds `contentHash = sha256(fullText)`; `documentHash` has never been
  anchored, because Level 3 is where it would be and Level 3 is not built. Had the order been reversed
  this would have been a Level 7 evidence-integrity event instead of a repair.
- **`recordCapture.finishExisting` fabricates DIVERGENCE.** It compares stored `documentHash` against
  `sha256Bytes(fetched)`, so until the repair lands, **the next resumed scan reports every capture it
  re-reaches as diverged** — the mechanism built to detect fabricated findings producing them. Not
  latent: it fires on the next scan.

**This is a bug, not a Level 1 reopening**, and the distinction sizes the work correctly. The model is
right and the write path is right; a repair tool corrupted a column. Repair is
`documentHash = sha256(document)` recomputed from bytes already held — local, deterministic, no Archive,
no network, no chain (`forensics:rehash-documents`). Minutes, not a re-fetch, and it is the external
axis that licenses that: the bytes are settled by an independent witness.

*The durable finding is the criterion, not the bug* — hence the second axis above.

###### PRODUCTION REPAIRED — 2026-08-27, from the landed `master` build

Shipped `a43c536` → `17a6423` (11 commits, **no migration files** — verified by diff before shipping,
and the deploy applied cleanly: no abort, no `migrate resolve`, no degraded window, which was
**predicted before it ran** and is therefore a test rather than a hope). Then repaired locally from a
clean checkout of landed `master`, `dist/` rebuilt from scratch.

| | before | after |
|---|---|---|
| external — `sha1b32(document) == cdx.digest` | 83 VERIFIED / 0 / 0 | **83 VERIFIED / 0 / 0** |
| internal — `sha256(document) == documentHash` | **83 CONTRADICTED** | **0 CONTRADICTED** |
| `levelOneComplete` | NO | **YES** |

83 REHASHED, 0 RACED. Second `--apply`: **83 ALREADY_CORRECT, 0 REHASHED.**

**Target confirmed by data three times over, never by the variable passed:** `trackedUrl.id`
`0e755b7d-…`; the before-state showing **83 internally contradicted when staging shows 0**; and the
rehash reporting 83 REHASHED rather than 83 ALREADY_CORRECT. The second of those is a discriminator
that **only existed because staging was repaired first** — an unplanned benefit of the sequencing.

*Cross-environment state after both repairs:*

| | staging | production |
|---|---|---|
| captures / payload bytes | 83 / **3,995,496** | 83 / **3,995,496** |
| `documentHash` fingerprint | `25bdc423…` | `25bdc423…` (was `ccf9a43d…`) |
| `textHash` / `contentHash` | `de77a9bd…` / `c2ec4433…` | identical |

**Payload bytes unchanged to the byte, and `contentHash` unchanged** — the repair moved the hash column
and nothing else, and no anchor moved. Read the fingerprint match as corroboration of *sameness* only:
correctness comes from each environment independently passing both axes, per the withdrawal above.

###### `db:simulate` SILENTLY TARGETED THE WRONG DATABASE — and said LOW RISK about it

**The documented Prisma-CLI-divergence hazard, recurring in a SCRIPT rather than the CLI, caught live
during this repair.**

Invoked as `DOTENV_CONFIG_PATH=.env.production.local npm run db:simulate -- '<production statement>'`,
it printed:

```
  target      : staging
  project ref : elwsznbcfmbmkldpntae
  rows reported affected by the statement : 0
  LOW RISK — Safe to proceed on the evidence of this simulation alone
```

**`Safe to proceed` was a true statement about the wrong database** — the same shape as the `P3012`
near-miss already recorded here, where a true error about the wrong database read as a puzzle rather
than a warning.

*Mechanism:* `scripts/dbSimulate.ts` imports `@prisma/client` and nothing else environment-related. It
has **no `import 'dotenv/config'`**, so `DOTENV_CONFIG_PATH` is honoured by nobody and Prisma Client
falls back to auto-loading `.env` — which points at staging. The forensics scripts (`verifyAgainstCdx`,
`rehashDocuments`) *do* import `dotenv/config` and reached production correctly, so **two scripts in one
repository disagreed about which database an identical invocation targets.**

*What caught it — two independent signals, both by behaviour rather than by the variable passed:*

1. **The tool printed its own target.** It resolves the label and ref from the live connection string,
   so `target: staging` was self-reported. Detection works; only the targeting was broken.
2. **`0 rows affected` rather than `1`.** The statement's guard is
   `AND "documentHash" = '<the stale CDX digest>'`, and **staging had already been repaired**, so it
   matched nothing there. Had production been done first — or both together — this would have read
   `1 row affected, LOW RISK` and looked perfect while proving nothing.

That second signal is worth dwelling on: **the safety of the check depended on the order the two
environments were repaired in**, which nobody designed. Staging-first exists for other reasons and
happened to make this detectable.

*Resolution used:* export the real `DATABASE_URL`/`DIRECT_URL` and re-run, then **verify by what the
tool prints** — `target: PRODUCTION`, `project ref: fqmczumacfbunffgodlo`, `*** THIS IS PRODUCTION ***`,
`1 row affected, 0 permanently lost`.

###### FIXED — and it was FOUR scripts, not one

*The survey is the finding.* Sixteen scripts under `scripts/`; **twelve imported `dotenv/config` and
four did not** — `dbSimulate`, `rediffFromSnapshots`, `bootstrapResearcher`,
`canonicaliseTargetEntities`. **Three of those four WRITE**, and one is named in `CLAUDE.md` as an
authorised production operation:

| script | what it does when pointed at the wrong database |
|---|---|
| `forensics:rediff` | `applyRediff` — rewrites the diff layer |
| `bootstrapResearcher` | grants or revokes RESEARCHER and **ADMIN** |
| `canonicaliseTargetEntities` | `prisma.evidence.update` |
| `db:simulate` | reports `LOW RISK` about a database nobody asked about |

One rule, sixteen implementations, twelve of them right. **This repository's dominant defect shape, and
the reason the guard is a source scan rather than four edits.**

*Position is enforced, not merely presence.* `src/lib/prisma.ts` constructs `PrismaClient` at module
load and CommonJS executes imports in source order, so a `dotenv/config` import placed **after**
anything reaching that module loads the environment too late to matter. A presence check would pass
while the connection stayed wrong. `test/scriptsLoadEnvFirst.test.ts` asserts `dotenv/config` is the
**first** import of every script, and the mutation that proves it is *present but second* — which
presence-only checking cannot see.

*Proven behaviourally, not only by the guard.* The identical invocation, before and after:

```
DOTENV_CONFIG_PATH=.env.production.local npm run db:simulate -- '<statement>'

  before :  target : staging       project ref : elwsznbcfmbmkldpntae
  after  :  target : PRODUCTION    project ref : fqmczumacfbunffgodlo   *** THIS IS PRODUCTION. ***
```

The statement was scoped to production's `trackedUrlId`, so the row count discriminates independently:
**83 rows on production, 0 without the variable** — where the default invocation still correctly
resolves staging, confirming the common path is unchanged.

*What this closes:* `CLAUDE.md`'s *"a rule mandating a tool the environment cannot execute is not a
control, it is an assumption"* applied to `db:simulate` itself. The rule *"a statement that has not been
simulated does not get executed"* is now enforceable in the environment where destruction actually
matters.

*The generalisation, since this is the second instance:* **`DOTENV_CONFIG_PATH` is honoured by whoever
imports dotenv, and by nobody else.** The Prisma CLI ignores it; a script that never imports dotenv
ignores it; Prisma Client then quietly auto-loads `.env`. Neither the printed datasource line nor a
successful run distinguishes the environments. **Only reading back an environment-identifying value the
tool itself resolved does.**

###### STAGING REPAIRED — 2026-08-27, from landed code

Run from a clean checkout of `staging` at `e6dbd43` (`git reset --hard origin/staging`,
`rm -rf dist && npm run build`), per `gf-fix-real-data-with-landed-code`. The earlier diagnostic dry run
from the working tree was treated as diagnosis only: **a dry run from unlanded code cannot authorise a
write from landed code.**

| | before | after |
|---|---|---|
| external — `sha1b32(document) == cdx.digest` | 83 VERIFIED / 0 / 0 | **83 VERIFIED / 0 / 0** |
| internal — `sha256(document) == documentHash` | **83 CONTRADICTED** | **0 CONTRADICTED** |
| `levelOneComplete` | NO | **YES** |

`forensics:rehash-documents --apply`: 83 REHASHED, 0 ALREADY_CORRECT, 0 RACED. **The external axis did
not move**, which is the point — the bytes were never in question, and a repair that changed them would
have been the wrong repair.

*Idempotence proven on real data rather than only in tests:* an immediate second `--apply` reported
**83 ALREADY_CORRECT, 0 REHASHED, 0 RACED**. The tool converges and cannot touch a row already correct.

*Simulated first.* An UPDATE is not on the blocked-command list, but "a statement that has not been
simulated does not get executed" does not carve out non-destructive ones.

> **READ THE TWO NUMBERS TOGETHER: the simulator reported 1 row and the operation wrote 83.**
> Both are true and they measure different things. `db:simulate` takes **one statement**, by design —
> it reports a multi-command input as `NOT SIMULATED` — while the rehash issues **83 individually
> guarded UPDATEs**, one per capture. So what was simulated is **one representative statement of the
> 83**, not the operation.

Stated that explicitly because, left unqualified in a log someone reads cold, `1 row affected` beside
`83 REHASHED` reads either as a discrepancy or as though 83 rows had been simulated. That is this
document's own recurring shape — **a number from one measure asserted about another** — which has now
produced the 94 recount target, the "~13% incomplete" claim, and the stale 4157 kB figure.

`db:simulate` on that representative statement: target `elwsznbcfmbmkldpntae`, **LOW RISK — 1 row
affected, 0 permanently lost.**

**The structural argument is what made this safe, and the simulator agreed with it rather than
establishing it.** The overwritten value is `cdxDigestOf(document)` — recomputable at any time from a
column the statement does not touch. **The write destroys no information**, and that is true of all 83
statements, which is a property a one-statement simulation cannot demonstrate.

#### `noUncheckedIndexedAccess` — MEASURED 2026-08-27, and it is now a number

Previously recorded here as a project-wide issue owned by no level. Measured rather than argued:

```
npx tsc --noEmit --noUncheckedIndexedAccess -p tsconfig.json
```

**133 errors across 17 files.**

> *Corrected 2026-08-27, and the cause is this document's own subject.* This was first reported as
> **"133 errors across 12 files"**. The error total was right and the denominator was wrong, because
> the by-file breakdown was produced with `… | sort -rn | head -12` and **the number of rows displayed
> was reported as the number of files**. A truncation reported as a total — the exact family this
> entire plan descends from, committed while writing the entry that measures it. Caught by the
> reviewing session recounting rather than reading. `sort -u | wc -l` settles it: **17**. By rule: `TS18048` (possibly undefined) 85 · `TS2532` 30 · `TS2345` 13 ·
`TS2322` 4 · `TS2538` 1.

Too large to fold into an unrelated change, too small to be indefinite. **And it is NOT a 133-error
project — the distribution decides the shape of the work.** Two moves, settled 2026-08-27:

**1. Ratchet it — BUILT 2026-08-27.** `test/noUncheckedIndexedAccessRatchet.test.ts`, with the
baseline committed as `noUncheckedIndexedAccess.baseline.json` (**133 across 17 files**). This was the
urgent half, because the standing risk is the bleed rather than the backlog: every correctly guarded
new file is one a future lint cleanup could break, **with the linter arguing for the break**. That has
already happened twice. The ratchet stops it today without waiting for anyone to schedule the backlog.

Three properties, each mutation-proven:

| property | why it is not the obvious version | mutation |
|---|---|---|
| **per file**, not just the total | a total-only ratchet is satisfied by fixing five errors in one file and adding five in another — net zero, undetected, and the new five sit in a file nobody has looked at | a new unguarded index in a file baselined at 0 → `REGRESSION … (NEW FILE — it must start at zero)` |
| **improvements FAIL too** | a ratchet that tolerates being under its baseline stops ratcheting: the slack is invisible, and the next regression spends it silently. Fixing something must lock the gain in | baseline claiming one more than reality → `IMPROVEMENT NOT LOCKED IN`, with the exact regeneration command |
| **one parser for baseline and check** | a baseline measured differently from the check drifts in whichever direction makes it pass. Same shape as one rule with four `documentHash` writers | breaking the diagnostic regex → **throws** rather than returning `{}`, which would have silently relaxed the ratchet to "anything goes" |

The third deserves its own line: `measureNoUncheckedIndexedAccess` returns `{}` only when `tsc` exits
**zero**. If `tsc` fails and nothing parses, that is the output format moving, not the debt vanishing —
and reporting it as "no errors" would be the vacuous pass this document keeps catching.

**What actually stops someone hand-editing the baseline — stated precisely, because the obvious answer
is wrong.** The baseline file carries a `_comment` saying to regenerate it rather than edit it. **That
comment is not the control.** This document's own first section says so: *a comment is not a control,
and a tool a human must remember to run is not a control either.*

The real control is that **the baseline is a committed file, so raising it shows up as a diff in the
pull request, and a reviewer sees a number going the wrong way.** That is a genuine mechanism here
rather than an aspiration, because the two-session split supplies the reviewer — and it is the reason
the baseline is a file at all instead of a constant computed at runtime, which would have made the same
loosening invisible.

Said explicitly so the next person trusts the right thing. Left implicit, the `_comment` looks like the
mechanism, and someone would eventually delete it as noise without realising nothing was lost —
or worse, keep it and believe it was doing something.

**2. Fix `WaybackScraper.ts` inside Phase A**, since Phase A must open that file anyway for
`computeNextFromDate`. Twenty errors in a file already being edited is incremental; twenty errors in a
file nobody is touching is a chore that never gets scheduled. The remaining files ride on the levels
that touch them — `claimTrajectory.ts` with Level 6, `thesisAssertions.ts` and `getThesisContext.ts`
with Level 9.

**That is the whole method here applied to itself:** work nobody owns does not land, so attach it to
changes already planned and ratchet the rest so it cannot grow meanwhile.

**The DISTRIBUTION is the plan, and it is better than "fix one file during Phase A".**
**100 of the 133 sit in six files, and those six map onto the level path** — so the debt is not a
project anyone has to schedule. Each level opens its own files anyway, clears them, and the ratchet
locks the gain in.

| file | errors | cleared by |
|---|---|---|
| `src/services/WaybackScraper.ts` | **20** | **Level 2 Phase A** — must open it for `computeNextFromDate` |
| `src/lib/thesisAssertions.ts` | 18 | Level 9 |
| `src/services/claimTrajectory.ts` | 17 | Level 6 |
| `src/mcp/tools/getThesisContext.ts` | 17 | Level 9 |
| `src/utils/tipTapUtils.ts` | 15 | Level 9 — thesis rendering |
| `src/mcp/tools/getThesisTrajectoryCitations.ts` | 13 | Level 6 |
| | **100 of 133** | |

The remaining 33 are scattered one to ten per file, including `measureHrefChanges.ts` (10) where the
problem was first noticed via `extractHrefs`.

**So the 133 disappears as a BY-PRODUCT of work already scheduled, never as work of its own.** That is
the generalisation of the coupling that made `WaybackScraper.ts` attractive: it was not special, it was
simply the next level's file.

*Why this compounds, and why it is not merely tidiness.* With the flag off, TypeScript types every
regex capture group and array index as non-`undefined` while they are `undefined` at runtime — so **the
linter argues for deleting the guards that make the code correct.** `extractHrefs` was the first
instance: written `m[2] ?? m[3] ?? m[4]`, the linter called the fallbacks redundant, and deleting them
would have made single-quoted `href='…'` extract as the empty string. `documentHashSingleRule.test.ts`
is the second — it depends on `match?.[1] !== undefined` and on iterating rather than indexing.

**Every correctly-guarded file is therefore one a future lint cleanup could break, with the linter
arguing for the break.** Each new guarded file adds to that surface, which is why the number is worth
having now rather than at the end.

##### HOUSE PATTERN: a suggested fix must be safe when the diagnosis is wrong

**Found by mutating a ratchet rather than the code it guards, 2026-08-28.**

Renaming the rule constant in the `no-unnecessary-condition` measurer made every file report zero. The
ratchet's improvement arm reported that as **progress**, and the remedy it printed — *"regenerate the
baseline"* — would have written zeros into the baseline and **disabled the check permanently.**

> **That is worse than a check that cannot fail, because it RECRUITS THE OPERATOR into disabling it.**
> A check that silently passes wastes the effort of writing it. A check that congratulates you and hands
> you the command that destroys it converts a broken tool into a broken tool nobody can find.

The fix is not only to detect the collapse but to change what the message *offers*: a wholesale drop to
zero throws, and says explicitly **do not regenerate the baseline; fix the measurer.**

**Generalised, because it applies to every error message that tells someone what to run next:**

> *A suggested remedy is executed by someone who trusts the diagnosis. So the remedy has to be safe in
> the case where the diagnosis is wrong — and the case where a check is broken is precisely the case
> where its diagnosis is least trustworthy.*

*Ported to the `noUncheckedIndexedAccess` ratchet as its own change, and the port caught a DIFFERENT
shape:* that measurer already threw when `tsc` **failed** and nothing parsed, but not when `tsc`
**succeeded** for the wrong reason — a changed flag, a moved tsconfig — which also reads as the debt
being paid off in one go. Two ratchets, two collapse routes, one rule.

##### HOUSE PATTERN: when a guard fails on the rows a change is meant to fix, RESTATE it — never loosen it

**Found applying `v3-sentence-claims`, 2026-08-29.**

`planRediff`'s `safeToApply` required every stored chunk to reappear verbatim in the recomputation. That
was exactly right for the truncation repair, which only ever **grew** a record: stored text missing from
the recomputation meant the repair was also losing something.

Under a **narrowing** migration the premise inverts. Sentence-granular claims deliberately shrink a
stored block chunk to the sentences that actually changed, so verbatim reappearance is **guaranteed to
fail on precisely the rows the migration exists to fix** — and the guard would have refused all of them.

> **The tempting move at that moment is to weaken the guard, and it is the wrong one.** The guard is
> protecting the single unrecoverable property: applying rewrites the chunk payloads in place, so text
> with no counterpart is gone. Loosening it to get the migration through would trade a real protection
> for a convenience, at exactly the moment the protection is doing its job.

Restated instead, to permit that specific transition and nothing wider:

> *A sentence of a stored chunk may disappear ONLY IF it is present in BOTH captures — that is, only if
> it never changed.*

That permits exactly the rider and forbids everything else: a genuinely removed sentence is absent from
the after capture, so narrowing it away fails the check and the row is refused. Measured on both corpora
at apply time: **0 entries unsafe.**

**Generalised:** a guard encodes an invariant *and* an assumption about the direction of change. When a
new change reverses the direction, separate the two — keep the invariant, restate the assumption. The
question to ask is never *"can we relax this?"* but *"what is the narrowest transition that must now be
permitted, and does permitting it still forbid the thing the guard was written for?"*

##### HOUSE PATTERN: a check that parses must fail loudly when its pattern stops matching

**Third instance in this work, so it stops being a knack and becomes a rule.**

> **Any check that derives its expectation by parsing — source, tool output, a log — must FAIL when the
> pattern matches nothing. A parse that finds nothing is a broken parser far more often than it is a
> clean result, and the two are indistinguishable from the outside.**

The failure mode is specific and quiet: the parse returns empty, every assertion downstream becomes
vacuously true, and the suite goes green **more emphatically than before**. Nothing looks wrong. The
check has stopped checking and reports success for exactly that reason.

| instance | what a silent zero would have meant |
|---|---|
| `mcpToolClassification.test.ts` | "every registered tool is classified" — over zero tools |
| `documentHashSingleRule.test.ts` | "every `documentHash` writer uses `sha256Bytes`" — over zero writers |
| `noUncheckedIndexedAccess` measurer | "the debt is zero" — when `tsc` failed and the output format had merely moved |
| `scriptsLoadEnvFirst.test.ts` | "every script loads env first" — over zero scripts |

Each carries an explicit guard, and each guard has been **mutation-proven by breaking the pattern**:
the `SET`-clause regex, the diagnostic regex, the directory filter. In every case the test count
collapsed and the guard fired instead of the suite passing green.

*Distinguish the two shapes, because they are cousins and the fix differs:* an
**assertion that cannot fail** is one whose expectation is trivially satisfied — a constant
compared against itself. A **vacuous pass** is an assertion that would be fine, applied to an empty
set. The first is fixed by making the assertion meaningful; the second by asserting the set is
non-empty before trusting anything derived from it.

##### A new defect shape: THE BAG ASSERTION

> **An assertion that checks presence in a collection rather than binding a value to a name. It looks
> semantic and is merely positional-agnostic.**

`test/reconcileAgainstCdx.test.ts` asserted `expect(params).toContain(CDX)` on the raw-SQL parameter
array. That passes whether the CDX digest lands in `documentHash`, in `textHash`, or anywhere else in
the statement — it asserts only that *some* column received the value. **A test written to prove the
repair worked was satisfied by a repair writing the wrong hash into the integrity column**, and then
held that defect in place across two environments.

Third instance of *a test encoding a defect as a requirement*, and the first where the mechanism is
generalisable: fixing the code made exactly those two assertions fail, which is the shape's own tell.

*Fixed by `test/helpers/writtenColumns.ts`*, which parses the template's own `"col" = $n` fragments so
an assertion says which column it means. Swept across every call-argument bag assertion on a column
write — `backfillDocumentBytes.test.ts` carried five of the same shape. Proven by a mutation that
**swaps the `documentHash` and `textHash` values between their columns**: both values remain in the
bag, so `toContain` cannot see it, and the column-addressed assertion fails immediately.

*Left as bag assertions deliberately, because they are correct ones:* a prompt-contains-phrase check,
and the WHERE-clause id in `backfillDocumentBytes` — `writtenColumns` reports SET columns and should not
report that.

##### The guard is a SOURCE SCAN, because four writers is a rule with four implementations

`documentHash` has four writers — `recordCapture`, `reconcileAgainstCdx`, `rehashDocuments`,
`backfillDocumentBytes`. One rule, four implementations, which this repository already names as its
dominant defect shape with the prescription: **guard with a source scan, not a behaviour test.**

The internal axis is a good runtime guard, but it catches a fifth bad writer only *after* the data is
written and only when somebody runs the verifier. `captureDocument.ts` already exports the single
`sha256Bytes`, so the rule is *everyone routes through it* — and that is checkable at build time.
`test/documentHashSingleRule.test.ts` parses `src/`, extracts every expression assigned to
`documentHash` inside a write region (a Prisma `data:` payload or a raw `SET` clause), resolves one
level of indirection to the local `const`, and asserts each traces to `sha256Bytes`. Precedent:
`mcpToolClassification.test.ts` parses `mcpServer.ts` to assert every registered tool is classified.

It carries an explicit vacuity guard — **fewer than four writers found is itself a failure** — because a
source scan whose pattern silently stops matching becomes a suite of assertions that cannot fail. That
guard is mutation-proven: breaking the `SET`-clause pattern drops the test count and fires the guard
rather than passing green.

##### Repair is keyed on verification failure, not on a null column

`document`/`documentHash` are `NOT NULL`, so the obvious repair — null them and let the backfill refill
— cannot run. Making it run would mean dropping the constraint, nulling, backfilling and re-adding it:
three migrations and a degraded window, with the constraint absent exactly while the data is worst.

`forensics:repair-against-cdx` keys on the check instead. Self-targeting, idempotent, converges on
repeated runs, and **cannot touch a row that is already correct** — which the `documentHash IS NULL`
guard could never promise once the column was populated. The never-silently-overwrite rule survives via
a two-way discrimination:

| our bytes ≠ CDX digest, and… | action |
|---|---|
| a fresh identity fetch **matches** CDX | our stored bytes were wrong → **repair** |
| a fresh identity fetch **also differs** | the Archive's replay disagrees with its own index → **do not overwrite**, record `ARCHIVE_CONTRADICTED` |

The second row is the residual Archive inconsistency this work was originally chasing — now measurable
on clean data, and stated with evidence rather than inferred.

##### A refinement to "an enforcement is not proven until it has been observed to FAIL"

**A mutation must be shown to have hit the code under test before its survival means anything.** A
surviving mutation has two possible meanings and only one is a hole in the tests: mutation F4 "survived"
because it patched `decodeDocument` instead of `inflateDocument` — the first `} catch {` in the file.
Re-aimed, it failed immediately. **A mutation that hits the wrong code proves nothing, which deserves
the same suspicion as a test that cannot fail.**

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

##### PRISMA CLI SUBCOMMANDS DO NOT AGREE ON WHICH DATABASE THEY TARGET

**Two independent instances during this one catch-up, hours apart, one of them a command away from
mutating the wrong migration ledger.**

| instance | mechanism | what happened |
|---|---|---|
| 1 | real `DATABASE_URL` / `DIRECT_URL` exported | `resolve` and `migrate diff` reached **production**, while `migrate status` answered *"Database schema is up to date!"* for a database that was missing a constraint |
| 2 | `DOTENV_CONFIG_PATH=.env.production.local` | honoured by `node` + `dotenv/config`, **ignored by the `prisma` CLI** — which printed `Environment variables loaded from .env` and ran `migrate resolve --rolled-back` against **staging** |

So the finding is not "the CLI ignores that variable". It is that **subcommands disagree**, and
**the printed `Datasource "db": …pooler.supabase.com` line carries no distinguishing information** —
both environments share the host, and the project ref lives in the masked credentials. The line looks
like confirmation and is not.

In instance 2 the error (`P3012 … not in a failed state`) was **a true statement about the wrong
database**, which is why it read as a puzzle rather than a warning. Nothing was modified only because
`P3012` is a refusal. **Next time the command might be valid on the wrong database.**

*Detection and prevention are both required; neither is sufficient alone.*

- **Detection — verify by BEHAVIOUR, not by the variable you passed.** Staging answers "up to date";
  production answers "Following migration have failed". That is what confirmed the corrected invocation
  had actually landed on production. But this is detection *after the command ran*.
- **Prevention — make the wrong target unreachable.** Run production commands from a temp directory
  holding **only** the schema and the production env, so there is no `.env` for a subcommand to pick up
  and nothing for subcommands to disagree about.
- **A project-ref precondition** (refuse unless `fqmc…`) prevents, but guards only the string that was
  extracted — not what Prisma actually used.

##### Verify a RENAME moved values without altering them

`ALTER TABLE … RENAME COLUMN` *should* be inert. **"Should be" is exactly what a before-state exists to
disagree with.** Standard for any rename: fingerprint the column before, and the renamed column after —
`md5(string_agg(col, ',' ORDER BY <stable key>))` — and compare. For `rawContentHash` → `textHash` on
production: `de77a9bd…` before, `de77a9bd…` after, same 83 values in the same order.

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

- **A scan that fetches nothing reports success — FIXED 2026-08-27.** `runFullScan` asked
  `computeNextFromDate` whether more batches exist, and that returns `null` when the last batch held
  fewer than `MAX_SNAPSHOTS` rows. Staging's `COMPLETED` job (`totalSnapshots: 41`) therefore
  short-circuited to `COMPLETED` without one request to the Archive.

  **The diagnosis is sharper than "an off-by-one in a completeness check": ONE BRANCH SERVED TWO
  DIFFERENT QUESTIONS.**

  | question | asked when | answerable by |
  |---|---|---|
  | *is there another PAGE of this walk?* | mid-run, after a batch | the sentinel — legitimately |
  | *has the Archive gained captures since we last looked?* | a fresh scan request | **only by asking CDX** |

  `totalSnapshots` holds `MAX_SNAPSHOTS + 1` as a within-run pagination sentinel, so **a finished scan
  always ends below `MAX_SNAPSHOTS` — that is what finishing means.** Read across runs, the sentinel
  therefore answers "nothing more, forever" for every completed job. The fix distinguishes the two by
  `batchesProcessedThisRun`, and a fresh scan now derives its resume point from **stored capture
  state** — one second past the newest archived capture held — rather than from the previous run's
  final transition. *Derive from state, not from a transition*, for the fourth time.

  With no capture held it resumes unbounded, which is the Phase B case: the scan runs, CDX answers,
  and **"the Archive holds none" becomes an observation instead of an inference from a counter nobody
  set.** `totalSnapshots: 0` after a completed fresh scan now means *we asked and there is nothing
  newer*, which it never did before.

  *Limit, stated rather than discovered later:* a fresh scan is **incremental**. It looks only for
  captures newer than our newest and will not rediscover a gap in the middle — that is what
  `forensics:recover-captures` is for.

  *Mutation-proven.* Restoring the original single-branch behaviour fails **all six** new tests;
  narrowing the unbounded resume, dropping the archived-only scope, and removing the pagination
  terminator each fail one. A fifth mutation was **discarded rather than counted**: `if (false)`
  broke compilation, so the suite reported `0 total` — which is a vacuous result, not a kill.
  Re-aimed at the terminating `return`, it compiled and killed a test.
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

**STATUS: PHASE A COMPLETE (2026-08-28) — see the section below for what Phase A covered. REOPENED 2026-08-29: `create_evidence_from_url` bypasses `admitUrl` entirely and is DEPRECATED by researcher decision; the archive-first pipeline is mandatory, and a `DIRECT` fallback must link to the recorded Wayback failure. Blocked on Save Page Now, which does not exist.**

*Invariant:* the bytes stored are the bytes the source served, and a later change on the source's side
is detectable.

*Enforcement, in two phases. The order is the level's own logic applied inside itself: do not add a
second writer until the invariant is enforced on the first.*

**Phase A — harden the path that exists.** Persist the CDX `digest` at write time (it is already
fetched by `WaybackScraper`, used only to de-duplicate, and thrown away) · `list_captures` partitions by
provenance · the scan that reports success while fetching nothing · the 404 capture as queryable state ·
the reconciliation fast path, deferred while it was on the critical path.

> **CORRECTED 2026-08-27 — an earlier version of the line above added "and it is currently re-fetched on
> every verification", which framed the live CDX fetch as a COST. It is not a cost, it is the
> criterion.**
>
> Level 1 closes on `sha1b32(document) == cdx.digest`, and the entire value of that check is that its
> right-hand side comes from **outside this platform**. A stored digest read by `verifyAgainstCdx` would
> convert the external axis into a second internal check — our bytes against our own note of what CDX
> once said — while every count stayed green. **The level was reopened twice for exactly that shape of
> self-referential verification**, and this would reintroduce it in its most persuasive disguise: a
> performance optimisation.
>
> The sentence is corrected rather than deleted because a plan is read for guidance, and a line inviting
> the reader to treat the live fetch as waste is the kind of invitation that gets accepted by someone
> who is not looking for traps. **Enforced by `test/liveArchiveObservers.test.ts`, not by this
> paragraph** — a comment is not a control.

**Three of Phase A's items were one change, and building them separately would have meant touching the
scanner's write path twice for one concept.** The CDX digest, the unservable capture and "we asked and
the Archive holds nothing" are all *what the Archive told us*, and all three were previously discarded
or trapped inside `WaybackScrapeJob.snapshotsList` JSON. They are now `CdxIndexEntry` and `CdxQuery`.

*`CdxQuery` exists because of a conflation caught BEFORE it became a bug, which is a first here.* **A
query returning zero rows creates zero entries, so an empty answer is indistinguishable from never
having asked unless the asking is itself recorded.** That is the never-looked-versus-nothing-there
family — `UNAVAILABLE` versus missing data, the 404 in a JSON blob, `documentContentEncoding`'s null,
and `totalSnapshots: 0` — and Phase B routes on precisely that distinction.

*`CdxIndexEntry` is unique on `(trackedUrlId, waybackTimestamp, digest)`, and the digest in that key is
load-bearing.* Keyed on the timestamp alone, a re-observation would update in place and **index drift
would be invisible** — destroying the capability the table was partly justified by. With the digest, a
changed answer from the Archive becomes a **second row**: the same rule as capture novelty, one layer
out, with growth bounded by actual change rather than by scan count.

*The digest is deliberately NOT denormalised onto `UrlSnapshot`.* Doing so would put a CDX-supplied hash
in the same row as `documentHash`, and this repository has already paid for two hash-shaped columns of
different provenance sitting together. `documentHashSingleRule` would not catch it — it asserts what
*writes* to `documentHash`, not what sits beside it — so a test asserts `UrlSnapshot` has no
`/cdx/i` column, and the later "saves a join" optimisation fails loudly instead of looking sensible.

#### `list_captures` PARTITIONS — DONE 2026-08-28, and the item was half-wrong

Only archived captures may be cross-checked against the CDX index; listing a direct capture there would
report it as a gap in the Archive, a fabricated finding from the tool built to detect fabricated
findings. **That scoping already existed and was correct.** What it produced was a tool that *omitted*
never-archived captures entirely — so `list_captures` UNDER-REPORTED what the platform holds, which is
the same failure in the other direction.

**A partition, not an exclusion.** They now appear in their own `notArchived` section, each row carrying
`independentlyRecheckable: false` **stated rather than inferred from which array it came out of** —
because that is the distinction a reader actually needs: everything in `captures` can be verified by a
stranger against a public archive, and nothing in `notArchived` can.

Built while the answer is always empty, since every stored capture is `WAYBACK`, for the same reason
`UNCHANGED` landed before the backfill wrote a row: **the first `DIRECT` capture Phase B creates must
appear in this tool on the day it is created, not the day somebody notices it is missing.**

#### THE RECONCILIATION FAST PATH — DONE 2026-08-28

Deferred while it was on the critical path, so production could run the exact tool proven on staging.
A capture is skipped only when all three of its inputs are already settled: the payload **VERIFIED**
against the Archive's published digest — an *external* witness, not our own record of it — the encoding
already observed, and the text already at the current extraction version. Nothing a fetch could return
would change a column, so fetching costs 1.5s and an Archive request for nothing.

*The three-way condition was mutation-proven the hard way.* Skipping on the **verdict alone** kills four
tests. Ignoring the **encoding** kills four. **Ignoring the stale text version SURVIVED all 31** — the
existing "re-derives when the version is behind" case could not catch it, because its verdict carries a
null encoding, so the skip was already blocked for a different reason and the version conjunct was never
the thing under test.

> **A test that passes for a reason other than the one it names is not covering what it appears to
> cover.**

The consequence would not have been cosmetic: after a `textExtractionVersion` bump, every verified row
with a stored encoding would be skipped and left at the old version — the two-partial-states condition
this tool's own header exists to prevent.

#### LEVEL 2 PHASE A IS COMPLETE — 2026-08-28

| item | outcome |
|---|---|
| persist the CDX digest at write time | `CdxIndexEntry`, unique on `(trackedUrlId, waybackTimestamp, digest)` so index drift is a new row |
| `list_captures` partitions by provenance | `notArchived` section, `independentlyRecheckable` on the row |
| a scan that reports success while fetching nothing | one branch was answering two questions; a fresh scan now always reaches the Archive |
| the 404 capture as queryable state | `UNSERVABLE`, distinct from `UNFETCHED` and from `UNCHANGED` |
| the reconciliation fast path | skips only when payload, encoding and text version are all settled |

**Phase B's precondition is discharged**: a scan always asks, and a zero-row answer is recorded as a
fact (`CdxQuery`) rather than inferred from an overloaded counter. Routing on *"the Archive holds no
captures for this URL"* is now branching on a signal that exists.

#### SAVE PAGE NOW — the policy is DECIDED, 2026-08-28

*Five decisions. Four were operational with defensible defaults; the fifth was not, and the first answer
to it was disproved by this corpus.*

**A domain allowlist was proposed and REJECTED, on evidence.** Production's only **Tier 1: Smoking Gun**
sits on `rtmag.co.il` — a media domain. A government-domain allowlist would have refused the most
probative record the platform holds. Measured, not argued: every other confirmed record is
`web.archive.org`.

**The replacement is a second gate, and the reframe is the substance.** `ON_MISSION` is a precondition,
not the question. Relevance is not what SPN adds: the page is already public, so SPN makes it *durable*
rather than *visible*, and the harm case has exactly one shape — someone who published something about
themselves and later wants it gone. **The mission gate cannot see that axis at all**, because it reads
subject matter rather than who is in the page.

| | mission gate | subject gate |
|---|---|---|
| question | is this within the stated purpose? | is this page about a named private individual? |
| verdicts | `ON_MISSION` · `OFF_MISSION` · `UNCLEAR` | `NO_PRIVATE_INDIVIDUAL` · `NAMED_PRIVATE_INDIVIDUAL` · `NEEDS_HUMAN` |
| uncertainty resolves toward | **admitting** — a false rejection blocks a legitimate investigation | **asking a human** — a false negative performs an irreversible act on someone who did not choose it |
| runs | every submission | only when SPN is about to fire |

**A human is NOT asked every time, and that is the correction.** The first design required confirmation
on every `ON_MISSION` — a gate that cries wolf, which this document already records gets disabled. An
institutional or press page on Covid-19 health policy is the whole point; permanence harms nobody, SPN
fires only when the Archive holds nothing, and asking every time trains a reader to stop reading.

**Mission `UNCLEAR` refuses outright, human or not.** *A human may authorise permanence; a human may not
authorise relevance.* Without that, the subject gate becomes a way to talk past the first gate.

##### The vocabularies are DISJOINT, and under one table that is a correctness property

Both gates originally used `UNCLEAR`, resolving it in **opposite** directions. The first design guarded
that with a comment stating the asymmetry and a test pinning both — **the two weakest rungs of the
hierarchy, guarding a hazard the same document had just named.**

Sharing one `verdict` column made it worse than a naming smell: one value would mean two opposite things
depending on a sibling column, so a query filtering on it would return rows meaning *proceed* beside rows
meaning *stop*. **One value answering two questions — the shape the `checkType` enum was split to avoid,
reappearing one level below it.**

Renaming the subject verdict to `NEEDS_HUMAN` removes the hazard instead of watching it, and something
better falls out: **every verdict value now implies its own check type**, so
`UrlAssessment_verdict_matches_checkType` is a **misattribution guard** rather than a membership test —
a mission verdict written under `checkType = 'SUBJECT'` violates the constraint instead of being stored
and silently meaning its opposite. It also makes `SavePageNowRequest.subjectVerdict` self-describing in
a table that has no discriminator at all.

##### One table, and why the CHECK is the constraint rather than a check

`UrlAssessment` carries both judgements. Two tables would mean the provenance-recording rule — author,
model, version, criterion hash, what the model was shown, who overrode it, and the completeness CHECK —
existing **twice**: one rule, two implementations. `verdict` is `TEXT` constrained per check type, and
**a constraint on an enumerated set is what an enum is**; the earlier argument was against a check in
one language guarding a table any path can write, which is not this.

##### The migration RENAMES rather than recreating, and the reason is not caution

`prisma migrate diff` generates a table removal here. The table held **0 rows**, measured. *That is
exactly the reasoning to refuse:* a scan between the measurement and the deploy would write one, and the
removal would destroy it while still reporting success. `ADD COLUMN "checkType" … NOT NULL` with no
`DEFAULT` is a **built-in emptiness guard** — Postgres refuses it on a table with rows, so a surprise row
aborts the deploy with the previous version still serving.

##### `PENDING` was not enough — `lastCheckedAt`

`PENDING` distinguishes *asked* from *never asked*. It does not distinguish **asked and still waiting**
from **asked and never checked again**, and a `PENDING` row nothing revisits decays into exactly the
inference the table exists to prevent — the never-looked-versus-nothing-there family one level up from
where it was designed out. `reconcileAgainstCdx` already runs a live CDX query per tracked URL, so
resolving open requests there is nearly free.

`DECLINED` (robots.txt, paywall — durable) stays distinct from `FAILED` (rate-limited — retryable), for
the same reason `UNSERVABLE` is distinct from `UNFETCHED`.

##### THE GATE COVERED ONE PATH OF FOUR — found and closed 2026-08-28

**Before any of this could be relied on, the admission check had to actually run.** It was built on
`POST /api/forensics/scan` and nowhere else, while **four** code paths could create a `TrackedUrl`:

| path | reached by | gated? |
|---|---|---|
| `forensicsRoutes.ts:151` | `POST /api/forensics/scan` — the website | **yes** |
| `WaybackScraper.analyzePageHistory` | `GET /api/forensics/wayback` | no |
| `startForensicScan.ts` | **MCP `start_forensic_scan`** | no |
| `enrichEvidenceWithHistory.ts` | **MCP `enrich_evidence_with_history`** | no |

> **The admission check existed on the path THE WEBSITE uses and not on the paths THE RESEARCHER uses.**

The gate was the exception rather than the rule, and the ungated majority is the interface the
investigation is actually conducted through. That is
[[gf-investigation-tools-must-be-mcp]] **inverted**: a control present in REST and absent from MCP is
as broken as a capability present in REST and absent from MCP — and harder to notice, because nothing
fails. It is also the same shape as FINDING 14, where the UI promote button routes around the debate.

*It mattered concretely and immediately.* The revised rtmag plan opens with `start_forensic_scan` on the
URL backing the case's central claim — which would have admitted it **through the gap the machinery was
built to close, on the single page where its absence is least defensible.**

**One admission path.** `admitUrl` runs the gate, records the verdict in both directions, and is the
only writer of `TrackedUrl`. `test/urlAdmission.test.ts` asserts that by source scan —
`trackedUrl.upsert` / `trackedUrl.create` appear in `admitUrl.ts` and nowhere else — with comments
stripped first, because `admitUrl.ts` documents the rule in prose and would otherwise match itself for
the wrong reason. **A behaviour test could only cover paths someone thought to test; a fifth path added
tomorrow is covered by nothing.**

*Two tests were replaced rather than repaired, and the distinction is the point:* `mcpTools.test.ts` and
`mcpIntegration.test.ts` each asserted that `start_forensic_scan` **upserts a `TrackedUrl` directly**.
Those tests pinned the bypass — they asserted the gap as the requirement, which is the third instance of
that shape in this work.

*Also extracted:* `fetchContentForRelevanceCheck`, which lived inside the one route that gated. Part of
why the other three could not gate was that gating required duplicating it — **a rule expensive to apply
everywhere ends up applied in one place.**

*`UNREADABLE` is not a verdict about the URL.* When no content can be retrieved, nothing is recorded as
an assessment: a verdict implies a judgement was made, and "we could not read the page" is a verdict
about the CHECK. Storing it as `OFF_MISSION` would make an unavailable check indistinguishable from a
refusal — §3's own distinction, at the front door.

##### PHASE B SCOPE, CORRECTED 2026-08-28 — do not build ahead of a real case

Phase B was drifting into Save Page Now machinery: a subject-sensitivity agent with its own prompt and
hash, a four-state `SpnOutcome` lifecycle, `PENDING` resolution, and a polymorphic assessment table with
a `checkType` discriminator to hold two vocabularies.

**Production tracks ONE url. Zero Save Page Now requests have ever been made**, because the Archive
already held captures for everything — 83 for the MOH page, 25 for rtmag. **SPN is the branch taken when
CDX returns zero rows, and that has never happened.**

*All of it was reverted*, including the `UrlAssessment` restructure: a discriminator whose only value is
`MISSION` is speculative generality of exactly the kind being corrected. The reasoning is kept below;
the code is not. `20260828020000` was unapplied everywhere, so the restructure cost nothing to withdraw
— and that is the argument for withdrawing it now rather than after it carried rows.

**What survives is the real fix:** `admitUrl` as the only writer of `TrackedUrl`, and the verdict
recorded in every direction.

##### DECIDED 2026-08-29 — `create_evidence_from_url` is DEPRECATED

**Researcher's decision.** A URL submission may not enter the corpus through a tool that skips the
pipeline. The rule, in the researcher's terms:

> ask `track_url` from Wayback, handle the error condition or any way Wayback can tell us this can't be
> done, then act on the failure and execute the fallback — never as a direct MCP that does not enforce
> the allowed flow. And direct-URL evidence must be linked to a record that shows the failed attempt
> and the failed Wayback reason.

This is §2's pipeline made mandatory rather than merely intended. Today `start_forensic_scan` routes
through `admitUrl` and asks CDX first; **`create_evidence_from_url` asks nothing.** It fetches the live
page, extracts, hashes `url + text[0:40k]` and writes an `Evidence` row — step 1 of the pipeline never
happens. Two admission paths, one gated and one not, which is this repository's dominant defect shape
sitting on the corpus's front door.

**The fallback is not merely permitted-when-archiving-fails; it is EVIDENCED by the failure.** A
`DIRECT` record must carry a link to the stored attempt and the reason Wayback gave. That is stronger
than the rule below, which makes a zero-row `CdxQuery` the *record* of a refusal: a co-existing row is
something an auditor must think to look for, and a link is something the evidence itself asserts. It
also closes the gap the rule below names — "archiving was attempted and is impossible" becomes a claim
with a referent instead of a label.

###### The two halves have different readiness, and building the second one early is the trap

**Save Page Now does not exist in this codebase** — no implementation, on any path. So:

- **Deprecating `create_evidence_from_url` is available now.** Nothing depends on Save Page Now to stop
  a tool from bypassing the gate.
- **The fallback is not.** Without SPN there is no attempt to fail, so there is no failure record to
  link to, and a `DIRECT` record created now could only mean *"we did not ask"* — exactly the
  provenance the rule below forbids, now wearing a link to a record of nothing.

**Until SPN lands, the correct behaviour on a zero-row CDX answer remains REFUSAL**, which `admitUrl`
already does. The deprecation removes a bypass; it does not create a fallback.

**Open, not decided here:** `create_evidence_from_text` (`ASSERTED`) is the other write tool that
enters evidence without a capture. It is a different exception — text supplied to us, nobody we control
observed the page — and the researcher's decision above did not name it. It should not be folded in by
inference.

**Owed before migration planning:** a count of existing evidence rows that entered this way, in both
environments. §2 corrects an earlier claim about exactly this that was *"reasoned from plausibility
instead of counted"*, so the number is taken, not estimated.

##### Until SPN exists, a zero-row CDX answer REFUSES the submission

`DIRECT` must mean *"archiving was attempted and is impossible"*, never *"we did not ask"*. Without Save
Page Now only the second is achievable, so writing a `DIRECT` capture as a fallback would be a
provenance asserting an attempt that never happened — on the axis a reader uses to judge whether a
stranger can re-check the evidence.

**`CaptureProvenance.DIRECT` has zero writers, and `test/directProvenanceUnused.test.ts` keeps it that
way** by source scan. The refusal is not silent: the `CdxQuery` row with `rowCount: 0` is its record,
written by Phase A precisely so that "the Archive holds none" is an observation rather than an
inference. rtmag's existing capture is grandfathered and already carries `independentlyRecheckable:
false` through the `notArchived` partition.

*The scan proves an ABSENCE, which a broken pattern also produces*, so it carries two guards: an anchor
on `recordCapture` naming the enum it does write, and a case exercising the matcher against both shapes
a writer would use.

##### `UNREADABLE` is a recorded verdict, not an absence — corrected

The first version of `admitUrl` returned `UNREADABLE` and wrote nothing, reasoning that a verdict
implies a judgement was made. §3 already answers that: **`UNAVAILABLE` is a verdict about a CHECK, never
about DATA — and §3 stores it.** Writing nothing makes *"did we try to admit this URL?"* unanswerable,
which is the never-looked-versus-nothing-there family **at the front door of the corpus**.

One value on the mission vocabulary, kept out of `OFF_MISSION` so an unavailable check stays
distinguishable from a refusal.

*A mutation SURVIVED here.* Returning `UNREADABLE` without recording it passed all 25 tests, because
they exercise `recordUrlAssessment` directly and nothing asserted that `admitUrl` **calls** it. **Third
time this session with that exact shape** — the route not recording an admit, the scraper passing a
wrong predecessor id, and this. *Testing a collaborator in isolation says nothing about whether its
caller reaches it*, and "the unit is covered" reads as "the behaviour is covered" until something
silently stops happening. `test/admitUrl.test.ts` now tests the caller.

##### FINDING: the migration history is not self-contained — pgcrypto is undeclared

`20260824150000_claim_trajectory_pattern_hash` calls `digest()`, which comes from **pgcrypto**, and the
history declares only `vector`. Replaying from empty fails at that migration.

**It works in every real environment because Supabase pre-installs pgcrypto — so no deploy can ever
catch it**, which is precisely why a shadow replay is the only thing that would have. The consequence is
concrete: **`db:verify-migrations` cannot pass today.**

Not fixable by amending that migration — it is applied, and applied migrations are never edited. A later
`CREATE EXTENSION` would not help either, because the replay fails before reaching it. **Recorded as a
finding rather than worked around**, and the tool says so in its own header rather than appearing merely
unrun.

*Also corrected:* the documented shadow one-liner named `postgres:16`, which lacks pgvector and would
fail on `CREATE EXTENSION vector`. It is `pgvector/pgvector:pg16`.

##### PARKED — design kept, code not built

**The subject-sensitivity gate and the SPN request record.** The design stands and is worth keeping:
`ON_MISSION` is a precondition rather than the question, because SPN makes a page *durable* rather than
*visible* and the mission gate reads subject matter rather than who is in the page. A second gate would
carry its own vocabulary with the **uncertainty default inverted** — `NEEDS_HUMAN` rather than
`UNCLEAR`, deliberately a different word, so that one column cannot hold a value meaning *proceed* in
one gate and *stop* in the other. Mission `UNCLEAR` would refuse outright, human or not: **a human may
authorise permanence; a human may not authorise relevance.**

**Build it when a URL actually needs Save Page Now.** The subject gate is a privacy-policy question with
no bearing on Level 2's invariant, and it stays parked regardless.

##### Still to build

The schema, the two-gate decision and the request record are in. **The subject-gate agent and the SPN
HTTP call are not** — that is Phase B's remaining work, and it now has somewhere to record what it does.

#### CORRECTED: a hand-written migration CAN be proven before it applies

*A claim made and withdrawn the same day.* It was said that `db:check-drift` cannot validate a
hand-written migration and therefore **"the deploy is the proof"**. That is wrong, and the correction
matters because it turns a deploy from a proof into a formality.

`check-drift` compares the **live database** against the model, so it cannot help: the live database is
whatever the SQL actually did, and drift then compares the model against the mistake. A different diff
answers the question that matters:

```
npx prisma migrate diff --from-migrations ./prisma/migrations   --to-schema-datamodel ./prisma/schema.prisma   --shadow-database-url "$SHADOW_DATABASE_URL" --script
```

That replays the whole history into a **throwaway** database and diffs the result against
`schema.prisma`. Empty output is proof that the hand-written SQL lands exactly the modelled schema,
**before any deploy and against no real environment**. Non-empty output *is* the drift, printed as the
SQL that would close it — so the failure hands you the correction.

**Two questions, two tools, and the names must not suggest one covers both:**

| | asks |
|---|---|
| `db:check-drift` | does the LIVE DATABASE match the model? |
| `db:verify-migrations` | does replaying every migration from empty PRODUCE the model? |

**Staging having drifted and staging's HISTORY being wrong are separate failures, and only the second
travels to production.**

*Why it bites hardest on this particular migration:* `20260828020000_url_assessment` is hand-written and
does three things where a typo yields a schema that **works but is not the one modelled** — a table
rename, an enum-to-text conversion, and a pair CHECK. The failure would be quiet: `verdict` ending up
`TEXT` in the database while the model said otherwise surfaces only when Prisma Client returns a value
its own types call impossible.

*The tool refuses rather than skipping.* Unset `SHADOW_DATABASE_URL` exits non-zero with the docker
one-liner, because a verification tool that silently does nothing when unconfigured reports success for
a check it never ran. It also refuses a URL naming either real project ref or any Supabase host —
identified by data in the connection string, not by trusting the caller — because Prisma **resets** the
shadow database repeatedly.

**NOT YET RUN.** The Docker daemon is not running on this machine, and starting it is the researcher's
call. The script and its refusals are proven; the verification itself is outstanding, and saying so is
the point — an unrun check is not a passing one.

#### RESOLVED: `UNCHANGED` — the status for "fetched, and deliberately not stored"

Found while writing the backfill; **decided before the backfill ran, deliberately.** `CdxEntryStatus`
was `STORED · UNSERVABLE · UNFETCHED`, and `UNFETCHED` means *"we have not fetched it."*

That misdescribed the largest group in this corpus. CDX holds **95** rows after its own
consecutive-collapse; we hold **83** captures. Of the ~12 without a capture, **eleven were fetched
successfully and not stored** — the non-consecutive reverts `recordCapture`'s text-level novelty rule
correctly dropped. Exactly one is the permanent 404.

**The reason it could not be deferred with a note.** Leaving them `UNFETCHED` would write eleven rows
already known to be wrong, and *"which entries have we never looked at"* would return eleven false
positives. **A note in a plan does not protect a query** — the note is not in the result set. Correcting
known-wrong rows afterwards is the shape of work this whole rebuild exists to stop creating, so the
enum value landed first and the rows were written correctly the first time. The migration had not been
applied anywhere, so the value was added to it rather than shipped as a follow-up `ALTER TYPE`.

**The name is not new.** `RecordedCapture.outcome` is already `CREATED | UNCHANGED | EXISTS`, and
`UNCHANGED` there means precisely this: identical to the immediately preceding capture, so no new row.
Reusing the word means someone meeting it in either layer learns **one concept rather than two**, and it
ties the index entry to the write path's own vocabulary.

##### The hazard that came with it, and a mutation that had to be re-aimed at nothing

**On an `UNCHANGED` outcome `recordCapture` returns the PRECEDING capture's id** — that is what
UNCHANGED means. Marking the entry `STORED` with that id would attach it to a capture it did not
produce, so *"which capture came from this index entry"* would be wrong for exactly the rows the status
exists to describe.

*The branch was written correctly and covered by nothing.* Forcing the `STORED` path on an `UNCHANGED`
outcome **survived all 45 tests**, and it compiled cleanly, so it had genuinely hit the code — the
survival meant a hole, not a misfire. A test now asserts the entry is marked `UNCHANGED` with no
`snapshotId`, and the mutation fails.

**Second time in two days a mutation survived against code that had just been written by the same
session.** Both were found only because the refactor or the new branch was mutated rather than merely
run. *Mutate what you just wrote, not only what you are about to change* — a behaviour-preserving change
also preserves whatever the tests failed to pin.

##### A known gap, named rather than built

There is a **second** "fetched but not stored" case with no status: `recordCapture` refusing a capture
whose document is empty. That is a **failure**, not a decision, and collapsing it into `UNCHANGED`
would be the same conflation one step further down.

**It has never fired.** No status is pre-built for it — *let real examples drive code*, which this
project has already learned the expensive way twice with hard-coded bounds. Recorded here so that if it
ever does fire, the answer is a new status rather than a shrug into `UNFETCHED`.

##### `UNCHANGED` is a JUDGEMENT, so it records what it was judged against

Three of the four statuses are **facts** and stay true: a row exists or it does not (`STORED`), the
Archive serves it or refuses (`UNSERVABLE`), we looked or we did not (`UNFETCHED`). **`UNCHANGED` is the
odd one out** — it means *"its text equals the capture immediately preceding it"*, which is a judgement
relative to a corpus state. Store a capture between those two timestamps and the predecessor changes,
and the verdict may no longer hold.

Not hypothetical in the direction that matters: **the Archive can back-fill an OLDER capture**, which is
precisely the case that would invalidate a neighbour's verdict silently.

`comparedToSnapshotId` answers it — §3 applied verbatim, *record what the verdict was computed against*,
and the same discipline as `sourceStateHash` on trajectory computations. Without it the system would
carry exactly one verdict that can quietly stop being true. The parameter is **required**, so the
provenance cannot be omitted by a caller.

*Two mutations, and the second is the more instructive:* dropping the column from the write kills two
tests. **Passing the WRONG id survived** — because the recorder's test asserted the value it was
*given*, while nothing asserted which value the scraper *passed*. Asserting a field is populated is not
asserting it is right, which is the bag-assertion lesson in a new costume. Now pinned to the actual
predecessor.

#### Technique worth naming: make the field REQUIRED first, and let the compiler enumerate the callers

`getSnapshotsList` gained `trackedUrlId` as a **required** parameter rather than an optional one, and
the compiler immediately named all three call sites — including the pre-tracking relevance probe in
`forensicsRoutes`, which nothing would have reminded anyone about.

That is the type system used as a **search tool rather than a formality**, and it is the same move as
the `documentHash` source scan performed at compile time instead of test time. The optional version
would have compiled everywhere and silently recorded nothing on the path that had not been updated —
which is how "records sometimes" becomes a rule with two implementations.

**Generalised:** when adding a field that must not be forgotten, make it required first, read the
compiler's list of callers, and only then decide which of them genuinely warrants a different path. Here
exactly one did, and it became `probeSnapshotsList` — *named* for recording nothing, because there is no
`TrackedUrl` for an observation to belong to.

### Level 3 — the anchor

**STATUS: CLOSED, 2026-08-30, IN BOTH ENVIRONMENTS — clause 2 was already closed; clause 1 is PROVEN BY EXECUTION rather than by fixtures. Staging `VERIFIED 7 · MISATTESTING 22 · UNATTRIBUTED 91`; production, after the ship, `VERIFIED 8 · MISATTESTING 83 · UNATTRIBUTED 0 · STALE 0`, exit 5 in both (correct — the legacy corpus is unsuperseded, which is Level 10's). ONE THING IS STILL TRUE OF PRODUCTION AND WORTH KNOWING: it has never exercised the WRITE path, because it has no novel capture to do it with — its 8 VERIFIED are evidence rows and its 83 captures are legacy. The rule, the instrument and the audit arm are correct there; the flip will be demonstrated on production's next novel capture. Attributing LEGACY anchors remains explicitly NOT part of this level — see the boundary below.**

#### SHIPPED 2026-08-30 — `master` at `6535948`, and the migration applied

The spelling fix and the normalising migration reached production in one deploy. The pre-deploy step
reported `All migrations have been successfully applied` before the new version served, so the split
state — normalised rows against old code — lasted only the length of the deploy and nothing ran in it.

**The audit afterwards matched every prediction, including the one held loosely.** `STALE 0`: the
normalisation moved no production claim, exactly as on staging, where the same prediction had been
made and *wrongly doubted*. The 8 evidence rows were untouched throughout, because `readOnChainClaim`
returns on the `Evidence` row before it consults `capturesAnchoredBy` — which is why the evidence arm
worked all along while the snapshot arm could not.

**The public integrity board still scores this level 50%, and that is correct rather than a
contradiction.** A level scores its WEAKEST invariant: `forensics:confirm-anchors` last ran at
`7740e11`, and its code moved in `3c0e639`, so the `anchoredHash` values in BOTH environments were
confirmed by pre-fix code. The claim is closed; the proof is partial, and the board is the thing that
says so out loud.

#### THE POSITIVE CONTROL RAN 2026-08-30, AND FALSIFIED THE PREDICTION

Full record: **`docs/gf-positive-control-2026-08-30.md`**.

Seven captures of a newly tracked page were stored, anchored under `documentHash` in seven distinct
transactions with zero twin reuse, and confirmed against Base Sepolia by receipt — `examined 7,
confirmed 7, exit 0`, with no observed hash equal to any row's `contentHash`. **The chain writes are
correct.** The audit then reported `VERIFIED 0 · STALE 7`, not the predicted `VERIFIED 7`.

**The cause is a spelling divergence in one column.** `claimAnchor` writes `anchoredHash` as bare hex;
`confirmAnchors` writes the log's `fileHash`, which ethers returns `0x`-prefixed. `capturesAnchoredBy`
strips `0x` from its argument and compares against the stored value literally, so a confirmed row
matches neither arm. `readOnChainClaim`'s snapshot count then falls 1 → 0, `onChainSourceStateHash`
moves, and the write-time verdict goes STALE. Three consequences: **`VERIFIED` is unreachable for any
capture**, the twin lookup is blinded (FINDING 41's shape), and the `ORPHANED_ANCHOR` regression is
armed.

Production's 8 `VERIFIED` evidence rows were never affected because `readOnChainClaim` returns on the
`Evidence` row before consulting `capturesAnchoredBy`. **The evidence success arm works; the snapshot
success arm has never fired because it cannot** — which explains, with a cause, an asymmetry previously
recorded only as an observation.

**No test could have caught this.** Nine repaired fixtures and a simulated-flip test all pass, because
each spelling is internally consistent within its own writer. The divergence lives in the seam, and
only a real execution crosses it. **Quote this the next time a positive control looks expensive.**

*What closing the clause required:* one spelling owned in one place; a test that crosses the seam
rather than exercising either writer alone; the seven checks re-recorded; the audit re-run to
`VERIFIED 7 · MISATTESTING 22 · UNATTRIBUTED 91`, exit 5.

##### CLOSED THE SAME DAY — and the re-record turned out to be unnecessary

`storedAnchorHash` is now the single normaliser, returning a branded type only it can produce, so a
raw string cannot reach either write site. A data migration normalised the existing rows. Landed as
`3c0e639`; the first deploy stalled between a successful pre-deploy and its start command and was
redeployed as `863cd928`.

**The audit then read `VERIFIED 7 · MISATTESTING 22 · UNATTRIBUTED 91`, exit 5** — the target exactly.

**One prediction in the fix plan was wrong, and it is worth keeping wrong here.** The 22 legacy rows
were expected to flip to `STALE`, on the reasoning that normalising *their* `anchoredHash` moved
*their* claim too. They stayed `MISATTESTING` and `STALE` came out 0, so
`forensics:backfill-anchor-checks` was never run. The migration alone was sufficient — the write-time
verdict encoded `snapshots: 1`, and normalisation restored precisely that.

**`exit 5` is still correct and must remain.** 113 legacy subjects are unsuperseded; that is Level 10's
and no part of this level.

#### THE BOUNDARY, drawn 2026-08-30: legacy anchor attribution is Level 10, not clause 1

`anchoredHash` records what a row's transaction registered, and `forensics:confirm-anchors` observes
it from the chain. On staging that pass confirms **22 of 113** subjects and reports the other **91** as
`TX_UNREADABLE`: the registry holds every one of their hashes, so the anchors are real, but the
transactions predate the RPC's receipt retention (a clean date boundary — everything stored
2026-08-22 unreadable, everything stored 2026-08-28 readable) and a log-based fallback resolved none.

**That is where it stops.** Four runs and four commits went into attributing those 91, and none of it
touched a defect that can recur: a new capture's receipt is read seconds after the write. The log
fallback has no other caller, and §1 of this plan asks only that the legacy corpus be *kept as a
comparison* — comparison does not require attribution. Re-anchoring the legacy corpus is this
document's Level 10, and it always was.

`TX_UNREADABLE` is therefore the terminal, honest answer for those rows, and the general rule is now
in `CLAUDE.md`: **fix what future state needs; do not invest in repairing legacy state** — with the
narrow carve-out that legacy state making a FALSE claim is not archaeology.

**CLAUSE 1'S CODE IS DONE (2026-08-30).** `anchoredCaptureHash` returns `documentHash`; every new
capture is anchored to the payload as served. One line, which is what the single-symbol consolidation
was for — and the compiler and the fixtures between them found every site that had to follow.

**The cost was decided on a measurement rather than an intuition.** Twins are what made snapshot
anchoring cheap, and under `documentHash` they go nearly extinct: 105 staging captures collapse to
**15** distinct `contentHash` values and **104** distinct `documentHash` values, so anchoring now
costs roughly **one transaction per capture, permanently**. Measured price: **144,875 gas** per
registration, and Base mainnet at 0.006 gwei makes the whole 104 about **0.00009 ETH** — cents.

Merkle batching was considered and REJECTED. It would restore cheap anchoring by making an outsider
need a proof from us plus a script, and a lost proof produces exactly the unexplainable anchor
Level 10 forbids: cheaper transactions, more expensive truth. A batch boundary is also a cap decided
at write time and invisible in the output, which is the family §2 already counts three of. The twin
collapse was never a saving either; it was 15 hashes standing in for 104 documents — the defect
restated as an optimisation.

**What remains for the level to close:** every legacy capture now attests a superseded hash, so once
their anchors are confirmed the audit reports them `MISATTESTING` — never `VERIFIED`, exit 5. That is
correct, and superseding them is Level 10's, per the boundary above. Whether EVIDENCE identity follows
the anchor is §2's decision and remains the researcher's.

The audit already refuses to call the result done prematurely: a row whose anchor attests a hash the
current rule does not name is `MISATTESTING`, never `VERIFIED`, and the script exits 5. After the flip
every legacy capture lands there — visible, non-passing, and Level 10's to supersede.

*Invariant:* the on-chain record attests to the document, and the database's claim about it is checked
rather than asserted.

*Enforcement:* anchor `documentHash`; run `check_on_chain_status` automatically on the write path and
record the verdict. Never a rule a human must remember.

#### STATUS 2026-08-29 — clause 2 is CLOSED, clause 1 is OPEN. The level is NOT done.

**The invariant is two claims joined by "and", and only the second one is built.** They were closed
apart, they can be measured apart, and the danger is that the measurement for the second reads as a
verdict on the whole.

**Clause 2 — "the database's claim is checked rather than asserted" — DONE and verified.**
`recordOnChainCheck` runs on every write path and stores its verdict in `IntegrityCheck`;
`auditOnChainAnchors` reports coverage and exits non-zero on anything that is not a current pass. Since
`a790c0b` a verdict also records the chain and registry it was reached against, and a verdict that
names neither is `STALE` rather than a pass. Both environments, in-container, exit 0:

| | subjects | VERIFIED | STALE | checks | superseded | not naming their chain |
|---|---|---|---|---|---|---|
| production | 91 | 91 | 0 | 182 | 91 | 91 |
| staging | 113 | 113 | 0 | 226 | 113 | 113 |

**Clause 1 — "the on-chain record attests to the DOCUMENT" — NOT DONE.**

What actually reaches the chain is `toBytes32(contentHash)` (`anchorSnapshots.ts`), and `contentHash`
is `SHA-256(fullText)` — Readability's *article*, not the page. The schema has said so plainly the
whole time: *"the only hash anchored today"* on `contentHash`, and *"Integrity, and where the anchor
moves at Level 3"* on `documentHash`.

So today's anchor attests to an **extraction that discards ~31% of the page, hrefs among it** — and
this platform's central finding is that a reporting-channel LINK was removed. The one layer the anchor
cannot currently speak for is the layer the thesis turns on. `documentHash` exists, is `NOT NULL` on
every row since `20260827180000`, and is never registered.

**Do not read a clean anchor audit as Level 3 being done.** The audit measures whether every anchoring
claim carries a current, chain-stamped verdict. It is silent on *what was anchored*, and it would stay
green if the answer were a hash of the page's title. That is the same shape as `db:check-drift`
reporting "No difference detected" about a database that had just lost every row: an accurate fact
about the axis you checked, read as proof about the axis you didn't.

**What closing clause 1 costs, so the decision is made with the price visible:**

1. **New chain writes.** Every capture would need re-registering under `documentHash`. The existing
   `contentHash` registrations stay on chain forever and are superseded, never removed (Level 10).

   *Corrected 2026-08-29: an earlier version of this line said "chain writes are MCP-only". That is
   wrong for this operation. `CLAUDE.md`'s MCP-only rule names research acts — `promote_evidence`,
   `promote_scan_findings` — and its hazard was a LAPTOP with a partial env file. A re-anchoring pass
   is MAINTENANCE, and this plan already rules on where maintenance runs: "**Maintenance, so it runs in
   the deploy container (`railway ssh`) — never a laptop, never MCP — which also keeps its chain writes
   on the correct registry**" (Instrument 1, `forensics:recover-captures`). The split is research act
   versus maintenance act, not chain-write versus not.*
2. **A decision about evidence identity, which is the larger half.**
   `forensicEvidenceFileHash = sha256(url + before.waybackTimestamp + before.contentHash +
   after.waybackTimestamp + after.contentHash)` — the extraction is baked into the identity of every
   evidence record, not only into the anchor. Moving the anchor without moving identity leaves the two
   attesting to different things; moving both changes the `fileHash` of already-anchored, CONFIRMED,
   publicly cited records.
3. **A re-audit afterwards**, since every stored verdict is about the hash it judged.

None of that is a repair, and none of it is mine to decide: it changes what the chain of custody
asserts. Recorded here so the next person does not close this level on the strength of a green audit.

### Level 4 — the view

**STATUS: DEFERRED (2026-08-29) — rationale falsified by measurement in `d4739aa`. It needs a CONSUMER FOR THE MARKS, not code. Do not revive without new measurement. THE NEW MEASUREMENT NOW EXISTS (2026-08-30) — see below; the deferral is ready to be reconsidered and that is the researcher's call.**

#### THE MEASUREMENT THIS DEFERRAL ASKED FOR — a news page, 2026-08-30

Full record: `docs/gf-positive-control-2026-08-30.md`. The Level 3 control added
`https://news.walla.co.il/item/3403847`, the **first news page this corpus has ever held**. Government
pages carry no ad slots; this one does, and the difference is not marginal:

```
6 diffs · 22 items · 24 chunks checked · significantDiffs 0 · contradictedDiffs 3
```

| item category | count |
|---|---|
| promotional links | 12 |
| section headers (`NEWS`, `עוד בוואלה!`, `אל תפספס`) | 4 |
| date / timestamp metadata | 4 |
| video-caption punctuation | 2 |
| **items changing article wording** | **0** |

The article did not change between 2020-12-09 and 2025-03-26; the advertising changed seven times. The
only item with any investigative flavour is the removal of the navigation tag `משרד הבריאות`.

| corpus | contradicted | rate |
|---|---|---|
| production (government pages) | 2 of 13 | 15% |
| staging (government pages) | 4 of 15 | 27% |
| **this news page** | **3 of 6** | **50%** |

One of those three consists of nothing but two rotating ad links and still produced a pipeline-defect
verdict. **The deferral was calibrated on a corpus of one page type.**

**This is not the forbidden move.** That move was widening `segmentsOf` to silence the detector. Level 4
acts on the CLAIM rather than the CHECK, and marks rather than deletes — so chrome leaving the diff is
not a contradiction count driven to zero by redefinition.

*Also measured:* all seven captures produced seven distinct `documentHash` values **and** seven distinct
`contentHash` values. Readability keeps this page's caption, timestamp and promo text, so on a news page
**cost scales with ad rotation under either anchoring rule** — the twin-collapse argument is not the
whole story, and "the document changed" stops implying "the page changed".

*Invariant:* no block unique to a capture is ever classified chrome; the view is versioned and marks
rather than deletes.

*Enforcement:* corpus-derived classification along the time and/or space axis, storing
`boilerplateVersion`, `sourceStateHash` and **the observation count behind each judgement**.

*Known hard case, not solved:* **changing chrome** — `createEvidenceFromUrl.ts` records a live visitor
counter on this same domain that differs every fetch, so frequency reads it as content. Marking rather
than deleting is what keeps this affordable.

#### DEFERRED 2026-08-29 — this level's RATIONALE was falsified by measurement

**This section previously claimed Level 4 was the fix for the contradicted diffs, and set
`CONTRADICTED → 0` as its acceptance test. Both were wrong, and the excerpts say so.**

Every contradicted excerpt in both environments was classified by mechanism before anything was built:

| mechanism | staging (n=31) | production (n=14) |
|---|---|---|
| **RIDER** — an unchanged sentence carried inside an edited paragraph's chunk | 12 (39%) | 10 (71%) |
| **MOVE** — a paragraph relocated on the page | 15 (48%) | 1 (7%) |
| **EXTRACTION** — Readability kept a block in one capture and dropped it in the other | 4 (13%) | 3 (21%) |

Only the EXTRACTION column is Level 4's target: **13% and 21%**, not the whole. 14 of staging's 15
moves are one rtmag article restructured between August and October 2022.

**Replacing the diff input with a corpus-derived view makes the corpus WORSE.** Measured across all 103
staging diffs, every variant with the granularity fix already applied:

| diff input | CONTRADICTED | real changes lost |
|---|---|---|
| `fullText` — unchanged | **4** | **0** |
| `text`, raw | 19 | — |
| `text`, block-normalised | 10 | 2 |
| `text` + chrome in ≥100% of captures | 9 | 1 |
| `text` + chrome in ≥95% | 9 | **29** |
| `text` + chrome in ≥80% | 10 | **84** |
| corpus-stabilised extraction (kept anywhere → content everywhere) | 5 | 2 |

Two structural reasons:

1. **`text` includes chrome, and chrome repeats.** A nav label sits in the header *and* the footer, so
   removing it from one leaves it present in the other — which Level 5 correctly reports as a
   contradiction. Sentence refinement barely moves it (21 → 19), confirming these are repetition hits
   rather than riders.
2. **Frequency filtering causes the invisible edit — now with a number on it.** A block held for 80 of
   83 captures and then genuinely removed scores 96%. At a 95% threshold it is classified chrome,
   filtered from every view, and **the removal disappears**. That is 29 real changes lost on staging
   alone, and 84 at 80%. This section already named that hazard as *known, not solved*; the measurement
   is the argument against every filtering variant, permanently.

**What survives, and what it costs.** The invariant is still right, and the plan's own safety clause is
the resolution: the view **MARKS, it never DELETES**. Every variant above deletes. A marking-only Level
4 — corpus-derived classification stored with its observation count, used to LABEL chunks — satisfies
the invariant at zero measured harm, and it clears **zero** contradictions.

**So it is deferred until something reads the marks, and deferring costs nothing.** Marking-only does
not touch the diff input, so landing it later needs **no second recompute cascade** — the bundling
argument that would have justified building it now does not apply. Building it before it has a consumer
would be marks nobody can see: the SPN-machinery shape reverted on 2026-08-21, and the
verdict-nobody-reads shape corrected in Level 5 step 4.

> **The lesson is about the plan, not the level.** `CONTRADICTED → 0` was asserted from this document's
> reasoning rather than from the excerpts, and it would have bought a full cascade on both corpora to
> discover a 13% mechanism. **Classify every instance before building the remedy** — the classification
> cost minutes and changed the whole shape of the work.

### Level 5 — the diff

**STATUS: ENFORCED in both environments**

*Invariant:* a change the platform reports survives the documents. A chunk said to be REMOVED is absent
from the after document; a chunk said to be ADDED was absent from the before one.

*Enforcement:* the check runs at write and stores a verdict. **A `CONTRADICTED` diff is written, not
refused** — refusing it would delete the evidence that the pipeline is wrong, which is how this was
found. It is simply never promotable.

##### TWO GAPS FOUND 2026-08-30, neither of which licenses coarsening the check

**`relocated` is never consulted.** The classifier marks an item `relocated: true` when text moved
rather than being removed — three such items in one fresh diff. The identifier appears nowhere in
`src/lib/diffSurvival.ts` or `src/services/computeDiffSurvival.ts`. By this level's own reasoning —
*"the stored artifact asserts to a researcher…"* — such an artifact asserts relocation, not deletion,
so contradicting it tests a claim the record does not make. **It is not a complete explanation:** a
second fresh diff contradicts with every item `relocated: false`, so another mechanism exists and has
not been named.

**`survivalContradicted` cannot be read from outside the database.** This level justifies the column as
*"what disagreed — §3's pipeline-defect record, not just a count"*. `forensics:audit-survival` prints
verdicts and never excerpts, no MCP tool exposes it, and the UI shows only the `1/5` ratio. **A
pipeline-defect record nobody can read is a count wearing a record's description** — and it is why the
mechanism above could be narrowed but not named. Printing the excerpts under `--verbose` is the whole
fix.

*Context for both:* the fresh contradictions came from a news page whose every detected change is
chrome. See Level 4's 2026-08-30 measurement — the contradiction rate there is roughly double the
government-page rate, and it is chrome-driven.

#### NOBODY MAY CLOSE A CONTRADICTION BY COARSENING THIS CHECK

**Written 2026-08-29, after the rider mechanism was measured and fixed at its source.**

The pipeline used to CLAIM at block granularity while this level TESTED at sentence granularity, so a
four-word edit re-emitted its whole paragraph as REMOVED and every unchanged sentence inside it was
found, correctly, in the after document.

**Those contradictions were true positives.** Whatever the differ intended at chunk level, the stored
artifact asserts to a researcher that a 155-character paragraph was deleted when four words changed —
and that the unchanged sentence inside it was removed. It was not. That is real over-reporting about the
one page this investigation rests on, and Level 5 was detecting it.

So the fix went to the **claim**: `sentencesOf` in `lib/textSegments.ts` is now imported by the differ
and by this checker alike, so a change is claimed at the granularity it is checked at and the two cannot
drift apart again.

> **The forbidden move.** Widening `segmentsOf` back to whole-chunk matching would drive the
> contradiction count to zero while the record went on asserting a deletion that never happened. That
> silences the detector rather than the defect — **and it would look like progress**, because the only
> number anyone reads would improve.

This applies to every contradiction still standing. **A written mechanism for each survivor is a better
state than a zero**, and a zero obtained by redefinition is worse than the 4 and 2 that remain. If the
contradiction count ever falls without a corresponding change to what the pipeline claims, the question
is *which rule moved*, not whether to update the number.

#### STEP 2 DONE 2026-08-28 — the check runs at write and its verdict is stored

`checkDiffSurvival` in `src/lib/diffSurvival.ts` is **one implementation with two callers**:
`measureExtractionDivergence`, which already did this as a measurement, and `recordDiff`, which now does
it at write. Copying it would have been one rule with two implementations — and here the two copies
would be *the definition of a contradiction*, so any drift between them would mean the measurement and
the enforcement disagreed about what the corpus contains.

*Pure by construction:* no Archive, no model, no network. That is what makes an invariant affordable at
write time instead of as a script somebody remembers to run.

**Stored with what it was computed under**, which is the condition that makes running Level 5 ahead of
Levels 3 and 4 safe:

| column | why |
|---|---|
| `survivalVerdict` | `SURVIVES` · `CONTRADICTED` · `UNCHECKABLE` |
| `survivalSourceStateHash` | SHA-256 over the two captures' `textHash` — §3's staleness discipline |
| `survivalTextVersion` | the hash says the text MOVED; this says which rule produced it |
| `survivalContradicted` | **what disagreed** — §3's pipeline-defect record, not just a count |
| `survivalChunksChecked` | the denominator, so a verdict of SURVIVES over zero chunks is visible |

Without the hash and the version, Level 4's change to what counts as chrome **silently invalidates every
Level 5 verdict while all the counts stay green** — the exact shape this plan descends from.

##### `UNCHECKABLE` gained a real reason to exist

Making the capture pair `NOT NULL` in step 1 removed the case `UNCHECKABLE` originally covered — a diff
referencing no capture. It now covers a different one that can genuinely occur: **the two captures were
extracted under different rules**, so a presence test across them compares text that was never
comparable.

That is a verdict about the CHECK, and it is kept out of both `SURVIVES` and `CONTRADICTED`. Reporting
it as either would be an unavailable check counting as a result, which is the failure §3 exists to
prevent. *Mutation-proven:* removing the version comparison makes a mixed-version pair report
`CONTRADICTED`, and the test fails.

##### The verdict is computed against STORED text, deliberately

`recordDiff` re-reads both captures rather than taking the text from its caller, which has it in memory.
**A verdict must be re-derivable from stored state, so it has to be computed against stored state** — one
computed from in-memory text would carry a `sourceStateHash` that nothing could reproduce. The cost is
one indexed read per diff.

*Carried, not endorsed:* the presence floor is `PRESENCE_FLOOR_CHARS = 40`, the same
length-as-significance assumption as `MIN_CLAIM_LENGTH`. It is now a named constant with its
justification attached, so removing it at Level 6 is one edit rather than a hunt for literals.

*Also at this level, added 2026-08-27:*

- **A diff is uniquely identified by the pair it spans — DONE 2026-08-28.**

  *Two corrections to what this line used to say.* It said diffs are written across **six** call
  sites; there were **eight**, all in `WaybackScraper.ts`. And a later reading of it claimed
  `beforeSnapshotId` / `afterSnapshotId` **do not exist** — they did, as nullable FKs with
  `BeforeSnapshot` / `AfterSnapshot` relations. What was missing was any constraint at all: the model
  carried no `@@unique` and no `@@index`.

  **Identity is the capture pair, and that was decided by measurement rather than preference.** Both
  environments hold a date pair spanning two *different* transitions:

  ```
  2022-05-03 -> 2022-05-03    20220503051621 -> 20220503102648
                              20220503102648 -> 20220503165508
  ```

  Three captures on one day, two consecutive diffs, one date pair. **Keying on dates collapses them and
  discards a real transition** — and it discards precisely the same-day revert material
  `recordCapture`'s novelty rule exists to preserve. That would be Level 1's defect one layer up.

  *Safe on the existing corpus, measured before writing the migration:* **81 of 81 diffs have both
  snapshot ids populated, and 0 duplicate groups under the pair — in BOTH environments.** So the
  constraint applies to what is already there, untouched.

  **`recordDiff` is the one writer**, upserting on the pair so a rescan **converges** instead of
  accumulating, guarded by `test/diffSingleWriter.test.ts` — a source scan, because a behaviour test
  covers only the paths someone thought to test and a ninth call site is covered by nothing.

  **Both ids are NOT NULL**, because a diff whose captures we do not hold is *unverifiable by
  construction*: Level 5 checks a reported change against the documents, and there would be none. The
  gap is not lost by declining to write such a row — it lives at the capture layer, where
  `CdxIndexEntry` records `UNSERVABLE` / `UNFETCHED` as first-class queryable state.

  *A guard that had to be moved rather than added:* the first version skipped a missing-pair diff with
  `continue`, which would have skipped the loop tail — `processedCount++` and the job progress write —
  so a capture would be stored while the job reported no progress for it. It is the first branch of the
  existing if/else chain instead.

  *The FK became `ON DELETE RESTRICT`*, where an optional relation had `SET NULL`. Worth stating rather
  than passing as generated boilerplate: deleting a capture a diff depends on is now **refused**, where
  before it would have quietly nulled the pair and left a row nothing could check.

  ##### OPEN FOR REVIEW — the tightening made 18 guards dead, and they were NOT deleted

  Lint moved **363 → 381**, every one `no-unnecessary-condition`, concentrated in four diff-readers:
  `measureExtractionDivergence` (9), `forensicsRoutes` (4), `rediffFromSnapshots` (4),
  `evidenceRoutes` (2). They are the `UNCHECKABLE`, `unlinkedDiffs` and `refusedDiffIds` branches —
  guards for a case the constraint now makes impossible.

  **They were kept deliberately.** This document already records that *the linter argues from types
  that do not describe runtime reality*, and that deleting guards to satisfy it is how `extractHrefs`
  nearly began returning empty strings. Here the type is enforced by a constraint that **ships with this
  code but is not yet applied**, and operational scripts (`forensics:rediff`,
  `forensics:measure-divergence`) run locally against real environments *outside* the deploy ordering
  that guarantees migrations land first.

  Deleting them is defensible once the migration is applied everywhere; doing it in the same change that
  introduces the constraint is not.

  ##### RESOLVED — the intention became a condition

  *"Settle it in step 2, which is the natural moment"* was **a plan to remember**, and this document's
  own hierarchy puts that at the bottom. Worse, the entire record of a deliberate decision was a number
  in a session summary: `npm run lint` is `eslint src/` with **no `--max-warnings` and no baseline**, so
  363 → 381 was tracked by nothing. The next reader sees 381, cannot tell 18 deliberate guards from 18
  accidents, and **the honest reading of a raw count is that the debt grew.**

  So `no-unnecessary-condition` gets the treatment `noUncheckedIndexedAccess` already has:
  `noUnnecessaryCondition.baseline.json` plus `test/noUnnecessaryConditionRatchet.test.ts` — per file,
  can only go down, with the same three properties and the same mutation proofs.

  **The baseline carries the reasoning, not just the numbers.** It names the migration, says why the 18
  were kept, and states the condition for removing them: *when `20260828120000` is applied in every
  environment — checked against the `_prisma_migrations` ledger, not the deploy status — set those
  files' entries to 0.* The ratchet then reports a **REGRESSION** until the dead branches are actually
  removed. **That converts "delete them later" from an intention into a checkable condition**, and it
  stops 381 becoming the new floor by default.

  *A hazard found in the tool by mutating it:* renaming the rule constant made every file report zero,
  which the improvement arm reported as **progress** — and its remedy, "regenerate the baseline", would
  have baked in zeros and disabled the check permanently. **A suggested fix has to be safe when the
  diagnosis is wrong.** A wholesale collapse now throws instead of offering it.

  *Scope note:* the ratchet is project-wide (51 across 18 files), not scoped to the four diff-readers,
  so growth anywhere is caught. Only 18 of the 51 come from this migration; the rest is pre-existing
  debt, **bounded here rather than endorsed**.
- **Level 5 opens by re-pairing the diff layer** after Level 1's capture recovery: **7** existing diffs
  are stale (they span captures no longer consecutive) and **18** new pair-rows are needed. Deferred
  here deliberately so the classifications are paid for once, verified — see Level 1's boundary note.
  The 7 are safe to leave unmarked because none is legally significant and none backs an evidence
  record; `CONTRADICTED` is the mechanism that supersedes them, so no bespoke marker is added.

*Note:* `measureExtractionDivergence` already implements this check as a measurement; Level 5 is the
same logic moved to write time. **Granularity is not a detail** — whole-chunk matching found 2 of 81
and missed the case this work exists for; sentence granularity found 7.

### Level 6 — the trajectory

**STATUS: PARTIAL — and the ROUTE IS NOW DECIDED BY MEASUREMENT (2026-08-30): take the FREE option first. `forensics:compare-candidate-sources` varied the candidate source, the axis `compare-detection-layers` held fixed, and found that SENTENCE CANDIDATES PRODUCE AN IDENTICAL TRAJECTORY SET AT THE DOCUMENT LAYER AND AT THE EXTRACTION — zero difference in both directions, 0 unmatched, on an arm that cannot pass by construction. The free option survives the renderer a stranger actually searches, so moving the differ is NOT load-bearing for outsider-verifiability. Two compute-only options exist (raw-chunk candidates ~115 findings, sentence candidates ~121) against a smaller increment for the API-spend option, and that ORDERING held across five instrument corrections while every individual figure moved. Measured numbers, the five corrections, and what is still unmeasured: `docs/gf-candidate-source-measurement-2026-08-30.md` — do not re-derive them here. SEQUENCING NOTE: a `DETECTION_VERSION` bump recomputes every trajectory, and Level 7 records 5 of 7 anchored records unrecomputable — compute-only is not the same as free of ordering cost, so Level 7's diagnostic comes first. The invariant (every reported flip confirmed against the documents at that boundary) is still NOT enforced, and the obvious route to it — moving DETECTION alone — remains CANCELLED BY MEASUREMENT: it loses 2 trajectories and gains 0. The run also produced a finding about the EVIDENCE rather than the pipeline: the verbatim probe has only ever been tested against the renderer it was born from, and 2 of 90 MOH claims are not findable by the outsider check this platform's value rests on. Read the section below before proposing any Level 6 work.**

#### THE FLIP IS A NET LOSS — measured 2026-08-30, `forensics:compare-detection-layers`

`compareDetectionLayers` detects twice over one candidate set and never persists. On the MOH page:

```
                    trajectories   unmatched   snapshots
  EXTRACTION             90            5          83
  DOCUMENT               88            7          83

LOST 2 · GAINED 0 · SHAPE CHANGED 0        exit 3
```

**Moving detection to `text` is strictly worse.** The prediction that preceded it — *lost 0, gained
> 0* — was wrong in both directions.

**The gain is ZERO BY CONSTRUCTION, not by accident.** Candidates are discovered from diff items, and
the differ runs on `fullText`. Every candidate is therefore a string the extraction already contained,
so searching a superset can only match the same ones or fewer. **The ~31% the extraction discards can
never produce a candidate, because the differ never sees it.**

That also reframes the instrument honestly: its gain arm was **not vacuous, it was NOT YET
ANSWERABLE**. It can only return "same or worse" while candidates come from `fullText` — `exit 0` would
have meant "no difference", never "gain". Moving the differ is what makes it capable of measuring what
it was built for, and re-running it afterwards is the payoff.

##### THE MORE IMPORTANT HALF: the two are FALSE NEGATIVES OF THE PROBE, not losses

```
3 transitions  בכל מקרה, אין סיכוי לחלות בקורונה בגלל החיסון…
6 transitions  תופעות הלוואי של החיסון…
```

The claims did not leave the page. **The string stopped matching.** Both are long multi-sentence
quotes, so the likely cause is `htmlToText` breaking them where Readability did not, and
`normaliseClaim` collapses whitespace only.

The first is **the exact claim this plan quotes** as its example of a load-bearing assertion — the one
used to justify retiring `MIN_CLAIM_LENGTH`. The second is one of the strongest oscillation patterns in
the corpus.

**A trajectory is a verbatim substring probe, and it has only ever been tested against the renderer it
was born from.** Candidates come from `fullText`; presence is tested against `fullText`. Same renderer
both sides, so matching is guaranteed by construction and had never been checked.

**The platform's evidentiary value is that a stranger opens the archived page and finds the string.** A
stranger searches the rendered DOM, which is closer to `htmlToText` than to Readability's article. So
**at least 2 of 90 claims may not survive the outsider check the whole platform rests on** — and
nothing before this run could have detected it. This is a finding about the EVIDENCE, and it is the
half that goes missing if only the cancellation is written down.

##### What this reprioritises

- **Diagnosing the two non-matching quotes is a PREREQUISITE FOR THIS LEVEL'S INVARIANT, not cleanup
  after a cancelled change.** Confirming a flip *against the documents* hits the identical probe, so the
  same two claims that failed to match will fail to confirm. Cancelling the detection move did not
  cancel that; it ruled out one route to it.
- **If the cause is whitespace and breaks, the fix belongs in `normaliseClaim`** — cheap, and it
  improves outsider-verifiability for every trajectory rather than for these two.
- **Moving the DIFFER to `text`** bumps `diffInputVersion` and re-classifies every diff — hundreds of
  model calls and real spend. That is a cost decision and the researcher's, not a technical step. It is
  also the only thing that unblocks the gain arm.
- **Moving detection alone is CANCELLED.** Do not revive it without moving the differ first.

##### DIAGNOSED 2026-08-30 — it is NOT whitespace, and the cheap fix is dead

Reproduced locally against the archived HTML, running BOTH renderers over identical bytes across eight
captures spanning 2021-12 to 2024-06. The two agree for **226 characters** (claim A) and **431–441**
(claim B) and then diverge at the same structural place every time:

```
fullText (Readability):  "• הודעות דוברות משרד הבריאות בנושא חיסונים…"
text     (htmlToText):   "קישורים למידע נוסף • הודעות דוברות משרד הבריאות…"
                          ^^^^^^^^^^^^^^^^^^ a section heading Readability drops
```

and in the 2021 capture, `text` additionally carries `לחזור למעלה` (back to top) and
`שאלון תופעות לוואי` (side-effects questionnaire).

**`htmlToText` retains section headings and navigation that Readability discards.** A stored claim long
enough to cross that boundary therefore has extra words inserted INTO THE MIDDLE of it in the document
layer, and the verbatim substring no longer exists. The divergence point being identical in all eight
captures makes this structural, not incidental.

**`normaliseClaim` cannot fix this.** It collapses whitespace; it cannot bridge inserted content. The
"probably whitespace, cheap normaliser fix" reading — held by both the author and the reviewer — is
falsified.

##### THE EVIDENTIARY CONSEQUENCE, which is worse than a renderer quirk

**The stored claim is a contiguous string the page never contained.** Readability stitched two passages
together across a heading it dropped, and the diff chunk preserved that stitching as one quote.

A stranger who opens the archived page and searches for that claim **will not find it** — not because
our probe is renderer-bound, but because *that exact sequence of characters was never on the page*. The
claim is an artefact of the extraction, presented as a verbatim quote. That is a defect in the
EVIDENCE, and it is invisible to every check the platform currently runs, because candidates and
presence are both taken from the extraction that produced the artefact.

##### THE FIX THIS POINTS AT IS ONE THIS REPOSITORY HAS ALREADY MADE ONCE

Both failing claims are long multi-sentence spans, and **their first sentences match in both renderers**
— `בכל מקרה, אין סיכוי לחלות בקורונה בגלל החיסון.` is 45 characters and identical in each.

Level 5 solved exactly this shape one layer down: the differ claimed at block granularity while the
check tested at sentence granularity, and the fix was `sentencesOf` in `lib/textSegments.ts`, imported
by both. **Trajectory candidates are still whole diff-chunk spans — the same defect in a second
subsystem**, which is this repository's dominant pattern.

Sentence-granularity candidates cannot span a structural gap, would survive the layer move, and — the
part that matters — would actually be findable by the outsider check.

**Not done, and not to be done casually:** it bumps `DETECTION_VERSION` and recomputes every trajectory.
Re-run `forensics:compare-detection-layers` against sentence candidates BEFORE paying for that, not
after.

##### CONFIRMED BY MEASUREMENT, and the stitch is visible in the claim itself

The span reading rested on both claims being longer than their divergence point.
`compareDetectionLayers` truncated `claimText` at 90 characters, so the first run could not settle it;
it now prints the length and the full text (`d6b6fda`). Re-run on staging:

```
claim A   352 chars   diverges at 226
claim B   567 chars   diverges at 431–441
```

Both exceed it, as predicted. **This is the third diagnosis of this phenomenon and the first confirmed
by measurement** — the first two, "partial captures" and "two document variants", were both wrong.

**The stitch is legible in the stored text.** Claim A ends:

> `…ולכן הוא לא יכול לגרום למחלה. • הודעות דוברות משרד הבריאות בנושא חיסונים > • ועדות מבצע החיסונים >…`

Body prose running straight into the link list, with the heading `קישורים למידע נוסף` — which sits
between them in the document — **absent**. There is no whitespace to normalise here; there is a missing
section heading. A reader searching the archived page for this claim finds nothing, because the page
never contained it.

**Claim B (567 chars) contains `לדיווח על תופעות לוואי >`** — the adverse-event reporting link, this
platform's central finding — embedded inside a stitched span. The clean 24-character version of that
claim has its own trajectory and is unaffected; but a second, artefactual claim covering the same
content also sits in the corpus, and only the first is citable.

*Invariant:* every reported flip is confirmed against the documents at that boundary.

*Enforcement:* verified at computation, verdict stored with `DETECTION_VERSION` and `sourceStateHash`.

#### THE HREF LAYER, MEASURED 2026-08-30 — and the instrument was broken the first time

**Run once, believed, and wrong.** `forensics:measure-href-changes` called `decodeDocument` without
`inflateDocument`, so every capture whose origin served `Content-Encoding: gzip` was read as compressed
bytes and yielded ZERO hrefs. Fixed in `77f1281`; `captureHtml` is now the only way to read a stored
payload and a source scan holds that nothing else spells the two-step decode.

| MOH page, 82 consecutive pairs | broken | **fixed** |
|---|---|---|
| pairs whose href set changed | 27 | **17** |
| invisible to the derived text | 12 | **2** |
| `https://t.me/MOHreport` flips | 13 | **0** |
| mass swings (≥15 links at once) | 10 | **0** |

**The adverse-event reporting channel was never removed** — not once, across 83 captures from 2021 to
2026. That entire signal was a gzip header. **A defective measurement is worse than a wrong verdict: an
audit can catch a verdict, and a plausible measurement is what a researcher builds a claim on.** This
one pointed straight at the platform's central finding. Full record:
`docs/gf-positive-control-2026-08-30.md`.

**What the href layer actually holds, counted in the INVESTIGATION'S window rather than the corpus's:**

```
changed pairs by year   2021: 1 · 2022: 11 · 2023: 2 · 2024: 1 · 2025: 2
within 2019–2022        12 of 17  (70%)
```

Two changes are invisible to every layer the platform reads — both link ADDITIONS whose anchor text did
not change, so a new destination was attached to existing words:

- **2022-07-08 `+ /daily-guidances/`** — inside the investigation window
- 2024-03-05 `+ /confirmed-cases-and-patients/risk-groups/` — outside it

*Recommendation, and the reasoning is the researcher's correction:* **record the href layer, do not yet
detect on it.** "Two in 82 pairs" is the wrong denominator — the investigation is about 2019–2022, where
70% of the activity sits. But two additions still do not make a finding stream, and building flip
detection on a layer this thinly exercised is precisely what produced the false measurement above.
Storing href sets per capture makes the question answerable later without re-deriving it.

#### A RESEARCHER PROPOSAL, RECORDED AND NOT SCHEDULED (2026-08-30)

**Tracked URLs should carry a date range, stored as part of the forensic record.** The corpus scope and
the investigation scope are not the same thing, and today only the corpus scope exists.

Two measurements from the same day show what it costs to conflate them. The FDA press page holds
**3,036 distinct-digest captures**, of which only a fraction fall in the period of interest — and
`start_forensic_scan` takes a URL and nothing else, so scanning it means 250 captures and 250 chain
transactions per call with no way to say which years matter. In the other direction, every rate this
platform reports is computed over the whole corpus, which understates density inside the window and
overstates it outside: 2 of 82 becomes a very different number once the window is named.

Storing `from`/`to` on the `TrackedUrl` makes the window an attribute of the record rather than an
argument someone remembers to pass — so a rate can be quoted against the scope it was gathered for.
**Not scheduled. Recorded here so it is not re-derived.**

*~~Carried forward~~ — DONE 2026-08-29, and this paragraph was stale until 2026-08-30:*
`MIN_CLAIM_LENGTH = 40` no longer filters trajectory candidates. `DETECTION_VERSION` v2 retired it for
the containment rule, `minClaimLength` defaults to **0**, and the constant survives only so
`forensics:measure-claim-length` can ask what the retired rule would have done — through this code path
rather than a copy of it. The reasoning that retired it stands and is worth keeping: a short claim can
be the load-bearing one, and "אין סיכוי לחלות בקורונה בגלל החיסון" is not long.

**Corrected while writing the section above it**, because a paragraph asserting a live filter that no
longer exists, sitting beside a new measurement, is the shape that produces a wrong recommendation from
a confident reader.

### Level 7 — the evidence

**STATUS: OPEN — clause 1 MEASURED 2026-08-30 on staging and it HOLDS for everything the instrument covers: `forensics:rehash-evidence` dry run examined 7, found 7 already current, 0 to rehash, so the “5 of 7 unrecomputable” figure below is SUPERSEDED. The instrument selects `NOT: { urlVersionDiffId: null }` — diff-derived evidence only — so `DOCUMENT` evidence has no recomputable identity and no check at all, and that is the class the currently published thesis cites. Clause 2 remains untested; no instrument exists. → `docs/gf-level-diagnostics-2026-08-30.md`**

*Invariant:* identity is recomputable from its captures, and a summary attributes nothing to a page
that the page does not contain.

*Enforcement:* recomputability asserted at write and audited standing — **5 of 7 anchored records were
unrecomputable on 2026-08-23**. Summary phrases checked against the capture they describe.

*Hard case, needs design before code:* the fabrication `לתסמינים קלים וחולפים בלבד` carries **no
quotation marks**, so quoted-span checking misses it entirely. Content n-gram checking needs an
explicit false-positive policy — a summary legitimately characterises as well as describes, and only
the second is checkable. A gate that cries wolf gets disabled.

### Level 8 — the opinions

**STATUS: OPEN — DIAGNOSED 2026-08-30, three defects confirmed on the MOH corpus: `get_forensic_timeline` returns TEN fields and none reaches `Evidence`; `aiSignificance` and `isLegallySignificant` sit in the same flat row at the same weight as the computed `addedItems`/`deletedItems`, so the invariant fails as a DATA SHAPE rather than as a sentence; and the boundary-stored-twice defect reproduces here, not only on the news page — a diff reports `2024-08-29 → 2025-01-11` where the corpus holds no 2024-08-29 capture and the true predecessor is 2024-03-05, overstating precision by ~177 days. The MECHANISM cannot be closed without exposing `beforeSnapshotId`’s date, which no tool does; exposing it is part of the fix. → `docs/gf-level-diagnostics-2026-08-30.md`**

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

*And the same flat select produces a second, sharper defect, found 2026-08-30:* **`UrlVersionDiff`
holds two representations of its own boundary** — the `beforeDate`/`afterDate` **String** columns and
the `beforeSnapshotId`/`afterSnapshotId` **foreign keys** — and nothing enforces that they agree.
`get_forensic_timeline` reports the strings. On the newly scanned news page it reports a diff
`2025-02-08 → 2025-02-19` whose before-capture **was never stored**; seven stored captures admit exactly
six consecutive boundaries, and the reported set substitutes that one for the real
`2024-05-20 → 2025-02-19`. **The platform displays a version boundary against a capture the corpus does
not contain, and the true interval is nine months wider.** That is worse than the gap `list_captures`
warns about, because it *overstates* precision rather than understating it. The direction is settled by
arithmetic; confirming it outright needs `beforeSnapshotId`'s date, which no tool exposes. The fix is to
derive the displayed dates from the captures rather than storing them a second time.

### Level 9 — the thesis

**STATUS: OPEN — and the invariant AS WRITTEN IS UNSATISFIABLE ON STAGING, measured 2026-08-30: no evidence record can be `VERIFIED`, because all 8 anchored records are `TX_UNREADABLE` — the registry holds every hash, the receipts are past the endpoint’s horizon, and that is terminal rather than a gap to close. A thesis published that day passed all 16 hard checks while citing one of them. Do not plan this level as “make theses cite VERIFIED evidence” until Level 10’s supersession provides records that can be. → `docs/gf-level-diagnostics-2026-08-30.md` · `docs/gf-published-thesis-fda-claim-2026-08-30.md`**

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

**STATUS: OPEN — two decisions already taken: supersede rather than delete, and only ever one registry. PROMOTED 2026-08-30 from tidy-up to LOAD-BEARING: with Level 9’s invariant unsatisfiable, supersession is the only route by which any thesis can ever cite VERIFIED evidence. The 91 legacy claims are now MEASURED rather than assumed — nothing is wrong with them, only the attribution is lost, permanently — and recording them as `TX_UNREADABLE` via `forensics:confirm-anchors --apply` is a PRECONDITION for supersession, since this level’s own argument is that an unexplained anchor is indistinguishable from a tampered one. Neither standing decision is contradicted. → `docs/gf-level-diagnostics-2026-08-30.md`**

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
| Level 1's criterion | two axes — external (`cdx.digest`) and internal (`sha256(document) == documentHash`), the second added after the first alone missed a corrupted integrity column in both environments |
| `archiveHttp` | error message fixed — `describeFetchFailure` names the cause rather than an irrelevant status |

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
