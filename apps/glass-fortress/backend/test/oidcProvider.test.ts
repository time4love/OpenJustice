// oidc-provider is a pure-ESM package ("type": "module", no CJS build) — real
// Node can require(esm) it fine (verified against the actual runtime), but
// Jest's CJS-mode test transform can't load it, the same class of problem
// mcpRoutes.test.ts already works around for @modelcontextprotocol/sdk. The
// module under test only *constructs* a Provider as an unused side effect for
// these two tests, so a bare mock is enough — no behavior from the real
// library is exercised here.
jest.mock('oidc-provider', () => ({
  Provider: jest.fn().mockImplementation(() => ({ callback: jest.fn() })),
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researcher: { findUnique: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { resolveIssuer, resolveOrigin, findAccount } from '../src/oauth/oidcProvider';

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
