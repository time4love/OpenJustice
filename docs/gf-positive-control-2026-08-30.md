# The Level 3 clause 1 positive control — 2026-08-30

**What it set out to do:** execute, for the first time, the write path that Level 3 clause 1 shipped —
`anchorSnapshots` registering a `documentHash` on a chain, `anchoredHash` written in the same
statement, a fresh receipt read producing `CONFIRMED_BY_RECEIPT`, and the audit reading
`ATTESTS_CURRENT`. That sequence had never run in either environment. `VERIFIED 0` on staging was
equally consistent with *"the success arm works and nothing used it"* and *"the success arm is
broken"*.

**What it found:** the success arm is broken, for a reason no test could have seen. The chain writes
are correct; reading our own record of them back is not.

> **Nothing on chain is wrong, and no legacy state was touched.** All seven anchors are real, attest
> the document, and were confirmed against Base Sepolia by receipt. The defect is entirely in how the
> database record is matched afterwards.

---

## 1. The control that was built

A positive control needed a genuinely novel capture, which needed a new tracked URL — a corpus
decision reserved for the researcher. Three candidates were measured against the CDX index **before**
anything was written, because `start_forensic_scan` takes only a URL and has no cost preview:

| candidate | distinct-digest captures | scan calls to finish | chain transactions |
|---|---|---|---|
| FDA press announcement (first Covid-19 vaccine approval) | **3,036** | ~61 | ~3,036 |
| Clalit coronavirus page | 50 | 1 | ~50 |
| **`https://news.walla.co.il/item/3403847`** (chosen) | **8** | 1 | ~8 |

`runFullScan` auto-paginates within one invocation, bounded only by `MAX_BATCHES_PER_INVOCATION = 5`
× 50 = **250 captures per call**. The FDA page would therefore have stored 250 captures, spent ~250
transactions and ~250 classifier calls from a single approval, and left the URL 8% scanned. **Measuring
the index first is what made that visible; the tool does not report it.**

### The tracking parameter that would have poisoned the corpus

The URL was first offered as `…/item/3403847?utm_source=chatgpt.com`. The Archive holds **zero**
captures of that string and **8** of the bare URL.

`scrapeUrl` strips `utm_*`, `fbclid`, `gclid`, `mc_*` — but only to build the URL it **fetches**
(`src/utils/webScraper.ts`). `admitUrl` then writes `input.url` **verbatim** into `trackedUrl.upsert`.
So the relevance gate would have judged the clean URL, and the corpus would have stored a `TrackedUrl`
whose permanent identity carries a ChatGPT referral parameter and which the Archive can never match.

**The assessed URL and the tracked URL are allowed to differ.** One rule, two implementations, and the
copies already disagree. Recorded as a defect in §5.

---

## 2. What the control PROVED

```
trackedUrlId   38da8d89-7acf-4874-b8c8-43dbff78d229
deployment     87f5e31c-e4f9-4999-8ad3-0507a3e7d255 @ 7740e11   (staging)
captures       7 stored of 8 in the index
transactions   7 distinct — ZERO twin reuse
```

| capture | tx |
|---|---|
| 2020-12-09 | `0xf5c67690701937d717615d238d4a82f6c3c9105fa99a5c9e60987f4e3c678020` |
| 2020-12-18 | `0x457ba34401840c25242abb0773e4d34e7ad94de82bc06a4414a0bcdce3af0f73` |
| 2021-06-12 | `0x2e8b1096f4190b356abe401b3af12b6e33b4b3f4be291bb49e971a628cf0af41` |
| 2022-05-23 | `0x9568b94f3430cd8f53c7f6a1ce48db68acbbd12bc7d5653fc1689d4ecc85003e` |
| 2024-05-20 | `0xa65561fd1b8ee8f077073ff08b36db5024c4a8f4ac67770be7a3c43355d96d44` |
| 2025-02-19 | `0x2b3c38ae05bdf8bd392ebe48675a9aa679391b6f51db6a633069716ecfa79aa4` |
| 2025-03-26 | `0xb6710bf3cc87b43b99d76098873d70f452950eacbf9f7bdf9b4c42eb890c7b59` |

