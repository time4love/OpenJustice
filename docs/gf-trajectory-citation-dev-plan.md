# Glass Fortress — Citing a Claim Trajectory

**Status:** BUILT 2026-08-24 on `feat/gf-trajectory-citation`. §8 records what was built and what
the build found. Canonical.
**Designed:** 2026-08-23 with the researcher. Written for a session with **no prior context**.

---

## 1. Why

A thesis cites by `fileHash`. `ThesisMention` knows `KEY_FIGURE | EVIDENCE | TRACKED_URL`. **A claim
trajectory is none of those**, so it cannot be cited at all.

This was parked twice as a plumbing question. It is not. It was confirmed live on 2026-08-23, while
the first real thesis was being written:

> **The two most rigorously verified claims in the thesis are the two that cannot be cited.**

Both come from trajectory data and both are currently asserted with no citation behind them:

- the removal is located to the interval between the **2022-07-24** and **2022-08-05** captures;
- the claims then stayed absent across **seven further captures**, until the 2022-09-05 capture.

Meanwhile every weaker, model-summarised claim cites cleanly. A citation system that can express a
model's characterisation of a change but not a deterministic string search across the whole archive
has its incentives exactly backwards.

## 2. What already exists

`ClaimTrajectory` is stored and versioned. Read `docs/gf-trajectory-state-implementation.md` before
starting — it explains the state hash and why the identity is shaped as it is. The parts that
constrain this design:

| | |
|---|---|
| `ClaimTrajectory` | one row per claim **per detection pass**, unique on `(computationId, claimHash)` |
| `ClaimTrajectoryComputation` | the pass, keyed by `sourceStateHash` over (snapshots, candidates, detection version) |
| `claimHash` | SHA-256 of the normalised claim text — **stable across passes** |
| `patternHash` | SHA-256 of the presence **vector** — **changes when a snapshot is added** |
| Groups | derived at read by `groupByMovement`, never stored |
| `observations` | JSON: every snapshot examined, in order, present true/false — **the absences are half the finding** |

## 3. Design

### 3.1 `refId` is `ClaimTrajectory.id`, not `claimHash`

A row belongs to exactly one computation, so citing its id **pins the detection pass**. A cited
trajectory resolves to what was cited, permanently — the same property that made the evidence
identity worth migrating.

`claimHash` would follow the claim across recomputations and let a citation silently change meaning:
a thesis saying "removed and never restored" would quietly become false when a later scan found the
claim returning. That is the failure mode the computation versioning was built to prevent; do not
reintroduce it at the citation layer.

**But the render must also look forward.** Given a cited row, find the newest computation containing
the same `claimHash` and report whether the trajectory has changed since it was cited. Pinned for
integrity, current for honesty — both, and labelled.

### 3.2 Cite claims; render groups

`patternHash` is not a stable identity (§2), so a group cannot be cited directly.

A thesis citing an 8-claim co-movement **cites all eight member rows**. The renderer regroups them
with the same pure function used at detection time, and displays *"8 claims moved as one unit."*
Nothing unstable is persisted, and the stronger evidentiary claim — co-movement — survives.

### 3.3 The honesty requirement — non-negotiable

Trajectories are computed over `UrlSnapshot.fullText`, which is a **Readability extraction that
discards 31% of the page** (measured: 4,330 characters of 6,266 on capture `20220905111109`).
The ratio is context, not the finding — it mixes boilerplate Readability is meant to drop with
substantive sentences it is not. The finding is that a specific FDA safety-and-efficacy claim was
dropped. A change in a dropped region is invisible, and because Readability's boundaries
follow page structure, a trajectory can show a flip that is a **layout change rather than a content
change**.

Therefore a rendered trajectory citation:

- **must not** say "the page contained X on this date";
- **must** say what the archived-text extraction contained;
- **must** link the archived capture so a reader can check the page itself.

Getting this wrong would give an extraction artifact the authority of a forensic finding, on the one
layer the platform presents as requiring no trust. If only one sentence of this plan survives
review, make it this one.

### 3.4 Sequencing note

Trajectory citations become genuinely trustworthy only once `verify_claim_text` exists
(`docs/gf-verification-tools-dev-plan.md`) to check a cited claim against **raw** archived HTML
rather than the extraction. Not a blocker — build this first if you prefer — but the two together
are worth considerably more than either alone, and §3.3 is the reason.

