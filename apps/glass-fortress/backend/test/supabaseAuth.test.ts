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
  requireVerifiedReporterEmail,
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

describe('requireVerifiedReporterEmail', () => {
  it('401s with no Authorization header, without touching Supabase', async () => {
    const { req, res, next } = mockReqRes();
    await requireVerifiedReporterEmail(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('401s on an invalid/expired token, without attempting deletion', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const { req, res, next } = mockReqRes('Bearer bad-tok');
    await requireVerifiedReporterEmail(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deletes the Supabase account, sets reporterVerified, and calls next on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });

    const { req, res, next } = mockReqRes('Bearer good-tok');
    await requireVerifiedReporterEmail(req, res, next);

    expect(mockDeleteUser).toHaveBeenCalledWith('reporter-1');
    expect(req.reporterVerified).toBe(true);
    // The email must never be attached to the request — nothing downstream
    // should be able to see it once verification has happened.
    expect((req as unknown as { reporterEmail?: string }).reporterEmail).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('fails closed (500, does not call next) if account deletion errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: { message: 'delete failed' } });

    const { req, res, next } = mockReqRes('Bearer good-tok');
    await requireVerifiedReporterEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed (500, does not call next) if account deletion throws', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'reporter-1', email: 'reporter@example.com' } },
      error: null,
    });
    mockDeleteUser.mockRejectedValue(new Error('network error'));

    const { req, res, next } = mockReqRes('Bearer good-tok');
    await requireVerifiedReporterEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
