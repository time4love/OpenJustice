# GF Cost-Exposure Hardening — Dev Plan

**Status:** Phase 1 (rate limiting) ✅ DONE 2026-08-19 — **and merged**: `src/middleware/rateLimiting.ts`
is on `origin/master`. (This line previously read "not yet committed/pushed/merged"; corrected
2026-08-21 after checking the actual ref.) Phase 1b ✅ DONE 2026-08-21 — see #9 below, the MCP surface
this audit missed entirely. Registrar wallet checked live: **0.001 ETH (~$2-3) balance** — the
on-chain drain path (#1 below) is currently self-limiting by funding, not by design; don't top the
wallet up beyond operational need until Phase 2 lands. Phases 2-5 not started.
**Created:** 2026-08-19.
**Scope:** Glass Fortress backend only (`apps/glass-fortress/backend`). Bronze Fortress is out of
scope — its routes are already gated behind `caseAuth` (see §0.1) and don't share this exposure.

---

## 0. Why this exists

Audited the GF backend for anywhere an anonymous internet user could run up a large, unintended bill
(LLM calls, on-chain gas, IPFS pinning). Two structural facts make almost every route exposed:

1. **No rate-limiting exists anywhere in the monorepo** — no `express-rate-limit`, no custom limiter,
   confirmed via `package.json` and repo-wide grep.
2. **`requireStagingAccess` (`src/middleware/stagingAccess.ts:38`) no-ops in production by design** —
   it exists to gate the *staging* backend's public Railway URL, and explicitly does nothing once
   `APP_ENV=production`. This is correct for its stated purpose; it just means production has **no**
   gate at all, and every finding below assumes production.

### 0.1 Findings, most severe first

| # | Route | File | Risk |
|---|---|---|---|
| 1 | `POST /api/evidence/confirm` | `evidenceRoutes.ts:184` | No auth, and doesn't verify the client-submitted `analysis` JSON came from a real prior `/intake` call — only schema-shape-checked. Attacker can fabricate valid analysis with a fresh `fileHash` per call and force `Web3Service.registerEvidenceHash()` on **Base mainnet** every time — drains the registrar wallet's real ETH, plus a paid Pinecone upsert per call. |
| 2 | `POST /api/forensics/scan` | `forensicsRoutes.ts:65` | No auth. Fires `WaybackScraper.runFullScan()`, an unbounded `while(true)` loop pulling 50-snapshot batches and running an LLM call per snapshot pair until the target URL's entire Wayback CDX history is exhausted. One request against a high-traffic domain = hundreds of Claude calls. |
| 3 | `POST /:id/gaps/:gapIndex/whistleblower/preview` | `thesisRoutes.ts:923` | No auth. Up to 10 files/call inside a 20MB JSON body, each run through a Claude vision call (`IntakeAgent` via `analyzeEphemeral`), no per-file size cap. Confirmed **not** triggered by page views (§0.2) — only by direct API calls, scripted or via the UI's tip modal. |
| 4 | `POST /api/evidence/intake` | `evidenceRoutes.ts:117` | No auth. LLM call on any uploaded file (10MB/image-PDF cap via multer — the one size guard that exists) or scraped URL text (no length cap before it reaches the LLM). |
| 5 | `POST /api/thesis`, `/:id/analyze`, `/:id/suggest-revision`, `/:id/foia-request` | `thesisRoutes.ts` | No auth, each triggers an LLM call, no rate limit. |
| 6 | `POST /api/chat`, `POST /api/arguments/generate` | `chatRoutes.ts`, `argumentRoutes.ts` | No auth, public LLM calls. Chat has a 2000-char input cap; arguments/generate doesn't. |
| 7 | `POST /api/thesis/suggest`, `POST /api/thesis/draft` | `thesisRoutes.ts:738,776` | Call the same handler MCP's `create_thesis_draft` requires an approved-researcher bearer token for (`mcpRoutes.ts` `WRITE_TOOLS`) — the REST wrapper skips that gate entirely. Auth-bypass, not just missing auth. |
| 8 | Pinata IPFS pinning | `EphemeralAnalysisService.ts:30-53` | No file-count/size cap beyond the global 20MB body limit; reachable via #3/#4. |
| 9 | `POST /api/mcp` → `suggest_thesis`, `get_research_agenda` | `mcp/mcpRoutes.ts` | **Found 2026-08-21, fixed same day.** Both were absent from `WRITE_TOOLS`, so they ran with no account at all. `suggest_thesis` embeds its topic then runs one long-context `ThesisSynthesisAgent` call; `get_research_agenda` with `includeSuggestions:true` runs `GapRevisionAgent` **once per open gap**, so a single request's cost scales with thesis state. Worse, `app.use('/api/mcp', mcpRouter)` is mounted *above* `app.use('/api', generalLimiter)`, so Express returned before the limiter ever ran — MCP was the only completely uncapped surface in the backend. |

### 0.1b Why this audit missed the MCP surface (#9)

Worth recording, because the same blind spot would recur. This audit enumerated **REST routes**, and
`/api/mcp` is a single route that multiplexes 21 tools behind a JSON-RPC body — so it appears once in a
route listing and looks like one endpoint, not twenty-one. Two of those tools spent money anonymously.

It compounded with a second habit: "write tool" was read as "tool that persists something". Neither
`suggest_thesis` nor `get_research_agenda` writes a row, so both looked like reads. **The criterion
that matters is what a call SPENDS, not what it stores.** `mcpRoutes.ts` now says so at the definition
site, and `test/mcpToolClassification.test.ts` fails if any registered tool is left unclassified.

### 0.2 One thing ruled out during this audit

User asked whether `/whistleblower/preview` fires just from viewing the publicly-shared
`/call/[thesisId]` link (shared on social media/WhatsApp) — confirmed **no**. That page's mount
`useEffect` only does `GET /api/thesis/:id` (already-stored data). The preview endpoint fires only
from `WhistleblowerModal.tsx`'s explicit "Submit" button, after a user selects files. So viral-link
traffic doesn't multiply LLM spend on its own — the exposure is scripted requests hitting the API
directly, not organic page views. Doesn't change the fix (the route still has no auth or rate limit),
just the framing: no need to touch the public thesis page itself.

---

## 1. Phase 1 — Global rate limiting (foundation, do first) — ✅ DONE 2026-08-19

Covers #2–#8; doesn't fix #1 (that needs the provenance fix in Phase 2 regardless of request rate),
though #1's blast radius is currently capped by the registrar wallet's low balance anyway (§ status
above).

