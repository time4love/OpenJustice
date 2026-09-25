# The PDF reader's join, fixed and re-measured — `v2`, a geometry join at 0.06 font sizes (2026-09-25)

**Bears on:** `docs/gf-document-hebrew-text-layer-2026-09-24.md` §2b (:57–:88) and §5 rulings 3 and 7 (:126–:129,
:138–:141); `docs/gf-extractor-ruling-2026-09-23.md` §6.5 (:177–:189) and §6.6 (:191–:211); `docs/gf-document-refactor-plan.md`
step 29 (:151–:171); `docs/gf-document-flows.md` §3 :348 and A3 :1368–:1369. Ruling 3 asked for "a geometry join at a
new `CURRENT_EXTRACTOR` that names the join policy and its threshold … Re-measured in a dated doc: split words before
and after, the three quotes exact, the English control identical." This is that doc. Drafted by the R83 DEV seat for
the REVIEW seat's grading. Not edited after it lands.

> **The three quotes are PRESENT, exactly, with the verdict rule unchanged. On MK 05/2023, split words, spaces before
> punctuation and doubled spaces fall from 414 / 807 / 1,356 to 12 / 69 / 0, the counts §2b measured. A PDF's text now
> has one line per drawn line, so `verify_claim_text`'s "±2 lines" is about 400 characters and no longer a whole page.**
> The English control is **not** identical: one token moved (`Trial ,` → `Trial,`). It is reported here, not tuned (§8).
> Two of §2b's descriptions are corrected (§6, §7a). The visual-order residual survives unchanged (§7b), and `v2`
> regresses at 12 identified word gaps its producer drew with no space (§7c).

---

## 1. What was ruled

- **Ruling 3** (Hebrew doc §5): the join at `documentExtractor.ts` :225, which put a space between every two pdf.js
  items, is a defect. It is replaced by a geometry join at a new `CURRENT_EXTRACTOR`.
- **The threshold — RULED 2026-09-25 (the researcher): 0.06.** In substance (R83 review Entry 4): "The threshold is 0.06: the value
  docs/gf-document-hebrew-text-layer-2026-09-24.md §2b measured in full (12 single-letter tokens, 69 spaces before
  punctuation, the three quotes PRESENT, no bullet glued); within the 0.05–0.07 band only table-of-contents leaders
  move. Record it, and name §2b beside the constant." It is `PDF_JOIN_GAP_EM` in `src/lib/documentExtractor.ts`, and
  its comment names §2b :69–:81, the band and this ruling.
- **Ruling 7** (closed 2026-09-25): the fix is held by a synthetic fixture from the repository's own generator that
  draws one word as two runs. No real document is checked in.

## 2. The join as built — `joinPdfText`

It reads one page's runs **in content-stream order** and decides only the separator between two runs. A run's own
characters are emitted exactly as pdf.js returned them. Nothing is reordered, and nothing is trimmed: a trailing space
before a line break is kept.

