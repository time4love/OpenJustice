# Evidence flows — researcher · MCP · backend · chain

**How evidence is FOUND in the factual layer, end to end.** The factual layer's own flows are
`docs/gf-interaction-flows.md`, and every capture, diff and text version named here is one of its;
this document begins where that one ends, at an ACQUIRED capture, and adds nothing beneath it. The
reasoning is `docs/gf-architecture-target.md` §9 once these flows are signed off.

> **STATUS.** The TARGET flows, decided section by section with the researcher on 2026-09-03,
> starting from the four rulings of 2026-09-02. Identity (ruling 1) and content as a version
> (ruling 2) stand as ruled and are read here as the record's own name; creation outside the walk
> (ruling 3) stands; of the four human moments (ruling 4) two fell — confirmation, because
> evidence is no longer registered on chain (§5), and interval narrowing, because the case it
> handled is the re-walk's (§7) — and each section says where. What fell to the researcher's
> questions in this session: evidence as "a claim", the confirmation act and its chain write, the
> evidence surface as public, thesis-less promotion, argue-before-cite, Flow E4, supersession as
> a status, the legacy migration, and "one registry, forever". ⚠️ marks what does not exist yet.
> Nothing in the design is left OPEN: what is out of scope and what is verified by measurement
> are named as such in the last two sections, and the APPENDIX is the implementation contract,
> composed with the factual layer's A1–A5 and never restating them.
>
> **SCOPE. Wayback-based evidence only.** DOCUMENT evidence — a file, pasted text, a screenshot — the
> blocked-live-page fallback and whistleblower material are PARKED for their own discussion, and the
> one DOCUMENT record a published thesis cites is named in LEGACY, untouched.

---

## 1. WHAT EVIDENCE IS

**The corpus already holds the evidence.** Every ACQUIRED capture and every diff the walk wrote is
a fact about a page: byte-fixed, anchored as it was stored, recomputable by anyone holding the
archive. The walk stores only the moments a page moved, so what remains is not a haystack but a
timeline of real changes — and among real changes, which ones matter to the mission is a judgement
no walk and no model makes. **Evidence is a corpus record a researcher has PROMOTED: selected as
meaningful, given a rationale, attributed, and stood behind.** It is the record, marked — not a
claim beside it. The claim is the thesis's; evidence is what the claim rests on.

**A promoted record adds nothing to the page and everything about the selection:** who promoted
it, when, why, which version of its derived content they looked at, and whether they still stand
behind it. Its identity is the corpus record's identity, so recomputing it is checking that the
mark sits on the record it names.

```
corpus record   an ACQUIRED capture, or a diff the walk wrote at acquisition   maintenance act
promotion       a researcher selects a record as meaningful, and says why       research act
evidence        a promoted corpus record — the record, marked
```

**THE TWO KINDS**, one per kind of corpus record:

```
CAPTURE   one ACQUIRED capture, promoted.
          what the record already establishes:  this page held exactly these bytes at this
                                                timestamp.
          fileHash = CAPTURE_ID(c)              its own name, nothing new

DIFF      two consecutive ACQUIRED captures — PREDECESSOR and capture, the pair the walk
          diffed — and the diff between them, promoted.
          what the record already establishes:  between these two byte-fixed captures the page
                                                changed, and this is the change.
          fileHash = sha256(CAPTURE_ID(before) · CAPTURE_ID(after))
```

**Consecutive means consecutive among ACQUIRED captures**, never a pair of dates: a DIFF is one
`UrlVersionDiff`, so the interval it asserts is the interval the corpus holds (Level 8's boundary
defect is unmakeable here). **A DIFF needs neither endpoint promoted**: its name is composed from
the captures' own names, so a transition can be evidence while neither capture is.

**EVIDENCE IS PROMOTED IN LIGHT OF A THESIS. Ruled 2026-09-03.** Why is this capture important?
Why does this diff matter? Those questions have an answer only inside a claim a researcher is
trying to establish. A newspaper article quoting the ministry on safety is a page; a ministry
page losing a paragraph on adverse events is a change; **the thesis that at the same time the
ministry said one thing publicly and removed another quietly is what makes both of them
evidence.** Importance is a relation, and the relation is the thesis's.

So the RATIONALE belongs to the CITATION, not to the record: one evidence row per corpus record,
many citations, each carrying its own reason and role. The evidence row records that a researcher
selected this record and stands behind it; each thesis that cites it records why, for that thesis.
**Ruled 2026-09-03: the rationale lives on the mention** — `ThesisMention`, which today is an
index extracted from the thesis text, becomes the citation and carries it. Promotion names the
thesis it is made for, and there is no promotion without one — a record noticed with no thesis in
view is a corpus record, findable and notable, and becomes evidence the day a thesis needs it. A
thesis may exist before its evidence (framing exists for that) or be opened because of a diff seen
during a walk; the model asks only that promotion name it. **And the citation comes first. Ruled
2026-09-03:** a thesis version cites a corpus record by its name, and the argument is made on
that citation (§4) — so there is no state in which a thesis argued for a record it does not use.

**What is promoted is the case for a thesis, and the corpus is the counterweight.** Evidence
selected in light of a claim is by construction the claim's side. That is honest as long as it is
visible and as long as everything not selected stays reachable — which it does, because storage
is lossless and the walk keeps every real change. The critic's material is the corpus, never the
evidence table.

⚠️ As built, `promote_scan_findings` promotes every diff the classifier marked significant with
no thesis and no researcher's reason — the classifier selecting evidence — and the debate's
rationale is asked as "why this change is evidence", attached to the diff and to no thesis.
`ThesisMention` is an index extracted from the thesis text and carries no rationale.

**The classifier's significance is triage, never selection.** It orders what a researcher looks at
(Level 8: an opinion); only promotion makes a record evidence.

**Evidence is a table, keyed one-to-one to the corpus record it marks. Ruled 2026-09-03.** The
selection has a history of its own — argument, review state, withdrawal — that is never deleted;
legacy DOCUMENT evidence has no corpus record to hang on; and the one-to-one relation is itself the
identity, a cleaner invariant than a nullable column on the record.

⚠️ As built, `EvidenceType` is `DOCUMENT | FORENSIC_DIFF`, identity is over `contentHash` (the
Readability extraction), and `create_evidence_from_url` made evidence with no record beneath it.
The target kinds are `CAPTURE | DIFF` over the corpus record's identity. `DOCUMENT` is out of
scope and keeps its name.

---

## 2. IDENTITY — THE RECORD'S OWN NAME

**Ruled 2026-09-02, verbatim:**

```
CAPTURE_ID(c)              = sha256(url · c.waybackTimestamp · c.documentHash)
capture evidence fileHash  = CAPTURE_ID(c)
diff evidence fileHash     = sha256(CAPTURE_ID(before) · CAPTURE_ID(after))
```

**Three inputs, and none of them is derived.**

```
url                the page's name — the exact string the researcher surveyed (flows A1)
waybackTimestamp   the capture's name in the archive — 14 digits, unique per page (flows A1)
documentHash       SHA-256 of the bytes AS SERVED — the hash the walk anchors on chain at
                   acquisition (flows A2; `anchoredCaptureHash` is its one name in src/)
```

A CAPTURE_ID binds the archive's name for a capture to the bytes the chain attests, and nothing
else. No rule, no extractor, no classifier and no model touches any of the three, which is the
whole reason the identity never moves: a re-walk changes text, a new extractor changes text, a
correction changes text, and none of them changes a URL, a timestamp or the bytes that were
served. **Identity is a property of bytes held, and Level 7's first clause becomes a predicate
rather than an audit.** The DIFF's name is composed from the captures' own names, not from
CAPTURE evidence, so it exists whether or not either endpoint is promoted, and promoting one
later changes nothing.

**What the name attests, and what it deliberately does not.**

| a CAPTURE's name says | it does NOT say |
|---|---|
| this page, at this timestamp, served exactly these bytes | what the article text was under any ruleset |
| | that the capture is meaningful, or to whom |

| a DIFF's name says | it does NOT say |
|---|---|
| these two named captures, in this order | that they are still CONSECUTIVE — a re-walk can place a capture between them, and the name does not move (§7) |
| | what changed, under any ruleset or extractor — that is a content VERSION (§3) |
| | that the change is significant, or which thesis it serves — that is the citation (§1) |

Everything in the right-hand columns is derived, versioned, or authored, and every one of them is
something today's identity encodes and therefore moves on. **Deliberately absent from the
formula:** ruleset ids, extractor version, classifier version, the diff's chunks. Any of them in
the name would make the name move on re-derivation, which is what `contentHash` does now.

**RECOMPUTABLE, by two parties from two sources, and the check is the same predicate.**

```
RECOMPUTABLE(e)   e.fileHash = ID(the corpus record e is keyed to)
                  — held at every write, audited standing; a row that fails it is MALFORMED,
                    never "stale": nothing legitimate makes it false
```

- **The platform** recomputes from the record the row is keyed to. `fileHash` is the PUBLIC name
  — what the registry holds, what a thesis cites, what a stranger recomputes — and the foreign key
  is the database's; two names for one relation is this repository's dominant defect shape, and
  the predicate is what keeps them from drifting. This is the instrument the integrity board's
  `evidence-recomputable` becomes, and its command is named in the appendix.
- **An outsider** recomputes from the archive: URL and timestamp name a raw replay (`id_`), its
  SHA-256 is `documentHash`, and CAPTURE_ID follows. That holds wherever replay serves the bytes
  the crawler stored — which the walk verifies on every fetch (flows A5, `digestVerified`). On a
  page that has served bytes its own index does not describe, the outsider recomputes from the
  bytes the platform stored and the index's digest beside them, and the record says so.

