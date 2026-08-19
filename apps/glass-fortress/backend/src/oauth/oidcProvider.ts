import { Provider, errors } from 'oidc-provider';
import type { Account, Configuration, KoaContextWithOIDC } from 'oidc-provider';
import { prisma } from '../lib/prisma';
import { PrismaOidcAdapter } from './prismaOidcAdapter';

// ---------------------------------------------------------------------------
// MCP OAuth 2.1 authorization server (docs/gf-mcp-oauth-dev-plan.md, Phase 2).
//
// Wraps the Researcher accounts GF already has (Google/Supabase login, admin
// approval) in real OAuth instead of the static per-user MCP bearer token —
// see the dev plan for why. This file only configures and constructs the
// provider; nothing calls it yet outside server.ts's mount.
//
// KNOWN PHASE 2 LIMITATIONS (tracked, not yet closed):
// - `jwks` and `cookies.keys` are left unset, so oidc-provider falls back to
//   its own ephemeral, regenerated-on-restart defaults (with a startup
//   warning). Fine for now — nothing depends on either surviving a restart
//   yet, since Phase 3's login/consent UI (the only thing that actually
//   drives an `/auth` round trip) doesn't exist. Must be replaced with a
//   persisted key set (env-provided, generated once) before Phase 3 ships.
// - `interactions.url` points at a frontend route
//   (`/oauth/interaction/:uid`) that Phase 3 has not built yet — visiting
//   `/oauth/auth` today redirects to a 404. That's expected at this phase.
// - Resource-indicator (RFC 8707) support: implemented (features.resourceIndicators
//   below), after a real claude.ai connector attempt proved this wasn't optional —
//   the MCP spec MUST-requires clients to send a `resource` param, and without
//   this feature enabled oidc-provider rejects any request that includes one with
//   `invalid_target`. That rejection happens at /oauth/auth itself, before any
//   redirect to our interaction page — which is why every earlier attempt looked
//   like "the browser briefly opens then fails" with zero traffic ever reaching
//   the frontend. Caught from a real browser's Network tab, not guessed.
// ---------------------------------------------------------------------------

// Exported standalone (rather than inlined into `configuration`) so both can be
// unit-tested without constructing a real Provider — see test/oidcProvider.test.ts.

export function resolveOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const domain = env['RAILWAY_PUBLIC_DOMAIN'];
  const port = String(env['PORT'] ?? 3000);
  return domain ? `https://${domain}` : `http://localhost:${port}`;
}

export function resolveIssuer(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolveOrigin(env)}/oauth`;
}

// Resolves an oidc-provider accountId (== Researcher.id) back to a real,
// still-approved Researcher. Re-checked here (not just at interaction time)
// because a researcher's approval can be revoked after a grant already
// exists — every subsequent use of that grant must re-verify, not just its
// creation.
export async function findAccount(
  _ctx: KoaContextWithOIDC,
  id: string,
): Promise<Account | undefined> {
  const researcher = await prisma.researcher.findUnique({ where: { id } });
  if (!researcher?.approved) return undefined;
  return {
    accountId: researcher.id,
    claims: () => ({ sub: researcher.id }),
  };
}

// We only ever have exactly one resource in this whole system — reject
// anything else outright rather than silently accepting an unrecognized
// `resource` value. Because a token can only be minted for a resource that
// passed this check, a successfully-issued token is inherently already
// bound to our resource — the audience-validation guarantee the MCP spec
// asks for, satisfied by construction rather than a separate check.
export function getResourceServerInfo(
  resourceIndicator: string,
  env: NodeJS.ProcessEnv = process.env,
): { scope: string } {
  if (resourceIndicator !== `${resolveOrigin(env)}/api/mcp`) {
    throw new errors.InvalidTarget();
  }
  return { scope: 'mcp:read mcp:write' };
}

const configuration: Configuration = {
  adapter: PrismaOidcAdapter,

  // No static clients — every MCP client (Claude Desktop, Claude Code,
  // ChatGPT, ...) arrives via Dynamic Client Registration, matching what
  // ChatGPT's connector UI expects (it cannot use a pre-shared client_id).
  clients: [],

  // 'offline_access' isn't an MCP scope itself — it's what tells oidc-provider
  // to allow the 'refresh_token' grant type at all (see collectGrantTypes() in
  // the library: refresh tokens are only ever issued when this scope exists).
  // Omitting it would have silently made the 30-day rotating refresh token
  // from docs/gf-mcp-oauth-dev-plan.md §2.4 unreachable — caught by actually
  // registering a client and inspecting the rejection, not by reading the docs.
  scopes: ['mcp:read', 'mcp:write', 'offline_access'],

  // Every client here is public (no client secret) — DCR + PKCE is the whole
  // security model, never client-secret auth.
  clientAuthMethods: ['none'],
  pkce: {
    required: () => true,
  },

  features: {
    // Never ship the library's own debug login screen — real login/consent
    // is Phase 3, reusing GF's existing Google/Supabase auth.
    devInteractions: { enabled: false },
    registration: {
      enabled: true,
      initialAccessToken: false, // open DCR — no pre-shared secret to register a client
    },
    revocation: { enabled: true },
    introspection: { enabled: true },

    resourceIndicators: {
      enabled: true,
      defaultResource: () => `${resolveOrigin()}/api/mcp`,
      getResourceServerInfo: (_ctx, resourceIndicator) => getResourceServerInfo(resourceIndicator),
    },
  },

  ttl: {
    AccessToken: 60 * 60, // 1 hour — docs/gf-mcp-oauth-dev-plan.md §2.4
    RefreshToken: 60 * 60 * 24 * 30, // 30 days
  },
  rotateRefreshToken: true,

  interactions: {
    url: (_ctx, interaction) => {
      const base = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
      return `${base}/oauth/interaction/${interaction.uid}`;
    },
  },

  findAccount,
};

export const oidcProvider = new Provider(resolveIssuer(), configuration);

// Railway (like most PaaS) terminates TLS at its edge and forwards plain HTTP
// to the container — without this, oidc-provider (a Koa app) builds every
// per-request absolute URL (authorization_endpoint, jwks_uri, ...) as http://
// even though `issuer` itself is https://, because it reads the scheme off
// the actual incoming request rather than the static issuer string. Confirmed
// live on staging before this line existed: discovery correctly reported
// issuer as https, but authorization_endpoint/jwks_uri were http.
oidcProvider.proxy = true;
