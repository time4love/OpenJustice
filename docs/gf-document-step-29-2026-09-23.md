# Document step 29 — identity, the extractor, and the first null text

**Part (a) landed 2026-09-22 (PR #572 → `staging` `d2ad10f`); part (b) is this record.** Plan step 29
(`docs/gf-document-refactor-plan.md` :151–:171), contract `docs/gf-document-flows.md` §3 :269–:373 and
A1–A3. Written the day it was built; never edited after.

> **THE EXTRACTOR WAS RULED WHILE THIS STEP WAS BEING BUILT**, and the step was rebuilt to the ruling
> rather than around it. `docs/gf-extractor-ruling-2026-09-23.md`: **ship `ocr-none`**, and **a scanned
> document is opened to BYTES**. Written into the design at flows §3 **:282** and §7 **:842**. This
> record carries what was BUILT and MEASURED against it; the ruling carries the decision and its
> reasoning, and **it decides — this does not.**

---

## 1. TWO RULINGS LANDED BEFORE AND DURING THE BUILD

**THERE IS NO PASTE** (2026-09-23, `1ab6296`; flows :163 · :283 · :351 · :515 · :1013 · :1404, plan
:157 · :169). Nothing enters the corpus as text through either door; every document arrives as a FILE.
Three consequences, each of which made the step smaller:

- **the fixture set is FOUR kinds** — a PDF with a text layer, a scan, a SPREADSHEET, and a file no
  engine reads;
- **`add_document` takes `docId`, REQUIRED** — no "exactly one of" rule, and `TOO_LARGE` is read from
  the object's size in every case;
- **the open architectural question was CLOSED rather than answered.** The review seat had escalated
  *does a paste write a bucket object?* With no paste, every document arrives through a dialog that
  already wrote its object, so `bytes` is ALWAYS a bucket key and custody (A2 :1274), the HELD
  invariant (A2 :1276) and `document-recomputable` (A3 :1361) each have ONE shape.

**SHIP `ocr-none`** (2026-09-23). No OCR engine in v1: a PDF with a text layer is read, a spreadsheet's
cells are read, **a scan is bytes-only**, and a quoted span from one is UNCHECKED with the reason.

## 2. WHAT `CURRENT_EXTRACTOR` IS

```
v1-pdfjs6.3.289-streamorder-ocr-none-xlsxcells-nfc
```

Every stage is named, in `TEXT_EXTRACTION_VERSION`'s grammar (dash-joined, no `+`):

| stage | what it is |
|---|---|
| `v1` | this layer's first extractor |
| `pdfjs6.3.289` | the PDF text-layer reader, EXACT-pinned — a reader's output is the reader's, so its version is provenance |
| `streamorder` | `getTextContent()` items joined in CONTENT-STREAM ORDER, with **no bidi-reordering heuristic** (the ruling §6.5: *"it is a second reading of the bytes and it moves when tuned"*) |
| `ocr-none` | **no OCR stage** — a scan derives no computed text |
| `xlsxcells` | the cell serialisation, ours, stated in the module and deterministic |
| `nfc` | the emitted text is Unicode-normalised, so one string has one form |

**Moving it is one edit**, and `forensics:rederive-documents` then re-derives HELD documents — only
those whose text actually changes gain a version (§3 :316–:317).

## 3. THE FOUR COUNTS — measured

`extractor-coverage` over the committed fixture set, at the version above:

| kind | outcome | reason | characters |
|---|---|---|---|
| PDF_TEXT_LAYER | **COMPUTED** | — | 152 |
| SPREADSHEET | **COMPUTED** | — | 76 |
| SCAN | BYTES-ONLY | `OCR_NONE` | 0 |
| UNREADABLE | BYTES-ONLY | `OCR_NONE` | 0 |

**four kinds · 2 COMPUTED · 2 BYTES-ONLY**

**Bytes-only is an outcome the design accepts and NOT a failure** (plan :169–:170). The scan and the
photograph are bytes-only for the SAME reason and by the same decision — and that is worth stating,
because they are indistinguishable by MIME type: both are `image/png`, and only the reader's answer
separates a document that has text from one that does not.

The text each reader returned, in full:

```
--- pdf-text-layer.pdf ---
Ministry of Health - circular 4/2026 The reporting channel for adverse events remained open throughout the period 3 September 2026 to 30 September 2026.

--- spreadsheet.xlsx ---
# reports
month	reports	serious
2022-01	418	37
2022-02	365	29
2022-03	502	44
```

> **MEASURED BY CALLING THE SERVICE'S PURE HALF, NOT BY RUNNING THE OPERATIONAL SCRIPT.**
> `forensics:extractor-coverage` runs only inside a deployment with the environment stated twice, and
> the developer's seat never runs it. The table above is `measureFixtures(fixtureDirectory())` over the
> committed files; **the in-container run is OWED** and is REVIEW's or the researcher's.

## 4. DETERMINISM — the ruling's first gate, on the part of it this laptop can answer

The ruling's gate 1 requires the emitted text's sha256 identical across three laptop runs, one CI run
and one container run. **The laptop's three are taken and identical**, per kind:

```
pdf-text-layer.pdf     runs=3 identical=true  sha256[0:16]=1c008321b45019d2
spreadsheet.xlsx       runs=3 identical=true  sha256[0:16]=11c2aac45dd5b5b9
scan-hebrew.png        runs=3 identical=true  sha256[0:16]=96e37d1f3e808423
unreadable.png         runs=3 identical=true  sha256[0:16]=96e37d1f3e808423
```

**The CI and container runs are OWED** — they are the other two legs of the same gate and neither is a
developer's to take. The two bytes-only kinds share a digest because the probe hashes the literal
`BYTES-ONLY` where there is no text; it is the probe's spelling and not a collision.

**Two determinism holes were closed by construction rather than measured away.** The PDF reader is given
the standard fonts from **the pinned package's own directory** — without them pdfjs warns and would
look for them over the network, which is the same hole wearing a warning. And a cell is serialised by
its VALUE, never by its display text: `.text` applies the number format, which is locale- and
timezone-sensitive, so a date would serialise differently on two machines and "pinned at a version"
would be a fiction.

## 5. THE CANDIDATE MEASUREMENT — taken before the ruling, and it holds after it

Every candidate was installed and run **in a sandbox outside the repository**, against these exact
fixtures, before the ruling landed. It is recorded because it is the evidence under two of the ruling's
choices, and because one of its results disqualified a package on grounds the ruling did not have to
consider.

| kind | candidate | result | time |
|---|---|---|---|
| PDF text layer | **`pdfjs-dist` 6.3.289** — **adopted** | EXACT, 152 of 152 chars | 136 ms |
| PDF text layer | `unpdf` 1.8.1 | EXACT, 152 of 152 chars | 30 ms |
| spreadsheet | **`exceljs` 4.4.0** — **adopted** | EXACT, every cell | 73 ms |
| spreadsheet | `node-xlsx` 0.24.0 | EXACT, every cell | 52 ms |
| scan (Hebrew) | `tesseract.js` 7.0.0 | **53 % character accuracy**, confidence 36 | 76 ms |
| a file no engine reads | `tesseract.js` 7.0.0 | 3 characters of noise | 61 ms |

**`node-xlsx` IS DISQUALIFIED ON SUPPLY CHAIN, not on capability** — it read every cell correctly and
faster. Its `xlsx` dependency resolves from **a CDN tarball URL** (`https://cdn.sheetjs.com/…`) rather
than from the registry, which would put a non-registry host into the committed `package-lock.json` — a
file this project greps at every `COMMIT`. `exceljs` is MIT and registry-resolved.

**WHAT THE OCR NUMBER IS AND IS NOT.** 53 % is measured on a raster of glyphs **this repository draws**
— clean, aligned, noiseless, one hand. It is a LOWER BOUND on synthetic input and is **not** the
judgement the ruling's gate 2 asks for, which is quote recall on real scanned ministry pages. It was
stable at 53 % across three page-segmentation modes and two language sets, so the mode is not the
confound; the glyphs are. It is reported because it is what was measured, and it argued for nothing.

### The raw output, kept beside the derivation

Per `docs/gf-two-session-protocol.md` :91–:110 — a derived record names its source and the source is
kept. Verbatim, not summarised:

```
pdfjs-dist           PDF_TEXT_LAYER   EXACT      chars=152     136ms
     -> Ministry of Health - circular 4/2026 The reporting channel for adverse events re
unpdf                PDF_TEXT_LAYER   EXACT      chars=152      30ms
     -> Ministry of Health - circular 4/2026 The reporting channel for adverse events re
exceljs              SPREADSHEET      EXACT      chars=76       73ms
     -> # reports month reports serious 2022-01 418 37 2022-02 365 29 2022-03 502 44
node-xlsx            SPREADSHEET      EXACT      chars=76       52ms
     -> # reports month reports serious 2022-01 418 37 2022-02 365 29 2022-03 502 44
tesseract.js(heb)    SCAN             DIFFERENT  chars=17       76ms
     -> השרד הנברידארהת 2
tesseract.js(heb)    UNREADABLE       DIFFERENT  chars=3        61ms
     -> - |

heb psm=SINGLE_LINE      conf= 36  charAcc=53%  -> השרד הנברידארהת 2
heb psm=SINGLE_BLOCK     conf= 36  charAcc=53%  -> השרד הנברידארהת 2
heb+eng psm=SINGLE_LINE  conf= 36  charAcc=53%  -> השרד הנברידארהת 2
truth                    -> משרד הבריאות 2022
```

## 6. THE DEPENDENCIES, DECLARED

`package-lock.json` moves at this step, legitimately and for the first time in the round.

| package | version | why |
|---|---|---|
| `pdfjs-dist` | **6.3.289**, exact-pinned | the PDF text-layer reader the ruling adopts; the version is in `CURRENT_EXTRACTOR` |
| `exceljs` | **4.4.0**, exact-pinned | the XLSX **parser**; the SERIALISATION is ours and is stated in the module |

**Exact-pinned, not caret-ranged**, because the version string claims a pinned reader and a caret would
let the reader move under it without the version moving.

**93 added, 4 removed, ZERO version bumps** — measured from the lockfile, not assumed: nothing already
in the tree changed version.

**THE INTERNAL REGISTRY HOST WAS WRITTEN IN AND TAKEN BACK OUT.** The install wrote 93 internal-registry
`resolved` URLs into the lockfile — the thing the researcher's rule of 2026-09-15 forbids in any
checked-in file. `.githooks/pre-commit` rewrites them at commit and `core.hooksPath` is set, but a tree
that depends on a hook is a tree that carries it; the same rewrite was applied immediately, the count is
now **0**, and the grep that says so was proven on a planted control.

## 7. WHAT WAS BUILT

- **`lib/documentExtractor.ts`** — `CURRENT_EXTRACTOR`'s value, and `extract`, which dispatches a
  declared MIME type to a reader class and returns the COMPUTED text or the reason there is none.
  **The reader table has two entries and a deliberate absence**: `IMAGE` has no reader, and that is
  `ocr-none` — a decision, named as one, not a missing dependency.
- **`services/documentPredicates.ts`** — A3's step-29 five: `custody`, `recomputable`,
  `recomputableEvidence`, `currentVersion`, `verdict`. Pure functions over rows, no client. Evidence
  A3's predicates are CALLED and never re-spelled, and the word `AWAITING_DERIVATION` is derived from
  evidence's own type rather than typed again, so a rename there fails to compile here.
- **`services/documentContentVersions.ts`** — `DocumentContentVersion`'s ONE writer, plus the OPINION
  register's one write path. **Derivation happens OUTSIDE the transaction** (the 5 s window is real and
  the suite cannot see it), and a re-derivation with identical text is not a new row — held by
  `@@unique([commitment, contentVersionHash])` rather than by the writer remembering. **An unlabelled
  reading is REFUSED, by parsing it**: rule 3 requires the model and prompt version, and a reading
  stored without them is one no surface can label later.