**CAPTURE_ID is derived, never stored on the corpus record. Ruled 2026-09-03.** Its inputs are
immutable, so a stored copy could not go stale — but nothing queries by it: a promoted record is
reached through `Evidence.fileHash`, an unpromoted one has no public name, and uniqueness is
already the pair of page and timestamp. A column would be a second answer, beside `documentHash`,
with a write path that can mis-write it and a check to prove it never did. Should a query ever
need it, the answer is a database-generated column, not an application write — at the price of
pgcrypto and a second spelling of the byte layout in SQL.

**As built, and how it moves.** ⚠️ Today's DIFF identity is
`sha256(url · before.ts · before.contentHash · after.ts · after.contentHash)` over Readability's
extraction — a hash that collapses 104 distinct documents to 15 values on staging, so the old
name could not even tell captures apart. Rows under that name are not migrated: the database is
rebuilt on a fresh registry and the old entries are explained in git (§8). The exact byte
layout of `·`, the encoding of each input and the string form of `documentHash` are stated ONCE,
in the appendix's A1, and nowhere else.

---

## 3. CONTENT IS A VERSION — A THESIS CITES A VERSION

**Ruled 2026-09-02.** Everything a record says beyond its name is DERIVED — from the bytes,
under a ruleset, by an extractor, a differ and a classifier, each of which can change — so it is
held as append-only VERSIONS, each with its own hash, and nothing overwrites one. The record's
name never moves (§2); its content moves only by a new version that keeps the old. A thesis cites
a version. **Drift becomes visible and rare, not prevented.**

**Content belongs to the CORPUS RECORD, not to the evidence.** A diff's derived content exists
whether or not anyone promoted it, is written by the walk, and is Level 5's. Evidence pins one
version and records which one a human stood behind. That keeps the two authorities of the flows
doc intact: **the walk writes versions and never evidence; research acts write evidence and never
versions.**

**Two registers in every version, and only one is pinned** (Level 8):

```
COMPUTED   deterministic from the texts; what a citation pins; what check 17 judges
  CAPTURE     the text under RULES_IN_FORCE for its date and the extractor → textHash
              — the TextVersion of flows A2, unchanged; a CAPTURE's content version IS it
  DIFF        the segments removed and added between before.text and after.text, and the
              survival verdict of each against the raw documents (Level 5)
              → contentVersionHash = sha256 over the canonical chunks
OPINION    a model's draw about the computed content; provenance, never part of the hash
  DIFF        significance prose · legally significant · categories · editorial (Gate 5) ·
              the classifier's summary of the change — with classifierVersion, model, draws
```

**A version is named by what it CONTAINS, not by what produced it. Ruled 2026-09-03.** Its
inputs — the two `textHash`es and `DIFF_VERSION` (differ and classifier together) — are recorded
as provenance, but a re-derivation that yields identical chunks is not a new version: the same
hash exists and the current pointer moves, exactly as flows A2 rules for a `TextVersion`
re-derived to the same `textHash`. A `textHash` already pins the ruleset in force and the
extractor, so the ruling's key — "the pair's ruleset ids and the extractor version" — is
honoured through it, one step removed, and a restamp that changed no text creates no diff
version either. The ruleset ids are one join away through the endpoints and are not stored twice.

```
DiffContentVersion   one row per distinct derived content of a diff             ⚠️ to build
  diffId · beforeTextHash · afterTextHash · diffVersion       provenance
  chunks (removed, added, each with its survival) · contentVersionHash
  opinion: classification, classifierVersion, classifierModel, draws · summary, summaryVersion
  derivedAt
  @@unique([diffId, contentVersionHash])
  the diff row itself is the PAIR — the two snapshot ids — and holds no content
```

**CURRENT is derived, never stored on the evidence.** The current version of a diff is the one
whose inputs are its endpoints' current `textHash`es under the current `DIFF_VERSION`; of a
capture, its current `TextVersion`. A pointer on the evidence row that the walk had to move would
be the walk writing evidence. What the evidence row stores is what a HUMAN did: **`affirmed`**,
the version the researcher last stood behind — pinned at promotion, re-pinned at review
(Flow E3).

```
CURRENT(record)        the version derived from the record's current inputs
NEEDS_REVIEW(e)        e.status = PROMOTED AND CURRENT(e.record).hash ≠ e.affirmed.hash
CITATION_CURRENT(m)    m.contentVersionHash = CURRENT(record of m.fileHash).hash
```

**A citation pins `(fileHash, contentVersionHash)` on the mention**, beside its rationale (§1),
as a text citation pins `(snapshotId, textHash)`. A thesis whose citation is not current fails
integrity until the researcher re-pins it — by their own act, never by a pass. **No automatic
re-affirmation, ever.**

**THE EVIDENCE ROW CARRIES NO PROSE. Ruled 2026-09-03.** The change's description is the
version's computed content; the classifier's words are opinion on the version; the researcher's
words are the mention's rationale. `evidenceRole` — incriminating or exculpatory — is relative to
a thesis and moves to the mention. `evidenceTier` is a strength score nothing verifies, and it is
DROPPED rather than moved; publication check 6, which gates on it and reports itself non-binding,
goes with it. Categories are the classifier's and live in the opinion register.

**What moves a version, and what each costs:**

| event | written by | what happens to content | what happens to evidence |
|---|---|---|---|
| a re-walk supersedes one endpoint's text (Flow 3) | the walk, Level 5 | a new diff version appended; the old kept | CURRENT moves → NEEDS_REVIEW → Flow E3 |
| a capture lands BETWEEN the endpoints — the re-walk, or index lag (§7) | the walk | the narrower diffs; the old pair's texts are unchanged, so NO new version | NARROWED — material at review, never a stop of its own (§7) |
| `DIFF_VERSION` moves | the walk, on the next pass | every diff gains a version | every CITED DIFF enters review — the price of a better differ, paid by a human once per record, and stated here so nobody pays it by surprise |
| a restamp changed no text | the walk | nothing | nothing |

**A CAPTURE has a content version too, and the same review.** Its text version already exists
and a thesis already pins it; nothing new is built for it. A re-walk that supersedes a promoted
capture's text moves CURRENT exactly as above.

⚠️ As built, `UrlVersionDiff` holds computed chunks and model prose in one row, at one weight,
and `recordDiff` UPSERTS by capture pair — every recompute overwrites the last, which is how
`rediffFromSnapshots` moved verdicts under promoted records after the fact (finding 27). Four
version axes exist on the row and none of them versions anything. `Evidence` carries its own
`summary`, `evidenceTier`, `evidenceRole` and categories, generated by a model at promotion,
corrected through `SummaryCorrection`.

---

## 4. FLOW E1 — FROM THE CORPUS TO PROMOTED

**Never inside the walk. Ruled 2026-09-02.** The walk stops on rule questions only and gains no
"significant change" stop: acquisition never judges research, rules are still being learned
mid-walk, and the plan already rules that auto mode may not promote. Promotion happens any time
after both captures are ACQUIRED and the diff is written — an hour later or a year later — with
a thesis in view (§1). The walk's classification is the triage list, and the list is an opinion
(Level 8).

**THE ACTORS here add one to the flows doc's four**: the ASSESSOR, a paid model reached at one
point — the debate — where it judges whether the researcher ARGUED, never whether they are right.

### The triage list

```
researcher   "for thesis T, what changed on <url> that could carry it?"
Claude       → list_findings(url)                                            ⚠️ to build
backend      ← every diff of the page, in DATE order, each with:
               the pair it spans (both timestamps — never a date pair) · its CURRENT version's
               computed chunks · the classifier's opinion, LABELLED as one: significance,
               categories, editorial, draws · NARROWED or not · and its evidence linkage:
               promoted? status? which theses cite it?
researcher   reads; chooses. Or searches the corpus by text for a capture — the walla article
             quoting safety — and names it by page and timestamp
```

**The list is ordered by DATE, always.** Significance is a model's opinion and may be a FILTER
the researcher applies by name — "show me what the classifier called significant" — never the
default order and never a hidden threshold. A list that sorts by an opinion presents the opinion
as the ranking, which is the sentence Level 8 forbids. The opinion is shown; the researcher
ranks.

