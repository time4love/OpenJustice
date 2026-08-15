import {
  ForensicAgent,
  ForensicOutputSchema,
  deriveSignificance,
} from '../src/services/ForensicAgent';

// ---------------------------------------------------------------------------
// Mock LLMFactory — no real API calls
// ---------------------------------------------------------------------------

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

function getMockInvoke(agent: ForensicAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// The model returns classification only — significance is derived from it, so
// no fixture asserts isLegallySignificant as model output.
const SIGNIFICANT_RESPONSE = {
  investigativeCategories: ['WITHHOLDING_INFORMATION', 'COERCION_MANDATE'],
  deletedItems: [
    { summary: 'הובטח כי תופעות הלוואי קלות וזמניות בלבד', exactQuote: 'Side effects are mild and temporary.' },
    { summary: 'ניסוח "אישור שימוש חירום" הוסר מהדף', exactQuote: 'Emergency Use Authorization approved.' },
  ],
  addedItems: [
    { summary: 'נוספה הוראה המחייבת עובדים לקבל חיסון', exactQuote: 'All employees must be vaccinated.' },
  ],
  legalSignificance:
    'הסרת האזהרה בדבר תופעות לוואי נעשתה 18 יום לאחר שדו"ח פנימי הדגיש סיכונים קרדיולוגיים.',
};

const COSMETIC_RESPONSE = {
  investigativeCategories: [],
  deletedItems: [],
  addedItems: [],
  legalSignificance: 'עדכון קישורי ניווט בלבד ללא שינוי בתוכן הרפואי או הרגולטורי.',
};

const RELATED_EVIDENCE = [
  {
    date: '2021-05-15',
    summary: 'דו"ח פנימי של משרד הבריאות',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    targetEntity: 'Ministry of Health',
    evidenceRole: 'Incriminating',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForensicAgent', () => {
  it('parses a legally significant response and returns the correct shape', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce(SIGNIFICANT_RESPONSE);

    const result = await agent.analyzeChange(
      ['Side effects are mild and temporary.', 'Emergency Use Authorization approved.'],
      ['All employees must be vaccinated.'],
      'https://health.gov.il/vaccines',
      '2021-06-01',
      RELATED_EVIDENCE,
    );

    expect(result.isLegallySignificant).toBe(true);
    expect(result.deletedItems).toHaveLength(2);
    expect(result.addedItems).toHaveLength(1);
    expect(result.deletedItems[0]).toHaveProperty('summary');
    expect(result.deletedItems[0]).toHaveProperty('exactQuote');
    expect(result.legalSignificance).toContain('קרדיולוגיים');
  });

  it('parses a cosmetic (not significant) response', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce(COSMETIC_RESPONSE);

    const result = await agent.analyzeChange(
      ['Navigation item removed'],
      ['New footer link added'],
      'https://health.gov.il/vaccines',
      '2021-06-01',
      [],
    );

    expect(result.isLegallySignificant).toBe(false);
    expect(result.investigativeCategories).toEqual([]);
    expect(result.deletedItems).toEqual([]);
    expect(result.addedItems).toEqual([]);
  });

  it('throws a Zod validation error when the model returns an invalid schema', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce({
      investigativeCategories: 'WITHHOLDING_INFORMATION', // should be an array
      deletedItems: [],
      addedItems: [],
      legalSignificance: '',
    });

    await expect(
      agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []),
    ).rejects.toThrow();
  });

  it('rejects a category outside the approved taxonomy', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce({
      ...COSMETIC_RESPONSE,
      investigativeCategories: ['GENERALLY_SUSPICIOUS'],
    });

    await expect(
      agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Significance derivation — a change is evidence for THIS investigation
  // exactly when it advances one of its standing concerns. The model is never
  // asked for the boolean, so classification and flag cannot disagree.
  // -------------------------------------------------------------------------
  describe('significance derivation', () => {
    it('is true when at least one category matched', async () => {
      const agent = new ForensicAgent();
      getMockInvoke(agent).mockResolvedValueOnce({
        ...COSMETIC_RESPONSE,
        investigativeCategories: ['INFORMED_CONSENT'],
      });

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(true);
      expect(result.investigativeCategories).toEqual(['INFORMED_CONSENT']);
    });

    it('is false when no category matched', async () => {
      const agent = new ForensicAgent();
      getMockInvoke(agent).mockResolvedValueOnce(COSMETIC_RESPONSE);

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(false);
    });

    it('ignores a significance flag the model volunteers', async () => {
      const agent = new ForensicAgent();
      // A model that hedges — claiming significance while matching no concern —
      // must not be able to force evidence creation.
      getMockInvoke(agent).mockResolvedValueOnce({
        ...COSMETIC_RESPONSE,
        isLegallySignificant: true,
      });

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(false);
    });
  });

  it('exposes derivation independently of the agent', () => {
    expect(deriveSignificance([])).toBe(false);
    expect(deriveSignificance(['STATISTICAL_MANIPULATION'])).toBe(true);
  });

  it('passes both deletions and additions in the human message', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce(COSMETIC_RESPONSE);

    await agent.analyzeChange(
      ['deleted text chunk'],
      ['added text chunk'],
      'https://health.gov.il',
      '2021-06-01',
      [],
    );

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMessage = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMessage).toContain('deleted text chunk');
    expect(humanMessage).toContain('added text chunk');
    expect(humanMessage).toContain('https://health.gov.il');
    expect(humanMessage).toContain('2021-06-01');
  });

  it('includes correlated evidence in the human message', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce(COSMETIC_RESPONSE);

    await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', RELATED_EVIDENCE);

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMessage = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMessage).toContain('Ministry of Health');
    expect(humanMessage).toContain('WITHHOLDING_INFORMATION');
  });

  it('handles empty deletions and additions gracefully', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValueOnce(COSMETIC_RESPONSE);

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);
    expect(result).toMatchObject(COSMETIC_RESPONSE);
  });

  describe('ForensicOutputSchema validation', () => {
    it('accepts a valid significant output', () => {
      const result = ForensicOutputSchema.safeParse({
        ...SIGNIFICANT_RESPONSE,
        isLegallySignificant: true,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid cosmetic output', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        isLegallySignificant: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown investigative category', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        isLegallySignificant: false,
        investigativeCategories: ['NOT_A_REAL_CATEGORY'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing isLegallySignificant field', () => {
      const result = ForensicOutputSchema.safeParse({
        deletedItems: [],
        addedItems: [],
        legalSignificance: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-array deletedItems', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        deletedItems: 'not an array',
      });
      expect(result.success).toBe(false);
    });

    it('rejects deletedItems entry missing exactQuote', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        deletedItems: [{ summary: 'a summary' }],
      });
      expect(result.success).toBe(false);
    });
  });
});
