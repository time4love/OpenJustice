import { IntakeAgent, IntakeOutputSchema, EVIDENCE_TIER } from '../src/services/IntakeAgent';

// ---------------------------------------------------------------------------
// Mock @langchain/anthropic so no real API calls are made.
// ---------------------------------------------------------------------------

jest.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: jest.fn().mockImplementation(() => ({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the mocked `invoke` function from the constructed IntakeAgent chain. */
function getMockInvoke(agent: IntakeAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMOKING_GUN_RESPONSE = {
  isRelevant: true,
  category: 'Side Effect Withholding' as const,
  summary:
    'מסמך פנימי של משרד הבריאות מנחה מנהלים אזוריים לעכב פרסום נתוני דלקת שריר לב לאחר חיסון. ' +
    'המסמך נושא תאריך ולוגו רשמי ומהווה הוכחה ישירה להסתרת מידע.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidenceTier: EVIDENCE_TIER.SMOKING_GUN,
  evidenceDate: '2021-03-10',
};

const ANECDOTAL_RESPONSE = {
  isRelevant: true,
  category: 'Coercion' as const,
  summary: 'פוסט ברשת חברתית מתאר לחץ מצד מעסיק להתחסן. אין תיעוד נוסף או פרטים מזהים.',
  missingInformation: ['שם המעסיק חסר', 'אין תאריך', 'אין תיעוד כתוב'],
  targetEntity: 'Unknown',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
  evidenceDate: 'Unknown',
};

const MATERIAL_RESPONSE = {
  isRelevant: true,
  category: 'Regulatory Misleading' as const,
  summary:
    'הודעה רשמית לעיתונות מטעם רשות הבריאות כוללת טענות יעילות הסותרות נתוני ניסויים שפורסמו מאוחר יותר.',
  missingInformation: ['כתובת מקור המקורית חסרה'],
  targetEntity: 'FDA',
  evidenceTier: EVIDENCE_TIER.MATERIAL,
  evidenceDate: '2021-08-23',
};

const IRRELEVANT_RESPONSE = {
  isRelevant: false,
  category: 'Other' as const,
  summary: 'הטקסט שהוגש הוא ביקורת מסעדה ואינו רלוונטי לתביעה.',
  missingInformation: [],
  targetEntity: 'Unknown',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
  evidenceDate: 'Unknown',
};

const TEST_FILE_BUFFER = Buffer.from('fake-image-content');
const TEST_MIME_JPEG = 'image/jpeg';
const TEST_MIME_PNG = 'image/png';
const TEST_MIME_PDF = 'application/pdf';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntakeAgent', () => {
  let agent: IntakeAgent;

  beforeEach(() => {
    agent = new IntakeAgent();
    jest.clearAllMocks();
  });

  // ---- Schema validation ---------------------------------------------------

  describe('IntakeOutputSchema', () => {
    it('accepts a valid Tier 1: Smoking Gun response', () => {
      expect(() => IntakeOutputSchema.parse(SMOKING_GUN_RESPONSE)).not.toThrow();
    });

    it('accepts a valid Tier 4: Anecdotal response', () => {
      expect(() => IntakeOutputSchema.parse(ANECDOTAL_RESPONSE)).not.toThrow();
    });

    it('rejects an invalid evidenceTier value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceTier: 'Tier 99: Legendary' }),
      ).toThrow();
    });

    it('rejects an invalid category value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, category: 'Not A Category' }),
      ).toThrow();
    });

    it('rejects a non-boolean isRelevant', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, isRelevant: 'yes' }),
      ).toThrow();
    });

    it('rejects a non-array missingInformation', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, missingInformation: 'Missing date' }),
      ).toThrow();
    });

    it('rejects a missing targetEntity field', () => {
      const { targetEntity: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts a targetEntity of "Unknown" for unidentifiable entity', () => {
      expect(() => IntakeOutputSchema.parse(IRRELEVANT_RESPONSE)).not.toThrow();
    });

    it('accepts a YYYY-MM-DD evidenceDate', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceDate: '2021-03-10' }),
      ).not.toThrow();
    });

    it('accepts "Unknown" as evidenceDate when no date is visible', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceDate: 'Unknown' }),
      ).not.toThrow();
    });

    it('rejects a missing evidenceDate field', () => {
      const { evidenceDate: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });
  });

  // ---- analyzeEvidence — happy paths --------------------------------------

  describe('analyzeEvidence', () => {
    it('returns a correctly typed Smoking Gun result including evidenceDate', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(true);
      expect(result.category).toBe('Side Effect Withholding');
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.SMOKING_GUN);
      expect(result.missingInformation).toHaveLength(0);
      expect(result.targetEntity).toBe('Ministry of Health');
      expect(result.evidenceDate).toBe('2021-03-10');
    });

    it('returns "Unknown" evidenceDate when no date is visible', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceDate).toBe('Unknown');
    });

    it('returns a correctly typed Anecdotal result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.ANECDOTAL);
      expect(result.missingInformation).toHaveLength(3);
    });

    it('returns a correctly typed Material result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.MATERIAL);
      expect(result.category).toBe('Regulatory Misleading');
    });

    it('returns isRelevant=false for unrelated content', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(IRRELEVANT_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(false);
      expect(result.category).toBe('Other');
    });

    it('invokes the chain with a system prompt and file content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: unknown;
      }>;
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0].role).toBe('system');
      expect(callArgs[1].role).toBe('human');
      // Human content must be an array (file block + text prompt)
      expect(Array.isArray(callArgs[1].content)).toBe(true);
    });

    it('embeds the system prompt with Hebrew and date-hunting directives', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const systemContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>
      )[0].content;
      expect(systemContent).toContain('Hebrew');
      expect(systemContent).toContain('Senior Legal Analyst');
      expect(systemContent).toContain('YYYY-MM-DD');
      expect(systemContent).toContain('evidenceDate');
    });

    it('encodes JPEG as an image_url content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('encodes PNG as an image_url content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PNG);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:image\/png;base64,/);
    });

    it('encodes PDF as a native document content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PDF);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; source?: { media_type: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('document');
      expect(humanContent[0].source?.media_type).toBe('application/pdf');
    });

    it('base64-encodes the file buffer correctly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const knownBuffer = Buffer.from('hello');
      await agent.analyzeEvidence(knownBuffer, TEST_MIME_JPEG);

      const url = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content[0].image_url?.url ?? '';
      expect(url).toContain(knownBuffer.toString('base64'));
    });

    it('makes exactly one chain invocation per analyzeEvidence call', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(getMockInvoke(agent)).toHaveBeenCalledTimes(1);
    });

    it('propagates errors thrown by the chain', async () => {
      getMockInvoke(agent).mockRejectedValueOnce(new Error('API timeout'));

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow(
        'API timeout',
      );
    });

    it('throws a Zod error if the LLM returns a malformed object', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ isRelevant: 'not-a-boolean' });

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow();
    });
  });

  // ---- EVIDENCE_TIER enum sanity ------------------------------------------

  describe('EVIDENCE_TIER constant', () => {
    it('has exactly four tiers', () => {
      expect(Object.keys(EVIDENCE_TIER)).toHaveLength(4);
    });

    it('tier values match the Zod enum exactly', () => {
      const zodEnum = IntakeOutputSchema.shape.evidenceTier.options as string[];
      const tierValues = Object.values(EVIDENCE_TIER) as string[];
      expect(tierValues.sort()).toEqual(zodEnum.sort());
    });
  });
});
