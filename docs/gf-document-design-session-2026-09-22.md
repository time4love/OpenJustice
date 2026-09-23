# The document door, re-validated against three record kinds — the design session of 2026-09-22

**A design and planning session, the day UI-8 closed and shipped.** The researcher asked whether the
document design still holds for the three kinds of material the corpus must hold next, and what the
way forward is. Six rulings came out of it, each AMENDED IN PLACE into `docs/gf-document-flows.md`
and `docs/gf-document-refactor-plan.md` at zero line delta (§8 below names every line), and one
round was scoped from the step bodies — the researcher's door, R74. This is the dated record; the
designs carry the rulings and this document carries the reasoning. Nothing here is a plan step.

> **STATUS.** Rulings 1–6 APPROVED by the researcher 2026-09-22 („approved, write the R74 brief and
> the amendments"). The R74 brief is `handoffs/R74-decision-brief-2026-09-22.md`, outside this repo.
> What stays open is §9.

---

## 1. THE QUESTION, AND THE FACT THAT DECIDED ITS SHAPE

Three kinds of material were put to the design:

1. **PDF files of official documents the archive does not hold** — a FOIA answer circulating as a
   file, obtained by someone else; a committee protocol downloadable from a government site but not
   a page the archive crawled; a peer-reviewed paper and its supplementary dataset.
2. **A whistleblower's documents** — sensitive, sent by a stranger.
3. **Video interviews of officials** — a statement on record, held on a hosting site; the citable
   thing is a transcript with a link anyone can follow.

**The design answers all three with the one class it already rules** (flows §1): custody attested by
receipt and the registry, credibility argued from the bytes, no subclass named after an unverified
claim. A circulating FOIA answer is a HELD document whose authorship is an argument, never a column;
COMPLIANCE Rule 2 forbids stating that authorship as fact, not citing the document. A government PDF
is a HELD document with the URL and date as the researcher's assertions (flows §2 :244–:255,
interaction flows :46), verifiable by anyone with `sha256sum` over their own download. A paper is the
same class, and the cherry-picking risk is the debate's MERIT round and the critic's, not a document
property. A whistleblower's file is the INTAKE door, sealed (§5, §8). A video composes from §7's
derivation rule: the media is bytes, the transcript is a document derived from it.

**The fact that shaped every ruling below: claude.ai cannot hand a file to an MCP tool.** Checked
2026-09-22 against the MCP connector documentation, the MCP architecture specification and the Files
API documentation: a tool call's arguments are JSON the model writes; the model sees an uploaded
file as extracted text or a rendered image and holds no handle to its bytes; MCP defines no
client-to-server transfer of a file or blob; a Files API `file_id` reaches the Messages API and the
code-execution tool and no MCP server. A paste is the one document the chat carries byte for byte.
A PDF the model "saw" cannot be re-emitted as its bytes, and its extracted text is a lossy rendering
whose hash nobody with the original could recompute — which §2's identity rule forbids as a name.

So the design's sentence *"the file arrives in plaintext through MCP"* (flows :163) was true of a
paste and false of every file, and the plan's `add_document({ bytes })` had no caller that could
supply the argument from the seat the researcher works in.

## 2. RULING 1 AND 2 — THE DOOR FOR BYTES IS THE UI, AND THE STORE IS ONE BUCKET

**The researcher's words:** *"the document intake is where the platform UI may be used and not
claude ai conversation"* — two users, a whistleblower who uploads from the UI, and a researcher who
may use claude.ai but for whom *"the UI is already established as a tool that supports the claude ai
conversation and should be used in parallel … as a way to visualize the researcher work"*. And on
the store: *"why not upload the different media files to a bucket from the dialog and have a
unified way to upload data"*.

**The shape, and why it needs no new write rule.** The UI design holds that the browser writes
nothing (ui §1 :32) and the thesis flows' dialog rule (thesis §2 :126–:132) lets a dialog *"save
state only as CACHE or DRAFT, and only so that Claude can pick the transformation's value up, since
Claude cannot receive a return value from a page"*. Bytes are exactly such a value. So the
researcher's door has two halves and one act:

