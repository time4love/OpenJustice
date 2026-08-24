# Trajectory state — implementation reasoning

Written for whoever picks this up next, including a later session of mine with none of the
context that produced it. It records *why* the code is shaped this way, because the shape is
not obvious and several of the obvious alternatives are wrong for reasons that took a live
failure to discover.

Companion documents: `gf-researcher-playbook.md` Steps 13–15 (the transcript and findings 24–29)
and `gf-trajectory-state-review-request.md` (the questions put to the session that built the
table).

---

## 1. What a trajectory is, and where it sits

Four layers, and the distinctions carry weight:

| Layer | Hash | Claim | Anchored |
|---|---|---|---|
| `TrackedUrl` | — | identity only | — |
| `UrlSnapshot` | `SHA-256(fullText)` | "this page held exactly this text on this date" | yes, automatically |
| `UrlVersionDiff` | none | "between these snapshots, this changed" | no — derivable |
| `Evidence` | `SHA-256(url+date+deleted+added)` | "this change is evidence" | yes, on promotion |

A **trajectory** follows one assertion across *all* snapshots. It is derivable from anchored
snapshots, like a diff, so it is not anchored. It is an interval with internal structure, so it
is not an `Evidence` row — `Evidence` is point-in-time by construction (one `evidenceDate`, one
`urlVersionDiffId @unique`, one hash over one document).

**Do not "simplify" this by promoting trajectories into `Evidence`.** It is the first idea
everyone has, it makes every downstream tool work for free, and it is wrong twice: it forces an
interval into a point shape, and it puts an LLM in charge of summarising a deterministic
finding. The second is not hypothetical — see §6.

## 2. Why detection is deterministic, and why that must not erode

Presence is a raw string search against `UrlSnapshot.fullText`. No model. This is the only
artifact in the system that a reader can verify **without trusting the platform at all**:
*"open these archived snapshots and search for this string."*

Extraction is used only to **discover** which claims are worth following — never to decide
whether one is present. Testing presence against AI-extracted items would make a trajectory
depend on extraction quality and drift whenever that prompt changed.

Everything else here is a model's judgment. Protect this.

## 3. The state hash

```
sourceStateHash = SHA-256(
    "detection="  + DETECTION_VERSION
  + "\n" + "snapshots="  + orderedWaybackTimestamps.join(",")
  + "\n" + "candidates=" + sortedCandidateClaimHashes.join(",")
)
```

Three inputs, each able to move without the others:

| Input | Changes on |
|---|---|
| ordered snapshot set | a scan |
| candidate claim set | a scan **or a reclassification** |
| `normaliseClaim` / `MIN_CLAIM_LENGTH` | a deploy |

**The second row is the one that is easy to get wrong.** "A trajectory is stable until the next
scan" is nearly true and produces a broken cache: candidates come from `UrlVersionDiff`
extraction, and `npm run forensics:reclassify` rewrites extraction without touching the archive.
Keyed on the scan, a reclassification would be served stale trajectories forever, silently.

Two details that are load-bearing:

- **Candidate hashes are sorted.** Discovery order is an artifact of which diff was iterated
  first, not part of the state. Unsorted, two identical passes hash differently, the cache never
  hits, and every call pays the full recompute while appearing to work.
- **The fields are delimited.** Without separators, `('ab','c')` and `('a','bc')` collide. There
  is a test for this; it looks pedantic and is not.

`DETECTION_VERSION` must be bumped on **any** change to how detection works, and it is
deliberately not a list of named parameters. The first version enumerated `normaliseClaim` and
`MIN_CLAIM_LENGTH` — and missed the presence test itself (`normalisedText.includes(...)`), which
is detection logic just as much: swap it for fuzzy or positional matching and every stored
trajectory changes while an enumerating hash stays identical. Enumerating knobs is precisely the
drift `classifierPromptHash` exists to prevent one layer down, so this takes the same shape: one
version covering the whole procedure.

## 4. Why the stamp is also the version key

This is the part worth understanding before changing anything.

`ClaimTrajectory` originally had `computedAt @updatedAt` and `@@unique([trackedUrlId,
claimHash])` — rows upserted in place. As a cache that is fine. As something a thesis can cite
it is not: **a rescan would change what a published citation means, after publication.**

Every other citable artifact here is immutable by construction. A snapshot is fixed text. A diff
has fixed endpoints. An `Evidence` hash covers fixed content. A trajectory would have been the
only exception, on a platform whose whole claim is that assertions trace to checkable proof.

So the key is `@@unique([computationId, claimHash])`. New state → new `ClaimTrajectoryComputation`
→ new rows. Old rows stay exactly as they were.

The cost is near zero because a new computation is written only when the state actually moves —
a scan or a reclassification — not per call.

