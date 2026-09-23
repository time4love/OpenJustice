# Document step 30 — the researcher's door, BUILT

Plan step 30 (`docs/gf-document-refactor-plan.md` :173–:189); contract `docs/gf-document-flows.md` §9 :998, §12 :1185,
A2 :1262–:1305, A3 :1383, A4 :1404–:1441; `docs/gf-ui-flows.md` §1 :39, A1 :1129, §24 :719/:748. Built in four chunks
by the R76–R78 DEV/REVIEW seats, each chunk graded by reproduction and ended at a page the researcher approved. Written
the day it was built; never edited after.

> **WHAT THIS RECORD IS NOT.** The step ENDS AT A PAGE ON STAGING (plan :182): the real XLSX and the paper uploaded from a
> browser, read back through the connector, and shown on the DOCUMENTS lens, with `commitments-owed` exit 2 and
> `document-recomputable` exit 0 over them (plan :184–:189). **That exercise follows `LAND` and is not recorded here.**
> The rulings below live in the design lines named; this record carries what was BUILT and MEASURED, and it decides
> nothing.

---

## 1. THE BUCKET MIGRATION — the approval record the researcher asked this document to carry

The bucket comes to exist by a MIGRATION (§12 :1185, ruled 2026-09-23). The SQL was APPROVED as a proposal file outside
the repository, then edited before it entered the tree. The ruling: the approval lives HERE, as the approved text's sha
and the diff.

| | sha256 |
|---|---|
| the APPROVED text | `451c442fcd5cbd95d03118edf645b656939a315984a9634cd0f399a0239566c2` |
| the file that LANDS — `apps/glass-fortress/backend/prisma/migrations/20260923180000_document_step_30_private_bucket/migration.sql` | `491042faf21ac9a061ced896c1c02b03067d03177e1e88db7a343c319855ad91` |

The diff, approved → landed, and nothing else:

```
1,2d0
< -- PROPOSED: prisma/migrations/20260923180000_document_step_30_private_bucket/migration.sql
< -- Not in the tree. Shown to the researcher first (rulings batch item 10).
28,29c26,27
< -- have ONE spelling (the extractor's reader table / UNSUPPORTED_TYPE), and a list here
< -- would be a second one that can drift.
---
> -- have ONE spelling (`add_document`'s accepted set, which UNSUPPORTED_TYPE reads), and a
> -- list here would be a second one that can drift.
```

**The SQL statements are byte-identical** (`INSERT INTO storage.buckets … VALUES ('documents', 'documents', false,
52428800) ON CONFLICT (id) DO NOTHING`). The two removed lines are the proposal's header comments. The corrected comment
names the accepted set's one spelling, which the round-1 review of 29b had moved.

**How the approved text was recovered.** No copy was kept when the file was edited. The review seat read the approved
text back from the seat's own tool call that first wrote it; that text hashes to `451c442f…66c2` exactly, so the diff
above is between the approved bytes and the landed bytes, not a reconstruction. A test holds the landed file's sha and
holds its `file_size_limit` equal to `TOO_LARGE_BYTES`.

`db:check-drift` cannot see the `storage` schema. So `LAND` reads the bucket row from the database: it exists,
`public = false`, `file_size_limit = 52428800`. It likewise reads migration 75's CHECK `DocumentOpinion_by_writer` from
`pg_constraint`.

## 2. THE RULINGS THIS STEP WAS BUILT TO — each lives in its design line