**The triage list IS the page's public timeline.** `list_findings` is `get_forensic_timeline`
repaired — the pair by timestamps, the current version, the opinion labelled, linkage to
published citations (Level 8's defect closed) — and a researcher reads the same list an outsider
does, with no parameter and no identity. What a researcher adds is a thesis in view, and that
lives on the thesis side, not on the read.

### The debate — on a citation, one per (thesis, record)

**THE DEBATE IS THESIS-SCOPED, AND IT IS THE CITATION'S ARGUMENT. Ruled 2026-09-03.** The
debate as "is this change evidence?" is RETIRED: §1 leaves that question no answer outside a
thesis. The debate keeps its shape as built — a session with a goal, a lifecycle and an event
log, SUBSTANCE a hard gate, MERIT advisory, a sustained objection carried on the record forever —
and gains the thesis it is argued for. The question it puts is **"does this record support what
thesis T says it does?"**

**THE CITATION COMES FIRST, AND THE ARGUMENT IS MADE ON IT. Ruled 2026-09-03.** A thesis
version cites a corpus record by its name, `#ev_<fileHash>`, which is derivable from the corpus
before any evidence row exists (§2). The debate opens on that citation and the assessor reads
the argument against the citing passage. A record is PROMOTED when the argument clears; there
is no promotion of a record no text cites, and no state in which a thesis argued for a record
it does not use. A draft version may hold unargued citations; PUBLISHABLE refuses each one.

```
researcher   writes, or revises, the version: "…as the ministry's page said on <date> #ev_…"
Claude       → open_debate(thesis, record, rationale)                       ⚠️ record + thesis
backend      REFUSES NOT_CITED — the thesis's head version does not mention the record
             REFUSES a record that cannot be evidence (below)
             one OPEN debate per (thesis, record); reopening returns it
             → ASSESSOR: SUBSTANCE — did the researcher make specific, falsifiable claims
               about the record's CURRENT computed content, for the passage that cites it?
               MERIT — does the assessor agree?                                 advisory
             ← the state: cleared or not, the objection if any
researcher   answers an objection, or not
Claude       → respond_in_debate(session, response)      as many times as it takes
Claude       → promote_from_debate(session)
backend      REFUSES unless: the session is OPEN · the latest argument cleared SUBSTANCE ·
               a DISPUTES verdict has been answered at least once
             nothing here can refuse on the merits — promotedOverObjection is recorded instead
             ONE transaction:
               no Evidence row for this record yet → creates it:
                 fileHash = ID(record) · kind · the record's key · status PROMOTED ·
                 affirmed = CURRENT(record).hash · promotedBy = the researcher · promotedAt
               an Evidence row exists → nothing is created; this is a further citation's argument
               the mention's argument := this debate · the debate := PROMOTED
             NO CHAIN WRITE, and no confirmation: the record's standing is derived (§5).
             ← fileHash · status · affirmed version · promotedOverObjection

STATE        the debate and its events, attributed · the Evidence row on the FIRST promotion
             of a record · the mention now references its argument · nothing on chain
```

**The mention's rationale is the debate's cleared argument, by reference** — one "why", written
once, assessed once, and a second thesis citing the same record argues its own. The mention
pins `(fileHash, contentVersionHash)`, and it may only pin the record's `affirmed` version: a
record whose content moved is re-affirmed (Flow E3) before it is cited again.

**CAPTURE and DIFF are promoted by the same act.** A capture's argument is judged against its
CURRENT text version — "this page said X on this date" is exactly as falsifiable as "this
paragraph was removed between these dates" — and one mechanism for both kinds is one mechanism to
test. `promote_capture` does not exist as a separate tool; the record is the parameter.

### What cannot be promoted, and each is a refusal, never a throw

```
NOT_CITED              the thesis's head version does not mention the record — the citation
                       comes first, and the argument is made on it
NOT_ACQUIRED           the capture, or either endpoint, is not ACQUIRED — a SKIPPED capture does
                       not speak, an UNSERVABLE one holds nothing
CONTRADICTED           the CURRENT version's survival is CONTRADICTED — Level 5, never promotable;
                       the refusal carries what disagreed
NOTHING_TO_PROMOTE     the CURRENT version has no chunks — a diff with no change is evidence of
                       nothing
NARROWED               the pair is no longer consecutive — the refusal names the narrower diffs
                       that now span it (§7)
NO_THESIS              promotion names the thesis it is made for, always
NO_RESEARCHER          every write here is attributed
```

`ALREADY_EVIDENCE` is no longer a refusal: a promoted record can be argued for a second thesis,
and the debate opens on the pair.

**PROMOTED means: a researcher argued for it and stands behind it.** A draft thesis may cite
it; publication asks PUBLISHABLE (§5), which is Level 9's gate.

⚠️ As built, promotion and confirmation are ONE act: `promoteForensicDiff` registers on chain
inside promotion and writes `CONFIRMED` if the registration confirmed. `get_scan_findings` lists
only diffs the classifier marked significant, ordered by date — the filter is the model's, and
silent. `open_diff_debate` takes a diff and no thesis, and refuses `ALREADY_EVIDENCE`.
`promote_scan_findings` (the classifier selecting) and `create_evidence_from_url` (evidence with
no record beneath it) are RETIRED; the second becomes survey → walk → promote.

---

## 5. STANDING — WHAT IS ANCHORED, AND WHAT IS DERIVED

**Evidence is not registered on chain. Ruled 2026-09-03.** The chain attests the CORPUS: that
these bytes were served at this timestamp and stored on this date, anchored by the walk as each
capture is acquired (flows, Phase 2). Everything above the corpus — selection, argument,
version, citation — is derived from it and recomputable from it, and a chain entry for a derived
fact attests only that someone wrote it. The one thing a registration would have added, a
timestamp on the platform's public commitment, belongs to the act that IS public: a thesis's
publication, whose version hash pins every citation at once. Whether publication anchors that
hash is the thesis flows' decision.

**Two witnesses already bind a capture's name to its bytes**, and neither is this platform's
word: the registry holds `documentHash`, and the archive serves the URL at the timestamp to
anyone who asks. An outsider fetches, hashes and compares. Nothing the evidence layer could
write would add a third.

**Consequences, each a removal:**

- There is no CONFIRMED state and no confirmation act. A record is PROMOTED, and its standing
  for publication is derived below. The second human moment of the 2026-09-02 ruling existed for
  an irreversible write; with no write it is ceremony, and it goes.
- No research act writes to the chain. The walk is the only chain writer, it runs in the
  deployment, and the hazard class that produced the fake-CONFIRMED audit — a laptop mixing one
  environment's database with another's registry — has no research-act path left to travel.
- `check_on_chain_status` is a check on CAPTURES. Asked about a record, it answers about the
  captures beneath it.

**VERIFIED is a property of the corpus record, and it is what Level 9 means:**

```
VERIFIED(e)      RECOMPUTABLE(e)                                                    (§2)
                 AND every capture c of e.record:
                     c.anchoredHash = c.documentHash
                     AND c.anchorCheck ∈ { CONFIRMED_BY_RECEIPT, CONFIRMED_BY_LOG }
PUBLISHABLE(m)   the record is PROMOTED — not WITHDRAWN (§6)
                 AND the mention's argument cleared SUBSTANCE
                 AND VERIFIED(e) AND CITATION_CURRENT(m)                             (§3)
                 AND CURRENT(e.record).survival ≠ CONTRADICTED
```

VERIFIED is satisfiable the moment the new walk acquires a capture: the receipt is read seconds
after the write. A legacy capture at `TX_UNREADABLE` makes every record over it unverifiable —
true today, and resolved by the rebuild (§8), which re-registers every capture on a fresh
registry and reads attribution from chain state. `CONSISTENT` is not VERIFIED: it
says the database and the contract agree about a hash and never asks whether the recorded
transaction registered it. Publication check 5 gates on VERIFIED, not on a status.

**THE PUBLIC SURFACE IS THE CORPUS AND THE PUBLISHED THESES. Ruled 2026-09-03.** An outsider
verifies a thesis against the corpus — the cited record resolves to a capture or a pair, the
capture to bytes, the bytes to the registry and to the archive — and never against the evidence
table, which is the linkage between the two and is read by nobody outside. Public reads are
corpus reads: a page's timeline (captures with their anchors and current text version; diffs by
the pair they span, with the current version's chunks and survival, and the classifier's
opinion labelled as one), search by text over the corpus, and a diff's input. Evidence linkage
on those reads means PUBLISHED citations, for everyone; a researcher's drafts are the thesis
tools' and gated there. The corpus read never reveals unpublished work, so it has no second
behaviour by identity.

**Publication opens the PAGE, not the record. Ruled 2026-09-03.** A page's timeline is public
from the moment a published thesis cites any record of it — every capture and every diff,
selected or not, which is what makes the counterweight of §1 real for an outsider. A page no
published thesis touches is a researcher's working corpus. Calibration state — rules, decisions,
stops, held bytes — is gated whatever the page's standing (flows A5).

⚠️ As built, `promote_evidence` — the confirm tool, named as though it were promotion — registers
the record's `fileHash` on chain with the classifier's categories as the public category string
and writes `CONFIRMED`, and never records what the transaction anchored, so a confirmed evidence
row cannot say what its own hash attests. `registerEvidenceOnChain` and `promote_evidence` are
RETIRED; the legacy registrations keep their entries on the frozen registry, explained in git
(§8), and their rows go with the database.
`search_evidence` is public and returns evidence rows ranked by an embedding of their summaries,
filtered by `evidenceTier`, from a vector store that has no delete (finding 42); it is RETIRED,
and with no prose on the row and no public evidence surface the embedding has no source and no
reader. `get_forensic_timeline` shows a model's opinion beside computed chunks at one weight,
keyed by date strings, with no linkage; it is REPAIRED into the read above. `list_captures` is
gated as working state and stays so.

---

## 6. FLOW E3 — SUPERSESSION REVIEW

**A record's content moved under an argument, and a human owes a decision. Ruled 2026-09-02,
re-scoped 2026-09-03.** The re-walk (flows, Flow 3) supersedes a text version; Level 5 re-derives
every diff spanning it; a new content version is CURRENT and the version a researcher affirmed
is not. Nothing was overwritten and nothing is wrong yet — the old version is kept and every
citation still pins it. What is owed is a judgement: **does the new version still support what
the thesis says it does?** No pass answers that. **No automatic re-affirmation, ever.**

**Every PROMOTED record whose content moved enters review.** The ruling's criterion was "an
anchor and possibly citations to protect"; with no evidence anchor (§5) and no promotion
without a citation (§4), every promoted record has an argument that may now be false, and that
is what is reviewed. The mention decides only which theses are FLAGGED.

