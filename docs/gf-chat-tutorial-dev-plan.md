# Glass Fortress — In-Chat Tutorial

> **Written before the target designs of 2026-09-02–04.** Its open items are triaged in
> `docs/gf-pre-design-plans-triage-2026-09-04.md` §6; nothing here is a required task by virtue of being listed.

**Status:** DESIGNED 2026-08-25, not started. Tiers 1 and 2 are in scope; Tier 3 is deferred
indefinitely with the reason recorded. Build on **staging** for the short cycle.
**Designed:** 2026-08-25 with the researcher, from the observation that the existing guide teaches
in the wrong medium.
Written for a session with **no prior context**.

---

## 1. The problem, stated precisely

The guide is twelve web pages. The work happens in a chat window. Everything learned in one has to
be carried to the other by memory.

The last guide session ended by writing copy-pasteable tool calls onto a web page so a researcher
could paste them somewhere else. That is a workaround for the medium being wrong, and it is the
signal that prompted this document.

**The tutorial should live where the work lives.** A researcher who connects the MCP server and asks
"what now?" should get an answer without opening a browser.

### 1b. The second problem — and the one worth solving first

There is a separate defect this tutorial happens to fix, and on reflection it is the stronger reason
to build it.

**An account that has signed up and is awaiting approval can do nothing at all.** It signs up, it
waits, and it has no way to tell whether the platform is alive, whether anyone saw the request, or
whether it is working. The state is modelled precisely in the middleware
(`{ kind: 'not_approved'; handle }`) and it is inert.

Meanwhile the ADMIN on the other side is approving — or not — on the basis of a handle and nothing
else.

Tier 1 is read-only, so **it is exactly what that state can safely be given.** This turns dead
waiting time into:

- a real task, with a verifiable result, for the person waiting;
- the strongest possible evidence for the person deciding.

That is a genuine product improvement that falls out of the tutorial design rather than being bolted
onto it, and it is why §10 puts Tier 1 first. See §6b for the mechanism.

## 2. What the tutorial is actually teaching

Not "how to call the tools." **How to not trust them.**

Step 39 of the playbook is the model. Six findings were promoted, then verified four ways:
the tool that wrote them, the platform's own status check, the unauthenticated public API, and
finally Base mainnet by public RPC. The fourth is the one that counted, because it had no Glass
Fortress code anywhere in the path.

That sequence is the researcher's core skill. A web page can describe it. A chat tutorial can make
someone *do* it, and feel the difference between a tool reporting success and a chain confirming it.

Every chapter has the same shape:

```
do a thing  →  prove it independently  →  see what the platform now holds
```

## 3. The constraint that decides the whole design

The pipeline has three layers with completely different determinism properties.

| layer | deterministic? | established by |
|---|---|---|
| fetch → extract → hash → diff | **yes, exactly** | production and staging, scanned three days apart, produced 83 captures / 81 diffs / **6 identical content hashes** |
| classification, tiering, summarisation | **no** | FINDING 98 — the two environments disagreed on one diff from identical input |
| the archive itself | **drifts** | new captures appear; the CDX query already runs at 49.5s against a 60s ceiling (FINDING 8) |

A tutorial step downstream of the LLM **cannot** promise what the learner will see. If a chapter
says *"you should now have 6 findings"* and the learner's classifier returns 5 or 7, the tutorial has
taught them the platform is broken while it is working exactly as designed.

This is not a limitation to engineer around. It is the most important thing the tutorial has to
teach, and it is the platform's own existing rule: **verify the hash, read and judge the
classification.**

**Design rule: the tutorial is predictable exactly where the platform is deterministic, and
explicitly unpredictable where it is not.**

## 4. The second-observer reframe

The obvious objection to "every learner uses the same URLs" is collision: learner #2 recomputes the
same hash and finds it already anchored, so their promotion fails.

That is the best moment in the tutorial, not a defect.

FINDING 95 already settled the principle against production data: *a row without its own transaction
is not an unanchored fact; it is a second observation of a fact already published.*

The learner is not colliding with production. **They are independently reproducing it.** They take
the same archived page, run the same extraction, obtain `0xf6e755b5…`, ask the chain, and the chain
answers: registry id 13, anchored on Base mainnet at block 50440201.

They have just verified someone else's evidence without trusting this platform at all.

- Learner #1 makes a claim.
- **Every learner after them confirms one** — the harder and more valuable skill.
- It is perfectly predictable, permanently, because it is history.

## 5. The read/write split

The two layers have opposite collision properties, and that is the design.

