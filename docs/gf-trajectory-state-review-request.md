# Review request — trajectory detection becomes stored, versioned state

> **REVIEWED, and every finding acted on.** The outcome is recorded at the end of this
> document; the questions below are left as they were asked, because the answers only make
> sense against them. The review caught a defect that would have shipped: the tool was still
> classified as a read while it had started writing.

**To the session that designed and built `ClaimTrajectory`.** You made three decisions
deliberately and documented all three. This change keeps two of them, overturns the third, and
uses the table you left ready for a purpose other than the one you left it ready for. That is
worth a second pair of eyes from the context that made the original calls, because I only have
what you wrote down — and what you wrote down was good enough that I changed my first plan
after reading it.

## What you decided, and what I did with it

| Your decision | Status |
|---|---|
| **Not an `Evidence` row** — *"Evidence is point-in-time by construction… a trajectory is an interval with internal structure"* | **Kept.** My first instinct was to promote trajectories into `Evidence` so every existing tool would pick them up for free. Your note stopped it. It would have forced an interval into a point shape and, worse, handed a deterministic finding to an LLM to summarise — which is precisely how the defect in §"What went wrong" below was created. |
| **Not anchored on-chain** — *"derivable from snapshots already anchored individually; an anchor would add nothing but the appearance of authority"* | **Kept**, unchanged. |
| **Not persisted** — *"storing the result would only create a second copy that can fall behind the snapshots it describes, and a write path with no reader invites someone to build on rows produced by an older detection pass"* | **Overturned.** The reasoning below is the part I most want you to attack. |

## What went wrong, which is why this exists

A researcher opened a framing session on whether the Ministry of Health revised its public
safety representations in step with what it knew internally. They proposed a framing including
the claim that safety commitments were *removed and then restored*.

`assess_thesis_framing` contradicted them, citing an anchored evidence record: no restoration
is documented, only escalation and deletion.

Checked against the archive directly — both captures confirmed by `memento-datetime` to be the
exact ones requested — five claims were **absent on 2022-08-05 and present again on
2022-09-06**, including a categorical safety assurance and the fourth-dose efficacy figures.
The researcher was right.

The assessor's corpus is `prisma.evidence.findMany({ status: 'CONFIRMED' })` and their
AI-written summaries. **It could not see a trajectory.** The deterministic layer that would
have proved the researcher right was not merely deprioritised in its reasoning — it was absent
from the input.

A second defect surfaced in the same check: the cited record's summary describes the page as
presenting side effects as *passing within* a day or two. The root *חולפ* appears **nowhere** in
that capture; the text says they *appear* a day or two *after*. Onset was read as duration, an
allegation was built on the inversion, and the assessor repeated it.

## The premises that changed

Your objection to persistence — a second copy that can fall behind — was correct. Two things
have changed since:

**1. It is not cheap.** Measured against staging:

| | |
|---|---|
| Rows ever written to `ClaimTrajectory` | 0 |
| Recompute per call | **3.4 – 5.0 s** — ~2 MB of snapshot `fullText` out of Postgres, ~4,800 substring searches |
| Two consecutive calls | byte-identical output, 46,938 bytes |
| Authentication on `get_claim_trajectories` | **none** |

An unauthenticated caller can trigger a multi-second full-text scan in a loop. The
cost-exposure sweep that gated `suggest_thesis` looked for anonymous *LLM* calls and would not
have caught an unbounded database read.

**2. Citation was not the only justification.** You wrote *"the one argument for persistence was
a stable identity for theses to cite — and citation is deliberately still open."* Corpus
visibility is a second, and it is the one that actually bit.

## The design, and the researcher's correction to it

The cache key is a `sourceStateHash` over three inputs:

| Input | Changes on |
|---|---|
| the ordered snapshot set | a scan |
| the candidate claim set | a scan **or a reclassification** |
| `normaliseClaim` / `MIN_CLAIM_LENGTH` | a deploy |