```
NEEDS_REVIEW(e)     e.status = PROMOTED AND CURRENT(e.record).hash ≠ e.affirmed.hash
```

**STOP-SHAPED, like a walk stop: a list of records owed a decision, each with its material, old
beside new, and one command to paste.** It is a read that returns work, not a tool that changes
anything.

```
researcher   "what do I owe?"                      — or Claude reports it after any scan_captures
Claude       → list_evidence_reviews()                                       ⚠️ to build
backend      ← one entry per NEEDS_REVIEW record, oldest first:
               fileHash · kind · the record (page, timestamps) ·
               affirmed: { hash, chunks }   beside   current: { hash, chunks } ·
               what moved between them — the segments that entered or left, computed, no model ·
               why: the supersession that caused it (the decision, who, when — flows A2) ·
               every thesis whose head or published version mentions it, each with its
                 argument and whether it is published ·
               the command:  review_evidence fileHash=… decision=REAFFIRM
                        or:  review_evidence fileHash=… decision=WITHDRAW reason=…
researcher   reads old beside new, against each argument; answers ONE of

REAFFIRM     the current version still supports every citing thesis's use of it
             → e.affirmed := CURRENT(e.record).hash · a REVIEW decision, attributed, naming
               both hashes · NEEDS_REVIEW(e) is now false
             the citations are NOT re-pinned by this act: each mention still pins the old
             version, CITATION_CURRENT is false, and the researcher re-pins by issuing a new
             thesis version that cites the current one — the thesis flows' act, done by the
             thesis's author, who may not be the reviewer

WITHDRAW     the current version no longer supports it, or never did; reason REQUIRED
             → e.status := WITHDRAWN · a REVIEW decision with the reason · nothing deleted:
               the row, its affirmed version, its debates and its mentions all stay
             every thesis whose head or published version mentions it is FLAGGED (below)

STATE        one REVIEW decision, always · affirmed moves on REAFFIRM · status on WITHDRAW
NOT WRITTEN  no version, no mention, no thesis — review changes the record's standing only
```

**A flagged thesis is not unpublished by the platform.** A draft cannot be published while any
citation fails PUBLISHABLE (§5). A PUBLISHED version stays published, pinned to what it cited —
that citation was true of the version it named — and the public page says, beside the citation,
what the platform now knows: *the record this cites was withdrawn on <date> for <reason>* or
*the record's content moved on <date>; the author has not re-affirmed it*. Unpublishing is the
author's act, as is the new version that answers the flag. A platform that silently unpublished
would be rewriting its public record; one that stayed silent would be misleading its readers.
Flagged, visibly, is the only honest state.

**Withdrawal is not deletion, and there is no deletion.** A withdrawn record keeps its name,
its history and its citations, so that a thesis that cited it, and a reader who saw that thesis,
can find out what happened. `delete_evidence` is RETIRED: it permanently deleted a
PENDING_REVIEW row, which is the one act Level 10 forbids and the one that turns an explained
record into a hole.

**There is no SUPERSEDED status.** The 2026-09-02 ruling had one for records whose identity
moved; under this design identity never moves (§2) and the legacy names are explained in git
rather than carried (§8). Evidence has two statuses, PROMOTED and WITHDRAWN.

**Refusals:**

```
NOT_PROMOTED        status is WITHDRAWN — there is nothing to re-affirm or withdraw
NOTHING_TO_REVIEW   affirmed already equals CURRENT — REAFFIRM would record a decision about
                    nothing; WITHDRAW of a current record is allowed, with its reason
REASON_REQUIRED     on WITHDRAW
NO_RESEARCHER
```