## 4. Build

1. **Expose citable ids.** `get_claim_trajectories` currently returns `{claimHash, claimText}` per
   claim and **no row id**, so a researcher cannot obtain a citable identifier. Return the
   `ClaimTrajectory.id` per claim and the computation's `sourceStateHash` on the group.
2. **`MentionType.CLAIM_TRAJECTORY`**, `refId = ClaimTrajectory.id`. Update the `refId` comment,
   which currently enumerates the three existing types.
3. **Draft tools.** `create_thesis_draft` and `add_thesis_version` take `citations[].trajectoryIds[]`
   alongside `fileHashes[]`, and a top-level `trajectoryIds[]` mirroring `evidenceHashes[]`. A
   footnote may cite evidence and trajectories together — the strongest paragraphs will.
4. **`get_thesis_context`** returns trajectory mentions **structured**: claim text, observations,
   snapshot URLs, the group it belongs to, and whether a newer computation disagrees. Never a raw id
   for the client to resolve.
5. **Render.** A trajectory chip showing the co-movement count, the flips, the final state, and
   every archived snapshot URL — with §3.3's wording. Restatement of what a trajectory is belongs
   here, because this is the first place a reader meets one.

## 5. The publication gate

Check 5 requires cited evidence to be `CONFIRMED` **and anchored on-chain**. **Trajectories are
deliberately not anchored** — they are derivable from snapshots that are anchored individually, and
anchoring a derivable thing adds nothing but the appearance of authority. See the schema note on
`ClaimTrajectoryComputation`.

So:

- Check 5 must **not** demand anchoring for trajectory mentions. Applying it unchanged would make
  every trajectory-citing thesis unpublishable.
- **New hard check:** every cited `ClaimTrajectory.id` still exists and its computation resolves.
- **New advisory check:** a newer computation for the same `claimHash` disagrees with the cited one.
  Advisory, not hard — a superseded trajectory is a fact about the archive changing, not a defect in
  the thesis, and the researcher decides whether to re-cite.

## 6. Tests

- A cited trajectory resolves to the **pinned computation** after a later scan writes a new one.
- The render reports "recomputed since cited" when a newer computation disagrees, and does not when
  it agrees.
- Eight cited member rows render as one group with a co-movement count.
- A citation mixing evidence hashes and trajectory ids in one footnote resolves both.
- The publication gate does **not** fail a thesis for citing an unanchored trajectory.
- The gate **does** fail a thesis citing a `ClaimTrajectory.id` that no longer exists.
- `get_claim_trajectories` returns an id per claim and a `sourceStateHash` per group.
- The rendered wording does not assert page content — assert on the absence of that phrasing, since
  it is the one thing a future edit is most likely to "improve".

## 7. Not in scope

- **Anchoring trajectories.** Deliberate, and re-litigating it is a design regression.
- **Citing a group directly.** `patternHash` is unstable; §3.2 is the workaround and it is the right
  one.
- **Citing an abandoned or recomputed-away trajectory.** If the claim no longer resolves, the
  citation is stale and the gate says so.


---

## 8. Built — 2026-08-24

Backend 1308/1308 (was 1270; +38). Backend `eslint src/` 364 → 360. Frontend `tsc` clean, `lint` 0.
`db:check-drift` reports exactly one delta — the enum value the new migration adds — and nothing else.

### 8.1 Two decisions taken before writing code

**Check 4 stays as-is.** `CITES_EVIDENCE` is hard and reads EVIDENCE mentions only, so a thesis
citing *only* trajectories is still unpublishable. That is now a decision rather than an accident: a
thesis resting purely on extraction-derived trajectories, with no anchored record behind it, is
exactly what §3.3 warns about, and requiring at least one CONFIRMED anchored record is a cheap guard.
`create_thesis_draft` says so in its no-evidence warning.

**"Disagrees" is a flip-sequence comparison, and the obvious version of it was wrong.** `patternHash`
changes whenever a capture is added, so comparing hashes would report "recomputed since cited" on
every scan — including the ordinary case where a new capture continues an unchanged history. An
advisory that fires every time is an advisory nobody reads. The rule implemented is:

