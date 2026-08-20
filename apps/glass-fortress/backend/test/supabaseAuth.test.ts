import { Request, Response } from 'express';

const mockGetUser = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
      admin: { deleteUser: mockDeleteUser },
    },
  })),
}));

import {
  requireSupabaseAuth,
  verifyAndConsumeReporterEmail,
  verifySupabaseUserId,
} from '../src/middleware/supabaseAuth';

function mockReqRes(authHeader?: string) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['SUPABASE_URL'] = 'https://project-ref.supabase.co';
  process.env['SUPABASE_ANON_KEY'] = 'test-anon-key';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
});

describe('verifySupabaseUserId (unchanged behavior after the getSupabaseUser refactor)', () => {
  it('returns the user id on a valid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null });
    await expect(verifySupabaseUserId('tok')).resolves.toBe('user-1');
  });

  it('returns null on an invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    await expect(verifySupabaseUserId('tok')).resolves.toBeNull();
  });
});

describe('requireSupabaseAuth', () => {
  it('401s with no Authorization header', async () => {
    const { req, res, next } = mockReqRes();
    await requireSupabaseAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches supabaseUserId and calls next on a valid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null });
    const { req, res, next } = mockReqRes('Bearer tok');
    await requireSupabaseAuth(req, res, next);
    expect(req.supabaseUserId).toBe('user-1');
    expect(next).toHaveBeenCalled();
  });
});

describe('verifyAndConsumeReporterEmail', () => {
  it('rejects with 401 and no Supabase call when the Authorization header is missing', async () => {
    const { req } = mockReqRes();
    const result = await verifyAndConsumeReporterEmail(req);
    expect(result).toEqual({ ok: false, status: 401, body: expect.objectContaining({ error: 'Unauthorized' }) });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('rejects with 401 on an invalid/expired token, without attempting deletion', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const { req } = mockReqRes('Bearer bad-tok');
    const result = await verifyAndConsumeReporterEmail(req);
    expect(result.ok).toBe(false);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes the Supabase account and resolves ok on success, exposing nothing about the reporter', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });

    const { req } = mockReqRes('Bearer good-tok');
    const result = await verifyAndConsumeReporterEmail(req);

    expect(mockDeleteUser).toHaveBeenCalledWith('reporter-1');
    // The success result carries no reporter data at all — not the email,
    // not the Supabase user id. Nothing downstream should be able to see
    // who reported once verification has happened.
    expect(result).toEqual({ ok: true });
    // ...and nothing was smuggled onto the request either.
    expect((req as unknown as { reporterEmail?: string }).reporterEmail).toBeUndefined();
  });

  it('fails closed (500) if account deletion errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: { message: 'delete failed' } });

    const { req } = mockReqRes('Bearer good-tok');
    const result = await verifyAndConsumeReporterEmail(req);

    expect(result).toEqual({ ok: false, status: 500, body: expect.anything() });
  });

  it('fails closed (500) if account deletion throws', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockRejectedValue(new Error('network error'));

    const { req } = mockReqRes('Bearer good-tok');
    const result = await verifyAndConsumeReporterEmail(req);

    expect(result).toEqual({ ok: false, status: 500, body: expect.anything() });
  });
});