**`claimHash` is stable across computations** (it hashes the claim text alone), so the same
assertion can be followed *between* passes. That is what makes "this trajectory changed since
you cited it" answerable rather than just detectable.

## 5. Why `patternHash` is not stored

Groups — "8 claims moved as one unit", the stronger evidentiary claim — are derived at read,
never persisted.

`patternHash` hashes the presence **vector**. Add one snapshot and the vector grows, so the hash
changes. It has no stable identity and cannot be a citation target or a cache key. Grouping is a
pure function of stored per-claim rows, so deriving it at read costs nothing and cannot drift
from the rows it summarises.

## 6. What every reasoning tool now receives, and why it is shaped that way

`loadTrajectoryContext(evidence)` → `{ trajectories, coverage }`, wired into
`assess_thesis_framing`, `suggest_thesis`, and the Devil's Advocate.

Evidence reaches a tracked URL through `Evidence.urlVersionDiffId → UrlVersionDiff.trackedUrlId`.
Evidence with no diff — an article, a document — contributes nothing, correctly: nothing archived
it over time.

Four decisions inside this, all of which were mistakes first:

**The precedence rule travels with the data, and it is SCOPED.** Given a trajectory and a
model-written summary as two blocks of text, a model weighs them equally — which is the entire
error being fixed. But the first version of the rule was too strong: *"the trajectory governs"*,
full stop. A trajectory is authoritative on **whether this exact string was in the page text at
this capture** and on nothing else. It knows nothing about position, prominence, or whether the
claim was being made to the reader — text in a nav menu or a footer reads as "present" like any
other. So a conflict means the summary's assertion *about presence* is wrong; it does **not**
follow that its interpretation is. The motivating failure was a pure presence question, so the
narrower rule covers it completely and claims nothing it cannot support.

Putting this in a system prompt would describe a section that is sometimes absent, and a rule
about an absent section quietly stops applying.

**The parameter is required, not defaulted.** `trajectories: TrajectoryBundle = {…empty}` would
let any call site silently reason without the strongest layer in the vault — the exact defect
being closed. Required turns the compiler into the thing that finds the call sites. It found
both immediately. (Same reasoning made `maxRetries` required in the retry work: a default is how
a wrong value gets inherited by forgetting.)

**Overlap is matched at the ITEM level, by claim hash.** It was first matched by **date**,
flagging a whole `Evidence` record as non-independent. That is wrong, and the reason generalises:
since categories moved to the item, one diff holds many items each with its own classification.
A record sharing 8 of 14 items with a trajectory says nothing about the other 6 — which may
include a claim significant on its own (removed once and never restored, so never a trajectory;
or under the length threshold, so never a candidate).

> Flagging the record as a unit tells a model to discount all fourteen. That is the
> classifier-bundling defect repeated one layer up, committed while guarding against it.

So the output states **both halves**: which items overlap, *and* how many classified items no
trajectory covers.

**Two rules govern the coverage claim set, and both were wrong first — in opposite directions:**

- **Scoped to one page.** Accumulating claims across the loop over URLs let a claim on page B
  mark an item on page A as covered. Two government pages can share 40+ characters of
  boilerplate, and one page's text oscillating says nothing about the other. Over-matching
  *understates* independent evidence — the direction that loses a finding.
- **Drawn from every group, not the rendered ones.** Groups are capped per URL for display; the
  first version built the coverage set from that capped slice, so an item covered by group 9+ was
  reported independent. The corona page produces 15 groups against a cap of 8. Under-matching
  *overstates* corroboration.

> **Truncation applies to what is rendered, never to what is reasoned over.**

`omittedGroups` is reported and rendered, stating that the omission is display-only — a reader
told "7 not shown" would otherwise discount the coverage counts too. A truncated set that carries
no marker makes a partial answer look complete.

And where they *do* overlap, the claim is scoped to **page state**. An evidence record also
carries classification, tier reasoning, correlation to dated external events and key figures,
none of which a trajectory duplicates. "One observation" unqualified invites a model to discount
the interpretation too — the same over-reach one notch smaller.

**Matching is exact hash first, containment second.** Extraction genuinely emits nested quotes:
one real trajectory group contains both a sentence and that sentence plus the paragraph after
it. Exact hashing calls them unrelated, so an item carrying the longer form is counted
INDEPENDENT while being wholly covered — which *overstates* corroboration, the dangerous
direction for a signal feeding evidentiary weight. Containment is not fuzziness (`a.includes(b)`
is exact about a real relation) and is guarded by the length threshold: a short string is a
substring of unrelated claims by accident, and a false match discounts a classified item, which
is the direction that **loses** a finding.

