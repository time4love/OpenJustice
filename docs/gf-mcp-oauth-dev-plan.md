# GF MCP OAuth 2.1 Upgrade — Dev Plan

**Status:** Phase 0 decisions ✅ LOCKED 2026-08-19 (see §2 — all four picked the recommended option).
Phase 1 (data model) starting next. Created 2026-08-19, following the ChatGPT MCP compatibility check
(`docs/gf-chatgpt-mcp-connector-guide.md`) and a user question about whether the current Claude MCP
auth model is good enough on its own merits.
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

## 4. Phase 2 — Authorization server

- Mount `node-oidc-provider` under `/oauth` in the GF backend Express app.
- Configure: `features.dPoP` off (not needed for this use case), `features.devInteractions` off
  (must build the real interaction UI, see Phase 3 — never ship the library's default debug login
  screen), `features.registration` on with `initialAccessToken: false` (open DCR — any MCP client can
  self-register, matching how Claude Desktop/ChatGPT expect to connect without a pre-shared secret),
  PKCE required for all clients (`pkce.required: () => true`), no client secrets issued (public clients
  only — DCR + PKCE is the whole point of not needing one).
- Serve `/.well-known/oauth-authorization-server` (and/or `/.well-known/oauth-protected-resource`
  pointing back at the same origin, per the MCP Authorization spec) so clients can auto-discover the AS
  from the existing `/api/mcp` resource URL — no separate config field for users to fill in beyond the
  MCP server URL they already use today.
- `redirect_uri` validation: exact-match against what the client registered via DCR — no wildcard/prefix
  matching, this is the primary open-redirect defense.

---

## 5. Phase 3 — Login/consent bridge (new frontend surface)

`node-oidc-provider`'s `/authorize` step delegates to an "interaction" the application must render.
New route, e.g. `frontend/src/app/[locale]/oauth/interaction/[uid]/page.tsx`:

1. If no active Supabase session → reuse the existing login flow as-is
   (`getGoogleOAuthUrl` / magic link, `login/page.tsx`) rather than building a second login UI.
2. Once authenticated, look up (or create, matching existing `POST /api/auth/register` flow) the
   `Researcher` row. If `approved !== true`, stop here with the same "not yet approved, contact an
   admin" messaging `authRoutes.ts` already uses elsewhere — do **not** let an OAuth grant complete for
   an unapproved researcher just because they have a valid Google login.
3. Consent screen: "`<client name>` wants to read/write your Glass Fortress researcher account" with the
   requested scopes shown plainly, before finishing the `node-oidc-provider` interaction.
4. New "connected apps" list on the existing profile page (`frontend/src/app/[locale]/profile/page.tsx`)
   showing active grants with a revoke button per grant — this is the concrete fix for "no way to revoke
   one client without breaking all of them."

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
