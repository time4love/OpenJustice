# Step 6, the marking page, verified on staging — 2026-09-06

A findings record, never edited. Bears on `docs/gf-refactor-plan.md` §3 step 6; pointed at from
step 6's *Verified on staging* line. What §6 item 3 asks of this step ran on both pages: a STORED
capture opened in the new page from its UrlSnapshot (Flow 3), marked by the researcher, handed back
as a draft, promoted by `approve_article_rules` through the staging connector, and read back three
ways. One defect was found by the exercise and fixed before it could finish; three UX rounds on the
page happened between the first look and the first mark. Nothing here claims more than what ran.
Raw outputs are under the session's handoffs directory (`R23-*-2026-09-06.*`), quoted verbatim below.

**Seats.** The developer session built the step (PR #356, `dc9c4a6`). The reviewer session drove
the connector and the container reads below, one call per approval, and applied the page's UX
rounds and the transaction fix on the researcher's instruction, which the handoffs record as a
crossing of the reviewer's seat. The marking itself — which elements are furniture — was the
researcher's, in the browser, every time.

**What landed on staging during the exercise, in order:**

| PR | merge | what |
|---|---|---|
| #356 | `dc9c4a6` | step 6: `src/walk/routes.ts`, the mount, the order test, the page, Gate 1' on accepted rows only (A4 amended), A6's `url`/`outline`/codes, plan §8's coexistence bullet |
| #357 | `93e1e08` | the page's layout restored from the old page: tabs, fixed heights, the character count, rule ⇄ removed-text focus |
| #358 | `b1510c4` | the page by moment: the canvas, the toolbox drawer, the marked panel, the command as the final state |
| #359 | `eec5418` | the toolbox under the canvas folding to a bar; the canvas at one height; removed blocks clickable |
| #360 | `c5a351f` | `approve_article_rules` creates its rules in one call; every write tool states its transaction window |

## 1 — identify the environment

`get_environment()` →

```json
{"environment":"staging","verdict":"CONFIRMED","warnings":[],"database":{"projectRef":"elws…ae","pinned":true},"chain":{"reachable":true,"chainId":84532,"registryAddress":"0x65b9a7acb45Aa05e7Ed207844F93a2b308373853","registryDeployed":true,"expectedChainId":84532,"matchesEnvironment":true},"corpus":{"trackedUrls":3,"snapshots":112,"snapshotsUnanchored":0,"diffs":109,"diffsSignificant":7,"evidence":9,"evidenceConfirmed":8,"evidencePendingReview":1,"theses":1,"thesesPublished":1,"activeResearchSessions":0}}
```

Staging, CONFIRMED on both axes, before any write. The corpus counts are recognition only.

## 2 — walla: the first stored capture, marked and handed back

The capture the step 4 walk stopped on (Gate 0): `20201209134003`, walla's first stored capture,
ACQUIRED, an old-path row. Opened at the URL the stop response carried,
`…/he/article-rules/38da8d89-7acf-4874-b8c8-43dbff78d229/20201209134003`. The researcher marked
seventeen elements — including, by intent, the author and date lines — and pressed the one button.
The page's final state showed:

```
approve_article_rules url=https://news.walla.co.il/item/3403847 capture=20201209134003
```

The four draft columns, read in the container immediately after (`railway ssh --environment staging
--service glass-fortress-backend`, a `prisma.trackedUrl.findUnique` on the page):

```json
{"url":"https://news.walla.co.il/item/3403847","draftCapture":"20201209134003","draftSelectors":["header.css-14xb3av.no-mobile-app.noprint.only-mobile","header.no-mobile-app.css-gf5unx.main-header","section.shdera.css-1e1t9ty.no-mobile","div.css-2fbkb4","#main-footer","div.css-0 > span:nth-of-type(1)","section.css-12flape > aside:nth-of-type(1)","#xlandingzone","nav.css-yfuuno.breadcrumb.no-mobile-app.noprint","article.common-item > div:nth-of-type(1)","section.css-1234ruv.tags-list.no-mobile-app","footer.css-1oin1li","section.item-main-content > div:nth-of-type(1)","section.css-1tkogwg","section.css-kw6ugw.section-links.undefined","section.css-1t6uvhp.noprint","footer.video-description"],"draftTrusted":[],"draftReturnedAt":"2026-09-05T23:18:45.285Z"}
```

PUT /draft wrote what the page said: 17 selectors, four of them positional, no trust, returned.

## 3 — the approval that rolled back, and the defect it found

`approve_article_rules(url="https://news.walla.co.il/item/3403847", capture="20201209134003")` →

```
Invalid `prisma.rule.create()` invocation:
Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed
transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.
```

Read in the container immediately after: `{"rules":0,"decisions":[],"draftCapture":"20201209134003",
"draftReturnedAt":"2026-09-05T23:18:45.285Z","draftSelectorCount":17}`. **The rollback held** — no
rule, no decision, the draft intact and returned.

**Cause, read from the code.** The handler ran inside `prisma.$transaction(fn)` with no options —
Prisma 5.22's unstated default window is five seconds — and wrote one round trip at a time: the
page, the rules, the log, the row, RULESET_CORRECTED, then SEVENTEEN `tx.rule.create` calls in a
loop, then the closing decisions and the draft clear. Railway to Supabase exhausted the window
mid-loop. The suite mocks Prisma, so no test could see it; §6 item 3 is why this exercise exists.

**Fix (PR #360, `c5a351f`, backend deploy `6f42c646`):** the new rules are created in ONE
`createManyAndReturn`; `WRITE_TRANSACTION` (`maxWait` 10 s, `timeout` 60 s — an A8 operational
parameter) is stated once in `pageLog.ts` and passed by approve, resolve, reset and the survey,
held by a scan with a decoy; `test/walk/scan.ts`'s write verbs see the bulk verb, proven by a decoy
in I9. Each new case was observed red first.

## 4 — walla: the approval, after the fix

The same call →

```json
{"rules":[17 entries, every one {"validFrom":"20201209134003","validTo":null,"trusted":false}, ids cmtp0vfly0003lynrbbk0u583 … cmtp0vfly000jlynrt9sv3gge, selectors as the draft's],
 "changes":{"added":[the same 17],"ended":[],"trusted":[],"extended":[]},"decisionSequence":2}
```

(The full return is `R23-approve-walla-2026-09-06.json` in the handoffs directory.)

## 5 — walla: the three reads of Q4

**(i) the walk.** `scan_captures(url="https://news.walla.co.il/item/3403847", maxCaptures=10)` →

```json
{"walked":2,"outcomes":{"identical":0,"duplicate":0,"acquired":0,"unservable":0,"superseded":1,"restamped":0},
 "stop":{"capture":"20201218044603","gates":[
   {"gate":1,"material":{"against":"PREDECESSOR","nowRemoved":[],"nowKept":["מירב כהן","יום שלישי, 08 בדצמבר 2020, 19:24 עודכן: 22:21","עוד בוואלה! NEWS","• דוח ה-FDA לפני הדיון המכריע: החיסון של פייזר לקורונה בטוח ויעיל מאוד","• בריטית בת 90 קיבלה ראשונה בעולם את החיסון של פייזר לקורונה","• פורסמו נתוני הבטיחות של חיסון פייזר. תופעות הלוואי השכיחות: חום וחולשה","80 אלף אזרחים ביום: קופות החולים נערכות לסבב חיסונים הראשון","לכתבה המלאה"]}},
   {"gate":2,"material":{"rules":[{"ruleId":"cmtp0vfly000elynrf0scsfvs","selector":"footer.css-1oin1li","matchedOnPredecessor":1},{"ruleId":"cmtp0vfly000hlynrtu25tg40","selector":"section.css-kw6ugw.section-links.undefined","matchedOnPredecessor":1},{"ruleId":"cmtp0vfly000ilynrhl5vux23","selector":"section.css-1t6uvhp.noprint","matchedOnPredecessor":1}]}},
   {"gate":4,"material":{"removals":[84 entries — 8 under header.no-mobile-app.css-gf5unx.main-header, 61 under section.css-12flape > aside:nth-of-type(1), 1 under nav.css-yfuuno.breadcrumb.no-mobile-app.noprint, 14 under section.css-1tkogwg]}}],
  "markingUrl":"https://glass-fortress-frontend-staging.up.railway.app/he/article-rules/38da8d89-7acf-4874-b8c8-43dbff78d229/20201218044603"},
 "next":"20201218044603"}
```

Two rows walked: the approved capture, RESOLVED, re-derived under the seventeen rules to a
different text (`superseded` 1, a would-be — this walk writes nothing), then `20201218044603`,
STALE and never accepted, stopped on gates 1, 2 and 4 together. **No gate 1' entry:** the capture
carries no CAPTURE_ACCEPTED, so the A4 amended in PR #356 did not ask the own-text check — the first
observation of that ruling on staging. No gate 5: gates 1–4 fired first.

**The researcher's ruling on Gate 1's material.** The author and date lines were removed by intent
on `20201209134003`; on `20201218044603` the rule that removes them (a positional selector, as the
page's tag warned) no longer reaches them, and they came back into the kept text — the removed →
kept direction Flow 2 calls corpus pollution. The gate stopped on it as designed; the answer there
is CORRECT, marking the element again with a selector that matches it on that date. Gate 2 names
three rules that matched once on the first capture and nothing on the second, walla's CSS class
hashes having moved. Gate 4's 84 unseen removals are 61 headlines under the related-box aside —
the rule trust exists for.

**(ii) the database.** Rule and PageDecision for the page, read in the container
(`R23-walla-rules-log-2026-09-06.json`): 17 Rule rows, every one `validFrom` 20201209134003,
`validTo` null, `createdById` the researcher, `createdByDecisionId` cmtp0vfdu0002lynr6k7heo98 —
the RULESET_CORRECTED at sequence 1; sequence 2 CAPTURE_ACCEPTED on 20201209134003 with `rulesetId`
dd031818; the draft's four columns cleared.

**(iii) the return** (§4) agrees with both.

## 6 — corona: the earliest stored capture

Read in the container: `{"first":{"waybackTimestamp":"20211223211940","status":"ACQUIRED",
"snapshotId":"cmt48yt2s0001leb1uqon0gmk","rulesetId":"e3b0c442","textExtractionVersion":
"v2-inflate-decode-htmltotext-normalised"},"counts":[{"status":"ACQUIRED","n":83},{"status":
"UNCHANGED","n":1},{"status":"UNFETCHED","n":49}],"rules":0,"decisions":0}`. The step 4 stop
(`20220307110948`) is UNFETCHED and holds no bytes until step 5, so — as ruled at the first paste —
corona's exercise opened its earliest STORED capture instead, at the URL markingUrl's rule composes:
`…/he/article-rules/45ce88aa-02a1-4361-be40-977a8e2fb050/20211223211940`.

The researcher marked four elements and handed back; the page showed:

```
approve_article_rules url=https://corona.health.gov.il/vaccine-for-covid/ capture=20211223211940
```

The draft, read in the container: `draftCapture` 20211223211940, selectors
`ul.skipMenu.noPrint.list-unstyled.d-none.d-lg-block`, `#header`, `#footer`, `div.back-top.d-none`
— none positional — no trust, returned 2026-09-06T03:33:14.399Z.

## 7 — corona: the approval and the three reads

`approve_article_rules(url="https://corona.health.gov.il/vaccine-for-covid/", capture="20211223211940")` →

```json
{"rules":[{"ruleId":"cmtp9e0ai000plynrdk0zdure","selector":"ul.skipMenu.noPrint.list-unstyled.d-none.d-lg-block","validFrom":"20211223211940","validTo":null,"trusted":false},{"ruleId":"cmtp9e0ai000qlynrggggtykq","selector":"#header","validFrom":"20211223211940","validTo":null,"trusted":false},{"ruleId":"cmtp9e0ai000rlynrkubj7k9e","selector":"#footer","validFrom":"20211223211940","validTo":null,"trusted":false},{"ruleId":"cmtp9e0ai000slynrhgwfkq79","selector":"div.back-top.d-none","validFrom":"20211223211940","validTo":null,"trusted":false}],"changes":{"added":[the same four],"ended":[],"trusted":[],"extended":[]},"decisionSequence":2}
```

**(i) the walk.** `scan_captures(url="https://corona.health.gov.il/vaccine-for-covid/", maxCaptures=10)` →

```json
{"walked":2,"outcomes":{"identical":0,"duplicate":0,"acquired":0,"unservable":0,"superseded":1,"restamped":0},"stop":{"capture":"20220105113501","gates":[{"gate":1,"material":{"against":"PREDECESSOR","nowRemoved":[{"text":"חיסונים","ruleId":"cmtp9e0ai000qlynrggggtykq"}],"nowKept":["חיסונים"]}},{"gate":4,"material":{"removals":[{"text":"כל הזכויות שמורות למשרד הבריאות © 2022","ruleId":"cmtp9e0ai000rlynrkubj7k9e","selector":"#footer"}]}}],"markingUrl":"https://glass-fortress-frontend-staging.up.railway.app/he/article-rules/45ce88aa-02a1-4361-be40-977a8e2fb050/20220105113501"},"next":"20220105113501"}
```

The approved capture re-derived, then a stop at `20220105113501` on gates 1 and 4. Gate 1 carries
the one-word segment "חיסונים" on BOTH sides at once: A4 compares sides as sets, and a line that is
a nav item inside `#header` and a heading in the body on one capture, and on one side only on the
other, fires both directions. A false alarm of the cheap kind; the answer is CONTINUE. Gate 4: one
unseen removal under the REVIEWED `#footer`, the copyright line with the year turned to 2022 — the
answer is TRUST. Gate 2 quiet (all four rules matched); no gate 1'; no gate 5.

**(ii) the database** (`R23-corona-rules-log-2026-09-06.json`): 4 Rule rows, `validFrom`
20211223211940, `validTo` null, created by the researcher under RULESET_CORRECTED
cmtp9e02e000olynrceycwve7 (sequence 1); CAPTURE_ACCEPTED at sequence 2 with `rulesetId` df48f92e;
the draft cleared. **(iii) the return** agrees.

## What this verifies, and what it does not

- **Verified:** A6's routes serve a stored capture, preview it, and take a draft back; the page's
  one write is the draft; `approve_article_rules` promotes it in one transaction — Rule rows from
  the capture's date, RULESET_CORRECTED, CAPTURE_ACCEPTED, the draft cleared — attributed to the
  researcher; the reporting walk then treats the approved capture as RESOLVED and stops on the
  next stale one with Gates 1, 2 and 4's material; Gate 1' is not asked of a capture nobody
  accepted (A4 as amended).
- **Not exercised:** a stop resolved on a PENDING_JUDGEMENT capture — no such row exists until
  step 5 writes one, so the page's JUDGING moment (a stop panel with the gate's material) and the
  BAD CAPTURE line were not reachable; Gate 5 at a stop; trust ticks (no rule was in force when
  either page was marked); DELETE /draft.
- **Found and fixed:** the transaction window (§3). **Found and ruled:** the page's layout, three
  rounds, and the page's moments (defining · judging · correcting), recorded in the PRs above and
  in the reviewer's handoff; the judging moment's shape is step 5's brief.

## What part 2 opens with

Measurement part 2 — Gates 1, 2 and 4 under rules created by MARKING — begins at walla
`20201218044603` (CORRECT: the author/date element re-marked from that date) and corona
`20220105113501` (CONTINUE on gate 1, TRUST on `#footer`), under Seam 2's two constraints: every
call with `maxCaptures` at least the page's row count (the reporting walk's NEXT_ROW never
advances), `next` observed on every call, and its own dated doc with every count produced that day.
