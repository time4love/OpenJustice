import request from 'supertest';
import { CooperationLevel } from '../../src/generated/prisma';

const mockGetUser = jest.fn();
const mockVaultService = {
  getCaseByMember: jest.fn(),
  getCase: jest.fn(),
  createCase: jest.fn(),
  storeEncryptedIntake: jest.fn(),
};
const mockConsentService = {
  getActiveConsents: jest.fn(),
  grantConsent: jest.fn(),
  revokeConsent: jest.fn(),
};

jest.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: { auth: { getUser: mockGetUser } },
}));

jest.mock('../../src/services/CaseVaultService', () => ({
  CaseVaultService: jest.fn().mockImplementation(() => mockVaultService),
}));

jest.mock('../../src/services/ConsentService', () => ({
  ConsentService: jest.fn().mockImplementation(() => mockConsentService),
}));

jest.mock('../../src/lib/web3', () => ({ getWeb3Service: jest.fn().mockReturnValue(null) }));

import { app } from '../../src/server';

const VALID_TOKEN = 'valid-jwt';
const USER_ID = 'supabase-user-1';
const CASE_ID = 'case-1';

function authHeaders(token = VALID_TOKEN) {
  return { Authorization: `Bearer ${token}` };
}

function validUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/cases', () => {
  it('creates a case vault for an authenticated user', async () => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue(null);
    mockVaultService.createCase.mockResolvedValue({
      id: CASE_ID,
      cooperationLevel: CooperationLevel.NONE,
    });

    const res = await request(app)
      .post('/api/cases')
      .set(authHeaders())
      .send({ publicKeyHex: '0xabc123' });

    expect(res.status).toBe(201);
    expect(res.body.caseId).toBe(CASE_ID);
    expect(mockVaultService.createCase).toHaveBeenCalledWith({
      publicKeyHex: '0xabc123',
      supabaseUserId: USER_ID,
    });
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/cases').send({ publicKeyHex: '0xabc' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const res = await request(app)
      .post('/api/cases')
      .set(authHeaders('bad-token'))
      .send({ publicKeyHex: '0xabc' });
    expect(res.status).toBe(401);
  });

  it('returns 409 when case already exists for user', async () => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });

    const res = await request(app)
      .post('/api/cases')
      .set(authHeaders())
      .send({ publicKeyHex: '0xabc' });

    expect(res.status).toBe(409);
    expect(mockVaultService.createCase).not.toHaveBeenCalled();
  });

  it('returns 400 when publicKeyHex is missing', async () => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue(null);

    const res = await request(app).post('/api/cases').set(authHeaders()).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/cases/me', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  it('returns case profile and active consents', async () => {
    mockVaultService.getCase.mockResolvedValue({
      id: CASE_ID,
      cooperationLevel: CooperationLevel.ANONYMOUS_TIMELINE,
      publicKeyHex: '0xabc',
      encryptedIntakeData: 'ciphertext',
    });
    mockConsentService.getActiveConsents.mockResolvedValue([
      { tier: CooperationLevel.ANONYMOUS_TIMELINE, grantedAt: new Date('2026-01-01') },
    ]);

    const res = await request(app).get('/api/cases/me').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.caseId).toBe(CASE_ID);
    expect(res.body.hasIntakeData).toBe(true);
    expect(res.body.activeConsents).toHaveLength(1);
  });

  it('returns 403 when user has no case vault', async () => {
    mockVaultService.getCaseByMember.mockResolvedValue(null);

    const res = await request(app).get('/api/cases/me').set(authHeaders());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/cases/me/intake', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
    mockVaultService.storeEncryptedIntake.mockResolvedValue({});
  });

  it('stores encrypted intake data', async () => {
    const res = await request(app)
      .post('/api/cases/me/intake')
      .set(authHeaders())
      .send({ encryptedIntakeData: 'encrypted-json-blob' });

    expect(res.status).toBe(200);
    expect(mockVaultService.storeEncryptedIntake).toHaveBeenCalledWith({
      caseId: CASE_ID,
      encryptedIntakeData: 'encrypted-json-blob',
    });
  });

  it('returns 400 when encryptedIntakeData is missing', async () => {
    const res = await request(app)
      .post('/api/cases/me/intake')
      .set(authHeaders())
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/cases/me/consent', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  it('grants a cooperation tier', async () => {
    mockConsentService.grantConsent.mockResolvedValue({
      id: 'cr-1',
      tier: CooperationLevel.ANONYMOUS_TIMELINE,
      grantedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/cases/me/consent')
      .set(authHeaders())
      .send({ tier: CooperationLevel.ANONYMOUS_TIMELINE });

    expect(res.status).toBe(201);
    expect(res.body.tier).toBe(CooperationLevel.ANONYMOUS_TIMELINE);
  });

  it('rejects NONE tier', async () => {
    const res = await request(app)
      .post('/api/cases/me/consent')
      .set(authHeaders())
      .send({ tier: CooperationLevel.NONE });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/cases/me/consent/:tier', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
    mockConsentService.revokeConsent.mockResolvedValue(undefined);
  });

  it('revokes a cooperation tier', async () => {
    const res = await request(app)
      .delete(`/api/cases/me/consent/${CooperationLevel.ANONYMOUS_TIMELINE}`)
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(mockConsentService.revokeConsent).toHaveBeenCalledWith(
      CASE_ID,
      CooperationLevel.ANONYMOUS_TIMELINE,
    );
  });

  it('returns 400 for invalid tier', async () => {
    const res = await request(app)
      .delete('/api/cases/me/consent/INVALID_TIER')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });
});
