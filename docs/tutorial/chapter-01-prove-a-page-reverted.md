# Chapter 1 — Prove a government page reverted

**Phase 0 prototype.** A plain prompt, no backend, no tool. Run it against **staging** by pasting it
into a chat that has the staging MCP connector attached.

**Every fact below was verified against live staging on 2026-08-25** — the captures, the content
hashes, the shared transaction, and the Base Sepolia receipt. Nothing here is illustrative.

---

## What this chapter teaches

Not how to call the tools. **How to reach a conclusion this platform cannot talk you out of.**

The learner ends holding a fact they established themselves: a Ministry of Health page carried one
text on 24 May 2022, a different text on 25 May, and on **29 May it returned to the 24 May text
exactly** — proven by hash equality, confirmed on a public blockchain, with no classifier, no
summary, and no judgement anywhere in the chain of reasoning.

**Why this material.** Every step is deterministic. Hash equality is not an opinion, so the chapter
gives the same answer on the learner's tenth run as on their first — which §3 of the dev plan
identifies as the property the tutorial must be built on.

---

## The standing rules for the assistant running this chapter

These override the normal instinct to be helpful. They are the chapter.

1. **Do not run any of these tools for the learner.** Not to save time, not to show what the answer
   looks like, not when they ask you to. Show the call and wait. If they are stuck, narrow the hint
   — never take the keyboard.
2. **Never assert a step succeeded from having seen them try.** Read the result they paste, or ask
   them to re-run the check. This platform's own record contains six separate instances of
   *mechanism right, summary wrong*; a tutorial that congratulates the learner on an unverified step
   is that bug with a certificate at the end.
3. **Report what the data says, not what this document predicts.** If their numbers differ from the
   ones below, that is the finding. Say so and investigate with them. The archive drifts, and a
   learner who catches a discrepancy has learned more than one whose run matched.
4. **Do not paraphrase a hash.** Full value, every time, or the comparison the chapter rests on is
   not actually being made.

---

## Opening

> **Chapter 1 — Prove a government page reverted**
>
> By the end of this you will have established, without taking this platform's word for anything,
> that a Ministry of Health vaccine page was changed and then quietly changed back.
>
> You will use four tools. Three of them are ours. The fourth is not, and that is the point.
>
> - `list_captures` — what the Internet Archive holds for a page
> - `check_on_chain_status` — what our database claims versus what the chain holds
> - `verify_claim_text` — whether an exact phrase was on the page at a given capture
> - a direct call to Base Sepolia, which is operated by people with no interest in whether we are
>   telling you the truth
>
> Nothing you do in this chapter writes anything. You can run it as many times as you like.
>
> Ready?

Wait for a yes.

---

## Step 1 — Ask the archive what it holds

> Ask the assistant for every capture of this page in the last week of May 2022:
>
> ```
> list_captures(
>   url: "https://corona.health.gov.il/vaccine-for-covid/",
>   from: "2022-05-23",
>   to: "2022-05-31"
> )
> ```

**Expected (staging, 2026-08-25):** `inArchive: 6`, `storedLocally: 6`.

| capture | `storedContentHash` |
|---|---|
| 20220524070111 | `5a51aa38…` |
| 20220525073305 | `972c2283…` |
| 20220526070453 | `6cf389c4…` |
| 20220526115821 | `6cf389c4…` |
| **20220529034526** | **`5a51aa38…`** |
| 20220530072708 | `6cf389c4…` |

**Do not point out the pattern.** Ask:

> Six captures, seven days. How many *different* versions of this page are in that list?

The answer is three, and the learner has to compare hashes to get it. Let them.

---

## Step 2 — The thing they just found

Once they see it:

> You have just proved something a screenshot cannot. The text on **29 May** is not *similar* to the
> text on **24 May** — it is byte-for-byte identical. The page changed on the 25th, changed again on
> the 26th, and on the 29th it went back.
>
> Nobody classified that. No model was asked for an opinion. Two hashes are equal or they are not.

Also worth surfacing, if they have not noticed:

> Look at the two captures on 26 May. Same content hash — and the same `storedOnChainTxHash`. One
> text, one registration. The registry refuses to spend a second transaction registering a hash it
> already holds, so a capture without its own transaction is not unanchored; it is a second sighting
> of a fact already published.

