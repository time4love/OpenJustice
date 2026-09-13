# Evidence step 11b — the build, on the emptied ground, 2026-09-08

**A dated record, never edited.** What was built, what was measured, and the two
things an instrument caught that a reading would not have. Every number and every
command output below was produced on the day; none is carried forward.

The step is `docs/gf-refactor-plan.md` §3b, step 11, built to `docs/gf-evidence-flows.md`'s
APPENDIX — A1's byte layout, A2's data model, A3's predicates, A7's instruments — as amended by
`docs/gf-document-flows.md` A2 (kind DOCUMENT, the third record key) and `docs/gf-thesis-flows.md`
A2 (the mention's pin and argument, `role` withdrawn). What left the tree first, and why nothing
here could still be read, is `docs/gf-legacy-switch-2026-09-08.md`.

---

## 1. THE PRECONDITION, AND WHO HOLDS IT

`npm run db:check-drift` was run from `apps/glass-fortress/backend` **before `schema.prisma` was
edited**, exit 0:

```
> prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
No difference detected.
```

The migration adds seven columns NOT NULL with no default. **PostgreSQL refuses that on a table
holding rows**, so the row-count precondition is not a formality anybody has to remember: a
non-empty table fails the statement, the pre-deploy step fails, the deploy aborts, and the previous
version keeps serving. The researcher reads the counts in the container before `LAND`; the platform
holds the same line independently.

## 2. THE MIGRATION, AND THE FOUR STATEMENTS THE GENERATOR PROPOSED THAT DID NOT LAND

The file is hand-written. It was then cross-checked against
`prisma migrate diff --from-schema-datamodel <staging> --to-schema-datamodel <new> --script`,
generated **offline with no database consulted**. Column sets are identical on all three tables.
Where the two differ, the hand-written file lands and the difference is recorded here:

| the generator proposes | the file does | why |
|---|---|---|
| `Evidence_snapshotId_fkey` `ON DELETE SET NULL` | `RESTRICT` | nothing is deleted after the rebuild (§9); a nulling arm is a deletion path standing open for a delete nobody intends to write |
| `ThesisMention_debateSessionId_fkey` `SET NULL` | `RESTRICT` | the same |
| `DiffDebateSession_recordSnapshotId_fkey` `SET NULL` | `RESTRICT` | the same |
| `DiffDebateSession_recordDiffId_fkey` `SET NULL` | `RESTRICT` | the same |
| an `EvidenceStatus_new` / `_old` rename dance | the column dropped and re-added | at zero rows it is fewer statements, and it says plainly that no value survives the change |
| — | `DROP FUNCTION match_evidence(vector, integer)` | Prisma does not know the function exists; the signature is the baseline migration's own (`20260815000000`, line 349) |
| — | four CHECK constraints | Prisma cannot express one, and A2 asks for a constraint "not a convention" |

`AnchorCheckOutcome` is **not** dropped: it is shared with `UrlSnapshot.anchorCheck`, which stays,
because a capture's anchor is the corpus's.

## 3. THE IDENTITY MODULE, AND A VECTOR THAT CAUGHT ITS OWN FIXTURE

A1's byte layout lives in `src/lib/evidenceIdentity.ts` and nowhere else. The test vector was
produced **outside the implementation**, at a shell — a vector the code produced proves the code is
self-consistent and nothing else, and what is being asserted is that an outsider holding the archive
computes the same name.

**The first attempt, and it is recorded because it is the finding:**

```
DOC2='9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645546372819a0b1c2d3e4f5061'   # 65 characters
CID2=$( { printf '%s' "$URL"; printf '\x00'; printf '%s' "$TS2"; printf '\x00';
          printf '%s' "$DOC2" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1 )
→ 0x486ef01b70b2a88d0f30cb8c276ef66dbde7d774c71c01aa2205018d74401482
```

`xxd -r -p` **silently truncated** the odd-length hex and hashed 32 bytes of a 32½-byte string. The
shell produced a plausible digest for a malformed input, and the module refused it —
`expected a 32-byte SHA-256 digest as hex`. The refusal is not decoration: a malformed hash reaching
the identity produces a well-formed name for nothing, which is the failure class a hash-shaped column
beside another hash-shaped column has already caused here.

**The vector that is checked in**, with a correct 64-character digest:

```
URL='https://news.walla.co.il/item/3403847'
TS1='20201209134003'; DOC1='3b1f0a9c2e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'
TS2='20210612183110'; DOC2='9f8e7d6c5b4a39281706f5e4d3c2b1a09182736455463728190a1b2c3d4e5f60'

CID1=$( { printf '%s' "$URL"; printf '\x00'; printf '%s' "$TS1"; printf '\x00';
          printf '%s' "$DOC1" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1 )
CID2=$( { printf '%s' "$URL"; printf '\x00'; printf '%s' "$TS2"; printf '\x00';
          printf '%s' "$DOC2" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1 )
DID=$(  { printf '%s' "$CID1" | xxd -r -p; printf '%s' "$CID2" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1 )

CAPTURE_ID(before) = 0xac387efe0b979e23e4fca6762ff34cc6cd82aa74ebc554d5d969c8bbfd8ba5be
CAPTURE_ID(after)  = 0x221260368d9629faf330f3a4d0d1d31675ccc4fa5c3aa93e3234c123d00228c6
DIFF id            = 0x75246b3103f9039e89d9cfcd4b9b01e4e0e75cf467ad7b57056576afdcbacbc0
```

The reviewer recomputed all three independently with Python's `hashlib` from the test's own inputs;
all three match.

**The scan is stated as a PROPERTY, not as "one file may compose a name".** Every
`createHash('sha256')` / `ethers.sha256` call site under `src/` is on a named list saying WHAT IT
HASHES — bytes, text, a token, a prompt, a source state, a diff's content, a record's identity. A new
caller fails until it is named, which is the moment to ask what it is naming. Two decoys:

- a planted eighth caller composing a URL and a timestamp → `no call site is unnamed` fired, naming
  `lib/decoyHasher.ts`;
- **the other direction caught a real stale entry on the day it was written.** `lib/bytes32.ts` names
  `ethers.sha256()` in a COMMENT explaining why two layers store digests differently, and never calls
  it. `readCode` strips comments, so the list and the tree disagreed — and the case
  `no name describes a file that has stopped hashing` is what made the disagreement visible.

## 4. BOTH INSTRUMENTS, OBSERVED TO FAIL

A7: "None is proven until it has been observed to FAIL."

**`forensics:audit-evidence`** (`evidence-recomputable`) runs through `runOperationalScript` with
`--env` stated twice, like every operational script. Against a deliberately broken checker returning
`{ rows, malformed: [] }` unconditionally, **all ten cases went red by name**:

```
✕ a fileHash one byte off is NOT_RECOMPUTABLE, and the report names what the record is
✕ two record keys set is MULTIPLE_RECORD_KEYS
✕ no record key at all is NO_RECORD_KEY
✕ a key that does not match its kind is KEY_DOES_NOT_MATCH_KIND
✕ an affirmed version absent from the record is AFFIRMED_VERSION_MISSING
✕ a debate that is not PROMOTED is DEBATE_NOT_PROMOTED
✕ a debate PROMOTED for a DIFFERENT record is DEBATE_NOT_PROMOTED, and names which
✕ a record the row names but the corpus does not hold is RECORD_MISSING
✕ a DOCUMENT row whose fileHash is not its commitment is NOT_RECOMPUTABLE
✕ names the defect as a write defect rather than staleness
```

Restored: 31 of 31 green.

**Zero rows is a PASS here, and elsewhere in this repository an empty subject set is a REFUSAL.** The
difference is what the question is. "Does every anchoring claim carry a check?" is vacuous with no
claims — `auditOnChainAnchors` exits non-zero on one. "Is any stored row malformed?" has a true and
useful answer at zero. What makes that honest rather than reassuring is that the COUNT is the
report's first line, before any verdict, and the exit code carries nothing the number does not.

**`evidence-no-prose`** is in the suite, and its allow-list is **derived from A2's own column list**
rather than hand-maintained: a rule written as an enumeration is tested against the same enumeration.

## 5. THE REBASES, AND WHAT EACH ONE'S TAG MOVED TO

Six modules the designs KEEP still read the columns this step drops. Each is rebased onto what the
design already says, and each test's tag moves with it — recorded by one dated line in the as-built
inventory or the thesis plan's §5, which are the only plan edits this step makes.

| module | rebased onto | its test |
|---|---|---|
| `thesisClaimAudit` | the page through the RECORD KEY — `Evidence.snapshotId` / `urlVersionDiffId` → `UrlSnapshot.trackedUrl` — never `sourceUrl` parsed out of a replay URL | KEEP → REWRITE |
| `evidenceInputSoundness` (check 17) | CURRENT(diff)'s PER-CHUNK survival on `DiffContentVersion` | KEEP → REWRITE |
| `auditOnChainAnchors` | CAPTURES alone; the evidence arm goes | KEEP → REWRITE |
| `onChainVerification` / `onChainVerdict` | a claim with no transaction column and two statuses | KEEP → REWRITE |
| `registryState` / `registryLedger` | captures alone; a frozen registry's evidence entries are ORPHANED and explained by the committed ledger file | KEEP → REWRITE |
| `claimTrajectory` | candidates from CURRENT(diff)'s COMPUTED chunks | KEEP → REWRITE |

**The join got exact, not merely different.** `thesisClaimAudit` matched a Wayback replay URL parsed
back to a page against `TrackedUrl.url` as text; it now follows a foreign key. No prefix to strip, and
no page missed because two spellings of one URL differ by a trailing slash.

**`DETECTION_VERSION` moved v2 → v3**, and the pin is why. Rebasing the trajectory detector changes
WHICH claims are found, so every trajectory stored under v2 answers a different question. The
2026-08-30 regeneration was allowed WITHOUT a bump because the source moved and the behaviour provably
did not; here the behaviour is what moved, and the recompute is paid.

**Five verdicts left `ON_CHAIN_VERDICTS`, and the reachability guard is why they could not be left.**
`CONSISTENT`, `UNANCHORED_CONFIRMED`, `MISSING_TX_HASH`, `PENDING_UNREGISTERED` and
`PENDING_BUT_ANCHORED` were all about an evidence row's own registration. Not one can be produced
now. The case `every verdict the rule can name is reachable and explained` names the failure mode
exactly — "a verdict that exists, is never produced, and is therefore never questioned" — and leaving
them would have meant weakening that guard to accommodate dead vocabulary.

**Three modules were retired rather than rebased, each because its subject left:**

- `diffSurvivalView` — the display module 11a-evidence split out to keep alive. Rebasing check 17
  removed its last consumer, exactly as its own header predicted.
- `lib/trajectoryContext` — no caller under `src/` at all: its consumers went in 11a-thesis. The
  trajectory context a critic is given returns at thesis step 22, over computed content.
- the candidate-source comparison and `forensics:compare-candidate-sources` — one of its two arms read
  the classifier's items. **The measurement is taken and recorded**
  (`docs/gf-candidate-source-measurement-2026-08-30.md`: the free option survives, do not re-measure),
  and the arm that won is the one the detector now uses.

## 6. THE ACCEPTANCE SUITE, AND WHAT IS RED ON PURPOSE

`test/evidence/` is a fourth jest project. `unit`'s `testPathIgnorePatterns` gains it — without that
line `npm test`, the required check, runs files that are red by design — and
`.github/workflows/tests.yml` gains a **non-gating** `test:evidence` step in the shape the walk's has.

| file | state |
|---|---|
| `identity.test.ts` | green — A1's layout and the sha256 property scan |
| `auditEvidence.test.ts` | green — the instrument and its ten observed failures |
| `scans.test.ts` | green — A7's five scans, each with its decoy |
| `invariants.test.ts` | green — target §9.8, against the schema AND the migration |
| `predicates.test.ts` | **RED BY DESIGN** — `ARGUED`, `VERIFIED`, `PUBLISHABLE`, `PUBLIC_PAGE`, `FLAGGED` name `services/evidencePredicates.ts`, which steps 12–15 build |

`WRITES_ALLOWED` is **imported** from `src/services/anchorSnapshots.ts`, never re-spelled: it is
evaluated once, at the one place a capture is anchored.

Several scans hold ZERO today — no evidence writer exists yet, so "the walk writes no evidence" is
trivially true. That is not the same as holding nothing, and the decoy is what separates a rule that
is satisfied from one that is merely unexercised.

## 7. THE RUNS

From `apps/glass-fortress/backend` by absolute path:

```
npx tsc --noEmit          exit 0
npm test                  93 suites / 1,249 tests, all green — both lint ratchets included
npm run test:walk         20 suites / 424 tests, unchanged
npm run test:evidence     4 of 5 files green, 58 cases; predicates.test.ts red by design
git diff staging -- src/walk    0 lines
```

**Both ratchets ended green with every entry falling, and one REGRESSION was removed rather than
baselined.** The schema narrowing types made five conditions provably always true in two files this
step does not otherwise touch — `trajectoryContext.ts` (4) and `onChainVerification.ts` (1). New debt
is never locked into a baseline: the first file was dead code and went; the second's condition read a
column that no longer exists, and went with it.

## 8. WHAT THIS STEP DOES NOT CLAIM

That evidence works. Nothing promotes a record, reviews one, or publishes a thesis that cites one —
those are steps 13, 14 and 15. What 11b establishes is that the schema is the appendix's, that a
record's name is computable by an outsider from the archive alone, and that two instruments can fail.
Only a staging exercise says a researcher can use what comes next, and each of those steps owes its
own.
