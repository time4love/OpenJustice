# GF MCP OAuth 2.1 Upgrade — Dev Plan

> **Written before the target designs of 2026-09-02–04.** Its open items are triaged in
> `docs/gf-pre-design-plans-triage-2026-09-04.md` §4, and §1 records the bootstrap ruling this plan now carries; nothing here is a required task by virtue of being listed.

**Status:** Phase 0 ✅ LOCKED. Phase 1 ✅ DONE, merged
([PR #55](https://github.com/time4love/OpenJustice/pull/55)). Phase 2 ✅ DONE, merged
([PR #56](https://github.com/time4love/OpenJustice/pull/56)) — a live-staging proxy-scheme bug found
right after merging is fixed in the same branch as Phase 3, see §4.6. Phase 3 ✅ DONE, merged
([PR #57](https://github.com/time4love/OpenJustice/pull/57)) — JWKS/cookie keys still ephemeral, risk
explicitly accepted by the user (§4.5/§5.5). Phase 4 ✅ DONE 2026-08-19 (this session, not yet PR'd — see
§6). Phase 5 (real-client verification) is next. Created 2026-08-19, following the ChatGPT MCP
compatibility check (`docs/gf-chatgpt-mcp-connector-guide.md`) and a user question about whether the
current Claude MCP auth model is good enough on its own merits.
**Scope:** Glass Fortress backend + frontend (`apps/glass-fortress/{backend,frontend}`). Bronze Fortress
has a structurally different write-auth model (single shared `MCP_WRITE_TOKEN`, no per-researcher
identity in its MCP layer) and is explicitly out of scope — see §9.

---

## 0. Why this exists

Investigating ChatGPT MCP compatibility surfaced that ChatGPT's custom connectors only accept two auth
modes: none, or full `OAuth 2.1` with Dynamic Client Registration (DCR) — never a static bearer token.
GF's write tools (`create_evidence_from_url`, `start_forensic_scan`, `run_ai_analysis`, etc., gated in
`apps/glass-fortress/backend/src/mcp/mcpRoutes.ts:41-79`) currently require exactly that: a permanent,
non-expiring bearer token, generated once via `POST /api/auth/mcp-token`
(`authRoutes.ts:99`) and pasted into a client config file.

The user's follow-up question reframed this as more than a ChatGPT compatibility gap: **is that static
token good enough for Claude either?** A factual survey of the existing auth code
(`apps/glass-fortress/backend/src/routes/authRoutes.ts`,
`apps/glass-fortress/frontend/src/lib/supabase.ts`,
`apps/glass-fortress/frontend/src/app/[locale]/login/page.tsx`) found the answer is more promising than
it looked: **Google OAuth login already exists**, via Supabase Auth (`getGoogleOAuthUrl`,
`login/page.tsx:109-111`), and every `Researcher` row is already tied to a real `supabaseUserId` with an
admin-gated `approved` flag (`authRoutes.ts:137-183`, `admin/page.tsx:62`). The MCP bearer token is not
a *replacement* identity system — it's a disconnected, weaker credential minted once from that identity
and then left to run forever, with:
- no expiry,
- no scope (one token unlocks every write tool),
- no visibility into which tokens exist or where they're used,
- no way to revoke a single client without rotating (and breaking) every other client's token.

This plan proposes an OAuth 2.1 authorization server that **wraps the existing Google/Supabase login**
rather than replacing it, so MCP clients (Claude Desktop, Claude Code, ChatGPT, anything else) go through
the same approved-researcher gate the website already enforces, and receive short-lived, scoped,
revocable tokens instead of a permanent one. This closes both problems — ChatGPT compatibility and the
static-token weakness — with one piece of work, because they are the same underlying gap.

---

## 1. How to work this plan

- Standard branch protocol applies: feature branch → PR → `staging` → explicit approval → `master`.
  Given the size, **each numbered phase below should be its own PR** — this is a security-sensitive
  subsystem and small reviewable diffs matter more here than usual.
- **Phase 0 (decisions) must be explicitly confirmed by the user before any code is written** — this
  plan deliberately stops short of picking the OAuth library and legacy-token fate; those are
  trade-off calls, not implementation details (per the "clean solution over easy one" rule — flag
  the trade-off, don't decide alone).
- Read tools are **completely unaffected** by this entire plan — they're unauthenticated today and stay
  that way. Nothing here changes `search_evidence`, `get_forensic_timeline`, etc.
- This is new attack surface (a public OAuth authorization server). Do not skip §6 (security checklist)
  under time pressure, and do not merge Phase 2/3 without it having been read against the actual diff.
- Test against all three real MCP clients (Claude Desktop, Claude Code, ChatGPT Developer Mode) on
  **staging** before touching production — see §5. Their redirect_uri/PKCE handling differs slightly and
  none of this is meaningfully testable by reasoning about the spec alone.

---

## 2. Phase 0 — Decisions ✅ LOCKED 2026-08-19

All four picked the plan's recommended option, confirmed explicitly by the user via structured
question, not assumed:

### 2.1 Authorization-server implementation — **`node-oidc-provider`** ✅
Hand-rolling `/authorize` + `/token` + `/register` + PKCE validation + redirect_uri allow-listing in
Express is realistic to get subtly wrong (open redirect, PKCE downgrade, code replay) in ways that don't
show up in normal testing. Mounted under `/oauth/*` in the existing Express app, with a small custom
storage adapter (§2.2) — not a hand-rolled AS.

### 2.2 Storage adapter — **Prisma / existing Postgres** ✅
New Prisma models, persisted in the existing Supabase Postgres DB. No new infrastructure (Redis was the
alternative, rejected — nothing in the current stack uses it).

### 2.3 Legacy static bearer token — **keep as a separate "service token"** ✅
`POST /api/auth/mcp-token` is reframed for non-interactive/CI use only. Personal clients (a human
connecting Claude Desktop, ChatGPT, etc.) move to OAuth exclusively — see §8 for the copy/docs update
this implies once Phase 4 ships.

### 2.4 Token lifetimes and scopes — **proposed defaults** ✅
Access tokens 1 hour, refresh tokens 30 days (rotating on use), two scopes — `mcp:read` (no-op today,
read tools already need no auth, but reserved so a future "require login even for reads" policy has
somewhere to hang) and `mcp:write` (gates the existing `WRITE_TOOLS` set in `mcpRoutes.ts`).

### 2.5 Bootstrapping the first researcher of an empty environment — **the in-container run** ✅
Ruled 2026-09-04 (pre-design triage, `docs/gf-pre-design-plans-triage-2026-09-04.md` §1): `researcher:bootstrap` runs over `railway ssh`, environment stated twice — the runner every operational script uses. No email allowlist: a second auth branch for a one-time act. Closes `docs/gf-production-readiness-prerequisites.md` item 2.

---

## 3. Phase 1 — Data model — ✅ DONE 2026-08-19

**Correction from the original sketch below:** the npm package is `oidc-provider` (by panva), not
`node-oidc-provider` — that name was a misnomer carried over from casual references while planning.
Same library, correct name from here on.

Implemented as a single generic table rather than one-model-per-kind, per the adapter interface's own
shape (confirmed against the library's actual `Adapter` contract before writing this — `upsert`/`find`/
`findByUserCode`/`findByUid`/`consume`/`destroy`/`revokeByGrantId`, uniform across every model kind:
Client, Grant, AuthorizationCode, AccessToken, RefreshToken, Session, Interaction, etc.):

```prisma
model OidcModel {
  modelName  String // oidc-provider's model kind, e.g. "Client", "Grant", "AccessToken"
  id         String // oidc-provider-generated id, unique only within its modelName
  payload    Json
  grantId    String?
  userCode   String?
  uid        String?
  accountId  String?   // Researcher.id — set for Grant/AccessToken/RefreshToken/Session rows
  expiresAt  DateTime?
  consumedAt DateTime?

  @@id([modelName, id])
  @@unique([modelName, userCode])
  @@unique([modelName, uid])
  @@index([modelName, grantId])
  @@index([modelName, accountId])
}
```

`accountId` (added beyond the original sketch) carries `Researcher.id` for every model kind that
represents a grant of access, indexed — this is what lets Phase 3's "connected apps" revoke UI list a
researcher's active grants without querying into the opaque `payload` JSON.

- Migration `20260819000000_mcp_oauth_storage` hand-written (not `prisma migrate dev --create-only`) —
  same reason as `20260818000000_evidence_onchain_integrity`: the auto-diff proposes dropping
  `evidence_embeddings` (the pgvector table, not modeled in `schema.prisma`). Applied directly to the
  **staging** Supabase DB via `prisma migrate deploy` (pure `CREATE TABLE`/`CREATE INDEX`, no existing
  data touched, no pre-migration check needed).
- Verified: `prisma migrate status` → up to date, `tsc --noEmit` clean, full Jest suite 568/568 passing
  (was 517 at last count in the evidence-integrity plan — includes tests added since).
- Not yet committed to git (branch `feature/gf-mcp-oauth-phase1-schema`) — schema, migration, and this
  doc update are uncommitted working-tree changes, consistent with "don't commit without being asked."
- `oidc-provider` is **not yet added as a dependency** — deliberately deferred to Phase 2, where it's
  actually imported and exercised; adding it now with nothing consuming it would be premature.

---

## 4. Phase 2 — Authorization server — ✅ DONE 2026-08-19

**Package name correction:** the actual npm package is `oidc-provider` (by panva), confirmed installed
at `^9.11.2`, with `@types/oidc-provider@^9.11.0` as a devDependency (the package ships no types of its
own). Implementation grounded directly in the installed package's real `Adapter`/`Configuration` types
and, for the trickier parts, its actual source (`node_modules/oidc-provider/lib/**`) — not assumed from
memory, since getting an OAuth AS subtly wrong is exactly the risk this plan exists to avoid.

### 4.1 Files
- `src/oauth/prismaOidcAdapter.ts` — `PrismaOidcAdapter implements Adapter`, backing every oidc-provider
  model kind through the Phase 1 `OidcModel` table. `find`/`findByUserCode`/`findByUid` filter out
  expired rows and surface a prior `consume()` as a `consumed` unix-seconds field, matching what
  oidc-provider expects back. `destroy` uses `deleteMany` (not `delete`) so destroying an already-gone
  row is a no-op, not a throw. `revokeByGrantId` deliberately does **not** scope by `modelName` — a
  grant's tokens/codes span multiple model kinds and must all die together.
- `src/oauth/oidcProvider.ts` — configuration + the `Provider` instance. `resolveIssuer()` and
  `findAccount()` are exported standalone (not inlined into the config object) specifically so they're
  unit-testable without constructing a real `Provider`.
- `test/prismaOidcAdapter.test.ts` (12 tests), `test/oidcProvider.test.ts` (6 tests) — mocked Prisma,
  matching the codebase's existing convention (`test/mcpRoutes.test.ts`).
- `server.ts`: `app.use('/oauth', oidcProvider.callback())`, mounted **before** `requireStagingAccess`
  — see §4.4.

### 4.2 Configuration decisions
- `clients: []` — no static clients, every client arrives via DCR.
- `clientAuthMethods: ['none']` + `pkce.required: () => true` — every client is public (no secret),
  PKCE is the entire security model, matching §2.1's decision.
- `features.registration = { enabled: true, initialAccessToken: false }` — open DCR.
- `features.devInteractions = { enabled: false }` — never the library's own debug login screen.
- `ttl.AccessToken = 3600`, `ttl.RefreshToken = 30 days`, `rotateRefreshToken: true` — per §2.4.
- `scopes: ['mcp:read', 'mcp:write', 'offline_access']` — **`offline_access` was not in the original
  Phase 0 sketch and its absence was a real bug**, not a hypothetical: oidc-provider only ever adds
  `refresh_token` to a deployment's globally-allowed grant types when the `offline_access` scope exists
  (`collectGrantTypes()` in the library's own `configuration.js`). Without it, the 30-day rotating
  refresh token from §2.4 would have been silently unreachable — every client's `grant_types` request
  including `refresh_token` would 400. Found by actually registering a test client against a running
  server and reading the rejection (§4.3), not by re-reading the docs.
- `findAccount` re-verifies `Researcher.approved` on every call, not just at grant-creation time — a
  revoked researcher's existing tokens stop resolving to an account on their very next use.
- `interactions.url` points at `${FRONTEND_URL}/oauth/interaction/:uid` — the Phase 3 frontend route.
  Confirmed via a live `/oauth/auth` request that the redirect actually uses this (not some oidc-provider
  default), landing on `${FRONTEND_URL}/oauth/interaction/<uid>` exactly as configured.

### 4.3 Verified for real, not just typechecked
Every claim below was checked against a running local server (`ts-node-dev`, real `.env` → staging
Postgres) — not just `tsc`/unit tests, given how easy it is for OAuth configuration to be "correct on
paper, broken in practice":
- Server boots clean (only the two expected warnings, see §4.5).
- `GET /oauth/.well-known/openid-configuration` returns a real, correct discovery document —
  `registration_endpoint`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported`
  including `mcp:read`/`mcp:write`/`offline_access`/`openid`.
- `POST /oauth/reg` (DCR) — full round trip: registered a real client, got back a `client_id` and
  `registration_access_token`, no `client_secret`; `GET /oauth/reg/:id` with the registration access
  token retrieved it back correctly. This exercised `PrismaOidcAdapter.upsert`/`find` against real
  staging Postgres, for two different model kinds (`Client`, `RegistrationAccessToken`) in one round trip.
- `GET /oauth/auth?...&code_challenge=...&code_challenge_method=S256` — 303 redirect to the configured
  interaction URL, `Interaction` row persisted (third model kind exercised for real).
- `GET /api/mcp` still returns the staging-gate 401 exactly as before — confirms the new `/oauth` mount
  didn't disturb the existing route/middleware ordering.
- All test artifacts created during this manual verification (the `Client`, `RegistrationAccessToken`,
  and `Interaction` rows) were deleted from the staging `OidcModel` table afterward.
- Full backend suite: 586/586 passing (568 + 18 new), `tsc --noEmit` clean.

### 4.4 `/oauth/*` mounted ahead of the staging access gate — deliberate, not an oversight
`requireStagingAccess` (`server.ts`) requires an `X-Staging-Token` header on staging for everything
mounted after it — `/health` is the one existing exception, for Railway's own healthcheck. `/oauth` is
now a second exception, mounted before that middleware, for a different but equally load-bearing reason:
DCR and OAuth discovery must be reachable by an arbitrary external client (ChatGPT, Claude) carrying no
pre-shared secret at all — that's the entire point of DCR. Gating it behind the staging token would make
this whole subsystem untestable by any real MCP client on staging, permanently (ChatGPT in particular has
no mechanism to send a custom header at all, which is the original problem this whole plan exists to
fix). This does not weaken real security: registering a client or starting `/oauth/auth` grants nothing
by itself — every subsequent step still requires an approved `Researcher` to complete the (Phase 3,
not yet built) login/consent step, exactly as before.

### 4.5 Known Phase 2 limitations — tracked, not yet closed
- ~~**`jwks` and `cookies.keys` are still unset.**~~ — **✅ FIXED 2026-08-20, see §10.** Worth noting
  what this actually was once inspected: not "ephemeral, regenerated on restart" as originally assumed
  here, but oidc-provider's own hardcoded `DEV_KEYSTORE` (`lib/consts/dev_keystore.js`, kid
  `keystore-CHANGE-ME`) — the *same* static RSA private key shipped inside every install of the library,
  publicly readable on npm, not app-specific and not regenerated at all. Worse than the risk this section
  originally described.
- **No resource-indicator (RFC 8707) audience restriction configured.** Deferred to Phase 5 alongside
  real-client verification, once it's known what Claude/ChatGPT actually send — adding it speculatively
  now risks configuring it for a shape no real client uses.
- ~~`GET /oauth/auth` redirects to a Phase-3 frontend route that doesn't exist yet~~ — **built in Phase 3
  (§5).**
- **Node runtime:** `oidc-provider@9.11.2` requires Node `^22 || ^24 || >=26` and prints a startup
  warning on anything older (confirmed harmless in practice on local Node 20.19.5 — loads and runs, just
  warns). **Not a production risk** — Railway already deploys this service on Node 24 (`railpack default
  lts`, confirmed via `railway logs --build`), well above the floor. Documented via
  `"engines": {"node": ">=22"}` added to `apps/glass-fortress/backend/package.json` so this doesn't
  silently bit-rot for a future contributor on an older local Node.
- **Pre-existing repo-wide lint drift, not introduced here:** `npm run lint` already fails with 267
  errors on `staging` before this branch (confirmed by running it against unmodified `server.ts`). The
  new `src/oauth/` files add 3 instances of the same already-broken `@typescript-eslint/dot-notation`
  rule (flagging `process.env['X']` bracket access, which is the codebase's own established convention
  elsewhere — e.g. `tokenHash.ts`, `stagingAccess.ts` — and conflicts with this rule too). Left as
  bracket notation to match the deliberate existing convention rather than being the one file that
  deviates from it; not a regression, since the rule was already broken project-wide.

### 4.6 Post-merge bug found on live staging — ✅ FIXED 2026-08-19

Immediately after PR #56 merged and staging redeployed, `GET /oauth/.well-known/openid-configuration`
was checked live (not just locally) — `issuer` correctly read `https://…`, but `authorization_endpoint`
and `jwks_uri` resolved to `http://…`. Root cause: Railway terminates TLS at its edge and forwards plain
HTTP to the container; oidc-provider (a Koa app under the hood) builds those per-request URLs from the
actual incoming request's scheme, not from the static `issuer` string, and without explicit proxy trust
it believes every request arrived over plain HTTP. Fixed with one line,
`oidcProvider.proxy = true` (standard Koa `app.proxy`, makes it trust `X-Forwarded-*`), in
`src/oauth/oidcProvider.ts`. Verified locally both ways — without a spoofed `X-Forwarded-Proto` header
the local discovery doc correctly stays `http://localhost:...`; with `X-Forwarded-Proto: https` it
correctly flips every endpoint URL to `https://`, matching Railway's real behavior. Left uncommitted
under this same branch/PR rather than shipped standalone — see §5 for why.

---

## 5. Phase 3 — Login/consent bridge — ✅ DONE 2026-08-19

Built on `fix/gf-mcp-oauth-proxy-trust` (originally cut just for §4.6's fix; kept working on it rather
than branching again, since Phase 3 depends on that fix being correct) — **not yet PR'd**, see the
open questions at the end of this section before merging.

### 5.1 Backend: `src/routes/oauthInteractionRoutes.ts`, mounted at `/oauth/interaction`

Ground-truthed against oidc-provider's own canonical reference implementation
(`example/routes/express.js` from the library's GitHub repo — fetched and read directly rather than
recalled, since getting `interactionFinished`'s result shapes or the `Grant` construction/`mergeWith-
LastSubmission` flags wrong would be a silent, hard-to-notice correctness bug in exactly the kind of
code this whole plan exists to get right).

- **`GET /:uid`** — read-only, unauthenticated (nothing sensitive: which client, which scopes, which
  prompt). Fetched normally via `fetch()`.
- **`POST /:uid/login`** — resolves the `login` prompt. No password step — identity comes entirely from
  the caller's existing GF session. **Must be a real `<form method="POST">` submit, never `fetch()`**:
  `interactionFinished` responds with a redirect that resumes the OAuth dance and can end at the
  *external* MCP client's own `redirect_uri` (e.g. Claude Desktop's loopback listener) — a `fetch()`
  would just follow that redirect internally and swallow it instead of the browser actually navigating
  there. Because it's a real form submit, no `Authorization` header is possible, so the Supabase access
  token travels as a hidden form field instead — verified via a new exported `verifySupabaseUserId()`
  (extracted from `requireSupabaseAuth`, `middleware/supabaseAuth.ts`, so both share one code path).
  If the researcher isn't approved, this deliberately does **not** call `interactionFinished` with an
  error (that would abort the whole grant and force the external client to restart from scratch) — it
  just redirects back to our own frontend with a flag; the interaction sits until its own TTL expires or
  the researcher retries once approved.
- **`POST /:uid/confirm`** — resolves the `consent` prompt. **Re-verifies the researcher from scratch**
  (never trusts that `/login` already checked it — approval can be revoked in between, and this step is
  the one that actually grants access). `decision=deny` properly aborts via `interactionFinished`'s
  `access_denied` error result, matching what a real client expects, rather than leaving it hanging.
  `decision=allow` builds or reuses a `Grant`, adds `details.missingOIDCScope`/`missingResourceScopes`,
  saves it, and finishes with `{ consent: { grantId } }` — only passing `grantId` when it's a **new**
  grant, matching the canonical example exactly (an existing grant is looked up by its id, not re-passed).
- Mounted **before** `oidcProvider.callback()`'s catch-all so Express matches these specific paths first,
  and — like `/oauth` itself — **before** `requireStagingAccess`, for the identical reason: these are
  real browser navigations from an already-in-progress OAuth flow, not something that can carry a custom
  staging header. This does not weaken security: the actual identity/approval check happens inside these
  routes regardless of the staging gate.
- Needs its own `express.urlencoded()` parser — `server.ts` only registers `express.json()` globally, and
  real form submits send `application/x-www-form-urlencoded`.

**Two bugs found live-testing against a real running server + real staging Postgres, not caught by
`tsc`/unit tests:**
1. An unexpected `verifySupabaseUserId` failure (reproduced concretely: `@supabase/supabase-js`'s
   Realtime client throws on Node < 22 without a `ws` polyfill — harmless on Railway's Node 24, but a
   real gap in *this* code's own error handling) propagated to Express's generic handler as a raw 500
   with an internal error message leaked into the response. Fixed: `findApprovedResearcher()` now
   catches any verification failure and treats it identically to an invalid token.
2. A POST with no body/no `Content-Type` leaves `req.body` as `undefined` (not `{}}`) — destructuring
   without a fallback threw a `TypeError`, another raw 500. Fixed: `(req.body ?? {})`.

Both are covered by new tests (13 total in `test/oauthInteractionRoutes.test.ts`, Prisma/oidc-provider
mocked matching `mcpRoutes.test.ts`'s existing pattern) and re-verified live afterward.

### 5.2 Frontend: `returnTo` threading through the existing login flow

The interaction page needs to send an unauthenticated visitor through GF's *existing* login UI and land
them back on the interaction — no second login form. This required a small, backward-compatible
extension to code that already shipped:

- `getGoogleOAuthUrl(redirectTo)` already took a `redirectTo` — just needed a smarter caller.
- `sendMagicLink(email, redirectTo?)` gained an optional second param. **Ground-truthed against
  GoTrue's actual Go source** (`internal/api/magic_link.go`, `internal/utilities/request.go`'s
  `getRedirectTo()`) rather than assumed: `redirect_to` must be a **query parameter on the request URL**
  (or an HTTP header) — never a JSON body field, because Go's `ParseForm()` never parses a JSON body,
  only the URL's query string. An initial attempt that nested it under a JSON `options.email_redirect_to`
  field (copying the *JS SDK's* camelCase shape, which is not what hits the wire) would have silently
  done nothing.
- `login/page.tsx`: `LoginStep`/`HandleSetupStep` take a `returnTo` prop (read from the URL by
  `LoginPageContent`), threaded into both the Google and magic-link paths and into where
  `HandleSetupStep` navigates after first-time registration.
- `auth/callback/page.tsx`: reads `returnTo` from `window.location.search` (deliberately not
  `useSearchParams()`, to avoid needing a new Suspense boundary — matches how the file already parses
  the access token from the hash manually) and carries it through both the "needs handle setup" and
  "already registered" branches.

### 5.3 Frontend: `oauth/interaction/[uid]` page

`frontend/src/app/[locale]/oauth/interaction/[uid]/page.tsx` (server shell, Suspense-wrapped for
`OAuthInteractionClient`'s `useSearchParams()`) + `OAuthInteractionClient.tsx`:

- No session → redirects to `/login?returnTo=<this page>`.
- Session but not approved → reuses the existing `auth.pendingApproval`/`pendingApprovalHint` copy
  rather than inventing new strings for the same state.
- Approved → fetches interaction details; `login` prompt auto-submits the hidden login form (no user
  action needed, matching §5.1); `consent` prompt renders client name + human-readable scope labels
  (`mcp:read`/`mcp:write` only — `offline_access`/`openid` are protocol plumbing, not shown) with
  Approve/Deny buttons, each a real form submit for the same reason as §5.1.
- New `oauthInteraction` message namespace added to both `messages/he.json` and `messages/en.json`.

**A real bug found only by trying to load the page in an actual browser**, not by `tsc`/build alone:
`apiUrl()` returns a bare relative path when `NEXT_PUBLIC_API_URL` is unset (true for local dev and
possibly previews) — the existing `next.config.ts` only rewrites `/api/:path*` to the backend, not
`/oauth/:path*`, so every fetch/form action in this page would have silently hit the *frontend's own*
server (404/wrong app) instead of the backend. Fixed by adding a matching `/oauth/:path*` rewrite. No
collision with this page's own route: next-intl's default `localePrefix` is `'always'`, so the page only
ever lives under `/he/oauth/...` or `/en/oauth/...`, never bare `/oauth/...` — which is exactly the
unprefixed path the rewrite (and this page's own fetch/form calls) target.

### 5.4 Verified

- Backend: `tsc --noEmit` clean, full suite 599/599 (586 + 13 new).
- Frontend: `tsc --noEmit` clean, `npx eslint` clean on every touched file (pre-existing repo lint drift
  aside, see §4.5's last bullet — same situation, not worsened here), **real `next build` succeeded**
  (catches Suspense-boundary and other build-time issues `tsc` alone doesn't).
- Live in an actual browser (production build, `next start`, real staging Postgres + a real DCR'd test
  client): an unauthenticated visit to the interaction page correctly redirects to `/login` with the
  right `returnTo`, and the Google/magic-link paths correctly carry it through — screenshot-verified.
  **Not verified visually**: the approved-researcher consent screen itself, and the not-approved state —
  both require a real Google/Supabase-authenticated session, which this environment has no credentials
  for. Covered instead by the unit tests, full typecheck, and successful production build; flagging this
  gap explicitly rather than claiming full visual coverage.
- Test client + `OidcModel` rows created during manual verification were deleted from staging afterward
  each time.

### 5.5 Open questions before merging (not decided unilaterally)

- **JWKS/cookie keys are still ephemeral** (§4.5) — merging Phase 3 makes this a live operational risk
  (a deploy mid-login-flow) for the first time, not just a forward-looking note. Worth a decision before
  merge: accept the (low, staging-only) risk now, or generate and set real keys first.
- **This PR bundles §4.6's fix with all of Phase 3** rather than shipping the fix standalone first —
  a judgment call (they're both "making the already-merged AS actually correct," and splitting now would
  mean re-basing) rather than something decided without flagging it.

---

## 6. Phase 4 — Resource-server integration — ✅ DONE 2026-08-19

Built on `feature/gf-mcp-oauth-phase4-resource-server`, not yet PR'd.

### 6.1 `resolveResearcher()` gains an OAuth path

`mcpRoutes.ts` tries the presented bearer token as an OAuth access token first, via
`oidcProvider.AccessToken.find(token)` — the exact same in-process lookup oidc-provider's own
`userinfo`/`introspection` actions use internally (`lib/shared/access_token.js`, read directly rather
than assumed, same rigor as Phase 3). No network round trip: resource server and authorization server
are the same process, sharing the same Prisma-backed adapter.

Three outcomes, modeled as a small discriminated union (`OAuthResolution`) rather than a chain of
booleans, specifically so "not an OAuth token, try legacy" can't be confused with "was an OAuth token,
but rejected":
- **Not found** → falls through to the existing `mcpTokenHash` legacy lookup, unchanged (§2.3).
- **Found, missing `mcp:write` scope** → `403`, does **not** fall through to legacy (a scoped-down token
  should never accidentally succeed via a different path).
- **Found, correct scope, but the linked `Researcher` isn't approved** (or no longer exists) → `403`.
  Re-checked here independently of `findAccount`'s own re-check in `oidcProvider.ts` — approval can be
  revoked between when a grant was issued and any individual tool call, and every call must reflect that,
  not just login.
- **Found, correct scope, approved** → `{ researcherId }`, flowing into the same
  `researcherContext.run(...)` call every other path already used — no tool handler changed.

`GET /api/mcp`'s discovery response gained an `oauth: { authorizationServer, scopes }` field (using
`oidcProvider.issuer` directly) and an updated `auth` string describing both accepted credential shapes —
this is what `docs/gf-mcp-oauth-dev-plan.md`'s own `gf-chatgpt-mcp-connector-guide.md` and any client
inspecting the endpoint will see once Phase 5 revisits that guide.

### 6.2 Verified for real, not just typechecked or mocked

Unit tests (5 new in `mcpRoutes.test.ts`, mocking `oidcProvider.AccessToken.find`) cover all four
outcomes above, including that a wrong-scope or not-approved token never falls through to the legacy
`researcher.findFirst` lookup. Existing `test/mcpIntegration.test.ts` needed the same `oidc-provider`
ESM-under-Jest mock every other test file touching `mcpRoutes.ts` already needs (see Phase 3's
`oauthInteractionRoutes.test.ts`) — not a Phase 4 bug, just a new file that now transitively imports it.

Then verified against a **second, independent process** — not just the same running server that issued
the token, since that would only prove self-consistency, not that the storage/lookup is genuinely
process-independent (i.e., actually durable in Postgres, not an in-memory cache accident): a throwaway
script minted real `Grant`/`AccessToken` records through oidc-provider's own class API (`new
oidcProvider.Grant(...)`, `.addOIDCScope('mcp:write')`, `new oidcProvider.AccessToken(...)`, `.save()`)
against staging Postgres, and the raw token was used against the **separately running** dev server:
- Valid `mcp:write` token → request reached the real tool handler (`close_research_session`), which
  returned its own business-logic error ("No active session for thesis...") — proof the auth layer
  accepted it and handed off correctly, not a mocked stand-in.
- `mcp:read`-only token → `403`, correct message, confirmed it never touched the legacy Researcher lookup.
- Garbage token → correctly fell through to the legacy path and was rejected there (`401`), with the
  updated message mentioning both credential shapes.
- Unauthenticated read tool call (`search_evidence`) → unaffected, `200`, same as before this phase.
- `GET /api/mcp` → `oauth.authorizationServer` correctly reflects the real `https://…/oauth` issuer.
- All test `Researcher`/`OidcModel` rows deleted from staging afterward.

Full suite: 604/604 passing (599 + 5 new), `tsc --noEmit` clean both before and after.

---

## 7. Phase 5 — Client compatibility verification (staging, before production)

### 7.0 Prep — ✅ DONE 2026-08-19: `/api/mcp` exempted from the staging access gate

Found while updating `docs/gf-chatgpt-mcp-connector-guide.md` for Phase 5, before any real client
testing started: `/api/mcp` was still mounted **after** `requireStagingAccess`, unlike `/oauth/*`. A
client could complete the entire OAuth dance successfully and still get `401 "Staging requires
x-staging-token"` on the actual tool call — ChatGPT in particular has no way to attach that header.
Same reasoning as §4.4's original `/oauth/*` exemption applies identically here (a coarse pre-shared
secret doesn't compose with a route designed for arbitrary self-service external clients; real security
is `resolveResearcher()`'s own OAuth/legacy-token + approved-researcher check, unaffected by this).
Fixed by moving the `app.use('/api/mcp', mcpRouter)` mount above `requireStagingAccess` in `server.ts`
(removing the old, now-duplicate, mount further down) — read tools are already unauthenticated on
production today, so this changes nothing about their exposure *class*, only which environment enforces
the pre-shared secret around them.

Verified locally before Phase 5 testing began, not just typechecked: `GET`/`POST /api/mcp` reachable
with zero staging header (both read and write paths); a write tool call with **no credential at all**
still correctly 401s with the MCP-level message (proving the staging gate, not `resolveResearcher()`,
was removed); a full OAuth-authenticated write call (same mint-a-real-token-via-a-separate-script
method as Phase 4's own verification) succeeded end-to-end with zero staging header; every *other*
`/api/*` route (spot-checked `/api/evidence`) is still correctly gated, confirming the exemption is
scoped to exactly this one route.

### 7.0b Prep — ✅ DONE 2026-08-19: frontend staging password gate also blocked the whole login chain

Found live, mid-Phase-5, the first time a real external browser (via a claude.ai custom connector)
actually walked the flow: the *frontend's* own staging password wall (`proxy.ts` — Next.js 16 renamed
`middleware.ts` to this) gates every page except `/unlock` itself. It had no exemption for
`/oauth/interaction/[uid]`, and that page's own "not logged in" redirect goes to `/login`, which was
*also* gated, which after Google login lands on `/auth/callback`, *also* gated. A cold external
visitor — exactly what every real MCP client's OAuth browser tab is — hit the staging password screen
before ever reaching the actual Google login, at every single hop in the chain. This is the frontend
half of the same class of bug §7.0 fixed on the backend; missed originally because all of §5's Phase 3
verification happened via an already-unlocked browser session (mine), which never exercises this gate.

Fixed: `proxy.ts` gained `isPublicOnStaging()`, exempting `/unlock`, `/login`, `/auth/callback`, and
any `/oauth/interaction/*` path (locale-prefixed or not — next-intl's `localePrefix: 'always'` means
these appear both as bare paths, from our own `window.location.href` redirects, and locale-prefixed,
on a hard reload) from the staging password gate. Same reasoning as §7.0 and §4.4: the pre-shared
staging secret was never the real gate for this flow; `Researcher.approved` is, and it's unaffected.

Verified locally with a real running production build (`next build` + `next start`), not just
typechecked: `/oauth/interaction/:uid`, `/login`, and `/auth/callback` all reachable end-to-end (through
their locale-redirect hop) with zero staging cookie; an unrelated page (`/profile`) still correctly
redirects to `/unlock`, confirming the exemption is scoped to exactly these paths.

**Separately discovered, not a code bug — and corrected after an initial wrong assumption**: staging's
Supabase project returns `"Unsupported provider: provider is not enabled"` from `/auth/v1/authorize?
provider=google`. Assumed at first that production's Supabase project had Google configured and only
staging didn't (an inference from the code existing, never actually checked) — **wrong**, caught by the
user pushing back. Verified directly (browser-clicked "Continue with Google" on the real production
site): **production returns the identical error.** Google Sign-In has never been configured on either
GF Supabase project (confirmed distinct projects — `fqmczumacfbunffgodlo` = production,
`elwsznbcfmbmkldpntae` = staging, verified from Railway env vars directly, not assumed). There is no
existing OAuth Client ID/Secret to reuse. Setting this up for real means a Google Cloud OAuth consent
screen + domain verification for `tederyesharel.co.il` — separate, non-blocking work.

**Unblocks Phase 5 testing without waiting on that**: the MCP OAuth flow doesn't care which login
method backs the researcher's session — magic-link email login already works and needs no Google Cloud
setup at all. Use that instead for connector testing until/unless real Google Sign-In work happens.
(In practice the user set up real Google Sign-In anyway, same session — see git history; not detailed
further here since it's an external Google Cloud / Supabase Dashboard process, not code.)

### 7.0c Prep — ✅ DONE 2026-08-19: RFC 9728 Protected Resource Metadata was missing entirely

Found live, mid-Phase-5, the first time a real claude.ai custom connector actually attempted the full
flow (Google login working, researcher approved, consent screen reachable — and it still failed with
"Authentication failed"). Root cause pinned down from raw HTTP logs (`railway logs --http`), not
guessed: claude.ai requested `/.well-known/oauth-protected-resource[/api/mcp]`, `/.well-known/oauth-
authorization-server`, and `POST /register` — all at the **bare origin**, all before ever calling
`/api/mcp` itself. Fetched the actual MCP Authorization spec text to ground the fix precisely (`https://
modelcontextprotocol.io/specification/2025-06-18/basic/authorization`) rather than reason from memory:

> "MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC 9728)... MCP servers
> **MUST** use the HTTP header `WWW-Authenticate` when returning a 401 Unauthorized to indicate the
> location of the resource server metadata URL."

We had neither. Our AS is correctly nested under `/oauth/*` (`/oauth/.well-known/openid-configuration`,
`/oauth/reg`, ...) — entirely correct in isolation — but nothing told a client that layout exists, so a
spec-compliant client falls back to guessing standard bare-root paths, which don't exist here and (before
§7.0/§7.0b's fixes) fell through to a misleading 401 from the staging gate instead of a plain 404.

Built:
- `src/oauth/resourceMetadata.ts` — `protectedResourceMetadata()` returns `{ resource: "<origin>/api/mcp",
  authorization_servers: ["<origin>/oauth"] }` per RFC 9728; `resourceMetadataUrl()` for the header.
- `src/routes/wellKnownRoutes.ts` — serves that document at **both** the bare path (what the spec's own
  sequence diagram shows) and the RFC 8414 §3.1 path-inserted variant (what claude.ai actually requested
  first, live) — cheap to serve both rather than bet on one client convention.
- `mcpRoutes.ts` — every 401 `resolveResearcher()` sends now carries `WWW-Authenticate: Bearer
  resource_metadata="<url>"`, via a `sendUnauthorized()` helper so it can't be forgotten at a call site.
- `server.ts` — `/.well-known` mounted ahead of `requireStagingAccess`, same exemption reasoning as
  `/oauth` and `/api/mcp`: a client that hasn't authenticated yet cannot present the staging secret to
  find out where to authenticate.
- `oidcProvider.ts` refactored: `resolveOrigin()` extracted as its own exported function (`resolveIssuer`
  now just appends `/oauth` to it) so `resourceMetadata.ts` can reuse the exact same origin-resolution
  logic rather than duplicating it.

Verified live (local server, both bare and path-inserted well-known URLs return the correct document;
an unauthenticated write-tool call carries the exact `WWW-Authenticate` header a client needs), plus new
test coverage (`test/wellKnownRoutes.test.ts`, header assertions added to `test/mcpRoutes.test.ts`,
`resolveOrigin` unit tests in `test/oidcProvider.test.ts`) — 608/608 passing, `tsc --noEmit` clean.
Shipped and confirmed live ([PR #60](https://github.com/time4love/OpenJustice/pull/60)) — a real
claude.ai connector retry got one step further (protected-resource discovery now works) but still
failed, see §7.0d.

### 7.0d Prep — ✅ DONE 2026-08-19: RFC 8414 path-insertion for AS metadata, one layer deeper

Same connector, retried immediately after §7.0c shipped — got further, still failed. Raw HTTP logs this
time showed `GET /.well-known/oauth-authorization-server/oauth` and `GET /.well-known/openid-
configuration/oauth`, both 401 (staging-gate fallthrough again, same class as before). This is RFC 8414
§3.1's *actual* path-insertion rule, more precisely than §7.0c's fix accounted for: for an issuer with a
path component (ours is `<origin>/oauth`), metadata lives at `<origin>/.well-known/<doc>/<issuer-path>`
— the well-known segment first, the issuer path appended *after*. oidc-provider instead serves its
metadata OIDC-Discovery-style, `.well-known` appended directly onto the issuer
(`/oauth/.well-known/<doc>`) — also spec-legal, just a different convention than the one this client
actually uses.

Fixed with two redirects in `wellKnownRoutes.ts` (`/.well-known/oauth-authorization-server/oauth` and
`/.well-known/openid-configuration/oauth`, both 302 to oidc-provider's real document) rather than
re-serving the content — oidc-provider's own endpoint stays the single source of truth. Verified live
(local server, redirect resolves to the identical document oidc-provider serves natively) plus 2 new
tests in `test/wellKnownRoutes.test.ts` — 610/610 passing.

**Pattern worth naming**: two real client-compatibility bugs in a row were each "the metadata exists,
but not at the exact convention this specific client tries." Given how many well-known path conventions
exist across RFC 8414 vs OIDC Discovery vs MCP's own spec examples, a third one showing up for a
*different* real client (Claude Desktop, Claude Code, ChatGPT) during the rest of Phase 5 would not be
surprising — worth checking raw HTTP logs immediately if any of them also report a generic auth failure,
rather than assuming the fix is already complete.

### 7.0e Prep — ✅ DONE 2026-08-19: RFC 8707 Resource Indicators — the actual root cause of every prior attempt

§7.0c/§7.0d fixed real bugs, but neither was the thing actually blocking the connector — this was. After
every discovery-layer fix landed, the connector still failed on every single attempt ("browser briefly
opens then fails," a claude.ai-side error toast, no server-side clue beyond a plain `303`) until the user
captured the popup's own Network tab directly — something server-side logs alone couldn't show, since the
popup is a separate window/process from the one the logs' user-agent string comes from. That capture
showed the real response: `/oauth/auth` redirected straight to `claude.ai/api/mcp/auth_callback?
error=invalid_target&error_description=resource+indicator+is+missing%2C+or+unknown` — an immediate OAuth
*error* redirect, not a redirect toward our interaction page at all. Every earlier attempt had actually
been failing at this exact step, on the very first hop; §7.0c and §7.0d's fixes were real and necessary
for discovery to work at all, but the flow never survived past `/oauth/auth` itself even once they landed.

Root cause: claude.ai's authorization request includes `resource=https://glass-fortress-backend-
staging.up.railway.app/api/mcp` — the MCP spec's own MUST-requirement (RFC 8707 Resource Indicators,
§"Resource Parameter Implementation": *"MCP clients MUST implement Resource Indicators... MUST be
included in both authorization requests and token requests"*). This is exactly the item Phase 2 §4.5
originally deferred: *"No resource-indicator (RFC 8707) audience restriction configured yet — deferred
to Phase 5... once we know what Claude/ChatGPT actually send."* oidc-provider rejects any `resource`
parameter outright with `invalid_target` unless `features.resourceIndicators` is explicitly configured
with a resource server it recognizes — we had never turned this on, so *every* client that correctly
follows the MCP spec (which requires sending this parameter) was guaranteed to fail here, always, on the
very first `/oauth/auth` request, regardless of anything else being correct.

Fixed in `oidcProvider.ts`: `features.resourceIndicators.getResourceServerInfo()` (extracted as a
standalone exported function, same pattern as `findAccount`/`resolveOrigin`, for direct unit testing)
accepts exactly our one real canonical resource URI (`<origin>/api/mcp`) and grants both `mcp:read
mcp:write` scopes for it; anything else throws `errors.InvalidTarget`, matching oidc-provider's own
built-in rejection for a genuinely unrecognized resource. Because a token can only ever be minted for a
resource that passes this check, every successfully-issued token is now inherently audience-bound to our
resource by construction — satisfying the MCP spec's separate audience-validation requirement without
needing an additional check anywhere else (`mcpRoutes.ts` unchanged).

Verified live before shipping: replayed claude.ai's exact `/oauth/auth` request shape (including its
`resource` parameter) against a local server — before the fix, immediate `invalid_target`; after,
correct redirect to the interaction page. Also confirmed a genuinely bogus resource is still correctly
rejected (the negative case matters here — this must reject anything that isn't our resource, not just
stop rejecting everything). New tests in `test/oidcProvider.test.ts`. 612/612 passing, `tsc --noEmit`
clean.

**Lesson for the rest of Phase 5**: this failure mode (an immediate `error=` redirect back to the
client's own callback, not a redirect toward our interaction page) is invisible in server-side request
logs alone — a `303` with a `Location` header looks identical whether it's routing correctly or erroring
out, unless you actually decode the query string. The breakthrough here came from inspecting the OAuth
*client's* own browser-devtools Network tab (the popup, not the main tab), not from anything visible in
`railway logs`. Worth doing that early for Claude Desktop/Code if either shows a similarly generic
failure, rather than re-deriving this same lesson from scratch.

Manually verify the full connect flow, on staging, for:
- **Claude Desktop** — config-driven, but Claude Desktop is expected to support MCP OAuth directly
  (discover metadata → DCR → browser popup → PKCE exchange) rather than the static-header config used
  today; confirm current Claude Desktop version actually does this before assuming it.
- **Claude Code** — same MCP OAuth flow, different client implementation.
- **ChatGPT Developer Mode** — the original motivating case; confirm a full connector round-trip
  (add connector with `Authentication: OAuth` → consent screen → tool call succeeds) end to end, not
  just the discovery metadata in isolation.

Do not treat spec compliance as sufficient evidence — each client's actual OAuth implementation has
historically had quirks (fixed redirect ports, specific `response_type`/`code_challenge_method`
expectations) that only surface by actually connecting.

### 7.0f — ✅ DONE 2026-08-19: doubled locale prefix on `returnTo` (`/he/he/oauth/interaction/...` 404)

First real end-to-end sign of life: the user's actual Google login via claude.ai's popup completed
successfully (§7.0e's fix held) and landed on
`https://glass-fortress-frontend-staging.up.railway.app/he/he/oauth/interaction/<uid>` — 404, doubled
locale segment.

Root cause: `OAuthInteractionClient.tsx` captured `returnTo` from `window.location.pathname` when
redirecting an unauthenticated visitor to `/login` — but at that point next-intl's own routing had
already resolved the URL to its locale-prefixed form (`/he/oauth/interaction/<uid>`), so `returnTo`
was already locale-prefixed. That value threads unchanged through `/login` → Google → `/auth/callback`,
where `auth/callback/page.tsx` calls `router.push(returnTo)` using the locale-aware router from
`@/i18n/navigation` — which prepends the current locale a second time, since it has no way to know the
path it was given was already prefixed.

Fixed by adding `stripLocale()` to `OAuthInteractionClient.tsx` (mirrors `proxy.ts`'s existing
`withoutLocale()`, using `routing.locales` from `@/i18n/routing`) and applying it to
`window.location.pathname` before it's used as `returnTo` — matching how `/login?step=handle` and
`/profile` are already passed as bare, locale-agnostic paths elsewhere in this same chain. `returnTo`
now stays locale-agnostic through the whole `/login` → Google → `/auth/callback` round trip, so the
locale-aware `router.push()` at the end adds it exactly once. `tsc --noEmit` clean.

### 7.0g — ✅ DONE 2026-08-19: `_interaction` cookie silently dropped — frontend and backend are cross-*site*, not just cross-origin

Next symptom after §7.0f: the URL now had a single locale segment, but landing on
`/he/oauth/interaction/<uid>` (after a real Google login completed) showed the "expired" screen
(`t('expiredTitle')`) — `GET /oauth/interaction/:uid` was failing every time.

Root cause: confirmed directly against the real Public Suffix List (`publicsuffix.org/list/public_suffix_list.dat`
lists `up.railway.app` explicitly, submitted by Railway itself) that our frontend
(`glass-fortress-frontend-staging.up.railway.app`) and backend
(`glass-fortress-backend-staging.up.railway.app`) are genuinely **cross-site**, not merely
cross-origin — `up.railway.app` is its own public suffix, so the two subdomains share no registrable
domain. Two compounding bugs followed from that:

1. The frontend's `GET /oauth/interaction/:uid` fetch (`OAuthInteractionClient.tsx`) never passed
   `credentials: 'include'` — fetch's default credentials mode (`same-origin`) never sends cookies
   cross-origin at all, regardless of any cookie attribute.
2. Even with that fixed, oidc-provider's `_interaction`/`_session` cookies (the ones
   `interactionDetails()` in `oauthInteractionRoutes.ts` depends on to find the pending OAuth session)
   default to `sameSite: 'lax'` (confirmed in `oidc-provider`'s own `lib/helpers/defaults.js`) — Lax
   cookies are withheld by the browser on cross-*site* subresource requests (our `fetch`) entirely, and
   on cross-site POST navigations (our `/login` and `/confirm` `<form>` submits) too. `lax` was
   guaranteed to fail this entire flow on every request past the first hop, not just this one GET.

Fixed: `oidcProvider.ts` now sets `cookies.long.sameSite: 'none'` and `cookies.short.sameSite: 'none'`
(covers `_session` and `_interaction`/`_interaction_resume` respectively — verified against
`oidc-provider`'s own source, `actions/authorization/interactions.js` and `models/session.js`, for which
bucket each cookie actually uses); `Secure` still applies automatically via `ctx.secure`, which
`oidcProvider.proxy = true` (already set) makes correct behind Railway's TLS-terminating proxy.
`OAuthInteractionClient.tsx`'s GET fetch now passes `credentials: 'include'` explicitly. `none` is safe
specifically because neither domain serves any content these cookies could be replayed against outside
this one OAuth handoff.

Verified before shipping: constructed a real `Provider` (not the Jest mock) with this exact config via a
throwaway `ts-node` script — confirms `oidc-provider` itself accepts the partial `cookies` override
without throwing, not just that our own TypeScript compiles. `tsc --noEmit` clean on both apps, backend
Jest 612/612 (unaffected — no existing test constructs a real `Provider`, all mock it; this class of
bug is only observable against real cross-site cookies, i.e. Phase 5 live testing, exactly like §7.0e).

**Lesson for the rest of Phase 5**: `frontend...up.railway.app` and `backend...up.railway.app` looking
like they share a domain is misleading — check the actual Public Suffix List before assuming two Railway
subdomains are same-site for cookie purposes. Any future feature that leans on a cookie between these two
specific hosts needs `sameSite: 'none'` from the start, not as an afterthought.

### ✅ claude.ai connector — FULLY VERIFIED END-TO-END 2026-08-19

After §7.0–§7.0g, a real claude.ai custom connector completed the entire chain for the first time:
DCR → PKCE authorization request (with `resource` param) → Google login via GF's own session →
consent screen → resource-bound access token → an actual write tool call
(`create_research_session`) reaching the real handler and succeeding. Verified live, not just by the
tool call itself: it correctly reported "no previous session was open, so nothing got auto-closed" —
proof the call reached real application logic and real staging data (thesis `cmsyrk73800023f8cunfp4r4w`
from an earlier session, not a stub), and that a subsequent test with a nonexistent thesis ID
(`test-123`) correctly 404'd with real validation rather than any kind of auth failure. This closes out
the original motivating goal of this entire plan for the claude.ai client.

Remaining Phase 5 targets (Claude Desktop, Claude Code, ChatGPT) are unaffected by this success and
still need their own live verification — none of §7.0–§7.0g's fixes were claude.ai-specific, so there
is no strong reason to expect the same bugs recur, but per this plan's own repeated lesson, that must be
confirmed live, not assumed.

---

## 7.1 Shipped to production — 2026-08-19

Following the claude.ai verification above, the user gave explicit `SHIP` approval the same day.
`staging` (`a901b1b`) was merged into `master` — 612/612 backend tests green, `staging` 24 commits ahead
of `master` with 0 behind (clean fast-forward), and the full diff scanned for secret-shaped content
before merging (comments/doc prose and known test fixtures only, nothing live). Both GF production
Railway services (`glass-fortress-backend-production`, `glass-fortress-frontend-production`) redeployed
and were health-checked directly, including the new `/.well-known/oauth-protected-resource` endpoint.

Google OAuth was then enabled on **production's own Supabase project** (`fqmczumacfbunffgodlo`) —
reusing the same Google Cloud OAuth client ("TederWebClient") already set up for staging, with an
additional authorized redirect URI added for production's Supabase callback
(`https://fqmczumacfbunffgodlo.supabase.co/auth/v1/callback`). Verified live by clicking "Continue with
Google" on the production login page and confirming a clean redirect to Google's real consent screen
naming `fqmczumacfbunffgodlo.supabase.co` — no `redirect_uri_mismatch`, no "provider disabled" error.
This is mechanically isolated from staging's own Google config (separate Supabase project, separate
provider settings; the shared OAuth client only gained an additional redirect URI, which doesn't affect
the existing staging one) — confirmed by reasoning through the three independent systems involved
(GF's own `oidc-provider` instance per environment, each environment's separate Supabase project, and
the one shared-but-additively-modified Google Cloud client), not just assumed.

Production now runs the identical OAuth build to staging. Remaining before this is "fully done":
Claude Desktop, Claude Code, and ChatGPT (tier-restricted) still need their own live verification —
requested but not yet run. Persisted JWKS/cookie keys are still ephemeral in both environments (risk
explicitly accepted by the user).

---

## 8. Phase 6 — Legacy token deprecation (per §2.3 decision)

If the "service token" middle option from §2.3 is confirmed: rename/reframe `POST /api/auth/mcp-token`'s
UI copy and docs to make clear it's for non-interactive/service use, not the default researcher path;
update `docs/gf-chatgpt-mcp-connector-guide.md` and any Claude Desktop setup docs to recommend OAuth as
the default going forward.

### 8.1 UI portion — ✅ DONE 2026-08-20

User explicitly confirmed the §2.3 split when asked directly: remove the profile page's token-generation
UI (a researcher never needs it now that OAuth login gates write access automatically), but keep the
backend `POST /api/auth/mcp-token` route, `Researcher.mcpTokenHash`, and the `mcpRoutes.ts` fallback path
exactly as-is for non-interactive/CI use — not a reversal of §2.3, just executing the UI-reframing it
already called for, taken to "remove" rather than "reframe" for the human-facing surface specifically.

Removed: the "MCP Token section" of `frontend/src/app/[locale]/profile/page.tsx` (generate/rotate button,
revealed-token display, Claude Desktop config snippet), the now-dead `hasMcpToken` field on
`ResearcherProfile` and the now-unused `refreshProfile()` context method (both only existed to support
that UI), and the associated `auth.*` translation keys in both `en.json`/`he.json`. Updated the stale
`pendingApprovalHint`/`admin.subtitle` copy that referenced "generate an MCP token" to describe OAuth
instead. Backend untouched — `POST /api/auth/mcp-token` remains live and tested as the CI/scripted-use
path.

Also added: a "Connect via MCP (OAuth)" section on the public `/researchers` page — concrete numbered
steps (point client at the production server URL, client auto-discovers OAuth via the `oauth` field on
`GET /api/mcp`, sign in with Google, approve scopes, done), plus a dedicated callout addressed to AI
agents reading the page (cites RFC 9728/8414/8707 and the DCR+PKCE flow directly, so an agentic client
can self-configure without a human walking it through UI). Notes accurately that only the claude.ai path
is verified end-to-end (§7 above); Claude Desktop/Code presented as "should work, not yet verified."

**Not done, still stale:** `docs/gf-chatgpt-mcp-connector-guide.md` still describes write tools as
production-unavailable and only staging as having OAuth — both now false since §7.1's production ship.
Out of scope for this pass (only the profile-page UI and `/researchers` docs were requested); needs its
own update before it's handed to a user again.

---

## 9. Explicitly out of scope

- **Bronze Fortress.** Its MCP write auth (`apps/bronze-fortress/backend/src/mcp/mcpRoutes.ts:35-51`) is
  a single shared `MCP_WRITE_TOKEN` env var, not a per-researcher credential — there is no per-user
  identity in BF's MCP layer to attach an OAuth grant to today. Extending this plan to BF would require
  first deciding whether BF *should* have per-user researcher accounts at all, which is a separate,
  larger product question, not a follow-on task of this plan.
- **Requiring login for read tools.** Read tools stay unauthenticated; `mcp:read` scope is reserved
  (§2.4) but nothing in this plan proposes actually gating reads behind it.
- **Rewriting Supabase Auth itself.** This plan wraps the existing Google/magic-link login, it does not
  touch how researchers authenticate to the website today.

---

## 10. JWKS/cookie key persistence — ✅ DONE 2026-08-20 (code), Railway rollout pending

Closes the risk accepted at §4.5/§5.5/§7.1. Prompted by a "when are we ready for a quiet launch"
discussion: with real researchers about to rely on a persistent MCP connection, every redeploy silently
invalidating their session (or, as discovered below, running on a publicly-known private key) stopped
being an acceptable accepted risk.

**What was actually wrong, once inspected (not what §4.5 originally assumed):** `jwks` unset doesn't
mean "ephemeral, regenerated per restart" — oidc-provider falls back to a *hardcoded* keystore baked
into the library itself (`lib/consts/dev_keystore.js`, kid `keystore-CHANGE-ME`), the same static RSA
private key in every install of `oidc-provider` worldwide, publicly readable on npm. `cookies.keys`
unset is more benign than assumed — Koa's `app.keys` is simply never set, so the session/interaction
cookies (which carry only a random-uid reference into the DB, not user-controlled claims) are set
unsigned rather than with some ephemeral key; real integrity boundary was always the DB lookup, not the
cookie. Both traced by reading `initialize_keystore.js` and `provider.js` directly, not assumed from the
old comment.

**Fix:** `src/oauth/oidcProvider.ts` gained `loadJwks()`/`loadCookieKeys()` — fail-closed at module load
(the `Provider` is constructed synchronously at import time, so a misconfigured deployment now fails at
startup, matching the existing `TOKEN_HMAC_SECRET`/`PII_SECRET_KEY` fail-closed convention). `OAUTH_JWKS`
holds a JSON-encoded JWKS with one EC P-256 private key (chosen over RSA for size/simplicity — nothing
here needs RSA-specific compatibility, no `openid` scope/ID tokens are issued, and `jwkSignatureAlgorithms`
in the library maps P-256 to `ES256` automatically); `OAUTH_COOKIE_KEYS` holds one or more comma-separated
secrets for Koa's Keygrip cookie signing. Each of local/staging/production got its own freshly generated,
never-shared key pair, matching the existing convention that secrets don't cross environments.

**Verified live, not just typechecked:** booted the backend locally against the new local `.env` values —
`GET /oauth/jwks` served the real generated EC key (matching kid/x/y, not `keystore-CHANGE-ME`), and the
old `oidc-provider WARNING: quick start development-only signing keys are used` startup warning is gone
from the boot log. 623/623 backend tests pass, including 6 new ones covering `loadJwks`/`loadCookieKeys`
directly (missing env var, invalid JSON, valid parse, single vs. comma-separated cookie keys). A new
Jest `setupFiles` entry (`test/setupEnv.ts`) was required — the eager module-load-time check means the
existing per-test `process.env[...] = ...` pattern (used for `TOKEN_HMAC_SECRET`) is too late, since
Jest's ES-module import hoisting runs before any test-body code; `setupFiles` runs before a test file's
own imports are evaluated, which per-test `beforeAll` blocks do not.

**Pending:** the actual Railway `staging`/`production` env vars have not been set yet — generated but not
applied, since pushing new secrets to live shared infrastructure needs the user's explicit go-ahead
(distinct from the go-ahead to write the code). Once applied, every existing OAuth session on that
environment (i.e., the one verified claude.ai connection from §7) will need to reconnect once — expected
and one-time, better to absorb now than after real researchers are connected.
