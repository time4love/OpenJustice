jest.mock('../src/oauth/oidcProvider', () => ({
  oidcProvider: {
    interactionDetails: jest.fn(),
    interactionFinished: jest.fn().mockImplementation(async (_req, res) => {
      res.status(200).json({ mockFinished: true });
    }),
    Client: { find: jest.fn() },
    Grant: Object.assign(
      jest.fn().mockImplementation((props: unknown) => ({
        __props: props,
        addOIDCScope: jest.fn(),
        addResourceScope: jest.fn(),
        save: jest.fn().mockResolvedValue('new-grant-id'),
      })),
      { find: jest.fn() },
    ),
  },
}));

jest.mock('../src/middleware/supabaseAuth', () => ({
  verifySupabaseUserId: jest.fn(),
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researcher: { findUnique: jest.fn() },
  },
}));

import request from 'supertest';
import express from 'express';
import { oidcProvider } from '../src/oauth/oidcProvider';
import { verifySupabaseUserId } from '../src/middleware/supabaseAuth';
import { prisma } from '../src/lib/prisma';
import { oauthInteractionRouter } from '../src/routes/oauthInteractionRoutes';

// ---------------------------------------------------------------------------
// The login/consent bridge (docs/gf-mcp-oauth-dev-plan.md, Phase 3). oidc-
// provider itself is mocked (see mcpRoutes.test.ts for the same pattern with
// a different ESM-only dependency) — these tests verify OUR translation
// layer: which InteractionResults get built for which researcher state, not
// oidc-provider's own internals.
// ---------------------------------------------------------------------------

const app = express();
app.use('/oauth/interaction', oauthInteractionRouter);

const mockInteractionDetails = oidcProvider.interactionDetails as jest.Mock;
const mockInteractionFinished = oidcProvider.interactionFinished as jest.Mock;
const mockClientFind = oidcProvider.Client.find as jest.Mock;
const mockGrantFind = oidcProvider.Grant.find as jest.Mock;
const mockVerifySupabaseUserId = verifySupabaseUserId as jest.Mock;
const mockResearcherFindUnique = prisma.researcher.findUnique as jest.Mock;

const APPROVED_RESEARCHER = { id: 'r-1', supabaseUserId: 'sb-1', approved: true };

describe('GET /oauth/interaction/:uid', () => {
  it('returns prompt/client/scopes for a live interaction', async () => {
    mockInteractionDetails.mockResolvedValueOnce({
      uid: 'int-1',
      prompt: { name: 'consent', details: {} },
      params: { client_id: 'client-1', scope: 'mcp:write offline_access' },
    });
    mockClientFind.mockResolvedValueOnce({ clientId: 'client-1', clientName: 'Test Client' });

    const res = await request(app).get('/oauth/interaction/int-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uid: 'int-1',
      promptName: 'consent',
      client: { clientId: 'client-1', clientName: 'Test Client' },
      scopes: ['mcp:write', 'offline_access'],
    });
  });

  it('returns 410 when the interaction has expired or is unknown', async () => {
    mockInteractionDetails.mockRejectedValueOnce(new Error('session not found'));
    const res = await request(app).get('/oauth/interaction/gone');
    expect(res.status).toBe(410);
  });
});