| ruling (2026-09-23 unless dated) | where it lives |
|---|---|
| THERE IS NO PASTE; `add_document` takes `docId`, REQUIRED | flows §9 :998, A4 :1404 |
| the upload dialog: hashes in the browser, a gated route signs the upload, ONE document, the link's facts drawn as LABELS (2026-09-22) | flows §9 :998; ui A1 :1129 |
| one private bucket per environment, by migration; the route refuses `BUCKET_ABSENT` and never creates it | flows §12 :1185 |
| signed upload URLs minted `upsert: false`; no "already held" arm | flows A2 :1276; ui A1 :1129 |
| `TOO_LARGE` 50 MB (the object's own size) · the image-block cap 5 MB · the sweep's lifetime 7 days | A4 :1404, :1425; interaction A8 |
| `read_document` never puts bytes in the model's context: text, or an image block, or `bytesUrl` | A4 :1425 |
| the four assertions are written ONCE by the first arrival; differing values come back IGNORED | A2 :1271, A4 :1409, §9 :1009 |
| `DocumentOpinion`, append-only, `by RESEARCHER | RECEIPT` with a CHECK; SHED nulls bodies, removes no row | A2 :1302–:1303, :1305 |
| `describe_document` refuses `UNSUPPORTED_TYPE` (audio, video, a spreadsheet with no text, with the reason) | A4 :1440–:1441 |
| `describe_document` refuses `TOO_LARGE` above the DESCRIBER's bound, 50 MB, before any paid call and with no silent fall-back to the text (the researcher adopting Fable's advice, the bound amended to 50 MB) | A4 :1440 |
| no refusal of PDFs over 1000 pages, for now | this record (no design line) |
| the `list_documents` and `read_document` envelope SHAPES, `arrivals: [{ by \| null, at }]`, `anchored: boolean` (batch item 15; Fable's two corrections, adopted) | A4 :1426, :1434 |
| a DIALOG renders without the shell (2026-09-22, board י2) — it re-chromes the marking page too | ui §1 :39 |
| the DOCUMENTS lens at the gated door only, as ui §24 :748's lens control; board י3's fifth chip is conformed at the boards' next revision; „גיליון" and „5 לשוניות" are not drawn | ui §24 :719, :748 |
| after `LAND`, the LOCAL dialog uploads into staging's bucket (Q-F) | R78 review state, Entry 12 |

**Approved text, frozen:** the DOCUMENTS paragraph, the four tool descriptions and the describer's prompt
`v2-one-document-title-not-described` (the chunk-2 page, sha `4bc6b0a1…7ec8` of its print); the upload dialog's Hebrew;
the lens's Hebrew.

## 3. WHAT THE REVIEW CAUGHT — the findings that changed the build

- **"One transaction" was held by nothing.** The test double handed a `$transaction` callback the SAME client, so a
  write moved outside the transaction at any of three sites reddened zero cases. It now hands a distinct, tagged client.
  This is the second time the shape was found (evidence step 14).
- **EQUALS_CAPTURE compared spellings.** A fixture seeded both sides as `0x`, while `UrlSnapshot.documentHash` is stored
  bare hex; the predicate and the query now compare DIGESTS, held by a snapshot seeded as its writer stores it.
- **The connector's copy described code it did not match:** a scan "comes as an image" (it rides as a download link),
  and the link's date was "added", which duplicates a key the backend already set. It now SETs `title=` and `at=`.
- **The dialog hung on any answer it did not expect.** A storage outage is a deliberate 500, and it left „מעלה…" on the
  page for ever. Every unexpected failure is now the one failure sentence, logged.
- **Board י1ב's „(וידאו)" suffix was not built.** The link now carries the derived-from document's family.
- **THE RESEARCHER, AT THE PAGE, FOUND THE MARKING PAGE COULD NOT SCROLL.** The new dialog frame had no scroll container
  while `html, body` are `overflow: hidden`, leaving 679 px unreachable, and every jsdom case was green over it. It is
  the defect `globals.css` already records for `.shell-centre` ("A VIEWPORT IS NOT AN INSTRUMENT"). `.dialog-frame` and
  `.dialog-body` now carry the shell's contract, held by value. The review had graded that page by screenshot and DOM
  counts, and from then on it read `scrollHeight` against `clientHeight` at every page.
- **Two case titles outlived their assertions:** "the first arrival whose `by` is not null" seeded no null arrival;
  and the lens's date case matched „3.9.2026" inside „23.9.2026". Both now fail on a decoy.

## 4. MEASURED AT THE BUILD'S CLOSE (the tree, uncommitted)

```
backend   tsc 0 · build 0 · npm test 193 / 3292 / 0 · walk 20 / 470 / 0 · evidence 9 / 252 / 0
          test:document 85 failed / 147 passed of 232 — red by design until step 36; the 85 name steps 31–35
          eslint src/ 82 problems / 15 rules, no (file, rule) pair moved · MCP surface 50 (+4 tools) · migrations 76
frontend  jest 61 / 613 / 0 · eslint --max-warnings=0 0 · tsc 0 · build 0
scroll    marking page 1440×900: 1166 / 844, scrolled to its last section · 390×844: 1205 / 788
          upload dialog 390×420: 409 / 364 · DOCUMENTS lens 1440×900: 900 / 900 (empty) · 390×844: 788 / 788
```

## 5. OWED — none of it this record's to close

- `LAND`: the drift check, the bucket row and the CHECK read from the database, and a comment on issue #466.
- **The staging exercise** (plan :182, :184–:189) and the lens's ROWS graded against board י3 once documents exist.
- At `SHIP`: production's chain-rotation read, and production's legacy PUBLIC `evidence` bucket (staging holds one,
  public, one object from 2026-08-20; not this step's).
- Step 31 builds the pass that pays the commitments every document of this step owes (`anchored: false` by
  construction until then).

LOWs carried, not applied: "50 MB" spelled in prose beside its constant · "the model's documented limit" true of a PDF
only · a CSV's browser type varies by operating system · a backslash in a title is not escaped in the command · a
malformed `derivedFrom` is not checked in the link · the lens parser reads `assertedAt` as any text · the "writes no
row" scan matches only the name `prisma` · the fifteenth route's gate case is a double (the real mount is held by
`routeIsTool` G1/G2) · the „(וידאו)" suffix sits in its own column at 390 · `scripts/` is not linted.