- **`services/extractorCoverage.ts`** + its script — reports TWO subjects and says which is which: the
  FIXTURES, which judge the extractor, and the CORPUS, which fills from step 30. Zero documents reports
  zero **in terms**; an unreadable fixture set **throws**, because an instrument that cannot look must
  never report zero.
- **`services/rederiveDocuments.ts`** + its script — the derivation pass over HELD bytes, under
  `runOperationalScript`, on demand, in the deployment. It writes versions and **never a decision**, it
  does not touch a SEALED document, and its bucket reader is step 30's, so it refuses rather than
  reporting a sweep it could not perform.
- **Two guards a merge must pass**, in the unit project — the `document` project is informational until
  step 36, so a case there would hold nothing.

## 8. THE FIXTURES ARE SYNTHETIC, AND REPRODUCIBLE

Ruled by the researcher 2026-09-23: generated deterministically, in the repo, because a generated file
carries no EXIF and can be regenerated. `test/documentFixtureBytes.ts` is their only author and uses
**Node builtins only** — the point rather than an economy: a generator that needed a dependency would
put the fixture set behind the very choice the fixtures exist to judge. No clock and no randomness: the
ZIP carries a fixed DOS timestamp, the PDF no `/CreationDate`, the PNG no `tIME` chunk.

| kind | file | bytes |
|---|---|---|
| PDF_TEXT_LAYER | `pdf-text-layer.pdf` | 780 |
| SCAN | `scan-hebrew.png` | 672 |
| SPREADSHEET | `spreadsheet.xlsx` | 2,842 |
| UNREADABLE | `unreadable.png` | 508 |