describe('POST /oauth/interaction/:uid/login', () => {
  it('redirects with loginError when no accessToken is submitted', async () => {
    const res = await request(app).post('/oauth/interaction/int-1/login').type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('loginError=missing_token');
    expect(mockInteractionFinished).not.toHaveBeenCalled();
  });

  it('redirects with loginError=missing_token for a truly bodyless POST, not a 500', async () => {
    // No .type()/.send() — no Content-Type at all, so urlencoded() leaves
    // req.body as undefined rather than {}. Destructuring without a
    // fallback used to throw here.
    const res = await request(app).post('/oauth/interaction/int-1/login');
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('loginError=missing_token');
  });

  it('redirects with loginError=invalid_token for a bad Supabase token', async () => {
    mockVerifySupabaseUserId.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/oauth/interaction/int-1/login')
      .type('form')
      .send({ accessToken: 'bad' });
    expect(res.headers.location).toContain('loginError=invalid_token');
  });

  it('degrades an unexpected verifySupabaseUserId throw to loginError=invalid_token, not a 500', async () => {
    mockVerifySupabaseUserId.mockRejectedValueOnce(new Error('Supabase client init failed'));
    const res = await request(app)
      .post('/oauth/interaction/int-1/login')
      .type('form')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('loginError=invalid_token');
  });

  it('redirects with loginError=no_account when no Researcher exists yet', async () => {
    mockVerifySupabaseUserId.mockResolvedValueOnce('sb-1');
    mockResearcherFindUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/oauth/interaction/int-1/login')
      .type('form')
      .send({ accessToken: 'tok' });
    expect(res.headers.location).toContain('loginError=no_account');
  });

  it('redirects with loginError=not_approved without ending the interaction', async () => {
    mockVerifySupabaseUserId.mockResolvedValueOnce('sb-1');
    mockResearcherFindUnique.mockResolvedValueOnce({ ...APPROVED_RESEARCHER, approved: false });
    const res = await request(app)
      .post('/oauth/interaction/int-1/login')
      .type('form')
      .send({ accessToken: 'tok' });
    expect(res.headers.location).toContain('loginError=not_approved');
    expect(mockInteractionFinished).not.toHaveBeenCalled();
  });

  it('finishes the login prompt for an approved researcher', async () => {
    mockVerifySupabaseUserId.mockResolvedValueOnce('sb-1');
    mockResearcherFindUnique.mockResolvedValueOnce(APPROVED_RESEARCHER);

    await request(app).post('/oauth/interaction/int-1/login').type('form').send({ accessToken: 'tok' });

    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { login: { accountId: 'r-1' } },
      { mergeWithLastSubmission: false },
    );
  });
});

describe('POST /oauth/interaction/:uid/confirm', () => {
  beforeEach(() => {
    mockVerifySupabaseUserId.mockResolvedValue('sb-1');
    mockResearcherFindUnique.mockResolvedValue(APPROVED_RESEARCHER);
  });

  it('aborts with access_denied when the decision is not allow', async () => {
    await request(app)
      .post('/oauth/interaction/int-1/confirm')
      .type('form')
      .send({ accessToken: 'tok', decision: 'deny' });

    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { error: 'access_denied', error_description: 'End-User denied access' },
      { mergeWithLastSubmission: false },
    );
  });

  it('builds a new grant, adds missing scopes, and finishes with the new grantId', async () => {
    mockInteractionDetails.mockResolvedValueOnce({
      params: { client_id: 'client-1' },
      grantId: undefined,
      prompt: { details: { missingOIDCScope: ['mcp:write', 'offline_access'] } },
    });

    await request(app)
      .post('/oauth/interaction/int-1/confirm')
      .type('form')
      .send({ accessToken: 'tok', decision: 'allow' });

    expect(oidcProvider.Grant).toHaveBeenCalledWith({ accountId: 'r-1', clientId: 'client-1' });
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: { grantId: 'new-grant-id' } },
      { mergeWithLastSubmission: true },
    );
  });

  it('reuses an existing grant without re-passing its grantId', async () => {
    const existingGrant = {
      addOIDCScope: jest.fn(),
      addResourceScope: jest.fn(),
      save: jest.fn().mockResolvedValue('existing-grant-id'),
    };
    mockGrantFind.mockResolvedValueOnce(existingGrant);
    mockInteractionDetails.mockResolvedValueOnce({
      params: { client_id: 'client-1' },
      grantId: 'existing-grant-id',
      prompt: { details: {} },
    });

    await request(app)
      .post('/oauth/interaction/int-1/confirm')
      .type('form')
      .send({ accessToken: 'tok', decision: 'allow' });

    expect(mockGrantFind).toHaveBeenCalledWith('existing-grant-id');
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: {} },
      { mergeWithLastSubmission: true },
    );
  });

  it('re-verifies approval at confirm time, not just at login time', async () => {
    mockResearcherFindUnique.mockReset().mockResolvedValueOnce({ ...APPROVED_RESEARCHER, approved: false });

    const res = await request(app)
      .post('/oauth/interaction/int-1/confirm')
      .type('form')
      .send({ accessToken: 'tok', decision: 'allow' });

    expect(res.headers.location).toContain('loginError=not_approved');
    expect(mockInteractionFinished).not.toHaveBeenCalled();
  });
});
