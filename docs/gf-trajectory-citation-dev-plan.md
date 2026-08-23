# Glass Fortress — Citing a Claim Trajectory

**Status:** designed, not built. Canonical spec — implement from this document.
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
discards roughly 42% of the page** (measured: 4,322 characters of 7,442 on capture
`20220905111109`). A change in a dropped region is invisible, and because Readability's boundaries
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
