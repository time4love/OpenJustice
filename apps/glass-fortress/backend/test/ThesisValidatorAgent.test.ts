import {
  ThesisValidatorAgent,
  FalsificationResultSchema,
  type EvidenceSummary,
} from '../src/services/ThesisValidatorAgent';

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

function getMockInvoke(agent: ThesisValidatorAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EVIDENCE_FIXTURE: EvidenceSummary[] = [
  {
    id: 'ev-1',
    summary: 'דו"ח זום פנימי מיוני 2021 שנחשף: בכירים ידעו על אירועי לב חריגים לאחר חיסון.',
    evidenceDate: '2021-06-10',
    targetEntity: 'Ministry of Health',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
  },
  {
    id: 'ev-2',
    summary: 'ראיון טלוויזיה מיולי 2021: הבכירה אמרה בפומבי שאין ראיות לסיכונים קרדיולוגיים.',
    evidenceDate: '2021-07-15',
    targetEntity: 'Dr. Sharon Alroy-Preis',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
  },
];

const STRONG_THESIS =
  'על פי הדו"ח הפנימי מיוני 2021, ידעו הבכירים על סיכונים קרדיולוגיים. ' +
  'למרות זאת, בראיון טלוויזיה מיולי 2021 הצהירה הבכירה כי אין ראיות לסיכונים כאלה. ' +
  'זוהי הצהרה שקרית מוכחת.';

const VALID_RESPONSE = {
  survivingClaims: [
    'הדו"ח הפנימי מיוני 2021 מוכיח ידיעה של בכירים על אירועי לב חריגים.',
    'הצהרת הבכירה בטלוויזיה סותרת את תוכן הדו"ח הפנימי.',
  ],
  falsificationAttempts: [
    {
      claim: 'הצהרת הבכירה היתה שקרית מוכחת',
      counterArgument:
        'ייתכן שהבכירה לא ראתה את הדו"ח הפנימי לפני הראיון — אין ראיה לידיעה אישית שלה.',
      evidenceGap:
        'נדרש תיעוד שהדו"ח הגיע לידי הבכירה לפני תאריך הראיון — למשל, מייל אישי או פרוטוקול ישיבה.',
    },
  ],
  weakestLink:
    'הקישור בין הדו"ח הפנימי לבין הידיעה האישית של הבכירה — הדו"ח קיים אך אין הוכחה שהיא קיבלה אותו.',
  recommendedEvidence: [
    'מייל פנימי או פרוטוקול ישיבה המוכיח שהדו"ח הועבר לבכירה לפני 15 ביולי 2021.',
    'רשומת נוכחות בישיבה שבה הוצג הדו"ח.',
  ],
};

const EMPTY_EVIDENCE_RESPONSE = {
  survivingClaims: [],
  falsificationAttempts: [
    {
      claim: 'כל התזה',
      counterArgument: 'אין ראיות מצורפות — כל הטענות הן עדות שמיעה.',
      evidenceGap: 'נדרשות ראיות ראשוניות לכל טענה.',
    },
  ],
  weakestLink: 'התזה כולה — אין ראיות מצורפות.',
  recommendedEvidence: ['כל ראיה ראשונית שתומכת בטענות.'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThesisValidatorAgent', () => {
  it('returns a valid FalsificationResult for a well-evidenced thesis', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

    const result = await agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE);

    expect(result.survivingClaims).toHaveLength(2);
    expect(result.falsificationAttempts).toHaveLength(1);
    expect(result.falsificationAttempts[0]).toHaveProperty('claim');
    expect(result.falsificationAttempts[0]).toHaveProperty('counterArgument');
    expect(result.falsificationAttempts[0]).toHaveProperty('evidenceGap');
    expect(result.weakestLink).toBeTruthy();
    expect(result.recommendedEvidence).toHaveLength(2);
  });

  it('handles a thesis with no tagged evidence', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce(EMPTY_EVIDENCE_RESPONSE);

    const result = await agent.validate('טענה ללא ראיות', []);

    expect(result.survivingClaims).toEqual([]);
    expect(result.falsificationAttempts.length).toBeGreaterThan(0);
  });

  it('includes the thesis text in the human message', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

    await agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE);

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMsg = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMsg).toContain(STRONG_THESIS);
  });

  it('includes all tagged evidence summaries in the human message', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

    await agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE);

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMsg = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMsg).toContain(EVIDENCE_FIXTURE[0].summary);
    expect(humanMsg).toContain(EVIDENCE_FIXTURE[1].summary);
    expect(humanMsg).toContain(EVIDENCE_FIXTURE[0].targetEntity);
    expect(humanMsg).toContain(EVIDENCE_FIXTURE[1].evidenceDate);
  });

  it('signals no evidence in human message when evidence array is empty', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce(EMPTY_EVIDENCE_RESPONSE);

    await agent.validate('thesis without evidence', []);

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMsg = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMsg).toContain('no evidence was tagged');
  });

  it('uses temperature: 0 for deterministic output', () => {
    const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory') as {
      LLMFactory: { getChatModel: jest.Mock };
    };
    new ThesisValidatorAgent();
    expect(LLMFactory.getChatModel).toHaveBeenCalledWith('THESIS', { temperature: 0 });
  });

  it('throws a Zod validation error when model returns an invalid schema', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce({
      survivingClaims: 'not an array', // should be array
      falsificationAttempts: [],
      weakestLink: 'some link',
      recommendedEvidence: [],
    });

    await expect(agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE)).rejects.toThrow();
  });

  it('throws when falsificationAttempts entry is missing evidenceGap', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce({
      survivingClaims: [],
      falsificationAttempts: [{ claim: 'x', counterArgument: 'y' }], // missing evidenceGap
      weakestLink: 'something',
      recommendedEvidence: [],
    });

    await expect(agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE)).rejects.toThrow();
  });

  it('returns empty survivingClaims array (not null) when no claims survive', async () => {
    const agent = new ThesisValidatorAgent();
    getMockInvoke(agent).mockResolvedValueOnce({ ...VALID_RESPONSE, survivingClaims: [] });

    const result = await agent.validate(STRONG_THESIS, EVIDENCE_FIXTURE);

    expect(Array.isArray(result.survivingClaims)).toBe(true);
    expect(result.survivingClaims).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FalsificationResultSchema unit tests
// ---------------------------------------------------------------------------

describe('FalsificationResultSchema', () => {
  it('accepts a valid full response', () => {
    expect(FalsificationResultSchema.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it('accepts empty arrays for survivingClaims and recommendedEvidence', () => {
    const result = FalsificationResultSchema.safeParse({
      survivingClaims: [],
      falsificationAttempts: [],
      weakestLink: 'no thesis was provided',
      recommendedEvidence: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing weakestLink', () => {
    const { weakestLink: _, ...withoutWeakestLink } = VALID_RESPONSE;
    expect(FalsificationResultSchema.safeParse(withoutWeakestLink).success).toBe(false);
  });

  it('rejects non-array survivingClaims', () => {
    expect(
      FalsificationResultSchema.safeParse({ ...VALID_RESPONSE, survivingClaims: 'string' }).success,
    ).toBe(false);
  });

  it('rejects falsificationAttempts entry missing claim field', () => {
    expect(
      FalsificationResultSchema.safeParse({
        ...VALID_RESPONSE,
        falsificationAttempts: [{ counterArgument: 'x', evidenceGap: 'y' }],
      }).success,
    ).toBe(false);
  });

  it('rejects falsificationAttempts entry missing counterArgument', () => {
    expect(
      FalsificationResultSchema.safeParse({
        ...VALID_RESPONSE,
        falsificationAttempts: [{ claim: 'x', evidenceGap: 'y' }],
      }).success,
    ).toBe(false);
  });
});
