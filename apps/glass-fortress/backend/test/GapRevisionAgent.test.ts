import {
  GapRevisionAgent,
  GapRevisionOutputSchema,
  type VaultHitRecord,
  type GapRevisionOutput,
} from '../src/services/GapRevisionAgent';

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

function getMockInvoke(agent: GapRevisionAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

const VAULT_HIT: VaultHitRecord = {
  fileHash: 'hash-001',
  summary: 'מסמך פנימי ממשרד הבריאות המתאר ידיעה על אירועי לב לאחר חיסון mRNA.',
  evidenceTier: 'Tier1',
  evidenceRole: 'Incriminating',
  evidenceDate: '2021-06-10',
  category: 'Internal Report',
  targetEntity: 'Ministry of Health',
};

const CURRENT_BODY = `## עיקרי הטענה\n\nמשרד הבריאות הפר את חובת הגילוי כלפי הציבור.\n\n## ראיות מרכזיות\n\nהמשרד פרסם קמפיינים ציבוריים מטעים.`;

const GAP_DESCRIPTION = 'חסרים מסמכים פנימיים המוכיחים שהמשרד ידע על תופעות לוואי חמורות לפני פרסום הקמפיינים.';

const VALID_RESPONSE: GapRevisionOutput = {
  suggestedBody:
    `## עיקרי הטענה\n\nמשרד הבריאות הפר את חובת הגילוי כלפי הציבור.\n\n` +
    `## ראיות מרכזיות\n\nהמשרד פרסם קמפיינים ציבוריים מטעים.\n\n` +
    `## ידיעה מוקדמת על תופעות לוואי\n\nדוח פנימי מיוני 2021 מתעד כי בכירי המשרד ידעו על אירועי דלקת שריר הלב.`,
};

describe('GapRevisionAgent', () => {
  let agent: GapRevisionAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new GapRevisionAgent();
  });

  describe('constructor', () => {
    it('instantiates via LLMFactory with GAP_REVISION agent type', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory');
      expect(LLMFactory.getChatModel).toHaveBeenCalledWith('GAP_REVISION', { temperature: 0.2 });
    });

    it('calls withStructuredOutput with the revision schema name', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory');
      const mockModel = LLMFactory.getChatModel.mock.results[0].value;
      expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
        GapRevisionOutputSchema,
        { name: 'gap_revision' },
      );
    });
  });

  describe('suggest()', () => {
    it('returns a GapRevisionOutput with suggestedBody', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const result = await agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, VAULT_HIT);

      expect(result.suggestedBody).toContain('## עיקרי הטענה');
      expect(result.suggestedBody.length).toBeGreaterThan(CURRENT_BODY.length);
    });

    it('passes current body, gap description, and evidence to the LLM', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      await agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, VAULT_HIT);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMsg = callArgs.find((m) => m.role === 'human');
      expect(humanMsg?.content).toContain(CURRENT_BODY);
      expect(humanMsg?.content).toContain(GAP_DESCRIPTION);
      expect(humanMsg?.content).toContain(VAULT_HIT.summary);
    });

    it('includes evidence metadata (tier, role, date, entity) in the prompt', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      await agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, VAULT_HIT);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMsg = callArgs.find((m) => m.role === 'human');
      expect(humanMsg?.content).toContain('Tier1');
      expect(humanMsg?.content).toContain('Incriminating');
      expect(humanMsg?.content).toContain('2021-06-10');
      expect(humanMsg?.content).toContain('Ministry of Health');
    });

    it('truncates long evidence summaries to 600 chars', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      const longSummary = 'א'.repeat(700);
      await agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, { ...VAULT_HIT, summary: longSummary });

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const humanMsg = callArgs.find((m) => m.role === 'human');
      expect(humanMsg?.content).toContain('א'.repeat(600));
      expect(humanMsg?.content).not.toContain('א'.repeat(601));
    });

    it('includes a system prompt', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);
      await agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, VAULT_HIT);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const sysMsg = callArgs.find((m) => m.role === 'system');
      expect(sysMsg?.content).toBeTruthy();
      expect(sysMsg?.content.length).toBeGreaterThan(100);
    });

    it('throws if the LLM returns a schema-invalid response', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ wrongField: 'bad' });
      await expect(agent.suggest(CURRENT_BODY, GAP_DESCRIPTION, VAULT_HIT)).rejects.toThrow();
    });
  });

  describe('GapRevisionOutputSchema', () => {
    it('accepts a valid suggestedBody string', () => {
      const result = GapRevisionOutputSchema.safeParse({ suggestedBody: '## כותרת\n\nגוף.' });
      expect(result.success).toBe(true);
    });

    it('rejects missing suggestedBody', () => {
      const result = GapRevisionOutputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
