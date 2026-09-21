# Refactoring the UI — 2026-09-15

**The plan for the fifth design, beside the four.** `docs/gf-refactor-plan.md` §3 is the CORPUS (steps 0–10)
and §3b EVIDENCE (11–16); `docs/gf-thesis-refactor-plan.md` the THESIS (17–26); `docs/gf-document-refactor-plan.md`
the DOCUMENT class (27–37). This plan is the BROWSER, steps UI-1 to UI-10 in their own series, and it runs
BEFORE the document plan — ruled 2026-09-15: the four designs hand rendering to "the frontend", so the
document plan's own frontend steps (its :229–:231, :280–:281, :300–:305) have nothing to land on until this
plan has landed. The target is `docs/gf-ui-flows.md`, whose appendix is the contract every step builds to;
the test rules are the refactor plan's §4, unchanged, and every rule there binds here; the operating model is
its §9. The document plan's seams into this plan are one: its HIDE half (its :342–:344) leaves at UI-10, and its
three doors land after this plan, at its own steps 32, 34 and 35, in the places §2.5 reserves.

---

## 1. THE STRATEGY — BESIDE, NOT THROUGH; THE ROUTES FIRST; ONE CUT-OVER

The same discipline as the three plans before it: every new page is built beside its legacy page, nothing new
imports a retired module, and the legacy pages leave in one step that deletes them with their components and
their tests. Two things make this layer cheaper than the walk's and cheaper than the thesis's. **There is no
data story at all**: the browser writes nothing (§39 :916–:927), so no row is migrated, no page holds state,
and the switch moves no data. **And the layer feeds nothing beneath it**: a wrong page is a wrong page, not a
corpus with holes, and every byte a page shows is a route's body it did not compute (§8 :331–:333). What the
switch risks is a reader's view on staging, where there is no reader.

What is not cheaper is the suite, and here it is worse than the thesis's: **the frontend has no test runner**
(A5 :1053–:1055). Twenty-eight instruments are named and none exists, so the first step is the harness, and
every page step after it writes its instruments before its components, exactly as §4's rule 4 has the
acceptance suite written first. Rule 4's second clause reads the other way here as it did at the switch: a
page is done when its instruments are green, and no page is done before.

Three things order the steps, each the design's:

- **Routes before pages** (A7 :1101–:1104). Every read the browser needs is a tool's answer served as a route
  (§5 :184–:189); the three corpus reads and the two `scope` amendments land first as tools with their
  acceptance cases (UI-2), then every route of §6 and §7 with A5's seven backend instruments green (UI-3),
  and no page lands against a route that is not landed — the thesis plan's own hazard (:331–:332).
- **The layout unlinks before the cut-over deletes** (§32 :818–:819). The nav becomes §32's set at UI-4, so from
  that step every retired page is reachable by URL and by nothing else; `nav-is-the-map` holds it from then on.
- **Two pages replace in place; thirteen leave in one act.** `/theses/[id]` and `/call/[id]` are REBUILT (§3 :147)
  at the URL their legacy file owns, and the router allows one file per URL: they replace at UI-5 under §4's
  2026-09-06 amendment — the old version goes with the code it tested, its successor lands in the step that lands
  the shape — and nothing is lost, because both are dark today (thesis plan :74–:75: their research-act routes
  answer nothing). The thirteen RETIRED pages of §3 and the twenty-five components only they import leave
  together at UI-10, **the one cut-over — ruled 2026-09-15 by the researcher, as A7 :1105–:1107 left to this
  plan**: the 2026-09-08 ruling stands (thesis plan :76–:79; refactor plan :426–:436), its reason unchanged — a
  page hidden three times and then deleted is three edits nobody needs — and the document plan's HIDE half
  (:342–:344) already counts on one act.

What the frontend may assume and may not is §8, and it binds every step: bytes, not views; the one 404; the
notice is 200; labels are the body's; never `/api/mcp` from a page; a filter is a query on one read.

## 2. THE TRANSLATION TABLE — TODAY'S 28 PAGES TO §3'S DISPOSITIONS, ONE ROW EACH

| today | becomes | where ruled | step |
|---|---|---|---|
| `/` (`/api/evidence/latest`, `/api/stats`) | the door: the LATEST published theses, one paragraph, three entries, one entry onward to `/theses` — **amended 2026-09-18: it is the welcome, not the catalogue** | §33; the name leads here (ruled 2026-09-15, the §32 mark) | UI-6 |
| `/theses` (public list) | **THE PUBLISHED LIST — un-retired 2026-09-18.** One row per published thesis, newest first; no search, no filter, no count. The gated half is §29's THESES region under `/research`. | §3 :145 (the un-retirement); §33 :826; A4 :1427 | **UI-7** |
| `/theses/[id]` (TipTap, `/analyze`, gap resolve) | THE THESIS PAGE, T5's order, two voices | §16–§19; T5 :809–:829; A5 :1565 | UI-5 |
| `/theses/[id]/edit` | nothing — the browser is not an editor | §3 :138; thesis A5 :1573; §2 :126–:132 | UI-10 |
| `/theses/[id]/history` | history ON the thesis page; `/theses/[id]/versions/[v]` linkable | §3 :144; T6 :898–:901; A5 :1570 | UI-5 |
| `/call` (list) | nothing — RETIRED, the researcher's mark ruled 2026-09-15 | §3 :145 | UI-10 |
| `/call/[thesisId]` | the appeals alone, two public reads | §20; A5 :1569; A4 :1501 | UI-5 |
| `/evidence`, `/evidence/[id]` | `/corpus` (the CITED lens `?cited=1`) and `/records/[hash]` | §3 :140; evidence A5 :1191–:1193 | UI-7 · UI-10 |
| `/figures`, `/figures/[id]` | nothing | §3 :139; thesis A5 :1579; T2 :472 | UI-10 |
| `/forensics`, `/forensics/[id]` | `/corpus`, `/corpus/claims`, `/research/corpus`; the walk's state from a record | §3 :141; §1 :57–:68; §27 | UI-7 · UI-8 · UI-10 |
| `/submit` | nothing; the intake dialog is the document plan's, after its step 32 | §3 :142; document A5 :1513; plan :342–:346 | UI-10 |
| `/guide`, `/guide/[slug]` (12 pages, `check:guide`) | nothing — the tutorial is in the chat | §3 :143; triage ruling 2 :31–:34 restated as the design's | UI-10 |
| `/about` | rewritten: what it MAY state and may not | §34 | UI-9 |
| `/safety` | the interim page, three lines; the rewrite is the document plan's | §35; document §12 :1171–:1173 | UI-9 |
| `/researchers` | kept; the MCP URL from its own deployment; three sentences re-read | §36 | UI-9 |
| `/article-rules/[id]/[capture]` | untouched — the one dialog | §2.2; interaction A6 | — |
| `/login` · `/auth/callback` · `/oauth/interaction/[uid]` · `/unlock` | untouched; `returnTo` threaded from any gated page's 401 | §37; OAuth plan §5, §7.0b | UI-8 |
| `/profile` · `/admin` | untouched | §37 | — |
| `/reports/new` · `/reports/patterns` | untouched | §40; triage :93 | — |
| — | `/corpus`, `/corpus/claims`, `/pages/[id]/captures/[c]`, `/pages/[id]/diffs/[b]/[a]`, `/records/[hash]` | §24–§28; A1 | UI-7 |
| — | `/research`, `/research/theses/[id]`, `/research/corpus`, `/research/corpus/claims` | §10–§15, §27, §29; A1 | UI-8 |
| the floating chat widget (every page) | nothing | §32 :818; triage :74 | UI-4 unlinked · UI-10 deleted |
| `SiteHeader` per page, `TopNav`'s eight entries | §32's layout on every page: the name, the nav per identity, the locale, the footer, the banner | §32 | UI-4 |
| `GET /api/stats`, `GET /api/forensics/tracked`, `…/trajectories` | RETIRED; `/api/corpus`, `/api/pages/:id/…`, `/api/records/:hash`, `/api/thesis/:id/call`, `/api/research/…` | §6 :269–:273; §6–§7; A4 :1044 | UI-3 |
| `list_findings`, `get_claim_trajectories`, `verify_claim_text` at one page | unchanged; each held equal to `list_corpus`, `list_trajectories`, `search_corpus` at one page | §6.1 :255–:257; A4 :1043 | UI-2 |
| `list_theses({})`, `list_thesis_reviews({})` | + `scope: 'mine' \| 'all'`, default `mine` — today's answer byte for byte | §7.1; A4 :1038–:1039 | UI-2 |

## 3. THE STEPS — EACH LEAVES THE OLD PAGES WHERE THEY ARE; THE TENTH DELETES THEM

Every step names its contract sections, its files by tag (KEEP untouched · REWRITE in the step that lands
the shape, the old version gone with it · RETIRE deleted at UI-10 · NEW), what it lands, and *Verified by:*
with A5's instruments by name. A step closes with a dated findings doc, `docs/gf-ui-step-N-<date>.md`,
named in its `**STATUS:**` line; the plan carries the pointer and never the findings.

### UI-1 · The harness

**Contract:** A5 :1052–:1055 ("the frontend has no test runner today … the plan's first step is the harness —
jest for the components and scans, a browser exercise for the pages — and no instrument below exists until it
does"); §38 `name-never-glass-fortress`; §41 :963–:964 and A5 :1089–:1090 (the browser exercise); refactor plan
§4 :540–:545 (a scan carries a decoy; a scan that matches nothing is vacuity).

**What lands.** A jest project in the frontend workspace and nothing in `src/`:

- `apps/glass-fortress/frontend/jest.config.ts` through `next/jest`'s config helper (it ships with Next 16 and is
  already hoisted at the repo root — no transformer is installed): environment `jsdom`, `test/**/*.test.ts(x)`,
  `test/setup.ts` loading `@testing-library/jest-dom`. Two kinds of instrument and one helper module for each,
  in the shape of the backend's `test/walk/scan.ts` and `test/thesis/scanning.ts`:
  **RENDER SCANS** — `test/render.tsx`: a component or a page rendered under `NextIntlClientProvider` with the
  REAL `messages/<locale>.json` and a fixture body, then a walk over the DOM tree (text nodes, ancestors,
  document order) — what `no-id-as-text`, `opinion-under-label`, `statement-and-disclaimer-first` and
  `bidi-isolated` read; **SOURCE SCANS** — `test/scan.ts`: every file under `src/` and every string value of both
  message files, by path, with the resolved-import helper the walk's scan proved (`retiredNames.test.ts`
  :26–:36) — what `no-write-from-research`, `filter-is-a-query`, `nav-is-the-map` and the name scan read.
  Every scan takes its subject set as a value and FAILS on an empty set — the vacuity guard, not optional.
- **`name-never-glass-fortress`** (§38 :904–:905), the harness's proof it can fail: over every message value and
  every string literal and JSX text in `src/**/*.tsx` (comments excluded — `layout.tsx` :31 and `login/page.tsx`
  :200 name the term in comments, which no reader sees), no value contains "Glass Fortress"; a planted message
  value is the decoy, observed to fail before the case goes green.
- **`messages-parity`**, the plan's own and the harness's second case: `he.json` and `en.json` have equal key sets, so a label
  added in one locale and not the other fails before a reader sees a missing string; a decoy key planted in one file is
  observed to fail it. (Pulled here from UI-10 when §8 named the hazard: six steps edit the messages before the cut-over.)
- `package.json`: `"test": "jest"`, devDependencies `jest`, `jest-environment-jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@types/jest`. The install needs the Wix VPN once on the laptop (refactor plan §9.5);
  CI's `npm ci` reads the lockfile. `tsconfig.json` includes `**/*.ts(x)`, so the test files are TYPE-CHECKED BY
  `next build` — the same property the backend's scripts gained (CLAUDE.md, "compiled, not interpreted") — and
  `npm run lint` already covers them; a test that does not compile fails the deploy, by design.
- `.github/workflows/tests.yml`: a second job, `glass-fortress-frontend` — `npm ci`, then
  `npm run test --workspace=apps/glass-fortress/frontend`; root `package.json` gains `test:gf:frontend`. Making it a
  REQUIRED check on `staging` is a branch-protection edit (memory: `master` has none on purpose), shown to the
  researcher as the `gh api` call before it runs.
- **The browser exercise** is defined in §6 below and lands no file here: a session's browser tools against
  staging at 375 px, the staging cookie set, every state of A2 provoked, the checks read from the DOM (no
  horizontal scroll: `document.documentElement.scrollWidth <= 375`; **after 2026-09-18, NO element of the public read
  reports `position: sticky` after a scroll — the context line is RETIRED, `gf-ui-flows.md` §4 :159**),
  recorded in the step's dated doc — the document plan's precedent (:491–:493). Not Playwright, not CI: an install
  needs the VPN and CI holds no staging cookie.

**Files.** NEW: `jest.config.ts`, `test/setup.ts`, `test/render.tsx`, `test/scan.ts`, `test/nameNeverGlassFortress.test.ts`.
REWRITE: `package.json` (frontend), `.github/workflows/tests.yml`, `package.json` (root). Nothing under `src/`; nothing in
the backend. Fixture bodies land with the page that reads them (UI-5 onward), never here — a fixture nothing
renders is a claim nothing checks.

*Verified by:* `npm test` in the frontend green with the one instrument, from `apps/glass-fortress/frontend` by absolute
path; the decoy observed to FAIL, by case name, before the case is green; the vacuity guard observed to fail on an
empty subject set; `npm run build` and `npm run lint` still green with the test files in the tree; the CI job green on
the PR and required on `staging`; the render helper exercised once against a KEEP component (`StagingBanner`) so the
first page step inherits a helper that has rendered something.

**STATUS:** LANDED 2026-09-15 — PR #481, `staging` `6777a28`; the frontend job required on `staging`. Findings: `docs/gf-ui-step-1-2026-09-15.md`.

### UI-2 · The reads — three corpus tools and two `scope` amendments

**Contract:** §6.1 :226–:257 (`list_corpus`, `list_trajectories`, `search_corpus`, each ONE function with an explicit
`scope`; the per-page reads unchanged and held equal); §28 :746–:753 (the `pages` facet); §7.1 :312–:327 (`scope:
'mine' | 'all'`, default `mine`, on `list_theses` and `list_thesis_reviews`); A4 :1038–:1040 and :1043 (the
amendments, already applied at thesis A4 :1426, :1523 and evidence A4 :1074); evidence A4 :1074–:1077 ("the output
never depends on who asks"; a read whose scope followed identity would be a second behaviour); §31 :797–:798
(`pages-facet-equals-scope` "held on the read, not the page"); §9 :348–:349 (`one-page-is-the-corpus-at-one-page`).
Backend only; no route yet (that is UI-3); no migration — every read is over tables the corpus and thesis layers
already hold.

**What lands.**

- **Three tools in the MCP surface**, registered in `mcpServer.ts` and classified in `mcpRoutes.ts` as `list_findings`
  and `list_theses` are — READ_TOOLS, the bearer resolved by `identifyViewer` when present (`mcpRoutes.ts` :50–:55,
  :69–:72 — "access, not a second behaviour"): `scope: 'public'` takes no identity and answers over PUBLIC_PAGE pages
  (evidence A3 :1051); `scope: 'all'` refuses `NO_RESEARCHER` without one and answers over every surveyed page. The
  chat may pass either; a route fixes one (UI-3).
  - `list_corpus({ scope, since?, until?, page?, kind?, cited?, cursor?, limit? })` → `{ entries, pages, nextCursor }`:
    every entry `list_findings`' capture row or diff row (A4 :1081–:1090) with `page: { trackedUrlId, url }`, in
    TIMESTAMP order across pages and no other; `cited` keeps `evidence ≠ null`; the `pages` facet of §28 computed
    with the read — at `public` exactly the opened pages, at `all` every surveyed page — `[{ trackedUrlId, url, first,
    last, entries }]`. Refuses `INVALID_RANGE` · `NOT_SURVEYED` · `NOT_PUBLIC` (a named page not PUBLIC_PAGE, at
    `public`) · `NO_RESEARCHER`; UI-3 folds the two 404 refusals into one body, as §6's table says — the tool keeps
    the names, the route hides them.
  - `list_trajectories({ scope, since?, until?, page?, cursor?, limit? })` → `get_claim_trajectories`' rows (A4 :1103)
    across pages, each with its page, ordered by the date the claim LEFT, latest first. Refuses as `list_corpus`.
  - `search_corpus({ scope, phrase, since?, until?, page? })` → `verify_claim_text`'s verdict per capture (A4 :1101)
    across pages, each with its page; `PHRASE_REQUIRED` for a blank phrase; no index (§6.1 :251).
  - `cursor` is the read's own, opaque; `limit`'s default is ONE constant in `corpusReads.ts`, an operational parameter
    (A6 :1095), named in the step's dated doc and never argued in the plan.
- **One loader, three callers, no second query.** The three are extensions of `services/corpusReads.ts` — the module
  that already exists so that "four tools cannot each grow their own idea of what a page's timeline is" (its header)
  — over its `loadCaptures`, `loadDiffs`, `loadEvidenceLinkage`, `opinionOf`, `chunksOf`; the trajectory read over
  `services/claimTrajectory.ts`' stored rows; the search over `services/archiveVerification.ts`' one verdict rule.
  `list_findings`, `get_claim_trajectories` and `verify_claim_text` are UNCHANGED (A4 :1043): each is the corpus read
  at one page, and the acceptance suite holds it by calling both on the same page and asserting equal rows.
- **`scope` on the two thesis lists** (§7.1): `list_theses({})` and `list_thesis_reviews({})` answer today's bytes; `all`
  on `list_theses` adds every researcher's theses in the researcher shape plus `author` (handle) and `mine: bool`; `all` on
  `list_thesis_reviews` answers REVIEWS over every thesis, each entry with its author, `owed` counting all, each
  command still writing only as the author (`NOT_AUTHOR`, thesis A7 :1685). `services/thesisReviews.ts`'
  `listThesisReviews(researcherId)` gains the scope; `mcp/tools/listTheses.ts` and `listThesisReviews.ts` pass it.
  `list_framings`, `list_pages`, `get_thesis_context` change nothing (§7.1 :326–:327).
- **One field the read view needs, ruled 2026-09-15 (Q9):** the entry's `page` and the facet's row each gain `public: bool` —
  the field `list_findings`' page row already carries (A4 :1081) — so `/research/corpus` can mark a row of a page not yet
  opened (§27 :734) without a second read. At `public` it is always true and reveals nothing. An amendment to §6.1 :237–:238
  and §28 :750, recorded in the design when this plan lands.
- **The surface says so.** `src/mcp/instructions.ts`' READING paragraph names the three reads and WHEN (the corpus
  across pages, dated, versus one page by URL — §1 :57–:61), the step-19 rule that the surface says when; `list_theses`'
  sentence gains `scope`. `mcpToolClassification`'s list moves 42 → 45, each name beside its §6.1 line (thesis plan :251–:254).

