// oidc-provider is a pure-ESM package ("type": "module", no CJS build) — real
// Node can require(esm) it fine (verified against the actual runtime), but
// Jest's CJS-mode test transform can't load it, the same class of problem
// mcpRoutes.test.ts already works around for @modelcontextprotocol/sdk. The
// module under test only *constructs* a Provider as an unused side effect for
// these two tests, so a bare mock is enough — no behavior from the real
// library is exercised here.
jest.mock('oidc-provider', () => ({
  Provider: jest.fn().mockImplementation(() => ({ callback: jest.fn() })),
  errors: {
    InvalidTarget: class InvalidTarget extends Error {},
  },
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researcher: { findUnique: jest.fn() },
  },
}));

import { execSync } from 'node:child_process';
import { prisma } from '../src/lib/prisma';
import {
  resolveIssuer,
  resolveOrigin,
  findAccount,
  getResourceServerInfo,
  loadJwks,
  loadCookieKeys,
  GENERATE_JWKS_COMMAND,
} from '../src/oauth/oidcProvider';

// The `node -e` payload from GENERATE_JWKS_COMMAND, minus the shell wrapper.
const GENERATE_JWKS_COMMAND_BODY =
  GENERATE_JWKS_COMMAND.replace(/^node -e "/, '').replace(/"$/, '').replace(/\\'/g, "'");

// ---------------------------------------------------------------------------
// The two pure-ish pieces of oidc-provider's configuration that are worth
// testing directly, without constructing a real Provider (see
// docs/gf-mcp-oauth-dev-plan.md Phase 2 for why the rest is integration-level,
// verified in Phase 5 against real clients).
// ---------------------------------------------------------------------------

const mockFindUnique = prisma.researcher.findUnique as jest.Mock;

describe('resolveIssuer', () => {
  it('uses RAILWAY_PUBLIC_DOMAIN when set', () => {
    expect(resolveIssuer({ RAILWAY_PUBLIC_DOMAIN: 'glass-fortress-backend-staging.up.railway.app' })).toBe(
      'https://glass-fortress-backend-staging.up.railway.app/oauth',
    );
  });

  it('falls back to localhost with PORT when RAILWAY_PUBLIC_DOMAIN is absent', () => {
    expect(resolveIssuer({ PORT: '4000' })).toBe('http://localhost:4000/oauth');
  });

  it('defaults the port to 3000 when neither is set', () => {
    expect(resolveIssuer({})).toBe('http://localhost:3000/oauth');
  });
});

describe('resolveOrigin', () => {
  it('matches resolveIssuer minus the /oauth suffix', () => {
    const env = { RAILWAY_PUBLIC_DOMAIN: 'glass-fortress-backend-staging.up.railway.app' };
    expect(`${resolveOrigin(env)}/oauth`).toBe(resolveIssuer(env));
  });
});

describe('getResourceServerInfo', () => {
  // The actual bug this exists to fix: a real claude.ai connector always
  // sends a `resource` param (MCP spec MUST-requirement), and without this
  // being recognized, oidc-provider rejected /oauth/auth outright with
  // invalid_target before ever redirecting to our interaction page — see
  // docs/gf-mcp-oauth-dev-plan.md for the full trail.
  const env = { RAILWAY_PUBLIC_DOMAIN: 'glass-fortress-backend-staging.up.railway.app' };

  it('accepts our real canonical resource URI and grants both MCP scopes', () => {
    expect(
      getResourceServerInfo('https://glass-fortress-backend-staging.up.railway.app/api/mcp', env),
    ).toEqual({ scope: 'mcp:read mcp:write' });
  });

  it('rejects any other resource indicator', () => {
    expect(() => getResourceServerInfo('https://some-other-service.example.com', env)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadJwks — must be able to sign RS256.
//
// This guards a real outage. Until 2026-08-20 there was no OAUTH_JWKS and
// oidc-provider used its shipped dev keystore, an RSA key, so RS256 worked and
// real MCP clients registered. fa54af4 correctly stopped using that keystore
// (a private key published on npm, identical in every install) but documented a
// command producing an EC key ALONE. The provider could then sign only ES256
// while oidc-provider's client default stayed RS256, so every Dynamic Client
// Registration that did not explicitly request ES256 was rejected with
// invalid_client_metadata, before reaching a login screen.
//
// Nothing failed at startup and the deploy went green — the only symptom was
// "Authentication failed" in the client. Hence fail-closed at load.
//
// NOTE: the 'parses a valid JWKS JSON string' case here previously used an
// EC-only JWKS and asserted it was accepted. That test encoded the bug, so it
// was corrected rather than the guard being loosened to keep it passing.
// ---------------------------------------------------------------------------

const RSA_JWK = { kty: 'RSA', n: 'n', e: 'AQAB', d: 'd' };
const EC_JWK = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' };

describe('loadJwks', () => {
  it('throws when OAUTH_JWKS is unset', () => {
    expect(() => loadJwks({})).toThrow(/OAUTH_JWKS env var is not set/);
  });

  it('throws when OAUTH_JWKS is not valid JSON', () => {
    expect(() => loadJwks({ OAUTH_JWKS: 'not-json' })).toThrow(/not valid JSON/);
  });

  it('parses a valid JWKS JSON string', () => {
    const jwks = { keys: [RSA_JWK, EC_JWK] };
    expect(loadJwks({ OAUTH_JWKS: JSON.stringify(jwks) })).toEqual(jwks);
  });

  it('accepts an RSA-only JWKS', () => {
    // RS256 is what registration needs; ES256 is a bonus. Asserted so the guard
    // is not later tightened into demanding both.
    expect(() => loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [RSA_JWK] }) })).not.toThrow();
  });

  it('REJECTS an EC-only JWKS — the exact configuration that caused the outage', () => {
    expect(() => loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [EC_JWK] }) })).toThrow(
      /no RSA key/i,
    );
  });

  it('names the key types it did find, so the error is actionable', () => {
    expect(() => loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [EC_JWK] }) })).toThrow(/EC/);
  });

  it('quotes the generation command rather than describing it', () => {
    expect(() => loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [EC_JWK] }) })).toThrow(
      /modulusLength/,
    );
  });

  it('rejects a JWKS with no keys array', () => {
    expect(() => loadJwks({ OAUTH_JWKS: '{}' })).toThrow(/non-empty "keys" array/i);
  });

  it('rejects an empty keys array', () => {
    expect(() => loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [] }) })).toThrow(
      /non-empty "keys" array/i,
    );
  });

  it('survives entries that are not objects', () => {
    // A hand-edited env var is the likely source, and the guard must produce
    // its own error rather than a TypeError.
    expect(() =>
      loadJwks({ OAUTH_JWKS: JSON.stringify({ keys: [null, 'nonsense', 42] }) }),
    ).toThrow(/no RSA key/i);
  });
});

