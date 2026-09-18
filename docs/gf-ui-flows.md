# UI flows — dialogs, the researcher's read view, the public surface

**How the BROWSER serves the platform: what a page is allowed to be, what every page reads, and how the
corpus and a thesis are shown to a reader and to a researcher.** The four designs deliberately handed
rendering to "the frontend" (evidence §10, thesis §13, evidence A5, document §12); this document is that
frontend's design, and it adds nothing beneath the browser.

> **STATUS.** The TARGET flows, decided section by section with the researcher on 2026-09-15, in a
> design session that touched no file. What fell to the researcher's rulings, each a mechanism named:
> every read the browser needs is a ROUTE THAT IS A TOOL'S ANSWER, one function serving both (§5, Q2 = b);
> the UI has THREE USES and no fourth — a dialog opened by link, a READ VIEW of every researcher's work
> gated to researchers (the main focus), the public surface — and the public's doors are reserved, not
> built (§1); the read view shows every researcher's work through an optional `scope` whose DEFAULT is
> unchanged, so no claude.ai flow reads differently (§7.1); the corpus is a CHRONOLOGY across pages with
> two lenses and three new reads, never a list of addresses (§1, §6.1, frame A); no hash and no id is shown
> as text — a COPY control carries the chat-ready form, a VERIFY disclosure holds the values (§4); mobile
> first, every page at phone width before it widens (§4). ⚠️ marks a route, read or page that does not
> exist at `staging` HEAD (`6f9169e`, 2026-09-15): of §6 and §7 only the three public thesis GETs and the
> marking page's routes exist; every page of §2 except the marking page and the auth pages is to build.
> Nothing is left OPEN: what is out of scope is §40, what is verified by measurement is §41, and the
> APPENDIX is the implementation contract, composed with the four designs' appendices and restating
> none. Four things stay THE RESEARCHER'S, marked where they are: where the name leads (§32), the
> `/call` list (§3), the copy of `/about`, `/safety` and the door (§33–§35), and the cut-over (A7).
>
> **SCOPE.** The browser: the marking dialog as it is, the researcher's read view, the public surface,
> the layout every page shares, and the routes those pages read. The public's doors — intake, withdrawal,
> the `#doc_` sheet, the documents register, `/safety`'s final copy — are the document plan's steps 32–35
> and are reserved here. Bronze Fortress is untouched.

## 1. THE THREE USES, AND WHAT EACH IS ALLOWED TO BE

**All state is written in claude.ai, through MCP tools, by the researcher. Ruled 2026-09-15.** The browser writes
nothing: a dialog returns a command (thesis §2 :126–:132), a read view reads, the public surface reads. This
document adds no write to the browser and no research act to any route (prosecutor plan §10 :311–:313).

```
DIALOG        opened by a LINK the chat hands over, when a judgement needs more than text — the marking page
              today (interaction MARKING :517, A6 :1227). Not in any navigation; unreachable by browsing; a
              deterministic URL composed by the backend (A6 :1265–:1267). Identity: a researcher's (A6 :1229).
READ VIEW     the researcher's work, read-only, GATED to researchers: every act on a thesis and every recorded
              opinion, the corpus as a whole, what is owed. Thesis §9 :1003–:1005 — "any researcher READS any
              thesis's working state ... gated from the public, not from colleagues". THE MAIN FOCUS.
PUBLIC        the reader's surface: the published theses and the corpus pages publication opened (evidence §5
              :464–:479; T5 :793–:832). No identity; identical bytes for everyone (evidence A4 :1074; thesis A7 :1686).
DOOR          the public's writes — intake, withdrawal (document A5 :1487–:1502). OUT OF SCOPE NOW (ruled
              2026-09-15); the map reserves their URLs and nothing else.
```

**What the READ VIEW can show, said precisely.** The platform holds no chat transcript: there is no session and
no event log (thesis §9 :956–:984). What it holds is the HISTORY, derived — "every row that names the thesis, in
time order, each attributed: framings and their rounds · versions · arguments (debates) · analyses · gap
decisions · publication attempts · withdrawals · notes" (§9 :974–:978) — and, beside each act, the opinion a
model recorded through it: the framing assessment, the debate's verdict, the critic's analysis, the publication
assessment, each labelled as AI analysis (COMPLIANCE.md rule 3; thesis §2 :168–:169). That is the shaped
conversation, and it is what the view renders. It never renders a line the researcher typed that no tool recorded.

**The corpus is shown as a CHRONOLOGY, never as a list of addresses. Ruled 2026-09-15.** The walk is the chat's
(interaction :52–:60), and a browser keyed by tracked URL was the old walk's cockpit. What the corpus is FOR when
read is two timelines — "a knowledge point paired with a disclosure interval… this platform already computes
both timelines" (prosecutor §4 :87–:93) — and the researcher's question is dated, not addressed: what did the
pages say, and when did that change (researcher day :31–:32, :54–:62). So the corpus is ONE STREAM across every
page in timestamp order, each entry a record (a capture or a diff, evidence §1) with its page as a label; the
selected and the unselected both in view (architecture §9.2 :326–:330). Two LENSES sit over the same stream and
add no frame of their own: CLAIMS — the trajectories, "removed and never restored" first (prosecutor §4 :87;
researcher day :61–:62) — and RECORDS — the entries a researcher promoted, with their standing and citing theses
(evidence §1; A4 :1089). A page is a filter and a label. The walk's working state — a capture's outcome, the
rules in force at its date, a rule's history — is not the corpus: it opens FROM a record as "how this text was
extracted", never as a page of its own.

