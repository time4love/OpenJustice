# Document step 30 — the STAGING EXERCISE, and the step closed on the reduced set

Plan `docs/gf-document-refactor-plan.md` :182 (*the step ENDS AT A PAGE*) and :184–:189 (*Verified by*). The build and
its approval record are `docs/gf-document-step-30-2026-09-23.md`; production's pre-SHIP reads are
`docs/gf-document-production-chain-read-2026-09-23.md`. The exercise RAN on 2026-09-23 against `staging` (`db0507b`
serving), from the GUIDE seat (Fable 5.1), the researcher carrying each prompt into claude.ai with the `gf-staging`
connector: **16 calls, 3 page acts, 2 documents, 1 paid draw.** The guide's full transcript is outside this repository;
this record carries what it proves, graded cold by the REVIEW seat, which re-ran NO part of it (a second
`add_document` is a third arrival, and a second `describe_document` a second charge). Written the day it ran; never
edited after.

---

## 1. THE EXERCISE AS RUN

`get_environment` → staging, CONFIRMED (registry `0xDA3B…4C73`, chain 84532) · `list_documents` empty · the dataset's
title agreed in the conversation · `list_documents({ url: DOI })` → **`NOT_SURVEYED`** · `survey_wayback_captures(DOI)` →
created, **0 captures** · `list_documents({ url })` → a prefilled `uploadUrl`, the model SETting `title=` · **page act 1**:
the real XLSX (178.6 KB) uploaded from the LOCAL dialog (ruling Q-F), the command printed · `add_document` → written, the
answer CUT by the client (F1) · `list_documents` / `read_document` recover what the cut hid · **page act 2**, the second
send → FAILED on the page (F2) · the same command pasted BY HAND → the second arrival · `read_document` → TWO arrivals ·
the paper (PDF, 875.6 KB), title agreed, **page act 3** → command printed · `add_document` → the answer WHOLE ·
`list_documents` → both rows · `read_document` → the whole held shape · the lens shows both · `describe_document(paper)`
on the researcher's word → one opinion, its body CUT (F3) · `read_document` → the cut body stored as returned.

The two documents: the dataset `0x09e64f59692a5a0fc3799270384c0c126d0c10ad45b827e3c600c9a1a6b8e267` (XLSX, 182 852 B) and
the paper `0x2c38c487a1cb20aacc94786def9095c8ff839a0a0c1208b6066d4d38bf10a069` (PDF, 896 621 B), both asserting
`https://doi.org/10.17179/excli2026-9596`. **No chain write was made; both commitments stay OWED** — step 31 pays them.

## 2. THE PLAN'S VERIFICATIONS, GRADED COLD — :184–:189

A report is not evidence: each line is graded against the transcript's CALL and the RETURN FIELD it quotes, and a field
the transcript says was never seen is not inferred.

