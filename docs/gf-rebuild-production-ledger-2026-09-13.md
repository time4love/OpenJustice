# The rebuild on production, step 2 — the REGISTRY LEDGER for the old mainnet contract — 2026-09-13

**Refactor plan §3 step 9, sub-step 2, on PRODUCTION; evidence flows §8.** Every index on production's
first evidence registry, explained in git before the database that produced it is dropped. **MAINNET.**
This is the ledger evidence flows §8 was written for: the old contract is immutable, public, linked
beside its successor once the rotation lands, explained index by index, and still writable by the same
registrar — nothing hidden, nothing that can be. Step 1 preceded it:
`docs/gf-rebuild-production-measure-2026-09-13.md`.

**The file:**
[`apps/glass-fortress/backend/registry-ledger/8453-0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22.json`](../apps/glass-fortress/backend/registry-ledger/8453-0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22.json)
— chain id and lower-case address in the name; per entry `index`, `hash`, `submitter`, `blockTime`,
`category`, `kind`, `formula`, `inputs`, `attested`, `replacedBy`; file-level `registry`, `chainId`,
`testnet`, `registrar`, `totalEvidence`, `readAt`, `commit`, `successor`. Written on the laptop from the
emitter's delimited block, byte-identical to it (`cmp`), 37,564 bytes; the raw run is
`handoffs/P1-registry-ledger-2026-09-13.txt`, outside this repository. Never hand-edited.

## 1 — the run

`forensics:registry-ledger --env production`, in the production container under the guard —
*environment production — agreed by Railway, APP_ENV, the database and the chain*, deployment
`12f29fb4 @ 0ca8d72` — exit 0, one emission. The emitter at `0ca8d72` keeps the six kinds and its
`formulaFor` is the one at `master`'s head, so the committed-file test at head holds this file
(verified before the run by diffing the formula constants between the two commits).

| fact | value |
|---|---|
| registry | `0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22`, Base mainnet (8453), `testnet: false` |
| registrar | `0x19a4385405643682607c78d7e5c3a940ba2cccc8` — every entry's submitter |
| `totalEvidence()` | **20** at 2026-09-13T13:16:31.917Z, re-read unchanged after every index |
| entries | 20, indexes 0–19 contiguous, 20 distinct hashes |
| `commit` | `0ca8d721011a23d00c8b3f5ebf09bc72c413dafc` |
| `successor` | `null` — filled by sub-step 4 in its own commit |

## 2 — the 20 entries by kind

| kind | entries | block times | what it explains |
|---|---|---|---|
| CONTENT_HASH | 12 | 2026-08-25 11:39 → 11:47 | extraction anchors: SHA-256 of Readability's article; 12 entries cover all 83 captures of corona `vaccine-for-covid` (the extraction hash collapses byte-identical twins) |
| EVIDENCE_FILE_HASH | 8 | 2026-08-25 09:19, 14:55 → 14:56; 08-26 09:38 | evidence names under the retired formula, current on their rows: 7 FORENSIC_DIFF (`forensicEvidenceFileHash`), 1 DOCUMENT (`Web3Service.hashFile`) |

No DOCUMENT_HASH: production never anchored a payload. No EVIDENCE_PREVIOUS_FILE_HASH: no production row
was rehashed. No PRE_WIPE (staging-only, by construction) and no ORPHANED: every entry is explained by a
column, so `ORPHANED_BY_REGISTRY` gained no production key and no ruling was asked.

**What each kind says it is replaced by:** a CONTENT_HASH by each listed capture's `documentHash` on the
successor registry, tied to it by the extractor-equality measurement (83 of 83, the measure doc §5); an
evidence name by no row — evidence is rebuilt by the researcher's hand under evidence flows.

## 3 — what holds it complete

`test/registryLedgerCommitted.test.ts`, now over two files: the filename names the chain and address
the file claims and `testnet` is derived from the chain id; the entries are exactly `0..19` with distinct
hashes; every kind is one of the six; the ORPHANED indexes are exactly the committed list for the address
(none); PRE_WIPE only on the testnet; every entry carries a formula, an attestation and a replacement;
registrar, read time and emitting commit present; every entry's `formula` equals `formulaFor(kind,
inputs)` in the code. 15 cases green with both files. The emitter's refusals are `test/registryLedger.test.ts`.

## 4 — what steps 3 and 4 take from this

- Nothing below step 2 is blocked: no index is unexplained. The new mainnet contract may be deployed.
- The registrar on this registry is `0x19a4…ccc8`; the successor is deployed with the same key, so the
  constructor's grant is the grant, and `hasRole` is still read from the chain and quoted.
- After rotation, `successor` in this file is set to the new address in its own commit — the only place
  the old address and the new one meet; no path in code consults two registries.

Bears on: refactor plan §3 step 9.
