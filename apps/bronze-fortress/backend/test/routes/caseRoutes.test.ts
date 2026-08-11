import request from 'supertest';
import { CooperationLevel, PatternCategory, PoliceCaseStatus, NzakutOrderType } from '../../src/generated/prisma';

const mockGetUser = jest.fn();
const mockAllegationFindMany = jest.fn();
const mockAllegationService = {
  getPatternCountsByFigure: jest.fn(),
};
const mockVaultService = {
  getCaseByMember: jest.fn(),
  getCase: jest.fn(),
  createCase: jest.fn(),
  storeEncryptedIntake: jest.fn(),
  setCourt: jest.fn(),
};
const mockConsentService = {
  getActiveConsents: jest.fn(),
  grantConsent: jest.fn(),
  revokeConsent: jest.fn(),
};
const mockIntakeService = {
  addCriminalComplaint: jest.fn(),
  listCriminalComplaints: jest.fn(),
  addNzakutOrder: jest.fn(),
  listNzakutOrders: jest.fn(),
  countCriminalComplaints: jest.fn(),
  countNzakutOrders: jest.fn(),
  addWelfareReport: jest.fn(),
  listWelfareReports: jest.fn(),
  countWelfareReports: jest.fn(),
  addEvaluatorSession: jest.fn(),
  listEvaluatorSessions: jest.fn(),
  countEvaluatorSessions: jest.fn(),
  addGuardianContact: jest.fn(),
  listGuardianContacts: jest.fn(),
  countGuardianContacts: jest.fn(),
};

jest.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: { auth: { getUser: mockGetUser } },
}));

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    allegation: { findMany: mockAllegationFindMany },
    court: { findUnique: jest.fn() },
    case: { findUnique: jest.fn() },
  },
}));

jest.mock('../../src/services/AllegationService', () => ({
  AllegationService: jest.fn().mockImplementation(() => mockAllegationService),
}));

jest.mock('../../src/services/CaseVaultService', () => ({
  CaseVaultService: jest.fn().mockImplementation(() => mockVaultService),
}));

jest.mock('../../src/services/ConsentService', () => ({
  ConsentService: jest.fn().mockImplementation(() => mockConsentService),
}));

jest.mock('../../src/services/StructuredIntakeService', () => ({
  StructuredIntakeService: jest.fn().mockImplementation(() => mockIntakeService),
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
    });
    mockConsentService.getActiveConsents.mockResolvedValue([
      { tier: CooperationLevel.ANONYMOUS_TIMELINE, grantedAt: new Date('2026-01-01') },
    ]);
    mockIntakeService.countCriminalComplaints.mockResolvedValue(1);
    mockIntakeService.countNzakutOrders.mockResolvedValue(0);
    mockIntakeService.countWelfareReports.mockResolvedValue(0);
    mockIntakeService.countEvaluatorSessions.mockResolvedValue(0);
    mockIntakeService.countGuardianContacts.mockResolvedValue(0);

    const res = await request(app).get('/api/cases/me').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.caseId).toBe(CASE_ID);
    expect(res.body.hasIntakeData).toBe(true);
    expect(res.body.activeConsents).toHaveLength(1);
  });

  it('returns hasIntakeData=false when no intake records exist', async () => {
    mockVaultService.getCase.mockResolvedValue({
      id: CASE_ID,
      cooperationLevel: CooperationLevel.NONE,
      publicKeyHex: '0xabc',
    });
    mockConsentService.getActiveConsents.mockResolvedValue([]);
    mockIntakeService.countCriminalComplaints.mockResolvedValue(0);
    mockIntakeService.countNzakutOrders.mockResolvedValue(0);
    mockIntakeService.countWelfareReports.mockResolvedValue(0);
    mockIntakeService.countEvaluatorSessions.mockResolvedValue(0);
    mockIntakeService.countGuardianContacts.mockResolvedValue(0);

    const res = await request(app).get('/api/cases/me').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.hasIntakeData).toBe(false);
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

describe('POST /api/cases/me/complaints', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  const validBody = {
    policeStatus: PoliceCaseStatus.CLOSED_CLEARED,
    closureConsideredByCourt: false,
    custodyChangedAfterClosure: 'worsened',
  };

  it('creates a complaint and returns 201', async () => {
    const created = { id: 'cmp-1', caseId: CASE_ID, ...validBody };
    mockIntakeService.addCriminalComplaint.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/cases/me/complaints')
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('cmp-1');
    expect(mockIntakeService.addCriminalComplaint).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ policeStatus: PoliceCaseStatus.CLOSED_CLEARED }),
    );
  });

  it('returns 400 for missing policeStatus', async () => {
    const res = await request(app)
      .post('/api/cases/me/complaints')
      .set(authHeaders())
      .send({ closureConsideredByCourt: true });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid custodyChangedAfterClosure value', async () => {
    const res = await request(app)
      .post('/api/cases/me/complaints')
      .set(authHeaders())
      .send({ policeStatus: PoliceCaseStatus.OPEN, custodyChangedAfterClosure: 'exploded' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/cases/me/complaints', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  it('returns complaints list', async () => {
    const records = [{ id: 'cmp-1' }, { id: 'cmp-2' }];
    mockIntakeService.listCriminalComplaints.mockResolvedValue(records);

    const res = await request(app).get('/api/cases/me/complaints').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.complaints).toHaveLength(2);
    expect(mockIntakeService.listCriminalComplaints).toHaveBeenCalledWith(CASE_ID);
  });
});