Shipped, in `apps/glass-fortress/backend`:
- `src/middleware/rateLimiting.ts` — three tiers, all in-memory/per-IP (`express-rate-limit`):
  `generalLimiter` (300/15min, mounted on all of `/api/*` in `server.ts`), `aiCostLimiter` (10/15min,
  mounted on every LLM/on-chain-triggering route: evidence intake/confirm, thesis create/analyze/
  suggest-revision/version/suggest/draft/foia-request, whistleblower preview/confirm,
  arguments/generate), and `chatLimiter` (40/15min — chat is inherently conversational, `aiCostLimiter`
  would break normal use).
- `scanLimiter` (3/hour) specifically on `/api/forensics/scan` — the single most expensive route
  (one request can drive hundreds of LLM calls), so it needed a much tighter cap than the general
  AI tier.
- `WaybackScraper.runFullScan()` — added a hard cap of 5 CDX batches per invocation
  (`MAX_BATCHES_PER_INVOCATION`), then pauses (reusing the existing `PAUSED` status/resume flow) rather
  than continuing unbounded. A legitimate long scan now needs multiple `/scan` calls to finish, which
  `scanLimiter` also bounds.
- `app.set('trust proxy', 1)` added in `server.ts` — required for `express-rate-limit` (and anything
  else reading `req.ip`) to see the real client IP rather than Railway's proxy IP.
- Test fix: `test/thesisRoutes.test.ts`'s `getHandler()` grabbed `route.stack[0].handle`, assuming the
  handler was the only middleware on a route — broke once routes gained a rate-limiter ahead of the
  handler. Fixed to grab the last stack entry (the handler is always last regardless of how many
  middlewares precede it), not by special-casing routes.
- 568/568 tests pass, clean `tsc --noEmit`, no new lint errors introduced.

**Known limitation, not yet addressed:** IP-based limiting alone doesn't stop a botnet or rotating-IP
attacker. Defense in depth would be a global circuit breaker: a rolling counter of total LLM calls per
hour across all users, independent of IP, that short-circuits with a 503 once tripped — same shape as
the existing `previewCache` TTL map in `thesisRoutes.ts`. Deferred as a fast-follow (§6) rather than
bundled into this first pass.

- **Operational backstop, not code — still needs the user to do this:** set a hard monthly spend limit
  / usage alert in the Anthropic Console, and check Pinata's plan for an equivalent cap. This is the
  only thing that puts a real ceiling on the bill regardless of what any of the above code does or
  misses. Cross-reference the existing MEMORY.md priority to upgrade Railway to Hobby + set a usage
  soft limit — same category, already flagged, not yet done.

### 1.1 Follow-up fixes, same day (user feedback)

- **Limiters now skip outside production** (`skipOutsideProduction` in `rateLimiting.ts`, using
  `getAppEnv()`). Production has no other gate on these routes at all, so the limiters are load-bearing
  there. Staging and local dev already sit behind `requireStagingAccess`'s bearer token (or aren't
  publicly reachable), so the limiters were only adding testing friction there for no real protection —
  removed. If staging is ever made more openly reachable, revisit this.
