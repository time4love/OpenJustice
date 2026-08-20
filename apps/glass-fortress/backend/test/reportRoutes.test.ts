// ---------------------------------------------------------------------------
// Public report intake route tests.
// verifyAndConsumeReporterEmail itself is covered in supabaseAuth.test.ts —
// here it's mocked so these tests exercise validation and the Report/
// domain-row creation, not Supabase auth. The mock is a jest.fn (not a bare
// stub) specifically so the ordering guarantee can be asserted: verification
// is destructive and one-shot, so an invalid body must be rejected without
// it ever being called.
// ---------------------------------------------------------------------------

const mockVerifyReporter = jest.fn();
jest.mock('../src/middleware/supabaseAuth', () => ({
  verifyAndConsumeReporterEmail: (...args: unknown[]) => mockVerifyReporter(...args),
}));

const mockReportCreate = jest.fn();
const mockQueryRaw = jest.fn();
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    report: { create: (...args: unknown[]) => mockReportCreate(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import request from 'supertest';
import express from 'express';
import { reportRouter } from '../src/routes/reportRoutes';

const app = express();
app.use(express.json());
app.use('/api/reports', reportRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyReporter.mockResolvedValue({ ok: true });
});

describe('POST /api/reports/medical', () => {
  const validBody = {
    consentGiven: true,
    report: { symptomCategory: 'CARDIOVASCULAR' },
  };

  it('rejects a submission without consentGiven', async () => {
    const res = await request(app)
      .post('/api/reports/medical')
      .send({ report: { symptomCategory: 'CARDIOVASCULAR' } });
    expect(res.status).toBe(400);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('rejects consentGiven: false explicitly, not just missing', async () => {
    const res = await request(app)
      .post('/api/reports/medical')
      .send({ consentGiven: false, report: { symptomCategory: 'CARDIOVASCULAR' } });
    expect(res.status).toBe(400);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('rejects ONCOLOGIC without cancerType (superRefine enforcement reaches the route)', async () => {
    const res = await request(app)
      .post('/api/reports/medical')
      .send({ consentGiven: true, report: { symptomCategory: 'ONCOLOGIC' } });
    expect(res.status).toBe(400);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('creates a report with default UNKNOWN demographics when not provided', async () => {
    mockReportCreate.mockResolvedValue({ id: 'report-1' });

    const res = await request(app).post('/api/reports/medical').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'report-1' });
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'MEDICAL',
        consentGiven: true,
        reporterAgeRange: 'UNKNOWN',
        reporterGender: 'UNKNOWN',
        medicalReport: { create: expect.objectContaining({ symptomCategory: 'CARDIOVASCULAR' }) },
      }),
    });
  });

  it('passes through explicit demographics when provided', async () => {
    mockReportCreate.mockResolvedValue({ id: 'report-2' });

    const res = await request(app)
      .post('/api/reports/medical')
      .send({ ...validBody, reporterAgeRange: 'AGE_18_29', reporterGender: 'FEMALE' });

    expect(res.status).toBe(201);
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterAgeRange: 'AGE_18_29', reporterGender: 'FEMALE' }),
    });
  });

  it('rejects an invalid body WITHOUT consuming the reporter verification', async () => {
    // Order is load-bearing, not incidental: verifyAndConsumeReporterEmail
    // deletes the reporter's Supabase account, so calling it before the body
    // is known-good would spend their single magic-link on a submission the
    // schema then rejects — leaving them to redo the whole email round trip
    // to fix one field. See reportRoutes.ts's header comment.
    const res = await request(app)
      .post('/api/reports/medical')
      .send({ consentGiven: true, report: { symptomCategory: 'NOT_A_REAL_CATEGORY' } });
    expect(res.status).toBe(400);
    expect(mockVerifyReporter).not.toHaveBeenCalled();
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('propagates a failed verification and creates nothing', async () => {
    mockVerifyReporter.mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Unauthorized', message: 'Invalid or expired verification token' },
    });
    const res = await request(app).post('/api/reports/medical').send(validBody);
    expect(res.status).toBe(401);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('500s if report creation fails', async () => {
    mockReportCreate.mockRejectedValue(new Error('db error'));
    const res = await request(app).post('/api/reports/medical').send(validBody);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/reports/social-economic', () => {
  it('creates a report on a valid submission', async () => {
    mockReportCreate.mockResolvedValue({ id: 'report-3' });

    const res = await request(app)
      .post('/api/reports/social-economic')
      .send({
        consentGiven: true,
        report: {
          impactCategory: 'MILITARY_DISCHARGE',
          vaccinationStatus: 'NOT_RECEIVED',
          remedyPursued: 'NONE',
        },
      });

    expect(res.status).toBe(201);
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'SOCIAL_ECONOMIC',
        socialEconomicReport: {
          create: expect.objectContaining({
            impactCategory: 'MILITARY_DISCHARGE',
            // Must reach the database, not merely pass validation — this is
            // the field the whole row's interpretation depends on.
            vaccinationStatus: 'NOT_RECEIVED',
          }),
        },
      }),
    });
  });

  it('rejects a social report with no vaccinationStatus, without consuming verification', async () => {
    // Refusal-side and vaccination-side harm are opposite claims that produce
    // identical rows without this field, so the route must refuse rather than
    // store an ambiguous report. And it must refuse at validation time, before
    // the one-shot magic link is spent.
    const res = await request(app)
      .post('/api/reports/social-economic')
      .send({ consentGiven: true, report: { impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE' } });
    expect(res.status).toBe(400);
    expect(mockVerifyReporter).not.toHaveBeenCalled();
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('rejects a submission without consentGiven', async () => {
    const res = await request(app)
      .post('/api/reports/social-economic')
      .send({ report: { impactCategory: 'MILITARY_DISCHARGE', vaccinationStatus: 'NOT_RECEIVED' } });
    expect(res.status).toBe(400);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  it('rejects an unknown impactCategory value', async () => {
    const res = await request(app)
      .post('/api/reports/social-economic')
      .send({ consentGiven: true, report: { impactCategory: 'NOT_REAL' } });
    expect(res.status).toBe(400);
    expect(mockReportCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/reports/medical/aggregate', () => {
  it('is public — no reporter-verification gate', async () => {
    mockQueryRaw.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/reports/medical/aggregate')
      .send({ dimensions: ['symptomCategory'] });
    expect(res.status).toBe(200);
  });

  it('rejects an empty dimensions array', async () => {
    const res = await request(app).post('/api/reports/medical/aggregate').send({ dimensions: [] });
    expect(res.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('rejects more than 3 dimensions', async () => {
    const res = await request(app)
      .post('/api/reports/medical/aggregate')
      .send({
        dimensions: ['symptomCategory', 'seriousness', 'onsetWindow', 'vaccineManufacturer'],
      });
    expect(res.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('rejects a dimension name not in the Medical allowlist', async () => {
    const res = await request(app)
      .post('/api/reports/medical/aggregate')
      .send({ dimensions: ['impactCategory'] }); // a SocialEconomic-only dimension
    expect(res.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns suppressed cells from the service as-is', async () => {
    mockQueryRaw.mockResolvedValue([{ d0: 'ONCOLOGIC', count: 3, g0: 0 }]);
    const res = await request(app)
      .post('/api/reports/medical/aggregate')
      .send({ dimensions: ['symptomCategory'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cells: [{ dimensions: { symptomCategory: 'ONCOLOGIC' }, count: null }],
    });
  });
});

describe('POST /api/reports/social-economic/aggregate', () => {
  it('is public and accepts SocialEconomic-only dimensions', async () => {
    mockQueryRaw.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/reports/social-economic/aggregate')
      .send({ dimensions: ['impactCategory', 'formalBasisAsserted'] });
    expect(res.status).toBe(200);
  });

  it('rejects a Medical-only dimension', async () => {
    const res = await request(app)
      .post('/api/reports/social-economic/aggregate')
      .send({ dimensions: ['symptomCategory'] });
    expect(res.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
