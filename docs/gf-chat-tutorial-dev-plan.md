# Glass Fortress — In-Chat Tutorial

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

`docs/tutorial/chapter-01-prove-a-page-reverted.md`. Every fact in it was verified against live
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

**Not yet done:** phase 1 — watching one real person run it.

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