```
the UPLOAD DIALOG   a DIALOG under ui §1 :36–:38 — opened by a link the chat hands over, gated, in no
                    navigation. Computes DOC_ID over the file as given (unstripped, A1) with WebCrypto,
                    the same vector as the sealed door; asks a gated route for a SIGNED UPLOAD URL for
                    that key; uploads straight into the bucket; hands back the add_document command
the BUCKET          one PRIVATE bucket per environment, in the same Supabase project as that
                    environment's database, so it sits on the DATABASE_URL axis that
                    assertOperationalContext already checks; objects keyed by DOC_ID; no public read
the ACT             add_document({ docId | text, mimeType, assertedUrl?, assertedAt?, derivedFrom? })
                    pasted into claude.ai: reads the object, recomputes DOC_ID, refuses NAME_MISMATCH,
                    derives content, writes the Document and the Arrival(RESEARCHER) — attributed
CACHE vs HELD       the SAME object. No Document row → cache; a row → held. Derived, never a column
                    (§11's rule one level down). An object no row names is swept after a lifetime,
                    an operational parameter of flows A8's kind. Nothing moves
```

**What was considered and fell.** A `url` arm on `add_document` — the server fetching a
researcher-supplied URL — was proposed first, as §2's own "direct fetch" given a parameter. It fell
once the UI was ruled the door: the researcher downloads and uploads, and the URL is the assertion
§9 already records. It would also have added a server-side fetch of an arbitrary URL, a surface
nothing else in the platform has. A `bytea` column was proposed for the store and fell on the
researcher's question: it was sized for a PDF and a spreadsheet, and the moment media is in the list
a row is the wrong home, while a second path for large files would be one rule with two
implementations. The bucket serves every kind through one path, bypasses the backend's 20 MB JSON
limit because the bytes never transit the backend on the way in, and `document-recomputable` reads
it in the container exactly as it would have read a column.

**The sealed door is untouched.** §2 promises the sealed copy lives off our servers, content
addressed; §12 names no provider. The bucket holds nothing sealed. Whether ciphertext transits it on
the way to the pin is step 32's implementation detail.

## 3. RULING 3 — A SPREADSHEET IS COMPUTED TEXT

The material the researcher wants to run first is a peer-reviewed paper's supplementary XLSX — an
internal pharmacovigilance dataset, already public under an open licence. Flows §3 named four kinds
(a PDF with a text layer, a scan, a paste, a photograph no engine reads); a spreadsheet was "none of
the above", content = bytes, every quoted number UNCHECKED. **Ruled: a spreadsheet's cells,
serialised deterministically sheet by sheet at a pinned version, are COMPUTED text** — reproducible
from the bytes by a named extractor, which is §3's line. Step 29's fixture set gains a fifth kind.

## 4. RULING 4 — VIDEO IS MEDIA PLUS A DERIVED TRANSCRIPT; SPEECH-TO-TEXT IS OPINION

A media file uploaded through the dialog is a HELD document whose content is its bytes (§3's last
row). Its transcript is a second document — a paste — `derivedFrom` it (§7's redaction-and-
transcription rule), with `assertedUrl` the video's public URL, and the transcript is what a thesis
cites, so the verdict rule can check every quoted span against it. The argument states what the
transcript is and where to verify it, exactly as §9 states the weakness of a researcher-held page.
A survey of the hosting page gives the video's existence, title and date a two-witness capture.
**Speech-to-text at a pinned model is an OPINION in v0, never an extractor:** §3's line is
reproducibility, and two draws of an ASR engine are not known to agree until measured. The
measurement that would move it — agreement between two draws over the same bytes — is §12's kind,
and nobody has taken it.

## 5. RULING 5 — STEP 31 IS IN THE DOOR ROUND, ON STAGING, WITH THE PRODUCTION PASS HELD

R72 deferred step 31 because "Standing" means standing on the chain and production spends mainnet.
Read whole: without it `EVIDENCE_VERIFIED` (A6) is hard on a DOCUMENT mention and no thesis citing a
document can ever publish, so a round that reached step 34 without it would end at a dead gate. On
staging the registry is Sepolia and the pass costs nothing; on production a commitment costs what a
capture anchor costs, which the walk already pays per capture. **Ruled: build 31 in the round,
exercise `forensics:anchor-documents` on staging, and hold the production pass until the researcher
says the word.**

## 6. RULING 6 — THE ROUND, SCOPED FROM THE STEP BODIES

R73's correction ruled that scoping the door is "its own round's first act, read from the step
BODIES, not a third estimate". Read whole, the order the seams allow and the chunks that end at a
page the researcher can open:

