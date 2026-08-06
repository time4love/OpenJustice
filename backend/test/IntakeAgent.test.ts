import { IntakeAgent, IntakeOutputSchema, EVIDENCE_TIER } from '../src/services/IntakeAgent';

// ---------------------------------------------------------------------------
// Mock @langchain/anthropic so no real API calls are made
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
  // The chain is the result of model.withStructuredOutput(...)
  // Access it via the private field using bracket notation for testing.
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
    'An internal memo from a senior regulator explicitly instructs staff to suppress myocarditis reporting ' +
    'for individuals under 30. The document is dated and bears an official department letterhead, ' +
    'making it a direct record of deliberate information suppression.',
  missingInformation: [],
  evidenceTier: EVIDENCE_TIER.SMOKING_GUN,
};

const ANECDOTAL_RESPONSE = {
  isRelevant: true,
  category: 'Coercion' as const,
  summary:
    'A social media post describes the author feeling pressured by their employer to get vaccinated. ' +
    'No supporting documentation or named parties are provided. ' +
    'The account is first-hand but entirely unverifiable.',
  missingInformation: ['No employer name', 'No documentation of coercion', 'No date provided'],
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
};

const MATERIAL_RESPONSE = {
  isRelevant: true,
  category: 'Regulatory Misleading' as const,
  summary:
    'An official press release from the health authority makes specific efficacy claims ' +
    'that contradict later-released trial data. This is a public, attributable document ' +
    'directly relevant to misleading regulatory communications.',
  missingInformation: ['Original source URL not provided'],
  evidenceTier: EVIDENCE_TIER.MATERIAL,
};

const IRRELEVANT_RESPONSE = {
  isRelevant: false,
  category: 'Other' as const,
  summary:
    'The submitted text appears to be a restaurant review with no content relating to ' +
    'Covid-19 policy, side effects, regulatory decisions, or coercion. ' +
    'It has no legal relevance to the class-action.',
  missingInformation: [],
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
};

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
      const invalid = { ...SMOKING_GUN_RESPONSE, evidenceTier: 'Tier 99: Legendary' };
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects an invalid category value', () => {
      const invalid = { ...SMOKING_GUN_RESPONSE, category: 'Not A Category' };
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a non-boolean isRelevant', () => {
      const invalid = { ...SMOKING_GUN_RESPONSE, isRelevant: 'yes' };
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a non-array missingInformation', () => {
      const invalid = { ...SMOKING_GUN_RESPONSE, missingInformation: 'Missing date' };
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });
  });

  // ---- analyzeEvidence — happy paths --------------------------------------

  describe('analyzeEvidence', () => {
    it('returns a correctly typed Smoking Gun result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence('Leaked internal memo content...');

      expect(result.isRelevant).toBe(true);
      expect(result.category).toBe('Side Effect Withholding');
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.SMOKING_GUN);
      expect(result.missingInformation).toHaveLength(0);
      expect(typeof result.summary).toBe('string');
    });

    it('returns a correctly typed Anecdotal result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence('My employer said I had to get the vaccine...');

      expect(result.isRelevant).toBe(true);
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.ANECDOTAL);
      expect(result.missingInformation).toHaveLength(3);
    });

    it('returns a correctly typed Material result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);

      const result = await agent.analyzeEvidence('Official press release text...');

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.MATERIAL);
      expect(result.category).toBe('Regulatory Misleading');
    });

    it('returns isRelevant=false for unrelated content', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(IRRELEVANT_RESPONSE);

      const result = await agent.analyzeEvidence('This restaurant has great pasta...');

      expect(result.isRelevant).toBe(false);
      expect(result.category).toBe('Other');
    });

    it('invokes the chain with a system prompt and the raw text', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);
      const rawText = 'Evidence document content here.';

      await agent.analyzeEvidence(rawText);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0].role).toBe('system');
      expect(callArgs[1].role).toBe('human');
      expect(callArgs[1].content).toBe(rawText);
    });

    it('propagates errors thrown by the LLM chain', async () => {
      getMockInvoke(agent).mockRejectedValueOnce(new Error('API timeout'));

      await expect(agent.analyzeEvidence('some text')).rejects.toThrow('API timeout');
    });

    it('throws a Zod error if the LLM returns a malformed object', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ isRelevant: 'not-a-boolean' });

      await expect(agent.analyzeEvidence('some text')).rejects.toThrow();
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
