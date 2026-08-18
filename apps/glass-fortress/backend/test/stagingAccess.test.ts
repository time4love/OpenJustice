import request from 'supertest';
import express from 'express';
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
