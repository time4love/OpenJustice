import { LegalMasterAgent, ArgumentOutputSchema } from '../src/services/LegalMasterAgent';
import { VectorStoreService, EvidenceMetadata } from '../src/services/VectorStoreService';

// ---------------------------------------------------------------------------
// Mock @langchain/anthropic — no real API calls
// ---------------------------------------------------------------------------

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn(),
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMockInvoke(agent: LegalMasterAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

function makeVectorStore(
  primaryResults: Array<{ content: string; metadata: EvidenceMetadata; score?: number }> = [],
  fallbackResults: Array<{ content: string; metadata: EvidenceMetadata; score?: number }> = [],
): VectorStoreService {
  const mock = {
    searchSimilarEvidence: jest
      .fn()
      .mockResolvedValueOnce(primaryResults)
      .mockResolvedValueOnce(fallbackResults),
  };
  return mock as unknown as VectorStoreService;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TIER1_EVIDENCE = {
  content: 'Internal memo suppressing myocarditis data',
  metadata: {
    fileHash: '0xabc123def456aaa',
    tier: 'Tier 1: Smoking Gun',
    category: 'Side Effect Withholding',
    targetEntity: 'Ministry of Health',
    summary: 'Internal memo explicitly instructing staff to suppress myocarditis reporting.',
    evidenceDate: '2021-03-10',
    timestamp: 1700000000000,
  } satisfies EvidenceMetadata,
  score: 0.95,
};

const TIER2_EVIDENCE = {
  content: 'Official press release with misleading efficacy claims',
  metadata: {
    fileHash: '0xdef456abc789bbb',
    tier: 'Tier 2: Material',
    category: 'Side Effect Withholding',
    targetEntity: 'Ministry of Health',
    summary: 'Official document directly contradicting later-released trial data.',
    evidenceDate: '2021-08-23',
    timestamp: 1700000001000,
  } satisfies EvidenceMetadata,
  score: 0.88,
};

const TIER3_EVIDENCE = {
  content: 'News article about vaccine side effects',
  metadata: {
    fileHash: '0xfff999ccc111ddd',
    tier: 'Tier 3: Supporting',
    category: 'Side Effect Withholding',
    targetEntity: 'Unknown',
    summary: 'Media report on patterns of unreported adverse events.',
    evidenceDate: 'Unknown',
    timestamp: 1700000002000,
  } satisfies EvidenceMetadata,
  score: 0.72,
};

const MOCK_ARGUMENT = {
  title: 'Argument I: Deliberate Suppression of Adverse Event Data',
  legalTheory:
    'The Ministry of Health knowingly withheld material safety information from the public in violation of its statutory obligations.',
  draftedText:
    'The evidence conclusively demonstrates that the Ministry of Health deliberately suppressed ' +
    'adverse event data [0xabc123def456aaa]. This is further corroborated by official documents ' +
    'containing materially false efficacy claims [0xdef456abc789bbb].',
  citedHashes: ['0xabc123def456aaa', '0xdef456abc789bbb'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegalMasterAgent', () => {
  // ---- ArgumentOutputSchema validation ------------------------------------

  describe('ArgumentOutputSchema', () => {
    it('accepts a valid argument output', () => {
      expect(() => ArgumentOutputSchema.parse(MOCK_ARGUMENT)).not.toThrow();
    });

    it('rejects a missing title', () => {
      const { title: _removed, ...invalid } = MOCK_ARGUMENT;
      expect(() => ArgumentOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a missing legalTheory', () => {
      const { legalTheory: _removed, ...invalid } = MOCK_ARGUMENT;
      expect(() => ArgumentOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a missing draftedText', () => {
      const { draftedText: _removed, ...invalid } = MOCK_ARGUMENT;
      expect(() => ArgumentOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a non-array citedHashes', () => {
      const invalid = { ...MOCK_ARGUMENT, citedHashes: '0xabc' };
      expect(() => ArgumentOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts an empty citedHashes array', () => {
      expect(() => ArgumentOutputSchema.parse({ ...MOCK_ARGUMENT, citedHashes: [] })).not.toThrow();
    });
  });

  // ---- generateArgument — happy paths -------------------------------------

  describe('generateArgument', () => {
    it('returns a validated ArgumentOutput when evidence is found', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE, TIER2_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      const result = await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      expect(result.title).toBe(MOCK_ARGUMENT.title);
      expect(result.legalTheory).toBe(MOCK_ARGUMENT.legalTheory);
      expect(result.draftedText).toContain('0xabc123def456aaa');
      expect(result.citedHashes).toHaveLength(2);
    });

    it('invokes the chain with a system prompt and human message', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0].role).toBe('system');
      expect(callArgs[1].role).toBe('human');
      expect(callArgs[1].content).toContain('Ministry of Health');
      expect(callArgs[1].content).toContain('Side Effect Withholding');
    });

    it('includes evidence fileHashes in the human message', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE, TIER2_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const humanContent = (getMockInvoke(agent).mock.calls[0][0] as Array<{ content: string }>)[1]
        .content;
      expect(humanContent).toContain(TIER1_EVIDENCE.metadata.fileHash);
      expect(humanContent).toContain(TIER2_EVIDENCE.metadata.fileHash);
    });

    it('sorts evidence so Tier 1 appears before Tier 3 in the prompt', async () => {
      // Provide evidence out of order — Tier 3 first, Tier 1 second
      const vs = makeVectorStore([TIER3_EVIDENCE, TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const humanContent = (getMockInvoke(agent).mock.calls[0][0] as Array<{ content: string }>)[1]
        .content;
      const tier1Pos = humanContent.indexOf(TIER1_EVIDENCE.metadata.fileHash);
      const tier3Pos = humanContent.indexOf(TIER3_EVIDENCE.metadata.fileHash);
      expect(tier1Pos).toBeLessThan(tier3Pos);
    });

    it('uses strict filter (category + targetEntity) on first search', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const searchMock = (vs as unknown as { searchSimilarEvidence: jest.Mock })
        .searchSimilarEvidence;
      expect(searchMock).toHaveBeenCalledTimes(1);
      const firstCallFilter = searchMock.mock.calls[0][2] as Record<string, unknown>;
      expect(firstCallFilter).toHaveProperty('$and');
    });

    it('falls back to category-only filter when strict filter returns no results', async () => {
      // First call returns empty; second call returns evidence
      const vs = makeVectorStore([], [TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      const result = await agent.generateArgument('Side Effect Withholding', 'Unknown Entity');

      expect(result).toBeDefined();
      const searchMock = (vs as unknown as { searchSimilarEvidence: jest.Mock })
        .searchSimilarEvidence;
      expect(searchMock).toHaveBeenCalledTimes(2);
      // Second call should use a simpler filter (category only, no $and)
      const fallbackFilter = searchMock.mock.calls[1][2] as Record<string, unknown>;
      expect(fallbackFilter).not.toHaveProperty('$and');
      expect(fallbackFilter).toHaveProperty('category');
    });

    it('throws an error when both filters return no evidence', async () => {
      const vs = makeVectorStore([], []);
      const agent = new LegalMasterAgent(vs);

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Unknown Entity'),
      ).rejects.toThrow('No evidence found');
    });

    it('propagates errors thrown by the LLM chain', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockRejectedValueOnce(new Error('LLM rate limit'));

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Ministry of Health'),
      ).rejects.toThrow('LLM rate limit');
    });

    it('throws a Zod error when the LLM returns a malformed object', async () => {
      const vs = makeVectorStore([TIER1_EVIDENCE]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce({ title: 42, citedHashes: 'not-an-array' });

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Ministry of Health'),
      ).rejects.toThrow();
    });

    it('propagates errors thrown by the vector store', async () => {
      const failingVs = {
        searchSimilarEvidence: jest.fn().mockRejectedValue(new Error('Pinecone connection failed')),
      } as unknown as VectorStoreService;
      const agent = new LegalMasterAgent(failingVs);

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Ministry of Health'),
      ).rejects.toThrow('Pinecone connection failed');
    });
  });
});