The researcher's first formulation was "state computed after a scan, stable until the next
scan." The second row is why that is not enough: candidates come from `UrlVersionDiff`
extraction, and `forensics:reclassify` rewrites extraction **without touching the archive**. A
scan-keyed cache would serve stale trajectories straight through a reclassification, silently.

This is the same organ as `classifierVersion` + `classifierPromptHash`, for the same reason.

**The stamp also answers a problem your schema has today.** `computedAt @updatedAt` with
`@@unique([trackedUrlId, claimHash])` means rows are upserted in place. Once anything cites a
trajectory, a rescan changes what the citation means, after publication. Everything else
citable here is immutable by construction — a snapshot is fixed text, a diff has fixed
endpoints, an `Evidence` hash covers fixed content. A trajectory would have been the only
exception. So the key is now `@@unique([computationId, claimHash])` and a new state writes a
new computation rather than mutating the old one.

**The table held zero rows, so changing that key cost nothing.** It never will again.

## Questions where your context decides the answer, not mine

1. **Is the three-input model complete?** If there is a fourth thing that changes a trajectory's
   value, the cache is wrong and so is the version key. `parseDiffItems` normalising two legacy
   column shapes forward is the case I looked hardest at and concluded is covered — a legacy row
   yields the same candidates on every parse — but you know the column's history and I do not.

2. **Was immutability considered and rejected, or not considered?** `@updatedAt` reads to me
   like "this is a cache", but you wrote the table for citation, where mutation is the thing you
   least want. If there was a reason to prefer upsert-in-place, I have overturned it without
   knowing it existed.

3. **You reserved the table for citation. I have used it for caching and corpus visibility and
   left citation open.** `MentionType` still has no `CLAIM_TRAJECTORY`. Does using the table for
   this cut across what you intended, or does versioning make citation easier later?

4. **Storing sub-threshold trajectories.** I store every detected trajectory including 0- and
   1-transition ones, so `minTransitions` stays a read filter — otherwise the cache depends on
   the query and lowering the threshold serves a silently incomplete answer. That is ~58 rows
   per URL rather than ~47. Any reason you would not?

5. **`patternHash` is not persisted.** It hashes the presence *vector*, so adding a snapshot
   changes it — no stable identity. Groups are therefore derived at read from stored per-claim
   rows, the same deterministic function as at compute time. Agree, or is there a stable group
   identity you had in mind that I have missed?

6. **Is the precedence rule too strong?** Agents are now told: *where a trajectory and an
   evidence summary conflict, the trajectory governs and the summary is wrong.* That is right
   for the failure that motivated it. The case I am least sure of is a claim whose text also
   appears in navigation, a footer, or a duplicated block — presence is a raw string search over
   `fullText`, so the trajectory would report "present" for text that is no longer present *in
   the substantive section*. `MIN_CLAIM_LENGTH = 40` mitigates it; you wrote that threshold and
   flagged it as worth revisiting once there were real trajectories. There are now 15.

7. **The overlap match is by exact claim hash, and I think this has a real hole.** Overlap
   between a trajectory and an evidence record is computed by hashing the record's own diff
   items and intersecting with the trajectory's claim hashes. Candidate discovery hashes the
   same `item.exactQuote`, so items that *became* candidates match exactly. But an item whose
   quote **contains** a trajectory claim as a substring — or is contained by one — will not
   match, and will be counted as independent when it is not. I chose exact matching over
   substring matching because substring matching is O(n·m) and would reintroduce fuzziness into
   the one place here that is exact. Is that the right trade, or does the extraction pipeline
   produce nested quotes often enough to matter?

## The correction the researcher already made, recorded so you can check whether it went far enough

Overlap was first computed by matching **dates**, flagging a whole `Evidence` record as *not
independent corroboration*. The researcher rejected it:

> *"a trajectory describes only the evidence info that was added/removed, while evidence could
> have other information… we may have a diff in evidence that is important but is not present in
> a trajectory."*

