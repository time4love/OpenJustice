# The rebuild on staging, step 2 — the REGISTRY LEDGER, emitted and committed — 2026-09-06

**Refactor plan §3 step 9, sub-step 2; evidence flows §8.** Every index on staging's first evidence
registry, explained in git before the database that produced it is dropped. **TESTNET.** Staging's
registry is not a custody claim — a testnet's history is disposable — so this ledger is emitted,
verified and committed to prove the instrument on real entries, not to be read as attestation. The
production ledger, emitted at SHIP by the same script, is the one that is read.

**The file:**
[`apps/glass-fortress/backend/registry-ledger/84532-0x65b9a7acb45aa05e7ed207844f93a2b308373853.json`](../apps/glass-fortress/backend/registry-ledger/84532-0x65b9a7acb45aa05e7ed207844f93a2b308373853.json)
— chain id and lower-case address in the name; per entry `index`, `hash`, `submitter`, `blockTime`,
`category`, `kind`, `formula`, `inputs`, `attested`, `replacedBy`; file-level `registry`, `chainId`,
`testnet`, `registrar`, `totalEvidence`, `readAt`, `commit`, `successor`. Written on the laptop from
the emitter's delimited block, byte-identical to it (`cmp`); the raw run is
`handoffs/R27-registry-ledger-rerun-2026-09-06.txt`, outside this repository (the first emission is
`R27-registry-ledger-2026-09-06.txt` beside it).

## 1 — the run

`forensics:registry-ledger --env staging` (PR #368 with finding 5 of PR #369, `265c7ff`), in the
staging container under the guard — *environment staging — agreed by Railway, APP_ENV, the database
and the chain*, deployment `04b05b13 @ 265c7ff` — exit 0. A first emission on `4e6e8d9` at
08:58:21Z carried a DOCUMENT formula naming three of `Web3Service.hashFile`'s five writers; the
reviewer's finding 5 corrected the constant and the file was re-emitted, never hand-edited; the
committed-file test now holds every entry's formula equal to the code's.

| fact | value |
|---|---|
| registry | `0x65b9a7acb45aa05e7ed207844f93a2b308373853`, Base Sepolia (84532), `testnet: true` |
| registrar | `0x9de2e74b3c5dac4c3e2a0d18a5b76eeac8989a28` — every entry's submitter |
| `totalEvidence()` | **44** at 2026-09-06T09:25:02Z, re-read unchanged after every index |
| entries | 44, indexes 0–43 contiguous, 44 distinct hashes |
| `commit` | `265c7ff18ca0ccbf1c854ec0ceaeb84ad456ea65` |
| `successor` | `null` — filled by step 4 in its own commit |

## 2 — the 44 entries by kind

| kind | entries | block times | what it explains |
|---|---|---|---|
| CONTENT_HASH | 15 | 2026-08-22 22:58 → 08-28 19:48 | extraction anchors: SHA-256 of Readability's article; 15 entries cover 105 captures (corona 83, rtmag 22; one entry covers up to 25 byte-identical extractions) |
| DOCUMENT_HASH | 7 | 2026-08-30 04:48 → 04:50 | payload anchors, the target's scheme: walla's 7 captures |
| EVIDENCE_FILE_HASH | 8 | 2026-08-22 09:53 → 08-23 03:15 | evidence names under the retired formula, current on their rows |
| EVIDENCE_PREVIOUS_FILE_HASH | 7 | 2026-08-22 14:42 → 14:43 | the same rows' earlier names, before `forensics:rehash-evidence` |
| PRE_WIPE | 2 | 2026-08-16 17:10, 08-18 11:30 | indexes 0 and 1 — derived from block time; the rows went with the database destroyed 2026-08-21 |
| ORPHANED | 5 | 2026-08-27 09:18 → 08-28 23:34 | indexes 29, 30, 31, 32, 36 — the committed list; no current or superseded row holds the hash |

The two ruled kinds are the researcher's ruling of 2026-09-06, recorded verbatim in
`docs/gf-rebuild-staging-measure-2026-09-06.md` §2 and held in code by `ORPHANED_BY_REGISTRY`
(`src/services/registryLedger.ts`), keyed by the registry's address: **the list never overrides the
join**, and an unexplained index not on it refuses the whole ledger.

**What each kind says it is replaced by:** a DOCUMENT_HASH by the same hash registered afresh on the
successor with its own block time; a CONTENT_HASH by each listed capture's `documentHash` on the
successor, tied to it by the extractor-equality measurement (112 of 112, §3 of the measurement doc);
an evidence name by no row — evidence is rebuilt by the researcher's hand; PRE_WIPE and ORPHANED by
nothing.

## 3 — what holds it complete

`test/registryLedgerCommitted.test.ts`, over every file under `registry-ledger/`: the filename names
the chain and address the file claims; the entries are exactly `0..totalEvidence()-1` with distinct
hashes; every kind is one of the six, never UNEXPLAINED or AMBIGUOUS; the ORPHANED indexes are exactly
`ORPHANED_BY_REGISTRY` for that address; PRE_WIPE only on the testnet and only before 2026-08-21;
every entry carries a formula, an attestation and a replacement; the registrar, the read time and the
emitting commit are present; every entry's `formula` equals `formulaFor(kind, inputs)` in the code.
Observed red with the directory absent (the vacuity case and every per-file case), and red again on
the first emission's file once the formula case existed; green with this file. The emitter's own refusals — count ≠ `totalEvidence()`, an
empty registry, AMBIGUOUS, an unlisted UNEXPLAINED index, every offending index named — are
`test/registryLedger.test.ts`.

## 4 — what step 3 and step 4 take from this

- Nothing below step 2 was blocked: no index is unexplained. The new contract may be deployed.
- The registrar on this registry is `0x9de2…9a28`; the researcher deploys the successor with the
  same key (ruled 2026-09-06), so the constructor's grant is the grant, and `hasRole` is still read
  from the chain and quoted.
- After rotation, `successor` in this file is set to the new address in its own commit — the only
  place the old address and the new one meet; no path in code consults two registries.

Bears on: refactor plan §3 step 9.