> Agreement = the cited flip sequence is a **prefix** of the later one, **and** the final states match.

- a capture appended with nothing changed adds no flip → **agrees**;
- the claim comes back → an extra flip and a changed final state → **disagrees**;
- a capture backfilled mid-history, or a re-fetch that changes an old presence → the prefix breaks →
  **disagrees**, which is right: the history itself was rewritten.

A fourth state was needed and is not disagreement: `NOT_FOLLOWED_BY_LATEST`, where the newest pass
does not follow the claim at all (a reclassification can stop surfacing a candidate). The newer pass
makes no statement, so silence must not read as contradiction. Check 15 passes and says so.

### 8.2 What was built

| | |
|---|---|
| `MentionType.CLAIM_TRAJECTORY` | `20260824100000_mention_claim_trajectory` — one enum value, additive, no backfill possible |
| `Trajectory` split | `DetectedTrajectory` (no id) vs `Trajectory` (stored, has id) — an id-less result is now unshapeable |
| `persistComputation` | `createManyAndReturn`, keyed back by `claimHash` rather than by row order |
| `get_claim_trajectories` | `trajectoryId` per claim, `sourceStateHash` per finding |
| `services/trajectoryCitation.ts` | `resolveTrajectoryCitations` · `trajectoriesAgree` · `flipSequence` · `loadTrajectoryCitationLabels` · `TRAJECTORY_EXTRACTION_CAVEAT` |
| `mcp/tools/citationInput.ts` | the citation schema, defined ONCE (see 8.3) |
| draft tools | `trajectoryIds[]` flat and per-footnote; unknown ids refused before anything is written |
| `get_thesis_context` | `trajectoriesCited[]` structured — observations, co-movement, pinned pass, currency, caveat |
| gate | 14 `TRAJECTORIES_RESOLVE` (hard) · 15 `TRAJECTORIES_CURRENT` (advisory) |
| frontend | teal footnote marker + a per-trajectory panel: co-movement count, flips, final state, every capture, the caveat, and a "superseded" note |

### 8.3 What the build found

**The revision path would have silently dropped every trajectory citation.**
`POST /:id/suggest-revision` rebuilds the document from the agent's prose plus evidence hashes plus
key figures. Trajectory mentions were in neither list, so accepting a revision would have deleted the
citations behind the *deterministic* claims while preserving the model-written ones — the same
inversion §1 exists to correct. Fixed by carrying `CLAIM_TRAJECTORY` mentions across explicitly.

**Check 5 never needed changing.** §5 feared it would make trajectory-citing theses unpublishable;
it filters `m.type === 'EVIDENCE'` and always did, so the exemption held by construction. What it
lacked was a *reason on the record*: the header comment and check 5 now say why they read evidence
only, and a test asserts an unanchored trajectory does not block publication — so a future edit
cannot "fix" the scoping without a failure.

**The fresh-compute path could not produce a citable id at all.** `createMany` returns a count, so
until this change a trajectory was citable only on a *cache hit* — the same finding citable or not
depending on whether anyone had asked for it before. The test mock now returns ids, so a regression
there fails rather than silently reappearing.

**The citation schema had already drifted between the two tools** that alternate to write one thesis:
`positive()` in one, `min(1)` in the other. Now defined once in `citationInput.ts`.

**The frontend has no test runner**, so the §6 wording test reaches into
`frontend/messages/{he,en}.json` from a backend suite (`test/trajectoryRenderWording.test.ts`) and
asserts the absence of page-asserting phrasing in both locales, plus locale parity. Reaching across
packages is deliberate: that is where the human-facing wording lives, and §3.3 is the one thing a
future edit is most likely to "improve" into a stronger, false claim.

### 8.4 Not done

- **Trajectories are not in the publication assessor's input** (checks 10-12). The model still sees
  evidence only. Out of scope here; worth doing when the assessor is next revisited.
- **No live run against staging yet.** Everything above is unit-level. The finding-per-finding record
  of this platform is that live use against real data finds what tests cannot.


---

## 9. `cite_trajectories` — citing a claim already written (2026-08-24)

§4 built the ability to cite a trajectory *while writing*. It did not make an already-written thesis
citable, and that turned out to be the whole of the repair problem for the first real thesis.

### 9.1 The gap, measured on the real document