They are right, and it is worth naming what it was: since categories moved to the item, one
diff holds many items each with its own classification. A record sharing eight of fourteen
items with a trajectory says nothing about the other six, which can include a claim significant
entirely on its own — removed once and never restored, so never a trajectory; or under the
length threshold, so never a candidate. Flagging the record as a unit tells a model to discount
all fourteen.

That is **the classifier-bundling defect repeated one layer up**, committed while building a
guard against a different instance of it.

It now reports both halves: *"8 of 14 items are a trajectory's claims — for those, the
trajectory and this record are one observation. 6 classified items are covered by no trajectory
and are independent evidence."* Coverage is computed against **every** trajectory, not per
group, or an item covered by group B would be reported independent because group A missed it.

**Please check whether that is now correct, or merely less wrong.**

## Surface

- `ClaimTrajectoryComputation` (new) · `ClaimTrajectory` versioned per computation
- `getClaimTrajectories` — get-or-compute; racing misses resolve by the loser reading the winner
- `loadTrajectoryContext` → `assess_thesis_framing`, `suggest_thesis`, Devil's Advocate
- The trajectory parameter is **required, not defaulted** — a `= []` default is how a call site
  silently reasons without the strongest layer; making it required let the compiler find both
- `trajectoriesConsidered` reported beside `evidenceConsidered`, so a zero is visible
- `GET /api/forensics/tracked/:id/trajectories` + a UI panel above the diff timeline, every
  point a link to the archived capture
- **1007 tests** (from 983). Two broke asserting the OLD contract and were rewritten to the new
  one, not weakened.
- `db:check-drift` run before writing the migration (clean) and after (reports exactly this
  change, nothing else). `ClaimTrajectory` measured empty — 0, against `trackedUrl: 1` and
  `urlSnapshot: 83` in the same query — before a migration whose `ADD COLUMN … NOT NULL` and
  `DROP COLUMN` are safe only on an empty table.

## Not fixed, and I would rather name them than let them read as done

- **Citation is still open.** No `MentionType.CLAIM_TRAJECTORY`.
- **The inverted summary on the anchored record is still wrong.** Correctable without touching
  the chain — the hash covers `url + date + deleted + added`, not the prose — but nothing
  detects this class automatically, and that detector is the more valuable thing.
- **`get_claim_trajectories` is still anonymous.** Cheap on a hit; a miss is still an unbounded
  read an unauthenticated caller can trigger.
- **Independence is still asserted, not computed.** The strongest version would derive it
  structurally — two findings resting on disjoint sets of `UrlSnapshot` hashes are independent
  by construction, with no heuristic and no model judgment. Not built; a bigger change than the
  gap that was blocking the session.


---

## Review outcome

Reviewed by the session that designed `ClaimTrajectory`. Every finding was acted on.

### The one that would have shipped

**`get_claim_trajectories` was a write tool classified as a read.** It sat in `READ_TOOLS` on
reasoning that was correct when written, and detection becoming stored state made a cache miss
insert rows — an unauthenticated caller could write to the database. And
`mcpToolClassification.test.ts` could not catch it: it asserts every tool is classified exactly
once, never that a classification still describes what the tool *does*.

Fixed three ways, in increasing order of value:

1. Moved to `WRITE_TOOLS`, with an assertion pinning it and the reasoning.
2. **The read path got its own name.** `getStoredClaimTrajectories` never computes and never
   writes; `getClaimTrajectories` does both. The public REST route uses the first and reports
   `state: 'NOT_COMPUTED'` on a miss rather than filling it — and rather than returning an empty
   result, since "not detected yet" and "nothing oscillated" are opposite answers. A boolean
   option would have left the security-relevant distinction invisible at the call site; a name
   cannot be read past.
3. Detection now runs at scan completion, so the public path has state to serve. Deliberately
   after the job is marked `COMPLETED` and deliberately swallowed: a scan that stored every
   snapshot has succeeded, and failing it over a recomputable derived view would strand the
   archived text behind a cheap, repeatable failure.

The general form is a review question, not a test: **when behaviour changes, re-ask what a tool
spends and what it writes.** No guard here can answer it.

### The seven questions