| layer | property | role in the tutorial |
|---|---|---|
| **Evidence** | shared, append-only, hash-deduplicated | **read** — every learner works the same URLs, captures and records, and gets the same answer every time |
| **Theses** | per-author, draft until published | **write** — every learner writes their own thesis citing that same real corpus |

No collision is possible. Nothing is faked. The arc is **verify production's evidence yourself, then
reason on top of it** — which is what a researcher actually does.

The publication gate means a learner's thesis stays a DRAFT until someone deliberately publishes it,
so the write chapter cannot leak a training exercise onto a public site.

## 6. Scope

### Tier 1 — read-only replay of the real trail — **IN SCOPE**

Zero new infrastructure. Uses tools that already exist and are already deterministic and LLM-free by
construction: `list_captures`, `verify_claim_text`, `audit_thesis_claims`, `check_on_chain_status`,
the public REST API, and a public RPC endpoint that belongs to no one involved.

A learner walks the whole provenance of the public thesis and confirms every anchored hash
independently. Perfectly predictable because it is a historical record.

### Tier 2 — the frozen fixture — **IN SCOPE**

Freeze what production's scan actually *received* — the CDX response and the 83 captures,
byte-for-byte — into the repo. The learner runs the real extraction and diffing code against frozen
input and reproduces production's exact numbers every time.

This removes two real risks that Tier 1 alone cannot: **archive drift** and the **49.5s CDX query
against a 60s ceiling**. It is the piece that makes "identical, every time" actually true rather than
merely likely.

The playbook's own lesson applies directly: *a model of a pipeline predicts what the pipeline asks
for, not what it receives.* A fixture captures what it received.

### Tier 3 — a fourth environment, reset per learner — **DEFERRED INDEFINITELY**

Full write fidelity: the learner really scans, really classifies, really promotes.

Cost: another database, another chain, another deploy, and a routine automated reset — which sits
uncomfortably beside this project's rules on destructive operations. It is defensible *only* because
a tutorial environment holds no real work by construction.

**Deferred because the write practice belongs in the thesis layer, where it needs no environment of
its own.** Revisit only if Tiers 1 and 2 prove insufficient in front of a real learner.

## 6b. Who the tutorial is for — and why completion is not a gate

There is an apparent circularity: if completing the tutorial were required before working on the
platform, but the tutorial itself required permission, nobody could ever start.

**It dissolves, because Tier 1 needs *less* privilege than the write surface, not more.**

`researcherIdentity.ts` already models the state precisely. `identify()` returns a distinct kind for
an authenticated person who holds a researcher account that has **not yet been approved**:

```ts
| { kind: 'not_approved'; handle: string }
```

Today that state can do nothing but wait. **That is the tutorial's audience.** Tier 1 is entirely
read-only — `list_captures`, `verify_claim_text`, `check_on_chain_status`, the public REST API, a
public RPC — so it sits *below* the approval gate rather than behind it. No new auth machinery is
needed; the state exists and currently has nothing to do.

Note the one implementation detail: `identifyResearcher` sets `req.researcherId` only when approved,
so it treats an unapproved account as anonymous. Serving the tutorial to `not_approved` needs a third
middleware (or a variant) that admits that kind explicitly. That is the only auth work in Tier 1.

### Completion is a signal, not a requirement

**Decided 2026-08-25.** Tutorial completion does **not** gate platform access.

1. The moment it is mandatory it becomes a checkbox to speedrun, and stops teaching.
2. Some arrivals are already experts. Requiring a forensic journalist to prove they can verify a hash
   wastes their time and teaches them nothing.
3. If the tutorial breaks, onboarding stops entirely.

Approval was always a human decision. Completion should **inform** it, not replace it: the ADMIN
approving an account sees *"verified six hashes independently against Base mainnet"* rather than only
a handle.

### Where a real requirement does earn its place

**Production, not the platform.** Staging writes need approval and nothing more — Base Sepolia is
free and disposable. Production writes are permanent, public, and carry the exposure
`defamation-risk.md` exists for. *"Have you ever actually checked a chain yourself?"* is a fair
question to ask before someone anchors to Base mainnet, and it is the same question §12.2 raises
about graduation.

Practical note: staging and production hold separate databases, so a completion recorded on staging
does not exist in production's. **Do not build a sync for this.** Production currently has zero
researchers; an ADMIN checking by hand is entirely sufficient, and will remain so for a long time.

## 7. Where the tutorial lives

An **MCP tool**, not a document. `start_tutorial` appears in the tool list the moment someone
connects, which makes it discoverable exactly where it is used. That single property is most of the
value.

