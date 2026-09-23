# Document step 29b, rounds 3 and 4 — the trap ruled, the reader held, the paste gone (2026-09-23)

**Bears on:** `docs/gf-document-refactor-plan.md` step 29 (:151–:171). The three records of this step, in
order: `docs/gf-document-step-29-2026-09-23.md` (round 1, the build),
`docs/gf-document-step-29-round-2-2026-09-23.md` (round 2, the fix round), and this one.

**Written the day it was built; never edited after it lands.** It CORROBORATES and never DECIDES — a
ruling is grounded in an appendix or a plan step.

---

## 1. `derivedUnder` — THE RE-DERIVATION TRAP, RULED AND CLOSED

Round 2 raised it and left it untouched, because it touched an appendix and a schema column. The
researcher ruled it, in place and at zero line delta: `gf-document-flows.md` §3 **:324**, A2 **:1300**,
A3 **:1368–:1369**, A7 **:1591** — the file still measures **1608 lines**, so no `:line` citation into it
moved.

**What the trap was.** §3 :317 rules that a re-derivation yielding identical text is **not a new row**, and
A3 :1368 read `CURRENT(d)` as the version whose `extractorVersion` **equals** `CURRENT_EXTRACTOR`. Together
they stranded a held document whose text a new extractor **reproduces**: no row could carry the new
version, so `CURRENT(d)` read `AWAITING_DERIVATION` for ever while the derivation pass reported
`UNCHANGED` — and `EVIDENCE_DERIVED` (A6 :1531) is a **hard** check, so that document became permanently
uncitable. Two clauses, each correct, whose intersection was empty.

**The ruling.** `DocumentContentVersion` gains `derivedUnder String[]`, append-only — every extractor
version that reproduced this exact text — and `CURRENT(d)` reads **MEMBERSHIP** of that list.

**`extractorVersion` is never overwritten**, and that is the part worth stating. Overwriting it would have
been the cheaper repair and would have destroyed which extractor produced the text **first**. The row keeps
its identity *and* its provenance; the list is the pointer.

**The append lives in the ONE writer.** `recordContentVersion` appends when the row it finds does not
already carry today's extractor — not the pass, which would be a second writer of a table plan :158–:161
gives exactly one. `add_document` inherits the behaviour without knowing about it. Append-only is not
append-again: a pass run twice does not grow the list.

### 1.1 The migration

One folder, hand-written, scoped to one table:
`prisma/migrations/20260923120000_document_step_29_derived_under_read_failed/`. It carries **both** columns
of this round because both are A2 :1300's single same-day amendment to one row.

`db:check-drift` reported **"No difference detected."** before it was written — the documented
pre-condition. It was then **checked against the generator offline**,
`prisma migrate diff --from-schema-datamodel <committed> --to-schema-datamodel <this> --script`, against no
database. That caught the first draft: it gave `derivedUnder` a `DEFAULT ARRAY[]::TEXT[]` **the datamodel
does not declare**, which is drift the next check would have reported. A Prisma scalar list is an empty
list to the client when the column holds none, and the generator emits `TEXT[]` with no default.

After writing, `db:check-drift` is **exit 2**, and its whole output is the two columns this file adds:

```
[*] Changed the `DocumentContentVersion` table
  [+] Added column `derivedUnder`
  [+] Added column `readFailed`
```

That is the expected state between writing the SQL and the deploy applying it, and it is stated rather
than left for the closing check to discover.

## 2. `readFailed` — FIVE OUTCOMES, AND A CORRUPT FILE IS NEVER REFUSED

Round 2 raised the question and did not answer it in code: a corrupt file of an **accepted** type still
threw out of `extract()`, which would have reached `add_document` as a 500.

**Ruled:** accept it as BYTES-ONLY, never refuse. A refusal would turn the platform's own reader failing
into a reason to hold nothing — a document turned away at the door because of a defect on *this* side of
it. And A5 :1493's `UNREADABLE` refuses **a key that does not open a ciphertext**: an entirely different
fact about an entirely different actor, which must not share one spelling.