describe('POST /api/cases/me/nzakut', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  const validBody = {
    orderType: NzakutOrderType.EMERGENCY,
    evidentiaryHearingHeld: false,
    daysWithoutMeritsHearing: 420,
    childrenLocation: 'other_parent',
  };

  it('creates a nzakut order and returns 201', async () => {
    const created = { id: 'nz-1', caseId: CASE_ID, ...validBody };
    mockIntakeService.addNzakutOrder.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/cases/me/nzakut')
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('nz-1');
    expect(mockIntakeService.addNzakutOrder).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false }),
    );
  });

  it('returns 400 when evidentiaryHearingHeld is missing', async () => {
    const res = await request(app)
      .post('/api/cases/me/nzakut')
      .set(authHeaders())
      .send({ orderType: NzakutOrderType.STANDARD });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid childrenLocation value', async () => {
    const res = await request(app)
      .post('/api/cases/me/nzakut')
      .set(authHeaders())
      .send({ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false, childrenLocation: 'spaceship' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/cases/me/nzakut', () => {
  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  it('returns nzakut orders list', async () => {
    const records = [{ id: 'nz-1' }];
    mockIntakeService.listNzakutOrders.mockResolvedValue(records);

    const res = await request(app).get('/api/cases/me/nzakut').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(mockIntakeService.listNzakutOrders).toHaveBeenCalledWith(CASE_ID);
  });
});

describe('GET /api/cases/me/allegations', () => {
  const FIGURE_ID = 'fig-1';
  const COURT_NAME = 'בית המשפט לענייני משפחה בירושלים';

  const allegation = {
    figureId: FIGURE_ID,
    patternCategory: PatternCategory.EX_PARTE_HEARING,
    onChainTxHash: null,
    createdAt: new Date('2024-01-01'),
    figure: { id: FIGURE_ID, name: 'שופטת בדיקה', type: 'JUDGE' },
    court: { name: COURT_NAME, city: 'ירושלים' },
  };

  beforeEach(() => {
    validUser();
    mockVaultService.getCaseByMember.mockResolvedValue({ id: CASE_ID });
  });

  it('returns figures grouped with patterns and otherCasesCount', async () => {
    mockAllegationFindMany.mockResolvedValue([allegation]);
    mockAllegationService.getPatternCountsByFigure.mockResolvedValue(
      new Map([[`${FIGURE_ID}:${PatternCategory.EX_PARTE_HEARING}`, 4]]),
    );

    const res = await request(app).get('/api/cases/me/allegations').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.figures).toHaveLength(1);
    const fig = res.body.figures[0];
    expect(fig.figureId).toBe(FIGURE_ID);
    expect(fig.figureName).toBe('שופטת בדיקה');
    expect(fig.patterns).toHaveLength(1);
    expect(fig.patterns[0].patternCategory).toBe(PatternCategory.EX_PARTE_HEARING);
    expect(fig.patterns[0].otherCasesCount).toBe(3);
  });

  it('returns otherCasesCount of 0 when this case is the only one', async () => {
    mockAllegationFindMany.mockResolvedValue([allegation]);
    mockAllegationService.getPatternCountsByFigure.mockResolvedValue(
      new Map([[`${FIGURE_ID}:${PatternCategory.EX_PARTE_HEARING}`, 1]]),
    );

    const res = await request(app).get('/api/cases/me/allegations').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.figures[0].patterns[0].otherCasesCount).toBe(0);
  });

  it('returns empty figures array when no allegations exist', async () => {
    mockAllegationFindMany.mockResolvedValue([]);
    mockAllegationService.getPatternCountsByFigure.mockResolvedValue(new Map());

    const res = await request(app).get('/api/cases/me/allegations').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.figures).toHaveLength(0);
  });

  it('groups multiple patterns under the same figure', async () => {
    const allegation2 = {
      ...allegation,
      patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS,
    };
    mockAllegationFindMany.mockResolvedValue([allegation, allegation2]);
    mockAllegationService.getPatternCountsByFigure.mockResolvedValue(
      new Map([
        [`${FIGURE_ID}:${PatternCategory.EX_PARTE_HEARING}`, 2],
        [`${FIGURE_ID}:${PatternCategory.SYSTEMIC_HEARING_DELAYS}`, 7],
      ]),
    );

    const res = await request(app).get('/api/cases/me/allegations').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.figures).toHaveLength(1);
    expect(res.body.figures[0].patterns).toHaveLength(2);
    const patterns = res.body.figures[0].patterns;
    expect(patterns.find((p: { patternCategory: string; otherCasesCount: number }) => p.patternCategory === PatternCategory.SYSTEMIC_HEARING_DELAYS).otherCasesCount).toBe(6);
  });
});