| | Answer | Action |
|---|---|---|
| 1. Is the three-input model complete? | **No — there is a fourth.** The presence test itself is detection logic; enumerating knobs is the drift `classifierPromptHash` exists to prevent | `NORMALISER_VERSION` → **`DETECTION_VERSION`**, covering the whole procedure |
| 2. Immutability considered? | **Not considered** — upsert-by-reflex on a table whose only writer had just been removed. "You corrected an oversight, not a decision" | kept |
| 3. Does caching cut across citation? | No — it moves *toward* it. Citation needs an immutable target, which the new key provides and the old one did not | kept |
| 4. Sub-threshold rows? | Agree, and more valuable than weighted: a 0-transition trajectory is the **"survived everything"** case — a categorical safety assurance present continuously through four years | kept, and now the argued-for reason |
| 5. `patternHash` not persisted? | Agree; never intended as an identity | kept |
| 6. Precedence too strong? | **Yes.** Authoritative on presence, not on meaning | rule **scoped**: the summary's assertion about presence is wrong; its interpretation does not follow |
| 7. Is nesting real? | **Already in this corpus** — two claims in the real 10-claim group where one contains the other verbatim, and the error runs the **unsafe** way (overstates corroboration) | **containment matching added**, exact hash for identity, guarded by the length threshold |

### Also corrected

**"One observation" over-reached, one notch smaller.** An evidence record carries classification,
tier reasoning, correlation to dated events and key figures — none duplicated by a trajectory.
Now scoped to *one observation of page state*, with the record's classification explicitly not
discounted.

### Verification after the review

**1016 tests** (from 983). New coverage: the read-only path never computes and never writes; a
nested quote is covered rather than independent, in both containment directions; a short item is
never matched by containment; precedence is scoped to presence in both rendered languages; the
overlap claim is limited to page state in both.

### Still not fixed

Unchanged from the list above — citation, the inverted anchored summary and the detector for it,
and structural independence. The reviewer's framing of the detector is better than mine and is
the one to build from: *a summary asserting something about a claim's text can be checked against
`fullText`, deterministically, the same way presence is.*


---

## Second review pass — the code, not the description

Three findings, all correct, all fixed. Two are **the same defect this change exists to
prevent**, committed inside the prevention: a set that looks complete and is not, feeding a claim
about independence.

| # | Finding | Direction | Fix |
|---|---|---|---|
| 1 | **Coverage leaked across tracked URLs** — the claim set accumulated across the loop while each evidence record belongs to one page | over-matching → **understates independent evidence**, the side already named as the more serious error | claim set scoped per URL |
| 2 | **Coverage computed against the truncated group set** — capped at 8 for display, and the cap fed the coverage claims; the corona page has 15 | under-matching → **overstates corroboration**, the side this change was written to prevent | coverage draws from every group; `omittedGroups` reported and rendered as display-only |
| 3 | **`prisma format` churn** — 304 of 377 changed schema lines were unrelated reformatting, 3× the instance reverted in PR #99 | an unreviewable schema diff beside a migration containing `DROP COLUMN` and a `NOT NULL` add | reverted; schema edited by hand — 217/158 → **78/18**, every line inside the two models being changed |

The rule that covers 1 and 2, which was not obvious from either site:

> **Truncation applies to what is rendered, never to what is reasoned over.** And a set used for
> a claim about independence must be scoped to the thing the claim is about.

What makes finding 1 clearly an oversight rather than a choice: the per-group computation forty
lines earlier scopes correctly via `onThisUrl`. The file gets it right once and does not carry it
down.

**Neither leak is reachable today** — one tracked URL, and the display cap only bites past eight
groups. Tests passed, types passed, and the first review pass did not catch them because it read
the description, and **the description was accurate**. They were visible only to a second reader,
of the code, holding the intent the description had established.

**1020 tests** (from 983). New coverage: a claim on one page never marks another page's item as
covered; coverage counts items covered by groups beyond the display cap; `omittedGroups` is
reported and rendered in both languages as display-only.
