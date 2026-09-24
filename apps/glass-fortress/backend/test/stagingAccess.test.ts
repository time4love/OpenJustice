import request from 'supertest';
import express from 'express';
import { KNOWN_ENVIRONMENTS } from '../src/lib/dbEnvironment';
import type { AppEnv } from '../src/lib/appEnv';
import { requireStagingAccess } from '../src/middleware/stagingAccess';
import { mintTextLink } from '../src/lib/documentTextLink';

function buildApp() {
  const app = express();
  app.use(requireStagingAccess);
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireStagingAccess', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('passes through untouched in production (APP_ENV unset)', async () => {
    delete process.env['APP_ENV'];
    delete process.env['STAGING_API_TOKEN'];
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(200);
  });

  it('passes through untouched in production even with a token set', async () => {
    process.env['APP_ENV'] = 'production';
    process.env['STAGING_API_TOKEN'] = 'some-token';
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(200);
  });

  it('returns 503 on staging when no token is configured', async () => {
    process.env['APP_ENV'] = 'staging';
    delete process.env['STAGING_API_TOKEN'];
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(503);
  });

  it('returns 401 on staging with no X-Staging-Token header', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['STAGING_API_TOKEN'] = 'correct-token';
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(401);
  });

  it('returns 401 on staging with the wrong token', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['STAGING_API_TOKEN'] = 'correct-token';
    const res = await request(buildApp()).get('/probe').set('X-Staging-Token', 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('returns 401 on staging for a token of different length', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['STAGING_API_TOKEN'] = 'correct-token';
    const res = await request(buildApp()).get('/probe').set('X-Staging-Token', 'short');
    expect(res.status).toBe(401);
  });

  it('passes through on staging with the correct token', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['STAGING_API_TOKEN'] = 'correct-token';
    const res = await request(buildApp()).get('/probe').set('X-Staging-Token', 'correct-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('does not collide with a caller-supplied Authorization header', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['STAGING_API_TOKEN'] = 'correct-token';
    const res = await request(buildApp())
      .get('/probe')
      .set('X-Staging-Token', 'correct-token')
      .set('Authorization', 'Bearer some-researcher-mcp-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// THE GATE USED TO FAIL OPEN.
//
// It applied only when `APP_ENV=staging`, and `APP_ENV` unset means production.
// So losing one variable on the staging deployment removed the gate silently and
// left the public Railway URL open — the exact hole this middleware exists to
// close. Absence is safe for a LABEL and unsafe for a GATE, and one variable was
// doing both jobs.
//
// Note what these cases do NOT assert: that an unrecognised database is gated.
// That would fail closed in the wrong direction — taking the production API down
// over a renamed Supabase project rather than over a real disagreement. The
// dangerous direction is "staging, unlabelled"; the harmless one is "production,
// unrecognised", and they are deliberately not treated alike.
// ---------------------------------------------------------------------------


// NO PROJECT REF IS WRITTEN DOWN HERE. `dbEnvironment` is the one place in the
// codebase that names the two projects; every extra literal copy is both a
// second source of truth and another ref committed to a public repository. These
// are read from it, and the vacuity guard below is what stops a lookup that
// silently finds nothing from turning the cases into passes that prove nothing.
function refFor(environment: AppEnv): string {
  const ref = Object.keys(KNOWN_ENVIRONMENTS).find((r) => KNOWN_ENVIRONMENTS[r] === environment);
  if (ref === undefined) throw new Error(`no known project ref for ${environment}`);
  return ref;
}

const pooler = (ref: string) =>
  `postgresql://postgres.${ref}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

const STAGING_DB = pooler(refFor('staging'));
const PRODUCTION_DB = pooler(refFor('production'));
const UNRECOGNISED_DB = pooler('abcdefghijklmnopqrst');

describe('the gate does not depend on a variable that can go missing', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('still gates staging when APP_ENV has been lost', async () => {
    // The whole finding, in one case. Unset APP_ENV reads as production, and
    // before this the request would have been served to anyone with the URL.
    delete process.env['APP_ENV'];
    process.env['DATABASE_URL'] = STAGING_DB;
    process.env['STAGING_API_TOKEN'] = 'correct-token';

    expect((await request(buildApp()).get('/probe')).status).toBe(401);
  });

  it('still fails closed when APP_ENV and the token are BOTH lost', async () => {
    // A deployment that cannot authenticate anyone must serve no one, rather
    // than serve everyone.
    delete process.env['APP_ENV'];
    delete process.env['STAGING_API_TOKEN'];
    process.env['DATABASE_URL'] = STAGING_DB;

    expect((await request(buildApp()).get('/probe')).status).toBe(503);
  });

  it('admits the correct token on a staging deployment that lost its label', async () => {
    // Fail-closed must not mean unusable: the gate is still a gate, not a wall.
    delete process.env['APP_ENV'];
    process.env['DATABASE_URL'] = STAGING_DB;
    process.env['STAGING_API_TOKEN'] = 'correct-token';

    const res = await request(buildApp()).get('/probe').set('X-Staging-Token', 'correct-token');
    expect(res.status).toBe(200);
  });

  it('does not gate production, where both voices agree', async () => {
    delete process.env['APP_ENV'];
    process.env['DATABASE_URL'] = PRODUCTION_DB;

    expect((await request(buildApp()).get('/probe')).status).toBe(200);
  });

  it('does not gate an unrecognised database — that direction is an outage, not a hole', async () => {
    delete process.env['APP_ENV'];
    process.env['DATABASE_URL'] = UNRECOGNISED_DB;

    expect((await request(buildApp()).get('/probe')).status).toBe(200);
  });

  it('gates a labelled staging deployment even against the production database', async () => {
    // Either voice saying staging is enough. Neither gets a veto over the other,
    // because a gate that needs unanimity to apply is a gate one variable opens.
    process.env['APP_ENV'] = 'staging';
    process.env['DATABASE_URL'] = PRODUCTION_DB;
    process.env['STAGING_API_TOKEN'] = 'correct-token';

    expect((await request(buildApp()).get('/probe')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// THE ONE EXEMPTION — RULED 2026-09-24 (the researcher, Q1 of R79's round 2): a VALID text-link signature passes the
// staging gate for `GET /api/documents/:commitment/content` ONLY — A5 :1504's SIGNED TEXT ARM, `read_document`'s
// `textUrl` — verified by `verifyTextLink`, the one verifier. A browser opening the link through the frontend's
// `/api` proxy carries no X-Staging-Token, so without this the link could never open on staging. Unsigned requests,
// and a signed query on every other path, still meet the gate.
// ---------------------------------------------------------------------------

describe('requireStagingAccess — the signed text link, and nothing else (A5 :1505 as ruled; Q1 2026-09-24)', () => {
  const ORIGINAL_ENV = process.env;
  const COMMITMENT = '0x' + 'c1'.repeat(32);
  const VERSION = '0x' + 'e1'.repeat(32);

  function gatedApp() {
    const app = express();
    app.use(requireStagingAccess);
    app.get('/api/documents/:commitment/content', (_req, res) => res.json({ served: true }));
    app.get('/api/documents/:commitment/bytes', (_req, res) => res.json({ served: true }));
    app.get('/probe', (_req, res) => res.json({ ok: true }));
    return app;
  }

  /** The path and query of a link `read_document` minted — as the browser sends it. */
  const signed = (commitment = COMMITMENT) => {
    const url = new URL(mintTextLink(commitment, VERSION).url);
    return { path: url.pathname, search: url.search };
  };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, APP_ENV: 'staging', STAGING_API_TOKEN: 'correct-token', TOKEN_HMAC_SECRET: 'token-hmac-secret-for-tests', FRONTEND_URL: 'https://gf.test' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('a SIGNED text link passes on staging with no X-Staging-Token', async () => {
    const { path, search } = signed();
    expect((await request(gatedApp()).get(path + search)).status).toBe(200);
  });

  it('the same path UNSIGNED meets the gate — 401', async () => {
    expect((await request(gatedApp()).get(`/api/documents/${COMMITMENT}/content`)).status).toBe(401);
  });

  it('a TAMPERED or EXPIRED signature meets the gate — the one verifier decides', async () => {
    const { path, search } = signed();
    const tampered = search.replace(/sig=[0-9a-f]{64}/, `sig=${'0'.repeat(64)}`);
    expect((await request(gatedApp()).get(path + tampered)).status).toBe(401);
    const expired = search.replace(/expires=\d+/, 'expires=1');
    expect((await request(gatedApp()).get(path + expired)).status).toBe(401);
  });

  it('a signed query on ANOTHER path meets the gate — /bytes and /probe, each 401', async () => {
    const { search } = signed();
    expect((await request(gatedApp()).get(`/api/documents/${COMMITMENT}/bytes${search}`)).status).toBe(401);
    expect((await request(gatedApp()).get(`/probe${search}`)).status).toBe(401);
  });

  it('a link signed for ANOTHER document does not open this one — 401', async () => {
    const { search } = signed('0x' + 'c2'.repeat(32));
    expect((await request(gatedApp()).get(`/api/documents/${COMMITMENT}/content${search}`)).status).toBe(401);
  });
});
