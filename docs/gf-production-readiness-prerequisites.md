# GF Production Readiness — Prerequisites Discovered While Rebuilding Staging

**Status:** open. Items 1, 4, 5, 8 fixed on `staging`; **none on `master`**. Items 2, 3, 6, 7, 9, 10
outstanding. **Item 5 blocks everything** — its PR must not merge before the key is rotated.
**Created:** 2026-08-21, during an attempt to rebuild staging evidence via MCP.
**Scope:** Glass Fortress. Every item below blocked, or would have blocked, a production replay.

---

## 0. Why this document exists

The session's goal was to rebuild staging data through the MCP tools — one real evidence URL, one
tracked URL, a thesis — and to record the requests as a replayable playbook for seeding production
later. **Not one row was written.** Every hour went into defects standing between an empty
environment and a working one.

That is the useful outcome, and it is what this file is. None of these were visible by reading the
code; all surfaced only by driving the real system. The next person to initialise a Glass Fortress
environment should start here rather than rediscover them.

Two ordering constraints are immovable and worth stating up front, because they defeat the obvious
approaches:

- **A researcher cannot be approved before the environment is deployed.** Deploy → log in →
  register → approve. No pre-deploy step or migration can do it: at pre-deploy time no researcher
  exists (§1).
- **A read succeeding proves nothing about authentication.** Read tools are anonymous by design, so
  a liveness check must be a *write*, from the client that will do the work (§10).

---

## 1. An empty environment cannot bootstrap its first researcher ✅ FIXED (PR #87, staging only)

MCP write access is gated on `Researcher.approved`. The only supported way to set it is
`PATCH /api/auth/researchers/:id`, which is **ADMIN only**. An environment with zero researchers has
zero admins, so nobody can approve anybody.

Worse than a stuck flag: `findAccount` refuses unapproved accounts, so the **OAuth flow itself**
fails, presenting as a confusing connector error rather than "you need approval".

**Fix:** `npm run researcher:bootstrap -- --handle "<handle>"`. Refuses when any approved researcher
already exists, which is what makes it a bootstrap tool rather than a privilege-escalation tool.
`--revoke` (PR #88) corrects a bootstrap sent to the wrong identity.

**Production is still in this state — zero researchers, so its MCP write path is dead.**

## 2. Bootstrapping production needs production database credentials ⏳ OPEN

Running `researcher:bootstrap` against production requires production `DATABASE_URL` on a laptop —
the exact credential the outstanding rotation task wants to stop needing, and at odds with CLAUDE.md's
"prefer changing the deploy pipeline over acquiring the credential".

**Proposed:** a `BOOTSTRAP_RESEARCHER_EMAILS` allowlist checked at registration, auto-approving only
named accounts. Email is the only identifier known *before* first login, so it is the only key that
removes the manual step. Needs care — it adds a branch to the auth path, must not store or log the
email (the middleware deliberately never attaches it), and needs a test proving a non-allowlisted
account is still refused.

**Rejected:** auto-approving the first registrant. Zero tooling, and a land grab — GF production is
public and currently has zero researchers, so it would hand write access to whoever registered first.

## 3. OAuth connector sessions expire mid-run ⏳ OPEN (playbook item)

The write path failed on the first call with "connection to this connector was invalidated". Cost
nothing here because it failed immediately; in a longer run it leaves a rebuild half-finished.

**Action:** playbook step 0 is a cheap authenticated **write** that proves the session is live before
any real record is created. See §10 for why it must be a write.

## 4. Deleted evidence leaves permanent on-chain orphans ✅ RECOVERY FIXED (PR #86, staging only)

The chain is append-only; the database is not. Staging carries 2 orphaned anchors from the 2026-08-21
wipe (`totalEvidence() == 2`, no matching rows). On Base **mainnet** the same sequence means paid,
permanent anchors pointing at nothing, and any later re-creation of that content hits the
duplicate-recovery path.

That recovery path was itself broken — `findRegisteringTxHash` issued an unbounded `eth_getLogs`,
which public RPCs reject — so a duplicate promotion *failed* rather than recovering. Fixed in PR #86.

**Production still runs the broken version**, where the failure costs real money to discover.

## 5. `OAUTH_JWKS` is EC-only, so no MCP client can register 🔴 BLOCKER (PR #90, not merged)

Every MCP client has failed since 2026-08-20. Full analysis in `docs/gf-mcp-oauth-dev-plan.md` §7.1.

Short version: `fa54af4` correctly stopped using oidc-provider's shipped dev keystore (an RSA key
published on npm) but documented a generation command producing an **EC key alone**. The provider can
then sign only ES256 while oidc-provider's client default stays RS256, so every Dynamic Client
Registration is rejected with `invalid_client_metadata` before login is attempted.