- **The definitions** (§6's counts use them). A **pair** is two consecutive non-empty runs of one page. A pair is
  **marked** when the earlier run carries pdf.js's `hasEOL`, or an empty `hasEOL` run lies between them. A pair
  **moves** when the two runs' `transform[5]` (the baseline) differ, strictly.
- **A new line** for a pair that is marked or moves.
- **A space** for any other pair when `gap > PDF_JOIN_GAP_EM × fontSize` and neither side already has whitespace at the
  join. `gap = max(b.left − a.right, a.left − b.right)`, the distance between the two boxes along the baseline in
  whichever direction the line advances; it is negative when they overlap. `fontSize = hypot(c, d)` of the later run,
  its vertical scale, as pdf.js computes a run's height.
- **Otherwise nothing**, which is how a word drawn as two runs reads as one word.
- **`CURRENT_EXTRACTOR`** = `v2-pdfjs6.3.289-streamorder-gapjoin0.06em-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc`. The
  `gapjoin…em` stage is built from the constant, so the value is written once. A source scan in
  `test/documentPdfJoin.test.ts` fails on any second spelling, including an integer ratio.

## 3. The instrument

It ran over the compiled build (`dist/`) from a scratch script outside the repository. The script is read-only: no
database, no chain, no network. **A vacuity guard** compared `PDF_JOIN_GAP_EM` and `CURRENT_EXTRACTOR` as `dist/` holds
them with the source's. It passed, and it refused (exit 3) when a stale value was planted.

- **`v1`** is today's reader reproduced: every page's items joined with a space, then pages with `\n`, then NFC. On
  MK 05/2023 it gives **74,378 characters**, the count the Hebrew doc §1 took from the platform's own `v1` reader.
- **`v2`** is the compiled `extract()`. It equals `joinPdfText` applied page by page, which was checked.
- **The diagnostic** is the diagnostic join §2b measured with (§2b :59), the R81 review seat's private script, not in
  the repository. It was ported line for line and run at 0.06. §6 says how its policy differs from `v2`.
- **Inputs, never checked in:** MK 05/2023 (the Hebrew doc §1, by its sha256 there); the three quotes of §5.4.3 in
  logical order, as the Hebrew doc §1 took them; and **the Nuremberg Code** (1947, the full text of the ten articles),
  14,053 bytes. These are the platform's own HELD copy, read from staging's bucket by the REVIEW seat, which confirmed
  the hash equal to the document's name.

## 4. Before and after — MK 05/2023 (46 pages, 6,003 pairs)

| | `v1` (join with spaces) | `v2` (geometry join) |
|---|---|---|
| characters | 74,378 | 71,152 |
| single-letter Hebrew tokens | 414 | **12** — the producer's own (letter-spaced text, §2b :64) |
| a space before punctuation | 807 | **69** |
| runs of two or more spaces | 1,356 | **0** |
| lines | 46 (one per page) | 1,489 |
| longest line · median line | 3,542 · 1,538 characters | 173 · 42 characters |
| Q1 in a sentence | ABSENT | **PRESENT** |
| Q2 across a line break | ABSENT | **PRESENT** |
| Q3 with a number | ABSENT | **PRESENT** |

The first four `v2` rows are the counts §2b :80 recorded for its diagnostic join at 0.06. §2b's table (:64–:66) was
taken at the diagnostic's default threshold of 0.12, hence its 61 spaces before punctuation. `v2` reproduces the 0.06
counts with the platform's own code.

## 5. The valley, under the platform's own measure

These are pairs neither marked nor moved, as a gap over the later run's `hypot(c, d)`, in 0.05 buckets:
**0.00: 1,916 · 0.05: 41 · 0.10: 13 · 0.15: 3 · 0.20: 55 · 0.25: 449 · 0.30: 872**. Every pair between 0.03 and 0.10,
by class:

| gap (font sizes) | class | pairs | at 0.06 |
|---|---|---|---|
| 0.0312 – 0.0467 | a word split into two runs (e.g. „כ|עצמאי”, „באח|ד”), or a digit or letter before its punctuation | 8 | joined |
| 0.0499 | a word, then a table-of-contents leader | 1 | joined |
| **0.0591** | a table-of-contents leader, then its page number | **19** | joined |
| 0.0658 · 0.0677 · 0.0754 | a word, then a table-of-contents leader | 3 | spaced |
| **0.0771** – 0.0856 | a list-bullet dot, then its word | 6 | spaced |
| 0.0870 · 0.0939 | a word, then a table-of-contents leader | 2 | spaced |

This is the REVIEW seat's table of 2026-09-25 re-measured from the compiled build, and it is identical. Split pieces end
at 0.0467 and bullet dots begin at 0.0771. §2b :71's "from 0.059" is the leader class, and §2b :79's "0.077" is the
bullet class. **Every value in the 0.05–0.07 band treats split words and bullets the same. Only table-of-contents
leaders move with the value**: at 0.06 the 19 leader–number pairs are joined („......16”). No quote a thesis
would make spans a table-of-contents leader.

## 6. The line rule, and where it differs from the measured diagnostic

| pairs on MK 05/2023 | count |
|---|---|
| marked and moved | 1,384 |
| **moved, not marked** — real line breaks pdf.js did not mark | **49** |
| **marked, not moved** | **10** |
| neither (on one line; the gap decides) | 4,560 |
| moved by less than 0.5 units (0 < Δy < 0.5) | 4: one on p. 32 at 0.009 font sizes (not marked); three on p. 36 at 0.02 (marked) |

Either rule alone would be wrong on this file. The mark alone misses 49 line breaks, which would then be measured as
horizontal gaps. The baseline alone ignores 10 marks.

**Correction to the reader-fix sketch** (the REVIEW seat's LOW, 2026-09-25): the sketch called this rule "the policy
the valley and the quotes were MEASURED under". It is not. The diagnostic called a pair "the same line" within
**0.5 units** and honoured only an **empty** `hasEOL` run as a mark. The two policies were compared
pair by pair. **Exactly one pair's separator differs** — the p. 32 pair, a space under the diagnostic and a line break
under `v2` — and a line break and a space are the same under the verdict rule's collapse. **The collapsed texts are
equal on both documents** (`normaliseClaim` of the diagnostic's text equals it of `v2`'s). So under the verdict rule the
platform's join is the policy §2b measured. The superscript exponents on pp. 24–25 (moves of +0.44 and −0.28 font
sizes, more than 0.5 units) start a new line under both.

## 7. The negative gaps, the visual-order residual, and what `v2` costs

### 7a. §2b's fifteen negative gaps are touching boxes

**§2b :82–:85 describes fifteen negative gaps as "Latin runs inside Hebrew lines that the producer wrote in visual
order".** Under the platform's measure, those fifteen pairs are boxes that touch or overlap slightly, at **−0.004 to
−0.012 font sizes**. Their large negative values (−0.68 to −3.90) came from the diagnostic's direction test. When a run
starts up to 0.05 units left of the previous run's right edge, that test takes the right-to-left formula and measures
from the far edge. Both joins join these pairs. `v1`'s form, then `v2`'s:

| `v1` | `v2` | pairs |
|---|---|---|
| „anti -” · „anti –” | „anti-” · „anti–” | 7 · 1 |
| „- 8” · „- 2” | „-8” · „-2” | 1 · 1 |
| „≥ 100” · „≥ 10” | „≥100” · „≥10” | 1 · 1 |
| „HB s” · „HCV -” | „HBs” · „HCV-” | 1 · 1 |
| „10 mIU/ml” | „10mIU/ml” | 1 |

**The class, whole:** 494 pairs on MK 05/2023 have a negative gap under the platform's measure, none below −0.012 font
sizes. `v1` spaced them all; `v2` joins them all. **319** attach a hyphen or dash („ל-”, „anti-”), **107** attach
punctuation („HBV,”, „(HBsAg”), **38** rejoin a Hebrew word („הזקוק|ים”, „ה|נגיף”), **1** rejoins a Latin one
(„HB|s”), and **29** are other: a math sign (12), a check box and its word (5), an underscore line (4), a slash (3), a
geresh, an em dash, and three digit or letter pairs.

### 7b. The visual-order residual SURVIVES `v2` unchanged — recorded, never corrected

The class §2b :82–:85 names is real; it just is not in those fifteen pairs. It shows at the unit „mIU/ml”, which the
page reads after its number („10 mIU/ml”, §2b :83). Counted in the text itself from the compiled build:

| in the text | `v1` | `v2` |
|---|---|---|
| „mIU/ml 10” — the unit BEFORE its number, reversed against the page (substring, one space) | 22 | **22** |
| … of which „mIU/ml 100” | 5 | **5** |
| „mIU/ml <number>”, any whitespace between | 23 | **23** |
| a number, then „mIU/ml” — the page's order, spaced or joined | 8 | 8 (3 of them joined, §7c) |

All 23 are drawn as two runs, the unit's and the number's. 22 sit on one line at **positive** gaps of 0.24 to 1.44
font sizes, far above the threshold, so both joins write a space; one crosses a line break. `v2` reads them exactly as
`v1` did, in content-stream order, reversed against the page. **This is the residual the extractor
ruling accepted without a reordering heuristic** (§6.5 :184–:189: "a true quote against a visual-order PDF reads ABSENT,
visibly"). 23 places on this file read that way: a quote typed as the page reads, „10 mIU/ml”, is ABSENT at them.
It is recorded, not corrected; no reordering is attempted.

### 7c. What `v2` costs — a regression at word gaps drawn with no space

A word boundary that the producer drew with **no space glyph and a gap at or below the threshold** is joined by `v2`,
because the join can see only a gap that is drawn. **`v1` read these boundaries correctly and `v2` does not: this is a
regression at those points, the price of the fix.** Identified on this file:

- in the negative class (§7a): „10 mIU/ml” → „10mIU/ml” (1), a check box and its word „◻ לא” → „◻לא” / „◻שלילית” (5),
  a form line „PCR ____” → „PCR____” / „פרט____” (4), and „2 ב” → „2ב” (1) — **11**;
- at a small positive gap: „≥ 100 mIU/ml” → „≥100mIU/ml”, at +0.007 font sizes (1).

That is **12 identified**. The positive band from 0 to 0.06 holds 1,335 joined pairs, almost all correct joins (691
punctuation, 321 hyphen or dash, 219 Hebrew words rejoined, 24 leader–number, 4 Latin). **76 others** — a digit before
a Hebrew letter, a check box, gershayim inside an acronym, a slash — are mixed, and only the page image can say which are
word boundaries. A quote typed with a space at a regressed point reads ABSENT. The diagnostic joined the same pairs, so
none of §2b's counts moves. It is recorded, not corrected: a rule that restored these spaces would read the bytes a
second way (§6.5).

## 8. The English control — the Nuremberg Code

| | `v1` | `v2` |
|---|---|---|
| characters · lines | 4,801 · 2 (one per page) | 4,750 · 71 |
| longest line | 2,705 characters | 87 characters |
| runs of two or more spaces · a space before punctuation | 35 · 1 | 0 · 0 |

It has 100 pairs: 69 marked and moved, and 31 on one line. All 31 fall in the 0.00 bucket; none is in the 0.03–0.10
band, and none is negative below −0.0005. No pair moves without a mark, and none is marked without moving.

**NOT IDENTICAL after the verdict rule's collapse, by one token: `Trial ,` in `v1` reads `Trial,` in `v2`.** A comma
drawn as its own run at a zero gap was detached by the old join and attached by the new one. This is an improvement,
not a regression. **Reported as a FOUND and not tuned away**, as ruled. Every other difference between the two texts is
whitespace.

## 9. `verify_claim_text`'s context — "the surrounding lines" of a PRESENT match

The context is the lines holding the match plus two either side (`src/services/verifyDocumentPhrase.ts`, unchanged).
`v1` wrote `\n` only between pages, so a PDF's "line" was a page (R81 review Entry 26; Entry 27 saw 2,705- and
2,095-character lines on the Nuremberg Code).

| match | `v1` | `v2` |
|---|---|---|
| Q1 · Q2 · Q3 on MK 05/2023 | ABSENT — no context | 6 lines, 427 chars · 6 lines, 413 · 5 lines, 405 |
| „The voluntary consent of the human subject is absolutely essential”, the Nuremberg Code | 2 lines, **4,801 characters** (the whole document) | **5 lines, 377 characters** |

## 10. What the re-derivation moves — staging, then production

`CURRENT(d)` for a HELD document is the version whose `derivedUnder` contains `CURRENT_EXTRACTOR` (A3 :1368). Moving
the string therefore opens a **window**: **from the deploy until the derivation pass runs, every HELD document reads
`AWAITING_DERIVATION`.** In that window it cannot be cited, and `verify_claim_text` refuses it. The pass
(`forensics:rederive-documents`, run in the container with the environment stated twice) then acts per document:

- **A text-layer PDF whose text changes** gets a **new `v2` version, and the old one is kept** (`SUPERSEDED`). The
  Nuremberg Code is one of these: its text changes by the `\n`s and the one comma of §8.
- **A document whose text does not change** — an image or a scan (bytes-only), a spreadsheet, or a PDF drawn one run
  per line — gets `v2` **appended to `derivedUnder`**, and no row is written (`UNCHANGED`).
- **A SEALED document**: nothing happens, because there are no bytes to read (§3 :339–:342).
- **A PROMOTED document whose version moves** would make `list_evidence_reviews` fail loudly until document step 34
  (#594; R82 review Entry 8). **Precondition, read-only, before the staging pass: staging holds no promoted DOCUMENT
  Evidence row.**
- **The researcher's first `#doc_` draft on staging** cites the Nuremberg Code pinned to its `v1` version. After the pass
  it pins a version that is **no longer current**. That is expected: its next version re-pins.

**Production, at SHIP:** the merge to `master` carries the moved string to production. Any HELD document there reads
`AWAITING_DERIVATION` until **a production pass** runs in the production container with `--env production`. The pass is
a SHIP-time act, made on the researcher's word; over a production that holds no HELD document it examines none.

## 11. What holds it

- `test/documentPdfJoin.test.ts` (unit project, `npm test`): the join over runs shaped as pdf.js emits them. It covers
  a split word, the 0.047 split ceiling, the 0.077 bullet floor, right-to-left runs, the later run's font size, a
  baseline move, both kinds of mark, the trailing space kept, a negative gap never spaced or reordered, and whitespace
  never doubled. It also holds the version naming the policy, and a source scan with seven planted controls (six
  spellings of the value, plus an integer ratio) proving the threshold is written once.
- `test/documentPdfProcess.test.ts` (over `dist/`, since pdfjs is ESM-only): the vacuity guard on both constants; the
  committed fixture and the split-run fixture each read exactly their ground truth; one line per drawn line; and **the
  split-run fixture's raw pdf.js items, joined as `v1` joined them, read „Adv erse” and „minis try”**. That last case
  means a fixture which silently stopped splitting would fail.
- The split-run fixture (`test/documentFixtureBytes.ts`, `SPLIT_RUN_FIXTURE`) is a second fixture of kind
  PDF_TEXT_LAYER. It is outside the four-kind set that `extractor-coverage` counts (plan :157), and it is not committed.

## 12. FOUND, for the researcher — none changes the three quotes' verdicts

1. **The English control is not identical** (§8), by one comma that the new join attaches. It is reported, not tuned.
2. **§2b's fifteen negative gaps are touching boxes** under the platform's measure (§7a); their large negative values
   were the diagnostic's direction test. **The visual-order residual itself SURVIVES `v2` unchanged** (§7b): „mIU/ml 10”
   reads before its number, reversed against the page, 22 times in `v1` and 22 times in `v2` (5 of them „mIU/ml 100”).
   A quote typed as the page reads is ABSENT there. It is recorded, never corrected (§6.5).
3. **A REGRESSION at word gaps drawn with no space** (§7c): `v1` read 12 identified boundaries correctly and `v2` joins
   them („10mIU/ml”, „≥100mIU/ml”, 5 check boxes, 4 form lines, „2ב”). A quote typed with the space there reads ABSENT.
   It is the price of the fix, because what the bytes do not draw, the join cannot see. 76 more pairs at 0–0.06 font
   sizes need the page image to classify.