describe('GENERATE_JWKS_COMMAND', () => {
  it('generates a JWKS that loadJwks accepts', () => {
    // The command only ever appears inside an error message, so nothing else
    // would run it. Executing it here stops the advice rotting — which is
    // exactly how the previous command survived: documented, correct-looking,
    // and producing a key that broke registration.
    const generated = execSync(`node -e ${JSON.stringify(GENERATE_JWKS_COMMAND_BODY)}`, {
      encoding: 'utf8',
    }).trim();

    expect(() => loadJwks({ OAUTH_JWKS: generated })).not.toThrow();
    expect(
      (JSON.parse(generated) as { keys: { kty: string }[] }).keys.map((k) => k.kty).sort(),
    ).toEqual(['EC', 'RSA']);
  });

  it('is what the error messages actually quote', () => {
    expect(GENERATE_JWKS_COMMAND).toContain('modulusLength');
    expect(GENERATE_JWKS_COMMAND).toContain('P-256');
  });
});

describe('loadCookieKeys', () => {
  it('throws when OAUTH_COOKIE_KEYS is unset', () => {
    expect(() => loadCookieKeys({})).toThrow(/OAUTH_COOKIE_KEYS env var is not set/);
  });

  it('returns a single-element array for one key', () => {
    expect(loadCookieKeys({ OAUTH_COOKIE_KEYS: 'abc123' })).toEqual(['abc123']);
  });

  it('splits comma-separated keys and trims whitespace', () => {
    expect(loadCookieKeys({ OAUTH_COOKIE_KEYS: 'abc123, def456 ,ghi789' })).toEqual([
      'abc123',
      'def456',
      'ghi789',
    ]);
  });
});

describe('findAccount', () => {
  // oidc-provider only ever calls findAccount with (ctx, id) — ctx is unused here.
  const ctx = {} as Parameters<typeof findAccount>[0];

  it('returns undefined for a researcher that does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(findAccount(ctx, 'missing')).resolves.toBeUndefined();
  });

  it('returns undefined for an unapproved researcher', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r-1', approved: false });
    await expect(findAccount(ctx, 'r-1')).resolves.toBeUndefined();
  });

  it('resolves an approved researcher to an Account with matching claims', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r-1', approved: true });
    const account = await findAccount(ctx, 'r-1');
    expect(account?.accountId).toBe('r-1');
    expect(account?.claims('', '', {}, [])).toEqual({ sub: 'r-1' });
  });
});