**THE PDF's GROUND TRUTH IS LATIN, AND THE FORMAT IS WHY.** A text layer is drawn with a FONT, and the
only fonts a PDF may name without embedding one are the base fourteen, none of which holds a Hebrew
glyph. Hebrew in a text-layer PDF needs an embedded subset — the producing tool's business, not the
reader's.

**THE SPREADSHEET IS A REAL XLSX AND NOT A CSV**, deliberately: a CSV reader costs no dependency at all,
so a fixture whose spreadsheet was a CSV would have judged nothing about the choice §3 :284 creates. It
uses INLINE STRINGS, so a reader that handles only shared strings is caught rather than flattered.

**TWO DEFECTS IN THE FIXTURES, FOUND BY LOOKING AND BY MEASURING.** The scan first rendered `2022` as
`2202`, because reversing a Hebrew string reverses its digit runs too — found by OPENING the PNG, which
no hash comparison could have shown. And the XLSX's central directory was two bytes short (the
internal-attributes field), which no reader would open — found because **both** spreadsheet candidates
threw, and a failure reproducing across two independent parsers is a fixture defect, not a candidate
one. Both were fixed before anything was measured.

## 9. THE INSTRUMENTS WERE OBSERVED TO FAIL

Three decoys, each planted against the real subject from a script file, each observed red **by name**,
each restored and compared byte-identical. Control 35/0 before and after.

