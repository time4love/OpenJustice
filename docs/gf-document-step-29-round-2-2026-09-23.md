# Document step 29b, round 2 — the fix round (2026-09-23)

**Bears on:** `docs/gf-document-refactor-plan.md` step 29 (:151–:171). Round 1's record is
`docs/gf-document-step-29-2026-09-23.md` and is **never edited**; this is the record of the round that
answered its grading. The grading itself is `handoffs/R75-review-state.md` :119 — 2 HIGH, 6 MEDIUM, 4 LOW,
produced by a REVIEW seat that reproduced every claim of round 1 with its own decoys.

**Written the day it was built; never edited after.** It CORROBORATES and never DECIDES — a ruling is
grounded in an appendix or a plan step.

---

## 1. WHAT THE RESEARCHER RULED BETWEEN THE ROUNDS, and what this round did with it

Two of the three questions round 1 raised came back ruled, and both are applied here rather than argued.

- **`recomputable` is RENAMED to `recomputableDocument`.** Round 1 kept the bare name in
  `services/documentPredicates.ts` and EXEMPTED that module from evidence's one-symbol scan — an edit to a
  **sibling acceptance suite**, which two landed clauses forbid in terms:

  > `gf-document-refactor-plan.md` §1 **:47–:49** — *"the sibling acceptance suites — `walk`, evidence's,
  > `thesis` — stay green and unedited as the guard (§4 rule 2). A seam that needs a sibling's test edited
  > is a seam this plan got wrong."*
  >
  > `gf-refactor-plan.md` §4 rule 2 **:522–:524** — *"A KEEP file that has to change to keep passing means
  > a reused module's contract moved, and the step that moved it is wrong."*

  `test/evidence/scans.test.ts` and `test/evidence/identity.test.ts` are restored to their committed
  content: **`git diff 06cddf9 -- test/evidence/` is EMPTY.** The module now exports
  `recomputableDocument` beside `recomputableEvidence` — **both qualified, neither bare** — which also
  closes the asymmetry round 1 flagged and could not guard.

- **`text/plain` IS BYTES-ONLY.** Recorded here so no later seat re-opens it. **No code changed**:
  `readerClassOf` already sends it to `NO_READER_FOR_TYPE`. Its two grounds:

  1. `gf-document-flows.md` §3 **:283** — the paste row was retired as a **KIND**, not merely as a door,
     so the kinds are FOUR: a PDF with a text layer, a scan, a SPREADSHEET (:284), and a file no engine
     reads. Plain text is not among them.
  2. `gf-document-flows.md` §9 **:1013** — board י1ב's `.txt` transcript is **superseded**: *"the
     transcript is a second document as a PDF, `derivedFrom` the media, not a paste."*

  Adding a UTF-8 decoder would be a **fifth kind nobody ruled**, which is why it is not built.

**THE THIRD QUESTION IS STILL THE RESEARCHER'S AND WAS NOT TOUCHED.** The re-derivation trap — a HELD
document whose text does not change under a moved `CURRENT_EXTRACTOR` stays `AWAITING_DERIVATION`
permanently while the pass reports `UNCHANGED` (§3 :317 against A3 :1368) — is untouched in code and
**encoded by no test in either direction**. `rederiveDocuments.ts` keeps its round-1 behaviour.

> **SUPERSEDED 2026-09-23, the same day, by the researcher's ruling and by ROUND 3 —
> `docs/gf-document-step-29-rounds-3-4-2026-09-23.md`.** The trap is RULED and FIXED: A2 :1300 gives the
> row `derivedUnder`, an append-only list of every extractor version that reproduced the text, and A3
> :1368 makes `CURRENT(d)` read MEMBERSHIP of it. The paragraph above states this round's tree and is left
> exactly as written — **a record says what was true when it was written** — and this line is added before
> the doc lands, because a record becomes immutable when it LANDS and not before.

## 2. THE IDENTITY FORMULA IS CALLED, NOT RESPELLED — and that is what made the revert clean

Reverting `test/evidence/identity.test.ts` was not free: round 1 had added
`services/documentPredicates.ts` to its `NAMED_HASHERS` list, because `RECOMPUTABLE(d)`'s HELD arm
composed `createHash('sha256')` inline. That scan has a case in BOTH directions —
*"no name describes a file that has stopped hashing"* — so the list and the tree must agree.