It also means the curriculum versions with the platform: when a tool changes, the lesson changes in
the same PR, rather than drifting until someone notices.

**Sequencing rule: prototype the content as a plain prompt before building any tool.** The hard part
is the interaction design — how much hand-holding, when to let someone fail, how to recover when they
wander off. Get that right in a throwaway prompt against staging, then make it a tool. Building the
MCP surface first commits to a shape that has not been tested.

## 8. The three hard problems

**8.1 — Claude will do the work for the learner.** This is the default failure and it is near-certain,
because the whole pull of an assistant is to be helpful and just make the call. The tutorial must
make *"I will not run this for you"* an explicit standing rule, and hold it while the learner fumbles.
Everything else is easy by comparison.

**8.2 — Verification must ask the platform, never the model.** The check for "did they create the
record?" is a read tool with an unambiguous result, never Claude's recollection of having seen it
happen. This playbook has recorded **mechanism right, summary wrong** six times; a tutorial that
self-reports success is that same bug with a certificate at the end.

**8.3 — Practising a dangerous act in a safe place teaches that it is safe.** The climax is a
permanent chain write. On staging that is Base Sepolia — free and disposable — which is exactly why a
learner will stop performing the ritual. The tutorial must teach the ritual *harder* because the
stakes are fake, and say so out loud.

## 9. What is genuinely impossible

Recorded so no future session spends time attempting either.

- **Every learner performing the same anchoring write.** The registry dedupes by hash. That is the
  contract behaving correctly, and no design avoids it without faking the chain.
- **Identical classifier output across learners.** Proven false today, in production data
  (FINDING 98).

Both are better taught than hidden.

## 10. Build order

Staging throughout — shorter cycle, and Base Sepolia costs nothing.

| phase | deliverable | gate |
|---|---|---|
| **0** | Chapter 1 as a plain prompt, no backend. Run it against staging. | Reads well end to end |
| **1** | Watch **one real person** who has not used the platform run it | More is learned here than from designing chapters 2-12 |
| **2** | Revise from what they got stuck on | — |
| **3** | Tier 2 fixture: capture and commit the frozen CDX + captures | Reproduces 83/81/6 offline |
| **4** | Remaining Tier 1 chapters as prompts | Each one predictable on repeat runs |
| **5** | Promote the curriculum to MCP tools (`start_tutorial`, chapter serving, progress) | Interaction design already settled |
| **6** | The one write chapter — learner authors their own thesis on the shared corpus | Stays DRAFT |

### Phase 0 — WRITTEN 2026-08-25

`docs/archive/chapter-01-prove-a-page-reverted.md`. Every fact in it was verified against live
staging while writing, not assumed.

**The material turned out to be much stronger than this plan originally sketched.** The first draft
proposed *"confirm the page said something different six days later."* Running `list_captures` over
2022-05-23 → 05-31 showed something better:

| capture | stored content hash |
|---|---|
| 2022-05-24 | `5a51aa38…` |
| 2022-05-25 | `972c2283…` |
| 2022-05-26 07:04 | `6cf389c4…` |
| 2022-05-26 11:58 | `6cf389c4…` |
| **2022-05-29** | **`5a51aa38…`** |
| 2022-05-30 | `6cf389c4…` |

Six captures, **three distinct texts**, and 29 May is byte-identical to 24 May. **The page reverted**,
and hash equality proves it with no classifier, no summary and no judgement anywhere in the argument.
The two 26 May captures also share a transaction hash, putting FINDING 88 and FINDING 95 in a single
view a learner can see at a glance.

That is a far better chapter than "the page changed", and it was only found by running the tool
rather than designing around what it was assumed to return.