| order | step | ends at something the researcher can OPEN |
|---|---|---|
| 1 | 27 — the `document` jest project, red; the chain read on staging | nothing, by rule: the red suite and the read on record |
| 2 | 28 schema · 29 identity and the extractor (PDF text · tabular · paste; OCR judged by coverage) | `extractor-coverage` over the real XLSX and the paper |
| 3 | 30 — the researcher's door WITH the upload dialog, the bucket, the signed-URL route, the sweep | the XLSX and the paper uploaded from a browser against staging, `read_document` and `list_documents` through the connector |
| 4 | 33 — `#doc_`, the pin, the debate's third record; the `#doc_` chip in the working view's centre (ui §17 reserves it) | a version citing a document, a debate, a promotion, the chip on the page |
| 5 | 31 — anchoring, on staging; production held | `commitments-owed` exit 2 then 0 on staging |
| 6 | 34 — openings, the two checks, the public read and the record page | a published thesis citing a document |
| later | 32 · 35 with the intake and withdrawal dialogs and the `/safety` copy | the whistleblower door, commissioned by a published call on production |

**The upload dialog and the chip are UI work inside the freeze line by its own test**: each makes a
corpus act visible. The dialog's link rides `list_documents`' envelope, so A4's surface gains no
tool. **The FOIA requests go out in parallel, now**, under the researcher's own name, with
`draft_foia_request`; the statutory clock runs during the build.

## 7. THE THREE KINDS, RE-VALIDATED — ONE LINE EACH

| material | door | custody | what the citation rests on | what stays an argument |
|---|---|---|---|---|
| a circulating FOIA answer | researcher's dialog | HELD, one witness | its computed text, opened as the researcher decides | that the ministry wrote it; the own-name FOIA obtains the chain-of-one copy |
| a government PDF, a paper, its dataset | researcher's dialog | HELD, `assertedUrl` + `assertedAt` | computed text; tabular cells for the dataset | the page it came from, capturable as a two-witness record beside it |
| a whistleblower's file | the public intake dialog, step 32 | SEALED, verified once at receipt | the receipt text version | what the marks showed, a labelled opinion, UNCHECKED |
| a video interview | researcher's dialog, twice | HELD media (bytes) + HELD transcript derived from it | the transcript's text | that the transcript matches the video at the URL |

## 8. THE AMENDMENTS, LANDED IN PLACE — ZERO LINE DELTA

Twenty-eight in-repo `:line` citations point into the two document documents, so every amendment
rides an existing line (`gf-r43-lessons`: amend an appendix in place). Each is a bold dated `RULED`
clause appended to the line it amends:

| file | line | what it now says |
|---|---|---|
| `gf-document-flows.md` | :163 | HELD bytes arrive through the upload dialog into the bucket; the tool call names the object |
| | :284 | a spreadsheet is COMPUTED, not "none of the above" |
| | :998 | the door's two halves and one act; CACHE under the dialog rule; the sweep |
| | :1013 | media as bytes-only HELD; transcript derivedFrom; ASR as OPINION |
| | :1185 | the storage: one private bucket per environment, keyed by DOC_ID, state derived |
| | :1267 | `Document.bytes` is the bucket object, the dialog's cache before the row |
| | :1404 | `add_document`'s argument is `docId | text`, exactly one |
| `gf-document-refactor-plan.md` | :109 | the round's scope and order (§6 above) |
| | :157 | step 29's fixture set is five kinds |
| | :182 | step 30 builds the dialog, the bucket, the route, the sweep, and ends at a page |
| | :191 | step 31 in the round, staging, production held |

The plan has no `STATUS:` lines yet; each step gains one when it closes, and the round that adds
the first recomputes every plan cite below it from the file, as R43 did.

## 9. WHAT STAYS OPEN, AND WHOSE IT IS

- **A PDF the archive holds.** The walk fetches with an HTML `Accept` header and marking presumes
  HTML, so a PDF URL the archive has captured never becomes a CAPTURE and flows §2's equality never
  fires for one. The factual layer's; an issue, not this round's.
- **The sweep's lifetime and `TOO_LARGE`** — operational parameters, set at step 30 and measured.
- **ASR as an extractor** — moves only on the two-draw agreement measurement (§4).
- **The whistleblower round's preconditions** — a pinning provider (none in `package.json` since the
  legacy switch), a published thesis with a CALLED gap on production, the `/safety` copy (UI-9).
- **The run.** The researcher ruled 2026-09-22 „close the dev, then research end to end"; the door is
  part of closing it, so the run follows the door.