**The browser reaches the backend by HTTP, never through MCP** (interaction :22–:25), so this document AMENDS
two clauses for READS ONLY — evidence A5 :1188 and thesis A5 :1559, "adds no route" — with one rule:
**a route IS a tool's answer.** One function serves the tool and the route; a route has no second implementation
and no second shape (thesis A5 :1564 is the precedent: `GET /api/thesis` is `list_theses`' anonymous answer).
PUBLIC routes take no identity and are gated by PUBLIC_PAGE (evidence A3 :1051); GATED routes answer a
researcher and nobody else, identity from the same `Researcher` row the MCP resolver reads. Ruled 2026-09-15 (Q2 = b).

## 2. THE SITE MAP

Every page has one identity, its URL under `/<locale>/` (`he` default, `en`). Nothing is reachable twice; a filter
is a query, never a second page.

### 2.1 PUBLIC — no identity

| page | reads | what it is | ground |
|---|---|---|---|
| `/` | `GET /api/thesis` | the door: the published theses (claim, provision, date, author's handle, hash), what the platform is, the entry to `/corpus`, `/safety`, `/researchers`, `/reports/new` | thesis A4 :1427; silent in the designs — THIS document's |
| `/theses/[id]` | `GET /api/thesis/:id` | THE THESIS PAGE, exactly T5 :809–:829: statement and disclaimer first; claim; text with citations resolved; appeals; rationale; history; the link to each cited page's chronology (`/corpus?page=`) | T5; A5 :1565–:1569; T6 :915 the notice |
| `/theses/[id]/versions/[v]` | `GET /api/thesis/:id/versions/:v` | a version that was published, and what changed to the next — the history's read, linkable | A5 :1570; T6 :898–:901 |
| `/call/[id]` | `GET /api/thesis/:id` · `/call` | the appeals alone, shareable: statement, disclaimer, the call items, the requests ready to send, the intake instruction | A5 :1569 "a call page"; COMPLIANCE :26–:27, :92; step-23 Live-13 |
| `/corpus` | `list_corpus` (public scope) | THE CHRONOLOGY over every opened page: captures with anchors, diffs with current chunks and the classifier's opinion labelled, published citations as linkage; filters `?page=`, `?since=&until=`, `?kind=`, `?cited=1` (the RECORDS lens) | evidence §5 :464–:479; A4 :1080–:1093; §6.1 below |
| `/corpus/claims` | `list_trajectories` (public scope) | the CLAIMS lens: every trajectory across opened pages, "removed and never restored" first; `?page=` | evidence A4 :1103; prosecutor §4 :87; §6.1 |
| `/pages/[trackedUrlId]/captures/[capture]` | `list_findings`' capture row · `check_on_chain_status` | ONE CAPTURE RECORD: the text version, its anchor, the chain check on demand | evidence A4 :1081–:1083, :1111 |
| `/pages/[trackedUrlId]/diffs/[before]/[after]` | `get_diff_input` | ONE DIFF RECORD: the pair's two texts and the CURRENT chunks | evidence A4 :1095–:1099 |
| `/records/[fileHash]` | `resolve_record` | what a stranger holding a citation needs | evidence A4 :1105–:1109 |
| `/safety` | none | rewritten to what document §2, §4, §5, §8 build | document §12 :1171–:1173; plan :107 |
| `/about` | none | rewritten: the corpus, the walk, the thesis, the gate, the registry — no "AI ranks evidence", no Arbitrum | silent — THIS document's (§34); the copy the researcher's |
| `/researchers` | none | the invitation and the MCP connection guide | OAuth plan §8.1; untouched |
| `/reports/new` · `/reports/patterns` | `/api/reports/*` | untouched by every design | triage :93 |

A record is named by its page and its wayback timestamp (interaction :524–:526), so a record's URL carries both;
the page as a thing to browse has no URL of its own. **One 404 body for NOT_SURVEYED and NOT_PUBLIC**, as
`publicThesisRoutes` answers a draft and a missing id alike: a stranger must not learn which pages are under
investigation (architecture §9.5 :382–:384).

### 2.2 DIALOG — by link from the chat only

| page | routes | ground |
|---|---|---|
| `/article-rules/[trackedUrlId]/[capture]` | interaction A6's five, `requireResearcher` | MARKING :517–:624; A6 |

No second dialog exists in any design. A future one is added by the design that needs it, under this rule, and nowhere else.

### 2.3 READ VIEW — gated, researchers only

| page | reads (each a GATED tool's answer, as a route) | what it shows | ground |
|---|---|---|---|
| `/research` | `list_thesis_reviews` · `list_evidence_reviews` · `list_theses` (`scope`) · `list_framings` · `list_pages` | what I owe, first; the theses — mine by default, one switch to everyone's — head vs published; every framing; the corpus in numbers (pages surveyed, rows by outcome) | T6 :866–:882; A4 :1429–:1432; interaction A5 :1071; §7.1 |
| `/research/theses/[id]` | `get_thesis_context` · `get_framing` · `get_debate` | THE WORKING VIEW: the history as a stream of attributed acts, each opened to its material and its labelled opinion; the head with its citations and pins; the gaps in force; the analyses; the attempts | thesis §9 :974–:978; A4 :1476, :1458; evidence A4 :1144 |
| `/research/corpus` | `list_corpus` (all scope) · `list_pages` (the page filter's source) · from a record: `list_captures` · `get_article_rules` · `get_rule_history` | THE WHOLE CHRONOLOGY, opened pages or not; the same filters as `/corpus`; from any entry, "how this text was extracted": the capture's outcome and ruleset, the rules in force at its date, each rule's history — a sheet, never a page | evidence A4 :1080; interaction A5 :1199–:1224; §6.1 |
| `/research/corpus/claims` | `list_trajectories` (all scope) | the CLAIMS lens over every page | §6.1 |
| `/profile` · `/admin` | `/api/auth/*` | untouched | OAuth plan §8.1; silent |

### 2.4 AUTH and the staging gate — untouched

`/login` · `/auth/callback` · `/oauth/interaction/[uid]` · `/unlock` (staging only). OAuth plan §5, §7.0b.

### 2.5 RESERVED for the document plan — not built

`/theses/[id]/intake` (document §5, plan step 32) · a withdrawal door (§8, step 35 — URL the researcher's) ·
the `#doc_` block on the thesis page (§7 :848–:860, step 34) · the documents register as a third register of
the chronology, never interleaved with captures and diffs (§9 :1027–:1034). Each is a page or a section already
above; none needs a new region.

## 3. TODAY'S 28 PAGES — THE DISPOSITION

| disposition | pages | ground |
|---|---|---|
| RETIRED | `/theses/[id]/edit` | the browser as an editor — thesis A5 :1573, §2 :126–:132 |
| RETIRED | `/figures`, `/figures/[id]` | thesis A5 :1579; T2 :472; COMPLIANCE :34 |
| RETIRED | `/evidence`, `/evidence/[id]` | evidence A5 :1191–:1193 — replaced by `/corpus` and `/records/[hash]` |
| RETIRED | `/forensics`, `/forensics/[id]` | the walk's cockpit: acquisition is MCP (interaction :52–:60); the corpus is a chronology, not a page list (§1) — replaced by `/corpus` and `/research/corpus` |
| RETIRED | `/submit` | document A5 :1513; plan :342–:346 |
| RETIRED | `/guide`, `/guide/[slug]` | triage ruling 2 :31–:34, restated here as this design's: the tutorial is in the chat (thesis A4 `start_tutorial`) |
| RETIRED | `/theses/[id]/history` | history is ON the page (T6 :898–:901) |
| **UN-RETIRED 2026-09-18 — THE RESEARCHER'S** | `/theses` (public list) | **The ground it was retired on no longer holds.** It was retired because "`/` carries the published list"; the researcher has since ruled that `/` is the HOME, that it shows the latest and not all, and that it is redesigned LAST. A home that shows a selection is not a list, and until this the sidebar's תזות had no destination at all while הארכיון had one — an asymmetry with no reason behind it. `/theses` is every PUBLISHED thesis, one row each, newest first, and it is the public half of a pair whose gated half §29 already specifies. |
| RETIRED | `/call` (list) | `list_theses`' anonymous answer has no "has appeals" field (A4 :1427), so a call list would need what the contract does not give — THE RESEARCHER'S. **Unaffected by `/theses`' un-retirement: that was a ground about the DOOR, this is a ground about the CONTRACT.** |
| RETIRED | the floating chat widget (every page) | `/api/chat`, owned by no design (triage :74) |
| REBUILT | `/theses/[id]` · `/call/[id]` | against T5 / A5 |
| KEPT | `/article-rules/…` · `/login` · `/auth/callback` · `/oauth/interaction/[uid]` · `/unlock` · `/profile` · `/admin` · `/reports/new` · `/reports/patterns` · `/researchers` | as above |
| REWRITTEN | `/safety` · `/about` | copy only |
| NEW | `/corpus` · `/corpus/claims` · `/pages/[id]/captures/[c]` · `/pages/[id]/diffs/[b]/[a]` · `/records/[hash]` · `/research` · `/research/theses/[id]` · `/research/corpus` · `/research/corpus/claims` · `/theses/[id]/versions/[v]` | §2 |

## 4. THE CONSTRAINT THAT SHAPES EVERY PAGE — MOBILE FIRST. Ruled 2026-09-15. **AMENDED 2026-09-16** — the wide layout is its own three-pane shell, sidebar · centre · right pane, never the compact page widened; the phone keeps this section (docs/gf-ui-design-session-2026-09-16.md §3).

Every page is designed at phone width first and widens; nothing is a desktop page reduced. What it means
structurally, stated once so the later chunks obey it: one column by default, a master–detail pair collapses to a
stack; the thing being read (the thesis text, the chronology, the history stream) is the page, and everything
attached to it (a citation's record, a diff's chunks, an opinion's text, how a text was extracted) opens IN
PLACE as a sheet over it and returns; long lists paginate on the read's own cursor, never load whole; no table
wider than the screen — a record is a card, a diff is two stacked texts; the sticky context line (which thesis,
which page, which version, which date range) never leaves the top. **RETIRED 2026-09-18 (the researcher): the sticky context line is REMOVED from the public thesis and call pages, and it is not a display decision. The pattern is real — a short title bar once the heading scrolls past — and it has ONE precondition: A SHORT NAME. This platform has none: thesis flows A2 :1268 records `title` as REMOVED, "the claim is the heading", so the line was handed the CLAIM itself and showed 640px of 3,497 — 18% of a 558-character sentence, cut mid-clause, identifying nothing. It was also MOUNTED on scroll rather than rendered and stuck, so it inserted 29px into the flow and pushed the page under a reader’s eye. The element returns when a thesis has a NAME; until then it is removed rather than repaired, because repairing it would maintain a control whose precondition does not hold.** Which patterns and from which platforms is
chunk 3's, page by page.

**One dialog does not fit a phone, and this document says so rather than hiding it:** the marking page asks the
researcher to click elements of an inert HTML document (MARKING :537–:547). It stays a desktop dialog until the
design that owns it says otherwise; the chat's instruction line (MARKING :576–:578) is what a phone reads.

**No hash and no id is shown as text. Ruled 2026-09-15.** A 64-hex name, a cuid, a wayback timestamp as a
14-digit string — none is for a reader, and a page that prints one prints noise. A thing is shown by what a
person recognises: a page by its title and domain, a capture by its date and time, a diff by its interval, a
thesis by its claim, a version by its date, a record by its page and date. Where the exact value has a use,
it has exactly two homes: **a COPY control**, one per thing, carrying the CHAT-READY form — the citation
token `#ev_…` or `#tr_…` on a record or a trajectory (T2 :368–:376: what a version cites), the thesis id on a
thesis as `thesis <id>` for a new conversation's state message (run B, Live-31), the command on an owed
entry — labelled by what it is FOR, never by what it is; and **a VERIFY disclosure** on a record page and on
the thesis page, closed by default, holding the full values (document hash, text hash, version hash, registry
index) with copy, for the reader who came to check (T5 :795–:796; evidence §5 :428–:430) — **and, from
2026-09-18, on a CAPTURE record the ARCHIVE'S RAW URL beside the document hash, because that is the one fetch
whose bytes hash to it (§26). The open page carries a reading link and no instruction to hash (§26's amendment).** A URL may carry an
id; the page never reads it aloud. This amends §11, §17, §18, §24 and §26 where a hash or an id was named as
displayed; each is rewritten below to a recognisable name plus the two homes.

---

## 5. THE ONE RULE, AND THE THREE CLAUSES IT AMENDS

**A route IS a tool's answer. Ruled 2026-09-15.** For every read the browser needs there is one function; the
MCP tool and the HTTP route both call it and return its value unchanged. A route with its own query, its own
shape or its own refusal set is a second implementation of a read, and the one-symbol scan of the four
designs catches it as it catches any second spelling (interaction A7's rule; thesis A1 :1247–:1250). The
precedent is thesis A5 :1564 — `GET /api/thesis` "is `list_theses`' anonymous answer" — and this document
makes that sentence the rule for every read below.

Three clauses are amended, for READS ONLY, and marked where they are (docs that move):
- **evidence A5 :1188** "adds no route and no browser page" → adds no WRITE route; its PUBLIC reads (A4 :1080–:1115) and the corpus reads of §6.1 answer as routes under §6.
- **thesis A5 :1559** "adds no route and no browser dialog" → the same; its GATED reads (A4) answer as routes under §7.
- **interaction A6 :1227** "the marking page's only surface" → `/api/article-rules` stays the marking page's only surface; the corpus's three GATED reads (A5 :1199–:1224) and `list_pages` answer under `/api/research`, §7.

Nothing else moves: no write gains a route, every tool keeps its contract, and a tool contract amended later
amends its route by the rule, with no second edit.

## 6. PUBLIC ROUTES — no identity, gated by PUBLIC_PAGE, identical bytes for everyone

```
GET /api/thesis                                    list_theses' anonymous answer            (thesis A5, as is)
GET /api/thesis/:id                                T5's page · the notice                   (thesis A5, as is)
GET /api/thesis/:id/versions/:v                    a published version                      (thesis A5, as is)
GET /api/thesis/:id/call                           get_whistleblower_call({ thesisId })     thesis A4 :1501 — the call ⚠️
                                                   page's own read; { live: false } is 200
GET /api/corpus?since&until&page&kind&cited&cursor&limit ⚠️
                                                   list_corpus({ scope: 'public', … })      §6.1 — THE CHRONOLOGY
GET /api/corpus/claims?since&until&page&cursor&limit ⚠️
                                                   list_trajectories({ scope: 'public', … })§6.1 — the CLAIMS lens
GET /api/corpus/search?phrase&since&until&page     search_corpus({ scope: 'public', … })    §6.1 — evidence §5 :468–:470 ⚠️
GET /api/pages/:trackedUrlId/findings              list_findings({ url })                   evidence A4 :1080 — one page ⚠️
GET /api/pages/:trackedUrlId/diffs/:before/:after  get_diff_input({ url, before, after })   evidence A4 :1095 ⚠️
(not mounted — amended 2026-09-15, #487: verify_claim_text is GATED; one page's search is /api/corpus/search?page=)
GET /api/pages/:trackedUrlId/trajectories          list_trajectories({ scope: 'public', page })  §6.1 — amended 2026-09-15: stored passes only ⚠️
GET /api/pages/:trackedUrlId/captures/:capture/chain ⚠️
                                                   check_on_chain_status({ url, capture })  evidence A4 :1111
GET /api/records/:fileHash                         resolve_record({ fileHash })             evidence A4 :1105 ⚠️
```

**Routes name a page by `trackedUrlId`; tools name it by `url`** (interaction :524–:526). The one function takes
the page's row; the tool resolves `url` to it and the route resolves the id to it, and NOT_SURVEYED is the same
refusal from either door. The thesis page's `pages: [{ url }]` (T5 :824) gains the page's id beside the url, so
the link `/corpus?page=` is composable — an amendment to `GET /api/thesis/:id`'s body, one field, by this rule.

### 6.1 The corpus reads — three additions to evidence A4. Ruled 2026-09-15 (frame A).

Evidence §10 :847–:849 left "the public read's shape beyond one claim at a time" to a read-tool design; this is
its first instance, and it adds three reads and no table. Each is ONE function with an explicit `scope`, the same
shape as §7.1's, because a read whose scope followed the caller's identity would be "a second behaviour by
identity", which evidence A4 :1075–:1076 forbids: `scope: 'public'` answers over PUBLIC_PAGE pages and takes no
identity; `scope: 'all'` answers over every surveyed page and is GATED (`NO_RESEARCHER`). The public route fixes
`public`; the `/api/research` route fixes `all`; the chat may pass either.

```
list_corpus({ scope, since?, until?, page?: url, kind?: CAPTURE | DIFF, cited?: bool, cursor?, limit? }) ⚠️
  returns   { entries: [ list_findings' capture row | diff row (A4 :1081–:1090), each with
              page: { trackedUrlId, url } ], nextCursor | null } — amended by docs/gf-ui-refactor-plan.md UI-2 (2026-09-15): `page` gains `public: bool`, so the gated door can mark a row of a page not yet opened (§27) without a second read; always true at `public`
            in TIMESTAMP order across pages; no other order exists (A4 :1091). `cited` keeps the entries
            with `evidence` ≠ null — the RECORDS lens, no second read. `limit` is an operational parameter
            (flows A8), never a judgement.
  refuses   INVALID_RANGE · NOT_SURVEYED (`page` names none) · NO_RESEARCHER (scope all, no identity)
            — publicly, NOT_SURVEYED and a page not PUBLIC_PAGE are one 404 (§6's table)
list_trajectories({ scope, since?, until?, page?, cursor?, limit? }) ⚠️
  returns   get_claim_trajectories' rows (A4 :1103) across pages, each with its page; ordered by the
            date the claim LEFT, latest first, so "removed and never restored" reads first
  refuses   as list_corpus
search_corpus({ scope, phrase, since?, until?, page? }) ⚠️
  returns   verify_claim_text's verdict per capture (A4 :1101), across pages, each with its page —
            the one search rule, unchanged; the name search of thesis §10 :1053–:1057 is this read at
            scope all, and no index is built before a measurement says the read is slow (§10 :1056)
  refuses   as list_corpus · PHRASE_REQUIRED for a blank phrase (REASON_REQUIRED's shape)
```

`list_findings`, `get_claim_trajectories` and `verify_claim_text` are unchanged: each is `list_corpus`,
`list_trajectories` or `search_corpus` at one page, and the acceptance suite holds that by calling both on the
same page and asserting equal rows — amended 2026-09-15 (#487): search_corpus reads the stored text and verify_claim_text the raw archive, so the equality holds on the stored verdict.

**Status, one table, every public route:**

| the tool's refusal | HTTP | body |
|---|---|---|
| NOT_SURVEYED · NOT_PUBLIC · NOT_A_RECORD · NOT_A_CAPTURE · NO_SUCH_DIFF · a thesis never published | **404, ONE body** `{ error: 'Not found' }` | a stranger learns nothing about what is surveyed, cited in a draft, or held — architecture §9.5 :382–:384; `publicThesisRoutes`' rule |
| AWAITING_DERIVATION | 409 `{ error, code }` | the page is already public; the state is the corpus's, not a secret (evidence A4 :1099) |
| CHAIN_UNAVAILABLE | 503 `{ error, code }` | "a verdict about the CHECK" (evidence A4 :1115), never about the capture |
| INVALID_RANGE · PHRASE_REQUIRED · a malformed parameter | 400 `{ error, code }` | interaction A6 :1260's shape |
| the staging gate | 401 `{ error: 'Unauthorized' }` | `requireStagingAccess`, unchanged; the frontend's fetch wrapper carries the header |

**Retired, and why:** `GET /api/forensics/tracked` — lists every surveyed page to anyone, which is the framing
risk evidence §5 :475–:479 and architecture §9.5 forbid ("under investigation" before any thesis says why);
`GET /api/forensics/tracked/:id/trajectories` — the same read with no PUBLIC_PAGE gate (triage :135), replaced
above; `GET /api/stats` — counts every thesis including drafts and serves the number anonymously (`server.ts`
:183); the door counts what `GET /api/thesis` returns and needs no second read. `/api/forensics` is unmounted.

**No route is paid.** Every read above is a database read but one: the chain check reaches the RPC, and it sits
under the cost plan's `generalLimiter` (300 per 15 min on `/api/*`) as an operational parameter, not a judgement.

## 7. GATED ROUTES — a researcher, and nobody else

```
prefix   /api/research/…    ONE mount-level gate: `requireResearcher` (researcherIdentity.ts) — 401 with no ⚠️
                            valid session, 403 with a session and no APPROVED Researcher row; the SAME
                            Researcher row the MCP resolver reads. A gated read outside the prefix, or a
                            public read inside it, is a scan failure (a property, never an enumeration).
```

```
GET /api/research/reviews                          list_thesis_reviews({ scope: 'all' })    thesis A4 :1523 — §7.1 ⚠️
GET /api/research/evidence-reviews                 list_evidence_reviews({})               evidence A4 :1146 ⚠️
GET /api/research/theses                           list_theses({ scope: 'all' }), researcher thesis A4 :1429 — §7.1 ⚠️
GET /api/research/theses/:id?since=                get_thesis_context({ thesisId, since })  thesis A4 :1476 ⚠️
GET /api/research/framings                         list_framings({})                       thesis A4 :1432 ⚠️
GET /api/research/framings/:id                     get_framing({ framingId })              thesis A4 :1458 ⚠️
GET /api/research/debates/:sessionId               get_debate({ sessionId })               evidence A4 :1144 ⚠️
GET /api/research/corpus?…                         list_corpus({ scope: 'all', … })        §6.1 ⚠️
GET /api/research/corpus/claims?…                  list_trajectories({ scope: 'all', … })  §6.1 ⚠️
GET /api/research/corpus/search?…                  search_corpus({ scope: 'all', … })      §6.1 ⚠️
GET /api/research/pages                            list_pages({})                          interaction A5 :1071 ⚠️
GET /api/research/pages/:trackedUrlId/captures?outcome= ⚠️
                                                   list_captures({ url, outcome })         interaction A5 :1208
GET /api/research/pages/:trackedUrlId/rules        get_article_rules({ url })              interaction A5 :1199 ⚠️
GET /api/research/pages/:trackedUrlId/rules/:ruleId/history ⚠️
                                                   get_rule_history({ url, ruleId })       interaction A5 :1214
RESERVED (document plan, not built)                get_arrivals · list_documents · read_document — document A4
```

Refusals map as §6's table, with two differences: 401 and 403 come FIRST, before any lookup, with one body each
regardless of whether the id exists (a stranger must not probe drafts by status code); and a 404 inside the
prefix may say which refusal it was (`NO_THESIS`, `NO_FRAMING`, `NO_SUCH_RULE`, `NOT_SURVEYED` as `{ error, code }`),
because the caller is a researcher and working state is theirs to read (thesis §9 :1003–:1005).

### 7.1 The amendment the researcher ruled: every researcher's work, attributed, WITHOUT moving a default. Ruled 2026-09-15.

**Researcher pages show what every researcher worked on; the claude.ai flows keep reading exactly what they read.**
Thesis §9 :1003–:1005 already lets any researcher read any thesis's working state. Two list contracts answer the
caller's own by default, and the acceptance suite holds it (`reads.test.ts` :159 "their own theses"; :400 "another's
thesis owes them nothing"); T6 :866 has Claude report "what do I owe?" when a conversation opens. A default that
moved would put colleagues' theses and flags in front of a session with commands it cannot run. So:

- **`list_theses` (thesis A4 :1426–:1431)** and **`list_thesis_reviews` (A4 :1523; T6 :868)** each gain ONE optional
  parameter, `scope: 'mine' | 'all'`, **default `mine`** — with no argument, today's answer, byte for byte.
- With `all`: `list_theses` answers every researcher's theses in the researcher shape, plus the author's handle and
  `mine: bool`; `list_thesis_reviews` answers REVIEWS over every thesis, each entry carrying its author, `owed`
  counting all. Each entry's command still writes only as the author (`NOT_AUTHOR`, thesis A7 :1685).
- The read view's routes pass `all`; `/research` opens on `mine` by the page's own switch. The chat passes nothing.
- The suite keeps every case and gains one per tool for `all`. `list_framings`, `list_pages`, `get_thesis_context`
  are already corpus-wide or any-thesis (A4 :1432, :1476; interaction A5 :1071) and change nothing.

## 8. WHAT THE FRONTEND MAY ASSUME, AND WHAT IT MAY NOT

- **Bytes, not views.** A page renders the route's body; it derives nothing the body does not carry, except
  the one thing T6 :900 assigns it — the text diff between two published versions, computed from two immutable
  texts it fetched.
- **The one 404.** A public page shows the same "not found" for a draft, a missing id and a private page, and
  never a different sentence for one of them.
- **The notice is 200.** A withdrawn thesis is a page that says withdrawn on a date (T6 :915–:918), and nothing else.
- **Labels are the body's.** An opinion arrives labelled as one (evidence A4 :1087; document §5 :543) and is
  shown under COMPLIANCE.md rule 3's label; the frontend adds no verdict of its own.
- **Never `/api/mcp` from a page.** The browser calls routes (interaction :22–:25); a page that spoke JSON-RPC
  would be a second client of the tool surface, outside the staging gate.
- **A filter is a query on one read, never a second read.** `/corpus?page=` and `/corpus?cited=1` are
  `list_corpus` with parameters; a page that fetched `list_findings` for the filter would hold two spellings.

## 9. INSTRUMENTS FOR THE APPENDIX (named here, held there)

- `route-is-tool`: for every route in §6 and §7, a test calls the tool and the route with the same input and
  asserts byte-equal bodies; a decoy route with its own query fails it.
- `one-page-is-the-corpus-at-one-page`: `list_findings(url)` equals `list_corpus({ page: url })`'s entries, and the
  same for trajectories and search; a decoy second query on either side fails it.
- `public-identical`: every §6 route answers byte-identically with and without a session (thesis A7 :1686), and
  NOT_SURVEYED, NOT_PUBLIC and never-published are byte-identical 404s.
- `no-model-prose-public`: thesis A7 :1688's shape test extended to every §6 route — no field of an analysis, an
  assessment, an objection or an opinion's text except where A4 labels it (`opinion`, on a diff).
- `gate-by-prefix`: a source scan that every router under `/api/research` is mounted behind the one gate and
  that no handler there reads a caller id to filter.
- `no-surveyed-page-anonymous`: no public route lists TrackedUrl rows or answers a `scope: 'all'` read without
  an identity, by scan and by call.

---

## 10. WHAT THE PAGE IS

**One thesis, as it was shaped: the state now, and every act that led to it, each attributed, each opened to
its material.** The read is `get_thesis_context` (thesis A4 :1476–:1479): the thesis · HEAD and PUBLISHED with
their texts and resolved mentions · UNARGUED · GAP_LIST with decisions in force · CURRENT_ANALYSIS or STALE / NONE
with the fingerprint · the framings · HISTORY(t). Two reads open on demand, one sheet each: `get_framing`
(:1457, every round with its verdicts) and `get_debate` (evidence A4 :1144, the argument's rounds). Nothing
else is fetched; nothing is derived that the body does not carry, except the text diff between two versions
(T6 :900's computation, applied here to any two versions of the chain — the same two immutable texts).

**Three voices, three registers, never mixed. Ruled by the designs; stated here for the renderer.** Everything
on the page is one of:

```
THE RESEARCHER'S     an act and its words — a question, a proposed framing, a chosen claim, a version's
                     text, a rationale, a decision's reason, a note, a withdrawal's reason. Attributed
                     (handle, moment). Rendered as the record: plain, first, never paraphrased.
THE MODEL'S          an opinion recorded through a tool — an assessment round, a debate verdict, the
                     critic's analysis, the publication assessment. ALWAYS inside a container that carries
                     COMPLIANCE.md rule 3's label, "ניתוח AI — אינו מהווה קביעה שיפוטית", with the model and
                     prompt version beside it (A2 :1309, :1317). Never outside one.
THE PLATFORM'S       a mechanical verdict on either of the above — quoteVerified, phraseVerified
                     PRESENT | ABSENT | UNCHECKED, elements filled, ARGUED, CURRENT | STALE, a check's
                     pass/fail with what it examined. Rendered as a mark beside the sentence it judges,
                     never as prose: "both parties to the round are audited by the same rule"
                     (architecture §10.1 :491–:493).
```

A paraphrase is shown as one: an assessor's `researcherClaim` with `quoteVerified: false` is rendered with the
researcher's actual words beside it (T1 :256–:257; architecture §10.1 :488–:490) — the defect the designs
removed by shape is made visible, never dropped.

## 11. THE PAGE AT PHONE WIDTH — top to bottom

```
1  THE CONTEXT LINE   sticky. The CLAIM, verbatim — the claim is the heading (A2 :1268) — · the provision ·
                      the author's handle, `mine` marked · the state: DRAFT ONLY · PUBLISHED = HEAD ·
                      PUBLISHED ≠ HEAD (n versions since) · WITHDRAWN on <date>. Never leaves the top.
2  WHAT IS OWED       first, stop-shaped (T6 :881–:882): this thesis's entries of REVIEWS — FLAGGED
                      (record, why: withdrawn with reason · content moved, old beside new), STALE_TRAJECTORY,
                      UNARGUED (the mentions), ARRIVED (later, document flows) — each with its material and
                      ONE COMMAND TO PASTE, shown with a copy button (the marking page's precedent, MARKING
                      :534–:535). Empty is a line saying so; "{ owed: 0 }" is an answer (A4 :1525).
                      On a colleague's thesis the same entries show, and the command is labelled as the
                      author's (every write refuses NOT_AUTHOR, A7 :1685).
3  THE STATE NOW      one segmented control, one segment visible at a time:
     TEXT             HEAD's text as Markdown, each citation token a chip — the record by page and date, the pin by
                      its date, ARGUED or UNARGUED — that opens the CITATION sheet; the chip's COPY gives the token; PUBLISHED's text one toggle away, with
                      the diff between them when they differ (T6 :900)
     CITATIONS        every mention of HEAD: kind · the record (page, timestamps) · the pin · ARGUED with
                      the verdict and "over objection" as a fact, or UNARGUED · FLAGGED if it is on
                      PUBLISHED · tap → the DEBATE sheet (get_debate) and, one step on, the record
                      itself (`/pages/[id]/…`, chunk 2)
     GAPS             GAP_LIST with each gap's decision in force (A3 :1381–:1383): OPEN · CITED (the
                      citation) · REQUESTED (the request: text, authority, legal basis, addresses,
                      restsOn) · CALLED (the call item) · CONCEDED / DISMISSED (the reason); a CITED gap
                      whose citation left the head reads OPEN, as derived
     ANALYSIS         CURRENT_ANALYSIS or the word STALE / NONE with the fingerprint (A3 :1376–:1379);
                      the opinion, labelled: strength as the critic's · each counter-argument with the
                      sentence it quotes and its quoteVerified mark · each assertion with its
                      phraseVerified mark · alternative readings · suggested gaps, each showing whether
                      a decision exists for it (accepted → its decision; none → a candidate, not a gap)
     FRAMING          the framings attached, each: question · provision · rounds in sequence —
                      PROPOSED (the sentence verbatim, the element map) · ASSESSED (labelled; the
                      contradictions with both marks; elements filled; the recommended framing) ·
                      CHOSEN (the claim verbatim, and whether HEAD restates it CHARACTER FOR CHARACTER —
                      CLAIM_FRAMED, A3 :1366)
4  THE STREAM         HISTORY(t), OLDEST FIRST — the story of how the thesis was shaped, read top to
                      bottom; "jump to now" returns to the end. One entry per row, one line each:
                      kind · who · when · the one line that identifies it. Tap → the SHEET for that kind.
```

**The stream's kinds, and what each sheet holds** — every row of thesis §9 :974–:978, nothing invented:

| kind (A2) | the line | the sheet |
|---|---|---|
| FRAMING opened | the question | question · provision · `fromRunId` if any · its rounds below |
| ROUND PROPOSED | the proposed sentence | the sentence verbatim · the element map, MISSING marked |
| ROUND ASSESSED (model) | "assessed: n contradictions, m elements filled" | the assessment under the label: contradictions each quoting the researcher (mark) and naming the record and phrase (mark) · unverified assumptions with how to check · candidate framings · the recommended one |
| ROUND CHOSEN | the claim | the claim verbatim · elements · the versions that restate it |
| VERSION | the claim, "+n citations, k unargued" | the text · the diff to its parent (computed, T6 :900) · citations: new · re-pinned · dropped · carried with argument · the parent by its date · VERIFY: the version hash |
| DEBATE (per citation) | the record, the verdict | rounds in order: rationale (researcher) · assessment (model, labelled): SUBSTANCE cleared or its gaps, MERIT, objection · the answer · PROMOTED, over objection or not · the passage handed to the assessor (T3 :500–:506) |
| ANALYSIS (model) | "analysis: <strength>", CURRENT or STALE | as the ANALYSIS segment, for that version and fingerprint · who spent the call (A2 :1317) |
| GAP DECISION | the gap, the decision | description · decision · reason / request / call item · sequence · the earlier decisions on the same gap |
| PUBLICATION ATTEMPT | PUBLISHED, or REFUSED by <checks> | rationale (researcher) · the assessment (model, labelled): substance, MERIT, the names it found · verdict · `refusedBy` with what each check examined · the statement |
| WITHDRAWAL | withdrawn | version · the reason (GATED — the author's record, T6 :916; shown here, never publicly) · who · when |
| NOTE | the first line | the text · attributed |

**A sheet is a sheet.** Every detail opens IN PLACE over the page and returns to the same scroll position; a sheet
may open one further sheet (a citation → its debate → the record) and the context line stays visible above
both. Nothing on this page navigates away except the record links of chunk 2 and the public page's link.

## 12. WHAT THE PAGE NEVER HAS

- **No write control.** No publish, no save, no editor, no "resolve", no "re-run": every act is the chat's
  (prosecutor §10 :311–:313; thesis §2 :126–:132). The one actionable element is the COPY of a command the
  owed list already names, whose moment the list defines: it exists exactly when something is owed. A control
  whose moment the design could not define is a design miss, not a labelling problem (the researcher's rule,
  2026-09-06), and this page has none.
- **No opinion outside its label**, and no verdict as prose.
- **No second read for a filter.** "Since" is `get_thesis_context`'s `since` (A4 :1479), used to refresh the
  stream on return; the history is loaded whole, because a thesis's history is small — a cursor is added the
  day a measurement says it is not (the designs' rule for an index, thesis §10 :1056).
- **No line the researcher typed that no tool recorded** (§1).

## 13. STATES

| state | the page |
|---|---|
| loading | the context line's skeleton, then the owed strip, then the rest — in that order, so what matters most paints first |
| 401 | `/login?returnTo=` this URL (OAuth plan §5.2's threading) |
| 403 | one sentence: this account is not an approved researcher; the `/researchers` page linked |
| 404 `NO_THESIS` | "no such thesis", with the id |
| a thesis with one version and nothing else | the stream has one VERSION row; the state says UNARGUED n; the owed strip lists them |
| PUBLISHED ≠ HEAD | the context line says so; TEXT shows the diff on a toggle |
| WITHDRAWN | the context line says withdrawn on <date>; the stream carries the WITHDRAWAL with its reason; PUBLISHED reads none |
| a colleague's thesis (`mine: false`) | identical, the commands labelled as the author's |

## 14. WIDENING — tablet and desktop — **AMENDED 2026-09-16:** the shell of docs/gf-ui-design-session-2026-09-16.md §1.1; a sheet at width is a right-pane tab.

The compact page above is the design; wider windows rearrange it and add nothing. At medium width the STATE
segments and the STREAM sit side by side (list–detail); at expanded width a sheet becomes a third column
beside them, so a citation, its debate and the stream are in view at once. The context line stays a line.
The named patterns, so the later plan can pick libraries without re-deciding: an attributed ACTIVITY STREAM
with one-line rows opening to detail (the pull-request timeline's shape); a SEGMENTED CONTROL for facets of one
object; BOTTOM SHEETS for detail at phone width becoming side panels when there is room (the list–detail
adaptive layout, compact → medium → expanded); a STICKY collapsing header for context; PULL-TO-REFRESH as the
`since` read. None is a judgement; each is a convention readers already know.

## 15. INSTRUMENTS FOR THE APPENDIX (named here, held there)

- `every-kind-renders`: a fixture history carrying all eleven kinds of §11 renders one row each and one sheet
  each; a kind added to A2 without a renderer fails it.
- `opinion-under-label`: in the rendered tree, every field of an ASSESSED round, a debate assessment, an
  analysis or a publication assessment is a descendant of a container carrying rule 3's label; a decoy
  rendering one outside fails it.
- `no-write-from-research`: a source scan that nothing under `src/app/[locale]/research` issues a request
  with a method other than GET, and that no form posts; a decoy fails it.
- `diff-is-of-two-texts`: the computed diff over two fixture versions equals the fixture's expected diff, and
  the computation takes exactly two texts and no third input.
- `three-voices`: every rendered string is in exactly one of the three registers by construction — a
  component per voice, and a scan that no page renders an opinion or a verdict through the researcher's
  component.

---

## 16. WHAT THE THESIS PAGE IS

**T5 :809–:829 fixes WHAT the reader gets, in order; this chunk fixes HOW, and adds nothing to the list.** The
read is `GET /api/thesis/:id` (A5 :1565–:1569), one body, identical for everyone: the statement · the claim and
provision · the published version (text, hash, date, author's handle) · each citation resolved · the appeals ·
the rationale · `overObjection` and `analysisRun` as facts · the history of published versions · the pages. A
withdrawn thesis is the same route answering the NOTICE (T6 :915–:918). Nothing is fetched twice and nothing is
derived, except the text diff between two published versions (T6 :900), computed from the version read
(`/versions/:v`) when the reader opens the history.

**Two voices, not three.** The public page carries the researcher's words and the platform's facts and marks.
The model's voice is ABSENT by contract (T5 :826–:834; A7 :1688's shape test): no analysis, no assessment, no
objection, no framing round. What the page says of them is a FACT in the platform's register — "an analysis was
run" · "argued" · "published over the assessor's objection" — and never the opinion itself. Chunk 3's three
registers apply with the middle one removed; the same components, one fewer. **AMENDED 2026-09-18 (the researcher): the researcher's VOICE renders THEIR MARKDOWN wherever it appears — the public-interest statement, the publication rationale, the intake line and every appeal field — through the ONE renderer §17 :538 names, because the text is drafted with a model in claude.ai and a capability dropped is a sentence the researcher wrote and no reader sees. It reaches the RESEARCHER'S WORDS ALONE: a corpus record's captured text, a diff chunk and a trajectory's claim text are the ARCHIVE'S BYTES and are never parsed, because a `#` or a `*` standing in a captured page would re-interpret what the record says, which is an evidence change wearing a display change's clothes. The FOLDED preface shows a short clamped PARAGRAPH and not one ellipsised line; its trigger may hold the rendered blocks — a block inside a `<button>` re-parses byte-identical, unlike a block inside a `<p>`, measured with `DOMParser` — but NEVER an interactive descendant, so an autolink inside the trigger renders as the text it is.**

## 17. THE PAGE AT PHONE WIDTH — top to bottom, T5's order **AMENDED 2026-09-16:** the preface (regions 1) is FOLDED to one line that opens; region 4 is removed (docs/gf-ui-design-session-2026-09-16.md §1.5, §3).

```
1  FIRST, always       the PUBLIC-INTEREST STATEMENT (COMPLIANCE.md rule 5; T5 :796) and the LEGAL DISCLAIMER
                       (COMPLIANCE.md :95–:99, verbatim, in the page's language). The first two elements in
                       document order, before the claim, before any navigation chrome the layout adds.
2  THE CLAIM           verbatim, as the heading (A2 :1268) · the provision, named by its table entry (A1
                       :1251–:1254) · the author's handle · published on <date> · a COPY of `thesis <id>` for the chat. The
                       hash is in the VERIFY disclosure (§4), not here. **The context line is RETIRED 2026-09-18 (§4 :159) — no thesis has a short name to put in it.**
3  THE TEXT            the published version's Markdown as long-form reading — one column, generous measure,
                       Hebrew-first; a URL or a date inside the text is bidi-isolated LTR. Each citation token is
                       a CHIP inline where the token stands: for #ev_ the record's page (its domain and title)
                       and its date or interval; for #tr_ the claim's first words and "removed <date>, never
                       restored" or the trajectory's own state; for #doc_ (reserved, document §7) the
                       commitment's short form. A chip carries its marks: VERIFIED · FLAGGED · argued.
                       Tap → THE CITATION SHEET (§18). **AMENDED 2026-09-18 (the researcher): the text renders EVERY Markdown capability the researcher's drafting produces — emphasis, strikethrough, lists, quotes and TABLES — because the text is written with a model in claude.ai and a capability silently dropped is a sentence the researcher wrote and no reader sees. "One column" governs the READING MEASURE, not the block types: a table keeps the measure by scrolling inside its own box, never by widening the page (§6 :963's `scrollWidth <= 375` stands). `html: false` STAYS — raw HTML in the researcher's text renders as the text it is, and "every capability" never means markup — and `linkify` stays off, so a bare URL remains isolated text rather than a link nobody chose. Task lists (`- [ ]`) and footnotes (`[^1]`) are NOT part of a thesis (the researcher, 2026-09-18) and stay unrendered: both need a plugin, and a thesis is an argument, not a working document.**
4  THE APPEALS         one section, two kinds, each an item card (T5 :819–:821; T4):   — REMOVED 2026-09-16 (R56 ruling; docs/gf-ui-design-session-2026-09-16.md §3): one card leads to the call page
     REQUESTED gap     the request READY TO SEND: text · the authority · legal basis · addresses · the records
                       it rests on (chips) · the instruction: send it under your own name; if you receive an
                       answer, submit it here (T4 :677–:679). One COPY of the request text — the moment is
                       the instruction's.
     CALLED gap        the call item: what is needed · who would have seen it · the unit · the window (A2
                       :1327–:1328) · how to reach the platform. Units and roles, never a person (T4 :692).
     the intake line   `appeals.intake`, the body's own instruction text, rendered as given; NO link is
                       drawn to a door until the document plan's dialog lands (plan :506–:509, the
                       intake-down window) — the page never points at what is not there.
     none              a thesis with no CALLED and no REQUESTED gap shows no appeals section (T4 :692–:694)
5  THE CASE            the publication rationale, the researcher's words (T5 :822) · beside it the facts:
                       "published over the assessor's objection" when overObjection · "an analysis was run
                       on this version" when analysisRun (T5 :827–:829) — facts, no content
6  HISTORY             every version that was PUBLISHED, by date, newest first (T6 :898–:901): each row the
                       date and the author's handle; between two rows "what changed" opens the DIFF (§18); a withdrawal
                       sits between the versions it separates (T6 :917–:918). A history of one is one row.
7  THE PAGES           one link per cited page to `/corpus?page=` (T5 :824–:825; chunk 2's id beside the url):
                       "everything the researcher looked at, selected or not" — the counterweight, named as
                       such in one sentence above the links (evidence §1; architecture §9.2 :326–:330).
8  LAST                the disclaimer again, short form, and the VERIFY disclosure, closed: the version's hash, each
                       cited record's hashes, with copy, and one line on how to check them — the page is
                       public, the archive captures it for anyone who asks (T5 :795–:796).
```

## 18. THE SHEETS — **AMENDED 2026-09-16:** the citation record is a right-pane tab at width, full-screen on the phone; the chip is a dated tick (docs/gf-ui-design-session-2026-09-16.md §1.8, §3). **AMENDED 2026-09-18 — HOW THE PHONE REACHES THE PANE: a swipe.** On the phone the pane is a full-screen layer, and until this amendment its only door was a dated tick — so a reader who pressed none never learned it was there. The researcher: *"on mobile the thesis view does not let you reach the information the desktop shows in the right pane in any easy way. Today only pressing a document's date bubble jumps the page to the right side. I want a swipe right on mobile, from the thesis page, to take the reader to the right side, and a swipe left to bring them back."* **CORRECTED 2026-09-18, the same day, after the researcher held it on a phone: a swipe LEFT opens the pane; a swipe RIGHT returns to the read.** The first implementation took the destination for the direction and read backwards — *“swipe right … makes it feel like we are exposing a section to the LEFT of the visible page”*. Content follows the finger: a finger moving left drags the page left and uncovers what lies to its right. Naming the destination and naming the gesture are opposite acts, and **the clause names the gesture**. The mapping is PHYSICAL — where the pane is drawn — not derived from the writing direction, so it is the same in both locales. It belongs to the SHELL, not to a page, and is inert wherever no tab is declared — which is exactly the set of pages with no pane, so no page opts in and none can forget to. It is the dated tick's EQUAL, never its replacement: the tick still opens a specific record, the swipe opens the pane the reader is already beside. **SIX REFUSALS ARE PART OF THE CLAUSE, because each is a touch that belongs to something else:** a gesture begun within 24 px of either edge is the operating system's (back, Control Centre) and the page claims neither; a gesture begun on a box that pans horizontally — a table in the researcher's Markdown, a code block — belongs to that box; travel that does not beat the vertical by 1.6 is a read and not a swipe; travel under 56 px, or slower than 600 ms, is not a swipe; a second finger is a pinch; **and a gesture inside the OPEN NAV DRAWER belongs to the drawer** — it is a layer over the page, rendered inside the element the shell listens on, so without this refusal a swipe in it opened the pane behind it (added 2026-09-18, found by a cold read). **IT ANIMATES, AND THE MOTION IS THE ORIENTATION** (the researcher, 2026-09-18): *“we need the center section to slide to the left, showing the right side entering the view, so the user is able to understand the orientation of the pages”*. On a phone the pane is a FULL-SCREEN layer, so without the travel the page simply becomes a different page and nothing tells the reader which way the two lie. The centre leaves LEFT while the pane enters from the RIGHT edge, both over one duration so the halves cannot drift apart, and the translation is PHYSICAL so it does not flip with the Hebrew document. **A reader who has asked for reduced motion gets the same pane and none of the travel**, the orientation then carried by the back control as it was before. **It still draws no affordance** — weighed, not ruled; that the gesture is undiscoverable to a reader who never tries it is recorded as open, not as done.

**THE CITATION SHEET — an #ev_ chip.** Over the text, returning to the same place:
- the record: page (url, as a link to `/corpus?page=`), kind CAPTURE or DIFF, its timestamp or its pair;
- the PINNED content: a capture's text, or a diff's CURRENT chunks as two stacked registers — left, right —
  each chunk marked by side; long content scrolls inside the sheet, the header stays;
- VERIFIED per capture (evidence §5 :447–:450): for each capture beneath it, ATTRIBUTED and "anchored hash =
  document hash", as marks; `notEvaluable` shown as the reason, never as a failure;
- the FLAG when FLAGGED(m): withdrawn on <date> for <reason> · content moved on <date>, not re-affirmed · shed
  (evidence A3; document §8 :945–:946) — the reason is the evidence row's, public by evidence §6;
- argued: yes; over the assessor's objection: yes / no — the facts (T5 :816–:817);
- one link onward: the record's own page (`/pages/[id]/captures/[c]` or `/diffs/[b]/[a]`) and `/records/[hash]`.

**THE TRAJECTORY SHEET — a #tr_ chip.** The trajectory as cited: the claim, its captures in order, present /
absent per capture, and "the newest pass agrees" or the STALE mark with what it says now (T5 :818; A3 :1386).

**THE DOCUMENT SHEET — a #doc_ chip. RESERVED.** Exactly document §7 :848–:860's block, by custody and opening,
the SEALED notice fixed; rendered when step 34 lands, not before.

**THE DIFF — between two published versions.** Computed by the frontend from the two texts (T6 :900): at phone
width an INLINE diff over one column, removed runs struck, added runs marked, citations chips in both; at
expanded width the two texts side by side. The versions' dates head the view, the hashes in VERIFY; "every citation whose pin moved"
is listed beneath it (T6 :900–:901), read from the two versions' resolved mentions.

## 19. THE NOTICE, THE 404, AND THE VERSION PAGE

- **WITHDRAWN (200).** The page shows: the disclaimer · "withdrawn by its author on <date>" · nothing else — not
  the text, not the reason, not the claim (T6 :915–:917). The URL stays; a reader who arrives by an old link
  learns what happened. The cited pages stay open through `/corpus` (T6 :920–:924), but the notice draws no link
  to them: "nothing else" is the contract.
- **404.** One sentence for a draft, a missing id and a never-published thesis alike (chunk 2 §8): no hint.
- **`/theses/[id]/versions/[v]` (A5 :1570).** A version that was published: the same page shape as §17 with a
  banner first — "a previous published version; the current one is here" — and, while the thesis is withdrawn
  or for a version a Withdrawal names, the NOTICE and never its text (A5 :1570, 2026-09-14).

## 20. THE CALL PAGE `/call/[id]` — **AMENDED 2026-09-16:** the legacy shape, the letter in a dialog, also a right-pane tab beside the thesis (docs/gf-ui-design-session-2026-09-16.md §1.6, §3). **AMENDED 2026-09-17 (the researcher):** the call is a SHAREABLE CALL TO ACTION, not a second reading of the thesis — what is being proved, WHAT IS MISSING, and what a reader can do; the evidentiary depth belongs to the thesis page alone. **THE OBJECTIONS ARE NEVER SHOWN:** what weakened the claim appears as what is MISSING, never as who objected — `overObjection` stays the fact §17 :550–:552 allows, and no objection text reaches a public page (§16 :517–:521; §21 :621). Nothing new is read: `whatIsNeeded` on a CALLED item IS what is missing (thesis flows A5 :1567). The right-pane TAB is board 3A MINUS the folded preface and the full disclaimer, which the centre already carries; the PAGE keeps both, being neither.

**The appeals alone, shareable.** Two reads, both public and identity-free: `GET /api/thesis/:id` for the
statement, the disclaimer's place, the claim and the provision (A5 :1569 — "the one source of the public-interest
statement a call page shows"; step-23 Live-13), and `GET /api/thesis/:id/call` for THE_CALL and THE_REQUESTS
with the intake instruction (A4 :1501–:1504).

```
1  FIRST     the statement · the disclaimer (COMPLIANCE.md :92 — the PAGE always; the right-pane TAB never)
2  THE THESIS what is being proved: the claim in one line, and the link back to the thesis page for the depth
3  WHAT IS MISSING  each CALLED item as §17's card: what is needed · who would have seen it · unit · window
4  REQUESTS  each REQUESTED item as §17's card, the request ready to send, one COPY
5  HOW       the intake instruction, the body's text; the CTA behind `DOORS_OPEN`, NOT DRAWN until step 32
6  LAST      the disclaimer, short form
```

`{ live: false }` is a page, not an error: "no appeal is open on this thesis", with the link to the thesis (A4
:1503). A thesis never published is the one 404. The page's share metadata carries the statement and the claim,
never a call item's text — a call names units and roles (T4 :692), and the metadata says less than the page.

## 21. WHAT THE PUBLIC PAGES NEVER HAVE

- **No model voice**: A7 :1688's shape test on the route, and §23's test on the render.
- **No write, no door drawn before it exists**, no "submit" that leads nowhere (plan :506–:509).
- **No second sentence for a 404**, no reason on a notice, no text on a withdrawn version.
- **No person's name** in anything the page adds — the gate's `NAMES_NO_PERSON` holds the version and the
  appeals (T5 :757); the page's own chrome, labels and metadata name offices, units, pages and dates.
- **No client-side re-verification**: VERIFIED is the body's; the reader who wants to check hashes is sent to
  the record's page and the archive, not given a button that computes trust.

## 22. WIDENING — **AMENDED 2026-09-16:** at width the record is a right-pane tab, not a margin panel (docs/gf-ui-design-session-2026-09-16.md §3).

The text keeps a reading measure at every width; what widens is the margin: at expanded width the citation
sheet becomes a margin panel beside the paragraph that cites it (the footnote-in-margin pattern), and the
history's diff goes side by side. The appeals and the pages stay below the text at every width — the order is
T5's, and a wider screen does not reorder it.

## 23. INSTRUMENTS FOR THE APPENDIX

- `statement-and-disclaimer-first`: on `/theses/[id]` and `/call/[id]`, the first two content elements in
  document order are the statement and the verbatim disclaimer; a fixture lacking a statement renders the
  disclaimer first and nothing above it.
- `no-model-voice-public`: the render of a fixture body carrying a planted `analysis` field shows none of it;
  and no public page component imports chunk 3's labelled-opinion container.
- `notice-only`: a withdrawn fixture renders the date and the disclaimer and no other text node from the body.
- `no-door-before-it-exists`: no anchor on a public page targets an intake or withdrawal URL until the flag the
  document plan's step 32 sets; a decoy anchor fails it.
- `diff-consecutive-published`: the history's diff for two fixture versions equals the expected diff and lists
  every mention whose pin moved.
- `bidi-isolated`: every hash, URL and timestamp rendered inside Hebrew text is inside an isolating element; a
  decoy bare hash fails it.

---

## 24. THE CHRONOLOGY — one stream, two doors — **AMENDED 2026-09-16:** the page card with the time strip is the first region and the scrubber; a search page `/corpus/search` exists (docs/gf-ui-design-session-2026-09-16.md §3). **AMENDED 2026-09-18 (the researcher): `/corpus` OPENS ON A PAGES LIST, and the SEARCH PAGE IS DEFERRED.** The corpus had no public door of its own — the sidebar's הארכיון entries are `lib/recents.ts`, browser-local, and empty for a reader who has opened nothing. So `/corpus` opens on **one row per page url — the url, the interval, the record count — and no time strip on a row**: a strip is ONE page's shape over time and reads as a heading, which is the home it already has at the top of `/corpus?page=<id>`. **No search and no count over the list**, by §33's own reasoning for the door: few by design and added slowly. The STREAM is one tap away, as a lens beside CLAIMS and RECORDS. **THE LIST'S ONLY LEGAL SOURCE IS THE `pages` FACET AT `public`** (§28) — never `list_pages` and never the facet at `all`, either of which would list SURVEYED pages and tell a stranger what is under investigation before it is published (§9.5). It is ONE component at two scopes: public here, and at `all` in §27 with the NOT PUBLIC mark on the rows no published thesis has cited yet. The search page returns when the corpus is large enough to need it; `GET /api/corpus/search` stays mounted meanwhile.

**`/corpus` and `/research/corpus` are ONE page rendered from one read at two scopes** (§6.1): `list_corpus` at
`public` over the opened pages, at `all` over every surveyed page. The page is the same component; the gated
door adds the extraction sheet (§27) and marks the rows of pages not yet opened. Every row is a corpus record
(evidence §1) in TIMESTAMP order across pages; no other order exists (A4 :1091), and the page offers none.

**Two weights of row, because two kinds of thing.** A CAPTURE is an endpoint: a thin row — the page's label,
the timestamp, the anchor mark (ATTRIBUTED, or not yet). Its COPY gives the citation token. A DIFF is the event: a card —
the page's label, the interval (before → after), the size of the change (chunks by side, from `current`),
the classifier's opinion as ONE chip under rule 3's label (significance; the rest in the sheet — evidence §5
:469–:470, A4 :1086–:1087: "LABELLED as opinion"), the CITED mark with the published theses that cite it, the
NARROWED mark, and AWAITING DERIVATION as a state, not an error. The stream reads as pages changing over time,
the captures as the ticks between changes.

**The corpus's one public model voice.** The classifier's opinion on a diff is public by contract (A4 :1086)
and it is the ONLY model voice on any public page: it sits in chunk 3's labelled container, the same component,
and `no-model-prose-public` (§9) is written to allow exactly this field and nothing else.

```
0  THE PAGES LIST     THE DEFAULT, amended 2026-09-18. `/corpus` with NO query parameter is one row per page
                      url — the url, the interval, the record count — and NOTHING else. NO time strip on a
                      row: a strip is ONE page's shape over time and therefore reads as a heading, and it has
                      that home already at region 3. NO search and NO count over the list, by §33's own
                      reasoning for the door — few by design, added slowly. Its ONLY legal source is the
                      `pages` facet at `public` (§28); `list_pages` and the facet at `all` are the §9.5 leak.
                      ONE component, two scopes: §27 renders it at `all` with the NOT PUBLIC mark.

                      ANY OF THE FIVE READ PARAMETERS MEANS THE STREAM — `page` · `since` · `until` ·
                      `kind` · `cited` — and that rule is forced rather than chosen: the thesis page's
                      `/corpus?page=<trackedUrlId>` must land on the stream filtered to that page, and it is
                      a link already specified in four places. So the bare URL is the list, those five carry
                      it to the stream, and no link that exists today changes meaning.

                      **CORRECTED 2026-09-18, the same day, by a cold read.** This clause first said "ANY
                      QUERY PARAMETER" and then enumerated exactly five in its next sentence — two rules in
                      one paragraph. Taken literally the broad one is a defect: `?utm_source=` or a locale
                      switcher's leftover would turn the list into an EMPTY STREAM, a page changing its
                      identity because something appended a tracking parameter. **A PARAMETER THE PAGE DOES
                      NOT KNOW IS NOT A FILTER**, and it does not suppress one either — `?utm_source=x&page=y`
                      is the stream filtered to that page. An empty value (`?page=`) is not a filter, and
                      neither is a value the page cannot parse.
1  THE CONTEXT LINE   sticky: the scope (opened pages · every page) · the active filters as chips · the count
                      the read returned so far · the LENS control: PAGES · STREAM · CLAIMS · RECORDS
2  THE FILTERS        one row of chips, horizontally scrolling: PAGE (a picker from the read's own `pages`
                      facet, §28) · SINCE / UNTIL · KIND (captures · diffs · both) · CITED. Every chip is a
                      query parameter of the one read (§8: never a second read); the URL carries them, so a
                      filtered view is linkable and the thesis page's `/corpus?page=` is one of them
3  THE PAGE CARD      AMENDED 2026-09-18: it REPLACES the date axis and sits BELOW the filters. The page's
   WITH THE TIME      url, its interval, its record count, and the STRIP — captures as dots with cited ones
   STRIP              ringed, diffs as bars by chunk count, positioned by time with month labels. It IS the
                      scrubber the axis was, and it is ONE page's shape, which is why it is a heading here
                      and never a row in region 0. The stream is long (a page can hold hundreds of real
                      changes, interaction :95) and a reader arrives with a date in mind (researcher day
                      :56–:58); the strip answers that without a second element.
4  THE STREAM         cursor-paginated on the read's own cursor, oldest first within the range, "load older"
                      and "load newer" at the ends; a row tap opens THE RECORD as a RIGHT-PANE TAB (§26, and
                      the UI plan's §10 :1138 — a tab since the shell gained a pane, not a sheet); a page
                      label tap adds the PAGE filter
5  EMPTY              public: "no page is open yet — a page opens when a published thesis cites it" (evidence
                      §5 :475–:479); filtered: "nothing in this range" with the filters shown for removal
```

## 25. THE LENSES

**CLAIMS — `/corpus/claims`, `list_trajectories`.** The same context line, filters and axis; the rows are
trajectories, ordered by the date the claim LEFT, latest first (§6.1), so "removed and never restored" reads
first (prosecutor §4 :87; researcher day :61–:62). A row: the claim's first words · the page's label · the
pattern as a strip of ticks — present, absent, present — across its captures · the currency mark:
PINNED_IS_LATEST / RECOMPUTED_AGREES as current, RECOMPUTED_DISAGREES / NOT_FOLLOWED_BY_LATEST as STALE (A3
:1386–:1388) · CITED when a published thesis cites it. Tap → the claim's sheet: the captures in order with the
claim present or absent at each, each capture a link to its record, and the diffs in which it left or returned.

**RECORDS — `/corpus?cited=1`.** Not a page: the stream filtered to rows with `evidence ≠ null` (A4 :1089),
each card showing the record's standing — PROMOTED or WITHDRAWN — and its citing published theses. The
unselected are one chip away, which is the point of a lens over the stream rather than a catalogue of
selections (architecture §9.5 :377–:380).

## 26. THE RECORD SHEET, AND THE RECORD PAGES

**The sheet** opens over the stream and returns: a capture's text, or a diff's CURRENT chunks stacked by side;
the marks in full (anchor, VERIFIED per capture where the row is cited, the opinion's categories, editorial,
classifier version and draws under the label, `narrowed` with what intervened); the citing theses as links;
and ONE link onward to the record's own page.

**`/pages/[id]/captures/[capture]`** — a capture, whole: the page and timestamp as the heading; the text
version in full; the anchor as a mark, ATTRIBUTED; the COPY of the citation token; the VERIFY disclosure holding
document hash, text hash, extraction version and registry index; a CHAIN CHECK on
demand — one button whose moment is defined by the reader's doubt — calling `check_on_chain_status` (A4
:1111–:1115) and showing isRegistered · ATTRIBUTED · anchored = document · the stored verdict and its version,
or CHAIN_UNAVAILABLE as a statement about the check; the SECOND WITNESS: a link to the archive at this URL and
timestamp, composed deterministically (evidence §5 :428–:430), **with one line saying the archive holds this page
at this date and the link opens it — AND NO INSTRUCTION TO HASH ANYTHING.**

**AMENDED 2026-09-18 (the researcher): „הקוראים לא יבינו את ההוראה לגבב את הקובץ. זה טכני מאוד ולא נדרש.”** The
line had read *"fetch, hash, compare"*, and it was WRONG as well as technical — wrong in a way only a measurement
showed. Wayback serves two forms of a capture: the VIEWER form `/web/<ts>/<url>`, which is what a reader should
open, and the RAW form `/web/<ts>id_/<url>`. Measured on the 2021-12-23 capture of the ministry's vaccine page:
the viewer form returns **54,180 bytes** hashing to `1b108bb2…f7e043a`; the raw form returns **47,731 bytes**
hashing to `5887afdf…b19b0c1`, **which is the `documentHash` the platform anchored, exactly**. The 6,449-byte
difference is the archive's own toolbar. So a reader who followed the instruction on the link they were given
would have got a MISMATCH and concluded the evidence was fabricated.

**THE CAPABILITY DOES NOT MOVE — ONLY THE INSTRUCTION DOES.** `gf-evidence-flows.md` §5 :428–:430 says an outsider
"fetches, hashes and compares", and that remains true and unamended: it is a statement about what is POSSIBLE, not
about what a page tells a reader to do. **The RAW form joins the VERIFY DISCLOSURE** (§4 :175–:177) — closed by
default, beside the document hash it matches, "for the reader who came to check". That is where someone who came
to verify already is, and it is the only place the raw form is named. **A reader is never sent to it and never
told to hash anything.**

**`/pages/[id]/diffs/[before]/[after]`** — a diff, whole (`get_diff_input`, A4 :1095–:1099): the two texts as
an inline diff at phone width and side by side when wide, the CURRENT chunks listed by side beneath, the
opinion labelled, `narrowed` with the intervening captures as links, the citing theses; both endpoints link
to their capture pages. AWAITING_DERIVATION (409) renders as the state: "this pair's content has not been
derived yet", with the two capture links still live.

**`/records/[fileHash]`** — what a stranger holding a citation needs (A4 :1105–:1109): the record the name
resolves to, kind, page, timestamps; RECOMPUTABLE and VERIFIED with per-capture attribution as marks; the
published versions that cite it, each with FLAGGED and its text; one link to the record's page. A document
commitment answers document §7 :848–:860's block — RESERVED, with the sheet of chunk 4.

## 27. THE GATED DOOR — `/research/corpus`

The same page at `scope: 'all'`, and three additions, none of them a page:
- **rows of a page not yet opened carry a NOT PUBLIC mark**, so a researcher knows what a reader cannot see;
- **THE EXTRACTION SHEET, from any capture row** — "how this text was extracted": the work-list row
  (`list_captures`, A5 :1206–:1209: outcome, digest, comparedTo, rulesetId, stale, stopGates); the rules in
  force at this capture's date (`get_article_rules` :1199–:1206, filtered by validFrom/validTo); each rule one
  step further (`get_rule_history` :1214–:1224): its decisions and its matches capture by capture with the
  removed text where a body is held. Three reads, three nested sheets, opened only on demand — the walk's
  working state is reachable from the record and from nowhere else (§1);
- **the PAGE facet is `list_pages`' answer** (A5 :1070): every surveyed page with its rows counted per outcome
  and, from `get_article_rules`, whether a stop is PENDING — shown as a fact ("a stop is pending; it is resolved
  in the chat"), never as the marking link, because the instructions come from the chat before the URL does
  (MARKING :576–:578).

## 28. ONE AMENDMENT TO §6.1 — the `pages` facet

The public page filter needs the set of pages in scope, and no public read lists pages (`list_pages` is
GATED, and rightly: a public list of surveyed pages is the §9.5 leak). So `list_corpus` returns, beside
`entries`, **`pages: [{ trackedUrlId, url, public, first, last, entries }]` (`public` added by docs/gf-ui-refactor-plan.md UI-2, 2026-09-15) — the pages of the SCOPE**, computed with the
read: at `public` exactly the opened pages, which are public by definition; at `all` every surveyed page. A
facet on the one read, not a second read (§8), and at `public` it reveals nothing the thesis pages' links do
not already reveal.

## 29. `/research` — the door to the read view

```
1  WHAT I OWE          first, stop-shaped: list_thesis_reviews at `mine`, one switch to `all` (§7.1) — each
                       entry: the thesis (claim), the kind (FLAGGED · STALE_TRAJECTORY · UNARGUED · ARRIVED
                       later), its material, ONE COMMAND with a copy button; and list_evidence_reviews — the
                       corpus-wide CONTENT_MOVED entries (evidence A4 :1146–:1152), old chunks beside new, the
                       citing theses, the commands. Empty is a line saying so.
2  THESES              list_theses at `mine`, the switch to `all`: each row the claim · provision · author ·
                       DRAFT / PUBLISHED = HEAD / PUBLISHED ≠ HEAD / WITHDRAWN · unargued n · open gaps n ·
                       framing attached — tap → `/research/theses/[id]`; published ones link to the public
                       page too
3  FRAMINGS            list_framings (A4 :1432): every framing, oldest first — question · provision · author ·
                       the thesis it attaches to or none · its latest round · the CHOSEN claim verbatim —
                       tap → the framing sheet (get_framing); one with no thesis is a framing that produced
                       none yet, shown as such (§12 :1163)
4  THE CORPUS          in numbers, from list_pages: pages surveyed · rows by outcome · stops pending (a fact) —
                       and the link to `/research/corpus`
```

The switch `mine` / `all` is one control on the page and it sets one parameter on two reads; it is
navigation, not an act. Nothing on `/research` writes.

## 30. WIDENING — **AMENDED 2026-09-16:** the shell of docs/gf-ui-design-session-2026-09-16.md §1.1.

At medium width the filters become a side rail and the date axis a column; the record sheet becomes a side
panel beside the stream; at expanded width the extraction sheet nests as a third column. The stream's row
weights do not change: a capture is thin and a diff is a card at every width. `/research` at width is a
dashboard of four regions in the same order; the owed strip stays first and full-width.

## 31. INSTRUMENTS FOR THE APPENDIX

- `one-stream-two-doors`: `/corpus` and `/research/corpus` render from one component and differ only by scope,
  the NOT PUBLIC mark and the extraction sheet; a decoy second stream component fails it.
- `filter-is-a-query`: every filter chip maps to a parameter of `list_corpus`; a source scan that no corpus
  page fetches `list_findings`, `list_pages` (publicly) or any second read for a filter.
- `opinion-labelled-on-corpus`: every rendered `opinion` field is a descendant of the labelled container, and
  no other model field is rendered anywhere on a public corpus page.
- `no-marking-link-from-research`: no anchor under the research pages targets `/article-rules/…`; the pending
  stop renders as text.
- `record-page-witnesses`: a capture page renders the archive link composed from url and timestamp and the
  chain check only on the reader's act; a fixture with `CHAIN_UNAVAILABLE` renders the statement about the check.
- `pages-facet-equals-scope`: at `public`, the `pages` facet equals the set of PUBLIC_PAGE pages; at `all`,
  `list_pages`' set — held on the read, not the page.

---

## 32. THE LAYOUT — what every page carries, and nothing more — **AMENDED 2026-09-16:** the sidebar IS the nav, with the categories תזות · הארכיון and their last-watched lists; the dove is the door's, not the sidebar's (docs/gf-ui-design-session-2026-09-16.md §1.1, §1.3, §3).

```
THE NAME       "צדק לעם - תיק הקורונה", the dove, at the top of every page; never "Glass Fortress" in
               anything a reader sees (CLAUDE.md). Where the name leads — this site's door, or the Teder
               portal that fronts both cases — is THE RESEARCHER'S: no design names the portal.
THE NAV        public, in this order: הבית · הארכיון (`/corpus`) · אודות · הגנה (`/safety`, when live) ·
               לחוקרים (`/researchers`). A signed-in researcher gains מחקר (`/research`) and their handle
               → `/profile`; an admin gains `/admin`. Nothing else is in the nav: not a dialog (§1),
               not a lens, not a retired page. On a phone the nav is a sheet from one control.
THE LOCALE     he default, en beside it, one control; the same URL under the other prefix (`routing.ts`).
THE FOOTER     the open-source link · nothing that names a person. The disclaimer's short form is the LAST
               element of each page that renders a thesis or an appeal (§17.8, §20.6, §33.5), never the
               footer's: a layout cannot know the page without a second list (UI plan UI-4, 2026-09-15). **AMENDED 2026-09-17: there is no footer element from UI-4b — the shell has no place for one. The open-source link moves to the SIDEBAR'S FOOT, beside אודות · לחוקרים · the locale control, and `nav-is-the-map`'s two footer cases move with it; the rule is unchanged, only its home.**
THE BANNER     staging only: the environment named, as today (`StagingBanner`), because a reader on
               staging must never mistake it for the public site; production has none.
RETIRED        the floating chat widget (§3) · the mission statistics (`/api/stats`, §6) · every nav
               entry to a retired page.
```

**Robots.** Staging disallows all, as today; production allows all. A public page's share metadata (title,
description, image) is composed from the body — the claim, the statement — and names no person (§21).

## 33. THE DOOR `/` — **AMENDED 2026-09-16:** the centre's empty state, the dove and the glow above the paragraph (docs/gf-ui-design-session-2026-09-16.md §1.3). **AMENDED 2026-09-17:** the door's field is the dark `--door-field`, the one surface that is not paper; the light animation is the door's and stays.

**The door is the LATEST published theses and one sentence about what this is. AMENDED 2026-09-18 (the
researcher): it is no longer THE WHOLE LIST — `/theses` is.** `GET /api/thesis` (A4 :1427): each thesis a card —
the claim as the heading · the provision · the author's handle · published <date> — tap → `/theses/[id]`. Newest
first, and the door shows the latest of them with one entry onward to `/theses`.

**WHY THE LIST LEFT THE DOOR.** The old text made `/` the whole list and gave it "no search, no filter and no
count, because the published theses are few by design and each is a commitment". The reasoning about FEWNESS
stands and moves with the list to `/theses`, which likewise carries no search, no filter and no count. What did
not stand is the door DOUBLING as the index: the home is where a reader arrives and learns what this is, and the
page built at `/` has always shown a selection (`theses.slice(1, 5)`), so the design and the build disagreed and
the sidebar's תזות had nowhere to go. One page cannot be both the welcome and the catalogue.

```
1  the name and one paragraph: what the platform is — the archive's captures of the ministry's pages,
   anchored as served; every real change diffed; a thesis a researcher frames under a provision, cites,
   argues and publishes through a gate; the corpus open beside every published thesis so a reader can
   check it (evidence §1, §5; T5). The researcher's words, in Hebrew first; this design fixes the facts
   the paragraph may state and nothing it may not (§34).
2  THE PUBLISHED THESES — the cards; EMPTY: "no thesis has been published yet", with the one paragraph
   standing alone (production today, thesis plan :83–:84)
3  THE ARCHIVE — one entry to `/corpus`, with the same rule for its empty state (§24.5)
4  THE ENTRIES — three cards: report an adverse outcome → `/reports/new` (the reports plan's live
   discovery path, :656–:658); for researchers → `/researchers`; protection → `/safety` when live (§35)
5  LAST — the disclaimer, short form
```

## 34. `/about` — REWRITTEN. The facts it may state, and the three sentences it may not — **AMENDED 2026-09-16:** the dove heads the page (docs/gf-ui-design-session-2026-09-16.md §1.3).

The page is silent in every design and its copy today contradicts three of them: a registry on Arbitrum
(evidence §8, the registry is on Base); "AI classifies, summarises and ranks every piece of evidence" (evidence
§9.3 :337–:340: the row carries no prose and no tier; architecture §10.2: models write, the researcher decides);
"submit evidence now" (document A5 :1513: `/submit` is retired). The copy is THE RESEARCHER'S to write; this
design fixes what it may say:

```
MAY STATE     the corpus: captures from the Internet Archive, anchored by SHA-256 on the EvidenceRegistry on
              Base, one meaning per contract (evidence §8; architecture §9.7) · every real change kept and
              diffed, nothing deleted (§9.8) · a thesis is framed under a provision, its claim chosen after an
              assessed round, every citation a corpus record argued in a debate, published through a gate of
              named checks (thesis §10.4) · models write and the researcher decides; every model output is
              an opinion, labelled, never a fact (§2 :161–:169) · what is published names offices and roles,
              never a person (T5 :757) · the source code is public · the legal frame: COMPLIANCE.md's
              framework paragraph, in the researcher's words
MAY NOT       a chain other than Base · AI as a ranker, classifier-as-judge or summariser of evidence · any
              door that is not open (§35) · a person's name · a claim the corpus does not hold (rule 2)
```

## 35. `/safety` — DEFERRED, and what stands in its place until the door opens

Document §12 :1171–:1173 rules the rewrite "to what §2, §4, §5 and §8 build", and the document plan lands it
with the intake dialog after step 32 (:229–:231, :358–:359: "the step at which every promise on that page is
true"). The door is out of scope now (§1), and today's page promises a CID on Base, structured metadata for
the research team and no identity stored, and invites a submission through a retired route (document §5 :623,
§8 :976–:981). A public page that promises what the platform does not yet do is the class of claim COMPLIANCE.md
exists to prevent. So, until the document plan's dialog lands:

```
INTERIM /safety   one page, three lines, the researcher's words: submissions are not yet accepted; nothing
                  sent before was kept (the rebuilt database holds no document, evidence §8; thesis §11);
                  when the channel opens, this page will state exactly what is held, by whom, and what a
                  sender keeps. No form, no address, no promise. Out of the nav until then, reachable by URL.
THEN              the rewrite the document plan names, from §2, §4, §5, §8 — the facts document §8 :957–:968
                  lists for the privacy policy, and §5 :577–:581 said plainly: the derived text at rest.
```

The alternative — keeping today's page with its promises — is a false public claim and is not offered.

## 36. `/researchers` — KEPT, one correction

The invitation and the OAuth connection guide (OAuth plan §8.1) stay. One correction the reading found: the
MCP server URL is a constant naming PRODUCTION on every environment (`lib/api.ts:126`), so a researcher on
staging is told to connect to production first — the class of run B's Live-18. The page reads the URL from
its own deployment. The three-step "how it works" copy is re-read against the designs: research acts are
MCP-only (prosecutor §10), the "forensic scans from the UI" sentence goes, and "read access is always open to
everyone" becomes what §1 says — the published theses and the opened corpus.

## 37. `/login` · `/auth/callback` · `/oauth/interaction/[uid]` · `/unlock` · `/profile` · `/admin` — UNTOUCHED

The OAuth plan owns them (§5, §7.0b, §8.1); this design adds `returnTo` threading from the 401 of any gated
page (§13) and nothing else. `/profile` shows the handle and approval state; `/admin` the approval list; neither
is a research act.

## 38. INSTRUMENTS FOR THE APPENDIX

- `name-never-glass-fortress`: a scan of the messages and every page: no user-facing string contains "Glass
  Fortress"; a decoy fails it.
- `nav-is-the-map`: the nav's entries are exactly §32's set for each of the three identities (anonymous,
  researcher, admin); a link to a retired or dialog URL fails it.
- `no-id-as-text`: a render scan that no text node matches a 64-hex string, a cuid or a 14-digit wayback
  timestamp outside a VERIFY disclosure or a COPY control's value; a decoy bare hash fails it (§4).
- `safety-interim`: until the document plan's flag, `/safety` renders no form, no anchor to an intake URL
  and no promise sentence from the retired copy (a fixture of three retired phrases must not appear).
- `mcp-url-from-deployment`: `/researchers` renders the URL of its own origin; a constant fails it.

---

## 39. STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| every row of the corpus, evidence, thesis and document designs | their own writers, unchanged | any page, any route of this design — a route is a READ (§5) |
| the marking DRAFT | the marking page (interaction A6) | any other page; it is CACHE, never a decision (thesis §2 :128–:132) |
| a per-viewer convenience — the locale, the `mine`/`all` switch, a collapsed VERIFY, a scroll position **— AMENDED 2026-09-17: and the shell's own, from UI-4b: the recents list under one `localStorage` key, the sidebar's and the right pane's widths, the collapsed flag and the active tab. The row's subject is the CATEGORY and these are instances of it; :925's "nothing else exists" governs SERVER state, which none of these is** | the browser, locally | the backend; no flow reads it, and a page renders correctly without it |
| the staging cookie | `/unlock` (OAuth plan §7.0b) | — |

**Nothing else exists.** No page holds a preference on the server, no page records that it was viewed, no route
writes on GET. The one thing a page hands back to the platform is a string on the clipboard (§4), which the
researcher pastes into the chat, where the act is made and attributed.

## 40. OUT OF SCOPE OF THIS DESIGN

Each is named so that it is not read as a gap. None is decided here; each says whose it is.

- **The public's doors** — the intake dialog, the withdrawal dialog, the `#doc_` sheet, the documents register,
  `/safety`'s final copy: the document plan's steps 32–35, against document §5, §7, §8, §9; this design reserves
  their places (§2.5, §18, §35) and builds none.
- **The marking page's shape and its phone form** — interaction MARKING and A6, unchanged; §4 names the limit.
- **The reports feature** — `/reports/new`, `/reports/patterns`: the reports plan's; ungating waits on counsel.
- **The copy** — every Hebrew and English sentence a page shows is the researcher's; this design fixes what a
  page MAY state (§34, §35) and where the required elements stand (§17, §20), never the words.
- **The portal** — whether the name leads to the Teder portal; no design names it (§32).
- **The Prosecutor's surface** — its runs and clusters are gated reads a later design gives a page, if any
  (thesis §10).
- **Search beyond a phrase** — evidence §10's read-tool design; `search_corpus` (§6.1) is the phrase rule at
  corpus width and no more.
- **Notifications** — nothing tells a researcher outside the chat that something is owed; T6 :866 has Claude
  report it when a conversation opens, and the owed strip (§11, §29) shows it when a page opens.
- **The integrity board** — a committed ledger under `docs/integrity/`, generated by a script; not a page of
  this site (refactor plan :636).
- **Accessibility beyond RTL and phone width** — measured against the rendered pages, not designed here.
- **Bronze Fortress** — untouched by every ruling here.

## 41. VERIFIED BY MEASUREMENT, NOT BY THIS DOCUMENT

- **The working view's history loads whole** (§12): the size of a real thesis's HISTORY(t) at phone width, on
  staging's thesis and on the first production one; a cursor is added when a measurement says so.
- **The chronology's density**: rows per page and per month on the real corpus, which decides the date axis's
  granularity (§24.2) and the default `limit` (§6.1).
- **The chain check on demand** (§26): how often a reader presses it, which decides whether it stays a button.
- **The copy controls** (§4): whether the citation token and `thesis <id>` are what researchers paste into
  claude.ai, read from the next unsteered run's transcript.
- **The three-voices rendering**: whether a reader can tell the researcher's words from the platform's marks
  from a labelled opinion — a reading test on the staging thesis, before the public page ships.
- **Phone-width fitness**: every page of §2 rendered at 375 px against staging's data with no horizontal scroll
  and the context line in view — a browser exercise in a dated doc, the document plan's precedent (:491–:493).

## APPENDIX — THE IMPLEMENTATION CONTRACT

Composed with the four designs' appendices and restating none. A1 names every page; A2 points at the routes
and fixes the states; A3 the access; A4 the amendments this design makes to the four; A5 the instruments; A6
the parameters; A7 what the UI refactor plan must carry.

### A1. Identity — every page, its URL, what names it, what it reads

```
PUBLIC (no identity; PUBLIC_PAGE where a page is involved)
  /                                        —                      GET /api/thesis
  /theses/[thesisId]                       the thesis             GET /api/thesis/:id
  /theses/[thesisId]/versions/[versionId]  a published version    GET /api/thesis/:id/versions/:v
  /call/[thesisId]                         the thesis             GET /api/thesis/:id · /call
  /theses                                  the published list     GET /api/thesis            (un-retired 2026-09-18)
  /corpus                                  the pages list · the   GET /api/corpus            (list_corpus public)
                                           stream when filtered
  /corpus/claims                           the scope + filters    GET /api/corpus/claims     (list_trajectories public)
  /pages/[trackedUrlId]/captures/[capture] page + timestamp       GET /api/pages/:id/findings (its row) · …/chain
  /pages/[trackedUrlId]/diffs/[b]/[a]      page + pair            GET /api/pages/:id/diffs/:b/:a
  /records/[fileHash]                      the record's name      GET /api/records/:fileHash
  /about · /safety · /researchers          —                      none
  /reports/new · /reports/patterns         the reports plan's     /api/reports/*
DIALOG (a researcher; reached by link only)
  /article-rules/[trackedUrlId]/[capture]  page + timestamp       /api/article-rules/… (interaction A6)
READ VIEW (a researcher; /api/research/…)
  /research                                the caller (mine|all)  reviews · evidence-reviews · theses · framings · pages
  /research/theses/[thesisId]              the thesis             theses/:id · framings/:id · debates/:sessionId
  /research/corpus                         the scope + filters    research/corpus · pages · pages/:id/captures · rules · history
  /research/corpus/claims                  the scope + filters    research/corpus/claims
AUTH · ADMIN                               the OAuth plan's       /login · /auth/callback · /oauth/interaction/[uid] · /unlock · /profile · /admin
```

A filter is a query parameter and never a path segment (§2). Every URL is under `/<locale>/`. An id in a URL
is never rendered as text (§4).

### A2. Routes and states

The routes are §6 and §7, and A2 does not restate them. The states every page renders, by door:

| state | public page | read view |
|---|---|---|
| loading | skeleton in the page's own order: what matters most paints first (§13) | the same |
| empty | the page's one sentence (§24.5, §33.2, §11.2) | the same |
| 400 | the filters shown for removal | the same |
| 401 | — (no public route answers it, except the staging gate → `/unlock`) | `/login?returnTo=` |
| 403 | — | one sentence, `/researchers` linked |
| 404 | ONE sentence for draft, missing and never-published alike; NOT_SURVEYED and NOT_PUBLIC alike | the refusal named (`NO_THESIS` …) |
| 409 AWAITING_DERIVATION | the state, both capture links live (§26) | the same |
| 503 CHAIN_UNAVAILABLE | a statement about the check (§26) | the same |
| 200 notice | the withdrawal notice, nothing else (§19) | the withdrawal in the stream with its reason (§11) |

### A3. Access — who sees what, by predicate

```
anonymous     every PUBLIC route; PUBLIC_PAGE (evidence A3 :1051, amended T6) gates a page's records;
              scope 'public' on the corpus reads; the staging cookie and header on staging
researcher    everything anonymous sees, byte-identical (thesis A7 :1686) · every /api/research route ·
              scope 'all' on the corpus reads · scope 'mine' | 'all' on the two lists (§7.1) · the marking
              dialog · /profile
admin         a researcher, plus /admin (OAuth plan)
```

A page never changes what it shows by who asks, except by the door it is behind and the scope it names: the
same component renders `/corpus` and `/research/corpus` (§24), and a colleague's thesis is the author's view with
the commands labelled (§13).

### A4. What this design amends in the four, and where (docs that move)

| document · clause | was | now |
|---|---|---|
| evidence A5 :1188 | "adds no route and no browser page" | adds no WRITE route; its PUBLIC reads answer as routes (§6) |
| thesis A5 :1559 | "adds no route and no browser dialog" | the same; its GATED reads answer under `/api/research` (§7) |
| interaction A6 :1227 | "the marking page's only surface" | `/api/article-rules` stays the marking page's only surface; the three GATED corpus reads and `list_pages` answer under `/api/research` |
| thesis A4 :1426–:1431 `list_theses` | researcher: "their own theses" | + `scope: 'mine' \| 'all'`, default `mine`; `all` adds every researcher's, with handle and `mine` (§7.1) |
| thesis A4 :1523 `list_thesis_reviews` · T6 :868 | "the caller's theses" | + `scope`, default `mine` (§7.1) |
| evidence A4 (new) | — | `list_corpus`, `list_trajectories`, `search_corpus`, each with `scope: 'public' \| 'all'`; `list_corpus` returns the `pages` facet (§6.1, §28) |
| thesis A5 :1565 `GET /api/thesis/:id` | `pages: [{ url }]` | `pages: [{ trackedUrlId, url }]` (§6) · + `provisionTitle` (§17.2, UI-5) |
| thesis T5 :824 | "a link to each cited page's public timeline (list_findings)" | the link is `/corpus?page=` (§17.7) |
| evidence A4 :1080 `list_findings` · :1101 · :1103 | unchanged | held equal to the corpus read at one page (§6.1, §9); :1101 and :1103 GATED 2026-09-15 (#487) |
| routes at HEAD | `GET /api/forensics/tracked`, `…/trajectories`, `GET /api/stats` | RETIRED (§6) |
| triage ruling 2 :31–:34 | the `/guide` pages removed (a dated doc) | restated as this design's (§3) |
| COMPLIANCE.md "Required UI Elements" :88–:99 | the disclaimer on every thesis and call page | unchanged; §17.1 and §20.1 place it first; a docs amendment records the pages' new URLs |

Nothing else in the four moves. Every write, every predicate, every check and every refusal is theirs.

### A5. The instruments, and what each turns from a claim into a measurement

Every instrument named in §9, §15, §23, §31 and §38 is listed once here; the UI refactor plan gives each a
file. **The frontend has no test runner today** (`package.json`: dev, build, start, lint, check:guide), so the
plan's first step is the harness — jest for the components and scans, a browser exercise for the pages — and
no instrument below exists until it does.

```
BACKEND (the backend suite; each with a decoy)
  route-is-tool                   a route's body equals the tool's for the same input
  one-page-is-the-corpus-at-one-page   list_findings = list_corpus at one page; the same for trajectories, search
  public-identical                every §6 route byte-identical with and without a session; the three 404s identical
  no-model-prose-public           A7 :1688 extended to every §6 route; `opinion` on a diff the one allowed field
  gate-by-prefix                  one gate on /api/research; no handler filters by caller id
  no-surveyed-page-anonymous      no public route lists TrackedUrl rows or answers scope 'all' without identity
  pages-facet-equals-scope        the facet equals PUBLIC_PAGE's set at public, list_pages' at all
FRONTEND — components
  every-kind-renders              all eleven history kinds render a row and a sheet
  opinion-under-label             every model field under rule 3's label; none outside
  three-voices                    one component per voice; no opinion or verdict through the researcher's
  diff-is-of-two-texts            the diff over two fixture texts equals the expected; two inputs only
  diff-consecutive-published      the public history's diff, with every moved pin listed
  statement-and-disclaimer-first  the first two content elements on /theses/[id] and /call/[id]
  no-model-voice-public           a planted analysis renders nothing; no public component imports the label
  notice-only                     a withdrawn fixture renders the date, the disclaimer, nothing else
  opinion-labelled-on-corpus      the classifier's opinion under the label; no other model field
  one-stream-two-doors            /corpus and /research/corpus from one component
  record-page-witnesses           the archive link composed; the chain check only on the reader's act
  bidi-isolated                   URLs and dates in Hebrew text isolated
  no-id-as-text                   no 64-hex, cuid or 14-digit timestamp as a text node outside VERIFY / a COPY value
FRONTEND — scans
  no-write-from-research          nothing under the research pages issues a non-GET or posts a form
  filter-is-a-query               no corpus page fetches a second read for a filter
  no-marking-link-from-research   no anchor to /article-rules/… from the read view
  no-door-before-it-exists        no anchor to an intake or withdrawal URL before the document plan's flag
  nav-is-the-map                  the nav equals §32's set per identity
  name-never-glass-fortress       no user-facing string names Glass Fortress
  safety-interim                  /safety renders no form, no intake anchor, none of the retired promises
  mcp-url-from-deployment         /researchers renders its own origin's URL
BROWSER EXERCISE (a dated doc, on staging)
  every page of A1 at 375 px: no horizontal scroll, the context line in view, the states of A2 provoked
```

### A6. Operational parameters — not judgements

`limit` on the corpus reads and its default · the sheet's nesting depth (three: a citation, its debate, the
record) · the history-loaded-whole threshold (§41) · the breakpoints (compact · medium · expanded, §14) · the
VERIFY disclosure closed by default · the staging banner's text · the date axis's granularity (§41).

### A7. What the UI refactor plan must carry — the seams

- **Routes before pages.** §6 and §7 land in the backend with A5's backend instruments green before any page
  reads them; the frontend's first change is the harness (A5), the second the layout (§32), then the pages in
  the order of their doors: the public thesis page (the thesis plan's open DoD :327), `/`, the chronology and
  the record pages, the read view.
- **The one cut-over.** The 2026-09-08 ruling (thesis plan :76–:79; refactor plan :426–:436) has the legacy
  pages leave in ONE cut-over at the end. This design gives every legacy page its replacement (§3); whether the
  cut-over stays one act or follows each page is THE RESEARCHER'S, in the plan.
- **Nothing lands on the frontend against a route that is not landed** — the plan's own hazard (thesis plan
  :331–:332), which is why routes go first.
- **The reserved places** (§2.5, §18, §35) are built by the document plan's steps 32–35 and not before.
- **`SHIP` is unchanged**: production carries no published thesis today; the public pages ship empty and true.
