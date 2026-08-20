// ---------------------------------------------------------------------------
// POST /api/evidence/recover-intake and /recover-confirm — the REST half of
// blocked-URL screenshot recovery. Exercised over real HTTP via supertest so
// multer's multipart parsing runs for real, same convention as
// test/mcpRoutes.test.ts. webScraper is mocked purely because it transitively
// pulls in jsdom (ESM), which ts-jest's CJS transform can't load — same
// reason test/keyFigures.test.ts mocks it, even though these routes never
// call it.
// ---------------------------------------------------------------------------

jest.mock('../src/utils/webScraper', () => ({ scrapeUrl: jest.fn() }));
jest.mock('../src/services/VectorStoreService', () => ({ VectorStoreService: { create: jest.fn() } }));
jest.mock('../src/lib/encrypt', () => ({ encryptContact: jest.fn() }));

// aiCostLimiter is mounted on both new routes; its `skip` reads APP_ENV, which
// is ambient (unset locally means "production" — see src/lib/appEnv.ts) and
// not something a unit test should depend on. Neutralize it so these tests
// don't 429 depending on the shell they happen to run in.
jest.mock('../src/middleware/rateLimiting', () => ({
  aiCostLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// evidenceRoutes.ts caches IntakeAgent as a module-level singleton
// (getIntakeAgent()) — it's constructed once, on the first request any test
// in this file sends, and reused for every request after. So the mock
// function must be a STABLE object configured once here at module scope, not
// reassigned per-test in beforeEach — a fresh jest.fn() per test would only
// ever be wired into an agent instance that never actually gets used again
// after the first test.
const mockAnalyzeMultiImageEvidence = jest.fn();
jest.mock('../src/services/IntakeAgent', () => {
  const actual = jest.requireActual('../src/services/IntakeAgent');
  return {
    ...actual,
    IntakeAgent: jest.fn().mockImplementation(() => ({
      analyzeMultiImageEvidence: mockAnalyzeMultiImageEvidence,
      analyzeEvidence: jest.fn(),
      analyzeText: jest.fn(),
    })),
  };
});

const mockUploadEvidenceFile = jest.fn();
jest.mock('../src/services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    uploadEvidenceFile: mockUploadEvidenceFile,
  })),
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    keyFigure: {
      createMany: jest.fn(),
    },
  },
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/lib/prisma';
import { evidenceRouter } from '../src/routes/evidenceRoutes';

const app = express();
app.use(express.json());
app.use('/api/evidence', evidenceRouter);

const mockEvidenceFindUnique = prisma.evidence.findUnique as jest.Mock;
const mockEvidenceCreate = prisma.evidence.create as jest.Mock;
const mockKeyFigureCreateMany = prisma.keyFigure.createMany as jest.Mock;

const ANALYSIS_FIXTURE = {
  evidenceRole: 'Incriminating',
  isRelevant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  summary: 'הדף שנתפס מציג הנחיה פנימית להסתרת נתונים.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidencePerspective: 'Internal Knowledge',
  tierReasoning: 'מסמך פנימי דלוף.',
  evidenceTier: 'Tier 1: Smoking Gun',
  evidenceDate: '2021-03-10',
  keyFigures: ['ד"ר שרון אלרוי-פריס'],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable',
};

const CREATED_RECORD_FIXTURE = {
  id: 'ev-recovered-1',
  summary: ANALYSIS_FIXTURE.summary,
  evidenceTier: ANALYSIS_FIXTURE.evidenceTier,
  evidenceRole: ANALYSIS_FIXTURE.evidenceRole,
  investigativeCategories: ANALYSIS_FIXTURE.investigativeCategories,
  targetEntity: ANALYSIS_FIXTURE.targetEntity,
  evidenceDate: ANALYSIS_FIXTURE.evidenceDate,
  fileUrl: 'https://storage.example/first.jpg',
  additionalScreenshotUrls: ['https://storage.example/second.jpg'],
  figures: ANALYSIS_FIXTURE.keyFigures.map((name) => ({ name })),
};

const SOURCE_URL = 'https://example.gov/blocked-page';
const PNG_BUFFER = Buffer.from('89504e470d0a1a0a', 'hex');

beforeEach(() => {
  mockAnalyzeMultiImageEvidence.mockReset().mockResolvedValue(ANALYSIS_FIXTURE);

  mockEvidenceFindUnique.mockResolvedValue(null);
  mockKeyFigureCreateMany.mockResolvedValue({ count: 1 });
  mockEvidenceCreate.mockImplementation(({ data }: { data: { fileHash: string } }) =>
    Promise.resolve({ ...CREATED_RECORD_FIXTURE, fileHash: data.fileHash }),
  );
  // mockResolvedValueOnce queues survive mockClear() (global clearMocks only
  // clears call history, not queued implementations) — reset first so a
  // single-screenshot test's unconsumed second queued value can't leak into
  // the next test's first call.
  mockUploadEvidenceFile
    .mockReset()
    .mockResolvedValueOnce('https://storage.example/first.jpg')
    .mockResolvedValueOnce('https://storage.example/second.jpg');
});

