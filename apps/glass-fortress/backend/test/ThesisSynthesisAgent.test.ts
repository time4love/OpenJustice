import {
  ThesisSynthesisAgent,
  ThesisSynthesisOutputSchema,
  type EvidenceCorpusRecord,
  type ThesisSynthesisOutput,
} from '../src/services/ThesisSynthesisAgent';

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

function getMockInvoke(agent: ThesisSynthesisAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

const CORPUS_FIXTURE: EvidenceCorpusRecord[] = [
  {
    fileHash: 'hash-001',
    summary: 'דוח פנימי ממשרד הבריאות המתאר ידיעה על אירועי לב אצל צעירים לאחר חיסון mRNA.',
    evidenceTier: 'Tier1',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-06-10',
    targetEntity: 'Ministry of Health',
    keyFigures: ['חזי לוי'],
  },
  {
    fileHash: 'hash-002',
    summary: 'ראיון טלוויזיה שבו פקידה בכירה הכחישה בפומבי קיום סיכונים לבביים.',
    evidenceTier: 'Tier2',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-07-15',
    targetEntity: 'Dr. Sharon Alroy-Preis',
    keyFigures: ['שרון אלרוי-פריס'],
  },
  {
    fileHash: 'hash-003',
    summary: 'מסמך קמפיין רשמי לקידום חיסונים המתאר חיסון mRNA כ"תרופה מאושרת" ללא אזכור מעמד EUA.',
    evidenceTier: 'Tier1',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-04-01',
    targetEntity: 'Ministry of Health',
    keyFigures: ['נחמן אש'],
  },
];

const VALID_RESPONSE: ThesisSynthesisOutput = {
  proposedTitle: 'Suppression of Adverse Event Data During COVID-19 Vaccine Rollout',
  thesisStatement:
    'משרד הבריאות ידע על אירועי לב חמורים לאחר חיסוני mRNA והסתיר מידע זה מהציבור. ' +
    'פקידים בכירים חתמו על קמפיינים ציבוריים שסיפקו מידע מטעה תוך הפרה של חוק זכויות החולה. ' +
    'ההסתרה הכוונתית מהווה עוולה בנזיקין כלפי כלל מקבלי החיסון שלא קיבלו גילוי נאות.',
  narrativeBody:
    '## עיקרי הטענה\n\n' +
    'בין אפריל ליולי 2021 ידעו פקידי משרד הבריאות על אירועי דלקת שריר הלב בקרב גברים צעירים.\n\n' +
    '## ראיות מרכזיות\n\n- דוח פנימי מיוני 2021 מתעד את הידיעה\n- ראיון ציבורי שסתר את הממצאים',
  supportingHashes: ['hash-001', 'hash-002', 'hash-003'],
  keyFigures: ['חזי לוי', 'שרון אלרוי-פריס', 'נחמן אש'],
  confidenceLevel: 'MODERATE',
  missingEvidence: [
    'תכתובות ישירות בין פקידים המוכיחות תיאום מכוון להסתרת מידע',
    'פרוטוקולים של ישיבות פנימיות שבהן הוחלט על מדיניות הגילוי',
  ],
  summaryHe:
    'הראיות מצביעות על דפוס של הסתרה מכוונת של נתוני בטיחות על ידי פקידי משרד הבריאות. ' +
    'אחריות משפטית אפשרית בנזיקין ומשפט ציבורי.',
};

describe('ThesisSynthesisAgent', () => {
  let agent: ThesisSynthesisAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new ThesisSynthesisAgent();
  });

  describe('constructor', () => {
    it('instantiates the LLM chain via LLMFactory with THESIS_SYNTHESIS agent type', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory');
      expect(LLMFactory.getChatModel).toHaveBeenCalledWith('THESIS_SYNTHESIS', { temperature: 0.1 });
    });

    it('calls withStructuredOutput with the synthesis schema name', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory');
      const mockModel = LLMFactory.getChatModel.mock.results[0].value;
      expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
        ThesisSynthesisOutputSchema,
        { name: 'thesis_synthesis' },
      );
    });
  });

  describe('synthesize()', () => {
    it('returns a valid ThesisSynthesisOutput when the LLM responds correctly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const result = await agent.synthesize('vaccine adverse event suppression', CORPUS_FIXTURE);
      expect(result.proposedTitle).toBe(VALID_RESPONSE.proposedTitle);
      expect(result.confidenceLevel).toBe('MODERATE');
      expect(result.supportingHashes).toEqual(['hash-001', 'hash-002', 'hash-003']);
    });

    it('passes topic and corpus to the LLM', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const topic = 'EUA suppression in vaccine campaigns';
      await agent.synthesize(topic, CORPUS_FIXTURE);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMessage = callArgs.find((m) => m.role === 'human');
      expect(humanMessage?.content).toContain(topic);
      expect(humanMessage?.content).toContain('hash-001');
      expect(humanMessage?.content).toContain('hash-002');
      expect(humanMessage?.content).toContain('hash-003');
    });

    it('includes key figures in the corpus block sent to the LLM', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      await agent.synthesize('test', CORPUS_FIXTURE);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMessage = callArgs.find((m) => m.role === 'human');
      expect(humanMessage?.content).toContain('חזי לוי');
      expect(humanMessage?.content).toContain('שרון אלרוי-פריס');
    });

    it('truncates long summaries to 500 chars in the corpus block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const longSummary = 'א'.repeat(600);
      const corpusWithLong: EvidenceCorpusRecord[] = [{ ...CORPUS_FIXTURE[0], summary: longSummary }];
      await agent.synthesize('test', corpusWithLong);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMessage = callArgs.find((m) => m.role === 'human');
      // 500-char slice should appear, not the full 600
      expect(humanMessage?.content).toContain('א'.repeat(500));
      expect(humanMessage?.content).not.toContain('א'.repeat(501));
    });

    it('handles a corpus with no key figures gracefully', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const noFigures: EvidenceCorpusRecord[] = [{ ...CORPUS_FIXTURE[0], keyFigures: [] }];
      await agent.synthesize('test', noFigures);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMessage = callArgs.find((m) => m.role === 'human');
      expect(humanMessage?.content).toContain('none identified');
    });

    it('includes a system prompt', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      await agent.synthesize('test', CORPUS_FIXTURE);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const systemMessage = callArgs.find((m) => m.role === 'system');
      expect(systemMessage?.content).toBeTruthy();
      expect(systemMessage?.content.length).toBeGreaterThan(100);
    });

    it('throws if the LLM returns a schema-invalid response', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ invalid: 'response' });
      await expect(agent.synthesize('test', CORPUS_FIXTURE)).rejects.toThrow();
    });

    it('validates confidenceLevel enum strictly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ ...VALID_RESPONSE, confidenceLevel: 'VERY_HIGH' });
      await expect(agent.synthesize('test', CORPUS_FIXTURE)).rejects.toThrow();
    });
  });

  describe('ThesisSynthesisOutputSchema', () => {
    it('accepts all valid confidenceLevel values', () => {
      for (const level of ['WEAK', 'MODERATE', 'STRONG']) {
        const result = ThesisSynthesisOutputSchema.safeParse({ ...VALID_RESPONSE, confidenceLevel: level });
        expect(result.success).toBe(true);
      }
    });

    it('rejects missing required fields', () => {
      const { proposedTitle: _, ...withoutTitle } = VALID_RESPONSE;
      const result = ThesisSynthesisOutputSchema.safeParse(withoutTitle);
      expect(result.success).toBe(false);
    });

    it('accepts empty arrays for supportingHashes, keyFigures, missingEvidence', () => {
      const result = ThesisSynthesisOutputSchema.safeParse({
        ...VALID_RESPONSE,
        supportingHashes: [],
        keyFigures: [],
        missingEvidence: [],
      });
      expect(result.success).toBe(true);
    });
  });
});