| decoy | cases reddened |
|---|---|
| one byte of `spreadsheet.xlsx` altered | `SPREADSHEET: the committed bytes are EXACTLY what the generator produces` · `SPREADSHEET: the manifest's docId is the sha256 of the committed bytes` |
| a SECOND declaration of `'PRESENT' \| 'ABSENT' \| 'UNCHECKED'` planted in `documentPredicates` | `exactly ONE module declares PRESENT \| ABSENT \| UNCHECKED` · `the document layer CALLS it rather than spelling it` |
| the manifest claiming five kinds | `is FOUR kinds — the paste was retired 2026-09-23 and the set is not five` |

**The verdict scan looks for a DECLARATION and not for the words.** `lib/phraseVerifiedRate.ts` narrows
a stored verdict and prints all three names — it reads them, it computes none — so a scan keyed on the
literals appearing together would have reported a correct module as a second spelling and sent a builder
to break it. Both directions are held.

## 10. FOUR GUARDS FROM OTHER LAYERS CAUGHT THIS STEP'S CODE

Recorded because each is the instrument working, and one is a finding rather than a fix.

1. **`transactionWindow`** — a trailing comma after `WRITE_TRANSACTION` put it outside the scan's
   pattern. The window was present; the SPELLING was not.
2. **`thesisGuards`' control-character case** — a literal NUL reached `extractorCoverage.ts` as a map
   key separator. Replaced by keying on the PAIR: a separator is a character that one day appears in the
   thing it separates.
3. **`evidence/identity`'s `NAMED_HASHERS`** — a new sha256 call site must be named. Named; the registry
   invites exactly this in its own words.
4. **`evidence/scans`' one-symbol scan** — a DESIGN COLLISION, not a defect. See §11.

## 11. FINDINGS — the researcher's, not resolved in code

### F1 · `recomputable` names two different predicates in two appendices