| verification (plan :184–:189) | grade | the evidence |
|---|---|---|
| the §9 and A4 contract green | **MET** | step 30's owned cases green at LAND (`test:document` 85 red = steps 31–35's, by name); CI green on #576 |
| on staging, **the four fixture kinds of step 29** sent through `add_document` | **OWED** | the exercise sent the real XLSX and the paper (plan :182's two), NOT step 29's four fixtures |
| … each answering `anchored: false` | **MET for the two sent** | the XLSX: `list_documents` row `anchored: false` (call 7; the write's own answer was cut, F1) · the paper: `add_document`'s answer `anchored: false` (call 12) |
| … and the photograph `text: null` | **OWED** | no photograph or scan went through `add_document` on staging |
| `NOT_SURVEYED` refused on an unsurveyed URL | **MET** | call 3: `{ error, code: "NOT_SURVEYED" }` |
| the same bytes accepted after a survey of a page with zero captures | **MET** | call 4: `created: true`, `captures 0` · call 6: `commitment 0x09e6…e267`, `custody HELD` |
| the second send of one file answering `existed: true` | **OWED** | call 9's answer was CUT (F1): `existed` and `ignored` NEVER SEEN, and unrecoverable by any read — they are properties of the answer |
| … with one Document row and two Arrivals | **MET-AT-THE-TOOL** | call 13: one row for the dataset · call 10: `arrivals` = two, first arrival's `assertedAt: null` standing. **The PAGE half OWED:** the dialog cannot send bytes already stored (F2); call 9 was pasted by hand |
| `document-recomputable` exit 0 over them | **MET** | REVIEW, in the staging container: `forensics:audit-documents` → exit 0, *"2 documents examined, 0 malformed"* (the script that answers the predicate A7 :1549–:1552 names) |
| `commitments-owed` exit 2 listing exactly them | **MET** | REVIEW, in the staging container: `forensics:commitments-owed` → exit 2, *"2 documents asked, 2 owed"* — `0x09e6…e267` and `0x2c38…a069`, both `UNREGISTERED`, 0 days — EXACTLY the two |
| (:182) the page shows both uploads on the DOCUMENTS lens | **MET** | §3 |

Both instrument runs: environment agreed by Railway, APP_ENV, the database and the chain; deployment `069e8ec3…` @
`db0507b`; integrity-ledger records written.

## 3. THE LENS, GRADED against board י3 (minus the kind and the count, as ruled)

`http://localhost:3011/he/research/corpus?lens=documents`, signed in, 1440×900. The two rows are `GET
/api/research/documents`'s (200; its body read from the network log), which equal `list_documents({ scope: 'all' })` —
transcript call 13 — field for field.

| board י3 | the dataset | the paper |
|---|---|---|
| date | 23.9.2026 — the RECEIVED day (no `assertedAt`: the second arrival's date was IGNORED, the first's facts stand) | 23.9.2026 — received |
| title | exact | exact |
| page, drawn without scheme | `doi.org/10.17179/excli2026-9596` | the same |
| custody · the owed pill | מוחזק · ממתין לעיגון | מוחזק · ממתין לעיגון |
| heading · footer | „המסמכים שלי" · „מסמך נוסף? בקשו בשיחה את הקישור להעלאה — הדלת אינה בניווט." | |

**Nothing differs from the board.** Recorded, local only: the local backend composes the envelope's `uploadUrl` on its
OWN origin (`http://localhost:3000/he/upload`); deployed staging composes the frontend's (call 2).

## 4. THE FINDINGS — each with the code it lives in

### F1 — the computed text rides INLINE, and a real spreadsheet's text exceeds the client's tool-result cap

`add_document`'s answer (`apps/glass-fortress/backend/src/services/addDocument.ts`, `answerFor`):

```ts
  return {
    commitment,
    docId: key,
    custody: 'HELD',
    content: version === null ? null : { contentVersionHash: version.contentVersionHash, text: version.text },
    anchored: false,
    equalsCapture: await capturesEqualTo(key),
    existed,
    assertions,
    ignored,
  };
```

`read_document`'s HELD shape (`src/services/readDocument.ts`) puts each version's `text` BEFORE its `provenance` and
`opinions`, and the versions before `current`, `bytesUrl`, `anchored`, `equalsCapture` and `uploadUrl`:

```ts
    versions: versions.map((version) => ({
      contentVersionHash: version.contentVersionHash,
      text: version.text,
      provenance: { … },
      opinions: …,
    })),
    current: …, bytesUrl: …, anchored: false, equalsCapture: …, uploadUrl: …,
```

The 178 KB spreadsheet's serialised cells (532-row sheets) exceeded claude.ai's result cap: every field after the text
was lost — on the write `anchored`, `equalsCapture`, `existed`, `assertions`, `ignored`; on the read the version's
provenance and opinions, `current`, `bytesUrl`, `anchored`, `equalsCapture`, `uploadUrl`. A 21-page paper's text layer
fit. **An opinion on a large document would be written and never readable through the connector.**

### F2 — the dialog cannot send bytes already stored, and PLAN :186's page half is unreachable

`src/services/documentBucket.ts`, `mintUploadUrl`:

```ts
  const { data, error } = await client.from(DOCUMENTS_BUCKET).createSignedUploadUrl(key, { upsert: false });
  if (error !== null) throw new Error(`documentBucket: could not sign an upload link for ${key} — ${error.message}`);
```

`src/routes/documentUploadRoutes.ts`, the handler, awaits it with no catch:

```ts
  const minted = await mintUploadUrl(docId);
  if ('absent' in minted) { refuse(res, 503, …'BUCKET_ABSENT'…); return; }
  res.json({ uploadUrl: minted.uploadUrl, expiresAt: minted.expiresAt.toISOString() });
```

DOC_ID is the bytes' hash, so the second send names the object the first wrote; with `upsert: false` storage refuses
to SIGN ("The resource already exists"), the throw becomes Express's bare 500, and the dialog's guard — correctly —
names no state: „ההעלאה נכשלה, ולא נוצרה פקודה. נסו שוב." Flows §9 :998 rules there is no paste, so the second send had
to be composed by hand (call 9).

### F3 — a model answer cut by its output limit was STORED as a valid opinion

`src/services/documentDescriber.ts`, `describe` — no `maxOutputTokens`, no finish reason read:

```ts
  const model = LLMFactory.getChatModel(DESCRIBER_AGENT, { temperature: 0 });
  const chain = model.withStructuredOutput(documentReadingBody, { name: 'document_reading' }) as { … };
  …
  const raw = await chain.invoke([ … ]);
  return { model: resolveModelId(DESCRIBER_AGENT), promptVersion: DOCUMENT_DESCRIPTION_PROMPT_VERSION,
           body: documentReadingBody.parse(raw) };
```

`src/services/documentContentVersions.ts`, the schema it parses against — six OPTIONAL fields:

```ts
export const documentReadingBody = z.object({
  transcription: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  date: z.string().optional(),
  actors: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});
```

The v2 prompt's transcription rule names an image or a scanned PDF and says nothing of a PDF with a text layer, so the
model transcribed 21 pages and hit its limit mid-JSON (the residue `",\n  ` is the next field's start). The lenient
adapter parsed the partial answer and the schema passed it: an OMITTED field and a LOST one are indistinguishable. It is
stored as returned (call 16). One paid draw.

### A LOW

`current` is an object `{ contentVersionHash }` in `read_document` and a string in `list_documents` (calls 14, 13).

### REVIEW's part in all three — each passed this seat's grading

- **F1:** the envelope SHAPES this seat wrote into A4 :1426 put the text before `provenance` and `opinions` — the order
  the code served, which R66's rule warns is what is SERVED, not what is OWED. No grading measured a real document's size
  against the client.
- **F2:** at chunk 3 this seat read the route's claim that a second upload of the same bytes "meets storage's 'already
  exists', which the dialog reads as uploaded" and graded the dialog's 409 path as correct — without measuring whether
  minting itself refuses first. DEV had listed that answer as NOT YET MEASURED. The test world minted any key; the real
  storage does not.
- **F3:** this seat graded `describe_document`'s refusals and the prompt's text, and never read the schema's floor —
  the vacuity rule this repository applies to every count ("a case that asserts a number does not grow is satisfied by
  zero") applied to an object with no required field.

## 5. THE RESEARCHER'S RULINGS — verbatim (2026-09-23, ~17:40Z; confirmed to REVIEW: "rullings are mine")

**F1 — two rulings.**
1. **Text OUT of `add_document`.** A write's answer is the RECEIPT of the act: commitment, docId, custody, the content
   hash, `existed`, `ignored`, `anchored`, `equalsCapture`, the assertions. The content is `read_document`'s. A4 :1407
   drops `text` from `content`.
2. **In `read_document`, text LAST and CAPPED.** A version's provenance and opinions come BEFORE its text; the text is
   the final field of the envelope; capped at an operational parameter measured against the client's result cap,
   with `textTruncated: true` and a signed `textUrl` beside `bytesUrl` for the whole. The cap is set from the
   measurement: a 21-page paper fits, 532-row sheets do not. A4 :1425.

**F2 — rule (ii), NOT upsert.** "Already exists" is a fact the page says, not an error: the route answers
`{ stored: true }` without minting; the dialog skips the upload and prints the command under a NEW status word;
nothing is re-sent. Upsert rejected: it would resend up to 50 MB for nothing and silently repair a wrong object that
`NAME_MISMATCH` exists to report. Riding with it: EVERY storage error the route meets becomes a `code` the dialog
names, never a bare 500, with a test that injects one. The new string, the researcher's proposal:
„כבר במחסן · ממתין לפקודה". Then the second send is redone on the page and the deferral closes.

**F3 — all three, plus the compliance answer.**
- Prompt **v3**: transcription ONLY for an image or a scanned PDF; EMPTY whenever computed text exists (the
  spreadsheet's rule, generalised).
- **Refuse on a cut answer, twice over:** read the provider's finish reason, AND a required terminal sentinel as the
  schema's LAST field, so a truncated body cannot parse. A refusal writes nothing and is not retried.
- **`maxOutputTokens`** set from the prompt's field budget.
- **Names in the description: ALLOWED as the document prints them.** The opinion is gated and never published (§7);
  the computed text beside it carries the same names; a description forced to omit the printed authors describes a
  different document. Forbidden stays what v2 forbids: character, intent, guilt. One rule for the whole opinion —
  `actors` follows the same line.

**The rest.**
- The LOW is a CONFORMING fix: `current` as `{ contentVersionHash } | { awaiting }` in BOTH envelopes (the object form
  is the one that can say "awaiting").
- The compliance notes are the design working as ruled: a held record carries names as the pages say them;
  publication names offices; step 34's opening decision is where a document's public part is decided.
- The dialog not saying the asserted page has zero captures: ONE LINE on the facts card at the next board revision.
  Not a stop.
- The second sign-in gate: the pane's own profile, not a defect; the unlock page's wording is REVIEW's.
- **Step 30 closes on the REDUCED set** with F2's page half deferred in its `STATUS:`; F1's ruling makes `existed:
  true` visible when that send is redone.
- **For the closing doc, its own line:** the model twice attributed the date to the dialog when it rode the link the
  researcher chose — the losing-history pattern; the title living only in the conversation between agreement and
  link is where it bites next.

## 6. THE ISSUES — filed 2026-09-23 on the researcher's word

`#578` (F1, the write) · `#579` (F1, the read) · `#580` (F2) · `#581` (F3) — `p:now`, `gate:document-30` · `#582` (the
LOW, `current`) · `#583` (docs: the zero-captures line) — `p:later`.

## 7. WHERE THE RESEARCHER HELD STATE IN THEIR HEAD — the platform did not

(i) the approved title, from its agreement in the conversation to the link — for both documents · (ii) whether the
dataset's `anchored` was false and its assertions stored as sent, until a second read recovered what F1 hid · (iii)
the second-send command the dialog failed to print, composed by hand · (iv) the paper's approved title · (v) that the
date on the second send was the researcher's.

**The model twice attributed the date to the dialog when it rode the link the researcher chose** (calls 11 and 12:
"the dialog returned a command with `assertedAt` although you gave no day"; "this time the dialog did not add
`assertedAt`"). The date was never the dialog's: it rode `&at=` on the link the researcher opened, and the dialog has no
date field — it draws the link's facts as labels. It is the losing-history pattern of the claude.ai session asserting
state it never saw; **the title living only in the conversation between agreement and link is where it bites next.**

## 8. HOW THE STEP CLOSES

**On the REDUCED set.** MET: the contract green, `NOT_SURVEYED` and the zero-capture survey, `anchored: false` on both
documents, the lens, `document-recomputable` exit 0, `commitments-owed` exit 2 over exactly the two. **DEFERRED:** the
PAGE half of the second send and the answer's own `existed: true` — to `#580` (F2) and `#578` (F1); redone on the page
once they land. **OWED and newly named here:** plan :184–:185's four fixture kinds of step 29 through `add_document` on
staging, and the photograph's `text: null` — not exercised. **Gate:** `gate:document-30` — `#578`–`#581`.

## 9. THE RULINGS AT THE CLOSE — the same day, before this record landed (the researcher: "yes, accept these rullings")

Three questions the REVIEW seat raised while writing §5 into the designs. The researcher adopted the answers below.

**Q1 — where the close is recorded.** The document plan had no `STATUS:` line. The close is a clause appended to the END
of plan :189 (delta 0: a new line would move every cite below it), and the plan's header gains, also at delta 0, the
sentence that makes the convention findable for steps 31–37: a step's state is a bold, dated STATUS clause at the end
of its last *Verified by* line, read with an UNANCHORED `grep -n '\*\*STATUS'` — the anchored form every other plan uses
cannot see an end-of-line clause.

**Q2 — where the text rides in `read_document`.** §5's F1 ruling 2 asks both that a version's provenance and opinions
precede its text and that the text be the envelope's final field. Resolved: a version carries its hash, provenance,
opinions and its OWN `textUrl` — a signed link, nothing more — and no inline text; the envelope ends with `text`,
CURRENT(d)'s, capped, beside `textTruncated` and an envelope-level `textUrl` (the current version's). The per-version
link keeps an older version's text reachable for the researcher reading it beside the current one (flows §3 :348,
:350) without ever riding inline.

**Q3 — the cut answer's refusal.** `INCOMPLETE_ANSWER`, a new spelling: `MALFORMED` is RECOMPUTABLE's word (flows :218)
and `INVALID_BODY` a request's. Its message names the provider's finish reason and says NOTHING WAS WRITTEN — never that
nothing was spent: a truncated draw was charged, unlike a refusal before the call, and the opinion row that records who
paid does not exist for it.

**Written into the designs at delta 0, each citing §5 or this section:** document flows §9 :998 (F2), :1016 (F1 —
§9's own returns block, which governs its appendix), A4 :1409 (F1), :1425–:1426 (F1, Q2, the shape), :1434 (the LOW),
:1439 (F3), :1441 (Q3); ui flows A1 :1129 (F2); the document plan's header and :189 (Q1).