⚠️ As built, a superseded text version yields a recomputed diff that OVERWRITES the row
(`recordDiff`'s upsert), so the record a thesis cited is gone before anyone could review it —
finding 27 is that mechanism observed. No review exists, no list of what is owed exists, and
`delete_evidence` exists.

---

## 7. NARROWING IS MATERIAL, NOT A FLOW

**A capture between a promoted diff's endpoints. Ruled 2026-09-02 as a flow; RETIRED as one
2026-09-03.** The archive appends captures with NEW dates: a later survey lands them after the
page's latest capture, never between two the corpus holds. A capture does land between two in
two ways, and neither needs a flow of its own:

| how | what else happens | so |
|---|---|---|
| the re-walk turns a DUPLICATE into an ACQUIRED capture under corrected rules (flows, Flow 3) | the endpoints' text was re-derived in the same walk, so the wide record's content moved | it is already in Flow E3's review, and the intervening capture is part of that review's material |
| the archive's index gained a capture with an OLD date, after we surveyed — index lag | nothing: the wide pair's texts are unchanged | the wide claim stays TRUE and coarser than the corpus; the public timeline shows the finer captures beside it. Understated precision is the safe direction, the opposite of Level 8's defect |

**PREDECESSOR is derived, and that is where "new" comes from.** The flows appendix defines a
capture's predecessor as the latest ACQUIRED row before it, so it moves whenever a row between
them becomes ACQUIRED. In the first case the successor is STALE and the re-walk diffs it against
its new predecessor as it goes; in the second it is not, and nothing revisits it — which is why
the walk owes one clause, below.

```
NARROWED(d)   ∃ an ACQUIRED capture c of d's page with d.before.ts < c.ts < d.after.ts
              — IDENTICAL and DUPLICATE rows carry the predecessor's text and narrow nothing;
                SKIPPED and UNSERVABLE do not speak. Derived, never stored
```

**What NARROWED does:** it REFUSES a new promotion (Flow E1) — a thesis citing the corpus
afresh cites what the corpus holds at its finest — and it appears in Flow E3's material when a
reviewed record has it: the intervening captures, the narrower diffs with their current chunks
and labelled opinion, and where each chunk of the wide record went, computed by containment
with no model. REAFFIRM keeps the wide claim; WITHDRAW names the narrower records in its
reason. A CAPTURE record is never narrowed.

**What it does not do:** it fires no stop, blocks no publication and creates no state. A wide
record cited before the corpus knew more is not made false by the corpus learning more.

**One clause owed to flows A5, in this PR. Ruled 2026-09-03:** on acquiring a capture that has
an ACQUIRED successor, the walk writes the successor's diff against it, so the timeline stays a
consecutive chain; the old pair's row stays. One paid classification per event, and the event
is rare.

**VERIFIED BY MEASUREMENT (§10):** how often a survey appends a capture earlier than the page's
latest ACQUIRED capture. The survey can count it for free; if it happens, this section is
revisited with a number.

⚠️ As built, a capture stored between two diffed captures gets a diff against its predecessor
and the successor is never re-diffed, so the corpus holds overlapping intervals and the timeline
reports both; and the timeline displays `beforeDate`/`afterDate` strings that can name a capture
the corpus does not hold (Level 8's boundary defect). Under this design a diff is its pair and
the interval is read from the captures.

---

## 8. LEGACY — THE DATABASE IS DISPOSABLE; THE CHAIN IS NOT

**Ruled 2026-09-03.** The corpus is small, the one thesis is the researcher's own, and there
are no users. Every row in both databases may be rebuilt from the archive and the code, and
nothing in this design carries a legacy row forward: no supersession of evidence identities,
no `previousFileHash`, no legacy statuses held by a source scan, no DOCUMENT row kept in
place. What cannot be rebuilt is the chain, and the chain is where the design's care goes.

**Dropping a database is a cleanup session under `CLAUDE.md`'s protocol** — its own session,
its stated purpose, the scope written to the gate file, simulated before executed, staging
first and production at SHIP. This document records the ruling and performs nothing.

**The registries are append-only, and each entry holds a hash, the submitter, the block time
and a category.** Three kinds of entries exist:

| entries | what they attest | what is done |
|---|---|---|
| snapshot anchors over `contentHash` — on production 12 entries covering all 83 captures, since the extraction hash collapses twins; written 2026-08-25, read from the chain 2026-09-03 | that we held the EXTRACTION of a page on that date; narrower than claimed, not false | kept on the frozen registry and explained; the extractor is the link to the rebuilt capture's entry |
| snapshot anchors over `documentHash` — 7 on staging, NONE on production | the bytes as served — the target's anchor | kept and explained; re-registered by the rebuild on the new registry |
| evidence anchors over the old name — 8 on production, with the classifier's categories written as their public label | a selection under a formula leaving the code | kept and explained; no row |

Production's registry holds 20 entries in all, one submitter, nothing written after 2026-08-26.
Counted from the chain, not from a document, and re-counted on the day the ledger is emitted.

**A NEW REGISTRY PER ENVIRONMENT, AND THE OLD ONE FROZEN. Ruled 2026-09-03, superseding Level
10's "one registry, forever".** That decision refused a replacement deployed to ESCAPE a
registry's problems while the database that explained them was kept. This is the opposite act:
the database goes, the old contract stays — public, immutable, never redeployed over — and every
entry on it is explained in git. The new contract carries ONE meaning from index zero: every
entry is the SHA-256 of a page as served, checkable against the archive, and nothing on it can
predate the rebuild. One address, one query, one meaning. The contract source is unchanged;
its category field carries the kind of record.

**Rotation is one act per environment, in the platform's configuration, with an acceptance
check:** `get_environment` names the new address, code is found at it, our key holds
`REGISTRAR_ROLE` there, and `totalEvidence()` reads ZERO before the first walk writes. Staging
first; production at SHIP. The old address lives in the registry ledger, not in code, so no
path can consult two registries.

**THE RISK, STATED, AND WHY IT IS TAKEN ONCE.** A second registry invites the reading that the
first was abandoned when it became inconvenient. The answer is one sentence and it is
checkable: the old contract is immutable, public, linked beside the new one, explained index by
index, and still writable by the same registrar — nothing was hidden and nothing can be. The
rebuild is worth that cost because production's registry holds 20 entries and not one is a
`documentHash`: 12 extraction anchors covering 83 captures, and 8 evidence names under the
retired formula, all written on 2026-08-25 and 26, nothing since. A fresh contract is therefore
one meaning from index zero, and a verifier of any future thesis never needs the ledger. That
window closes with the first production capture the new walk anchors, so the rotation happens
BEFORE it — and never again: the category field carries the anchoring scheme from the first
entry, so a future change of meaning is self-describing on the same contract. Conditions: the
dump before the drop, kept offline; the acceptance check including `REGISTRAR_ROLE`; the ledger
complete before any address changes.

**Attribution is read from chain STATE, never from receipts.** `isRegistered(hash)` returns an
entry's index and `getEvidence(index)` returns its submitter and block time, forever; a
receipt is readable only inside the RPC's retention horizon. The audit's `TX_UNREADABLE` was a
fact about the transaction our row named, not about the chain's attestation. Every anchor on
the new registry is attributed by state, and the ledger verifies the old one the same way:

```
ATTRIBUTED(hash)   isRegistered(hash) AND getEvidence(index).submitter = our registrar
```

⚠️ Measured against BOTH registries before it replaces receipts in VERIFIED (§5, §10).

**Every old entry is explained in git, not in a table.** Before either database is dropped, a
script emits the REGISTRY LEDGER: for every index on each old registry — hash, what formula
produced it from which inputs, what it attested, and what replaced it — verified complete
against `totalEvidence()` and committed to this public repository, with the old address. An
unexplained entry is indistinguishable from a tampered one (Level 10); a published explanation
of the registry's own history is the credibility argument Level 10 makes, in a file that cannot
be lost with a database.

**The rebuild registers every capture fresh, and inherits its dates through the ledger.** The
re-walk fetches the same raw bytes, hashes them to the same `documentHash`, and registers it
on the new contract with today's block time. The date a page was first held is attested by
the old contract's extraction anchor, tied to the new entry by one measurement per capture:
does `extract(document)` under the pinned extractor equal the stored `contentHash`? Where it
does, an outsider can verify that the bytes registered today produce the text registered then,
and custody is whole. Where it does not, the ledger records a text the bytes no longer
reproduce — still custody, weaker, and said so. Nothing is claimed from the old contract and
nothing is migrated.

**The DOCUMENT record and the published thesis are rebuilt or not, by the researcher.** The
thesis is theirs to write again under the design, citing corpus records; the DOCUMENT class
stays parked and its one record is not carried into the new database. `EvidenceCapture`,
`SummaryCorrection`, the debate sessions on legacy diffs, the three open calibration runs and
their eighty-eight decisions go with the database.

**THE ORDER, AND IT IS THE REFACTOR PLAN'S TO PLACE.** The rebuild is sensitive in exactly one
way: a step run before its precondition leaves an entry nobody can explain, and entries are
forever. So the order is stated here once, each step gated by the one before, and the refactor
plan owns the step number — it replaces that plan's step 9, the drop, which was already its own
destructive session:

```
1  MEASURE, read-only, in the container, both environments
     extractor equality per capture · chain-state attribution against both old registries ·
     the archive still serves each capture's bytes (digestVerified on a dry fetch)
2  EMIT AND VERIFY THE LEDGER   every index on each old registry explained; committed to git
     — nothing below runs while an index is unexplained
3  DEPLOY THE NEW CONTRACT      the researcher's deployer key, per environment; never MCP
4  ROTATE THE CONFIGURATION     one variable, in the platform; ACCEPTANCE: get_environment names
     the new address · code at it · totalEvidence() = 0
5  DROP THE DATABASE            the cleanup session, in full: purpose, scope file, simulation
6  SURVEY AND WALK              the corpus rebuilds itself and registers as it goes (flows, Flow 1)
staging through 6, verified, before production begins 1; production 3–6 at SHIP
```

**STAGING IS THE REHEARSAL, AND THE MAINNET ACT IS ONE-SHOT.** The same path runs twice, first
on Sepolia where every mistake is free. What it rehearses is not the walk — the walk is landed
by then — but the acts that produce permanent entries: the deploy, the role grant, the
acceptance check, the ledger, the first anchor at index zero. A botched production deploy would
put a third contract on Base and hand a hostile reader the story the risk block answers, so
production begins step 1 only after staging's six steps are verified end to end. Staging's old
registry is not a custody claim — a testnet's history is disposable and can be deprecated — so
its ledger is emitted, verified and committed marked as testnet, to prove the script on real
entries, not to be read.

**THE WINDOW IS HELD SHUT BY A REFUSAL, NOT A RULE. Ruled 2026-09-03.** Production's current
code would anchor a `documentHash` on the old contract if a scan ran there, and one such entry
ends the clean cut. So the anchoring path refuses to write to any registry that is not empty
and whose first entry does not carry the anchoring scheme — derived from the chain, with no
flag to set and no old address in code:

```
WRITES_ALLOWED(registry)   totalEvidence() = 0
                           OR getEvidence(0).category = ANCHOR_SCHEME
```

On the old contracts index 0 carries a classifier's category list, so every write refuses
with `REGISTRY_FROZEN`; on a new contract the first write passes and stamps the scheme. Until
that refusal is deployed to production, the rule is the written one: **no scan runs on
production before the rotation** — and the refusal lands in the refactor before SHIP, so the
written rule has a bounded life.

**What this retires from earlier sections:** SUPERSEDED as a status and `previousFileHash` as
a column (§2, §6) — identity never moves and the legacy names are explained in git, so the
status has no population. Evidence has two statuses: PROMOTED and WITHDRAWN.

⚠️ As built, `forensics:rehash-evidence` rewrites `fileHash` on drifting rows and
`forensics:confirm-anchors` attributes through receipts; both are RETIRED. `anchorSnapshots`
claims an existing registration on `DuplicateEvidence` by searching logs; on a registry that
starts at zero there is nothing to claim, and a duplicate is a walk defect. Level 10's section
"One registry, forever, append-only" is SUPERSEDED by this section and its STATUS gains the
pointer.

---

## 9. STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| the Evidence row: `fileHash`, kind, the record's key | `promote_from_debate`, on the FIRST cleared argument for a record | the walk · any read · anything automatic |
| `Evidence.status` — PROMOTED → WITHDRAWN | `review_evidence` WITHDRAW, reason required | anything else; nothing moves it back |
| `Evidence.affirmed` — the version a human stood behind | `promote_from_debate` (first) · `review_evidence` REAFFIRM | the walk — CURRENT is derived, and the walk never writes evidence |
| the debate: session, events, verdict, `promotedOverObjection` | `open_debate` · `respond_in_debate` · `promote_from_debate` | the browser · any pass |
| the REVIEW decision log | `review_evidence` | — |
| the mention: `fileHash`, `contentVersionHash`, the argument it references | the thesis version's creation — the thesis flows' act; the pin may only equal `affirmed` | any evidence tool |
| `DiffContentVersion` | the walk, at acquisition and at re-derivation (Level 5) | any research act; nothing overwrites one |
| the diff row — the pair | the walk at acquisition · the successor re-diff (§7's clause to flows A5) | — |
| `TextVersion`, `text`, `textHash` | the walk (flows A2) | — |
| the registry: one entry per ACQUIRED capture, over `documentHash` | the walk, on ACQUIRED, in the deployment | any research act — no evidence write exists |
| stored check verdicts — attribution, recomputability | the write path as it writes · the standing audit | — |
| the REGISTRY LEDGER, in git | the rebuild's script, once per frozen registry | anything after the rebuild |
| the databases, dropped once | the cleanup session of §8, step 5 | anything else, ever |

**Derived, never stored:** `CURRENT`, `NEEDS_REVIEW`, `NARROWED`, `RECOMPUTABLE`, `VERIFIED`,
`CITATION_CURRENT`, `PUBLISHABLE`, `ATTRIBUTED`, and the flags a public thesis page shows beside
a citation. A predicate a pass computed and stored would be a judgement the pass made.

**The two authorities, once more:** the walk writes the corpus — captures, versions, diffs,
registry entries — and never an evidence row, a mention or a decision; research acts write
evidence rows, decisions and mentions, and never a version or a registry entry. The assessor
writes nothing; it answers inside a debate, and the debate records it.

**Nothing is deleted.** A withdrawn record keeps its name, its argument and its citations; a
superseded text version is kept; a narrowed diff's row stays. The single deletion in this
design is the rebuild's drop, once per environment, in its own session.

---

## 10. OUT OF SCOPE OF THIS DESIGN

Each of these is named so that it is not read as a gap. None is decided here; each says whose
it is.

- **DOCUMENT evidence** — a file, pasted text, a screenshot: a record with no corpus record
  beneath it, which this design can neither name, version, verify nor review. Its own
  discussion, with one requirement stated from here: it needs an identity composed from bytes
  held and a content version of its own, or nothing built here applies to it and no thesis
  citing it can be PUBLISHABLE. The one legacy DOCUMENT record is not carried into the rebuilt
  database (§8).
- **The blocked-live-page fallback and whistleblower material** — parked with the factual
  layer's list, for the same discussion as DOCUMENT evidence.
- **The thesis flows** — the next document. This one hands it five requirements: the mention
  carries the pin `(fileHash, contentVersionHash)`, its argument by reference, and may only pin
  the record's `affirmed` version (§4, §9); a new version is how a citation is re-pinned (§6);
  the public page shows the derived flag beside a citation (§6); `ThesisGapResolution`, which
  also references a record by name, pins the same way; and whether publication anchors the
  version's hash is that document's decision (§5).
- **Trajectories as a citation kind** — a claim's history across a page, "removed and never
  restored", is Level 6's and is cited by its detection-pass id with its own currency check
  (`TRAJECTORIES_CURRENT`). It already has the shape this design gives evidence, pin and
  re-affirm by a new version, and must keep it; nothing here changes it, and the thesis flows
  name it beside evidence as the second thing a version cites.
- **The return path of a FOIA answer or a whistleblower submission** — both are DOCUMENT
  evidence, the parked class. The day that produces them ends at that door: the DOCUMENT
  discussion is the second half of the court path, not a side topic, and the key-figure dossier,
  which aggregated evidence by named official, re-homes to theses' mentions in the same
  discussion.
- **Search over the corpus by text** — the public read's shape beyond one claim at a time.
  This design leaves no prose to embed and no evidence surface to search, so whatever search
  is built searches text versions; that is a read-tool design, not this one.
- **The registry ledger's format** — emitted once per frozen registry by the rebuild (§8),
  and recorded as a dated findings document when it is, never in this one.
- **Rule expiry** — the factual layer's, unchanged.
- **The Prosecutor** — designed, deliberately not next; this design gives it its material,
  the corpus (§1), and nothing else.
- **The public site's rendering** — what an evidence citation, a flag and a page timeline look
  like, given the reads of §5. The frontend's.
- **Bronze Fortress** — untouched by every ruling here, including the registry's.

## VERIFIED BY MEASUREMENT, NOT BY THIS DOCUMENT

Each is a number this design assumes or a cost it states, checked by an instrument rather than
argued. Every one runs read-only, in the container, and lands in a dated findings document.

| what | why it is measured | where it bears |
|---|---|---|
| chain-state attribution — `ATTRIBUTED` for every entry on both old registries and, once they exist, the new ones | before it replaces receipts in VERIFIED; the audit's `TX_UNREADABLE` was a claim about receipts | §5, §8 |
| extractor equality per legacy capture — `extract(document) = contentHash`, on all 83 production captures and staging's | decides how much of the old registry's custody the ledger can call recomputable by an outsider, and how much is our word | §8 |
| the archive still serves each capture's bytes — `digestVerified` on a dry fetch, and the UNSERVABLE count | the rebuild's precondition; a capture the archive no longer serves is rebuilt from the dump and said so | §8, step 1 |
| the registry counts on the day the ledger is emitted — 20 on production as of 2026-09-03 | the ledger is complete against `totalEvidence()`, not against a document | §8 |
| RECOMPUTABLE on every evidence row, standing | the instrument `evidence-recomputable` becomes; expected at 100 %, and any other number is a malformed row, not a rate | §2 |
| the review load — records entering NEEDS_REVIEW per re-walk, and per `DIFF_VERSION` move | the cost §3 states loudly, paid by a human; measured on the rebuilt corpus's first re-walk | §3, §6 |
| index lag — surveys that append a capture earlier than the page's latest ACQUIRED one | decides whether §7 ever needs more than a clause | §7 |
| the SUBSTANCE gate on citing passages — the assessor's false-positive and false-negative rate once it reads the passage | the prompt change is unlanded; the method is the plan's, the same one that measures Gate 5 | §4 |

**Nothing is OPEN.** What this document does not decide is named above as someone else's or as
a number; the appendix that follows is the contract for everything it does decide.

---

## APPENDIX — THE IMPLEMENTATION CONTRACT

**What a builder reads twice.** Every shape, predicate and refusal the flows imply, stated once.
It composes with `docs/gf-interaction-flows.md` A1–A5 — the page, the capture, the researcher,
`UrlSnapshot`, `TextVersion`, `Rule`, the decision log, `scan_captures` — and restates none of
them. Where the flows above and this appendix disagree, the flows win and this is wrong.

### A1. Identity

```
record          CAPTURE   { url, capture }                   the flows' names: url exact, capture
                DIFF      { url, before, after }             = waybackTimestamp, 14 digits
                — never a snapshot id, never a diff id, on any tool
evidence        fileHash — the record's name, below; the only name a tool, a thesis or a
                stranger uses for a record once it is evidence
thesis          thesisId (cuid) — the thesis flows' name, taken as given
researcher      from the MCP context; every write REFUSES without one (flows A5)
```

**The byte layout, stated once and nowhere else.** `sha256` is SHA-256; `‖` is byte
concatenation; hex is lowercase; a hash is displayed `0x` + 64 hex, the form `fileHash` already
takes.

```
CAPTURE_ID(c)           sha256( utf8(url) ‖ 0x00 ‖ ascii(c.waybackTimestamp) ‖ 0x00 ‖ bytes32(c.documentHash) )
                        url:   TrackedUrl.url, the exact stored string, no normalisation
                        ts:    the 14 ASCII digits
                        hash:  the 32 raw bytes of documentHash — never its hex text
ID(CAPTURE record)      CAPTURE_ID(c)
ID(DIFF record)         sha256( bytes32(CAPTURE_ID(before)) ‖ bytes32(CAPTURE_ID(after)) )
contentVersionHash      CAPTURE: the TextVersion's textHash, unchanged (flows A2)
                        DIFF:    sha256( utf8( JSON of [ { side: 'REMOVED'|'ADDED', text } … ] ) )
                                 — the differ's raw segments in the differ's output order,
                                   text whitespace-normalised as the differ emits it;
                                   NO survival, NO opinion, NO version label in the hash
ANCHOR_SCHEME           the registry category written on every entry: 'DOCUMENT_SHA256'
                        — one constant, one importable symbol, read by WRITES_ALLOWED
```

A capture without a `waybackTimestamp` has no CAPTURE_ID (§8, DIRECT class, parked).

### A2. Data model

```
Evidence                                                              ⚠️ replaces the row as built
  fileHash                @unique — ID(record); the public name
  kind                    CAPTURE | DIFF
  snapshotId              String? @unique       set iff kind = CAPTURE
  urlVersionDiffId        String? @unique       set iff kind = DIFF
                          INVARIANT: exactly one of the two is set, and it matches kind —
                          a CHECK constraint, not a convention
  status                  PROMOTED | WITHDRAWN
  affirmedContentVersionHash   the version a human last stood behind (§3)
  promotedById · promotedAt
  createdAt
  REMOVED from the row as built: summary · evidenceTier · evidenceRole ·
    investigativeCategories · evidenceDate · targetEntity · figures · sourceUrl ·
    onChainTxHash · anchoredHash · anchorCheck · previousFileHash · evidenceType ·
    EvidenceCapture · SummaryCorrection — each is prose, opinion, chain or identity state this
    design keeps elsewhere or nowhere. `figures` and `targetEntity` are LLM output written at
    promotion; a figure is named by a thesis, and that link is the thesis flows'

EvidenceDecision        the record's review log, append-only
  id · fileHash
  sequence                Int — @@unique([fileHash, sequence]); the compare-and-set
  type                    REAFFIRM | WITHDRAW
  researcherId            REQUIRED
  fromVersionHash · toVersionHash     REQUIRED on REAFFIRM — both named, so the log says what
                                       was stood behind and what replaced it
  reason                  REQUIRED on WITHDRAW
  createdAt

DebateSession           as built, with the thesis and the record                  ⚠️ two columns
  + thesisId              REQUIRED
  + recordFileHash        ID(record) — computed at open, before any Evidence row exists
  urlVersionDiffId → recordSnapshotId? · recordDiffId?   one set, matching the record's kind
  @@unique([thesisId, recordFileHash]) among status = OPEN — one open debate per (thesis, record)
  status                  OPEN | PROMOTED | ABANDONED         unchanged
  verdict · hasSubstance · promotedOverObjection · events     unchanged
  evidenceId              set on PROMOTED — the row this argument created or joined

DiffContentVersion                                                    ⚠️ to build
  id · diffId
  beforeTextHash · afterTextHash · diffVersion        provenance: the inputs
  chunks                  Json — [ { side, text, survival: SURVIVES|CONTRADICTED|UNCHECKABLE } … ]
  contentVersionHash      A1
  classification          Json | null — the OPINION register: significance, categories,
                          legallySignificant, editorial, summary, classifierVersion,
                          classifierModel, draws, summaryVersion
  survivalVersion         SURVIVAL_CHECK_VERSION at derivation
  derivedAt
  @@unique([diffId, contentVersionHash])
  a re-derivation whose contentVersionHash exists is NOT a row: nothing is written and CURRENT
  already resolves to it (A3)

UrlVersionDiff          becomes the PAIR                                ⚠️ columns leave
  beforeSnapshotId · afterSnapshotId   @@unique — unchanged, and now the whole identity
  trackedUrlId · createdAt
  REMOVED: beforeDate · afterDate · deletedText · addedText · rawDeletedText · rawAddedText ·
    aiSignificance · isLegallySignificant · investigativeCategories · every *Version column ·
    every survival column · classifierModel · classifierDraws — all of it is a version's

DIFF_VERSION            one constant naming the differ AND the classifier together — replaces
                        DIFF_INPUT_VERSION, CLASSIFIER_VERSION and SUMMARY_VERSION as the key
                        of a content version; they may survive as its parts

ThesisMention           the citation                                   ⚠️ three columns
  + contentVersionHash    REQUIRED on type = EVIDENCE — the pin
  + debateSessionId       REQUIRED on type = EVIDENCE — the argument, by reference
  + role                  String? — the researcher's word for what the record does here;
                          evidenceRole's replacement, optional, never a model's
  INVARIANT: contentVersionHash = Evidence(fileHash).affirmedContentVersionHash at the time the
  version is created — the thesis flows enforce it at that write

ThesisGapResolution     + contentVersionHash, pinned the same way

registry entry          { fileHash = documentHash, submitter, block time, category = ANCHOR_SCHEME }
                        written by the walk on ACQUIRED; the contract is unchanged
```

**Nothing is deleted, ever, after the rebuild.** Rows are appended, statuses move forward,
versions accumulate.

### A3. Derivations, as predicates

```
ID(record)              A1
RECOMPUTABLE(e)         e.fileHash = ID(record keyed by e.snapshotId | e.urlVersionDiffId)
                        — held at every write; a row that fails it is MALFORMED

CURRENT(capture)        the UrlSnapshot's current (textHash, textExtractionVersion) — flows A2
CURRENT(diff)           the DiffContentVersion with beforeTextHash = CURRENT(before).textHash
                        AND afterTextHash = CURRENT(after).textHash AND diffVersion = DIFF_VERSION
                        — NONE EXISTS: the diff is AWAITING_DERIVATION; the walk owes a version
                        (Level 5's recompute) and no evidence predicate below evaluates until
                        it does. Awaiting is not review: the human is not asked to judge a
                        version that does not exist
NEEDS_REVIEW(e)         e.status = PROMOTED AND CURRENT(e.record).hash ≠ e.affirmedContentVersionHash
CITATION_CURRENT(m)     m.contentVersionHash = CURRENT(record of m.fileHash).hash
ARGUED(m)               DebateSession(m.debateSessionId).status = PROMOTED
                        AND that session's recordFileHash = m.fileHash AND thesisId = m's thesis

NARROWED(d)             ∃ ACQUIRED capture c of d's page: d.before.ts < c.ts < d.after.ts   (§7)
INTERVENING(d)          those captures, in timestamp order

ATTRIBUTED(hash)        isRegistered(hash) AND getEvidence(index).submitter = REGISTRAR
                        — chain state, never a receipt; REGISTRAR from configuration (§8)
VERIFIED(e)             RECOMPUTABLE(e) AND ∀ capture c of e.record:
                          ATTRIBUTED(c.documentHash) AND c.anchoredHash = c.documentHash
PUBLISHABLE(m)          e = Evidence(m.fileHash) exists AND e.status = PROMOTED
                        AND ARGUED(m) AND VERIFIED(e) AND CITATION_CURRENT(m)
                        AND CURRENT(e.record) has no chunk with survival = CONTRADICTED
                        — a thesis version is publishable iff every EVIDENCE mention is

WRITES_ALLOWED(registry)   totalEvidence() = 0 OR getEvidence(0).category = ANCHOR_SCHEME   (§8)
PUBLIC_PAGE(page)       ∃ a PUBLISHED thesis version with an EVIDENCE mention whose record is a
                        capture or diff of the page                                          (§5)
FLAGGED(m)              m is on a published version AND
                        (Evidence(m.fileHash).status = WITHDRAWN OR NOT CITATION_CURRENT(m))
                        — the flag the public page shows; its text names which
```

**Every predicate is computed on read and none is stored.** Where one is expensive — VERIFIED
reads the chain — the stored check verdict of §9 caches the OBSERVATION with its version and
its subject, and the predicate reads the verdict; staleness is a property of the verdict's
inputs, never of the predicate.

### A4. Tool contracts

**Conventions, shared with flows A5.** Every refusal is a JSON `{ error, code }`, never a throw.
Every write REFUSES without a researcher in context (`NO_RESEARCHER`) and on a URL with no
TrackedUrl (`NOT_SURVEYED`). A record is named as A1 says, by page and timestamps; a tool given
a date instead of a timestamp refuses `NOT_A_CAPTURE` rather than guessing. Where CURRENT is
undefined the tool refuses `AWAITING_DERIVATION` and names the diff; nothing evaluates against a
version that does not exist.

**PUBLIC reads take no identity and answer identically for everyone.** Access to a page's
timeline is gated by PUBLIC_PAGE for a caller without identity — that is access, not a second
behaviour: the output never depends on who asks. GATED reads answer only a researcher, by the
flows' precedent that working state is not published evidence.

```
list_findings({ url })                                                    PUBLIC · ⚠️ to build
  returns   { page: { url, public: bool },
              captures: [{ capture, snapshotDate, textHash, textExtractionVersion,
                           anchor: { documentHash, attributed: bool } }],
              diffs:    [{ before, after, current: { contentVersionHash, chunks } | null,
                           awaitingDerivation: bool,
                           opinion: { significance, categories, legallySignificant, editorial,
                                      classifierVersion, draws } | null   — LABELLED as opinion,
                           narrowed: bool,
                           evidence: { fileHash, status, citedBy: [{ thesisId, published: bool }] }
                                     | null — citedBy lists PUBLISHED versions only }] }
            captures and diffs in TIMESTAMP order; no other order exists
  refuses   NOT_SURVEYED · NOT_PUBLIC (no identity and NOT PUBLIC_PAGE)
  replaces  get_forensic_timeline · get_scan_findings

get_diff_input({ url, before, after })                                    PUBLIC
  does      the pair's two current texts and the CURRENT version's chunks — named by the pair,
            never by a date pair; an ambiguous name is impossible by construction
  refuses   NOT_SURVEYED · NOT_PUBLIC · NOT_A_CAPTURE · NO_SUCH_DIFF (the pair is not one the
            walk wrote) · AWAITING_DERIVATION

verify_claim_text({ url, phrase })                                         PUBLIC · unchanged
  does      the corpus read by text, over current text versions; gated by PUBLIC_PAGE as above

resolve_record({ fileHash })                                               PUBLIC · ⚠️ to build
  does      what a stranger holding a citation needs: the record the name resolves to — kind,
            page, timestamps — RECOMPUTABLE, VERIFIED with its per-capture attribution, and
            the PUBLISHED versions that cite it, each with FLAGGED and its text
  refuses   NOT_A_RECORD (the name resolves to nothing the corpus holds) · NOT_PUBLIC

check_on_chain_status({ url, capture })                                    PUBLIC · re-scoped
  does      a check on a CAPTURE: isRegistered · ATTRIBUTED · anchoredHash = documentHash ·
            the stored verdict and its version; asked about a record's fileHash it answers
            about every capture beneath it
  refuses   NOT_SURVEYED · NOT_A_CAPTURE · CHAIN_UNAVAILABLE (a verdict about the CHECK)

open_debate({ thesisId, record, rationale })                              WRITE · ⚠️ re-shaped
  does      computes fileHash = ID(record); REFUSES unless the thesis's HEAD version mentions it;
            returns the OPEN debate for (thesisId, fileHash) if one exists, else creates it;
            → ASSESSOR with the argument, the record's CURRENT computed content, and the passage
              of the head version that cites it; records RATIONALE_SUBMITTED · ASSESSMENT_RETURNED
  returns   the debate state: { sessionId, fileHash, hasSubstance, verdict, canPromote,
            blockedBy, events }
  refuses   NOT_CITED · NOT_ACQUIRED · CONTRADICTED (carrying the chunks that disagree) ·
            NOTHING_TO_PROMOTE (a diff whose CURRENT has no chunk) · NARROWED (naming
            INTERVENING) · AWAITING_DERIVATION · NO_THESIS (the id resolves to none) ·
            REASON_REQUIRED (blank rationale)

respond_in_debate({ sessionId, response })                                WRITE · unchanged
  refuses   SESSION_NOT_FOUND · SESSION_CLOSED

promote_from_debate({ sessionId })                                        WRITE
  does      REFUSES unless OPEN · hasSubstance · (verdict ≠ DISPUTES or answered ≥ 1)
            ONE transaction: Evidence row created iff none for fileHash — status PROMOTED,
            affirmed = CURRENT.hash, promotedBy, promotedAt; debate := PROMOTED with evidenceId
            and promotedOverObjection; the mention on the head version gains debateSessionId
            — the thesis flows may instead take it at the next version write; either way the
            invariant of A2 holds when a version is created
  returns   { fileHash, status, affirmedContentVersionHash, created: bool, promotedOverObjection }
  refuses   SESSION_NOT_FOUND · SESSION_CLOSED · NOT_READY (with blockedBy) · and every refusal
            of open_debate re-checked at this moment — the record may have moved since

get_debate({ sessionId })                                                 GATED read · unchanged

list_evidence_reviews({})                                                 GATED read · ⚠️ to build
  returns   entries in oldest-first order, each { kind: 'CONTENT_MOVED', fileHash, record,
              affirmed: { hash, chunks }, current: { hash, chunks }, moved: { entered, left },
              cause: { decision, researcherId, at }, citedBy: [{ thesisId, published, argument }],
              narrowed: { intervening, narrowerDiffs } | null, commands: [string] }
            — every NEEDS_REVIEW record across the corpus; an empty list is an answer
  refuses   nothing but NO_RESEARCHER

review_evidence({ fileHash, decision: 'REAFFIRM' | 'WITHDRAW', reason?, expectedSequence })
                                                                          WRITE · ⚠️ to build
  does      ONE transaction: REAFFIRM → affirmed := CURRENT.hash, an EvidenceDecision naming
            from and to; WITHDRAW → status := WITHDRAWN, an EvidenceDecision with the reason.
            expectedSequence is the compare-and-set on EvidenceDecision
  returns   { fileHash, status, affirmedContentVersionHash, decisionSequence }
  refuses   NOT_A_RECORD · NOT_PROMOTED · NOTHING_TO_REVIEW (REAFFIRM when affirmed = CURRENT) ·
            AWAITING_DERIVATION · REASON_REQUIRED · STALE_SEQUENCE

scan_captures                                                             flows A5 · one refusal added
  refuses   REGISTRY_FROZEN — NOT WRITES_ALLOWED(registry): evaluated before the first anchor
            of a call, nothing acquired, the message names index 0's category
```

**Retired, and what each was:**

```
promote_scan_findings          the classifier selecting evidence                          §1, §4
create_evidence_from_url       evidence with no record beneath it → survey → walk → cite   §1
promote_evidence               confirmation and the evidence chain write                  §5
search_evidence                an evidence surface ranked by an embedding of prose        §5
get_forensic_timeline          opinion beside fact, date strings, no linkage → list_findings
get_scan_findings              the classifier's filter, silent → list_findings
enrich_evidence_with_history   history is the walk's
delete_evidence                the one act Level 10 forbids → WITHDRAW                    §6
open_diff_debate · respond_in_diff_debate · promote_from_diff_debate · get_diff_debate
                               renamed without 'diff': the record is the parameter          §4
```

`create_evidence_from_text` and `recover_evidence_from_screenshot` are the DOCUMENT class's
and are neither kept nor retired here; they wait on that discussion (§10). Until it rules, they
are GATED and their records are not citable under PUBLISHABLE.

### A5. Routes

**This design adds no route and no browser page.** Its human moments — the debate, the reviews
list, the decisions — are chat and tools; the stop-shaped list is a tool's return, not a page.

The evidence routes as built — `/search`, `/latest`, `/timeline`, `/:id`, `/key-figures`,
`/stats` — served a public evidence surface that no longer exists and are the FRONTEND's to
replace with corpus reads, in its own change (§10). One route is named here because a thesis
requirement depends on it: the editor's mention autocomplete (`/mentions/evidence`) offered
promoted evidence; under citation-first it must offer CORPUS RECORDS by name, from the page
timelines, so that a version can cite a record before any evidence row exists. That is the
thesis flows' route, with this doc's requirement on it.

### A6. The checks a thesis runs

**The publication gate consumes the predicates of A3, one check per predicate, each naming the
mention it examined and the version it examined it at.** A check that examined nothing says
so: a thesis version with no EVIDENCE mention fails `CITES_EVIDENCE` as today, and no check
here has a non-binding pass except the one named last.

| check | as built | under this design |
|---|---|---|
| 5 `EVIDENCE_CONFIRMED_AND_ANCHORED` | `status = CONFIRMED` and a tx hash | renamed `EVIDENCE_VERIFIED`: VERIFIED(e) for every cited record, reading the stored attribution verdict per capture; hard |
| 6 `EVIDENCE_TIER` | tier ≥ 2, reports itself non-binding | RETIRED with the tier (§3) |
| 17 `EVIDENCE_DIFF_INPUT_SOUND` | survival of the diff row | unchanged in name; judges CURRENT(e.record)'s chunks, so it binds on every DIFF record — there is no other kind of diff evidence; hard |
| new `EVIDENCE_PINNED_CURRENT` | — | CITATION_CURRENT(m) for every EVIDENCE mention and every gap resolution; a stale pin names the affirmed and current hashes; hard |
| new `EVIDENCE_ARGUED` | — | ARGUED(m): the mention's debate is PROMOTED for this thesis and this record, and the version cited equals what the argument was made against; hard |
| new `EVIDENCE_NOT_WITHDRAWN` | — | `status = PROMOTED` for every cited record; a withdrawn one names its reason; hard |
| new `EVIDENCE_DERIVED` | — | CURRENT is defined for every cited record — no AWAITING_DERIVATION; the failure says the walk owes a version and names the diff, so nobody hunts for a contradiction that does not exist; hard |
| `RATIONALE_SUBSTANCE` · `TRAJECTORIES_*` · `FIGURES_HEDGED` · the rest | | untouched — they judge prose, trajectories and figures, none of which this design changes |

**PUBLISHABLE(m) is these six checks, and a version is publishable iff every EVIDENCE mention
is.** The predicate and the gate are one implementation: the checks CALL the predicates of A3
and never re-derive them — a second spelling of VERIFIED inside the gate is the copy that
drifts.

**The one non-binding arm, and it says what it is.** A mention of a DOCUMENT record — the
parked class, should it ever exist in the rebuilt database — passes `EVIDENCE_VERIFIED`,
`EVIDENCE_PINNED_CURRENT` and `EVIDENCE_DERIVED` with `binding: false` and a summary naming
the class it cannot cover, the shape the integrity board demotes rather than hides.

**After publication nothing re-runs.** A published version is pinned to what it cited. FLAGGED
is derived on every read of it (A3) and rendered beside the citation; `check_publication_
readiness` asked about a PUBLISHED version reports its flagged mentions as information, and
writes nothing.

**`audit_thesis_claims` and `verify_claim_text` are unchanged**: they test the thesis's prose
against the archive, which is a different question from whether its citations stand.

### A7. The instruments, and what each turns from a claim into a measurement

Every instrument runs read-only inside a deployment, environment stated twice (`CLAUDE.md`),
and writes its own ledger record. **None is proven until it has been observed to FAIL** (plan
§4): each lands with the breakage that makes it exit non-zero, recorded in its test.

```
evidence-recomputable      Level 7        npm run forensics:audit-evidence -- --env <env>
  for every Evidence row: RECOMPUTABLE · exactly one record key, matching kind · the affirmed
  version exists on the record · the row's debate is PROMOTED for its thesis
  exit 0: every row passes · exit 1: malformed rows, listed — never repaired
  dependsOn: the identity module (one importable symbol) · this script
  Level 7's second clause — "a summary attributes nothing the page lacks" — has no summary to
  test: evidence carries no prose (§3). It becomes evidence-no-prose, below

evidence-no-prose          Level 7        a schema and source scan, in the test suite
  Evidence has no String column but fileHash and the two keys; no module under src/ writes a
  model's output onto an Evidence row; the OPINION register lives only on DiffContentVersion
  under `classification`

opinions-not-facts         Level 8        a shape test on list_findings' output, in the suite
  `opinion` is a separate object from `current.chunks` and is null when no classification
  exists; no field of it appears at the top level of a diff entry; the tutorial's COMMON_RULES
  cites the same shape

thesis-cites-verified      Level 9        npm run forensics:audit-theses -- --env <env>
  for every PUBLISHED version: PUBLISHABLE(m) for every EVIDENCE mention, and FLAGGED
  exit 0: every published citation publishable and unflagged · exit 2: flagged citations —
  an expected state, listed with their flags, not a failure · exit 1: a published version
  citing a record that is not VERIFIED or not ARGUED — impossible after the rebuild, and the
  exit that proves the gate held

anchors-explainable        Level 10       npm run forensics:audit-registry -- --env <env>
  walks the LIVE registry 0..totalEvidence()-1: every entry's category = ANCHOR_SCHEME and a
  capture row holds its hash as documentHash — explained by the corpus; then every FROZEN
  registry named in the committed ledger: every index explained, count = totalEvidence()
  exit 0: every entry on every registry explained · exit 1: an unexplained entry, by index
  — the check that turns "one registry, forever" into "every registry, explained"

audit-anchors              Level 3        re-based: VERIFIED per capture reads ATTRIBUTED
  from chain state; confirm-anchors, which read receipts, is RETIRED (§8)
audit-survival             Level 5        over versions: every diff has a CURRENT version — no
  AWAITING_DERIVATION older than the last walk — and it carries survival per chunk
```

**The measurements of §10 are instruments too**, and they are read-only by construction:

```
forensics:measure-extractor-equality -- --env <env>    per capture: extract(document) = contentHash
forensics:count-index-lag -- --env <env>               from the survey's rows: appended earlier
                                                        than the page's latest ACQUIRED
forensics:emit-registry-ledger -- --env <env>          §8 step 2: writes a FILE for git, never a
                                                        row; refuses if any index is unexplained
```

**The acceptance suite holds these on every refactor step**, as the flows' suite holds its
invariants — a step that breaks one is not a step:

- the walk never writes evidence: no module under the walk imports an evidence writer, and
  `Evidence`, `EvidenceDecision`, `ThesisMention` have no writer outside `promote_from_debate`,
  `review_evidence` and the thesis version write — a source scan
- no research act reaches the chain: the registry's `submit` has ONE caller, the walk's
  anchoring, and `WRITES_ALLOWED` is evaluated in it — a source scan and a test that breaks
  it by pointing the configuration at a contract whose index 0 is not the scheme
- every predicate of A3 has one importable symbol and the publication gate calls it — a
  source scan that fails on a second spelling of VERIFIED, CURRENT or PUBLISHABLE
- the retired names of A4 do not exist as tools, routes or exports — the retired-names scan
  the factual layer's step 0 already runs, extended by this list
- nothing deletes: no `delete` or `deleteMany` on the evidence tables outside the rebuild's
  cleanup script, which is not under `src/`
- a citation may only pin `affirmed`: the thesis version write refuses otherwise, and a test
  moves `affirmed` between two writes and watches the second refuse