Verified end to end on staging: evidence record `0xf6e755b5…` is `CONSISTENT` at registry id **22**
(production's is 13 — same hash, different contract index, which is itself worth teaching), and Base
Sepolia confirms `topics[1]` equals the snapshot hash `0x5a51aa38…` on the shared anchor
`0x5abb90af…`.

### Phase 1 run 1 — 2026-08-25, and it changed the design

The chapter was run against staging with the researcher as learner. It failed on **step 1**, and the
failure was worth more than the rest of the chapter.

**Revision 1 taught function-call syntax.** It told the learner to paste
`list_captures(url: ..., from: ..., to: ...)`. The learner's objection was immediate and correct:

> *is that really how researcher talks to the platform? isnt it in natural language and you know
> which tools to execute for the request?*

**It is not, and teaching it is teaching the wrong thing.** The entire value of MCP is that the
syntax is not the researcher's problem. A tutorial built on signatures trains people to do by hand
the one thing the platform exists to remove.

The corrected rule, now §"What revision 1 got wrong" in the chapter:

> **Ask in your own words. Learn the tool's *name*, never its signature.**

A researcher must know a capability **exists** — you cannot ask for what you do not know about — but
never its parameter list. So the learner asks in natural language and the assistant names the tool
afterward, building a vocabulary of capabilities with no syntax attached.

**A second rule was incoherent for the medium.** Revision 1 said *"do not run the tools for the
learner."* In an MCP chat the learner **cannot** call a tool; only the assistant can. Replaced with:

> **The learner decides what to ask and what the answer means. The assistant executes, and does not
> interpret ahead of them.**

**The finding that matters most:** the learner never answered step 1's question. The mechanics
consumed the lesson. Interface friction in a tutorial does not merely annoy — it *replaces* the
teaching, silently, while the chapter appears to be proceeding.

### Consequence for the shipped guide

The `/guide` evidence page shipped to production earlier the same day carries copy-pasteable tool
calls under *"Try it yourself"*. Those are defensible as a **record of what was run** — which is how
they are framed — but they are function signatures, and a beginner meeting them first may reasonably
conclude that is how one talks to the platform. Worth revisiting for consistency once the tutorial's
natural-language approach is proven. Not changed yet.

### Phase 1 run 2 — 2026-08-25, three more fixes, all at step 1 again

Run 2 also failed at step 1, for two independent reasons. Chapter revision 3 followed.

**A — The chapter was a quiz, and it dragged.** Four exchanges into step 1 of 5 the learner asked
*"why is this taking so long?"* and was right. It front-loaded a puzzle before establishing any
stakes, asking someone to squint at data for a payoff it had not shown them. Projected length was
~20 exchanges; it should be six. Worse, the *do-not-interpret-ahead* rule had been turned into
**withholding** — the assistant asked the learner to compare two values it had already compared.

> **Lead with the finding, then verify it.** Verification is motivating once you know what is at
> stake. Puzzle-first is not.

**B — Never show a learner a hash.** The assistant printed six 64-character hex strings and asked
for them to be diffed by eye. The learner's objection — *"you know how to interpret this but not
me... it is scary"* — is correct, and the fix goes deeper than hiding it:

> **The version number IS the human-readable hash.**

Assign stable numbers to the distinct texts and identity becomes *visible*: version 4 appearing on
both 24 and 29 May **is** the revert, at a glance, with nothing to compare. The hash appears exactly
once, at step 5, where the chain is keyed by it and it is therefore load-bearing.

**C — Two rules that outlive this chapter.**

> **A list is for navigation; detail comes on request.** Never bloat a row with what belongs on a
> detail page.

> **The assistant is the presentation layer.** `list_captures` returns raw hashes because it was
> built for an agent to consume — the tool is not wrong. Passing tool output through to a human
> unchanged is the defect, and it applies to every tool in every chapter.

**D — Language marks the role.** The learner asked for the lesson in Hebrew and proposed that a
switch to English signals the assistant has stepped out of teaching to talk to a *builder*. Adopted:
it works better than any label and costs nothing.

**E — Provenance must be visible in the interface, not only in the doctrine.** The chapter teaches
*verify the hash, judge the classification* — so its own version list cannot silently blend a
computed fact with a classifier's summary. Model output is now explicitly marked in step 2.

### The pattern across both runs

**Every failure was at step 1, and none was visible from reading the chapter.** Three revisions in
one afternoon, each caused by a real person hitting a real wall. That is the argument for treating
phase 1 as a gate rather than a formality, and for keeping the run log inside the chapter.

**Not yet done:** a run by someone who has never used the platform.

## 11. What happens to the existing guide

It is not deleted and not replaced. It becomes **reference** — what you consult when you have
forgotten what a tier means. The tutorial is the path in; the guide is the map you keep.

The twelve phase pages map cleanly onto tutorial chapters, so a chapter can link to its guide page
for depth rather than restating it.

## 12. Open questions

1. **Chapter approval granularity.** Gating every chapter on "shall we proceed?" is friction that
   teaches skimming. Proposal: gate the chapters that **write**, let read-only chapters flow.
2. **Graduation.** ~~Open.~~ **Partly settled 2026-08-25, see §6b.** Completion is a signal to the
   approving ADMIN, never a gate on platform access. The last chapter does not say "now do it on
   production" — it states precisely what changes when the environment is production, and the
   learner's first real record is reviewed by someone. Still open: whether completion should be a
   stated expectation specifically for **production** write access, checked by hand.
3. **Progress state.** Server-side progress lets a learner stop and resume and survives a context
   reset. Minimal version is `currentChapter` + `startedAt` keyed by researcher. Decide in phase 5,
   not before.
4. **Tutorial-authored theses on staging.** If learners write theses against the staging corpus,
   staging accumulates them. They are DRAFTs and therefore invisible publicly, but a marker
   distinguishing them from real work is probably wanted. Decide when phase 6 is reached.
5. **Which URL for the fixture.** `https://corona.health.gov.il/vaccine-for-covid/` is the obvious
   choice — it is what production and staging both scanned, and the six confirmed hashes give the
   chapter its verifiable endpoint.

---

# The teaching strategy, confirmed 2026-08-26

## `start_tutorial` is the delivery vehicle, and the reason is structural

The curriculum ships as a TOOL, not as documentation. `chapters.ts` states why: a document in the
repository does not exist for the person who needs it, and an assistant asked to teach without one
infers a syllabus from tool descriptions and delivers a lecture — the old guide relocated into a chat.

Two consequences that make it the right fit for teaching an **expert**:

- **It versions with the platform.** When a tool changes, the lesson changes in the same PR rather
  than drifting until someone notices. A `docs/` tutorial would already be wrong today: this session
  changed the corpus from 131 to 290 chunks, 6 to 7 significant diffs, and 7 to 8 evidence records.
- **`start_tutorial` is in `READ_TOOLS`** — no model, no RPC, no database, no network. Deliberately
  open, because its audience is an account that has signed up and is awaiting approval, which under
  `requireResearcher` can otherwise do nothing at all.

## The method: generate the material by doing the work, then test it cold

The production thesis walk is not a rehearsal for the teaching material — it IS the material.
Bringing production to parity with staging produces exactly the artifacts a chapter needs, discovered
rather than invented: a real framing question, real evidence, real dead ends, real corrections.

Then the chapter is tested in a **clean claude.ai session where only the MCP is available** — no repo,
no local tools, no context from the session that wrote it. That is the only environment that tells the
truth about whether the lesson stands on its own.

Validated on chapter 1 (read-only), 2026-08-25: three revisions in one afternoon, every failure at
step 1, none of them visible from reading the chapter. The standing rules that came out of those runs
are in `chapters.ts` and `docs/archive/chapter-01-prove-a-page-reverted.md`.

## What changes for chapters that WRITE

Chapter 1 is read-only and therefore repeatable by anyone, any number of times. A chapter that creates
a thesis is not, and three things follow:

1. **Auth.** Write tools are gated. A clean claude.ai session needs a working OAuth researcher
   identity before the chapter can proceed at all — the failure mode is a lesson that dies on step 1
   for a reason unrelated to the lesson.
2. **State.** Every run creates real rows: a research session, a framing session, a thesis draft,
   versions. **Production currently has 0 theses.** After the first write-chapter run against
   production, it will not — and practice theses on the environment the public reads is a decision,
   not a detail. Running write chapters against STAGING keeps production clean at the cost of teaching
   against the environment the learner will not use.
3. **Session exclusivity.** One active research session per researcher, one per thesis. A tutorial run
   competes with the learner's own work: if the learner IS the researcher, a chapter that opens a
   session can block or close what they were doing.

**The corpus numbers must never be hardcoded into a chapter.** Chapter 1 already avoids this — it
instructs the assistant to fetch, and carries the rule "state nothing you did not fetch in THIS
conversation". That rule was written after a fabricated detail survived into a live run, and it is
also what keeps the curriculum correct across repairs like today's.

## The framing concept splits off as a READ-ONLY chapter — 2026-08-26

The section above classifies thesis creation as a write chapter and inherits all three of its problems.
Teaching what a framing IS inherits none of them: `get_thesis_framing` is in `READ_TOOLS` — no auth, no
model, no RPC, no write — so a learner can read a completed framing session end to end and see the
researcher's claim, the assessor's contradiction, the rebuttal, and the withdrawal.

So the write chapter splits in two: a read-only chapter on what a framing is and why it is not the
thesis, and a later write chapter that only has to teach *doing* it. Material captured in
`docs/archive/chapter-02-what-a-framing-is.md`, generated from the production walk exactly as the
method above prescribes — prompted by the researcher who invented the framing question asking mid-walk
what the difference was. If that person has to ask, it is taught nowhere.

## Next

Advance to chapters covering thesis creation, generated from the production walk, each one run cold in
claude.ai before the next is written. `docs/gf-thesis-walk-production-handoff.md` is the walk's
starting point; `gf-tutorial-run-log` in memory is why the runs matter more than the writing.