`extract()` now catches the reader — and **only** the reader, so a defect in this module's own dispatch
still throws loudly. Five outcomes, each a different fact:

| outcome | what happened |
|---|---|
| COMPUTED | a reader ran and returned text |
| `READ_FAILED` | a reader was **selected and threw** — `readFailed` on the row |
| `READ_NOTHING` | a reader ran and found no text — a scan inside a PDF wrapper, an empty workbook |
| `OCR_NONE` | the class is IMAGE, and no OCR engine ships in v1 |
| `NO_READER_FOR_TYPE` | no reader class was even selected |

`extractor-coverage` counts `readFailed` **apart** (A7 :1591) as a **subset** of bytes-only, never a fifth
exclusive state — so the columns still sum to the document count, which is how a reader checks the table.
**A broken PDF and a photograph are the same count and not the same fact.**

### 2.1 A defect found in round 2's own code, by writing round 3's case

Writing the `READ_NOTHING` case found that **an empty CSV came back COMPUTED, with the text `# sheet1`** —
the serialiser's own header standing in as the document's content. Two things were wrong with that, and
they are the same thing twice:

- its `contentVersionHash` would have hashed **a string this repository invented**, where A1 :1242–:1243
  rules the bytes-only hash to BE the document's own name. The serialiser would have been authoring
  content under the document's name — exactly what the cell rules already refuse for dates and hyperlinks,
  one level up;
- `READ_NOTHING` was **unreachable for every spreadsheet**: however empty, a workbook answered COMPUTED.

A workbook whose cells are all empty now returns null. The defect was introduced by round 2's own CSV arm
and found by the case written to hold the arm beside it.

## 3. THE PDF READER — FOUR MEASUREMENTS, AND WHAT THEY RULED OUT

`pdfjs-dist` 6.3.289 ships **ESM only** — `legacy/build/pdf.mjs`, no CJS build in the package. It loads
correctly everywhere the code actually runs (`dist/`, every operational script, the server, `ts-node`)
because Node 22 supports `require(esm)`. **Inside jest it does not**, and round 3 was briefed to fix that
with `createRequire`. That premise was falsified by measurement, which is why all four are recorded here.

| mechanism | result |
|---|---|
| `await import()` compiled to `require()` | `Cannot use 'import.meta' outside a module` |
| **Node's own `createRequire(__filename)`** | **the same error** — it does NOT escape jest: jest-runtime hooks `Module._load` process-wide, so a require built inside a transformed module still routes through jest's loader |
| a native dynamic import hidden from the transform (`new Function('s','return import(s)')`) | `A dynamic import callback was invoked without --experimental-vm-modules` |
| the same, **with** `NODE_OPTIONS=--experimental-vm-modules`, on ONE file | **works** — the fixture reads, 1 page, 3 text items |

**`createRequire` was reverted.** Keeping a change whose stated justification is falsified is worse than
the diff it saves.