**The predicate now CALLS `docId(bytes)`**, the one formula `lib/documentIdentity` states for A1 :1232,
which the module already imported for `commitment`. No new dependency, no second spelling of an identity,
and the sibling's list is correct unedited. **The rename and the revert were one change, not two.**

## 3. THE READER TABLE — a type it accepts is a type `extract` answers for

Round 1's `extract()` **threw** on two of its own accepted types, and it was found by a probe rather than
by a case: `text/csv` and `application/vnd.ms-excel` both reached `workbook.xlsx.load`, raising
`Can't find end of central directory : is this a zip file ?`, because neither is a zip.

| type | round 1 | round 2 |
|---|---|---|
| `text/csv` | **THREW** | **COMPUTED** — read through `workbook.csv.read`, the same serialisation |
| `application/vnd.ms-excel` | **THREW** | `NO_READER_FOR_TYPE` — off the list |

**CSV gains a reader because the design and the board both give it one.** §3 :284 names a SPREADSHEET as
*"(XLSX, CSV)"* — one kind, two containers — and board **י1**'s approved drop-zone strip reads
`קובץ אחד · PDF · XLSX · CSV · תמונה · שמע · וידאו · עד 50 MB` (rendered at 1600 wide, not only
extracted). `@fast-csv/parse` is already in the tree through `exceljs`, so **no dependency was added.**

**The legacy `.xls` type comes OFF the list.** `exceljs` cannot read a BIFF compound file and no clause
asks for it; falling to `NO_READER_FOR_TYPE` is honest and the caller can act on it.

### 3.1 A CSV CELL IS ITS RAW STRING, AND IT IS A DETERMINISM FIX — `csvraw`

Measured, not assumed. `exceljs`'s **default** CSV map parses a date-shaped cell with `dayjs` **in the
host's local timezone**:

```
              2022-01-15 under the default map        under map: (v) => v
this laptop   Date 2022-01-14T22:00:00.000Z           "2022-01-15"
TZ=Asia/Tokyo Date 2022-01-14T15:00:00.000Z           "2022-01-15"
```

The same bytes would compute **two different texts on two machines**, and "pinned at a version" would be
a fiction — the second machine's quote would read ABSENT against the first machine's document. It is also
the truthful reading: **a CSV has no cell types**, so every cell IS text, and inventing one is the reader
authoring content under the document's name. It is the same hole round 1 closed for XLSX by serialising
by VALUE rather than by `.text`, in the arm round 1 never built.

## 4. THE FOURTH FIXTURE NOW EXERCISES THE ROW IT STANDS FOR

Round 1's fourth fixture was `unreadable.png` — a **PNG**, so it took the IMAGE class and answered
`OCR_NONE` with zero characters: **the same arm, the same reason and the same count as the SCAN.** The set
the plan builds to judge the extractor (:154–:157) therefore measured **three** distinguishable outcomes
while reporting four kinds, and `NO_READER_FOR_TYPE` had no fixture at all.

It is now **`no-reader.wav`, `audio/wav`, 444 bytes** — a minimal RIFF/WAVE written in Node builtins like
every other fixture, one 8-bit mono channel at 8 kHz, a sawtooth that is a pure function of the sample
index, no clock, no randomness, and no metadata chunk to strip.

**The type is the board's choice rather than a convenient one.** `שמע` is on י1's approved strip, so audio
is an ACCEPTED type that no engine in this version reads — which is §3 :284's fourth row rather than an
invented one. It is also the real corpus case: §9 :1013 rules a video interview to be MEDIA plus a derived
transcript, and the media itself is a document whose content IS its bytes.

**The other three fixtures are byte-identical to round 1's** — same `byteLength`, same `docId` — and the
generator's byte-for-byte regeneration guard is green.

## 5. THE FOUR REASON CODES, MEASURED AT THIS VERSION

```
CURRENT_EXTRACTOR: v1-pdfjs6.3.289-streamorder-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc

  PDF_TEXT_LAYER   application/pdf                             COMPUTED            chars= 152  runs=3 identical=true sha256[0:16]=1c008321b45019d2
  SCAN             image/png                                   OCR_NONE            chars=   0  runs=3 identical=true sha256[0:16]=d69b911d869ccb77
  SPREADSHEET      …spreadsheetml.sheet                        COMPUTED            chars=  76  runs=3 identical=true sha256[0:16]=11c2aac45dd5b5b9
  UNREADABLE       audio/wav                                   NO_READER_FOR_TYPE  chars=   0  runs=3 identical=true sha256[0:16]=22b42aaa1449c0cc

  text/csv                     COMPUTED            chars=45
  text/csv; charset=utf-8      COMPUTED            chars=45
  application/vnd.ms-excel     NO_READER_FOR_TYPE  chars=0
```