`add_thesis_version` takes `body` as Markdown. The stored head of
`cmt5jffqy000lf52mn6t56f3l` is TipTap JSON: **3,905 characters, 3 headings, 9 paragraphs, a bullet
list, 18 inline `evidenceMention` nodes across 7 distinct hashes, 3 key figures.** Nothing returns
that as Markdown:

- `get_thesis_context` returns `content` as raw TipTap JSON;
- `extractText` — the only serializer that exists — collapses `\s+ → ' '` and renders mentions as
  literal `#ev_0x…` text.

So adding one citation through `add_thesis_version` meant retyping the whole thesis by hand, in
Hebrew, past seven working citations, with a serializer that would flatten it. Retyping a document to
add a footnote is how the four factual errors caught on 2026-08-23 got there.

### 9.2 The design: anchor, splice, and assert the prose did not move

`cite_trajectories({thesisId, placements: [{anchorText, trajectoryIds}]})`.

- `anchorText` is an **exact substring of the existing prose**. It must occur **exactly once** in the
  document. Zero matches or several is a **refusal**, never a guess — "probably that sentence" is not
  a property a citation may have.
- The splice inserts mention nodes after the anchor, splitting the text run and **carrying its marks**
  so bold prose stays bold.
- Afterwards the concatenated prose is compared to the original and the write is **abandoned if a
  single character moved**. That is a runtime guard in `spliceTrajectoryMentions`, not only a test.
- **All-or-nothing.** One bad anchor refuses the whole call: a partly-applied citation edit leaves a
  version nobody asked for.
- An anchor unique in the prose but **split across formatting runs** (a `**bold**` span cuts the
  sentence into three) is reported `NOT_FOUND` rather than silently skipped — otherwise the tool would
  report success on a version with no citation in it.

Also refused, each writing nothing: an unknown thesis, a thesis with no version, an id matching no
row, and an id **already cited** by the head version (a second marker for one finding reads as two
findings).

**It still writes a new version.** A version's `contentHash` is what publication pins, so a citation
set that changed under a fixed version id would make the pin meaningless. The new version is
`PENDING_AI`: the Devil's Advocate critique names what the thesis cites, and the citations just
changed.

**Co-movement completeness is reported, never enforced.** Citing 1 of 10 claims that moved as one unit
is a weaker claim than the archive supports — but which members belong in a given sentence is the
researcher's judgement, not the tool's.

### 9.3 Still missing, deliberately

A faithful **TipTap → Markdown serializer** (the inverse of `buildTipTapDoc`, with a round-trip
property test) exposed as an `editableSource` on `get_thesis_context`. That is what any *prose* edit
over MCP needs, and it becomes required if thesis editing moves out of the UI
([[gf-ui-vs-mcp-boundary]]). It is deliberately not a prerequisite for citing: putting a
document-rewriting serializer between a researcher and a footnote is the risk this tool removes.

### 9.4 The staging repair this unblocks

Thesis `cmt5jffqy000lf52mn6t56f3l` — DRAFT, one version, 7 evidence + 3 figure mentions, **0
trajectory mentions**. Both uncited claims were re-verified against the archive rather than taken from
the prose (computation `cmt5b3gji0005jdk4p4wi2lu8`, 83 snapshots):

| The thesis says | The archive |
|---|---|
| present 24 Jul, gone by 5 Aug | `2022-07-24 PRESENT` → `2022-08-05 absent` ✔ |
| absent across **seven further captures**, until 5 Sept | 08-07, 08-10, 08-13, 08-15, 08-16, 08-16, 09-05 — seven, all absent ✔ |
| changed again between 5 and 6 Sept | `2022-09-06 PRESENT` ✔ |

Both sentences are correct as written. The citation is group `3313cbaa` — **10 claims moving as one
unit** (`cmt5b3gsl000ijdk4k0z9s3fa` and nine siblings). Note two captures share 2022-08-05 and two
share 2022-08-16, so "seven" is exact under "captures after 5 Aug up to and including 5 Sept" — worth
keeping in the wording.

Gates: backend **1330/1330** (+22), `eslint src/` 361 — one above the 360 after §8, and that one is
the pre-existing `server.tool` deprecation every one of the 40 registered tools already carries.


---

## 10. The first real trajectory citation — applied 2026-08-24

