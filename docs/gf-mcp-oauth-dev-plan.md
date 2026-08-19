# GF MCP OAuth 2.1 Upgrade — Dev Plan

**Status:** Phase 0 ✅ LOCKED. Phase 1 ✅ DONE, merged
([PR #55](https://github.com/time4love/OpenJustice/pull/55)). Phase 2 ✅ DONE, merged
([PR #56](https://github.com/time4love/OpenJustice/pull/56)) — a live-staging proxy-scheme bug found
right after merging is fixed in the same branch as Phase 3, see §4.6. Phase 3 ✅ DONE 2026-08-19 (this
session, not yet PR'd — see §5). Phase 4 (resource-server integration) is next. Created 2026-08-19,
following the ChatGPT MCP compatibility check (`docs/gf-chatgpt-mcp-connector-guide.md`) and a user
question about whether the current Claude MCP auth model is good enough on its own merits.
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
- **`jwks` and `cookies.keys` are still unset.** This is now a real, live concern rather than a
  forward-looking one: Phase 3's login/consent flow is built and merging it means every Railway deploy
  (which restarts the process) invalidates any in-flight login/consent session — a researcher mid-consent
  during a deploy would have to restart. Low real-world likelihood on staging today (infrequent deploys,
  few users), but this is exactly the kind of thing that should be an explicit decision, not a silent
  gap — flagged to the user before merging Phase 3 rather than fixed unilaterally, since it requires
  generating a real key set and setting it as a Railway env var (same pattern as `TOKEN_HMAC_SECRET`).
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

## 6. Phase 4 — Resource-server integration (`mcpRoutes.ts`)

- `resolveResearcher()` (`mcpRoutes.ts:41-79`) gains an OAuth path: if the bearer token validates as an
  active `node-oidc-provider` access token (introspection against the adapter, not a network round
  trip — same process), resolve `researcherId` from the token's linked grant and check the `mcp:write`
  scope; otherwise fall back to the existing `mcpTokenHash` lookup per §2.3's decision.
- Both paths converge on the same `researcherContext.run({ researcherId }, ...)` call already in place —
  no change needed to any individual tool handler.
- Update the `GET /api/mcp` health/discovery response (`mcpRoutes.ts:173-182`) to advertise OAuth
  support so clients that inspect it (and the `docs/gf-chatgpt-mcp-connector-guide.md` guide) reflect
  reality once this ships.

---

## 7. Phase 5 — Client compatibility verification (staging, before production)

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

---

## 8. Phase 6 — Legacy token deprecation (per §2.3 decision)

If the "service token" middle option from §2.3 is confirmed: rename/reframe `POST /api/auth/mcp-token`'s
UI copy and docs to make clear it's for non-interactive/service use, not the default researcher path;
update `docs/gf-chatgpt-mcp-connector-guide.md` and any Claude Desktop setup docs to recommend OAuth as
the default going forward.

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
