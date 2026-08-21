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

// Persisted signing/cookie keys — required, fail-closed if missing. Without
// these, oidc-provider falls back to a *static* RSA private key shipped
// inside the library itself (lib/consts/dev_keystore.js, kid
// "keystore-CHANGE-ME") for JWKS, and to no cookie signing at all (empty
// `app.keys`, so the session/interaction cookies carry no integrity check).
// The dev keystore isn't "ephemeral" as earlier notes here assumed — it's
// the exact same public private key in every install of this library
// worldwide, publicly readable on npm. Both are read eagerly at module load
// (the Provider below is constructed synchronously at import time), so a
// misconfigured deployment fails at startup, not on a researcher's first
// OAuth attempt.
/**
 * The command that produces a correct OAUTH_JWKS — an RSA key AND an EC key.
 *
 * Kept in one constant because it appears in two separate error messages, and
 * a drifted copy would reintroduce exactly the outage that loadJwks below now
 * guards against. The previous command was itself the cause: documented,
 * correct-looking, and generating a key that broke every client registration.
 */
export const GENERATE_JWKS_COMMAND =
  'node -e "const c=require(\'crypto\');const jwk=(t,o)=>c.generateKeyPairSync(t,o).privateKey.export({format:\'jwk\'});' +
  "console.log(JSON.stringify({keys:[jwk('rsa',{modulusLength:2048}),jwk('ec',{namedCurve:'P-256'})]}))\"";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The `kty` of one JWKS entry, or 'unknown'. Tolerates entries that are not
 * objects at all: OAUTH_JWKS is a hand-edited environment variable, and this
 * runs during the error path, where throwing a TypeError instead of the
 * intended message would hide the actual problem.
 */
function keyKind(key: unknown): string {
  if (!isRecord(key)) return 'unknown';
  const kty = key.kty;
  return typeof kty === 'string' ? kty : 'unknown';
}

/**
 * Reads OAUTH_JWKS and refuses anything that cannot sign RS256.
 *
 * The RS256 check is not defensive coding — it is a fix for a real outage.
 * Before 2026-08-20 this server had no OAUTH_JWKS and fell back to
 * oidc-provider's shipped dev keystore, which is an **RSA** key; RS256 worked,
 * and real MCP clients registered fine. Commit fa54af4 correctly stopped using
 * that keystore (it is a private key published on npm, identical in every
 * install) — but the generation command it documented produced an EC key
 * ALONE. The provider could then sign only ES256, while oidc-provider's own
 * client default remained RS256, so every Dynamic Client Registration that did
 * not explicitly ask for ES256 was rejected with `invalid_client_metadata`.
 * Nothing failed at startup, the deploy went green, and the only symptom was
 * "Authentication failed" in a client that never reached the login screen.
 *
 * RS256 is also not optional: OpenID Connect Discovery 1.0 §3 requires
 * `id_token_signing_alg_values_supported` to include RS256. It matters more
 * than usual here because registration is OPEN — arbitrary third-party clients
 * self-register, so the server cannot assume anything about which algorithms
 * they request.
 *
 * Failing closed at load is deliberate: the Provider is constructed
 * synchronously at import time, so a JWKS that would break registration takes
 * the deploy down instead of silently serving an authorization server that
 * cannot register anyone.
 */
export function loadJwks(env: NodeJS.ProcessEnv = process.env): Configuration['jwks'] {
  const raw = env['OAUTH_JWKS'];
  if (!raw) {
    throw new Error(`OAUTH_JWKS env var is not set. Generate one with: ${GENERATE_JWKS_COMMAND} — see .env.example.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error('OAUTH_JWKS env var is not valid JSON', { cause });
  }

  const keys = isRecord(parsed) ? parsed.keys : undefined;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('OAUTH_JWKS must be a JWKS object with a non-empty "keys" array.');
  }

  const kinds = keys.map(keyKind);
  if (!kinds.includes('RSA')) {
    throw new Error(
      'OAUTH_JWKS contains no RSA key, so this authorization server cannot sign RS256 — ' +
        `it currently offers: ${kinds.join(', ')}. Open Dynamic Client Registration means ` +
        'third-party MCP clients self-register, and a client that does not explicitly request ' +
        'ES256 defaults to RS256 and is rejected with invalid_client_metadata before it ever ' +
        'reaches login (this broke every client between 2026-08-20 and 2026-08-21). RS256 is ' +
        `also mandatory per OpenID Connect Discovery 1.0 §3. Regenerate with: ${GENERATE_JWKS_COMMAND}`,
    );
  }

  return parsed as Configuration['jwks'];
}

export function loadCookieKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env['OAUTH_COOKIE_KEYS'];
  if (!raw) {
    throw new Error('OAUTH_COOKIE_KEYS env var is not set. Generate with: openssl rand -hex 32 — see .env.example.');
  }
  return raw.split(',').map((key) => key.trim()).filter(Boolean);
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

  // `up.railway.app` is itself on the Public Suffix List (Railway registers
  // it there, like other PaaS wildcard domains, precisely so different
  // tenants' subdomains aren't treated as one site) — confirmed directly
  // against the real PSL, not assumed. That makes our frontend and backend
  // subdomains genuinely cross-site, not just cross-origin, so the default
  // `sameSite: 'lax'` on oidc-provider's _interaction/_session cookies (short
  // TTL / long TTL respectively) is silently dropped by the browser on every
  // request that reaches this backend from the frontend's own JS or a form
  // submit — reproduced live as `interactionDetails()` failing to find a
  // session at all. `none` is safe here specifically because there is no
  // browsable content on either domain these cookies could be replayed
  // against outside this exact OAuth handoff. Requires `Secure`, which Koa's
  // cookies module infers from `ctx.secure` (true here thanks to
  // `oidcProvider.proxy = true` below).
  cookies: {
    keys: loadCookieKeys(),
    long: { sameSite: 'none' },
    short: { sameSite: 'none' },
  },

  jwks: loadJwks(),

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