Evidence A3 :1023's `RECOMPUTABLE(e)` is `e.fileHash = ID(the record it is keyed to)`. Document A3
:1361's `RECOMPUTABLE(d)` asks whether the platform can re-check a DOCUMENT'S OWN NAME, and answers by
custody mode. **Two rules, one name** — and neither formula can answer the other's subject: evidence's
`recordId` takes a CAPTURE or a DIFF and could not gain a document arm without a document's SALT
reaching a module about captures.

`test/evidence/scans.test.ts` forbids any module but `evidencePredicates` from declaring `function
recomputable(`, while the document suite's `contract.ts` :139 REQUIRES that export name. **The two
suites contradict each other**, so the tree cannot be green both ways.

**A DECLARED LIFT, narrow and reasoned:** the evidence scan gains a collision map exempting exactly
`services/documentPredicates.ts` for exactly the name `recomputable`, with a case that plants every
other name in that module and proves each still fires. **It is the researcher's to overrule**; the
alternative is renaming the document export, which edits the document acceptance suite's contract.

**And the collision the scan CANNOT see:** the DOCUMENT arm of `RECOMPUTABLE(e)` (A3 :1364–:1365) lives
as `recomputableEvidence` — a different NAME for the SAME rule that list guards. No instrument holds it.

### F2 · A fifth case in the step-27 suite that no correct implementation could satisfy

`citation.test.ts` asserted `verdict('the channel stay open', version())` is `PRESENT`, and the fixture
text (`fixtures.ts` :151) is *"the ministry instructed, on 3.9.2026, that the reporting channel be kept
open."* — of which that phrase is **not a substring**. The rule is
`normaliseClaim(text).includes(normaliseClaim(phrase))` (`src/lib/verdict.ts` :38–:41), so a CORRECT
implementation returned ABSENT and only a rule matching loose words could have returned PRESENT — the
case demanded the defect its own instrument forbids. **Corrected, declared, and it STRENGTHENS.**

### F3 · The no-paste ruling retires cases in step 30's file

`addDocument.test.ts` still tests the `text` arm: *"a paste arrives as TEXT in the call"* (:65), *"BOTH
is a refusal — exactly one"* (:71), the `text?: string` argument (:42), and the content case at
:185–:189. **Step 30's file, chunk 4's to correct** — named so it is found rather than discovered.

### F4 · Two source pointers name a step that has landed and did not do the thing

`src/services/auditTheses.ts` :247 — which **prints** the sentence into the audit's own report — and
`src/services/evidencePredicates.ts` :953 both say FLAGGED gains its SHED arm at *"document step 28"*.
Step 28 landed and gave FLAGGED nothing; the predicate is step 35's. Another layer's files.

## 12. WHAT THIS STEP DOES NOT CLAIM

- **No OCR was evaluated on real material.** The 53 % is synthetic; the ruling's gate 2 — quote recall
  on real scanned ministry pages — has not been attempted and is not this step's.
- **Determinism is answered for the laptop only.** The CI and container legs of the ruling's gate 1 are
  owed.
- **`extractor-coverage` has not been run in a deployment.** The four counts come from its pure half.
- **The derivation pass has never re-derived anything** — the bucket reader is step 30's. Its outage arm
  is proven by injection, never staged on an environment.
- **The OPINION register has no writer yet** — its two callers are steps 30 and 32. What exists is the
  one write path they will both go through, and the refusal that holds the label.
- **No document exists**, so the corpus half of the coverage report reads zero and says so.
- **Nothing was shipped to production.** `master` is `4a4071a`.

## 13. THE NUMBERS

backend `npm test` **183 / 3157 / 0** · `tsc` 0 · `test:walk` **20 / 470 / 0** · `test:document`
**15 failed / 4 passed — 132 failed / 80 passed of 212** (red by design; **+45 green** from 177/35) ·
frontend **56 / 554 / 0** · frontend `eslint --max-warnings=0` exit 0 · **MCP surface 46** (41 + 5) ·
**migrations 73** · `db:check-drift` **"No difference detected."**

**Backend eslint: 82 problems across 15 rules — EXACTLY CI's standing line**, and **0 in the files this
step wrote**. The laptop read 81 before this step and 82 after, with no code of another layer touched:
the dependency install changed type resolution and **closed the laptop's documented under-report**, so
the debt is UNCHANGED and the two now agree. Reported, never set.
