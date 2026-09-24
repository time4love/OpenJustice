# Document step 30 — the second send REDONE on staging, and the deferral closed

Plan `docs/gf-document-refactor-plan.md` :186–:187 (*the second send of one file answering `existed: true` with one
Document row and two Arrivals*) and its STATUS clause at :189, which deferred the PAGE half to #580 and #578. The
staging exercise and the rulings are `docs/gf-document-step-30-staging-exercise-2026-09-23.md` (§5 :193: *"Then the
second send is redone on the page and the deferral closes"*). The fixes are PR #585 (`e18c2a4` on `staging`, both
deploys SUCCESS). Run 2026-09-24 against staging, the researcher carrying each prompt into claude.ai with the
`gf-staging` connector, the REVIEW seat writing each prompt and checking each return before the next. Written the day
it ran; never edited after.

---

## 1. THE FOUR STEPS, each checked against its return

| step | the act | the return | graded |
|---|---|---|---|
| 1 | `get_environment` · `list_documents({ url: DOI })` | staging · CONFIRMED · chain 84532; the dataset `0x09e6…e267` and the paper `0x2c38…a069`; the `uploadUrl` on the deployed frontend | the exercise's two, exactly |
| 2 | the link with `title=` the dataset's stored title (no `at=`); the SAME XLSX chosen on staging's page | the pill „כבר במחסן · ממתין לפקודה", the command `add_document docId=0xf94b79e8…63b8 …` | read in the browser pane; the docId is an object staging's bucket already held — nothing re-sent |
| 3 | the command pasted | `existed: true` · `content: { contentVersionHash: 0x32c7…33ec }`, NO text · `anchored: false` · `equalsCapture: null` · the stored assertions · `ignored: {}` | every field arrived — the ones F1 had cut (`existed`, `ignored`) among them |
| 4 | `read_document(0x09e6…e267)` | 3 arrivals (2026-09-23T16:58:49Z, 17:11:03Z, 2026-09-24T08:38:07Z) · `current` 0x32c7…33ec · one version with its `textUrl` · `bytesUrl: null` · `textUrl` expiring ten minutes on · `textTruncated: true` · `anchored: false` · `uploadUrl` · `text` LAST | every field before the text arrived |

The claude.ai session called the third arrival "a second arrival" at step 3 — the losing-history pattern of the
exercise's §7 again; step 4's read settled it from the record.

## 2. WHAT THE REVIEW SEAT MEASURED ITSELF

- **The signed link**, fetched from the laptop before it expired: 200 `text/plain; charset=utf-8`, **112,602
  characters**, and `sha256(utf8(text))` = `0x32c727b82d0800f11b57ed329610489f43c0761c7e78d159e08d1f17092f33ec` — the
  version's own `contentVersionHash`. The same path unsigned: **401** (the staging gate; the exemption is the
  signature's alone).
- **Where the cap falls:** the 80,000th character sits inside the Hospitalizations sheet's case 361 — exactly where the
  claude.ai session said its copy of `text` ended. The client received the whole capped text; it did not cut it.
- **The cap against the client:** 80,000 characters of this sheet serialise to **85,822** JSON characters, and they
  arrived. That is now the largest answer text measured to fit (the paper's was 77,240). The LOW recorded at REVIEW's
  grading of #579 — that an 80,000-character sheet might serialise past the client's cap — is RETIRED by this
  measurement.

## 3. HOW THE DEFERRAL CLOSES

**MET:** the second send of one file made ON THE PAGE, the dialog naming the bytes as already stored, the command
answering `existed: true`, one Document row, its arrivals read back — plan :186–:187 in full. Plan :189's STATUS clause
records it, pointing here. Issues #578–#582 close with a link to #585 and to this record.

**STILL OWED, unchanged:** plan :184–:185's four fixture kinds of step 29 through `add_document` on staging, and the
photograph's `text: null` (the exercise's §2).
