# The Hebrew text layer — measured before the first Hebrew citation (2026-09-24), and the rulings (2026-09-25)

**Bears on:** `docs/gf-document-flows.md` §3 (content is a version; the verdict rule :359–:365), A2 :1313–:1316
(`PassageVerdict`), A6 :1536 (check 19, `DOCUMENT_QUOTES_PRESENT`); `docs/gf-document-refactor-plan.md` step 29 (the
extractor, :153–:171) and step 34 (the gate, :266–:282). Ruled before the measurement, on 2026-09-23: one Hebrew PDF with
a text layer, three quotes checked by the ONE verdict rule. 3 of 3 changes nothing; fewer is a FOUND for the researcher,
not a fix. Written by the R81 REVIEW seat; never edited after.

> **0 PRESENT OF 3.** The platform's PDF reader splits Hebrew words and detaches punctuation, so a correctly written
> quote is refused by check 19 as a phrase the document does not contain. **RULED 2026-09-25: the reader's join is a
> defect**, fixed by a geometry join at a new `CURRENT_EXTRACTOR` in its own change before step 34's sketch, and
> re-measured. The verdict rule and check 19 are unchanged.

---

## 1. The fixture and the instrument

- **Fixture:** Ministry of Health director-general circular MK 05/2023 (vaccination of health-profession students and
  health workers), `https://www.gov.il/BlobFolder/policy/mk05-2023/he/files_circulars_mk_mk05_2023.pdf`, 936,595 bytes,
  sha256 `401a0d80ab08ead73a137ced0f9cbfe6244c1ae0f6f5b25c61bbcce5faff8598`. Public; not checked in (§5, OPEN).
- **Reader:** the platform's own `extract()` at `CURRENT_EXTRACTOR =
  v1-pdfjs6.3.289-streamorder-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc`, run from the compiled build. A vacuity guard
  compared the constant as the build holds it with the source's, and refused when a stale value was planted (exit 3).
  Result: reader class PDF, the read did not fail, 74,378 characters. A text layer, not a scan.
- **Rule:** the ONE verdict rule, `src/lib/verdict.ts` `verdict`, as built: whitespace collapsed on both sides, nothing
  else normalised.
- **Quotes:** three lines of §5.4.3, copied from the rendered page: one within a sentence, one across a line break, one
  carrying a number. No quote names a person.

## 2. The count, and what caused it

**0 PRESENT of 3** (in a sentence ABSENT · across a line break ABSENT · with a number ABSENT).

Two causes, one on each side:

| | word order | words | punctuation |
|---|---|---|---|
| the PDF viewer's copy | reversed within each line | whole | mirrored |
| the platform's reader | correct | **split**: „ש ב תדריך", „וב הנחיות" („ה בריאות" ×3 against „הבריאות" ×149) | **detached**: „עונתית ,", „5.4.3 .", „כאן .)" |

What the reader made of the paragraph (an excerpt, verbatim):

> 5.4.3 . חיסון נגד נגיף קורונה החדש – כמו לגבי החיסון נגד שפעת עונתית , חלה על עובדי הבריאות  ותלמידי מקצועות הבריאות …
> בהתאם  להנחיות העדכניות ש ב תדריך החיסונים וב הנחיות האגף לאפידמיולוגיה … ( ההנחיות העדכניות … זמינות כאן .)

Diagnostics, never the count: with word order restored, ABSENT ×3; also ignoring spaces, ABSENT ×3 (punctuation on the
wrong side); **letters and digits only, in order, PRESENT ×3.** The words agree; order, spaces and punctuation are the
whole gap.

**The cause in the code:** `src/lib/documentExtractor.ts` `readPdfTextLayer` :225 joins every pdf.js text item on a page
with a single space, whatever the geometry between them. This producer draws every run as its own text object inside
its own marked-content sequence (page 7: 390 text objects, each with one text-draw operator, in 582 marked-content
sequences), and pdf.js returns each run as an item. A word drawn in two runs therefore reads as two words. The boundaries
are the producer's to draw; **the defect is the join.** Nothing in it is Hebrew-specific: the join ignores the script.
Hebrew exposed it because this right-to-left producer splits runs inside words.

## 2b. The fix measured before it was ruled — a geometry join, on the same file

A diagnostic join (not the platform's code) put a space between two items on one line only when the horizontal gap
between them, divided by the font size, exceeded a threshold, and started a new line where the baseline moved:

| | `join(' ')` today | geometry join |
|---|---|---|
| single-letter Hebrew tokens | 414 | 12: the producer's own (e.g. „ו –HCV", and the letter-spaced „ב ב ר כ ה", correctly kept apart) |
| a space before punctuation | 807 | 61 |
| runs of two or more spaces | 1,356 | 0 |
| the three quotes, written as the page reads (each compared word for word with an image of §5.4.3 on page 7) | ABSENT ×3 | **PRESENT ×3, exact, the verdict rule unchanged** |

**The valley.** Gap over font size, in 0.05 buckets: 1,901 at 0.00 · 41 at 0.05 · 13 at 0.10 · 3 at 0.15 · 55 at 0.20 ·
449 at 0.25 · 872 at 0.30. Pairs split inside a word sit at or below 0.047 („כ|עצמאי", „באח|ד", „י|שא", „קבלת ס|דרת");
list-bullet dots and table-of-contents leaders sit from 0.059 to 0.114; gaps between words start at about 0.20. The three
quotes were PRESENT at every threshold tried from 0.05 to 0.25.

**Recorded for the fix's own measurement** (the threshold, the line break and the comparison are the fix's to name,
within these bounds):
- **No fixture in the repository exercises the defect.** The synthetic PDF (`test/documentFixtureBytes.ts`
  `pdfWithTextLayer`, :206–:212) draws one run per line, so it reads the same under both joins, and a regression back to
  `join(' ')` would pass every test. Ruling 7 (§5) closes this with a synthetic fixture.
- **The threshold's band is 0.05 to 0.07.** Split pieces sit at or below 0.047 and bullet dots from 0.077. Above the
  band a bullet dot is glued to its word. At 0.06: 12 single-letter tokens, 69 spaces before punctuation, the three
  quotes PRESENT, no bullet glued.
- **Fifteen gaps are negative, and they are not the join's.** They are Latin runs inside Hebrew lines that the producer
  wrote in visual order, so they read reversed („mIU/ml 10" where the page reads „10 mIU/ml"). This is the visual-order
  class the extractor ruling accepted without a reordering heuristic (`docs/gf-extractor-ruling-2026-09-23.md` §6.5
  :184–:189). A residual, recorded; the join must not try to correct it.
- **"The English control identical" means identical after the verdict rule's whitespace collapse**, not byte-identical. A
  join that starts a new line at pdf.js's end-of-line mark writes `\n` where today's writes a space, so every multi-run
  PDF's text, and its content version, moves. No quote is affected, since the rule collapses whitespace.

## 3. Why the viewer's copy does not matter, and the reader's split does

**The copy side is out of scope** (the researcher, 2026-09-24): a quote is formed by Claude in the conversation, from the
platform's text or a screenshot or a paragraph named, shown to the researcher, and confirmed before any tool is called.
Nobody quotes from a viewer's clipboard.

**The reader's side is not.** Check 19 (A6 :1536) and `PassageVerdict` (A2 :1313–:1316) take each quoted span from the
paragraph of the THESIS that carries the `#doc_` token and match it against CURRENT(d)'s text:

| the quote is written in the thesis as | check 19 | the published page shows |
|---|---|---|
| correct Hebrew: „שבתדריך", „עונתית," | ABSENT: publication refused, naming the researcher's quote as false | — |
| the reader's form: „ש ב תדריך", „עונתית ," | PRESENT | broken Hebrew in a published quote |

Step 34's content opening (A5 :1504–:1505) would also serve the split text to the public.

## 4. The options weighed, and the direction not taken

- **Normalise the verdict rule** to letters and digits in order. Deterministic, and PRESENT ×3 here. **Not adopted:** its
  only ground was the reader's own defect, and the rule has callers over captures that do not have it.
- **Match words in any order.** Rejected: a reordered sentence that means something else would pass.
- **A quote created and validated outside the thesis, then referenced from it** (the researcher's proposal, 2026-09-24):
  Claude locates the span in CURRENT(d), shows it as the page reads, the researcher confirms, and the thesis refers to the
  stored quote. What matches (a span, by position) and what reads (the approved form) come apart, prose is no longer
  parsed for quotation marks, the quote is pinned to its content version, and the confirmation is stored. It does not
  remove the rule for when the approved form equals the span; it moves that rule to the moment of creation. **Not adopted;
  kept as an issue** (§6). **The reasons, adopted by the researcher on 2026-09-25:** no defect was found in the quoting
  design, only in the reader; a claim rests on REFERENCING (the token and the argued debate, since a claim can be made
  because the same essence is in a corpus record), while quoting is verbatim text alone; and any future quote mechanism
  must keep quoting as a later pass on drafted prose, with the words in the text beside any token.

## 5. The rulings — the researcher, 2026-09-25

1. The quote object is NOT adopted. "Quoted spans of the paragraph" stands as designed on 2026-09-04. Captures remain as
   today.
2. The ONE verdict rule is unchanged. Normalisation is not adopted; its ground was the reader's own join.
3. **The PDF join at `documentExtractor.ts:225` is a defect**, fixed by a geometry join at a new `CURRENT_EXTRACTOR` that
   names the join policy and its threshold, the threshold read off the measured valley. Re-measured in a dated doc: split
   words before and after, the three quotes exact, the English control identical. Its own change, after step 33's current
   chunk and before step 34's sketch; the derivation pass re-derives HELD documents.
4. Check 19 is unchanged. The ambiguity of two documents in one paragraph is filed as an issue, gated on step 34's live run.
5. The quote object is filed as an issue, referencing §4 above, gated on a live run producing a need the
   `verify_claim_text` document arm does not meet.
6. The rest of the quote-object questions do not apply under 1.
7. **OPEN:** whether MK 05/2023 joins step 29's fixture set as its Hebrew member, whole or as a one-page extract without
   the names.
8. Timing: step 33 is untouched; the reader's fix lands before step 34.

**Ruling 7 CLOSED, the same day** (the researcher, adopting the REVIEW seat's recommendation: "I approve your
recommendations"): the fix is held by a SYNTHETIC fixture, a PDF from the repository's own generator drawing one word as
two runs, each in its own marked-content sequence, which today's join reads split. No real document is checked in.
MK 05/2023 stays what §1 says, this measurement's record by its sha256.

**Timing SHARPENED, the same day** (the researcher): the reader's fix lands **before step 33's staging exercise**, so no
citation made in that exercise is re-pinned when the extractor moves.

## 6. Issues

Filed from this record: the ambiguity of which quoted span belongs to which document (ruling 4). Its two shapes are two
`#doc_` tokens in one paragraph, and a quotation of something that is not the document standing beside a `#doc_` token.
Also filed: the quote object (ruling 5).