**And the flag was ruled out on the evidence of the whole run.** Measured by the REVIEW seat on the entire
gating suite — recorded here as handed over, not re-taken: `NODE_OPTIONS=--experimental-vm-modules npm
test` gives **179 suites passed / 7 failed, 3105 cases** where the control runs **3199** — so **93 cases
never executed**. (That control is round 3's count, before §4's suite was added; §9 below is round 4's.) Six of the seven failures are one cause in one project: every `test/extraction/*` suite
fails to load with *"Must use import to load ES Module: `node_modules/@exodus/bytes/encoding-lite.js` …
requires Node v24.9+"*, and this repository pins `engines: node >=22` and runs **22.20**. **A flag that
silently stops 93 cases from running is not a fix; it is a blinded suite.**

A second jest project and a `test:pdf` script were ruled out too: one rule with two implementations, and
**a job that is not on `staging`'s required list holds nothing** — `gf-thesis-step-18-2026-09-11.md` §7,
which is why that step's CHECK cases moved into the unit project in the first place.

## 4. SO THE READER IS RUN THE WAY PRODUCTION RUNS IT — a child `node` over `dist/`

`test/documentPdfProcess.test.ts`, in the **gating `unit` project**. Precedent:
`gf-evidence-step-15-2026-09-10.md` — *"the returned exit code held by nothing until a process-level
test"*.

The child requires the **compiled** `dist/src/lib/documentExtractor.js`, reads the committed
`fixtures/documents/pdf-text-layer.pdf`, and prints one JSON object: the sha256 of the emitted text, its
character count, the reason, and `CURRENT_EXTRACTOR` **as the compiled module holds it**.

```
sha256      1c008321b45019d28db2b7c47fccf8a2b888416a7c840b4faf176bb813a39595
characters  152
reason      COMPUTED
extractor   v1-pdfjs6.3.289-streamorder-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc
```

The sha and the character count are **stated constants** in the case, cross-checked before they were
written down: 152 characters, prefix `1c008321b45019d2`. They match round 1's and round 2's digests for the
same fixture, which is the check that nothing moved under the CSV arm or the version string.

**THE VACUITY GUARD IS THE POINT, AND IT IS NOT AN mtime.** A process-level test over a stale `dist/`
measures old code and goes green about nothing — a control that proves an instrument RAN rather than that
it SEES, which this repository has paid for by name. So the case imports `CURRENT_EXTRACTOR` from `src/`
through ts-jest and asserts it equals the value the child printed from `dist/`. **A missing `dist/` throws
by name** with the command to run — never a skip, never a pass, because a case that skips when its subject
is absent reports nothing and looks like coverage.

**CI needs no change.** `.github/workflows/tests.yml` **:64–:66** already runs `npm run build` in
`apps/glass-fortress/backend` before `npm test`, and the case's header says it depends on that step. No
`NODE_OPTIONS`, no new jest project, no new npm script, no workflow edit.

## 5. THE RETIRED PASTE, STILL GREEN IN THE ACCEPTANCE SUITE

`test/document/fixtures.ts` declared its own fixture set:

```
export const FIXTURE_KINDS = ['PDF_TEXT', 'SPREADSHEET', 'PASTE', 'SCAN', 'PHOTOGRAPH'] as const;
```

flows :283 retired the paste **as a KIND** on 2026-09-23 (landed `1ab6296`), and `gf-refactor-plan.md` §4
rule 1 is that *"a test asserting a retired concept is deleted in the commit that retires the concept.
Never modified to pass, never skipped, never left red."* That commit was **docs-only** and left these
behind — **green on the superseded five**, which is worse than red: a suite asserting a retired concept and
passing reports that the retirement did not happen.

Deleted, along with the hand-kept `KIND_EXPECTATION` map beside it. **There is now ONE spelling of the
fixture set in the tree** — `test/documentFixtureBytes.ts`, the generator that authors the committed bytes
— and the acceptance suite reads it. A second list of the same four kinds would have been the same defect
one day later, and a hand-kept `computed: true` is a claim about a READER that nothing re-measures.

Three cases in `test/document/content.test.ts` moved with it:

- *"the fixture set is FIVE"* → **four**, equal to the generator's list, with `PASTE` named so a
  reinstatement fails there rather than in a count;
- *"exactly ONE kind is bytes-only … `['PHOTOGRAPH']`"* was **false** under `ocr-none` — two kinds are —
  and it now asks **the reader** over the committed bytes rather than a map;
- *"every kind states what it PROVES"* reads the generator's own sentences.

**The `document` project's failed count did not rise: 132 failed / 81 passed of 213, before and after.**

## 6. THE INSTRUMENTS CAUGHT TWO THINGS IN THIS SEAT'S OWN WORK

Recorded because each is a control working on the person operating it.

- **The `no-unnecessary-condition` ratchet went red** — `documentExtractor.ts: 0 -> 1`. A
  `let anyCell = false` assigned inside `eachSheet`'s callback reads as **always falsy** at the return,
  because TypeScript's control flow does not follow an assignment made in a closure. The type was lying
  about a value that does change. The answer is a boolean **derived from the collected cells**, which
  cannot lie about them — not an annotation to quiet the checker. It also re-confirms round 2's item 3:
  `tsc` does not catch a dead branch, the type-aware lint does.
- **A decoy reddened NOTHING**, and that was the finding. Blinding `readFailed` between `deriveContent`
  and the row broke no case: the seam from `extract()` to the COLUMN was unasserted, so the whole
  distinction could have been removed without a single red. Two cases now hold it, and the decoy fires.

## 7. THE DECOYS

Every new case was observed **RED by name** before it was green, each plant made from a script file against
the real subject, each restored and `cmp`'d byte-identical, control green before and after.

**Round 3 — ten, against the ruling's code.** `CURRENT(d)` back to equality (the trap restored) · the
writer not appending · the writer overwriting the list instead of appending · a new row starting with an
empty list · the reader's throw escaping again · `READ_FAILED` reported as `READ_NOTHING` · an empty
workbook computing the header again · `readFailed` dropped on the way to the row · coverage not counting a
failed read apart · the fourth kind excluded by the wrong axis.

**Round 4 — three, against the process-level test.**

| plant | reddened |
|---|---|
| the child pointed at a `dist/` path that does not exist | **all three cases**, by name — a missing build is loud, never a skip |
| ONE CHARACTER appended in the COMPILED emitted text | the sha case alone |
| `CURRENT_EXTRACTOR` changed in `dist/` ONLY — a **stale build** | the vacuity guard alone, naming both values |

The third is the one the guard exists for, and it prints the disagreement rather than a bare false:
`Expected "v1-pdfjs6.3.289-…"` / `Received "v0-STALE-BUILD-…"`.

**One red-first was taken against today's code before a line was written** — round 3's
`CURRENT(d) reads MEMBERSHIP of derivedUnder › a version a NEW extractor reproduced is CURRENT, not
AWAITING_DERIVATION`. The two pass-side cases could not be: the column did not exist, so the **compiler**
refused them, and they were observed red by plant once the schema landed. A compiler-refused decoy measures
the checker, not the suite.

## 8. WHAT THESE ROUNDS DO NOT CLAIM

- **`extractor-coverage` has still not been run in a deployment.** Every count here comes from its pure
  half or from a child `node`, both on this laptop.
- **The ruling's gate 1 is answered for the laptop only** — three runs per kind, identical. The CI leg and
  the container leg are owed and are not a developer's to take.
- **The derivation pass has never re-derived a real document.** The bucket reader is step 30's; its outage
  arm is proven by injection in a test, and the append is proven against a database double that refuses
  exactly what `@@unique([commitment, contentVersionHash])` refuses.
- **No OCR was evaluated on real material.** Gate 2 is unattempted and is not this step's.
- **The migration has not been applied anywhere.** It deploys itself at the next deploy of a branch
  carrying it.
- **Nothing shipped to production.** `master` is `4a4071a`.

## 9. THE NUMBERS

backend `npm test` **187 suites / 3202 cases / 0 failed** (from round 2's 186 / 3184) · `tsc` **0** · `test:walk` **20 / 470 / 0** ·
frontend **56 / 554 / 0** · `test:document` **15 failed / 4 passed — 132 failed / 81 passed of 213**, red
by design (plan :121) and unchanged across round 4 · **MCP surface 46** (41 + 5) · **migrations 74** ·
`db:check-drift` **exit 2**, and the difference is exactly the two columns §1.1 names.

**Backend eslint: 82 problems across 15 rules — exactly CI's standing line**, and **0 in the files these
rounds wrote or touched.** Reported, never set.

`git diff 06cddf9 -- apps/glass-fortress/backend/test/evidence/` — **0 bytes**.

---

## 10. ROUND 5, 2026-09-23 — THE `text` ARM RETIRED FROM STEP 30'S CONTRACT FILE

`test/document/addDocument.test.ts` is the step-27 acceptance suite — **the contract step 30 builds to** —
and it still specified the `docId | text` argument of the superseded ruling of 2026-09-22. PR
[#573](https://github.com/time4love/OpenJustice/pull/573) retired the paste, but that commit was
**docs-only**, so `gf-refactor-plan.md` §4 **rule 1** — *"a test asserting a retired concept is deleted in
the commit that retires the concept"* — was not honoured.

**§4 rule 4 is what made it dangerous rather than untidy.** The acceptance suite is written first FROM THE
CONTRACT, so a developer opening step 30 and turning this file green would have built the paste arm —
**correctly by the file and wrongly by the researcher's ruling.** The contract as ruled is A4 :1404: *"the
argument is `docId`, REQUIRED … and there is no second arm."*

**TWO CASES DELETED, NOT REWRITTEN**, which is rule 1's own words (*"never modified to pass"*):

- *"a paste arrives as TEXT in the call and needs no dialog (§9 :998)"* — it asserted the retired arm;
- *"BOTH is a refusal — exactly one, and the tool does not choose for the caller"* — it could only exist
  while there were two arms to conflict. With one, there is nothing for a second to conflict with, and
  rewriting it would have been a case invented to fill a gap the ruling closed.

**Kept and re-stated:** *"NEITHER is NO_BYTES"* is now *"a call with NO `docId` is `NO_BYTES` — the
REQUIRED-argument case"*. The code does not move; what it means does. And the content case, which called
the tool with a pasted string and asserted the content came back equal to it, now asserts the two arms A4
:1407–:1408 actually names — the derived version, or `null` while the derivation is owed — over a `docId`.
**Under the ruling a caller cannot hand the platform the text of its own document**: every document is a
bucket object, so the content comes from the extractor reading those bytes and never from the call.

`AddDocumentArgs` loses `text?: string`; the header is rewritten to the 2026-09-23 ruling, keeping the
reasoning that survives it — claude.ai cannot hand a file to an MCP tool, the dialog writes the object, the
tool NAMES it, and `TOO_LARGE` is the object's own size — **now true of every call rather than of one arm
out of two**. `test/document/contract.ts` :196–:205 needed no change and got none: `ADD_DOCUMENT_REFUSALS`
already reads `NO_RESEARCHER · NO_BYTES · NO_TITLE · UNSUPPORTED_TYPE · TOO_LARGE · NOT_SURVEYED ·
NOT_A_DOCUMENT · NAME_MISMATCH`, with nothing `text`-specific.

**THE FILE STAYS RED, BY NAME.** `services/addDocument` does not exist — step 30 builds it — and every
case fails through the loader with *"services/addDocument is not built — document step 30 builds it"*,
never an ENOENT that says nothing about the contract. **No tool was built.**

**The counts, and the prediction on record was exact:** `document` went from **132 failed / 81 passed of
213** to **130 failed / 81 passed of 211**. The failed count fell by exactly the two deleted cases, the
passed count did not move, and **no case turned green** — a case going green here would have meant the edit
asserted less, not that the contract improved.

**The sweep of the rest of the suite.** Every `text:` occurrence elsewhere is a CONTENT VERSION's text
column, not a call argument — `content.test.ts` :89, `citation.test.ts` :60 and :73, `shed.test.ts` :61 and
:69, `fixtures.ts` :142 — and a case about a document's text is not a case about a paste. `identity.test.ts`
:31 says *"a paste with a trailing newline is a DIFFERENT document"* and **is left exactly as it is**: it
quotes §2 :185–:186, which the 2026-09-23 ruling did **not** amend and which still reads that way, and it
asserts a property of `docId` over bytes rather than anything about a door. **Saying NOTHING about the
paste or the argument:** `arrival.test.ts`, `arrivals.test.ts`, `checks.test.ts`, `custody.test.ts`,
`decideOpening.test.ts`, `invariants.test.ts`, `opening.test.ts`, `readDocument.test.ts`, `routes.test.ts`,
`scans.test.ts`, `shedDocument.test.ts`, `standing.test.ts`, `uploadRoute.test.ts`, `built.ts`.

**Two stale COMMENTS in `test/document/fixtures.ts` were corrected as conforming amendments**, each naming
the landed line it now agrees with: the header said *"THE FIVE KINDS OF STEP 29"* — this file's own
leftover, since round 4 deleted the list and left the paragraph describing it — and it called a media
file's transcript *"a paste"*, where :1013 as amended 2026-09-23 makes it a second document **as a PDF**.
Neither is a case and neither moved a count.