**`trajectoriesConsidered` is reported beside `evidenceConsidered`.** The original failure was
invisible: the assessor did not say it could not see the archive, it produced a confident
citation-backed contradiction. The only tell in the entire response was `evidenceConsidered: 8`,
legible only to someone who already knew. A visible zero next to a corpus of forensic evidence is
now the signal — the same fix as returning `significantCount` from the server rather than letting
the client count what it had loaded.

## 7. Storage threshold: store everything, filter on read

Every detected trajectory is stored, including 0- and 1-transition ones. Only the *answer* is
filtered by `minTransitions`.

Storing only what the current threshold returns makes the cache depend on the query: a later call
with `minTransitions: 1` would be served from rows that never contained the others, and the
incompleteness would be invisible. ~58 rows per URL instead of ~47 — irrelevant.

## 7b. Who is allowed to write

Two entry points, named so that the call site says which it is:

| Function | Writes | Used by |
|---|---|---|
| `getStoredClaimTrajectories` | **never** — returns null on a miss | the public REST route |
| `getClaimTrajectories` | on a miss | scan completion, the gated MCP tool, `loadTrajectoryContext` |

This is not stylistic. The first version shipped one function that wrote on a miss and left
`get_claim_trajectories` in `READ_TOOLS` — **an unauthenticated caller could write rows**, and
`mcpToolClassification.test.ts` could not catch it: that guard asserts every tool is classified
exactly once, never that a classification still describes what the tool does.

A boolean option would have left the distinction invisible at the call site. A name cannot be
read past.

The public route reports `state: 'NOT_COMPUTED'` rather than an empty result, because "not
detected yet" and "nothing oscillated" are opposite answers that look identical as an empty
list. The UI makes the same distinction.

Detection also runs when a scan completes — after the job is marked `COMPLETED`, and swallowed
on failure. A scan that fetched and stored every snapshot has succeeded; failing it because a
derived, recomputable view could not be built would strand the archived text, which is the
expensive and irreplaceable half.

## 8. Concurrency

Two concurrent misses race to write the same `(trackedUrlId, sourceStateHash)`. The loser catches
`P2002` and reads the winner's rows. This is safe **by construction, not by luck**: both computed
against the same state hash, so the answers are identical. It matters because the endpoint answers
anonymously.

## 9. Known holes

- **Citation is open.** `MentionType` has no `CLAIM_TRAJECTORY`. A thesis can cite a trajectory in
  prose and be perfectly checkable; it cannot do so structurally. This will surface at
  `create_thesis_draft`.
- **Never run `prisma format`.** It reformats the whole schema and buries a small change in
  hundreds of unrelated lines. This was caught and reverted in PR #99 and recurred here at 3x the
  size. On a repo where migrations deploy themselves, an unreviewable schema diff is how a bad
  migration gets waved through. Edit the schema by hand.
- **Containment matching is capped by the length threshold.** Items under `MIN_CLAIM_LENGTH`
  are never matched by containment, so a short classified item nested inside a covered claim is
  reported independent. Chosen deliberately: the alternative direction discounts a classified
  item, which loses a finding.
- **Presence is page-wide.** A claim's text appearing in navigation, a footer, or a duplicated
  block reads as "present" even if it is gone from the substantive section. `MIN_CLAIM_LENGTH = 40`
  mitigates and does not solve it.
- **The endpoint is anonymous.** Cheap on a hit; a miss is still an unbounded read anyone can
  trigger.
- **Independence is asserted, not computed.** The strong version derives it structurally: two
  findings resting on disjoint sets of `UrlSnapshot` hashes are independent by construction, no
  heuristic and no model judgment. Not built.
- **Nothing detects a summary that contradicts the text it describes.** An anchored record
  currently claims the page presented side effects as *passing within* a day or two; the archived
  capture contains no such word and says they *appear* a day or two after. Onset read as duration,
  an allegation built on it, and a downstream tool repeated it. Correctable without touching the
  chain — the evidence hash covers `url + date + deleted + added`, not the prose — but the
  detector is the valuable part and does not exist.

## 10. The one-paragraph version

Trajectory detection is a pure function of (snapshots, candidates, detection procedure). Hash
those three into a `sourceStateHash`; that hash is both the cache key and the version key, which
makes detection a read instead of a 4-second rescan **and** makes a cited trajectory immutable.
Store every trajectory and filter on read. Derive groups, never store them. Keep the writing and
non-writing entry points as separate named functions, because a cache miss inserts rows and a
public caller must not. Feed trajectories to every tool that reasons over a corpus, carrying a
precedence rule that is explicit **and scoped to presence** — a trajectory is authoritative on
what string was on the page, not on what it meant. State at the item level both what a trajectory
covers and what it does not, because an evidence record is many assertions, and discounting all
of them because some overlap is how a finding gets lost.
