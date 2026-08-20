// wellKnownRoutes -> resourceMetadata -> oidcProvider.ts, which imports the
// real (pure-ESM) 'oidc-provider' package — same Jest-under-CJS problem
// every other file touching oidcProvider.ts already works around. Only
// resolveOrigin is actually used here, so a minimal mock is enough.
jest.mock('../src/oauth/oidcProvider', () => ({
  resolveOrigin: (env: NodeJS.ProcessEnv = process.env) =>
    env['RAILWAY_PUBLIC_DOMAIN'] ? `https://${env['RAILWAY_PUBLIC_DOMAIN']}` : `http://localhost:${env['PORT'] ?? 3000}`,
}));

import request from 'supertest';
import express from 'express';
import { wellKnownRouter } from '../src/routes/wellKnownRoutes';

// ---------------------------------------------------------------------------
// RFC 9728 Protected Resource Metadata (docs/gf-mcp-oauth-dev-plan.md §7.0c).
// Served at both the bare path and the RFC 8414-style path-inserted variant —
// a real claude.ai connector, observed live, requested the path-inserted one
// first, then the bare one; both must resolve identically.
// ---------------------------------------------------------------------------

const app = express();
app.use('/.well-known', wellKnownRouter);

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, RAILWAY_PUBLIC_DOMAIN: 'glass-fortress-backend-staging.up.railway.app' };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

const EXPECTED_BODY = {
  resource: 'https://glass-fortress-backend-staging.up.railway.app/api/mcp',
  authorization_servers: ['https://glass-fortress-backend-staging.up.railway.app/oauth'],
};

describe('GET /.well-known/oauth-protected-resource', () => {
  it('returns the resource and authorization_servers fields RFC 9728 requires', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EXPECTED_BODY);
  });
});

describe('GET /.well-known/oauth-protected-resource/api/mcp', () => {
  it('resolves to the identical document as the bare path', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource/api/mcp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EXPECTED_BODY);
  });
});

describe('RFC 8414 path-inserted AS metadata aliases', () => {
  // A real claude.ai connector requested exactly these, live, one step past
  // the protected-resource-metadata fix — oidc-provider only serves the
  // OIDC-Discovery-style /oauth/.well-known/<doc>, never the RFC 8414 form
  // with .well-known inserted before the issuer path.
  it('redirects /.well-known/oauth-authorization-server/oauth to the real document', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server/oauth');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/oauth/.well-known/oauth-authorization-server');
  });

  it('redirects /.well-known/openid-configuration/oauth to the real document', async () => {
    const res = await request(app).get('/.well-known/openid-configuration/oauth');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/oauth/.well-known/openid-configuration');
  });
});