**FOUR kinds · FOUR DISTINCT reason codes · 2 COMPUTED / 2 BYTES-ONLY.** The two bytes-only kinds are now
bytes-only for **different, named reasons** — a decision (`OCR_NONE`) and a type nothing reads — where
round 1's were indistinguishable.

The two computed digests are **unchanged from round 1's** (`1c008321b45019d2`, `11c2aac45dd5b5b9`), which
is the check that the CSV arm and the version string moved nothing that was already right. The two
bytes-only digests differ from round 1's only because that probe hashed the literal `BYTES-ONLY` where
this one hashes `BYTES-ONLY:<reason>` — the probe's spelling, not the extractor's answer.

**Bytes-only is an outcome the design accepts and NEVER a failure** (plan :169–:170).

## 6. THE VERSION STRING — A PROPOSAL, AND IT IS THE RESEARCHER'S TO RULE

Ruling **§6.6 :198–:206** is explicit that every stage names **its engine and its build**. Round 1 shipped
`v1-pdfjs6.3.289-streamorder-ocr-none-xlsxcells-nfc`, in which `pdfjs6.3.289` names reader, version **and**
policy while **the spreadsheet stage was the policy alone**. `exceljs` decodes date serials, shared and
inline strings and cached formula results, so **an `exceljs` upgrade can move every spreadsheet's computed
text while `CURRENT_EXTRACTOR` stands still** — every pinned citation would then name a version that no
longer describes what produced it — and `extractor-coverage` cannot see it, because it counts *whether*
text was derived and never whether it is right.

**Proposed, and applied in this round pending the researcher's word:**

```
v1-pdfjs6.3.289-streamorder-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc
```

