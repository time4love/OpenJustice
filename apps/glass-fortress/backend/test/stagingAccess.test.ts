import request from 'supertest';
import express from 'express';
import { KNOWN_ENVIRONMENTS } from '../src/lib/dbEnvironment';
import type { AppEnv } from '../src/lib/appEnv';
import { requireStagingAccess } from '../src/middleware/stagingAccess';

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