**Seven captures, seven transactions, no twin reuse** — the plan's "roughly one transaction per
capture, permanently" confirmed in the field rather than estimated.

`forensics:confirm-anchors --env staging`, dry run then `--apply`, in the deploy container:

```
examined 7 · confirmed (receipt) 7 · MISANCHORED 0 · ANOTHER TX 0 · ANCHORED NOTHING 0
NO TRACE 0 · unreachable 0 · ambiguous 0 · failed 0 · exit 0
```

The hashes each transaction's own `EvidenceSubmitted` log carries:
`0x33c7a74d98ce…`, `0x92d261552142…`, `0x2c32ec922d59…`, `0x407431df5c2d…`, `0x7ccd33b27a61…`,
`0xfccd6eab2d1b…`, `0x05cc45399502…`.

**None is the row's `contentHash`** (`5b67c0ba…`, `ebbd91c8…`, `a34a6f61…`, `cae13ebd…`, `7702db67…`,
`f2b8dc28…`, `bd063292…`). The chain has demonstrably stopped attesting to Readability's extraction.

**So the write path reaches the chain, and reaches it correctly.** That much is now proven rather than
assumed.

---

## 3. What the control FALSIFIED

**Prediction:** `forensics:audit-anchors --env staging` reports the seven as `ATTESTS_CURRENT` /
`VERIFIED`, alongside 22 `MISATTESTING` and 91 `UNATTRIBUTED`, exit 5.

**Actual:**

```
Subjects claiming an anchor   120
  VERIFIED         0
  STALE            7     ← the seven new captures
  MISATTESTING    22
  UNATTRIBUTED    91
exit 5
```

Each of the seven: `STALE (SNAPSHOT_ANCHOR)` — *"This verdict does not describe the subject: the
database claim it judged has changed."*

### The mechanism: `anchoredHash` is written in two spellings

| writer | value written |
|---|---|
| `claimAnchor`, on the write path | `anchoredCaptureHash(capture)` → `documentHash`, **bare hex** |
| `confirmAnchors --apply` | the log's `fileHash` via `parsed.args.getValue('fileHash').toLowerCase()`, which ethers returns **`0x`-prefixed** |

`capturesAnchoredBy` strips `0x` from its **argument** and compares against the **stored** value
literally:

```js
const bare = hash.replace(/^0x/, '');
return { OR: [{ anchoredHash: bare }, { anchoredHash: null, documentHash: bare }] };
```

A stored `0x…` never equals `bare`, and the second arm requires `anchoredHash: null`. **A row becomes
invisible to `capturesAnchoredBy` the moment `confirm-anchors` writes it.**

### Three consequences, in order of severity

1. **`VERIFIED` is unreachable for any capture, permanently.** `readOnChainClaim`'s snapshot count
   falls 1 → 0, which moves `onChainSourceStateHash`, which makes the write-time verdict `STALE`.
   Anchor → check recorded → confirm → check stale. No capture can reach the success arm however
   correct its anchor is.
2. **The twin lookup in `anchorOneSnapshot` uses the same predicate.** A confirmed row can never be
   found as a twin, so a genuinely duplicate document is re-registered, the registry rejects the
   duplicate, and the row keeps its null — **FINDING 41 reconstituted.** Near-extinct twins under
   `documentHash` make this rare, not absent.
3. **`ORPHANED_ANCHOR` is armed.** `anchoredCaptureHash.ts`'s own comment states that zero rows here
   degrades `SNAPSHOT_ANCHOR` to `ORPHANED_ANCHOR`, *"reporting every correctly anchored capture as a
   custody incident… already happened once, on 12 of production's 19 registrations."*

### Why production's 8 `VERIFIED` evidence rows were never affected

`readOnChainClaim` looks for an `Evidence` row **first** and returns without consulting
`capturesAnchoredBy` when it finds one. **The evidence success arm works; the snapshot success arm has
never fired because it cannot.** That is the precise explanation of an asymmetry that was previously
recorded as an observation without a cause.

### Why no test caught it

Nine repaired fixtures and a simulated-flip test all pass. **Both spellings are internally consistent
within their own writer**, so any test that exercises one writer sees a coherent world. The divergence
exists only in the seam, and only a real execution crosses it.