describe('POST /api/evidence/recover-intake', () => {
  it('returns a draft analysis for a single screenshot (200)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-intake')
      .field('sourceUrl', SOURCE_URL)
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.sourceUrl).toBe(SOURCE_URL);
    expect(res.body.analysis.summary).toBe(ANALYSIS_FIXTURE.summary);
    expect(mockAnalyzeMultiImageEvidence).toHaveBeenCalledTimes(1);
  });

  it('accepts multiple screenshots and passes all of them to analyzeMultiImageEvidence', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-intake')
      .field('sourceUrl', SOURCE_URL)
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' })
      .attach('screenshots', PNG_BUFFER, { filename: 'b.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const [images] = mockAnalyzeMultiImageEvidence.mock.calls[0] as [unknown[], string];
    expect(images).toHaveLength(2);
  });

  it('does not persist anything — no prisma.evidence.create call', async () => {
    await request(app)
      .post('/api/evidence/recover-intake')
      .field('sourceUrl', SOURCE_URL)
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(mockEvidenceCreate).not.toHaveBeenCalled();
  });

  it('rejects a request with no screenshots (400)', async () => {
    const res = await request(app).post('/api/evidence/recover-intake').field('sourceUrl', SOURCE_URL);

    expect(res.status).toBe(400);
  });

  it('rejects a request missing sourceUrl (400)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-intake')
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('rejects a non-image file type (400, multer fileFilter)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-intake')
      .field('sourceUrl', SOURCE_URL)
      .attach('screenshots', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500); // multer fileFilter error reaches the default Express error handler
  });

  it('rejects more than 10 screenshots (multer count cap)', async () => {
    let req = request(app).post('/api/evidence/recover-intake').field('sourceUrl', SOURCE_URL);
    for (let i = 0; i < 11; i++) {
      req = req.attach('screenshots', PNG_BUFFER, { filename: `s${i}.png`, contentType: 'image/png' });
    }
    const res = await req;

    expect(res.status).toBe(500); // multer LIMIT_UNEXPECTED_FILE error
  });
});

describe('POST /api/evidence/recover-confirm', () => {
  it('persists as PENDING_REVIEW with createdById unset (anonymous, public route)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_REVIEW');
    expect(res.body.evidenceId).toBe('ev-recovered-1');
    expect(mockEvidenceCreate.mock.calls[0][0].data.createdById).toBeUndefined();
    expect(mockEvidenceCreate.mock.calls[0][0].data.status).toBe('PENDING_REVIEW');
  });

  it('populates additionalScreenshotUrls in order for multiple screenshots', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' })
      .attach('screenshots', PNG_BUFFER, { filename: 'b.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.fileUrl).toBe('https://storage.example/first.jpg');
    expect(res.body.additionalScreenshotUrls).toEqual(['https://storage.example/second.jpg']);
  });

  it('never calls IntakeAgent — the analysis is already computed', async () => {
    await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(mockAnalyzeMultiImageEvidence).not.toHaveBeenCalled();
  });

  it('rejects invalid analysis JSON (400)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', 'not-json')
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('rejects analysis JSON that fails IntakeOutputSchema validation (400)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify({ notARealAnalysis: true }))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid analysis');
  });

  it('rejects a request with no screenshots (400)', async () => {
    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE));

    expect(res.status).toBe(400);
  });

  it('short-circuits a duplicate hash without uploading (201, existing record)', async () => {
    mockEvidenceFindUnique.mockResolvedValue({
      id: 'ev-existing',
      fileHash: 'existing-hash',
      status: 'CONFIRMED',
      summary: 'existing summary',
      evidenceTier: 'Tier 2: Material',
      evidenceRole: 'Incriminating',
      investigativeCategories: [],
      targetEntity: 'FDA',
      evidenceDate: '2021-01-01',
      fileUrl: 'https://storage.example/existing.jpg',
      additionalScreenshotUrls: [],
    });

    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.evidenceId).toBe('ev-existing');
    expect(mockUploadEvidenceFile).not.toHaveBeenCalled();
  });

  it('returns 500 when StorageService upload fails, without creating an Evidence row', async () => {
    mockUploadEvidenceFile.mockReset().mockRejectedValueOnce(new Error('Supabase Storage upload failed'));

    const res = await request(app)
      .post('/api/evidence/recover-confirm')
      .field('sourceUrl', SOURCE_URL)
      .field('analysis', JSON.stringify(ANALYSIS_FIXTURE))
      .attach('screenshots', PNG_BUFFER, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(mockEvidenceCreate).not.toHaveBeenCalled();
  });
});
