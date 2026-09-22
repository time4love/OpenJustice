# The extractor ruled — `ocr-none`, and scanned documents opened to BYTES (2026-09-23)

**Bears on:** `docs/gf-document-refactor-plan.md` step 29 — `CURRENT_EXTRACTOR` is a dependency choice the
plan deliberately refuses to make (:154–:158, and flows §12 :1180–:1181: *"the build's choice, judged by the
coverage measured below, never by this document"*).

> **THE TWO RULINGS, by the researcher, 2026-09-23.**
>
> 1. **SHIP `ocr-none`.** No OCR engine enters v1. A PDF with a text layer is read and its text is COMPUTED;
>    **a scan is bytes-only**, and a quoted span from one is `UNCHECKED`, with the reason.
> 2. **A SCANNED DOCUMENT IS OPENED TO BYTES.** The researcher's standing decision, so that a reader who
>    cannot be shown a machine-checked quote can open the file and check it themselves.
>
> Written into the design at `gf-document-flows.md` **:282** and **:842**. This document is the RECORD and
> the reasoning; **it corroborates and never decides.**

---

## 1. The question, and why it was narrower than it first looked

`CURRENT_EXTRACTOR` is *"one constant naming the extractor and its version; the PDF reader and the OCR
engine are its parts"* (A1 :1247–:1248). Four document kinds must be handled, and **three of them do not
discriminate between candidates**:

| kind | does the dependency choice matter? |
|---|---|
| PDF with a text layer | no — a solved library problem |
| spreadsheet | no — a deterministic cell walk, hand-writable |
| a file no engine reads | no — bytes-only **by design**, counted as bytes-only and never as a failure |
| **a scan — Hebrew OCR** | **this was the entire decision** |

**A born-digital PDF and a scanned PDF are different documents wearing the same extension.** The first has
a text layer and is read; the second is an image in a PDF wrapper and only OCR could read it. The ruling
touches the second only.

## 2. What the ruling actually traded, and it is not "checked versus unchecked"

The design's line is **reproducibility, not quality** (§3 :299–:305): a vision model reads a scanned Hebrew
memo better than any engine and its transcription is still an OPINION, because two draws differ and nobody
can recompute it. So the only question was whether a *deterministic* engine could read Hebrew faxes well
enough to be worth having.

**The asymmetry that decided it:**

- With **`ocr-none`**, a quoted span from a scan is **`UNCHECKED`, with the reason** (A3 :1386) —
  **non-blocking**, and *"the citation rests on the image"* (§3 :303–:305).
- With a **weak engine**, the same span is checked against text carrying a few per cent character error, so
  **a TRUE quote with one misread letter returns `ABSENT`** — and `DOCUMENT_QUOTES_PRESENT` is a **hard,
  blocking** check (A6 :1536).

> **A weak engine costs more at the gate than no engine.** It converts an honest *"not machine-checked"*
> into a false *"the researcher quoted a phrase the document does not contain"* — a machine-generated
> accusation against the platform's own researcher, produced by a fax artefact.

On 2020–22 ministry letterhead the classic Hebrew confusions are ם/ס, ך/ז/ן, ד/ר, ב/כ, and the first thing
to break is digit runs — dates and file numbers, which is exactly what a thesis quotes.

**And the instrument could not have caught it.** `forensics:extractor-coverage` (A7 :1591) measures
*"COMPUTED text against bytes-only, by type and door"* — it counts **whether** text was derived, never
whether it is right. **An OCR engine scores 100% coverage on every scan while returning garbage on a fax.**

## 3. What custody still proves under `ocr-none`, and what it does not

Two different things are attested, and only one lapses:

- **Custody is proven, by a stranger.** `GET /api/documents/:commitment/bytes` *"serves the file, and
  `{ docId, salt }` beside it, **so a reader can reproduce the commitment from the file**"* (A5 :1509–:1510).
  Anyone may download it, `sha256sum` it, derive `sha256(bytes32(DOC_ID) ‖ salt)` and check that against the
  registry. **That the platform holds this exact file, unaltered, needs no trust.**
- **What lapses is only that the quoted words are in it** — and the reader checks that by eye.

**`UNCHECKED` is visible, never silent.** The reader is told the quote was not machine-checked, which is what
§3 :303–:305 requires the record to show.

**This is why the second ruling exists.** `/bytes` refuses `NOT_OPENED_TO` when the opening is below BYTES
(A5 :1511), and `decide_opening` takes `PASSAGE | CONTENT | BYTES` (A2 :1309). **Without a BYTES opening, a
reader can neither machine-check the quote nor open the file** — they would be asked to trust it. Opening
scanned documents to BYTES is what makes the verification story true rather than theoretical.

## 4. What this costs, stated plainly

**Scanned Hebrew is not citable as checked text in v1.** A thesis may cite a scan, and the citation rests on
the image. If the corpus turns out to be mostly faxes, the gate will report a great many `UNCHECKED` spans,
and that is the honest reading of the material rather than a defect.

**The reversal is cheap and was designed for.** `CURRENT_EXTRACTOR` is one string naming its stages; adding
an OCR stage later moves it, and the derivation pass over HELD bytes re-derives — **and only for scans**,
since step 29 :159 rules that a re-derivation with identical text is not a new row and §11 rules SEALED
documents are never re-derived.

## 5. The two gates any future OCR must pass

Recorded now so a later seat does not re-litigate them:

1. **Determinism.** For each fixture kind: three runs on the laptop, once in CI, once inside the staging
   container — the sha256 of the emitted text (and of the rendered bitmap, for a scan) **identical across
   all five**. Any difference disqualifies the stage that produced it. **This is the acceptance test.**
2. **Quote recall on real material.** 5–10 real scanned ministry pages from 2020–22, 20–30 hand-transcribed
   spans of the length a thesis actually quotes. **Below roughly 90% `PRESENT`, ship `ocr-none`** — beneath
   that floor the engine manufactures more blocking false `ABSENT`s than the `UNCHECKED`s it replaces.
   **The floor is the researcher's to set; the number is not.**

**A stage nobody had counted:** a scanned PDF must be RASTERISED to a bitmap before OCR sees it, and the
rasteriser is a stage of `CURRENT_EXTRACTOR` with its own determinism hole. Its DPI and colour mode belong
in the version string and its output sha256 in a test. **`ocr-none` removes this stage entirely**, which is
part of why v1 is smaller.

---

## 6. THE SOURCE — the full advisory analysis, kept verbatim

**Per `docs/gf-two-session-protocol.md` :91–:110: a derived record NAMES ITS SOURCE and the SOURCE IS KEPT.**
The section above is the DERIVATION; what follows is the analysis it was derived from, unedited.

**Provenance and its limits.** Produced 2026-09-23 by an advisory model session (Fable 5.1) given the design
documents by path and asked for a recommendation, explicitly not a decision. **Its external research — the
GitHub issues, the error rates, the model-rotation claims — was NOT independently verified by the reviewing
seat.** It cites sources for each and flags its own uncertainties. **One claim was checked and held:** that
`src/lib/documentExtractor.ts` :52–:53 still described FIVE fixture kinds including a paste, after the ruling
of 2026-09-23 made them four. Treat the rest as a well-sourced brief, never as measurement.

### 6.1 Recommendation

> Set the OCR part of `CURRENT_EXTRACTOR` to Tesseract's LSTM engine run as WebAssembly in-process
> (`tesseract.js` 7.0.0, `@tesseract.js-data/heb` 1.0.0 pinned from npm, one core variant pinned,
> single-threaded), with `heb`+`eng`. Adopt it only after two measurements pass (§6); if the second fails,
> ship the same constant with the OCR stage as `ocr-none` and let scans be bytes-only, which the design
> already provides for. PDF text layer: `pdfjs-dist` 6.3.x. Spreadsheets: hand-written cell serialisation,
> no library needed beyond an XLSX parser.
>
> Why Tesseract and not something better: on Hebrew, "something better" does not exist in a form this design
> can pin. Every candidate that reads Hebrew more accurately is either a model whose output the design
> classes as OPINION, a Python/PyTorch sidecar whose byte-identity is unproven, or a network call whose
> model rotates under you. Tesseract is the only engine that (a) ships a maintained Hebrew model, (b) runs
> in the Node process, (c) can be made byte-reproducible by construction rather than by hope.

### 6.2 Per-candidate verdict (Hebrew coverage × determinism)

| candidate | reads Hebrew? | determinism at a version | verdict |
|---|---|---|---|
| **Tesseract LSTM, native binary** | yes — `heb.traineddata` (tessdata_best); `heb_old`, `yid` also exist | **Not across machines.** Issue #3812: the same image gives different results on Debian vs Windows/Mac; maintainer stweil: differences come from "different implementations of floating point calculations in the hardware and in software libraries", plus OpenMP thread-order randomness; the thread was never resolved. Tesseract exposes a `dotproduct` variable (auto/generic/native/avx/sse) precisely because the SIMD path changes results. Railway does not pin CPU ISA. | disqualified *as a native binary*; the WASM build below removes the cause |
| **Tesseract LSTM as WASM (`tesseract.js`)** | same model, same engine | **Yes, if pinned three ways.** WASM's IEEE-754 semantics are specified, so the float path cannot differ by host CPU; there are no OpenMP threads. But tesseract.js *auto-selects* between `tesseract-core-simd-lstm` and `tesseract-core-lstm` by host capability, and by default fetches language data from jsDelivr at runtime. Pin `corePath` to ONE variant, `langPath` to the npm package on disk with `cacheMethod: 'readOnly'`, and assert the sha256 of both the `.wasm` and the `.traineddata` in a test. Uncertain: whether the SIMD core uses `relaxed-simd` (which *is* implementation-defined). Pin the non-SIMD LSTM core until that is checked; it is slower, not different. | **recommended** |
| **PaddleOCR** | **no** — PP-OCRv5's multilingual doc lists Arabic-script models and no Hebrew; RTL reading order is not handled (discussion #14971, output comes back LTR) | Python; PaddlePaddle inference | disqualified on coverage |
| **EasyOCR** | **no** — issue #1334 (2024): still no Hebrew model; the 2020 tickets are closed unbuilt | Python/PyTorch | disqualified on coverage |
| **Surya** | unverified — I could not fetch its `languages.py` (404s) and its published top-15 benchmark table omits Hebrew | Now routes OCR through a VLM backend (`vllm` on GPU or `llama.cpp` on CPU) — it has become a vision-language model, which is the OPINION register by the design's own definition; weights under a modified OpenRAIL-M with a commercial threshold | disqualified on register and licence, before determinism is reached |
| **docTR** | vocab only — a Hebrew character vocab was added; no pretrained recognition model reads it (discussion #1893: train your own) | Python | disqualified on coverage |
| **Kraken + PP-OCRv6 (Zenodo, Aug 2026)** | **yes, and best-in-class among open engines**: Apache-2.0, trained at Inria/ALMAnaCH, "44 languages across 10 scripts (… Hebrew …)", Hebrew CER 6.50% / WER 18.48% on 3,426 test lines | Python/PyTorch sidecar. CPU inference with fixed threads is *plausibly* byte-identical for a CTC recogniser (greedy decode, no sampling), but nothing published asserts it, and CPU-vs-GPU non-identity is documented by PyTorch itself | **runner-up**: the engine to measure against if Tesseract fails §6, at the cost of a second runtime and container |
| **Google Vision (`iw`), Azure Read** | yes; ~98% on clean print per third-party reporting | **No.** Google rotates `builtin/stable` roughly yearly with "emergency bug fixes" that "could change the model behavior"; Azure pins an *API* version, not the weights. A network call that can return different text next year is exactly what "pinned at a version" excludes; it also costs per page and sends the sender's document off-platform, which §2's sealed custody forbids | disqualified as COMPUTED; unnecessary as OPINION (the platform already has `@langchain/anthropic` for that register) |

### 6.3 Hebrew specifics — where Tesseract would fail on 2020–22 MOH letterhead

> - **Niqqud**: `heb.traineddata` does not handle it (issue #4119 — "the copied text is nothing like the
>   original"; langdata #82 is still open). **Irrelevant here**: ministry correspondence carries no vowel
>   points. If a fixture with niqqud appears, expect garbage, not a partial read.
> - **Final forms**: recognised as distinct glyphs, but on a fax the classic confusions are ם/ס, ך/ז/ן,
>   ד/ר, ו/ז/י, ב/כ, ה/ח/ת. One wrong letter in a quoted span turns PRESENT into ABSENT.
> - **Mixed Hebrew/English/digits**: run `heb+eng`. Tesseract emits each line in logical order and handles
>   the embedded LTR runs adequately on clean print; on faxes the digit runs (dates, file numbers, ICD
>   codes) are the first thing to break, and reordering inside a mixed line is a real, unmeasured risk. I am
>   uncertain of the exact failure rate — only that it is where a citation of "מספר מכתב 2021-3456" is most
>   likely to come back ABSENT.
> - **Layout**: letterhead, logo, stamp, signature block, two-column headers. PSM 3 will sometimes read the
>   header columns as one line. Pin the PSM in the version string; do not let it float.
> - **The realistic accuracy**: the one Hebrew-specific practitioner source I found claims 92–96% on clean
>   modern print and 60–80% on 19th-century material; the fax case sits between and I could not find a
>   measured number. That is why §6 is a measurement, not an assumption.

### 6.4 The rasteriser is a stage too, and it is the second determinism hole

> A scanned PDF has to become a bitmap before OCR sees it. Options in Node: `pdfjs-dist` rendering to
> `@napi-rs/canvas` (a native Skia binary), or poppler's `pdftoppm` via `aptPkgs` in `nixpacks.toml`. Either
> is a pinned binary inside the container and deterministic *there*; neither is guaranteed bit-identical to
> a laptop render. Fix: the rendered bitmap's sha256 for one fixture is asserted in the suite and observed
> in the container (state the DPI and colour mode in the version string; 300 dpi grey). If the bitmap
> differs between the container and CI, the OCR text may differ, and the version is not a version.

### 6.5 PDF text layer — **this half is adopted**

> **`pdfjs-dist` 6.3.289, exact-pinned, `getTextContent()` items joined in content-stream order, then
> whitespace-normalised and NFC.** Pure JS, Mozilla-maintained, no native dependency for text. Reject
> `pdf-parse` (a wrapper over an old pdfjs, no gain) and `pdftotext` (a system binary, and poppler's
> reverse-bidi limitation is a decade-old open bug).
>
> The Hebrew failure mode: a PDF stores glyphs in whatever order its producer wrote. Word/Acrobat write
> logical order and pdfjs returns it correctly; some producers write *visual* order, and then Hebrew comes
> back reversed word by word (pdf-inspector #331 documents exactly this and fixed it with UAX #9). **Do not
> add a bidi-reordering heuristic in v1**: it is a second reading of the bytes and it moves when tuned. Emit
> content-stream order, and let the verdict rule show the cost — a true quote against a visual-order PDF
> reads ABSENT, visibly, and the fixture set should contain one such PDF so the count is known.

### 6.6 The version string

> Same grammar as `TEXT_EXTRACTION_VERSION` (`v3-inflate-decode-nohead-htmltotext-normalised`): dash-joined
> stages, no `+` (the corpus's `extractorOf` splits on `+chrome-`; keep one grammar even though documents
> never call it).
>
> ```
> v1-pdfjs6.3-streamorder-raster300gray-tessjs7-wasm-lstm-nosimd-heb_eng-bestint-psm3-omp1-xlsxcells-nfc
> ```
>
> - `pdfjs6.3-streamorder` — the text-layer reader and its ordering policy
> - `raster300gray` — the rasteriser's DPI and mode
> - `tessjs7-wasm-lstm-nosimd-heb_eng-bestint-psm3-omp1` — engine, build, core variant, languages, data
>   variant (`4.0.0_best_int`), page segmentation, single thread
> - `xlsxcells` — sheet-by-sheet cell serialisation
> - `nfc` — the one normalisation applied to every kind
>
> The fallback value if §6 fails is the same string with `ocr-none` in place of the Tesseract stage. The
> sha256 of the `.wasm` core and the `.traineddata` do not belong in the string — they belong in a test that
> fails when either file changes, the way the decoys work.

### 6.7 Honest downside, and what falsifies it

> **A weak engine can cost more at the gate than no engine.** With `ocr-none`, a quoted span from a scan is
> UNCHECKED — non-blocking, "the citation rests on the image" (flows §3 :303–:305). With Tesseract, the same
> span is checked against text with a few per cent character error, and a *true* quote with one misread
> letter is ABSENT under `DOCUMENT_QUOTES_PRESENT` — **hard, blocking** (A6 :1536). The engine turns an
> honest "unchecked" into a false "the researcher quoted a phrase the document does not contain." That is
> the whole trade, and it is why the choice must be measured on quote recall, not on coverage.
>
> **`forensics:extractor-coverage` cannot see this.** A7 :1591 measures "COMPUTED text against bytes-only,
> by type and door" — it counts *whether* text was derived, never whether it is right. Tesseract will score
> 100% coverage on every scan while returning garbage on a fax.
>
> **Two measurements; either failing revokes the recommendation:**
>
> 1. **Determinism**: for each of the four fixture kinds, run the extractor three times on a laptop (ARM),
>    once in CI, once inside the staging container; the sha256 of the emitted text (and of the rendered
>    bitmap for the scan) must be identical across all five. Any difference disqualifies the stage that
>    produced it. This is the acceptance test; nothing else is.
> 2. **Quote recall on real material**: 5–10 real scanned/faxed MOH pages from 2020–22, 20–30
>    hand-transcribed spans of the length a thesis actually quotes (5–15 words). Count PRESENT. **If fewer
>    than ~90% of true quotes return PRESENT, ship `ocr-none`**: below that floor the engine manufactures
>    more blocking false ABSENTs than the UNCHECKEDs it replaces. The floor is the researcher's to set; the
>    number is not.
>
> Also true of the recommendation: OCR at receipt is in the request path (§3 :307–:312, derivation "in
> memory, at receipt"); single-threaded WASM Tesseract is a few seconds per page, so a 20-page sealed scan
> is a minute inside one handler. That is a latency to state, not a design problem.

### 6.8 Where the brief and the design differed — the advisory session's own corrections

> - **Re-derivation is compute, not rows.** The brief said a moved part "moves every held document's current
>   text version." Step 29 (:159) rules "a re-derivation with identical text not a new row", and §11 says
>   only the pass over HELD bytes runs — SEALED documents are never re-derived. Bumping the PDF stage
>   re-runs scans and writes nothing for them.
> - **An engine that reads nothing is inside the design**, not a failure of it: §3 :303–:305 "Where the
>   engine reads nothing and the model reads everything, the record shows exactly that." `ocr-none` is a
>   legitimate value.
> - **Spreadsheet**: COMPUTED by cell serialisation (:284), fixture kind three, hand-written.

### 6.9 Sources, as given

- [tesseract #3812 — different results on Debian vs Windows/Mac](https://github.com/tesseract-ocr/tesseract/issues/3812) · [tessdoc FAQ on OMP_THREAD_LIMIT](https://tesseract-ocr.github.io/tessdoc/FAQ.html) · [PR #2106 dot-product variants](https://github.com/tesseract-ocr/tesseract/pull/2106)
- [tesseract #4119 — Hebrew with diacritics fails](https://github.com/tesseract-ocr/tesseract/issues/4119) · [langdata #82 — Hebrew issues](https://github.com/tesseract-ocr/langdata/issues/82) · [tessdata_best heb](https://github.com/tesseract-ocr/tessdata_best/blob/main/heb.traineddata)
- [tesseract.js releases (v7.0.0)](https://github.com/naptha/tesseract.js/releases) · [naptha/tessdata README](https://github.com/naptha/tessdata/blob/gh-pages/README.md) · [tesseract.js api.md](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [PP-OCRv5 multilingual models — no Hebrew](http://www.paddleocr.ai/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html) · [PaddleOCR discussion #14971 — RTL order](https://github.com/PaddlePaddle/PaddleOCR/discussions/14971)
- [EasyOCR #1334 — Hebrew still unsupported](https://github.com/JaidedAI/EasyOCR/issues/1334)
- [Surya README — VLM backend, licence](https://github.com/datalab-to/surya)
- [docTR discussion #1893 — Arabic/Hebrew vocab, no model](https://github.com/mindee/doctr/discussions/1893)
- [Zenodo 21788405 — PP-OCRv6 for kraken, Hebrew CER 6.50%](https://zenodo.org/records/21788405) · [kraken](https://github.com/mittagessen/kraken)
- [Google Vision languages — Hebrew `iw`](https://docs.cloud.google.com/vision/docs/languages) · [Vision OCR model upgrade notes](https://groups.google.com/g/cloud-vision-discuss/c/wz0_ZM9aODE) · [Azure Read language support](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0)
- [PyTorch reproducibility notes](https://docs.pytorch.org/docs/main/notes/randomness.html)
- [pdf-inspector PR #331 — Hebrew reversed word by word, UAX #9 fix](https://github.com/firecrawl/pdf-inspector/pull/331) · [poppler bug #127732 — reverse bidi](https://bugs.launchpad.net/bugs/127732) · [pdf.js #2141 — RTL extraction](https://github.com/mozilla/pdf.js/issues/2141)
- [MF Smart Research — Hebrew OCR 2026 (92–96% claim; provenance unverified)](https://mf-sr.com/en/blog/ocr-hebrew-2026-practitioner-guide.html)

---

## 7. What step 29b builds under this ruling

- **`CURRENT_EXTRACTOR` is set**, with the OCR stage as `ocr-none` and no OCR dependency installed.
- **`pdfjs-dist` for the text layer**, content-stream order, whitespace-normalised, NFC. **No bidi
  heuristic in v1** — a visual-order PDF reads ABSENT, visibly, and the fixture set should hold one so the
  count is known.
- **The spreadsheet's cell serialisation**, hand-written.
- **No rasteriser stage**, because nothing rasterises without OCR.
- A scan and a photograph both derive **no computed text**: the content version IS the bytes and its hash is
  the name (§3 :284–:285).
- `extractor-coverage` still ships and still reports **four counts** — and the record should say plainly
  that two of the four are bytes-only by ruling, not by failure.