**This is the entire argument for a positive control**, and it should be quoted the next time one looks
expensive.

---

## 4. What closing Level 3 clause 1 now requires

**Level 3 clause 1 must not be marked done.** The flip reaches the chain, but the audit arm that would
say so cannot fire. Marking it closed on the strength of "seven transactions went out" would be the
same move the plan already warns against — reading an accurate fact about one axis as proof about
another.

The fix, in order:

1. **One spelling for `anchoredHash`, owned in one place.** Normalise at rest — bare, matching
   `documentHash` and `contentHash` — and make `capturesAnchoredBy` incapable of being handed the
   other form. `toBytes32` stays the chain boundary, exactly as `anchoredCaptureHash.ts` already
   argues.
2. **A test that crosses the seam**, not one that exercises either writer alone: write via the write
   path, confirm via `confirmAnchors`, then assert `capturesAnchoredBy` still finds the row. The
   defect is in the seam, so the test must be in the seam.
3. **Re-record the seven checks** and re-run the audit. Expect `VERIFIED 7`, `MISATTESTING 22`,
   `UNATTRIBUTED 91`, exit 5.
4. Only then flip the `STATUS:` line.

**The 22 `MISATTESTING` and 91 `UNATTRIBUTED` remain correct and are Level 10's**, per the boundary
already drawn. They are not a backlog and must not be "cleared".

---

## 5. Other findings from the same session

### Level 4's revival dossier — the measurement the plan demanded

The plan defers Level 4 with *"it needs a CONSUMER FOR THE MARKS, not code"* and *"do not revive
without new measurement."* The Walla page is the first **news page** this corpus has ever held, and it
supplies exactly that measurement:

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

The article did not change between 2020-12-09 and 2025-03-26. The advertising did, seven times. The
only item with any investigative flavour is the removal of the navigation tag `משרד הבריאות`, and that
is navigation, not article text.

**Contradiction rate by page type:**

| corpus | contradicted | rate |
|---|---|---|
| production (government pages) | 2 of 13 | 15% |
| staging (government pages) | 4 of 15 | 27% |
| **this news page** | **3 of 6** | **50%** |

Every contradicted diff carries `contradictedCount: 1`. One consists of nothing but two rotating ad
links and still produced a pipeline-defect verdict.

**The deferral was calibrated entirely on government pages, which carry no ad slots.** Level 4 marks
rather than deletes and acts on the CLAIM rather than the CHECK, so reviving it is not the forbidden
move the plan warns about — that was widening `segmentsOf` to silence the detector.

### Both hashes are unstable on a news page

All seven captures produced seven distinct `documentHash` values **and** seven distinct `contentHash`
values. Readability does not filter this page's chrome either — it keeps the caption, the timestamp and
the promo text. The plan attributes twin extinction to the `documentHash` flip; on a news page **cost
scales with ad rotation under either rule**, and "the document changed" stops implying "the page
changed".

### The survival check ignores `relocated`

The classifier marks items `relocated: true` when text moved rather than being removed — three such
items in the 2022-05-23 → 2024-05-20 diff. `relocated` appears nowhere in `src/lib/diffSurvival.ts` or
`src/services/computeDiffSurvival.ts`. By Level 5's own reasoning — *"the stored artifact asserts to a
researcher…"* — the artifact asserts relocation, not deletion, and contradicting it tests a claim the
record does not make. **Not a complete explanation:** the 2021-06-12 → 2022-05-23 diff has every item
`relocated: false` and still contradicts, so a second mechanism exists.

### `UrlVersionDiff` holds two representations of its own boundary

```
beforeDate       String            ← what get_forensic_timeline reports
beforeSnapshotId String → UrlSnapshot   ← the actual capture
```

Nothing enforces that they agree, and `get_forensic_timeline` reads the string columns without
traversing the FKs. On the Walla page the timeline reports a diff `2025-02-08 → 2025-02-19`, but
`20250208221410` was **never stored** (`storedLocally: false`, and `snapshotsStored: 7` agrees with the
seven that were). Seven captures admit exactly six consecutive boundaries, and the reported set
substitutes that boundary for the real `2024-05-20 → 2025-02-19`.