- **Scan relevance gate, `/api/forensics/scan`** — a full scan can drive hundreds of LLM calls; nothing
  previously stopped someone from pointing it at an unrelated site to waste that budget. Added
  `ScanRelevanceAgent` (`src/services/ScanRelevanceAgent.ts`, prompt in
  `src/prompts/scanRelevanceCheck.ts`) — one cheap classification call, gemini-flash by default via
  `LLMFactory`, run once per new URL before a `TrackedUrl` is even created:
  - Content source: live page (`scrapeUrl`) first; falls back to the earliest archived Wayback snapshot
    if the live fetch fails, since a page that's since been taken down is exactly the kind of thing this
    tool exists to investigate — a 404 on the live site must not block it. 502 only if neither source
    yields any content at all.
  - Rejects with 422 + a Hebrew `reason` when the content has no plausible connection to the
    investigation (unrelated commercial/entertainment/spam sites). Defaults to *approve* when uncertain
    — a wrongly-blocked legitimate scan is worse than one wasted (cheap) scan a reviewer will notice.
  - Runs once per URL only — skipped on resume/re-scan of an already-tracked URL, so it doesn't add
    repeat cost to legitimate ongoing investigations.
  - Tests: `test/forensicsScanRelevance.test.ts` (5 cases — resume skips the check, approve, reject,
    archive fallback, both-sources-unavailable).
- **Confirmed, not changed:** `WaybackScraper.getSnapshotsList()` already walks CDX history earliest-
  first (`&from=` with ascending sort, `computeNextFromDate` advances forward in time) and the Phase 1
  batch cap already pauses/resumes rather than losing progress — this already matched the "start from
  earliest, stop at a boundary, resume from there" behavior asked for; no code change was needed for
  that part.

## 2. Phase 2 — Close the `/evidence/confirm` wallet-drain path (highest $ severity per request)

The codebase already has the right pattern for this — the whistleblower flow (§0.1 #3) is two-phase:
preview analyzes and caches server-side with a short-lived `previewToken`, confirm re-sends ciphertext
and uses the *cached* analysis rather than trusting a client-submitted one. `/evidence/confirm` doesn't
do this — it trusts whatever `analysis` JSON the client sends, so long as it schema-validates.

- Change `/evidence/intake` to cache its `IntakeAgent` output server-side keyed by a returned token
  (same TTL-map shape as `previewCache` in `thesisRoutes.ts`), and change `/evidence/confirm` to require
  that token and use the cached analysis — never trust a client-submitted `analysis` body again.
- This alone removes the ability to force on-chain registrations without a real, server-run LLM
  analysis in between — which Phase 1's strict rate limit then bounds.

## 3. Phase 3 — Cap the forensics/scan unbounded loop

- Add a hard max (batches or total snapshots) per `/api/forensics/scan` request to
  `WaybackScraper.runFullScan()`, independent of Phase 1's rate limit — a single request already costs
  hundreds of LLM calls before any rate limit on *request count* would even engage.
- Consider requiring admin/researcher auth for scanning an arbitrary URL, vs. the already-curated
  tracked-URL list (`GET /tracked`) which presumably doesn't need this restricted.

## 4. Phase 4 — Input size caps before LLM calls

- Cap scraped URL text length (both `/evidence/intake`'s `scrapeUrl` path and anywhere else raw scraped
  text reaches an LLM) before it's handed to Claude — token cost scales with input size and this is
  currently uncapped.
- Cap `arguments/generate`'s input the same way `chat` already caps its 2000-char message.

## 5. Phase 5 — Close the REST auth-bypass on thesis suggest/draft

- Apply the same researcher-bearer-token requirement to `POST /api/thesis/suggest` and
  `POST /api/thesis/draft` that MCP's `create_thesis_draft` already enforces (`resolveResearcher` or
  equivalent) — currently the REST routes silently skip it for an identical LLM-triggering write.

---

## 6. Open questions before implementation

- **Phase 2 scope call:** the clean fix threads a provenance token through intake→confirm, which
  changes the frontend's request shape too (needs to hold and resend the token). Confirm before
  starting whether frontend changes are in scope for this same PR or should be a follow-up — the
  backend fix alone still closes the abuse path even if the frontend isn't updated immediately, since
  `/confirm` would just start rejecting un-tokened requests (breaking the current frontend flow until
  it's updated). **This needs to land as one coordinated change, not two**, or the whistleblower/evidence
  submission UI breaks in production between them.
- **Global circuit breaker (Phase 1):** worth building now or deferred as a second pass after IP-based
  limiting ships and we see real traffic patterns? Leaning toward shipping IP-based limiting first
  (fast, standard) and treating the circuit breaker as a fast-follow if spend still looks risky.
- **Rate limit numbers:** need actual thresholds (requests/min per IP for strict vs. default tiers) —
  proposing to start conservative and loosen based on real usage rather than guessing generous limits
  upfront, but this is a product call as much as a security one.

## 7. Not in scope here

- Bronze Fortress — already gated (§0, out of scope).
- The publicly-shared `/call/[thesisId]` thesis view page — ruled out as a cost vector (§0.2), no
  changes needed there.
