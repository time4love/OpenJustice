// ---------------------------------------------------------------------------
// reportPatternService tests. prisma.$queryRaw is mocked so these run
// without a live database; the actual generated SQL (via the real
// Prisma.sql/.text) is inspected directly rather than trusted blindly,
// since that's the part carrying the real security/correctness weight.
// ---------------------------------------------------------------------------

const mockQueryRaw = jest.fn();
jest.mock('../src/lib/prisma', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));

import { getMedicalPattern, getSocialEconomicPattern } from '../src/services/reportPatternService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMedicalPattern', () => {
  it('builds the query with only allowlisted, correctly-aliased columns', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getMedicalPattern(['symptomCategory', 'reporterAgeRange']);

    const query = mockQueryRaw.mock.calls[0]?.[0];
    expect(query.text).toContain('m."symptomCategory"');
    expect(query.text).toContain('r."reporterAgeRange"');
    expect(query.text).toContain('"MedicalAdverseEventReport" m JOIN "Report" r');
    expect(query.text).toContain('GROUP BY CUBE');
    expect(query.text).toContain('GROUPING(m."symptomCategory")');
  });

  it('parameterizes filter values rather than concatenating them', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getMedicalPattern(['symptomCategory'], { symptomCategory: ['CARDIOVASCULAR', 'ONCOLOGIC'] });

    const query = mockQueryRaw.mock.calls[0]?.[0];
    expect(query.text).toContain('WHERE m."symptomCategory" IN ($1,$2)');
    expect(query.values).toEqual(['CARDIOVASCULAR', 'ONCOLOGIC']);
  });

  it('omits the WHERE clause entirely when no filters are given', async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getMedicalPattern(['symptomCategory']);
    const query = mockQueryRaw.mock.calls[0]?.[0];
    expect(query.text).not.toContain('WHERE');
  });

  it('distinguishes a rolled-up dimension (GROUPING=1) from a present one, and omits it from the cell', async () => {
    // Simulates one row of CUBE(symptomCategory, reporterAgeRange) output:
    // totals for CARDIOVASCULAR across every age range (reporterAgeRange rolled up).
    mockQueryRaw.mockResolvedValue([
      { d0: 'CARDIOVASCULAR', d1: null, count: 42, g0: 0, g1: 1 },
    ]);

    const cells = await getMedicalPattern(['symptomCategory', 'reporterAgeRange']);

    expect(cells).toEqual([
      { dimensions: { symptomCategory: 'CARDIOVASCULAR' }, count: 42 },
    ]);
  });

  it('keeps a genuinely null data value distinct from a rolled-up dimension', async () => {
    // GROUPING=0 means "present, and the real value happens to be null" —
    // must NOT be treated the same as rolled-up (GROUPING=1).
    mockQueryRaw.mockResolvedValue([
      { d0: 'CARDIOVASCULAR', d1: null, count: 12, g0: 0, g1: 0 },
    ]);

    const cells = await getMedicalPattern(['symptomCategory', 'reporterAgeRange']);

    expect(cells).toEqual([
      { dimensions: { symptomCategory: 'CARDIOVASCULAR', reporterAgeRange: null }, count: 12 },
    ]);
  });

  it('suppresses counts below the threshold (10)', async () => {
    mockQueryRaw.mockResolvedValue([
      { d0: 'ONCOLOGIC', count: 9, g0: 0 },
      { d0: 'CARDIOVASCULAR', count: 10, g0: 0 },
    ]);

    const cells = await getMedicalPattern(['symptomCategory']);

    expect(cells).toEqual([
      { dimensions: { symptomCategory: 'ONCOLOGIC' }, count: null },
      { dimensions: { symptomCategory: 'CARDIOVASCULAR' }, count: 10 },
    ]);
  });
});

describe('getSocialEconomicPattern', () => {
  it('builds the query against the SocialEconomicImpactReport join', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getSocialEconomicPattern(['impactCategory']);

    const query = mockQueryRaw.mock.calls[0]?.[0];
    expect(query.text).toContain('s."impactCategory"');
    expect(query.text).toContain('"SocialEconomicImpactReport" s JOIN "Report" r');
  });
});