**The platform displays a version boundary against a capture the corpus does not contain, and the true
interval is nine months wider.** Worse than the gap `list_captures` warns about, because it
**overstates** precision rather than understating it. Direction inferred by arithmetic; confirming it
outright requires reading `beforeSnapshotId`'s date, which no MCP tool exposes.

### `survivalContradicted` cannot be read from outside the database

The plan justifies the column as *"what disagreed — §3's pipeline-defect record, not just a count."*
`forensics:audit-survival` prints verdicts and never excerpts; no MCP tool exposes it; the UI shows
only the `1/5` ratio. **A pipeline-defect record nobody can read is a count wearing a record's
description.**

### The scan applies no status filter

The scanner's CDX query requests `fl=timestamp,digest` and filters on nothing else. Only
`archiveVerification` reads status codes. So a capture the Archive recorded as `403` or `301` is
indistinguishable, to the scan, from page content — and the Clalit candidate's four most recent
captures are `403`s from a crawler block. Storing those would record that page's content vanishing in
January 2026: a fabricated removal, on precisely the axis this platform exists to detect. The one
capture the Walla scan declined to store is the row whose CDX status is `-`, which is the same axis.

### `already carried a verdict` counts something else

`confirmAnchors`'s summary line counts rows where `anchoredHash IS NOT NULL` — rows carrying an
**observed hash**. Staging's 91 `TX_UNREADABLE` rows carry a terminal **verdict** and no observed
hash, so they are correctly excluded from the count and incorrectly excluded by the label. Renaming it
`already carried an observed hash` is the whole fix.

### The `supabase` MCP connector targets production from a laptop

This project's `supabase` MCP server is configured with a `project_ref` that `get_environment` reports
as **production's** database — `fqmc…lo`, deliberately truncated here because this repository is
public. It exposes `execute_sql` and `apply_migration`.
This contradicts the whole of `CLAUDE.md`'s operational-context discipline, which exists because a
laptop with partial production access is how an environment gets mixed. Unused in this session and
recorded here.

---

## 5a. CLOSED, the same day

