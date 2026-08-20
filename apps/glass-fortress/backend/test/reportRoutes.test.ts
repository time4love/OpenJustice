// ---------------------------------------------------------------------------
// Public report intake route tests.
// requireVerifiedReporterEmail itself is covered in supabaseAuth.test.ts —
// here it's mocked as a pass-through so these tests exercise validation and
// the Report/domain-row creation, not Supabase auth.
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';

jest.mock('../src/middleware/supabaseAuth', () => ({
  requireVerifiedReporterEmail: (req: Request, _res: Response, next: NextFunction) => {
    req.reporterVerified = true;
    next();
  },
}));

const mockReportCreate = jest.fn();
jest.mock('../src/lib/prisma', () => ({
  prisma: { report: { create: (...args: unknown[]) => mockReportCreate(...args) } },
}));

import request from 'supertest';
import express from 'express';
import { reportRouter } from '../src/routes/reportRoutes';

const app = express();
app.use(express.json());
app.use('/api/reports', reportRouter);

beforeEach(() => {
  jest.clearAllMocks();
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
      .send({ consentGiven: true, report: { impactCategory: 'MILITARY_DISCHARGE' } });

    expect(res.status).toBe(201);
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'SOCIAL_ECONOMIC',
        socialEconomicReport: {
          create: expect.objectContaining({ impactCategory: 'MILITARY_DISCHARGE' }),
        },
      }),
    });
  });

  it('rejects a submission without consentGiven', async () => {
    const res = await request(app)
      .post('/api/reports/social-economic')
      .send({ report: { impactCategory: 'MILITARY_DISCHARGE' } });
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