**Files.** NEW: `src/mcp/tools/listCorpus.ts`, `listTrajectories.ts`, `searchCorpus.ts`; `test/evidence/corpusReads.test.ts`
(the acceptance cases of §6.1 and §28, written FIRST from the appendix and red by name until the modules exist — rule 4,
the `evidence` project's shape); `test/thesis/scope.test.ts` (the `all` case per tool and the byte-for-byte default case,
beside `reads.test.ts` — ruled 2026-09-15 under rules 2 and 3). REWRITE: `services/corpusReads.ts`, `services/thesisReviews.ts`,
`mcp/tools/listTheses.ts`, `mcp/tools/listThesisReviews.ts`, `mcp/mcpServer.ts`, `mcp/mcpRoutes.ts`, `mcp/instructions.ts`,
`test/mcpToolClassification.test.ts` (its list, as thesis plan :285 tags it). KEEP, `git diff` empty: `mcp/tools/listFindings.ts`,
`getClaimTrajectories.ts`, `verifyClaimText.ts`, `services/evidencePredicates.ts`, `test/thesis/reads.test.ts`,
`test/thesis/publicReads.test.ts`, every existing file of `test/evidence/` and `test/walk/`.

*Verified by:* the two new acceptance files green, each case observed red by name first; `one-page-is-the-corpus-at-one-page`
green — `list_findings(url)` equals `list_corpus({ page: url })`'s rows, the same for trajectories and search — with a decoy
second query on either side caught; `pages-facet-equals-scope` green at `public` (= PUBLIC_PAGE's set) and at `all` (=
`list_pages`' set), with a decoy page planted in the facet caught; `reads.test.ts` :159 and :400 green and unedited;
`transactionWindow` and `mcpToolClassification` green at 45; `npm test` green from `apps/glass-fortress/backend`. On staging,
through the connector, UNSTEERED and predicted on record: `list_corpus({ scope: 'public' })` answers the entries of the pages run B
opened (`docs/gf-thesis-run-b-2026-09-15.md`) in timestamp order and its `pages` facet names exactly those pages;
`list_corpus({ scope: 'all' })` from an anonymous connector refuses `NO_RESEARCHER`; `list_theses({})` answers byte-for-byte
what it answered before the deploy (the read taken and kept before `LAND`); `list_theses({ scope: 'all' })` marks the
researcher's own `mine: true`. Nothing written, nothing paid, no chain call.

**STATUS:** LANDED 2026-09-15 — PR #484, `staging` `625685e`; the surface 45; the staging reads predicted and scored.
Findings: `docs/gf-ui-step-2-2026-09-15.md` (the `limit` default, the reads, the surface count).

### UI-3 · The routes — twelve public, fourteen gated, one mount

**Contract:** §5 :184–:197 (a route IS a tool's answer: one function, no second query, shape or refusal set); §6 :199–:276
(the public routes, the status table, the retirements, "no route is paid"); §7 :278–:310 (the gated routes, the one
mount-level gate, 401 and 403 FIRST with one body each, a 404 inside the prefix may say which); §6 :221–:224 (routes name
a page by `trackedUrlId`, tools by `url`; "the one function takes the page's row"; `pages` on the thesis body gains the id);
A2 :1141–:1156 (recomputed 2026-09-19; read :1004–:1014) (the states a route must answer); A4 :1041, :1044 (thesis A5 :1565 amended; `GET /api/forensics/*` and
`GET /api/stats` RETIRED); A5 :1058–:1064 (the five instruments left to this step); interaction A6 :1229 as amended
(`/api/article-rules` stays the marking page's only surface). Backend only; no migration.

**What lands.**

- **One adapter, one status table, every route through it.** A route module (`src/routes/toolRoute.ts`, the name the
  step's) that takes a tool's core and the route's parameter reading, calls the core, and maps its `{ error, code }`
  onto HTTP by ONE table — §6's: 404 with the one body `{ error: 'Not found' }` for `NOT_SURVEYED` · `NOT_PUBLIC` ·
  `NOT_A_RECORD` · `NOT_A_CAPTURE` · `NO_SUCH_DIFF` · a thesis never published; 409 `{ error, code }` for
  `AWAITING_DERIVATION`; 503 for `CHAIN_UNAVAILABLE`; 400 for `INVALID_RANGE` · `PHRASE_REQUIRED` · `INVALID_OUTCOME` ·
  a malformed parameter (the schema's refusal, interaction A6 :1260's shape); 200 for everything else, `{ live: false }`
  included (§6 :205–:206). Inside `/api/research` the same table with one difference: the 404 keeps its code (§7 :308–:310).
  A router that composes a status itself is the second spelling §5 forbids; the `route-is-tool` decoy is exactly that.
- **The one function takes the page's row** (§6 :221–:223). Every per-page tool today resolves `url` inside its handler
  (`listFindingsHandler` :98–:104; `getArticleRulesHandler` :50–:53). Each is split, contract unchanged: a CORE over
  `Page` (the row `corpusReads.loadPage` returns), and the handler that resolves `url` to it and calls the core; the
  route resolves `trackedUrlId` to the same row (`loadPageById`, one new function in `corpusReads.ts`) and calls the
  same core, so `NOT_SURVEYED` is one refusal from either door and no row is loaded twice. The acceptance cases of each
  tool stay green and unedited — the split moves no behaviour, and `git diff` on the acceptance suites is the proof.
- **The twelve public routes of §6**, no identity read — no `identifyResearcher`, no bearer, exactly as
  `publicThesisRoutes.ts` :7–:9 already refuses to: `GET /api/thesis/:id/call` (`get_whistleblower_call`, added to the
  existing router); `/api/corpus`, `/api/corpus/claims`, `/api/corpus/search` (UI-2's three at `scope: 'public'`, fixed by
  the route, never by the caller); `/api/pages/:trackedUrlId/findings` · `/diffs/:before/:after` ·
  `/trajectories` · `/captures/:capture/chain`; `/api/records/:fileHash`. All below `requireStagingAccess` and under
  `generalLimiter` as `/api/*` already is (§6 :275–:276); no `aiCostLimiter`, because no route is paid. The thesis body's
  `pages` gains `trackedUrlId` beside `url` in `services/publishedThesis.ts` (A4 :1041) — the one field the browser needs
  to compose `/corpus?page=`.
- **The fourteen gated routes of §7** under ONE mount: `app.use('/api/research', requireResearcher, researchRouter)` —
  `requireResearcher` unchanged (`researcherIdentity.ts` :68–:93: 401 without a valid session, 403 without an APPROVED
  row, approval re-checked every request, the same `Researcher` row the MCP resolver reads). No handler under the prefix
  reads a caller id to filter: `scope` is fixed to `all` by the route, `mine` is the page's own switch (§7.1 :325).
  `reviews`, `evidence-reviews`, `theses`, `theses/:id?since=`, `framings`, `framings/:id`, `debates/:sessionId`,
  `corpus`, `corpus/claims`, `corpus/search`, `pages`, `pages/:id/captures?outcome=`, `pages/:id/rules`,
  `pages/:id/rules/:ruleId/history`. The document plan's three (`get_arrivals`, `list_documents`, `read_document`) are
  RESERVED and not mounted (§7 :304).
- **Retired, in this step** (§6 :269–:273; A4 :1044): `/api/forensics` unmounted and `routes/forensicsRoutes.ts` deleted —
  it lists every surveyed page to anyone and serves trajectories with no PUBLIC_PAGE gate; the `/api/stats` handler
  removed from `server.ts` (:181–:195) — it counts drafts and serves the number anonymously. `retiredNames` gains both
  sentences, as at 11a: a route is a sentence a live surface says, and no file under `src` may say either again.

**Files.** NEW: `src/routes/toolRoute.ts`, `src/routes/corpusRoutes.ts` (`/api/corpus`, `/api/pages`, `/api/records` — three
routers or one, the step's), `src/routes/researchRoutes.ts`; `test/routeIsTool.test.ts` (the five instruments below, in the
shape of `test/publicThesisRoutes.test.ts`: express + supertest over the mounted routers, the evidence double, the LLM
tripwire), `test/corpusRoutes.test.ts`, `test/researchRoutes.test.ts` (every route's statuses per A2 and §6's table).
REWRITE: `src/server.ts` (the mounts; the stats block gone), `src/routes/publicThesisRoutes.ts` (`/:id/call`),
`src/services/publishedThesis.ts` (`trackedUrlId`), `src/services/corpusReads.ts` (`loadPageById`), the per-page tool
modules split into core + handler — `mcp/tools/listFindings.ts`, `getDiffInput.ts`, `verifyClaimText.ts`,
`getClaimTrajectories.ts`, `checkOnChainStatus.ts`, `walk/tools/listCaptures.ts`, `getArticleRules.ts`, `getRuleHistory.ts`
(each tool's contract unchanged; its acceptance cases unedited); `test/publicThesisRoutes.test.ts` (:192 `pages` to the
amended A5 :1569; the call route); `test/walk/retiredNames.test.ts` (extended). RETIRE now: `src/routes/forensicsRoutes.ts`.
KEEP, `git diff` empty: `middleware/researcherIdentity.ts`, `middleware/stagingAccess.ts`, `walk/routes.ts`, `lib/publicRoutes.ts`,
`mcp/mcpRoutes.ts`, every acceptance file of `test/walk/`, `test/evidence/`, `test/thesis/` (the `pages` shape is asserted by
no acceptance case — checked 2026-09-15; `publicReads.test.ts` stays green unedited).

*Verified by:* the five instruments green, each observed to fail first — `route-is-tool` (every route of §6 and §7 called
beside its tool with the same input, bodies byte-equal; a decoy route with its own query caught), `public-identical`
(every §6 route byte-identical with and without a session; the three 404s — a draft, a missing id, a private page —
byte-identical), `no-model-prose-public` (thesis A7 :1688's shape test over every §6 body: no field of an analysis, an
assessment or an objection; `opinion` on a diff the one allowed field; a planted analysis field caught), `gate-by-prefix`
(a source scan: every router mounted under `/api/research` sits behind `requireResearcher` at the mount and no handler
there reads a caller id; a decoy handler filtering by `req.researcherId` caught), `no-surveyed-page-anonymous` (by scan
and by call: no public route lists `TrackedUrl` rows, and `scope: 'all'` without identity is refused on every route and
tool that takes it); every acceptance suite green and unedited; `retiredNames` green with its two new sentences and its
decoy; `npm test` green from `apps/glass-fortress/backend`. On staging, by `curl` against the deployed service with the
staging header and no bearer, predicted on record: `GET /api/corpus` = `list_corpus({ scope: 'public' })`'s body from the
connector, byte for byte; `GET /api/research/theses` 401 with no bearer, and with the researcher's Supabase bearer the
`all` list naming their own `mine: true`; `GET /api/forensics/tracked` 404; `GET /api/stats` 404; `GET /api/thesis/<run B's
id>/call` 200; `GET /api/thesis/<a made-up id>` and `…/<the draft's id, if any>` the same bytes. Nothing written, nothing
paid, no chain call but the one the reader's own `…/chain` route makes when called.

**STATUS:** LANDED 2026-09-15 — PR #488, `staging` `43c417a`; twelve public routes (#487 ruled GATED), the surface 45; the
staging reads predicted and scored. Findings: `docs/gf-ui-step-3-2026-09-15.md`.

### UI-4 · The layout — what every page carries, and nothing more

**Contract:** §32 :802–:823 (the name, the nav per identity in its order, the locale control, the footer, the banner; RETIRED:
the chat widget, the mission statistics, every nav entry to a retired page; robots as today; share metadata composed from
the body and naming no person); §4 :152–:161 (mobile first: on a phone the nav is a sheet from one control); §38 :906–:907
(`nav-is-the-map`), :904–:905 (`name-never-glass-fortress`); §39 :922 (the locale is a per-viewer convenience, the browser's,
never the backend's); §40 :938–:940 (the copy is the researcher's; where the name leads was ruled 2026-09-15: this site's `/`);
A3 :1019–:1025 (the three identities: anonymous · researcher · admin); COMPLIANCE.md :92 (the disclaimer on every thesis and
call page — each page repeats its short form last, never the footer). Frontend only; the first change under `src/`.

**What lands.**

- **The chrome is the LAYOUT's, not each page's.** Today `SiteHeader` is imported by fifteen pages and the layout mounts only
  the footer, the widget, the banner and the debug console (`[locale]/layout.tsx` :23–:31). §32 is "what every page carries",
  and the mechanism that makes every page carry it is the one file every page renders through: `[locale]/layout.tsx`
  mounts the header, the nav, the locale control, the footer and the banner, and no page imports a header again. The
  fifteen page-level `<SiteHeader …>` imports go in this step, one line each — ten of them in pages RETIRED at UI-10, five
  in pages this plan rewrites later (`about`, `safety`, `researchers`, `theses/[id]`, `call/[thesisId]`) — because the
  alternative, a live public page rendering two headers until its own step, is a visible defect on staging for six steps,
  which is the "just fix that page" class the 2026-09-08 ruling exists to prevent, arriving from the other side. Their
  content is untouched; the reports pages (`reports/new` :1449, `reports/patterns` :334) lose the same one line, and their
  content stays the reports plan's.
- **The header** (§32 :805–:807): "צדק לעם - תיק הקורונה" and the dove (`teder-dove.png`, `icon_dove.png` as today) at the top
  of every page, leading to `/`; never "Glass Fortress" in anything a reader sees.
- **The nav** (§32 :808–:811), rendered from ONE list keyed by identity, read from `AuthContext` (the profile carries
  `approved` and `role: 'RESEARCHER' | 'ADMIN'`, `AuthContext.tsx` :23–:24): anonymous — הבית · הארכיון (`/corpus`) · אודות ·
  לחוקרים (`/researchers`); הגנה (`/safety`) joins WHEN LIVE, which is the document plan's flag, not this step's — until
  then `/safety` is out of the nav and reachable by URL (§35 :880); a signed-in approved researcher gains מחקר (`/research`)
  and their handle → `/profile`; an admin gains `/admin`. Nothing else: not a dialog, not a lens, not a retired page, not the
  GitHub link `TopNav.tsx` :174 carries today (the open-source link is the footer's, :814). The entries to `/corpus` and
  `/research` are in the nav from this step although their pages land at UI-7 and UI-8 — a nav entry to a page not yet
  built is a 404 on staging for two or three steps, and that is the design's order (A7: routes, layout, then the pages); the
  step's dated doc records it, and the alternative — a nav that grows page by page — is `nav-is-the-map` failing by design
  three times. On a phone the nav is a sheet from one control (§4 :154–:161); at width it is a row.
- **The locale control** (§32 :812): he default, en beside it, one control, the same path under the other prefix through
  `i18n/navigation`'s `Link` and `routing.ts` — unchanged modules. The choice lives in the URL and nowhere on the server (§39).
- **The footer** (§32 :813–:815): the open-source link, nothing that names a person — and no disclaimer (ruled 2026-09-15):
  the short form is each thesis, call and door page's own LAST element (§17.8, §20.6, §33.5; UI-5, UI-6), its words the
  researcher's at UI-5. The full disclaimer stays each page's own first element (UI-5); the footer carries neither form.
- **The banner** (§32 :816–:817): `StagingBanner` as today, staging only. **The staging debug console is not in §32's list**
  and §32 is "nothing more": `StagingDebugConsole` and `DebugConsolePanel` are unmounted here and RETIRED at UI-10 — the
  instrument was built for phone-side debugging of the legacy pages, and the browser exercise of §6 reads the DOM directly.
- **Unlinked, not deleted** (§1; the translation table): `FloatingChatWidget` leaves the layout; its file leaves at UI-10.
- **The root metadata** (`app/layout.tsx` :33–:35): the description "AI-powered legal evidence discovery & accountability
  platform for the Covid-19 class-action lawsuit" is a fixed string on every page and states what §34 :863–:864 says a page
  may not (AI as a ranker of evidence; a suit no design names). It becomes the name and one sentence, the researcher's,
  drafted for approval with the footer's; each page's own share metadata is that page's step (§32 :822–:823). `robots.ts`
  unchanged.
- **`globals.css`**: the mobile-first base §4 needs — one column, the reading measure and the sheet primitive
  every page step reuses; no page-specific style.

**Files.** REWRITE: `app/layout.tsx` (metadata), `app/[locale]/layout.tsx`, `globals.css`, `components/SiteHeader.tsx`,
`components/TopNav.tsx`, `components/SiteFooter.tsx` (the three become §32's chrome under names the step chooses; a page
importing any of them is a scan failure from this step), `messages/he.json` and `en.json` (`common.nav` to §32's six entries, the
footer's strings; nothing else), the fifteen pages' header import lines (`page.tsx`, `guide`, `guide/[slug]`, `researchers`,
`evidence`, `evidence/[id]`, `theses`, `theses/[id]`, `about`, `forensics`, `forensics/[trackedUrlId]`, `safety`, `call`, `figures`,
`reports/patterns`, `reports/new`). NEW: `test/navIsTheMap.test.tsx`. UNLINKED (RETIRE at UI-10): `FloatingChatWidget.tsx`,
`StagingDebugConsole.tsx`, `DebugConsolePanel.tsx`, `lib/debugCapture.ts`. KEEP, `git diff` empty: `StagingBanner.tsx`,
`ClientProviders.tsx`, `context/AuthContext.tsx`, `i18n/*`, `proxy.ts`, `app/robots.ts`, `lib/appEnv.ts`, `lib/stagingApiAuth.ts`.
Nothing in the backend.

*Verified by:* `nav-is-the-map` green — the chrome rendered under each of the three identities through the `AuthContext`
double, the anchor set equal to §32's per identity, `/safety` absent until the flag; a decoy entry to `/evidence` observed to
fail it first; a source scan in the same file that no file under `src/app` imports the header, with a decoy page that does;
`name-never-glass-fortress` re-run green; `npm test`, `npm run build` (the guide gate still runs; it goes at UI-10) and `npm run
lint` green from `apps/glass-fortress/frontend`; the first browser exercise of §6 on staging at 375 px, in the dated doc:
the nav sheet from one control, the locale switch keeping the path, the banner, the footer on `/about` (a live page), no
horizontal scroll; and every legacy page still served with one header (`/about`, `/researchers`, `/reports/new` read).

**STATUS:** LANDED 2026-09-15 — PRs #490, #491, #492, `staging` `8b3e5c5`; the approved copy, the exercise scored, two entries 404 **AMENDED 2026-09-16:** the chrome becomes the three-pane shell, a step of its own before the re-briefed UI-5 — docs/gf-ui-design-session-2026-09-16.md §4. It is **UI-4b, §9**; the re-briefs are §10.
until UI-7 and UI-8. Findings: `docs/gf-ui-step-4-2026-09-15.md`.

### UI-5 · The public thesis page, the call page, the version page

**Contract:** §16–§23 :507–:649 (what the page is; §17's eight regions in T5's order; the sheets; the notice, the 404 and
the version page; the call page; what the public pages never have; the six instruments); §4 :167–:178 (no hash and no id as
text; the COPY control and the VERIFY disclosure); §8 :329–:342; A1 :976–:979; A2 :1141–:1156 (recomputed 2026-09-19; read :1004–:1014); thesis T5 :809–:829 and
A5 :1565–:1570 as amended (the bodies); T6 :898–:901 (the history's diff, the frontend's one computation) and :915–:918
(the notice); COMPLIANCE.md :82–:99 (rule 5's statement; the disclaimer verbatim in both languages); document plan
:506–:509 (the intake-down window — no door drawn); thesis plan :327 (the DoD line this step closes) and :331–:332 (the
hazard: a page against a route not landed — UI-3 is landed). Frontend, and one backend field (`provisionTitle`, ruled 2026-09-16); the routes are UI-3's.

**What lands.**

- **`/theses/[id]` rebuilt in place** — the legacy file goes with this commit under §4's 2026-09-06 amendment (it reads TipTap
  and calls four retired routes; thesis plan :74–:75). One read, `GET /api/thesis/:id`; nothing fetched twice; nothing
  derived but the text diff (§16 :513–:515). §17 top to bottom: (1) the public-interest STATEMENT and the DISCLAIMER
  verbatim, first; (2) the CLAIM as the heading, the provision by its table entry, the handle, the date, a COPY of
  `thesis <id>`; (3) the TEXT as long-form Markdown with every citation token a CHIP where it stands, resolved from the
  body's mentions, carrying its marks; (4) the APPEALS as item cards, the intake line as the body's own text with NO anchor
  (plan :506–:509); (5) the CASE — the rationale, and "over the assessor's objection" / "an analysis was run" as facts;
  (6) HISTORY, newest first, "what changed" opening the DIFF, a withdrawal between the versions it separates; (7) THE PAGES,
  one link per cited page to `/corpus?page=<trackedUrlId>` under the one sentence naming the counterweight; (8) LAST — the
  short disclaimer and the VERIFY disclosure, closed. **The sticky context line is RETIRED 2026-09-18 (§17 :531 as
  amended; `gf-ui-flows.md` §4 :159) — this line asked for it and no longer does.**
- **Two voices, two components** (§16 :517–:521): THE RESEARCHER'S (an act and its words, plain, first) and THE PLATFORM'S
  (a mark beside what it judges: VERIFIED, FLAGGED, argued, over objection). The third, the labelled opinion container, is
  NOT built here and no public page may import it when it exists (UI-7 builds it; `no-model-voice-public` holds the import).
- **The sheets** (§18): the CITATION sheet over an `#ev_` chip (the record, the pinned content as a capture's text or a diff's
  two stacked registers, VERIFIED per capture, the FLAG with its reason, the facts, one link onward to `/pages/…` and
  `/records/…`); the TRAJECTORY sheet over `#tr_`; the DOCUMENT sheet over `#doc_` RESERVED — a chip kind the renderer knows
  and renders as nothing until the document plan's step 34; the DIFF between two published versions, inline at phone width,
  side by side when wide, "every citation whose pin moved" beneath it.
- **The one computation** (T6 :900): `lib/textDiff.ts`, a pure function over exactly two texts, born here and reused by UI-8
  for any two versions of the chain; `diff-is-of-two-texts` holds its arity and its output on a fixture.
- **The COPY control and the VERIFY disclosure** (§4 :170–:176): `CopyableCode` becomes the COPY control — labelled by what
  the value is FOR, never by what it is — and a VERIFY disclosure, closed by default (A6), holds the version hash and each
  cited record's hashes with copy and one line on how to check. From this step `no-id-as-text` scans every page fixture:
  no 64-hex, cuid or 14-digit timestamp as a text node outside those two homes.
- **`/call/[id]`** (§20): two reads, `GET /api/thesis/:id` for the statement, the disclaimer's place, the claim and the
  provision, `GET /api/thesis/:id/call` for THE_CALL and THE_REQUESTS; six regions in §20's order; `{ live: false }` is a page
  saying no appeal is open, with the link to the thesis; share metadata = the statement and the claim, never a call item.
  `CallPageClient.tsx` is folded into the page.
- **`/theses/[id]/versions/[v]`** (§19): §17's shape with the banner first — "a previous published version; the current one is
  here" — and the NOTICE, never the text, while the thesis is withdrawn or for a version a Withdrawal names.
- **The states** (A2; §19; §21): loading as a skeleton in the page's own order; 404 ONE sentence for a draft, a missing id
  and a never-published thesis alike; WITHDRAWN (200) the disclaimer and "withdrawn by its author on <date>" and nothing
  else — no text, no reason, no claim, no link; no person's name in anything the page adds; no client-side re-verification.
- **The door flag** (§17 :546–:548; §23 :644–:645): ONE constant in `lib/doors.ts`, `false`, read by the intake line here and by
  the nav's `/safety` entry (UI-4 — its read moves here from a literal); the document plan's step 32 sets it, and nothing
  else does. `no-door-before-it-exists` scans every public page for an anchor to an intake or withdrawal URL while it is false.
- **Identity: none.** The public pages send no bearer — `fetchJson` without `authHeaders()` — because the route reads none
  (UI-3) and a page that sent one would be asking for a second behaviour that does not exist (A3 :1021 byte-identical).
  `lib/api.ts`'s comment at :24–:28 ("thesis reads are viewer-dependent") is false since thesis step 23 and is corrected here.
- **Bidi**: every URL, date and hash inside Hebrew text inside an isolating element (§17 :533–:534; `bidi-isolated`).
- **Copy.** Every label the `theses` and `call` namespaces carry is drafted from the design's sentences and approved by the
  researcher before it lands (ruled 2026-09-15); the disclaimer is COMPLIANCE.md's verbatim, in both languages, not copy.
- **Rendering runtime.** Whether the public pages render on the server or the client is the step's, under two constraints
  the design fixes: the share metadata is composed from the body (§32 :822–:823), and the loading order is A2's. One
  Markdown renderer, chosen at the step and recorded in the dated doc; never TipTap.

**Files.** REWRITE in place: `app/[locale]/theses/[id]/page.tsx`, `app/[locale]/call/[thesisId]/page.tsx` (absorbing
`CallPageClient.tsx`, deleted), `types/thesis.ts` (A5's three bodies, hand-written from the appendix), `components/LegalDisclaimer.tsx`
(the verbatim disclaimer alone — the AI label it carries at :20 belongs to the labelled container, UI-7), `components/CopyableCode.tsx`
(the COPY control), `lib/format.ts` (`formatHash` :1 goes — §4 forbids what it formats; the date and interval forms stay), `lib/api.ts`
(the :24–:28 comment), `messages/*.json` (`theses`, `call`). NEW: `app/[locale]/theses/[id]/versions/[v]/page.tsx`;
`components/thesis/` — the researcher's-voice and platform's-mark components, the citation chip, the citation sheet, the
trajectory sheet, the document-sheet stub, the appeals cards, the history and the diff view, the VERIFY disclosure;
`lib/textDiff.ts`, `lib/doors.ts`, `lib/citationTokens.ts` (a token in the text → the body's resolved mention);
`test/fixtures/thesis/` (a published body, a withdrawn body, a body with a planted `analysis` field, two consecutive versions,
a call body, `{ live: false }` — each written from A5, none from the backend's answers); the eight instrument files. ORPHANED here,
RETIRE at UI-10: `CitationSheet.tsx`, `TipTapRenderer.tsx`, `ThesisProvenancePanel.tsx`, `ThesisPublicationPanel.tsx`,
`ThesisVersionHistory.tsx`, `FoiaModal.tsx`, `WhistleblowerModal.tsx`, `lib/thesisDocument.ts`, `lib/citations.ts`,
`lib/documentVault.ts`, the four `@tiptap/*` dependencies. KEEP, `git diff` empty: `context/AuthContext.tsx`, `lib/session.ts`,
`lib/stagingApiAuth.ts`, the layout of UI-4, every backend file but `services/publishedThesis.ts` and the one case.

*Verified by:* the eight instruments green, each observed to fail first by its decoy — `statement-and-disclaimer-first` (the
first two content elements of `<main>` on both pages; a fixture without a statement renders the disclaimer first and nothing
above it), `no-model-voice-public` (the planted `analysis` renders nothing; no file under `components/thesis` or the public pages
imports the labelled container — a decoy import caught), `notice-only`, `no-door-before-it-exists` (a decoy anchor to
`/theses/x/intake` caught), `diff-consecutive-published`, `diff-is-of-two-texts`, `bidi-isolated`, `no-id-as-text`;
`nav-is-the-map` and `name-never-glass-fortress` still green; `npm test`, `npm run build`, `npm run lint` green. On staging at
375 px, in the dated doc: run B's published thesis rendered whole from its live body — the statement and disclaimer first,
the claim as heading, every chip resolved, the pages linked to `/corpus?page=` (a 404 until UI-7, recorded), the VERIFY
disclosure's hashes equal to `list_findings`' through the connector; its call page; its version page; a made-up id the one
sentence; **the three-voices reading test of §41 :961–:962 — the researcher reads the page and says whether the researcher's
words and the platform's marks read apart — recorded verbatim**; WITHDRAWN provoked in the fixture only, since a withdrawal
on staging is the author's act and not this step's. **With the page rendered, thesis plan :327 is CLOSED and the thesis plan's
DoD line gains the pointer.**

**STATUS:** CLOSED 2026-09-18 — `docs/gf-ui-step-5-2026-09-18.md`. The renderer and its SUBSET recorded (markdown-it as a PARSER, `html: false`, `linkify: false`, tables and strikethrough enabled, task lists and footnotes ruled out, an image rendering its alt text alone), the runtime unchanged, the approved copy, **RE-BRIEFED 2026-09-16** against the design canvas pages 1–3 (docs/gf-ui-design-session-2026-09-16.md §4), the reading test RUN and **PASSED**, and the palette re-grounded on Claude’s own surface.
**THE HEADING LEFT THIS STEP** (the researcher, 2026-09-18): a specification question and not a display one, so the `<h1>` is still the claim, no backend field landed, and the deployed exercise over its four chunks is recorded in the dated doc when it runs.

### UI-6 · The door `/` — **THE HOME PAGE, AND IT IS BUILT LAST**

**MOVED TO LAST BEFORE THE CUT-OVER (the researcher, 2026-09-18): "home page requires a redesign after we finish all other
pages."** The order is UI-7 → UI-8 → UI-9 → UI-6 → UI-10. Nothing depends on this step: UI-10 is the cut-over regardless,
UI-9 is independent, and UI-8 needs UI-7 alone. Moving it also retires this step's own known dead link — its archive entry
was specified as opening "`/corpus` (a 404 until UI-7, recorded)", and after the reorder `/corpus` exists.

**WHAT THE DOOR OWES THAT IT DOES NOT YET CARRY.** §33 designs it as the WHOLE published list — "each thesis a card …
Newest first. That is the whole list; there is no search, no filter and no count". The page live today does
`theses.slice(1, 5)` — a hero and four — beside a latest-evidence strip and mission pillars, so the gap is built-versus-
designed and this step closes it.

**`תזות` NOW LEADS TO `/theses`, AND THE LIST LEAVES THIS PAGE (the researcher, 2026-09-18).** §3's retirement of
`/theses` is REVERSED and §33 is amended: the door shows the LATEST published theses with one entry onward, and `/theses`
is the whole list. So this step no longer owes the catalogue — it owes the WELCOME: what this platform is, the latest
theses, the three entries, the short disclaimer. `nav-is-the-map`'s subject set gains `/theses` for every identity.

**Contract:** §33 :825–:844 (the published theses and one sentence about what this is; the five regions; EMPTY; no
search, no filter, no count); §34 :855–:864 (the facts the paragraph MAY state and may not — §33 :836–:837 points here);
§32 :805–:807 as ruled 2026-09-15 (the name leads to this site's `/`); §24.5 :685–:686 (the archive's empty sentence is
`/corpus`'s own); §35 :880 (`/safety` reachable by URL until live); the reports plan's discovery path (:656–:658, `/reports/new`);
thesis A4 :1427 (`GET /api/thesis`'s six keys); A7 :1111 (the public pages ship empty and true); thesis plan :83–:84 (the
empty door on production). No instrument of its own; every scan re-runs over it. Frontend only.

**What lands.**

- **`/` rewritten in place** — the legacy page reads `/api/evidence/latest` and `/api/stats`, both gone (UI-3). One read,
  `GET /api/thesis` — `list_theses`' anonymous answer, the six keys of A4 :1427 and nothing else. §33 top to bottom: (1) the
  name and ONE paragraph; (2) THE PUBLISHED THESES, newest first, each a card — the claim as the heading, the provision by its
  table entry, the author's handle, published <date> — tap → `/theses/[id]`; no search, no filter, no count (§33 :829–:830:
  the published theses are few by design and each is a commitment); EMPTY: "no thesis has been published yet", the paragraph
  standing alone; (3) THE ARCHIVE — one entry to `/corpus`, always drawn: the door makes no second read to learn whether a page
  is open (§8 :341), and a withdrawn thesis keeps its pages open with no published card to show for it (T6), so the empty
  sentence is `/corpus`'s own and the entry never hides; (4) THE ENTRIES — three cards: report an adverse outcome →
  `/reports/new`; for researchers → `/researchers`; protection → `/safety`, drawn only when `lib/doors.ts` says live (UI-5's
  one constant — the same read as the nav's); (5) LAST — the short disclaimer.
- **The paragraph** (§33 :833–:837): what the platform is — the archive's captures anchored as served, every real change
  diffed, a thesis framed under a provision, cited, argued and published through a gate, the corpus open beside every
  published thesis. Its facts are §34's MAY STATE list and none of its MAY NOT (no chain but Base, no AI as ranker, no door
  that is not open, no person, no claim the corpus does not hold). Hebrew first, drafted by the session from §34 for the
  researcher's approval, English beside it (ruled 2026-09-15). The card labels and the empty sentence are the same copy rule.
- **Share metadata** (§32 :822–:823): the name and the paragraph's first sentence; names no person; the image as today.
- **No id as text** (§4): the card carries no hash — `contentHash` is in the body and is rendered nowhere on the door; the
  thesis page's VERIFY holds it. `no-id-as-text` gains the door's fixtures.
- **Retired from the page and orphaned** (§32 :818–:819; §3): the mission statistics, the "latest evidence" strip, the hero
  animation. `HeroSection`, `ScrollReveal`, `EvidenceHighlightCard`, `ThesisHighlightCard` and `StrengthBadge` lose their
  last live importer here (`ThesisHighlightCard` and `StrengthBadge` are still imported by the RETIRED `/theses` and `/call`
  lists, which are unlinked); all leave at UI-10. `LightParticlesCanvas` stays — `AuthShell` (KEEP) imports it.

**Files.** REWRITE in place: `app/[locale]/page.tsx`, `messages/*.json` (`home` — its 45 keys to the door's few; `dashboard`
orphaned). NEW: `components/thesis/ThesisCard.tsx` (the card; UI-8's `/research` list reuses its shape with the researcher
fields, one component two doors); `test/fixtures/door/` (a list of two, an empty list — from A4 :1427); no new instrument
file — `noIdAsText`, `nameNeverGlassFortress`, `bidiIsolated` gain the door in their subject sets. ORPHANED here, RETIRE at
UI-10: `HeroSection.tsx`, `ScrollReveal.tsx`, `EvidenceHighlightCard.tsx`, `lib/targetEntity.ts` (its last importers are
RETIRED pages), `framer-motion` if no KEEP file imports it (checked at the step; it goes at UI-10 either way if orphaned).
KEEP, `git diff` empty: `LightParticlesCanvas.tsx`, `AuthShell.tsx`, the layout, every backend file.

*Verified by:* every frontend scan green with the door in its subjects — `no-id-as-text` with a decoy card printing
`contentHash` caught, `name-never-glass-fortress`, `nav-is-the-map` (the door's entries are cards, not nav, and the scan
says so), `no-door-before-it-exists` (the protection card absent while the flag is false; a decoy anchor to `/safety`
caught when it is false); the empty state rendered from the empty fixture; `npm test`, `npm run build`, `npm run lint` green.
On staging at 375 px, in the dated doc: the door shows run B's one card and tapping it opens the thesis page of UI-5; the
archive entry opens `/corpus` (a 404 until UI-7, recorded); the two entries; the share metadata read from the rendered head
and naming no person. The EMPTY state is provoked in the fixture, not on staging, and is the live state of production at
`SHIP` (A7 :1111; thesis plan :83–:84) — the exercise there is `SHIP`'s, and it is written into §7.

**STATUS:** OPEN. Closes with `docs/gf-ui-step-6-<date>.md`: the approved paragraph in both languages, the exercise. **RE-BRIEFED 2026-09-16** against the design canvas, page 6 (and page 1, board A) — docs/gf-ui-design-session-2026-09-16.md §4.

### UI-7 · The chronology, the PAGES list, the two lenses, the three record pages

**ORDERED BEFORE UI-6 (the researcher, 2026-09-18). The remaining order is UI-7 → UI-8 → UI-9 → UI-6 → UI-10.**
UI-7 depends on nothing UI-6 builds, and UI-6 as written ships a KNOWN DEAD LINK — its archive entry "opens
`/corpus` (a 404 until UI-7, recorded)". Building UI-7 first removes that rather than recording it. **`/corpus`
is a 404 on staging TODAY**: `Sidebar.tsx` already renders `<Link href="/corpus">` under הארכיון, and the route
does not exist. UI-6 moves last because the door is the home page and **the researcher ruled it is redesigned
after every other page is finished** — where `תזות` leads is part of that redesign and is decided there, not here.

**THE BODY BELOW ABSORBS THIS STEP'S OWN RE-BRIEF (2026-09-18).** Its `STATUS:` claimed "RE-BRIEFED 2026-09-16
against the design canvas, page 4", but the re-brief landed in §10 :1217–:1223 and in `gf-ui-flows.md` §24's header and
was never folded in, so the body described a superseded design. Three deltas, now applied: the PAGE CARD with the
TIME STRIP replaces the DATE AXIS and moves BELOW the filters (the context line stays); a record opened from a row
is a RIGHT-PANE TAB, not a sheet; and a search page was named by the re-brief alone.

**Contract:** §24–§28 :653–:886 (one stream, two doors; the two row weights; the corpus's one public model voice; the five
regions; the lenses; the record sheet and the record pages; the gated additions are UI-8's; the `pages` facet); §31 :917–:933
(the instruments — three land here, `one-stream-two-doors` and `no-marking-link-from-research` complete at UI-8,
`pages-facet-equals-scope` landed at UI-2); §10 :371–:387 (the three voices — the third, THE MODEL'S, is born here as the
classifier's chip); §4 :167–:178 (a capture by its date and time, never its 14-digit timestamp; a page by its title and
domain); §6 :207–:218 and §6.1 (the reads, all UI-3's); §8; A1 :1111–:1139; A2 :1141–:1156 (400 the filters shown for removal;
404 one sentence; 409 the state with both capture links live; 503 a statement about the check); A6 :1234 (`limit`, the
nesting depth of three, the date axis's granularity); §41 :1091–:1103 (the density and the chain-check press rate are MEASURED
here, not designed); evidence §5 :428–:430 (the archive link composed deterministically); evidence A4 :1081–:1090, :1095–:1099,
:1105–:1109, :1111–:1115 (the bodies); COMPLIANCE.md rule 3 (the label's text). **Frontend only, WITH ONE DECLARED EXCEPTION ruled 2026-09-19 and re-shaped the same day by a cold design review the researcher commissioned and accepted whole: the step adds `get_capture({ url, capture, textHash? })` at `GET /api/pages/:trackedUrlId/captures/:capture` (evidence A4), a resource beside the mounted …/captures/:capture/chain. **THE MCP SURFACE MOVES 45 → 46 and the backend diff is that tool, its route and its core — larger than the "one field" first ruled, and stated here so the growth is declared and not discovered.** The step said "frontend only" and the researcher's clean-code rule overrode it — *„לא לשכפל קוד ולא לשכפל אלמנטים גרפיים"* — because the record's content is ALREADY drawn in the thesis page's right pane and a shared component cannot be fed by a read that carries nothing. **What is shared is `RecordContent`, not the pane** (ui flows §26): the two surfaces hold one domain object inside two context objects, and sharing the pane would make the corpus synthesise a citation it does not have. **AND THE STEP CARRIES A REPAIR IT DID NOT CREATE:** `RecordPane.tsx` labels a cited diff's chunks by `'before'` while the backend writes `'REMOVED' | 'ADDED'`, so every chunk reads „אחרי"; `publishedThesis.ts` widens `side` to `string`, which is why `tsc` cannot see it, and the thesis fixture carries the wrong vocabulary, which is why the suite is green. It is LATENT — the published thesis cites three captures and no diffs — and it fires on the first cited diff. The fix lands with `RecordContent`, which is the one place the vocabulary is mapped. Every piece of this is declared in the landing PR.**

**What lands.**

- **`/corpus` OPENS ON THE PAGES LIST** (the researcher, 2026-09-18), not on the stream. **THE PAGES LIST** is one row per
  page url — the url, the interval, the record count — and NOTHING ELSE: **no time strip on a row**, because a strip is ONE
  page's shape over time and therefore reads as a heading, not as a list item; it keeps the home it already has, the page
  card at the top of `/corpus?page=<id>`. **No search and no count over the list either**, by §33's own reasoning for the
  door — few by design, added slowly, and the researcher's words for the corpus were the same: the pages "will be added by
  researchers in slow rate".
  **ITS ONLY LEGAL SOURCE IS `list_corpus`'s `pages` FACET AT `scope: 'public'`** — never `list_pages`, never the facet at
  `all`. `gf-ui-flows.md` §28 is explicit: "no public read lists pages (`list_pages` is GATED, and rightly: a public list of
  surveyed pages is the §9.5 leak)". The facet at `public` is exactly the OPENED pages — those a published thesis cites —
  and "reveals nothing the thesis pages' links do not already reveal". A list from any other source tells a stranger what is
  under investigation before it is published, which is the one thing §9.5 forbids.
  **IT IS ONE COMPONENT BUILT ONCE AND RENDERED AT TWO SCOPES**, as the chronology already is: public here; at UI-8's
  `/research/corpus` the same list at `all`, every surveyed page, with the NOT PUBLIC mark on the rows no published thesis
  has cited yet (§27). Writing it twice is the defect this repository names as its dominant shape.
- **`/corpus`'s STREAM** — ONE component, the CHRONOLOGY, rendered here at `scope: 'public'` from `GET /api/corpus`; UI-8 renders the
  same component at `all` with its three additions and completes `one-stream-two-doors`. §24 top to bottom: (1) the sticky
  context line — **the SCOPE LABEL IS RETIRED (the researcher, 2026-09-19): „דפים פתוחים" names a scope against a second scope this public door does not have, and a reader who is not a researcher does not know the closed pages exist. The whole line was DELETED at chunk 2 and is written FRESH here, when its filters, count and control arrive together** — the count returned so far, the LENS control **PAGES · CITED RECORDS („עמודים · רשומות מצוטטות”)** (amended 2026-09-18: the STREAM lens is REMOVED, RECORDS is renamed CITED, and CLAIMS becomes PER-PAGE — flows §24 region 1, §25); (2) the
  FILTERS; (3) the PAGE CARD with the TIME STRIP — captures as dots with cited ones ringed, diffs as bars by chunk count —
  which is ALSO the scrubber and REPLACES the date axis; then (4) the
  filter chips — one horizontally scrolling row: PAGE (a picker from the read's own `pages` facet, §28), SINCE / UNTIL,
  KIND, CITED — every chip a query parameter of the one read, carried in the URL, so a filtered view is linkable and the
  thesis page's `/corpus?page=<trackedUrlId>` is one of them; the STREAM, cursor-paginated on the read's own cursor,
  oldest first within the range, "load older" and "load newer" at the ends, a row tap opening THE RECORD AS A RIGHT-PANE TAB — **CORRECTED 2026-09-19: this line said "the RECORD SHEET" and was the only one of five that did; :544, :663, §10 :1217–:1223 and `gf-ui-flows.md` :761 all say TAB, and §10 :1202 rules that where a body and its block disagree the block wins. §26's "sheet" is the CONTENT, presented through the `Sheet` primitive full-screen on the phone (`gf-ui-flows.md` §18, §22)** — a page label
  tap adding the PAGE filter; (5) EMPTY — "no page is open yet — a page opens when a published thesis cites it"; filtered —
  "nothing in this range" with the filters shown for removal, which is also the 400 state.
- **Two weights of row** (§24 :663–:669): a CAPTURE is a thin row — the page's label, the date and time, the anchor mark
  (ATTRIBUTED or not yet), a COPY giving the citation token; a DIFF is a card — the page's label, the interval, the size of the
  change by side from `current`, **the classifier's opinion CLAMPED TO TWO LINES with **„קרא עוד" — approved 2026-09-19; this clause said „עוד" and the researcher chose the longer form** — not a chip; it runs 197
  characters and a chip shows forty (amended 2026-09-18, flows §24)** — and **the stream HIDES rows the classifier did
  not flag, by `legallySignificant` and NEVER by `editorial`: 20 of 21 diffs are editorial and EIGHT of those are also
  legally significant, so that gate would bury what it was meant to surface. A count line states how many are hidden and
  one tap reveals them.** The CITED mark with the published
  theses that cite it, the NARROWED mark, AWAITING DERIVATION as a state.
- **The third voice is born here** (§10 :378–:381; §24 :690–:692): `components/opinion/LabelledOpinion.tsx`, the ONE container
  carrying "ניתוח AI — אינו מהווה קביעה שיפוטית" with the model and version beside it — here the classifier's `classifierVersion`. **AMENDED 2026-09-19 (the researcher): the MODEL NAME is OWED and DEFERRED, never waived** — it matters to show, but is not worth delaying development for a server change at this stage, so UI-7 renders the version alone and invents no name; it arrives when a step opens the server. **The reveal control's word is „קרא עוד” (approved 2026-09-19)**; until chunk 5 draws it the tail is unreachable.
  The classifier's opinion on a diff is the only model voice on any public page; `opinion-labelled-on-corpus` holds that every
  rendered `opinion` field descends from it and that no other model field is rendered on a public corpus page. UI-5's public
  thesis components never import it (`no-model-voice-public`), and UI-8's `opinion-under-label` holds it over the read view.
- **The page label** (§4 :168–:169): the `pages` facet carries `trackedUrlId, url, first, last, entries` and no title (§28), so
  the label is composed from `url` — domain and path — and the id is never text. A title in the facet would be an amendment to
  §28 and is not made here; recorded as an observation in the dated doc if the composed label reads badly on the real corpus.
- **`/theses` — THE PUBLIC THESIS LIST, un-retired 2026-09-18 and landing HERE** rather than at UI-6, because UI-6 is now
  last and the sidebar's תזות has had no destination since UI-4b drew it as a category. One row per PUBLISHED thesis from
  `GET /api/thesis` (A4 :1427) — the claim as the row, the provision, the author's handle, published <date> — newest first;
  **no search, no filter and no count**, §33's own reasoning, which moved here with the list. It is the PUBLIC HALF of a
  pair: the gated half is §29's THESES region under `/research` (`GET /api/research/theses?scope=all`, each row carrying
  DRAFT ONLY · PUBLISHED = HEAD · PUBLISHED ≠ HEAD (n) · WITHDRAWN), which UI-8 builds. **TWO ROUTES, NOT ONE THAT BRANCHES**
  — :1129's rule is "two centres by URL, none by identity": the NAV is keyed by identity, the PAGE never is, and this is
  exactly how `/corpus` and `/research/corpus` already divide.
  **WHY IT SITS IN A CORPUS STEP:** it is the same shape as the pages list this step already builds — a public list with a
  gated twin — and building two list pages in one step is one implementation of one rule rather than two of it. The
  researcher may move it; nothing else depends on where it lands.
- **THE SEARCH PAGE IS DEFERRED** (the researcher, 2026-09-18). §10 :1217–:1223's re-brief named `/corpus/search?phrase=`; this
  body never listed it, so nothing is removed — only the re-brief is amended. The researcher's reason is the corpus's size:
  a list of what has been scanned is worth more than a search across it while the pages are few and grow slowly.
  `GET /api/corpus/search` stays mounted from UI-2 and unused. The sidebar's search icon beside הארכיון currently links to
  `/corpus/search` and would 404 — it is REMOVED here and returns with the page.
- **THE CLAIMS VIEW IS PER PAGE** (the researcher, 2026-09-18; §25) — reached from that page's own view, `page`
  REQUIRED, and **there is no bare cross-page claims list**. The rows are ordered by the date the claim LEFT, and
  that ordering has no meaning across unrelated documents: *„לפי מה ממיינים את הטענות אם מציגים ברשימה אחת טענות של
  scanned url 1 ו־scanned url 2?”* Within one page it is the whole point — this document's sentences in the order
  they were withdrawn. From `GET /api/corpus/claims` with its page filter: the same context line, filters and axis;
  rows are trajectories ordered by the date the claim LEFT, latest first — the claim's first words, the page's label, the
  pattern as a strip of ticks across its captures, **`transitions` (how many times it flipped) and `finalState`
  (present or absent in the latest capture)**. **THE CURRENCY MARK AND CITED ARE REMOVED 2026-09-18 (§25) — not
  missing fields but questions with no meaning on this row: currency compares a PINNED computation against the
  latest, and a trajectory no thesis cited has no pin. Both stay thesis-side, where a researcher can act on them.**
  Tap → the claim's sheet: the captures in
  order with the claim present or absent at each, each a link to its record, and the diffs in which it left or returned.
- **The CITED lens** (§25, renamed from RECORDS 2026-09-18 — „רשומות” is the UNIT, every row is one) is `/corpus?cited=1`, not a page: the stream filtered to `evidence ≠ null`, each card
  showing the record's standing — PROMOTED or WITHDRAWN — and its citing published theses.
- **The RECORD SHEET** (§26 :822–:825) over the stream: a capture's text or a diff's CURRENT chunks stacked by side; the marks
  in full — the anchor, VERIFIED per capture where the row is cited, the opinion's categories, editorial, classifier version
  and draws under the label, `narrowed` with what intervened; the citing theses as links; ONE link onward to the record's
  page. A sheet may open one further sheet, three deep at most (A6).
- **`/pages/[id]/captures/[capture]`** (§26 :827–:834), from `GET /api/pages/:id/captures/:capture` — `get_capture`, ONE capture's row plus its text (evidence A4 :1082; A1 :1123; :555 above) — **RE-POINTED 2026-09-19: this bullet said "from `GET /api/pages/:id/findings` (its row)" after the same day's ruling had moved the read to a resource; found by the DEV seat's cold read of its own brief**: the page and the date and
  time as the heading; the text version in full; the anchor as a mark; the COPY of the citation token; the VERIFY disclosure
  holding document hash, text hash, extraction version and registry index; a CHAIN CHECK on demand — one button whose moment
  is the reader's doubt — calling `GET …/captures/:capture/chain` and showing isRegistered · ATTRIBUTED · anchored = document ·
  the stored verdict and its version, or CHAIN_UNAVAILABLE as a statement about the check; the SECOND WITNESS — the archive
  link composed deterministically from the url and the timestamp (`lib/archiveUrl.ts`, one function), with the one line on
  one line saying the archive holds this page at this date and the link opens it — **AND NO INSTRUCTION TO HASH ANYTHING. CORRECTED 2026-09-19: this bullet ordered "fetch, hash, compare", which `gf-ui-flows.md` §26 :834, :836–:850 RETIRED on 2026-09-18 on the researcher's words and on a measurement — the VIEWER form the reader is given returns 54,180 bytes hashing to `1b108bb2…`, the RAW form 47,731 bytes hashing to `5887afdf…`, which is the anchored `documentHash`, so a reader who obeyed the instruction got a MISMATCH and would conclude the evidence was fabricated. The RAW form belongs in the VERIFY disclosure beside the hash it matches (§26 :847; §4 :175–:179) and nowhere else.** Nothing is fetched from the chain on render.
- **`/pages/[id]/diffs/[before]/[after]`** (§26 :852–:856), from `GET /api/pages/:id/diffs/:b/:a`: the two texts as an inline
  diff at phone width and side by side when wide (UI-5's `lib/textDiff.ts`, the same two-input function), the CURRENT chunks
  by side beneath, the opinion labelled, `narrowed` with the intervening captures as links, the citing theses; both endpoints
  linking to their capture pages; 409 AWAITING_DERIVATION rendered as the state with both capture links live.
- **`/records/[fileHash]`** (§26 :858–:861), from `GET /api/records/:fileHash`: the record the name resolves to — kind, page,
  timestamps; RECOMPUTABLE and VERIFIED with per-capture attribution as marks; the published versions that cite it, each with
  FLAGGED and its text; one link to the record's page. A document commitment renders the RESERVED stub of UI-5 until the
  document plan's step 34; no anchor to any door.
- **The states**: 404 ONE sentence for NOT_SURVEYED and NOT_PUBLIC alike, on every page here; 400, 409, 503 as A2.
- **Operational values, named once** (A6): the date axis opens at MONTH and the stream's `limit` is UI-2's default, both
  recorded in the dated doc as the initial values and moved by §41's measurement, never by this plan; the sheet nesting
  depth is three.
- **What is measured from this step** (§41 :1091–:1103; §39): rows per page and per month on the real corpus, read from the
  staging exercise's bodies; the chain check's press rate, read from the backend's request log for the `…/chain` route —
  never from the page, which records nothing (§39 :925–:926).
- **Copy**: the empty sentences, the chip labels, the mark names and the one verification line are drafted from §24–§26 and
  approved before landing (ruled 2026-09-15); the label's text is COMPLIANCE.md's.

**Files.** NEW: `app/[locale]/corpus/page.tsx` (opening on the PAGES LIST), **`app/[locale]/theses/page.tsx` REWRITTEN as the public thesis list (it exists today as a legacy page and leaves `tokens-only`'s allow-list here)**, `corpus/claims/page.tsx`, `pages/[trackedUrlId]/captures/[capture]/page.tsx`,
`pages/[trackedUrlId]/diffs/[before]/[after]/page.tsx`, `records/[fileHash]/page.tsx`; `components/corpus/` — the chronology,
the context line, **the PAGES LIST row (one component, two scopes — UI-8 renders it at `all` with the NOT PUBLIC mark)**, the
page card with the time strip (which replaces the date axis), the filter chips, the capture row, the diff card, the record
**as a right-pane tab** (§10 :1217–:1223 — not a sheet), the claims row and sheet,
the two stacked registers, the chain-check control; `components/opinion/LabelledOpinion.tsx`; `lib/archiveUrl.ts`,
`lib/corpusQuery.ts` (chips ↔ URL ↔ the one read's parameters); `types/corpus.ts` (the bodies of A4 :1081–:1090, §6.1, §28, A4
:1095, :1105, :1111, hand-written from the appendix); `messages/*.json` (`corpus`, new); `test/fixtures/corpus/` (a stream over
two pages with both row kinds, a cited diff, an awaiting-derivation diff, a narrowed diff, a facet, a claims list, a capture
row, a diff input, a record, a chain answer, `CHAIN_UNAVAILABLE`); the three instrument files. **AMENDED 2026-09-19: `components/shell/Sidebar.tsx` IS EDITED at this step** — תזות gains its destination and the `/corpus/search` icon is removed (rulings 3 and 10 of 2026-09-18). This bullet predated those rulings and named no shell file, so the edit was authorised by the RULINGS and not by this list, and it lands DECLARED OUT OF KEEP with its measured size. REWRITE: `app/[locale]/theses/page.tsx`; every other URL here
is new. REPLACED, RETIRE at UI-10 (each imported only by RETIRED pages): `DiffCard.tsx`, `ClaimBlock.tsx`, `SurvivalChip.tsx`,
`TrajectoryPanel.tsx`, `EvidenceTimeline.tsx`, `SkeletonRows.tsx`, `EmptyState.tsx`, `CategoryBadges.tsx`, `TierBadge.tsx`,
`lib/survivalLabels.ts`, `lib/evidencePerspective.ts`, `lib/investigativeCategories.ts`, `types/evidence.ts`, the `forensics`,
`evidence`, `timeline` namespaces. KEEP, `git diff` empty: `lib/textDiff.ts` (UI-5's), `components/thesis/*`, the layout, every
backend file.

*Verified by:* the three instruments green, each observed to fail first — `opinion-labelled-on-corpus` (every rendered
`opinion` field a descendant of the labelled container; a decoy rendering `editorial` outside it caught; a planted non-opinion
model field on a fixture row caught), `record-page-witnesses` (the archive link equals the composed form on a fixture; the
chain fetch NOT issued on render — a fetch spy — and issued on the press; the `CHAIN_UNAVAILABLE` fixture renders the
statement), `filter-is-a-query` (a source scan: under `src/app/[locale]/corpus` and the record pages nothing fetches
`/api/pages/:id/findings` or `/api/research/pages` for a filter; a decoy second fetch caught); every earlier scan green with the
five pages in its subjects — `no-id-as-text` with a decoy timestamp as text caught, `bidi-isolated`, `no-door-before-it-exists`
over the records page's stub, `nav-is-the-map`, `name-never-glass-fortress`; `npm test`, `npm run build`, `npm run lint` green.
On staging at 375 px, in the dated doc: `/corpus` over the pages run B opened, both row weights present, the facet's pages
equal to the thesis page's links; the thesis page's `/corpus?page=` link landing filtered; `?cited=1` showing the three cited
records with their citing thesis; the CLAIMS view of ONE page, reached from that page (there is no cross-page claims list — §25); one capture page with the chain check pressed once against Base Sepolia
and its answer beside `check_on_chain_status`' through the connector, the archive link opened once, the VERIFY hashes equal
to the connector's; one diff page; `/records/<one cited fileHash>`; a surveyed page not opened answering the one sentence
(`corona`, if still unopened — the id read from `list_pages` through the connector, never typed); no horizontal scroll on any
of the five; the density of §41 recorded in rows per month.

**STATUS:** CLOSED 2026-09-20 — `docs/gf-ui-step-7-2026-09-20.md`. Ten landings (#522, #524, #525, #526, #528, #529, #539, #540, #541, #542; `staging` `f09c909`): the corpus types and the two pure libraries, the pages list, the provision lookup, the theses list with the CI type-check gate, the third voice's container, the stream with the page card and the time strip, the CITED lens, the three record pages with their two ruled envelopes, and the CLAIMS view per page with the read that gained `captures[]`. Recorded there: the stream's initial `limit` (100, UI-2's, unmoved), the density MEASURED (43 rows over 23.12.2021–3.1.2023 on the one staging page — 22 captures + 21 diffs, May 2022 the densest at nine captures; 26 trajectories, 22 captures each, 13 of them groups of 2–45), the composed page label as it reads (`corona.health.gov.il/vaccine-for-covid/`), the exercise on staging at 375 px for every page of the step, the chain check pressed TRUE at index 22 — and the press RATE this line's :678 asked for read as UNMEASURABLE from the backend's request log as Railway retains it, which holds the current deployment only. RE-BRIEFED 2026-09-16 (docs/gf-ui-design-session-2026-09-16.md
§4) and RE-BRIEFED AGAIN 2026-09-18 — the ten rulings above, folded into this body. What the step does NOT close, each carried to its owner in the doc's
§10: the sheet's height on a phone (a group of 45 lists every member and every capture, 6,626 px), the `notEvaluable` reason sentences, the one 404 naming a THESIS on a record page, §3 :92,
the version page's `reading`, „טען ישנים יותר", the pill drawn twice, the `routeIsTool` flake. *(This line was SPLICED — the 2026-09-16 marker had landed inside the closing sentence,
orphaning its second half. Found by a cold read, 2026-09-18; it pre-dates today's amendments.)*

### UI-8 · The read view — `/research`, the working view, the gated chronology

**Contract:** §10–§15 :364–:504 (what the working view is; the three voices; §11's four regions and the eleven rows → seventeen turn kinds (RULED 2026-09-20); what
the page never has; the states; widening; the five instruments); §27 :863–:876 (the gated door's three additions); §29
:887–:909 (`/research`, four regions; the `mine`/`all` switch is navigation, not an act); §30; §7 :288–:303 and §7.1 (the
routes, all UI-3's; the routes pass `all`, the page opens on `mine`); §13 :469–:477 and A2 :1150–:1152 (401 → `/login?returnTo=`;
403 one sentence with `/researchers` linked; 404 the refusal named); §37 :1035 (`returnTo` threading from any gated page); §4
(the COPY controls: `thesis <id>`, the owed command, the citation token; no id as text); §12 :456–:459 (the one actionable
element is the COPY of a command the owed list names); §39 :1055 (the switch is browser-local); §41 :1093 (the history
loads whole until a measurement says otherwise); §31 (`one-stream-two-doors` and `no-marking-link-from-research` complete
here); thesis §9 :974–:978 (HISTORY's rows); T6 :866–:882 (what is owed, one command per entry); A2 :1309, :1317 (the model
and prompt version beside every opinion); interaction MARKING :534–:535 (the copy button) and :576–:578 (the instruction
comes from the chat, never the marking link); A3 :1157–:1171. Frontend only (cites recomputed in place 2026-09-20, R66). **WIDENED 2026-09-21 (the researcher, R70 „approve (a)”): NO LONGER frontend only.** `get_thesis_context` gains the RESOLVED citations and `pages` of thesis A4 :1476 as amended today, because the CENTRE is the public thesis column CALLED (:739) and that column cannot be fed from the shape the read served — `V.mentions` carried `{ kind, name, pin, argued }` while §11 :410 and :413–:415 have always needed the record. **The change is `getThesisContext.ts`, which :779's lift already names BARE** (unlike `listPages.ts` and `listTheses.ts`, which carry their permitted fields in parentheses) — no new tool, **the surface stays 46**, no migration. The resolution is not written here: `publishedThesis.ts` already builds it for the public body at :302–:353 (`evidenceCitation` :406) and is CALLED for HEAD and PUBLISHED alike, so the `V` shape is ONE citation shape rather than two. **CORRECTED 2026-09-21, same day: this first cited :249, which builds the UNRESOLVED refs, not the citations; the resolver is inline and SINGLE-VERSION, so the reuse is a factoring and two calls, not one existing multi-version read.** **ui §10 :369–:371's CLOSED LIST OF READS is untouched** — a FIELD is added to the one read, never a read, which is ui §6.1 :241's own precedent (`list_corpus`' `page` gained `public: bool` so the gated door could mark a row „without a second read”). The alternative of reading the PUBLIC body for the centre was REFUSED: this step's own :739 says *„TEXT is the centre”*, TEXT is HEAD's Markdown (§11 :410–:412), and no public body carries HEAD.

**What lands.**

- **Identity on the gated pages, and nowhere else.** Every `/api/research` fetch sends the Supabase bearer (`authHeaders()`,
  through `authedFetch`'s one-retry, `lib/api.ts` :58–:71, unchanged); a 401 from the route sends the reader to
  `/login?returnTo=<this URL>` and back (§37; the OAuth plan's threading); a 403 renders the one sentence with `/researchers`
  linked; the identity is read from `AuthContext` for the `mine` mark and nothing else — the body says who is who.
- **`/research`** (§29): (1) WHAT I OWE, first, stop-shaped — `GET /api/research/reviews?scope=all` and
  `GET /api/research/evidence-reviews`; each entry the thesis (claim), the kind (FLAGGED · STALE_TRAJECTORY · UNARGUED · ARRIVED
  later), its material, ONE COMMAND with a copy button; the corpus-wide CONTENT_MOVED entries with old chunks beside new; empty
  is a line saying so; (2) THESES — `GET /api/research/theses?scope=all`, each row the claim · provision · author · state ·
  unargued n · open gaps n · framing attached, tap → `/research/theses/[id]`, the published ones linking the public page too;
  (3) FRAMINGS — `GET /api/research/framings`, oldest first, tap → the framing sheet; (4) THE CORPUS in numbers —
  `GET /api/research/pages`: pages surveyed, rows by outcome, stops pending as a fact, and the link to `/research/corpus`. **RULED 2026-09-21 (the researcher, R68 board ב): drawn as ONE door card with ONE summary line; the breakdown by outcome moves to `/research/corpus`'s page rows.**
  **The `mine` / `all` switch** is one control setting one parameter on two lists (§29 :907–:908, recomputed 2026-09-20 R67): the routes answer `all` with
  `mine: bool` on every entry (§7.1 :322–:325), the page opens on `mine` by keeping the entries whose `mine` is true — a view
  over a field the body carries, not a derivation — and remembers the choice in the browser only (§39). Nothing on `/research` writes.
- **`/research/theses/[id]`** — THE WORKING VIEW (§10–§14): one read, `GET /api/research/theses/:id` (`get_thesis_context`, A4
  :1476–:1479), and two sheets on demand, `…/framings/:id` and `…/debates/:sessionId`. §11 top to bottom: (1) the (NOT sticky — RULED 2026-09-20, R66 „Q9”, ui §11 :399)
  context line — the CLAIM verbatim as the heading, the provision, the handle with `mine` marked, the state DRAFT ONLY ·
  PUBLISHED = HEAD · PUBLISHED ≠ HEAD (n) · WITHDRAWN on <date>; (2) WHAT IS OWED for this thesis, each entry with its material
  and ONE COMMAND to paste, labelled as the author's on a colleague's thesis; (3) THE STATE NOW, one segmented control: TEXT
  (HEAD's Markdown, every token a chip opening the CITATION sheet, PUBLISHED one toggle away with the diff between them —
  UI-5's `textDiff`, the same two-input function), CITATIONS (every mention of HEAD: kind, record, pin, ARGUED with the verdict
  and "over objection" as a fact or UNARGUED, FLAGGED, tap → the DEBATE sheet and one step on the record page), GAPS (each
  gap's decision in force, a CITED gap whose citation left the head reading OPEN as derived), ANALYSIS (CURRENT or STALE / NONE
  with the fingerprint; the opinion labelled, every mark beside its sentence), FRAMING (rounds in sequence; CHOSEN with whether
  HEAD restates it character for character); (4) THE STREAM — HISTORY(t) OLDEST FIRST, one row per act, tap → the sheet for
  that kind; "jump to now" at the end. The eleven rows → seventeen turn kinds (RULED 2026-09-20) and their sheets are §11's table :435–:447, nothing invented; the
  WITHDRAWAL's reason shows here and never publicly (T6 :916). **RULED 2026-09-21 (the researcher, R68 „אופציה ב”); supersedes canvas page 1 board C): (3) and (4) are RE-HOMED — the CENTRE is the public thesis column (§17, UI-5's components CALLED) under the context line and WHAT IS OWED, so TEXT is the centre and not a tab; **WHAT THE CENTRE DRAWS, RULED 2026-09-21 (the researcher, R70) — READ OFF APPROVED BOARD ד2, not enumerated from §17: above it the CONTEXT LINE (§11 row 1, in the order ruled the same day) and WHAT IS OWED (§11 row 2); then the centre itself, in this order — (i) THE TICK LINE (§10 :1121: the domain once, heading the text, with the cited captures as dated ticks); (ii) THE TEXT (§11 :410–:412, HEAD's Markdown, every citation token a dated tick chip); (iii) the PUBLISHED toggle and the DIFF, as two controls beneath the text (`הגרסה שפורסמה` · `מה שונה ביניהן`). **NOT DRAWN, and each for its own reason:** §17's region 1 (the public-interest statement and the LEGAL DISCLAIMER — COMPLIANCE.md :92 names the PUBLIC pages, and a gated working view is not one) · region 4 (THE APPEALS, already removed from §17 on 2026-09-16, R56) · regions 5 and 6 (THE CASE and HISTORY — post-publication regions whose GATED home is already the transcript, §11 :444's VERSION turns and :448's PUBLICATION ATTEMPT; drawing them in the centre would be one fact in two places on one page) · region 7 (THE PAGES) and region 8 (the VERIFY disclosure), which the approved board simply does not draw — VERIFY's gated home is the ANALYSIS tab (§11 :421), which is where `VerifyDisclosure.tsx`'s one declared KEEP edit belongs. **The board is the ground and §17 is not the index of it:** §17 orders the PUBLIC page, the working view reuses its components rather than its running order, and an earlier attempt to rule this as „§17 regions 2, 3, 7, 8" put the plan at odds with the board on two of the four.** the RIGHT PANE's tabs are TRANSCRIPT (§11 row 4, the default, OLDEST FIRST, opened at the end) · CITATIONS · GAPS · ANALYSIS · FRAMING · APPEALS at the pane's top; on the phone the pane is the layer.**
- **Three voices, complete** (§10 :371–:391): the researcher's component and the platform's mark (UI-5), and the labelled
  container (UI-7) now wrapping every ASSESSED round, debate assessment, analysis and publication assessment with the model
  and prompt version beside it; a paraphrase shown as one — `researcherClaim` with `quoteVerified: false` rendered with the
  researcher's actual words beside it. `three-voices` holds that every rendered string is in exactly one register by
  construction and that no page renders an opinion or a verdict through the researcher's component.
- **What the page never has** (§12): no write control — no publish, save, editor, resolve or re-run; the one actionable element
  is the COPY of a command the owed list names, whose moment the list defines; no opinion outside its label; no second read
  for a filter — "since" is `get_thesis_context`'s own parameter, used to refresh the stream on return; the history loaded
  whole, its size at phone width MEASURED on run B's thesis from this step (§41 :1093–:1094, recomputed 2026-09-20 R67), a cursor added the day a
  measurement says so and not before.
- **`/research/corpus`** (§27): UI-7's PAGES LIST and CHRONOLOGY at `scope: 'all'` — **the same two components, not second
  copies**. The pages list at `all` is `list_pages`' answer: every SURVEYED page, with the NOT PUBLIC mark on the rows no
  published thesis has cited yet, so a researcher sees what a reader may not and the §9.5 line stays where §28 draws it.
  The chronology at `scope: 'all'` — the same component, `one-stream-two-doors` completing — with
  three additions and no page: the NOT PUBLIC mark on rows of pages not yet opened; THE EXTRACTION SHEET from any capture row,
  "how this text was extracted" — the work-list row (`…/pages/:id/captures?outcome=`), the rules in force at this capture's
  date (`…/pages/:id/rules`, filtered by validFrom / validTo), each rule one step further (`…/rules/:ruleId/history`): three
  reads, three nested sheets, opened only on demand, the walk's working state reachable from the record and from nowhere
  else (§1 :66–:68); and the PAGE facet as `list_pages`' answer with rows per outcome and a PENDING stop shown as a fact —
  "a stop is pending; it is resolved in the chat" — never as the marking link (MARKING :576–:578). `/research/corpus/claims`
  is the CLAIMS lens at `all`.
- **Widening** (§14, §30): at medium width the STATE segments and the STREAM side by side, the filters a side rail; at expanded
  width a sheet becomes a third column. The named patterns — an attributed activity stream, a segmented control, bottom
  sheets becoming side panels, a sticky collapsing header, pull-to-refresh as the `since` read — are conventions, not
  judgements; which library, if any, is the step's and recorded.
- **Copy**: every label of the `research` namespace drafted from §11, §13, §27 and §29 and approved before landing; the kinds'
  names are the design's.

**Files.** NEW: `app/[locale]/research/page.tsx`, `research/theses/[thesisId]/page.tsx`, `research/corpus/page.tsx`,
`research/corpus/claims/page.tsx`; `components/research/` — the owed strip, the thesis rows (UI-6's card with the researcher
fields), the framing rows and sheet, the corpus numbers, the working view's context line, the five state segments, the
stream and the seventeen kinds' rows and sheets (RULED 2026-09-20), the extraction sheets, the NOT PUBLIC mark (RULED 2026-09-20, R66 „Q7 extend”: NOT a new component — one more member of `components/thesis/PlatformMark.tsx`'s closed union, a DECLARED KEEP edit with its measured size, ui §21 :626's one-mark rule), the `mine`/`all` switch; `lib/researchFetch.ts` (the
bearer, the 401 → `returnTo`, the 403 — one wrapper, no page composes it); `types/research.ts` (the bodies of thesis A4 :1476,
:1458, :1432, :1523, evidence A4 :1144, :1146, interaction A5 :1071, :1199, :1208, :1214 — hand-written from the appendices); `lib/researchBody.ts` (the parsers, one per read, to the same appendix lines — RULED 2026-09-20, R67 Q-A, the `corpusBody.ts` / `thesisBody.ts` precedent);
`messages/*.json` (`research`, new); `test/fixtures/research/` (a transcript carrying all seventeen turn kinds (RULED 2026-09-20); a colleague's thesis; a
withdrawn thesis; a thesis with one version and nothing else; an owed list; an empty owed list; a corpus at `all` with an
unopened page; a work-list row, rules and a rule history); the six instrument files. REWRITE: `components/corpus/*` (the scope
prop, the NOT PUBLIC mark, the extraction sheet's mount point — the same component, no second stream). KEEP, `git diff` empty:
`context/AuthContext.tsx`, `lib/api.ts`, `lib/session.ts`, `components/AuthGuard.tsx` (profile and admin keep it), the public
pages of UI-5 and UI-6, every backend file — **LIFTED 2026-09-20 (the researcher, R66 „Q1 transcript approved · Q2 add fields”) for exactly: the transcript builders and `thesisPredicates.history` (thesis §9 :974, A4 :1476), `getThesisContext.ts`, `getDebate.ts` / `debateState.ts` (the record named, `turns` from the builder), `getFraming.ts` (its rounds through the builder), `listPages.ts` (`trackedUrlId`, `public`, `stopPending`, interaction A5 :1071), `listTheses.ts` (the state through `publicationState`), and their tests; the surface stays 46; no migration.**

*Verified by:* the six instruments green, each observed to fail first — `every-kind-renders` (the eleven-kind fixture — **RULED 2026-09-20 (R66): the SEVENTEEN-TURN transcript fixture of A4 :1476, every kind at least once, held exhaustively over the closed union** — renders one
row and one sheet per kind; a kind removed from the renderer fails it by name), `opinion-under-label` (every field of an ASSESSED
round, a debate assessment, an analysis or a publication assessment a descendant of the labelled container; a decoy rendering
one outside caught), `three-voices` (a decoy verdict rendered through the researcher's component caught), `no-write-from-research`
(a source scan under `src/app/[locale]/research` and `components/research`: no request with a method other than GET, no form
post; a decoy `fetch(…, { method: 'POST' })` caught), `no-marking-link-from-research` (no anchor to `/article-rules/…`; a decoy
caught), `one-stream-two-doors` (`/corpus` and `/research/corpus` render from one component and differ only by scope, the mark
and the sheet; a decoy second stream component caught); every earlier scan green with the four pages in its subjects
(`no-id-as-text` with the thesis id in the URL and in the COPY only); `npm test`, `npm run build`, `npm run lint` green. On
staging at 375 px, in the dated doc, the researcher signed in: `/research` — the owed strip (run B closed owing nothing: the
line saying so), the one thesis row, the framings, the corpus in numbers, the switch; `/research/theses/<run B's id>` — every
kind run B produced rendered from the live body (framing rounds, versions, three debates, the analysis, the gap decisions,
the publication attempt), the PUBLISHED = HEAD state, the citation → debate → record chain of sheets, the COPY of `thesis <id>`
pasted into a new conversation and the state message accepted (run B Live-31); `/research/corpus` with a NOT PUBLIC row and
the extraction sheet opened three deep on one capture, its rules equal to `get_article_rules` through the connector; the 401
provoked signed out and `returnTo` bringing the reader back; the 403 provoked in the fixture only (no unapproved account is
created for it); the history's size at phone width recorded (§41). Nothing written, nothing paid.

**STATUS:** OPEN. Closes with `docs/gf-ui-step-8-<date>.md`: the history size measured, the library chosen if any, the exercise. **RE-BRIEFED 2026-09-16** against the design canvas, pages 1 and 5 — docs/gf-ui-design-session-2026-09-16.md §4.

### UI-9 · `/about` rewritten, `/safety` interim, `/researchers` corrected

**Contract:** §34 :846–:865 (the facts `/about` MAY state and the three sentences it may not); §35 :867–:885 (`/safety`
DEFERRED; the interim page of three lines; the alternative — today's promises — "is a false public claim and is not
offered"); §36 :887–:894 (`/researchers` KEPT; the MCP URL from its own deployment; the three sentences re-read); §38
:910–:912 (`safety-interim`, `mcp-url-from-deployment`); §40 :938–:939 (the copy is the researcher's — ruled 2026-09-15:
drafted by the session from the design's lists, approved sentence by sentence); §32 :822–:823 (share metadata); document
§12 :1171–:1173 and document plan :229–:231, :354–:359 (the `/safety` rewrite lands with the intake dialog, the step at
which every promise on that page is true); document plan :506–:509 (no door drawn); OAuth plan §8.1 (the invitation and
the connection guide); evidence §8 (the registry is on Base); architecture §9.7, §9.8, §10.2; thesis §10.4; T5 :757;
COMPLIANCE.md's framework paragraph. Frontend only; no instrument of the backend's.

**What lands.**

- **`/about`, rewritten in place** (§34). Today's copy states three things the designs contradict — a registry on Arbitrum,
  "AI classifies, summarises and ranks every piece of evidence", "submit evidence now" — and each is a public claim the
  platform does not make. The new page states only §34's MAY STATE list, in the researcher's words: the corpus (captures
  from the Internet Archive, anchored by SHA-256 on the EvidenceRegistry on Base, one meaning per contract); every real
  change kept and diffed, nothing deleted; a thesis framed under a provision, its claim chosen after an assessed round,
  every citation a corpus record argued in a debate, published through a gate of named checks; models write and the
  researcher decides — every model output an opinion, labelled, never a fact; what is published names offices and roles,
  never a person; the source code is public; the legal frame — COMPLIANCE.md's framework paragraph in the researcher's
  words. And none of MAY NOT: a chain other than Base, AI as a ranker or a classifier-as-judge or a summariser of evidence,
  any door that is not open, a person's name, a claim the corpus does not hold. Hebrew first, English beside, each
  sentence approved before it lands. No read; no id; the short disclaimer last is not required here (§32 :813: on pages
  that render a thesis or an appeal) and is not drawn.
- **`/safety`, the interim page** (§35 :877–:880), rewritten in place: three lines, the researcher's words — submissions are
  not yet accepted; nothing sent before was kept (the rebuilt database holds no document — evidence §8; thesis §11); when
  the channel opens, this page will state exactly what is held, by whom, and what a sender keeps. No form, no address, no
  promise. Out of the nav (UI-4 already reads `lib/doors.ts`), reachable by URL. Its `robots`/share metadata the name and
  the first line. THEN, not here: the rewrite the document plan names, from document §2, §4, §5, §8, landing with the
  intake dialog after its step 32, flipping the one flag — that step's own change, on this page, and nothing here reserves
  more than the URL.
- **`/researchers`, kept with one correction and three sentences** (§36). The correction: `lib/api.ts` :126–:127 is a
  constant naming PRODUCTION on every environment, so a researcher on staging is told to connect to production first —
  the class of run B's Live-18. The constant becomes one function that composes the MCP URL from the deployment the page is
  served by — the backend origin the frontend already resolves for every fetch (`apiUrl`, `lib/api.ts` :17–:21), never a
  literal host — and the page renders it through UI-5's COPY control. The three sentences: research acts are MCP-only
  (prosecutor §10), so the "forensic scans from the UI" sentence goes; "read access is always open to everyone" becomes
  what §1 says — the published theses and the opened corpus; the invitation and the OAuth connection guide (OAuth plan
  §8.1) stay as they are. The retired `/guide/[slug]` page imports the same constant (its :8, :207): its import line moves
  to the function, one line, as UI-4 moved the header imports — the page is unlinked and leaves at UI-10.
- **Share metadata** for the three pages (§32 :822–:823): the name and the page's first sentence; no person.

**Files.** REWRITE in place: `app/[locale]/about/page.tsx`, `app/[locale]/safety/page.tsx`, `app/[locale]/researchers/page.tsx`,
`lib/api.ts` (:113–:127 — the constant and its comment become the function; nothing else in the file moves),
`app/[locale]/guide/[slug]/page.tsx` (one import line; RETIRED at UI-10), `messages/*.json` (`about`, `safety`, `researchers`
— rewritten to the approved sentences; the retired `safety` keys deleted, since `safety-interim`'s fixture is what they
said). NEW: `test/safetyInterim.test.tsx`, `test/mcpUrlFromDeployment.test.tsx`, `test/fixtures/safety/retired-phrases.json`
(the three retired promises in both languages, taken from today's `safety` namespace before it is rewritten — the fixture
is the record of what must never reappear). KEEP, `git diff` empty: `components/AuthShell.tsx`, `login`, `auth/callback`,
`oauth/interaction/[uid]`, `unlock`, `profile`, `admin`, `reports/*`, `lib/doors.ts` (the flag stays `false`; the document plan
flips it), every backend file.

*Verified by:* the two instruments green, each observed to fail first — `safety-interim` (`/safety` renders no form element,
no anchor whose target is an intake or withdrawal URL, and none of the three retired phrases in either locale; a decoy
form and a decoy phrase each caught), `mcp-url-from-deployment` (`/researchers` rendered under a fixture deployment renders
that deployment's origin + `/api/mcp`; a source scan that no file under `src` contains a literal `railway.app` host or a
literal `/api/mcp` URL string outside the one function; a decoy constant caught); `name-never-glass-fortress`,
`no-id-as-text`, `no-door-before-it-exists` (over `/safety` and `/about`) and `nav-is-the-map` (`/safety` absent) green;
`npm test`, `npm run build`, `npm run lint` green. On staging at 375 px, in the dated doc: `/about` with its approved copy
and nothing from the old page (Arbitrum, "ranks", "submit" searched in the rendered text and absent); `/safety` by URL,
absent from the nav, three lines; `/researchers` showing the STAGING MCP URL — read beside `get_environment`'s answer
through the connector — and the corrected three sentences; the share metadata of each.

**STATUS:** OPEN. Closes with `docs/gf-ui-step-9-<date>.md`: the approved copy of the three pages in both languages, the **RE-BRIEFED 2026-09-16** against the design canvas, page 6 — docs/gf-ui-design-session-2026-09-16.md §4.
exercise; the retired phrases as the fixture holds them.

### UI-10 · THE CUT-OVER — the researcher's word

**Contract:** §3 :136–:150 (the RETIRED list, thirteen pages and the widget); §32 :818–:819; A7 :1105–:1107 as ruled
2026-09-15 (ONE act at the end — §1 above); refactor plan §4 :517–:520 (rule 1: what asserts a retired concept goes in the
commit that retires it) and :540–:545 (the retired-names scan, decoy-proven); thesis plan step 25 :232–:246 and the legacy
switch's record (`docs/gf-legacy-switch-2026-09-08.md`) as the precedent — one commit, every RETIRE file gone, a dated
record of what left by tag; document plan :342–:346 (the HIDE half — the gap modal and `/submit` — deleted "in the
frontend's ONE cut-over", which is this step) and its §7 :491; triage ruling 2 :31–:34 (the twelve guide pages, their
images, and the build gate that checks them); A2 :1011 (the one 404 sentence, applied here to the router's own not-found).
Frontend only, one commit, the researcher's word to land it.

**What leaves — every tag the nine steps before it wrote, gathered.** The step's review is a list check against this list
and the earlier steps' ORPHANED lines: a file deleted that no tag names, or a KEEP file touched, is a finding.

- **Thirteen pages**: `theses/[id]/edit`, `theses/[id]/history`, `theses` (the list), `call` (the list), `evidence`,
  `evidence/[id]`, `figures`, `figures/[id]`, `forensics`, `forensics/[trackedUrlId]`, `submit`, `guide`, `guide/[slug]` — with
  the routes' directories. After this commit a retired URL is the router's not-found: `app/[locale]/not-found.tsx`, NEW, the
  one sentence of A2 :1011 and the layout's chrome, no link but the nav's — the one file this step adds, because a retired
  address must answer something and the design fixes what a 404 says.
- **Twenty-seven components**: `CategoryBadges`, `CitationSheet`, `ClaimBlock`, `DiffCard`, `EmptyState`,
  `EvidenceHighlightCard`, `EvidenceTimeline`, `FloatingChatWidget`, `FoiaModal`, `GuideStatusBadge`, `HeroSection`,
  `PublicationBadge`, `ScrollReveal`, `SkeletonRows`, `StrengthBadge`, `SurvivalChip`, `ThesisEditor`, `ThesisHighlightCard`,
  `ThesisProvenancePanel`, `ThesisPublicationPanel`, `ThesisVersionHistory`, `TierBadge`, `TipTapRenderer`,
  `TrajectoryPanel`, `WhistleblowerModal` (the document plan's gap modal), `StagingDebugConsole`, `DebugConsolePanel`.
- **Ten libraries and one type file**: `lib/citations.ts`, `lib/debugCapture.ts`, `lib/documentVault.ts`,
  `lib/evidencePerspective.ts`, `lib/guide.ts`, `lib/investigativeCategories.ts`, `lib/survivalLabels.ts`,
  `lib/targetEntity.ts`, `lib/thesisApi.ts`, `lib/thesisDocument.ts`; `types/evidence.ts`. `hooks/useAsyncData.ts`,
  `useMagicLinkFragment.ts` STAY — KEEP pages and `AuthContext` import them (`useIsHydrated.ts` left with `TopNav`, UI-4).
- **Message namespaces** — expected: `dashboard`, `submit`, `timeline`, `evidence`, `figures`, `forensics`, `chat`, `guide`,
  `categories`, `evidenceTiers`, `strengths`, `entityDisplayNames`, and the retired keys of `theses` and `home` UI-5 and UI-6
  left behind. **The scan is the authority, not this list**: a namespace is deleted only when no surviving file under `src`
  reads it (`useTranslations('<ns>')`, `t('<ns>.…')`, `getTranslations`), and the backend's two parity tests over these
  files — `test/markingLabelParity.test.ts`, `test/reportLabelParity.test.ts`, which read `marking` and the report
  namespaces — stay green and unedited, which is the proof the KEEP namespaces are whole. `he.json` and `en.json` keep equal
  key sets, held since UI-1 by `messages-parity`.
- **Dependencies and the build gate**: the four `@tiptap/*`, `@openjustice/document-vault` (the frontend's dependency only —
  the package and its `test:vault` stay in the monorepo for the document plan's step 32), and `framer-motion` if the
  UI-6 check found it orphaned; `check:guide` out of `build` and `scripts/check-guide-content.mjs` deleted; `public/guide/`
  and every image under `public/` that no surviving file references (`glass_fortress.png` among them — the name a reader
  never sees, §32), by the same rule as the namespaces: an asset scan lists the survivors, and the list here is the
  expectation. The lockfile is regenerated — `npm uninstall` needs the Wix VPN once (refactor plan §9.5).
- **The comments that still say the old surface**: `lib/api.ts` :15 (`/api/evidence/search` as the usage example) and any
  comment naming a retired route or page, found by the scan below — a sentence a file says, as the backend's rule reads.

**The instrument this step adds — `retired-names`, the frontend's** (refactor plan §4 :540–:545; the backend's
`test/walk/retiredNames.test.ts` as the shape): no file under `src` resolves an import to a retired module; no `page.tsx`
exists at a retired URL; no string value in either message file and no string literal under `src` names a retired route
(`/evidence`, `/figures`, `/forensics`, `/guide`, `/submit`, `/theses` as a bare list, `/call` as a bare list, `/edit`,
`/history` under a thesis) or `/api/evidence`, `/api/figures`, `/api/forensics`, `/api/chat`, `/api/stats`, `/api/mentions`;
no `@tiptap` import; each clause with a decoy and a vacuity guard. `nav-is-the-map` is unchanged and stays green — a
retired URL in the nav already failed it since UI-4.

**Files.** DELETED: everything above. NEW: `app/[locale]/not-found.tsx`, `test/retiredNames.test.ts`. REWRITE: `package.json`
(dependencies, `build`), `package-lock.json`, `lib/api.ts` (:15), `messages/*.json` (the namespaces), and the subject lists
of the earlier instruments where a fixture named a retired page (none should — checked at the step). KEEP, `git diff`
empty: every page of A1 landed at UI-5 to UI-9 and every KEPT page, `components/thesis/*`, `components/corpus/*`,
`components/research/*`, `components/opinion/*`, the layout, `context/`, `hooks/`, `i18n/`, `proxy.ts`, `next.config.ts`,
every backend file.

*Verified by:* `retired-names` green with every decoy caught, observed red first on the tree before the deletion (the
thirteen pages and the widget are its positive control, and it is written before the commit); every instrument of A5 green
with its subject sets reduced and no vacuity guard tripped; `npm run build` green without the guide gate; `npm test` and
`npm run lint` green in the frontend; `npm test` green in the backend, the two parity tests unedited; the CI job green; the
bundle carries no TipTap (the build's chunk list read once). On staging, in the dated doc: **every page of A1 at 375 px,
once more and in one walk — the DoD's exercise (§7)** — the public pages, the dialog reached by a link from the chat, the
read view signed in, the auth pages, `/reports/*`; each of the thirteen retired URLs answering the one sentence; the two
nav entries that 404'd at UI-4 now landing. Nothing written on staging.

**STATUS:** OPEN. Closes with `docs/gf-ui-step-10-<date>.md`: what left, by tag, in the shape of the legacy switch's
record; the namespace and asset scans' survivor lists; the A1 walk. With it, the document plan's :342–:344 and §7 :491
point here for the HIDE half, and the thesis plan's :76–:79 ruling is discharged.

## 4. THE TEST RULES

The refactor plan's §4 :512–:551, every rule, no exception: a test asserting a retired concept is deleted in the commit
that retires it (UI-10); a KEEP file is never edited (the backend's acceptance suites through UI-2 and UI-3, its two parity
tests through UI-10); a REWRITE file is rewritten to the appendix in the step that lands the shape, its old version gone
with the code it tested (`publicThesisRoutes.test.ts` at UI-3); the acceptance suite is written first, from the contract,
and fails until the step reaches it. One rule is added for the frontend, and it is rule 4 read the other way, as §1 says:
**no page lands without its A5 instruments green, and no instrument is green before it was observed red on its decoy.** A
page whose instruments exist only in the plan is a page that is not done.

What the source scans hold here, from UI-1: no new file imports a retired module — `@tiptap/*`, `lib/thesisApi`,
`lib/thesisDocument`, `lib/guide`, `lib/documentVault`, any component of UI-10's list; no file under `src/app` imports a
header (UI-4); no public page component imports the labelled container (UI-5); nothing under the research pages issues a
non-GET (UI-8); after UI-10 no file under `src` and no message value names a retired page, route or tool. What the render
scans hold, from the step that adds each page's fixtures: no id as text, bidi isolation, the label over every opinion, the
statement first, the notice alone. Every scan takes its subject set as a value, carries a decoy, and fails on an empty set.

Three rules of this plan's own, each named where it bites:

- **Fixtures are written from the appendices, never from the backend's answers** (UI-5, UI-7, UI-8). A fixture copied from a
  live body asserts whatever the body was that day; a fixture written from A5 asserts the contract. The cost is a drift the
  frontend suite cannot see — a route body that moves away from the appendix — and the staging exercise of every page step
  is what catches it; §8 names it.
- **Copy lands approved or not at all** (UI-4 to UI-9). Every Hebrew and English sentence a page shows is drafted from the
  design's lists and approved by the researcher before the step's PR; a label that reached the tree unapproved is a finding,
  not a LOW.
- **The exercise is read from the DOM, never from a screenshot alone** (§6). A dated doc records what was measured — the
  scroll width, the state provoked, and — since the retirement — that the read reports NO sticky element, beside the picture.

## 5. THE TEST INVENTORY — EVERY INSTRUMENT, ITS FILE, ITS STEP, AND WHAT IT HOLDS **AMENDED 2026-09-16:** UI-4b's six instruments are named in §9 and join this table in the step's landing PR. **JOINED 2026-09-17, named here rather than as rows because a row added inside this table moves every `:line` citation below it:** `nav-is-the-map` re-pointed at the sidebar (`navIsTheMap.test.tsx`, UI-4b) · `recents-are-local` (`recentsAreLocal.test.tsx`) · `two-centres-by-url` and `shell-mounted-once` (`shell.test.tsx`) · `sheet-primitive` (`sheetPrimitive.test.tsx`) · `tokens-only` (`tokensOnly.test.ts`) · `no-emoji` (`noEmoji.test.ts`) · `fonts-are-local` (`fontsAreLocal.test.ts`) — SEVEN instruments in seven files, which §9 counts as six because `shell.test.tsx` holds two; and `no-id-as-text` gains the sidebar as a subject. **JOINED 2026-09-18 (UI-5), in the heading for the same reason — a row added inside the table moves every `:line` citation below it:** `statement-and-disclaimer-first` (`statementFirst.test.tsx`) · `no-model-voice-public` · `notice-only` · `no-door-before-it-exists` · `diff-consecutive-published` · `bidi-isolated` · `no-id-as-text` · `valid-nesting` · `public-read` · `text-diff` · `text-sources-only` · `letter-only-resolved` · `pane-tabs-declared` · `built-as-drawn` · `every-markdown-capability` · **`researchers-markdown`** · **`palette-is-the-system`** — SEVENTEEN instruments in seventeen files, the last two added 2026-09-18 with `built-as-drawn`’s ninth property, which a decoy that reddened NOTHING is what found. **JOINED 2026-09-19 (UI-7), in the heading for the same reason:** `provision-is-a-lookup` (`provisionIsALookup.test.tsx`) · `theses-list-is-the-catalogue` (`thesesListIsTheCatalogue.test.tsx`) — NINETEEN instruments in nineteen files, and the frontend suite moves 34 → 36 suites / 259 → 267 cases across UI-7's chunks. The first landed one commit BEFORE this line, which is the debt this amendment closes: an instrument without an inventory line cannot be cited by name, and a finding that cannot cite an instrument is not a finding.

The frontend has no test today, so this inventory is what the plan CREATES; the backend's rows are the files the routes
touch, tagged as the thesis plan's §5 tags them. **Instruments, by file** (the frontend's `test/`, unless marked backend):

| instrument | file | step | holds |
|---|---|---|---|
| `name-never-glass-fortress` | `nameNeverGlassFortress.test.ts` | UI-1 | no message value, string literal or JSX text names Glass Fortress; comments excluded |
| `route-is-tool` (backend) | `test/routeIsTool.test.ts` | UI-3 | every §6/§7 route's body byte-equal to its tool's for the same input; a route with its own query fails |
| `one-page-is-the-corpus-at-one-page` (backend) | `test/evidence/corpusReads.test.ts` | UI-2 | `list_findings(url)` = `list_corpus({ page })`'s rows; the same for trajectories and search |
| `public-identical` (backend) | `test/routeIsTool.test.ts` | UI-3 | every §6 route identical with and without a session; the three 404s identical |
| `no-model-prose-public` (backend) | `test/routeIsTool.test.ts` | UI-3 | thesis A7 :1688 over every §6 body; `opinion` on a diff the one allowed field |
| `gate-by-prefix` (backend) | `test/routeIsTool.test.ts` | UI-3 | one gate at the `/api/research` mount; no handler reads a caller id to filter |
| `no-surveyed-page-anonymous` (backend) | `test/routeIsTool.test.ts` | UI-3 | no public route lists TrackedUrl rows; `scope: 'all'` without identity refused on every route and tool |
| `pages-facet-equals-scope` (backend) | `test/evidence/corpusReads.test.ts` | UI-2 | the facet = PUBLIC_PAGE's set at `public`, `list_pages`' at `all`; `public: bool` true at `public` |
| `nav-is-the-map` | `navIsTheMap.test.tsx` | UI-4 | the chrome's anchors = §32's set per identity; `/safety` absent until the flag; no page imports a header |
| `statement-and-disclaimer-first` | `statementFirst.test.tsx` | UI-5 | the first two content elements of `<main>` on `/theses/[id]` and `/call/[id]` |
| `no-model-voice-public` | `noModelVoicePublic.test.tsx` | UI-5 | a planted `analysis` renders nothing; no public thesis component imports the labelled container |
| `notice-only` | `noticeOnly.test.tsx` | UI-5 | a withdrawn fixture renders the date and the disclaimer and no other text node |
| `no-door-before-it-exists` | `noDoorBeforeItExists.test.tsx` | UI-5 | no anchor to an intake or withdrawal URL on any public page while `lib/doors.ts` is false |
| `diff-consecutive-published` | `diffConsecutivePublished.test.tsx` | UI-5 | the history's diff equals the fixture's; every moved pin listed |
| `diff-is-of-two-texts` | `textDiff.test.ts` | UI-5 | the function takes exactly two texts; its output on a fixture |
| `bidi-isolated` | `bidiIsolated.test.tsx` | UI-5 | every hash, URL and timestamp inside Hebrew text is inside an isolating element |
| `no-id-as-text` | `noIdAsText.test.tsx` | UI-5, every page after | no 64-hex, cuid or 14-digit timestamp as a text node outside VERIFY or a COPY value |
| `opinion-labelled-on-corpus` | `opinionLabelledOnCorpus.test.tsx` | UI-7 | every `opinion` field under the label; no other model field on a public corpus page |
| `record-page-witnesses` | `recordPageWitnesses.test.tsx` | UI-7 | the archive link composed; the chain fetch only on the press; `CHAIN_UNAVAILABLE` as a statement |
| `filter-is-a-query` | `filterIsAQuery.test.ts` | UI-7 | no corpus page fetches a second read for a filter |
| `every-kind-renders` | `everyKindRenders.test.tsx` | UI-8 | all seventeen turn kinds (A4 :1476, RULED 2026-09-20) render a row and a sheet |
| `opinion-under-label` | `opinionUnderLabel.test.tsx` | UI-8 | every assessed round, debate assessment, analysis, publication assessment under the label |
| `three-voices` | `threeVoices.test.tsx` | UI-8 | one component per voice; no opinion or verdict through the researcher's |
| `no-write-from-research` | `noWriteFromResearch.test.ts` | UI-8 | nothing under the research pages issues a non-GET or posts a form |
| `no-marking-link-from-research` | `noMarkingLinkFromResearch.test.tsx` | UI-8 | no anchor to `/article-rules/…` from the read view |
| `one-stream-two-doors` | `oneStreamTwoDoors.test.tsx` | UI-8 | `/corpus` and `/research/corpus` from one component, differing only by scope, the mark and the sheet |
| `safety-interim` | `safetyInterim.test.tsx` | UI-9 | `/safety` renders no form, no intake anchor, none of the three retired phrases |
| `mcp-url-from-deployment` | `mcpUrlFromDeployment.test.tsx` | UI-9 | `/researchers` renders its deployment's origin; no literal host under `src` |
| `messages-parity` (this plan's) | `messagesParity.test.ts` | UI-1 | `he.json` and `en.json` have equal key sets |
| `retired-names` (this plan's) | `retiredNames.test.ts` | UI-10 | no retired module imported, no retired URL served, no retired route or page named |
| the browser exercise | a dated doc per step; the A1 walk at UI-10 | UI-4 to UI-10 | every page of A1 at 375 px on staging: no horizontal scroll, no sticky element in the public read (retired 2026-09-18), A2's states provoked |

Twenty-eight of A5, two of this plan's, and the exercise. The helpers — `test/render.tsx`, `test/scan.ts`, `test/setup.ts` —
hold nothing themselves and are exercised by the first instrument each serves.

**The backend's files the plan touches**, tagged:

| file | tag | step | what it holds |
|---|---|---|---|
| `test/thesis/reads.test.ts` | KEEP | — | :159 "their own theses", :400 "another's thesis owes them nothing" — the `mine` default, byte for byte |
| `test/thesis/publicReads.test.ts` | KEEP | — | the three public thesis reads; asserts no `pages` shape |
| `test/thesis/scope.test.ts` | NEW | UI-2 | the `all` case per tool; the default unchanged — beside `reads.test.ts`, ruled 2026-09-15 |
| `test/evidence/corpusReads.test.ts` | NEW | UI-2 | §6.1 and §28's cases, written first, red by name until the modules exist |
| `test/evidence/*`, `test/walk/*` (existing) | KEEP | — | the corpus and evidence contracts; unedited by the UI-3 split |
| `test/mcpToolClassification.test.ts` | KEEP, the list moves | UI-2 | the registered surface = the designed tools; 42 → 45 |
| `test/publicThesisRoutes.test.ts` | REWRITE | UI-3 | :192 `pages` to the amended A5 :1569; the call route |
| `test/routeIsTool.test.ts`, `test/corpusRoutes.test.ts`, `test/researchRoutes.test.ts` | NEW | UI-3 | the five instruments; every route's statuses per A2 and §6's table |
| `test/walk/retiredNames.test.ts` | extended, as at 11a | UI-3 | `/api/forensics` and `/api/stats` as sentences no file may say |
| `test/markingLabelParity.test.ts`, `test/reportLabelParity.test.ts` | KEEP | — | the frontend's `marking` and report namespaces whole — the proof at UI-10 that the KEEP namespaces survived |

## 6. VERIFICATION — WHAT "VERIFIED" MEANS AT EACH STEP **AMENDED 2026-09-16:** from UI-4b every page step is designed and approved as an IMAGE before its code, and its exercise sets the built page beside the approved board (`docs/gf-ui-design-session-2026-09-16.md`; §9, §10).

As the refactor plan's §6 and the thesis plan's: a step is verified by its instruments green, each observed to fail on its
decoy first; by `npm test`, `npm run build` and `npm run lint` green from the workspace it changed, by absolute path (the
backend for UI-2 and UI-3, the frontend for the rest; both at UI-10); by the CI run green on the PR; and — for UI-4 to
UI-10 — by the browser exercise on staging with its record in the step's dated doc. `LAND`'s post-condition, the drift
check, runs at UI-2 and UI-3 as at every backend step and is expected to say "No difference detected", since neither carries a
migration. A frontend step's `LAND` is not done until the staging FRONTEND deploy reads `SUCCESS` — the service the backend's
deploy polls never name — and the exercise runs against that deploy.

**The browser exercise, defined once** (A5 :1089–:1090; §41 :963–:964; the document plan's precedent :491–:493). A session's
browser tools against the staging frontend, the staging cookie set through `/unlock`, the viewport 375 × 812. For every page
the step lands, in the order A1 lists them:

1. **Predict on record before reading** — what the page will show from the live body, which state, which links — the run B
   protocol; a prediction that fails is a finding, not a note.
2. Navigate; read from the DOM, not the picture: `document.documentElement.scrollWidth <= 375`; **after scrolling to the
   middle of the page, ZERO elements of the public read compute `position: sticky`** (the context line is retired — the
   reading that replaced it, and the one jsdom can never take); the first two content elements of `<main>` where
   §17 applies; the anchors present, against the step's expectation.
3. Provoke the states of A2 that staging can provoke without a write — a made-up id, a filter that matches nothing, signed
   out on a gated page, `?since` on the working view — and say in the record which states were provoked in the fixture only
   and why (a withdrawal, a 403, `CHAIN_UNAVAILABLE`).
4. Read the same thing through the connector once where a body has two doors — the VERIFY hashes beside `list_findings`, the
   corpus route's body beside `list_corpus`, the rules sheet beside `get_article_rules` — so the exercise is also the
   two-door proof on real data.
5. Record: the readings, the predictions with their outcome, the screenshot beside each reading, the measurements §41 asks
   of this step. Nothing on staging is written by the exercise; a research act needed for a state (a withdrawal, a second
   publication) is the researcher's, asked for and recorded as theirs.

**The reading test** (§41 :961–:962) is part of UI-5's exercise and is the researcher's: the public thesis page is read once
by them, before it ships, and their answer — whether the researcher's words and the platform's marks read apart — is
recorded verbatim. **The measurements** — the chronology's density (UI-7), the history's size at phone width (UI-8), the
chain check's press rate (from UI-7, read from the backend's request log) and the copy controls' use (read from the next
unsteered run's transcript, after this plan) — are recorded where they are first read and moved by nothing in this plan.

## 7. DEFINITION OF DONE

- every instrument of A5 is green, each having been observed red on its decoy, and `retired-names` and `messages-parity`
  with them; the frontend's jest job is a REQUIRED check on `staging`;
- every route of §6 and §7 is mounted, `route-is-tool` holds every one, `/api/forensics` and `/api/stats` are gone, and the
  MCP surface is A4's plus §6.1's three, with `mcpToolClassification` agreeing;
- every RETIRE file is gone and every KEEP file unchanged: the backend's acceptance suites since UI-2, its two parity tests
  since UI-10, `reads.test.ts` :159 and :400 green and unedited;
- every page of A1 has been rendered at 375 px on staging with no horizontal scroll and no sticky element in the read, in one
  walk, in UI-10's dated doc; each of the thirteen retired URLs answers the one sentence; `nav-is-the-map` is green;
- the public thesis page has rendered a published thesis on staging and the reading test is recorded — thesis plan :327
  CLOSED, with its pointer;
- every sentence of copy on `/`, `/about`, `/safety`, `/researchers`, the footer, the root metadata and the page labels is on
  record as approved, in both languages;
- the ten dated docs exist, `docs/gf-ui-step-1` to `-10`, each named in its step's `STATUS:` line; the §6.1/§28 amendment,
  the thesis plan's :327 pointer and the document plan's :342–:344 and §7 :491 pointers are in git;
- the measurements of §41 that this plan can start have a first reading on record: the density, the history's size;
- **at `SHIP`**: production's public pages ship empty and true (A7 :1111) — the door's EMPTY sentence with the paragraph
  alone (thesis plan :83–:84), `/corpus` saying no page is open, `/researchers` naming PRODUCTION's MCP URL from its own
  deployment, `/safety` the interim three lines and out of the nav — read on production in the `SHIP` record; and the
  intake-down check of the document plan (:506–:509) read there too: the deployed frontend draws no door and the deployed
  backend mounts no intake route.

## 8. HAZARDS, NAMED

- **The intake-down window** (document plan :506–:509). From UI-5 the public page's appeals carry the intake instruction as
  text and no anchor; the door is the document plan's step 32. `no-door-before-it-exists` holds the page; `SHIP` checks the
  deployed pair. What this plan must never do is draw the door early because the text reads awkwardly without it.
- **A page against a route not landed** (thesis plan :331–:332; A7 :1108–:1109). UI-3 is the whole answer, and its
  `route-is-tool` is the proof; a page step that finds a route missing stops and reports rather than fetching `/api/mcp` or
  composing a second read (§8 :339–:342).
- **The cut-over's blast radius.** UI-10 deletes thirteen pages, twenty-seven components, ten libraries, twelve namespaces and
  five dependencies in one commit. Its review is a list check against the tags the nine steps wrote; the scans, not the
  lists, decide the namespaces and the assets; the backend's two parity tests are the tripwire for a KEEP namespace cut by
  mistake. A file deleted that no tag names is a finding.
- **The hard-coded production MCP URL** (`lib/api.ts` :126) stands until UI-9: a researcher on staging is told to connect to
  production until then, the class of run B's Live-18. Every DEV brief before UI-9 says so; nobody follows that page's
  instruction on staging in the meantime.
- **The nav points at two 404s between UI-4 and UI-7/UI-8.** By design (§1: the nav is the map from UI-4); the dated docs of
  UI-4 to UI-6 record it. A `SHIP` inside that window ships a public nav entry to a 404: **`SHIP` waits for UI-8 at the
  earliest**, and the researcher decides whether it waits for UI-10 — this plan recommends UI-10, since the retired pages
  are dark on production either way and one `SHIP` of the whole surface is one exercise.
- **Fixture drift.** The frontend's fixtures are written from the appendices; a route body that drifts from its appendix
  passes the frontend suite and breaks the page. `route-is-tool` holds the route to the tool; the acceptance suites hold
  the tool to the appendix; the staging exercise of every page step is where the chain is read end to end on real data.
  No cross-suite vector is built for it here — the document plan's step 32 builds one for the hash, and if the exercise
  ever catches a drift, the same shape is the fix and is filed then.
- **Every install needs the Wix VPN, and the lockfile remembers where it resolved** (refactor plan §9.5). UI-1 and UI-10
  install and uninstall; a `package-lock.json` regenerated through the Wix registry carries `resolved` URLs CI cannot reach.
  The DEV session checks the lockfile's `resolved` fields name the public registry before the PR, and the CI run is the
  proof.
- **The `returnTo` on gated pages** (UI-8) is an open-redirect surface. It is threaded exactly as the OAuth plan's login
  already validates it (§5.2 — same origin, a path, never a full URL), and `proxy.ts` :62–:65 already drops the query on the
  unlock redirect for the same reason; UI-8 adds no second validator.
- **The two lists that only a scan can settle** — the message namespaces and the public assets at UI-10 — are stated as
  expectations because a grep by hand once called `stagingApiAuth` dead in this very session; the scan with its vacuity
  guard is the authority and the dated doc prints its survivor list.
- **Copy is the slow gate.** UI-4, UI-5, UI-6, UI-7, UI-8 and UI-9 each wait on approved Hebrew; a step can be green in every
  instrument and not done. The brief for each says: draft every sentence first, in one message, and land nothing until
  the researcher's word on all of them.

## 9. UI-4b · THE SHELL — the sidebar, the centre, the tabbed right pane, the Sheet, the tokens. Added 2026-09-16.

Appended here rather than between UI-4 and UI-5 so that no existing line of this plan moves — §4 is cited by line from code. The
step's number says where it belongs: after UI-4's chrome, before the re-briefed UI-5. Ruled by the researcher on 2026-09-16 with
the UX design session (`docs/gf-ui-design-session-2026-09-16.md`).

**Contract:** `docs/gf-ui-design-session-2026-09-16.md` §1.1–§1.3, §1.6 (the Sheet), §1.8 (the system), §3 (the amendments to §4, §14,
§22, §30, §32 of the UI design), §4 (this step); the design canvas, page 1 (boards A–F) and page 7 (the system sheet) — the approved
images this step is compared against; `docs/gf-ui-flows.md` §32 as amended (the sidebar IS the nav), §4 :167–:178 (no id as text — the
sidebar's recents included), §8 (one read per page; a recents list is browser-local state, never a read), §39 (state and who may
write it); UI-4's landed chrome (`SiteHeader`, `SiteNav`, the locale layout) as the "from"; §4 :880–:883 of this plan (bodies
hand-written from the appendix — nothing here reads a body). Frontend only.

**What lands.**

- **The shell, mounted once** by `app/[locale]/layout.tsx`: a LEFT SIDEBAR, a CENTRE, a RIGHT PANE, a SPLITTER between the centre and
  the right pane, and a drag edge on the sidebar. The sidebar is resizable and collapsible; the right pane is resizable; both widths and
  the collapsed state are browser-local. No page renders chrome of its own; the centre is the page's `<main>` as every page already
  renders it.
- **The sidebar is the nav** (§32 amended): the name as TEXT at its top, no dove; the categories תזות and הארכיון, the archive with a
  **the search icon is REMOVED (the researcher, 2026-09-18; built UI-7 chunk C, 2026-09-19)** — it led to
  `/corpus/search`, which 404s: the search page is DEFERRED until the corpus is large enough to need it, while
  `GET /api/corpus/search` stays mounted and unused. A control that leads to a 404 is the defect `nav-is-the-map`
  exists for; under each category the items opened IN THIS BROWSER, newest-watched first, each named as a
  person recognises it — a thesis by its claim's first words, a page by its domain and path, a record by „צילום · <date>” — never an
  id; at the foot the public entries אודות · לחוקרים · the locale control, a signed-in researcher's מחקר and handle, an admin's ניהול,
  exactly the set `nav-is-the-map` holds today, and הגנה only when the door flag is live. On a phone the sidebar is a drawer from the
  menu control, as the nav is today.
- **The right pane is a tab strip and an area**, empty on every route at this step: the tabs are declared by the page (UI-5's re-brief
  declares the first ones, §10), the active tab is browser-local, the pane collapses to nothing when a page declares none. On a phone
  the pane's content opens full-screen with a back control, one layer at a time.
- **Two centres by URL, none by identity:** the shell chooses nothing; the route's page IS the centre. A source scan holds that nothing
  under `components/shell` imports `AuthContext` except the sidebar's identity level, which is the nav's existing read.
- **ONE Sheet primitive** (`components/Sheet.tsx`): Escape closes, focus is trapped while open and returned on close, the body's scroll
  is locked, `role="dialog"` and `aria-modal` are set by it and by nothing else. The citation chip's portalled sheet moves onto it in
  this step — the one existing sheet, so the primitive is proved on real content; every later sheet, dialog and drawer uses it.
- **The tokens and the fonts:** the colour tokens of the session's §1.8 defined once in `globals.css` and used by name; no raw colour
  outside the token block; Frank Ruhl Libre (already at `app/fonts/`) and Heebo, both self-hosted through `next/font/local`, the
  serif for the researcher's words and headings, the sans for the chrome and the marks — the two voices' faces. The type scale of the
  system sheet as CSS custom properties.
- **The eight glyphs** in one file (`components/glyphs.tsx`), currentColor SVG on a 16 grid; no emoji anywhere under `src/` — a scan
  with a decoy.
- **Copy:** every label the sidebar and the shell add is drafted and approved before landing — the category name תזות, the two drag
  handles' accessible names, the collapse control's — and the existing chrome strings are reused as they stand.
- **No read, no write:** the shell issues no request; the recents list lives in `localStorage` under one key, written by the pages that
  render a thesis, a page or a record, read by the sidebar.

**Files.** NEW: `components/shell/Shell.tsx`, `Sidebar.tsx`, `RightPane.tsx`, `Splitter.tsx`; `components/Sheet.tsx`;
`components/glyphs.tsx`; `lib/recents.ts`; `app/fonts/heebo-*.woff2`; `test/fixtures/shell/` (a recents list of the three kinds; an
empty one; a page declaring two tabs; a page declaring none); the instrument files below. REWRITE in place: `app/[locale]/layout.tsx`
(mounts the shell), `app/globals.css` (the tokens, the scale, the shell's primitives), `components/thesis/CitationChip.tsx` (its
sheet onto `Sheet`), `components/SiteNav.tsx` (its list and level function become the sidebar's — one list, moved, not copied),
`messages/*.json` (`common.nav`, `common.chrome`). RETIRE here (replaced in place, tagged): `components/SiteHeader.tsx`. KEEP,
`git diff` empty: every page under `app/[locale]`, `components/thesis/*` but the chip, `lib/api.ts`, `lib/doors.ts`,
`context/AuthContext.tsx`, every backend file.

*Verified by:* the instruments green, each observed red on its decoy first — `nav-is-the-map` re-pointed at the sidebar (the set and
order per identity unchanged; a decoy entry caught), `recents-are-local` (a source scan: nothing under `components/shell` or
`lib/recents.ts` fetches or reads a route; a render over the fixture shows the claim's words, the domain and path, „צילום · <date>”
and no 64-hex, cuid or 14-digit string — `no-id-as-text` gains the sidebar; a decoy id caught), `two-centres-by-url` (no
`AuthContext` import in the shell but the sidebar's level; a decoy import caught), `sheet-primitive` (Escape closes, focus trapped and
returned, in jsdom; a scan that no other file under `components` carries `role="dialog"` or `aria-modal` — a decoy caught),
`tokens-only` (no raw hex or named colour under `src/` outside `globals.css`; a decoy caught), `no-emoji` (a decoy caught),
`shell-mounted-once` (the layout mounts it; no page imports it); `name-never-glass-fortress`, `messages-parity`, `bidi-isolated`
still green; `npm test`, `npm run build`, `npm run lint` green. The six new instruments join §5's inventory in the step's landing PR.
On staging, in the dated doc, at 375 and at 1440: the shell on every route with the landed thesis page in the centre; the recents
after opening the thesis and its page; the drawer on the phone; the citation sheet closing on Escape with focus returned;
`document.fonts.check` true for both faces **— AMENDED 2026-09-17 (F8, the researcher's ruling): the SERIF half of that reading MOVES TO UI-5. Measured on `1dc1231`: both Frank Ruhl Libre faces report `unloaded` and check FALSE, because NOTHING APPLIES `--font-serif` — 182 elements under `main` resolve to the sans, 7 to the mono, ZERO to the serif, and no rule outside `:root` names it. The faces are in the tree, self-hosted and correct; no glyph has yet rendered in one. Every page that would apply the serif is KEEP at UI-4b. Both HEEBO faces DO load and check true here.**; **the rendered shell set beside canvas page 1 boards A, B, D and E, screenshot beside
screenshot, the DOM measured for what the boards fixed (the element order, the widths, the tokens), and the researcher's reading of
the comparison recorded verbatim.**

**STATUS:** **CLOSED 2026-09-17 — `docs/gf-ui-step-4b-2026-09-17.md`** (#500 → `staging` `1dc1231`; frontend deploy SUCCESS, backend SKIPPED, drift clean). The record carries the approved copy and its freeze sha, the four faces' measured coverage, both seats' decoys, the five defects only a browser found, the canvas comparison with the researcher's reading verbatim, the exercise 11 HIT · 1 MISS · 1 limit, **F8 — the serif applied to nothing, ruled (b) and moved to UI-5** — and the reading test's FAILURE in the researcher's own words. Closed with `docs/gf-ui-step-4b-<date>.md`: the approved copy, the fonts' sizes, the comparison against the
boards, the exercise.

## 10. THE RE-BRIEFS OF UI-5 TO UI-9 AGAINST THE DESIGN CANVAS — 2026-09-16

Each block amends its step's *What lands* for the shell and the approved boards; everything a block does not name stands as the
step says. The binding image is the canvas page; the binding words are `docs/gf-ui-design-session-2026-09-16.md`. A step's DEV brief
cites the step's body AND its block here; where they disagree, the block wins, dated.

**UI-5, pages 1–3.** The thesis page renders in the centre under the shell: the preface FOLDED to one line that opens (document
order unchanged); the claim, the provision, the byline with the COPY; the TICK LINE of the cited captures under the byline; the text
with each citation a DATED TICK carrying one status dot, the marks' words in the record; one card leading to the call page — region 4,
the appeals, is gone (R56); the case, the history, the pages and VERIFY as folds, closed; the short disclaimer last. The citation
record, the call page and a previous version open as RIGHT-PANE TABS at width and full-screen on the phone, on the Sheet of UI-4b.
The call page is the legacy shape (page 3, board A) and the letter its dialog (board B) with the six ruled decisions; „קריאה לעדים”
muted when `appeals.call` is empty. `theses.sheet.capture` renamed to „צילום”. `statement-and-disclaimer-first` holds document
order, not the fold; `no-id-as-text` gains the tick and the tabs. Copy to approve first: the state tabs, „להכנת המכתב”, „…ועוד N”. **AMENDED 2026-09-17: UI-5 also APPLIES `--font-serif` — the claim at 24/22 FRL 700 and the researcher's words at 17/16 at 1.75, §1.8's two voices — and OWES the reading UI-4b could not give: `document.fonts.check` true for BOTH Frank Ruhl Libre faces on a page that actually uses them (F8). It carries THE TYPE SCALE with them, measured wrong on `1dc1231` (the claim Heebo 24 px/600, the researcher's words **14 px** where the design says 17). And it RE-RUNS THE READING TEST, whose answer at UI-4b was the researcher's own: „currently it is not clear”.** **AMENDED 2026-09-17 (the call): the call area — the PAGE and its right-pane TAB alike — is a SHAREABLE CALL TO ACTION and not a second reading: what is being proved, WHAT IS MISSING, and what a reader can do. The objections are NEVER shown; what weakened the claim appears as what is missing (ui flows §16 :517–:521; §21 :621). The TAB is board 3A MINUS the folded preface and the full disclaimer, which the centre already carries; the PAGE keeps both (COMPLIANCE.md :92). The call-to-action is WRITTEN behind `lib/doors.ts`' `DOORS_OPEN` and is NOT DRAWN until the document plan's step 32 — a drawn door with no destination is what ui flows §21 :622 forbids.**

**UI-6, page 1 board A and page 6 board D.** The door is the centre's EMPTY state: the dove and the glow above the name, the
approved lede, the thesis cards, the three entries, the short disclaimer; the sidebar shows nothing under its categories until
something is opened. No animation anywhere but here. **AMENDED 2026-09-17:** the door's field is the dark `--door-field` `#0F172A` — UI-6 lands it as a token in `globals.css` and takes `app/[locale]/page.tsx` off `tokens-only`'s allow-list; the dove, the glow and the light animation are drawn ON that field, and the animation honours `prefers-reduced-motion`.

**UI-7, page 4.** The chronology opens on the PAGE CARD with the TIME STRIP — captures as dots, cited captures ringed, diffs as bars
by chunk count — which is also the scrubber; the stream oldest-first under month headers, a capture a thin row, a diff a card with
removed/added bars and the labelled opinion clamped; a record opened from a row is a right-pane tab. A SEARCH page
`/corpus/search?phrase=` over the existing route, one row per capture, present or absent in the stored text. The CLAIMS view — PER PAGE, `page` REQUIRED, no top-level lens (§25, ruled 2026-09-18; this re-brief had said "the claims lens", corrected in place 2026-09-19) — with a
run strip per claim and the claim's sheet on the right. The capture page whole with the second witness and the chain check; the diff
page with the two texts side by side and the chunks marked where they stand. Hebrew names for the classifier's `categories`. Copy to
approve first: the lens names, the filter chips, the six drafted sentences of page 4.

**UI-8, page 1 board C and page 5.** The thesis column is the centre (RULED 2026-09-21 (the researcher, R68 „אופציה ב”), superseding board C); the RIGHT-PANE TABS are (תמליל · ציטוטים ·
פערים · ניתוח · מסגור · פניות לציבור); the seventeen turn kinds (RULED 2026-09-20) render with the eight glyphs of UI-4b, the gap decision in both shapes, every
model field inside the labelled container with the model and prompt version beside the label, every verdict a mark beside its
sentence; the owed strip above the stream. Copy to approve first: the owed line, the tab names.

**UI-9, page 6.** `/about` with the dove at its head and the six sections of §34 in the researcher's approved words; `/safety` the
three lines; `/researchers` with the two corrected sentences and the MCP URL from the deployment. Copy to approve first: all of it.