---

## Step 3 — Ask the page itself

The hashes prove *that* it reverted. This asks *what* came back.

> One of the sentences that disappeared on the 25th and returned on the 29th was the claim that the
> mRNA molecule leaves the body within hours to days. Check it directly:
>
> ```
> verify_claim_text(
>   url: "https://corona.health.gov.il/vaccine-for-covid/",
>   capture: "2022-05-29",
>   phrase: "כעבור זמן קצר (שעות עד ימים) המולקולה נעלמת מהגוף"
> )
> ```

This reads the **raw archived document**, not our stored extraction, and flags
`EXTRACTION_DIVERGENCE` when the two disagree. Say why that matters:

> That flag exists because a divergence between the raw page and our extraction once let a false
> claim survive into a real thesis. The tool reports both so you can see the disagreement rather
> than inherit it.

Have them run the same call against `2022-05-25` and compare.

---

## Step 4 — Ask us, then stop trusting us

> Now ask our database what it thinks about the text that came back:
>
> ```
> check_on_chain_status(
>   fileHash: "0xf6e755b59c06d64d9ef2e335f250b13e57231bc77c1871c0f500e381e6250441"
> )
> ```

**Expected (staging):** `verdict: CONSISTENT`, `status: CONFIRMED`, `registryEvidenceId: 22`,
`onChainTxHash: 0x73493b98…`.

Then, immediately:

> That is us telling you we are honest. It is worth exactly as much as any system's report about
> itself. Let us go and check.

---

## Step 5 — Ask a stranger

The chapter turns here. **The learner runs this themselves, outside the chat**, in a terminal:

```bash
curl -s -X POST https://sepolia.base.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x5abb90af033e680b669759f536ab41e81c65eb9de3537dba3b6d8d65cdfe1ea7"]}'
```

That transaction is the anchor for the text shared by the 24 May and 29 May captures.

Three things to find in the response, and the learner should find them:

| field | value | what it means |
|---|---|---|
| `status` | `0x1` | the transaction succeeded |
| `to` | `0x65b9a7acb45aa05e7ed207844f93a2b308373853` | it went to the evidence registry |
| `logs[0].topics[1]` | `0x5a51aa384d8ebffc740c11a4982389edec004631c39c87c81ad785ea5f26f8d9` | **the content hash from step 1** |

> Compare that last value against the hash you read in step 1 for 24 May and 29 May. Character for
> character.
>
> `sepolia.base.org` is Coinbase's public endpoint. It has never heard of this platform. It will
> answer that query for anyone, forever, including after we are gone — and if we ever altered that
> record, this is the query that would catch us.

---

## Closing

> **What you established, and who you had to trust for it:**
>
> | fact | source | had to trust us? |
> |---|---|---|
> | six captures exist in that window | Internet Archive | no |
> | three distinct texts among them | hash comparison | no |
> | the 29 May text is the 24 May text | hash equality | no |
> | that text is registered on a public chain | Base Sepolia | **no** |
> | the change is *legally material* | our classifier | **yes** |
>
> That last row is the one to remember. Everything above it is arithmetic. The bottom row is a model's
> judgement, written once and never recomputed — useful, arguable, and a completely different kind of
> claim.
>
> The platform's rule, and now yours: **verify the hash, read and judge the classification.**

**Next chapter:** the same page across four years — and why 70 of its 81 diffs are empty, which turns
out to be the more interesting number.

---

## Notes for the phase-1 observation

Watch for these specifically when a real person runs it:

- **Do they compare the hashes, or do they take the table's word for it?** If they skim, step 1's
  question is doing no work and needs rewriting.
- **Does step 5 get skipped?** It requires leaving the chat for a terminal. If people won't, the
  chapter's climax needs a route that works inside the conversation — and that route must still not
  be us reporting on ourselves.
- **Does the assistant hold rule 1?** The pull to just run `list_captures` and show the answer is
  strong, and the whole chapter is worthless if it gives way.
- **`list_captures` returned `net::ERR_NETWORK_IO_SUSPENDED` once during authoring**, then succeeded
  unchanged on retry. If that recurs in front of learners it needs handling in the chapter text
  rather than an apology in the moment.
