# The rebuild on staging, step 1 — MEASURE, read-only — 2026-09-06

**Refactor plan §3 step 9, sub-step 1; evidence flows §8.** Three measurements, all read-only, all in
the staging container, before the registry ledger is emitted, before a new contract is deployed and
before the configuration is rotated. Nothing was written to any database, nothing was anchored,
nothing was spent. Every number here is taken from the raw returns with `jq`, never transcribed:
`handoffs/R27-*-2026-09-06.*` (the handoffs directory, outside this repository).

The instruments are `forensics:read-registry` and `forensics:measure-custody`, landed as PR #365
(`e0065bd`), reviewed under plan §9.2 and run under `runOperationalScript`. Every run's file carries
the guard's banner — *environment staging — agreed by Railway, APP_ENV, the database and the chain* —
and the deployment — `045007b2 @ e0065bd` for §2 and §3, `9790530f @ a8a53bf` (PR #366) for §4.

## 1 — the environment, by `get_environment`

`environment: staging`, `verdict: CONFIRMED`, chain `84532`, registry
`0x65b9a7acb45Aa05e7Ed207844F93a2b308373853` with code at it; corpus 3 pages · 112 snapshots ·
0 unanchored · 9 evidence · 1 thesis. Identified from the return, not from a connector's name.
Raw: `R27-environment-2026-09-06.json`.

## 2 — measurement (b): the old registry, read from STATE

`forensics:read-registry --env staging`, 07:59:22Z to 07:59:50Z. For every index below
`totalEvidence()`, `getEvidence(index)` from the contract's storage — hash, submitter, block time,
category — and the total re-read afterwards; then every hash column of every corpus row asked of
`isRegistered`, and each entry classified by the column that produced it. No receipt and no log was
read. Raw: `R27-read-registry-2026-09-06.txt`.

| fact | value |
|---|---|
| registry | `0x65b9a7acb45Aa05e7Ed207844F93a2b308373853`, Base Sepolia (84532) |
| registrar (from the deployment's wallet) | `0x9de2e74b3c5dac4c3e2a0d18a5b76eeac8989a28` |
| `totalEvidence()` | **44** at 07:59:26Z, unchanged after every index was read |
| submitters | one — the registrar above, on all 44 |
| block times | 2026-08-16 17:10:34Z to 2026-08-30 04:50:06Z |

**Entries by the column that produced them:**

| kind | entries | category on the chain |
|---|---|---|
| CONTENT_HASH — SHA-256 of Readability's article; one entry covers every byte-identical twin | 15 | `Wayback Snapshot` |
| DOCUMENT_HASH — SHA-256 of the payload as served, the target's scheme | 7 | `Wayback Snapshot` |
| EVIDENCE_FILE_HASH — an evidence name under the retired formula, current | 8 | 7 × `Forensic Evidence`, 1 × a five-category classifier list |
| EVIDENCE_PREVIOUS_FILE_HASH — an evidence name the row has since moved off | 7 | classifier category lists |
| UNEXPLAINED — no hash column holds it | 7 | see below |
| AMBIGUOUS — two columns hold it | 0 | |

**Per subject** — the number a reader acts on:

| subject | count | attributed by | NEITHER |
|---|---|---|---|
| snapshots | 112 | 7 by `documentHash`, 105 by `contentHash`, 0 by both | **0** |
| evidence rows | 9 | 7 by both `fileHash` and `previousFileHash` (the rehash case), 1 by `fileHash` alone | **1** — the PENDING_REVIEW row, never anchored |

Per column asked, 240 claims: ATTRIBUTED 127 · UNREGISTERED 113 · FOREIGN_SUBMITTER 0. A legacy
snapshot is registered on exactly one of its two columns, so UNREGISTERED ≈ the snapshot count there
by construction; it is the per-subject table above that says every capture is attributed.

**The seven entries no column explains**, in index order:

| index | block time | category | hash |
|---|---|---|---|
| 0 | 2026-08-16 17:10:34Z | `ACCOUNTABILITY_EROSION,INFORMED_CONSENT,SAFETY_CLAIM_ALTERATION,STATISTICAL_MANIPULATION,WITHHOLDING_INFORMATION` | `0x56a466ef…2963d6` |
| 1 | 2026-08-18 11:30:52Z | `UNCLASSIFIED` | `0x9e470f9d…e6e982` |
| 29 | 2026-08-27 09:18:58Z | `Wayback Snapshot` | `0x64dfcc74…bbbbe9` |
| 30 | 2026-08-27 09:19:06Z | `Wayback Snapshot` | `0x060129a2…3567e` |
| 31 | 2026-08-27 09:19:10Z | `Wayback Snapshot` | `0xed9c1017…ca617` |
| 32 | 2026-08-27 09:19:14Z | `Wayback Snapshot` | `0xe9eb7947…57bd1` |
| 36 | 2026-08-28 23:34:32Z | `WITHHOLDING_INFORMATION` | `0x052790c3…3e2d6` |

All seven were submitted by this deployment's registrar; the corpus holds no trace of the hash,
current or superseded: a read-only probe (`R27-unexplained-probe-2026-09-06.txt`) asked
`anchoredHash` on both tables and every superseded `TextVersion` for all seven and found none.
Indexes 0 and 1 precede the 2026-08-21 wipe (`docs/gf-staging-data-loss-postmortem-2026-08-21.md`):
their rows went with that database. Indexes 29–32 and 36 are post-wipe. That they are four snapshot
anchors written during the 2026-08-27 recovery runs and one evidence name of 2026-08-28 is an
**inference from category and block time**, not a fact read from any row. Which rewrite or deletion
erased each row is archaeology under `CLAUDE.md`'s rule; the ledger needs a kind for them, not a
history.

**The researcher's ruling, 2026-09-06, verbatim:** *Ledger kinds for the join's UNEXPLAINED:
PRE_WIPE (block time before 2026-08-21, staging only, derived) and ORPHANED (a committed per-index
list: 29, 30, 31, 32, 36 — no current or superseded row holds the hash; the row that produced it was
rewritten or removed by a later run; which one is archaeology under CLAUDE.md). Any unexplained index
NOT on the list refuses. Step 2's completeness test covers: count ≠ totalEvidence() refuses; an
unlisted UNEXPLAINED index refuses; a listed one passes with its kind.*

## 3 — measurement (a): extractor equality per capture

`forensics:measure-custody --env staging --url <page>`, one run per page, no fetch. For each archived
capture: `sha256(extractArticleText(captureHtml(document), rawCaptureUrl(ts, url)))` against the
stored `contentHash` — the same function, under the same `id_` URL, that both writers ran when the
row was recorded — and, apart from it, `sha256(fullText)` against `contentHash` (does the row agree
with itself). Raw: `R27-measure-custody-{walla,rtmag,corona}-2026-09-06.txt`.

| page | archived captures | EQUAL | UNEQUAL | NO_BYTES | stored text disagreeing with its `contentHash` |
|---|---|---|---|---|---|
| `https://news.walla.co.il/item/3403847` | 7 | 7 | 0 | 0 | 0 |
| `https://rtmag.co.il/health/the-israeli-moh-hid-…-ordered` | 22 | 22 | 0 | 0 | 0 |
| `https://corona.health.gov.il/vaccine-for-covid/` | 83 | 83 | 0 | 0 | 0 |
| **total** | **112** | **112** | **0** | **0** | **0** |

**What this settles for the ledger (evidence flows §8):** on every capture the corpus holds, the
bytes the rebuild will register on the new contract produce, under the pinned extractor, exactly
the text the old contract's extraction anchor attests. The weaker branch — "a text the bytes no
longer reproduce" — has no population on staging. Custody across the two contracts is whole.

## 4 — measurement (c): the archive still serving each capture's bytes

`forensics:measure-custody --env staging --url <page> --fetch`: one GET of the raw `id_` capture per
row, 4 s between rows, no retry; the status recorded, and on a 200 the served bytes hashed against
`documentHash` and, where the row has a CDX entry, against the Archive's own digest. One attempt per
capture. Raw: `R27-measure-custody-{walla,rtmag,corona}-fetch-rerun-2026-09-06.txt`.

**A first attempt did not measure.** The runs of 08:07–08:20Z returned every walla and rtmag row
`UNAVAILABLE` with `status: null` and no reason, and corona's ssh session ended with code 1 before
its block was written (`R27-measure-custody-{walla,rtmag,corona}-fetch-2026-09-06.txt`, kept as the
record of the attempt). The instrument could not say whether the container reached the archive; the
reviewer's finding 4 added the fetch error's own message to every non-200 verdict (PR #366,
`a8a53bf`), and the runs below are on that build. The reviewer's three probes of the same raw URLs
from a laptop in that window answered HTTP 200 in under 3 s — a read from a different vantage point,
recorded as such and never as the measurement.

**The re-runs, on `a8a53bf` (deployment `9790530f`) — walla 08:26:42–08:27:22Z, rtmag
08:28:47–08:30:38Z, corona 08:30:42–08:37:15Z — every file exit 0 with the guard's banner:**

| page | captures | SERVED_VERIFIED | SERVED_DIFFERENT | NOT_FOUND | RATE_LIMITED | UNAVAILABLE | UNCLASSIFIED | CDX digest: rows · match |
|---|---|---|---|---|---|---|---|---|
| walla | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 7 · 7 |
| rtmag | 22 | 22 | 0 | 0 | 0 | 0 | 0 | 22 · 22 |
| corona | 83 | 82 | **1** | 0 | 0 | 0 | 0 | 83 · 82 |
| **total** | **112** | **111** | **1** | **0** | **0** | **0** | **0** | **112 · 111** |

No 429 in 112 attempts at 4 s pacing. 111 of 112 captures are served today as the bytes we hold,
and those bytes reproduce the Archive's own digest for every one of them.

**The one capture the Archive no longer serves as held: corona `20250423145731`.** HTTP 200, and
the served bytes hash to `4278d564…c3de69` — which is, read from the corpus's own `documentHash`
values, **byte-identical to the next capture, `20250425035258`**, whose fetch verified. The Archive
answers the 04-23 timestamp with the 04-25 record; the row's own CDX digest is not what it serves.
The 04-23 bytes we hold are still attested on the old registry through their `contentHash` (index
19, ATTRIBUTED). For the rebuild this is the flows doc's case *a capture the archive no longer serves
is rebuilt from the dump and said so*: the survey-and-walk of the cleanup session will acquire the
04-25 bytes at the 04-23 timestamp and find them a duplicate, so the 04-23 capture as held comes
from the dump, not from the archive, and the new registry entry for it is registered from held
bytes with that provenance stated. **Count: 1 of 112.** Raw:
`R27-measure-custody-corona-fetch-rerun-2026-09-06.txt`, row `20250423145731`;
`R27-read-registry-2026-09-06.txt`, the claims of `cmt499dvq0049leb11j1vsjbs` and
`cmt499hep004bleb1kz0aijxt`.

## 5 — what steps 2–4 take from this

- **The registrar is the deployer.** The old contract's every entry was submitted by
  `0x9de2…9a28`, the account that deployed it on 2026-08-16 (`contracts/broadcast/…/84532`). The
  constructor grants `REGISTRAR_ROLE` to the deployer; if the new deploy uses the same key, no
  `grantRole` follows, and `hasRole` is read from the chain either way.
- **The ledger's kinds** are the five above plus the researcher's ruling for the seven; completeness
  is 44 entries against `totalEvidence()` re-read on the day it is emitted.
- **The window between rotation and step 5.** Until step 5's `REGISTRY_FROZEN` refusal lands, the
  old write tools on staging would anchor onto the new registry with an unstamped index zero. The
  written rule, bounded like production's, **ruled 2026-09-06, verbatim:** *no write tool and no
  `--apply` script that reaches the chain runs on staging between the rotation and step 5's
  landing.* Recorded at plan §3 step 9, here, and in the cleanup session's prompt.
- **The ledger's shape (ruled 2026-09-06):**
  `apps/glass-fortress/backend/registry-ledger/84532-0x65b9a7acb45aa05e7ed207844f93a2b308373853.json`,
  chain id and lower-case address; per entry index, hash, submitter, blockTime, category, kind,
  formula, inputs, attested, replacedBy; file-level registry, chainId, registrar, totalEvidence,
  readAt, commit, `testnet: true`, `successor: null` until step 4 fills it in a second commit. A
  dated findings doc points at it and is its README line.
- **The cleanup session's step 6 has the same precondition as (c)** — the container must reach the
  archive, seen in the walk's own outcomes, before its walk is read as the corpus; and it carries one
  named exception: corona `20250423145731` is held from the dump, not re-acquired (§4).
- **Broadcast and cache under `contracts/` are gitignored**; the new address, its transaction and
  block go in step 3's dated doc and the ledger's `successor` field, never in code.

## 6 — raw files

`R27-environment-2026-09-06.json` · `R27-read-registry-2026-09-06.txt` ·
`R27-unexplained-probe-2026-09-06.txt` · `R27-measure-custody-{walla,rtmag,corona}-2026-09-06.txt` ·
`R27-measure-custody-{walla,rtmag,corona}-fetch-2026-09-06.txt` (the first attempt, not a measurement) ·
`R27-measure-custody-{walla,rtmag,corona}-fetch-rerun-2026-09-06.txt` (the measurement).

Bears on: refactor plan §3 step 9.