| spelling | what it says | verdict |
|---|---|---|
| **(a) `…-exceljs4.4.0-xlsxcells-csvraw-nfc`** | engine+build, then a policy per container | **proposed** — the grammar `pdfjs6.3.289-streamorder` already uses |
| (b) `…-exceljs4.4.0-xlsxcells-nfc` | engine+build, one policy name for both arms | shorter; `csvraw` then moves invisibly |
| (c) `…-xlsxcells-nfc` (round 1's) | policy alone | **it is the defect** |

**And a guard, so the two cannot drift apart silently.** `test/documentGuards.test.ts` ties the string to
what `package.json` declares, in both directions and for both readers: a version bumped without moving the
string fails, a string naming a version the manifest does not declare fails, and a **caret range** fails —
the string claims a PINNED reader, and a range lets the reader move under it.

**THE DEPENDENCY CHOICE ITSELF IS RECORDED AS AN OPEN DIFFERENCE, NOT AS SETTLED.** `R74-chunk-3b-dev-prompt.md`
told round 1 to *"propose candidates with measured coverage and let the researcher rule — do not install a
final choice before they do"*; `R75-review-state.md` :155 suppressed the question, citing plan :154–:158
(*"this step makes it … the plan picks nothing"*) and flows §12 :1180–:1181 (*"the build's choice"*).
**Those two briefs disagree on a RULE, so it is reported rather than chosen.** What is on record: the plan
assigns the choice to the step; `pdfjs-dist` **6.3.289** is named by the researcher's own landed ruling at
§6.5 :179; `exceljs` is named by nobody, and §6.1 permits *"an XLSX parser"* without naming one.

## 7. `CURRENT_EXTRACTOR` IS NOT NULL, AND THE FILE NOW SAYS SO

The constant was typed `ExtractorVersion | null` although the ruling set it. That is not cosmetic: it kept
**two dead branches alive to the checker and invisible to every instrument** — `no-unnecessary-condition`
does not fire on them, because to the compiler the condition is not unnecessary (the reviewer's control:
that rule fires **5× elsewhere in `src/` and 0× here**).

Narrowed to `ExtractorVersion`. Gone with it: the two dead branches
(`documentContentVersions.ts` :61, `rederiveDocuments.ts` :55), the two dead format strings
(`rederiveDocuments.ts` :103, `extractorCoverage.ts` :165), and the `string | null` on both report types.
`deriveContent` now always produces a version — a document whose bytes yield no text still gets one, with
`text` null and `contentVersionHash` equal to the document's own name (A1 :1242–:1243).

**Five comment blocks that still asserted null is the current state are rewritten** —
`documentExtractor.ts` :11–:26, :97–:104 (*"THE READER TABLE IS EMPTY"*, and it has two entries), :269–:272
(*"answers `text: null` FOR EVERYTHING"*); `documentPredicates.ts` :147–:151;
`documentContentVersions.ts` :48–:53. **`currentVersion`'s `currentExtractor` PARAMETER stays nullable**,
and its comment now says why: no caller passes null today, and the arm is kept for the SUITE, which must
be able to state what `CURRENT(d)` answers when no extractor is chosen — a world the design has a word for
and which returns the day an OCR stage is weighed.

## 8. 471 LINES THAT NO TEST NAMED

Round 1's three new services — `documentContentVersions.ts`, `rederiveDocuments.ts`,
`extractorCoverage.ts` — appeared in **no test file in any project**, and `readObject` appeared in none, so
the record's claim that *"the outage arm is proven by injection"* was not true of the tree. Plan step 29's
fifth *Verified by* item had no test at all.

**Four new files, all in the `unit` project**, because the `document` project is not in `npm test`
(`package.json` :17) and a test nobody's merge runs is not a guard:

| file | what it holds |
|---|---|
| `test/documentContentDerivation.test.ts` | the derivation pass: a SECOND version for a HELD fixture under a moved extractor with the old KEPT · NOTHING for a SEALED one · the injected `readObject` returning null listed SKIPPED · a SHED document SKIPPED · `recordContentVersion` returning the existing row on an identical hash, with a FLOOR · the bytes-only hash being the document's own name · the OPINION register refusing an unlabelled and an empty-label reading, with a FLOOR that writes one |
| `test/documentExtractorTypes.test.ts` | a type the table accepts is a type `extract` answers for: CSV read, parameterised types, the timezone property, `.ms-excel` off the list, IMAGE answering `OCR_NONE` |
| `test/extractorCoverage.test.ts` | the instrument: the per-kind measurement, the THROW on a set it cannot read, the REFUSAL of a malformed manifest **by its type**, the committed set as its real subject, zero documents said in terms, bucketing by the PAIR, and the report a reader reads |
| `test/documentGuards.test.ts` (extended) | the four kinds reaching distinct answers · the version string tied to `package.json` |

**The derivation runs the REAL reader over a REAL committed fixture** — nothing stubs `extract`; only the
database is a double, and the double refuses exactly what `@@unique([commitment, contentVersionHash])`
refuses, so a broken writer cannot pass.

### 8.1 Fifteen decoys, each planted from a script file against the real subject

Every new case was observed **RED by name** before it was green, each plant restored and `cmp`'d
byte-identical, control green before and after (55 cases, then 8 for the coverage file).

| decoy | cases reddened |
|---|---|
| the CSV arm removed | 4 |
| `.ms-excel` back on the spreadsheet list | 1 |
| the CSV identity map removed (dates coerced) | 1 |
| the version string loses the `exceljs` stage | 2 |
| the fourth fixture back to a PNG | 3 |
| `recordContentVersion` never finds the existing row | 1 |
| `recordOpinion` stops parsing | 2 |
| the pass stops skipping SEALED · SHED | 1 · 1 |
| an unreadable bucket object read as empty bytes | 1 |
| the pass never writes | 1 |
| the bytes-only arm hashes `''` instead of naming the document | 1 |
| `exceljs` declared as a caret range | 3 |
| `recordOpinion` stores the label and drops the reading | 1 |
| the fixture set reports `[]` instead of throwing | 1 |
| the manifest trusted instead of parsed | 1 |
| AWAITING counted as BYTES-ONLY | 1 |
| an arrival-less document bucketed under an empty door name | 1 |
| the report drops the REASON | 1 |
| the character count blinded to zero | 1 |
| `fixtureDirectory` points elsewhere | 1 |

**TWO OF THEM CAUGHT A WEAK CASE OF MINE RATHER THAN THE INSTRUMENT, AND THAT IS WHY THEY EXIST.** The
manifest case first asserted `rejects.toThrow()`, then `toThrow(/fixtures/)`; **both passed with the
validation deleted** — because `manifest.fixtures is not iterable` is a throw and its message contains the
word. Only `toThrow(ZodError)` can come from the parse. This is the R75 trap *"red-first does not prove a
case demands the right answer"* arriving twice in one file, found by aiming a decoy at the case's claim
rather than at its subject.

**ONE DECOY WAS REFUSED BY THE COMPILER** — `if (false as boolean) return existing;` made the return type
nullable and the suite failed to RUN rather than failing a case. Re-planted in a compiling form (the
lookup key made never to match) it reddened the intended case, by name. A compiler-refused decoy measures
the checker, not the suite.

## 9. WHAT THIS ROUND DOES NOT CLAIM — and one gap is new

- **NO TEST IN ANY PROJECT EXERCISES THE PDF READER, AND NONE CAN AS THE HARNESS STANDS.**
  `pdfjs-dist` 6.3.289 ships **ESM only** — `legacy/build/pdf.mjs`, no CJS build in the package — and
  jest's module registry raises `SyntaxError: Cannot use 'import.meta' outside a module` on it. Measured
  in the `unit` project **and** in `extraction`, whose `transformIgnorePatterns: []` does apply ts-jest to
  node_modules — `import.meta` survives the transform. It loads correctly under plain Node, which is what
  `dist/`, every operational script and the server run, so the PDF kind's answer is measured by
  `extractor-coverage` and recorded in §5 above. **The gap is named in the suite itself**, in
  `documentGuards.test.ts` and `documentContentDerivation.test.ts`, rather than implied away — implying
  coverage is worse than having none. **The fix is a harness decision and is the researcher's**: a jest
  project with native ESM, a babel transform for that one package, or `createRequire` in the reader
  (Node 22 supports `require(esm)`, which is why it works under `ts-node` today).

  > **SUPERSEDED 2026-09-23, the same day, by ROUND 4 —
  > `docs/gf-document-step-29-rounds-3-4-2026-09-23.md` §4.** *"None can"* is now false: the reader is held
  > by `test/documentPdfProcess.test.ts`, a case in the GATING project that runs the COMPILED reader in a
  > child `node` over `dist/`, with the compiled and source `CURRENT_EXTRACTOR` agreeing as its vacuity
  > guard. The paragraph above stays as written — it was true of the harness it describes, and the three
  > jest mechanisms it rests on were each re-measured and still fail.
- **The ruling's gate 1 is answered for the LAPTOP only.** Three runs per kind, identical (§5). The CI leg
  and the container leg are owed and are not a developer's to take.
- **`extractor-coverage` has not been run in a deployment.** §5 comes from its pure half, called directly.
- **The derivation pass has still never re-derived a real document** — the bucket reader is step 30's. Its
  outage arm is now proven by injection **in a test**, which is what round 1 claimed and did not have.
- **No OCR was evaluated on real material**; gate 2 remains unattempted and is not this step's.
- **Nothing shipped to production.** `master` is `4a4071a`.

## 10. RECOMMENDED ONLY, CHANGED NOTHING — `@napi-rs/canvas`

`@napi-rs/canvas` and eleven native platform binaries entered `package-lock.json` as **optional
dependencies of `pdfjs-dist`**. The ruling says `ocr-none` *"removes this stage entirely"* (§5 :105) — true
of the code, false of the installed tree, because `npm ci` fetches optional dependencies by default.
Nothing in this repository calls it; it is the rasteriser pdfjs would use to RENDER a page, and this
extractor only reads a text layer. **The recommendation: leave it, and revisit at the moment an OCR stage
is weighed.** `npm ci --omit=optional` would drop it, but it is a blunt instrument — it applies to every
package in the tree, not to this one — and the eleven binaries are platform-scoped, so a given machine
installs one. The cost of keeping it is install size and an unused native binary in the image; the cost of
omitting it is a flag that silently changes what every future optional dependency does. **Neither is
urgent while nothing calls it, and the decision belongs beside the OCR decision rather than before it.**

## 11. THE NUMBERS

backend `npm test` **186 / 3184 / 0** (from 183 / 3157 — **+3 suites, +27 cases**) · `tsc` **0** ·
`test:walk` **20 / 470 / 0** · frontend **56 / 554 / 0** · `test:document` **15 failed / 4 passed —
132 failed / 80 passed of 212**, unchanged and red by design (plan :121) ·
**MCP surface 46** (41 + 5) · **migrations 73** · `db:check-drift` **"No difference detected."**

**Backend eslint: 82 problems across 15 rules — exactly CI's standing line**, and **0 in the files this
round wrote or touched.** Reported, never set.

`git diff 06cddf9 -- apps/glass-fortress/backend/test/evidence/` — **EMPTY**.
