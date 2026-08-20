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

  describe('disclosure control', () => {
    // Withholding the count is the easy part. These cover the two leaks that
    // survive a naive threshold, both of which hand back the withheld number.

    it('DROPS a suppressed cell rather than returning it with a null count', async () => {
      // A returned cell discloses that a report with that exact combination
      // exists, which with age+gender dimensions can identify a person on its
      // own — no count required.
      mockQueryRaw.mockResolvedValue([
        { d0: 'ONCOLOGIC', count: 9, g0: 0 },
        { d0: 'CARDIOVASCULAR', count: 40, g0: 0 },
        { d0: 'NEUROLOGICAL', count: 30, g0: 0 },
      ]);

      const cells = await getMedicalPattern(['symptomCategory']);

      expect(cells.some((c) => c.dimensions.symptomCategory === 'ONCOLOGIC')).toBe(false);
      expect(cells.every((c) => c.count !== null)).toBe(true);
    });

    it('withholds the total so a suppressed cell cannot be recovered by subtraction', async () => {
      // The attack: 100 - 40 - 30 - 25 = 5 republishes the withheld value.
      mockQueryRaw.mockResolvedValue([
        { d0: null, count: 100, g0: 1 }, // grand total
        { d0: 'CARDIOVASCULAR', count: 40, g0: 0 },
        { d0: 'NEUROLOGICAL', count: 30, g0: 0 },
        { d0: 'AUTOIMMUNE_IMMUNE', count: 25, g0: 0 },
        { d0: 'ONCOLOGIC', count: 5, g0: 0 },
      ]);

      const cells = await getMedicalPattern(['symptomCategory']);

      // The equation's left-hand side is gone entirely.
      expect(cells.some((c) => Object.keys(c.dimensions).length === 0)).toBe(false);
      expect(cells.some((c) => c.dimensions.symptomCategory === 'ONCOLOGIC')).toBe(false);
      // ...and the legitimate siblings all survive: removing the total costs
      // less information than sacrificing a real 25-report category would.
      expect(cells.map((c) => c.dimensions.symptomCategory).sort()).toEqual([
        'AUTOIMMUNE_IMMUNE',
        'CARDIOVASCULAR',
        'NEUROLOGICAL',
      ]);
    });

    it('removes ancestors transitively, so no chain of subtractions reaches the cell', async () => {
      // CARDIOVASCULAR x AGE_18_29 is thin. Its parent {CARDIOVASCULAR} would
      // give it away by subtraction, and the grand total would then give the
      // parent away — so both must go, while unrelated branches survive.
      mockQueryRaw.mockResolvedValue([
        { d0: null, d1: null, count: 200, g0: 1, g1: 1 },
        { d0: 'CARDIOVASCULAR', d1: null, count: 44, g0: 0, g1: 1 },
        { d0: 'NEUROLOGICAL', d1: null, count: 156, g0: 0, g1: 1 },
        { d0: 'CARDIOVASCULAR', d1: 'AGE_18_29', count: 4, g0: 0, g1: 0 },
        { d0: 'CARDIOVASCULAR', d1: 'AGE_30_44', count: 40, g0: 0, g1: 0 },
        { d0: 'NEUROLOGICAL', d1: 'AGE_30_44', count: 156, g0: 0, g1: 0 },
      ]);

      const cells = await getMedicalPattern(['symptomCategory', 'reporterAgeRange']);
      const key = (c: { dimensions: Record<string, unknown> }) =>
        `${String(c.dimensions.symptomCategory ?? '*')}/${String(c.dimensions.reporterAgeRange ?? '*')}`;
      const keys = cells.map(key);

      expect(keys).not.toContain('CARDIOVASCULAR/AGE_18_29'); // suppressed
      expect(keys).not.toContain('CARDIOVASCULAR/*'); // its parent
      expect(keys).not.toContain('*/*'); // the grand total
      // An unrelated branch is untouched — control is not a blanket wipe.
      expect(keys).toContain('NEUROLOGICAL/*');
      expect(keys).toContain('NEUROLOGICAL/AGE_30_44');
      expect(keys).toContain('CARDIOVASCULAR/AGE_30_44');
    });

    it('returns nothing at all when no cell clears the threshold', async () => {
      // The real state of a new deployment: a few reports, nothing publishable.
      // It must say nothing rather than leak the shape of what exists.
      mockQueryRaw.mockResolvedValue([
        { d0: null, count: 3, g0: 1 },
        { d0: 'CARDIOVASCULAR', count: 2, g0: 0 },
        { d0: 'ONCOLOGIC', count: 1, g0: 0 },
      ]);

      expect(await getMedicalPattern(['symptomCategory'])).toEqual([]);
    });

    it('publishes everything untouched when every cell clears the threshold', async () => {
      mockQueryRaw.mockResolvedValue([
        { d0: null, count: 70, g0: 1 },
        { d0: 'CARDIOVASCULAR', count: 40, g0: 0 },
        { d0: 'NEUROLOGICAL', count: 30, g0: 0 },
      ]);

      const cells = await getMedicalPattern(['symptomCategory']);
      expect(cells).toHaveLength(3);
      expect(cells.every((c) => c.count !== null)).toBe(true);
    });
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