Thesis `cmt5jffqy000lf52mn6t56f3l` on staging now cites the deterministic layer. New head
`cmt728lod0002g8uulash6lw9`, parent `cmt5jffz6000nf52mpw4uyqvk`, `PENDING_AI`.

### 10.1 The citation set was recomputed, not taken from the prose

§9.4 of this document said the citation was "group `3313cbaa` — 10 claims". **That was too narrow,
and recomputing found it.** The sentence being cited is a UNIVERSAL:

> הטענות שהופיעו בתצלום מ-24 ביולי 2022 ונעדרו מן התצלום מ-5 באוגוסט 2022 נותרו נעדרות לאורך שבעה
> תצלומים נוספים, עד התצלום מ-5 בספטמבר 2022 — כשישה שבועות מן התצלום האחרון שבו הופיעו.

So the question is not "does some group fit that shape" but "does **any** claim with that transition
come back before 2022-09-05" — one counter-example makes the sentence false. Computed against
computation `cmt5b3gji0005jdk4p4wi2lu8` (83 snapshots, 58 rows):

| | |
|---|---|
| present 2022-07-24 **and** absent in the first 2022-08-05 capture | **21** |
| of those, stayed absent through 2022-09-05 | **21** |
| of those, came back before 2022-09-05 | **0** |
| captures strictly after 2022-08-05 up to 2022-09-05 | **7** — 08-07, 08-10, 08-13, 08-15, 08-16, 08-16, 09-05 |

The sentence is true as written, "seven" is exact, and 07-24 → 09-05 is 43 days ≈ six weeks. The
citation is therefore **all 21 rows**, spanning **8 co-movement groups** (10 + 4 + 2 + five
singletons) that share the 2022-08-05 removal and differ in what happened before and after it.

Two captures share 2022-08-05 and two share 2022-08-16, so "seven further captures" is exact under
"captures after 5 Aug up to and including 5 Sept" — worth keeping in the wording if the sentence is
ever revised.

### 10.2 Verified after writing, independently of the tool's own report

- prose **byte-identical**, 2,559 characters, compared with `concatText` over both versions;
- `contentHash` changed (a new version, as publication pinning requires);
- mentions `EVIDENCE=7 CLAIM_TRAJECTORY=21 KEY_FIGURE=3` — the seven original citations survived;
- all 21 resolve, 0 missing, all `PINNED_IS_LATEST`, all pinned to one computation;
- **0 partly-cited co-movement groups** — every group is cited whole.

The anchor was **sliced out of the stored prose**, never retyped: transcription is the risk this
whole tool exists to remove, and it would have been silly to reintroduce it in the one call that
proves the point.

### 10.3 Found by doing it: the render did not collapse a co-movement — FIXED

§3.2 says the renderer regroups cited members and displays *"N claims moved as one unit."* The
implementation shipped in §8 rendered **one marker and one panel card per mention**, so this citation
rendered as **21 superscript markers and 21 cards**, ten of which said "10 claims moved as one unit"
separately. The data was right and the reading was wrong — one finding reported as twenty-one.

Only citing a real co-movement exposed it. Every test written for §8 cited one trajectory at a time,
which is the shape the bug is invisible in.

Fixed in three parts:

- `buildTrajectoryMap` carries `coMovementKey` (the pattern hash) to the client;
- `buildCitationNumbers(doc, groupKeyOf)` assigns **one footnote number per group**, so the members
  of a co-movement share a marker;
- `collapseCoMovementRuns` drops the repeats inside a **consecutive run** of trajectory mentions
  citing the same movement. Scoped to a run on purpose: citing the same movement again elsewhere in
  the thesis is a second citation and still gets its marker.

Both functions live in `lib/citations.ts` rather than in the component — dependency-free, so they can
be exercised against a real stored document without mounting React. The frontend has no test runner,
so that is exactly how this was verified: the real functions, run over the real head version and its
real trajectory map.

| | |
|---|---|
| trajectory mention nodes in the document | 21 |
| distinct co-movement groups cited | 8 |
| **markers actually rendered** | **8** |
| their footnote numbers | 6–13, with evidence keeping 1–5 and 14–15 |

The panel renders one card per group, listing that group's cited claim texts above the shared flips,
final state and captures — the fields members of a co-movement share by definition.