The fix landed as `3c0e639` (PR #248). `storedAnchorHash` is the single normaliser, returning a
branded `StoredAnchorHash` only it can produce; both write sites require it, so a raw string cannot
reach the column. A data migration normalised the existing rows. `attestationOf`'s private prefix strip
went too — it lower-cased where `capturesAnchoredBy` did not, so the module written to end duplicate
implementations of one rule held two that already disagreed about case.

**Five existing assertions expected `0x` and one expected bare.** The defect had been written down as a
requirement, in a suite that documented both spellings without anyone noticing. Corrected against an
independent oracle, never weakened.

`test/anchoredHashOneSpelling.test.ts` tests neither writer: it tests that what one writer stores, the
lookup finds — for both writers, every spelling the chain can return, with a decoy proving the old form
genuinely does not match. Mutation-checked: removing the normaliser fails 3 of its 5 cases.

**The result on staging, deployment `863cd928 @ 3c0e639`:**

```
Subjects claiming an anchor   120
  VERIFIED         7      ← the seven captures of this control
  CONTRADICTED     0
  UNAVAILABLE      0
  UNCHECKED        0
  STALE            0
  MISATTESTING    22
  UNATTRIBUTED    91
exit 5
```

**The success arm has fired.** A capture has been anchored to the document it attests, had that
transaction's own log read back, and been audited `ATTESTS_CURRENT` — every stage proven by execution.

**A prediction in the fix plan was wrong.** The 22 legacy rows were expected to flip to `STALE`; they
stayed `MISATTESTING` and `STALE` came out 0, so `forensics:backfill-anchor-checks` was never run. The
migration alone sufficed: the write-time verdict encoded `snapshots: 1`, and normalisation restored it.

### Two deployment notes worth keeping

**The first deploy stalled for 27 minutes and it was not the build.** The build finished in 72 seconds
and the pre-deploy migration applied successfully; the start command then produced zero log lines. A
redeploy of the same commit cleared it. The stalled deployment is now `REMOVED`.

**`railway logs --build` without a deployment id shows the MOST RECENT SUCCESSFUL deployment**, not the
one in flight — so it served a five-hour-old build log for a deploy that had just started, and hid the
real state for most of those 27 minutes. Always pass the deployment id. Same family as everything else
in this document: an accurate fact about the axis you did not ask about.

**This left a split state worth naming for next time:** the migration applied while the OLD code was
still serving, so for 27 minutes staging's database was normalised and its running code was not. No
anchor confirmation must run in that window, or it writes the old spelling straight back.

## 5b. NOT TRUE ON PRODUCTION YET

Production runs `master`, which does not carry `3c0e639`, and its database has not had the normalising
migration. **A capture anchored and confirmed on production today would land `STALE` exactly as
staging's seven did.** Production's own corpus is unaffected in the meantime — its 83 captures are
`MISATTESTING` under the superseded rule and its 8 evidence rows `VERIFIED` through the path that never
consulted `capturesAnchoredBy`.

Closing this on production needs a `SHIP`, which is the researcher's decision and nobody else's.

## 5c. THE HREF INSTRUMENT WAS BROKEN, AND ITS OUTPUT WAS A FINDING

Run for the first time on 2026-08-30 as Level 6 reconnaissance, `forensics:measure-href-changes`
reported that the MOH page's adverse-event reporting channel `https://t.me/MOHreport` **appeared and
vanished 13 times**, that 7 captures each lost ~50 links and got them back, and that 12 changes were
"invisible to the derived text".

**None of it describes the page.** The instrument called `decodeDocument` without `inflateDocument`, so
every capture whose origin served `Content-Encoding: gzip` was read as compressed bytes and yielded zero
hrefs. Four call sites decode a stored payload; three inflated and one did not — and that one also never
selected `documentContentEncoding`, so it was a missing call AND a missing column, with no type able to
complain about either.

| MOH page, 82 consecutive pairs | broken | fixed (`77f1281`) |
|---|---|---|
| pairs whose href set changed | 27 | **17** |
| invisible to the derived text | 12 | **2** |
| `t.me/MOHreport` flips | 13 | **0** |
| mass swings (≥15 links at once) | 10 | **0** |

**The reporting channel was never removed**, across 83 captures from 2021 to 2026.

**Three readings were needed to get there, and the first two were wrong:** "partial captures" (no — the
thin captures are LARGER and all return 200), then "two document variants" (no — both decode to the same
50,651 bytes), then the missing inflate (yes, and verified). The corroboration was in the instrument's
own output the whole time: it labelled those boundaries `INVISIBLE TO TEXT`, meaning the text layer saw
no change there — because `deriveText` inflates.

**The lesson is sharper than "there was a bug".** A wrong verdict can be caught by an audit. **A
defective measurement that looks plausible is what a researcher builds a claim on**, and this one
pointed straight at the platform's central finding. The instrument had never been run before, so there
was no earlier output to disagree with it — the same shape as a success arm that has never fired.

The fix is `captureHtml`, the single way to read a stored payload, with `DECODABLE_CAPTURE_SELECT` so a
caller that omits the encoding column cannot build the argument. **Every fixture in its test suite is
compressed**, deliberately: an uncompressed payload decodes correctly with or without the inflate, so an
uncompressed fixture cannot fail — which is exactly why nothing caught this.

### What the href layer holds, counted in the investigation's window

The corpus spans 2021–2026; the investigation is about 2019–2022. Quoting a rate over the corpus
understates density inside the window:

```
changed pairs by year   2021: 1 · 2022: 11 · 2023: 2 · 2024: 1 · 2025: 2
within 2019–2022        12 of 17  (70%)
```

The two changes invisible to every layer the platform reads are both link ADDITIONS whose anchor text
did not change — a new destination attached to existing words:

- **2022-07-08 `+ /daily-guidances/`** — inside the investigation window
- 2024-03-05 `+ /confirmed-cases-and-patients/risk-groups/` — outside it

## 6. What did NOT happen

- **No legacy state was touched.** `confirm-anchors` selects `anchorCheck: null`, and `--recheck` was
  never passed. The 113 settled subjects were not examined and not written.
- **Nothing was deleted, anywhere.**
- **No production command was run.** Every operational call named `--environment staging` and
  `--env staging`, and the container agreed on all four axes.
- **Level 3 clause 1's `STATUS:` was not flipped**, because the audit arm that would justify it cannot
  currently fire.