**Production runs the same code and is broken identically** — unnoticed only because nothing has
connected to it.

**PR #90 must not merge until `OAUTH_JWKS` is rotated** on the target environment: its guard rejects
the currently-deployed key, so merging first means the build fails to boot. Generate with the command
in `.env.example`; it produces both an RSA and an EC key.

## 6. Project refs are committed in a public repo ⏳ OPEN (decision, not a bug)

`scripts/dbSimulate.ts` and `src/lib/dbEnvironment.ts` carry both Supabase project refs. Pre-existing
and deliberate — they let a destructive tool name its target rather than leave the reader decoding a
connection string under pressure. But it contradicts CLAUDE.md's own `COMMIT` rule.

**Decide:** move to env vars, or record explicitly that naming a Supabase project is acceptable.

## 7. Stale docs that misdirect the next reader ⏳ PARTIALLY FIXED

- `docs/gf-staging-data-loss-postmortem-2026-08-21.md` §5 still instructs rebuilding the staging
  `_prisma_migrations` ledger. **Already done** — `migrate status` reports up to date, 19/19.
- The same §5 states "Railway deploy does not run migrations" as the mitigation. **No longer true**
  since PR #83/#84 armed the pre-deploy step, so that trap is live again in a different form.
- `docs/gf-cost-exposure-dev-plan.md` claimed Phase 1 was unmerged. **Corrected** in PR #89.

## 8. Mixed auth model auto-detects as "no authentication" ✅ FIXED as far as code allows (PR #89)

claude.ai's "Add custom connector" dialog probes `GET /api/mcp`, receives HTTP 200 with the tool
listing, concludes no authentication is required, and pre-selects **Authentication: None (Detected)**.

With `None` the OAuth flow is never attempted: no DCR, no token, `OidcModel` stays empty. Read tools
work, every write tool 401s, and nothing in the failure points at the connector's own auth setting.

The server is not at fault — its challenge is RFC 9728 conformant:
`www-authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.

**Action (documentation, not code):** the connector must be added with **Always required**.
`Required when the server asks` also works but defers the failure to the first write call, i.e.
mid-rebuild. This belongs in `docs/gf-chatgpt-mcp-connector-guide.md` with a screenshot.

**Considered and not done:** returning 401 from `GET /api/mcp` so auto-detection picks OAuth. It
would likely break the anonymous ChatGPT read integration, which is deliberate. Needs a real
decision, not a quick fix.

PR #89 fixed the adjacent cost hole this exposed — `suggest_thesis` and `get_research_agenda` ran
anonymously while invoking LLMs, and `/api/mcp` sat above the rate limiter and was uncapped.

## 9. A discovery miss returns 401, not 404 ⏳ OPEN

`GET /.well-known/oauth-authorization-server` (bare, no path suffix) falls through `wellKnownRouter`,
which has no handler for it, to the staging gate — returning `401 Unauthorized` instead of `404`.

Both spec-correct RFC 8414 paths work (path-insertion 302→200, path-appending 200), so a conformant
client is fine. But clients probing candidate URLs read 404 as "try the next" and 401 as
"authentication required, stop". A discovery miss should never look like an auth failure.

Not confirmed as the cause of anything. Found while diagnosing §8.

## 10. Each MCP client authorizes independently ⏳ OPEN (playbook item)

Adding the connector in claude.ai does **not** authorize the Claude Code / desktop session, and vice
versa. Every client performs its own DCR and holds its own token; the server sees unrelated clients.

Confirmed 2026-08-21: the connector was added successfully in claude.ai and reads worked from Claude
Code, yet `OidcModel` held zero rows and the first write returned "This connector requires
authentication."

- Adding a connector is not the same as authorizing it. With `Always required` the exchange may not
  run until the client is actually used.
- **An empty `OidcModel` is the definitive check.** Read tools succeeding proves nothing.

---

## 11. Housekeeping left behind

- A throwaway OAuth client `diagnostic-probe-es256` was registered on staging while diagnosing §5. It
  is inert and unused, but it is a real `OidcModel` row. Remove it under the destructive-work
  protocol, not casually.
- `.claude/settings.local.json` holds a **Base mainnet deployer private key** and a Bronze Fortress
  production database password in plaintext. **Never committed** — verified across all refs — and
  ignored via the user's *global* `~/.config/git/ignore`, not this repo's `.gitignore`. That
  protection does not travel to another machine or contributor. Add it to the repo `.gitignore`, and
  rotate the mainnet key on principle.
