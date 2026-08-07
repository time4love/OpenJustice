import { LegalMasterAgent, ArgumentOutputSchema } from '../src/services/LegalMasterAgent';
import { VectorStoreService, VectorSearchResult } from '../src/services/VectorStoreService';

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

// Mock Prisma — returns full evidence records keyed by fileHash
const mockFindMany = jest.fn();
jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMockInvoke(agent: LegalMasterAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

function makeVectorStore(
  primaryResults: VectorSearchResult[] = [],
): VectorStoreService {
  const mock = {
    searchSimilarEvidence: jest.fn().mockResolvedValue(primaryResults),
  };
  return mock as unknown as VectorStoreService;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Vector search results — fileHash + content only (Pinecone stores no other metadata)
const TIER1_VECTOR: VectorSearchResult = {
  fileHash: '0xabc123def456aaa',
  content: 'Internal memo suppressing myocarditis data',
  score: 0.95,
};
const TIER2_VECTOR: VectorSearchResult = {
  fileHash: '0xdef456abc789bbb',
  content: 'Official press release with misleading efficacy claims',
  score: 0.88,
};
const TIER3_VECTOR: VectorSearchResult = {
  fileHash: '0xfff999ccc111ddd',
  content: 'News article about vaccine side effects',
  score: 0.72,
};

// Prisma records — full structured metadata
const TIER1_ROW = {
  fileHash: '0xabc123def456aaa',
  evidenceTier: 'Tier 1: Smoking Gun',
  category: 'Side Effect Withholding',
  targetEntity: 'Ministry of Health',
  summary: 'Internal memo explicitly instructing staff to suppress myocarditis reporting.',
  evidenceDate: '2021-03-10',
};
const TIER2_ROW = {
  fileHash: '0xdef456abc789bbb',
  evidenceTier: 'Tier 2: Material',
  category: 'Side Effect Withholding',
  targetEntity: 'Ministry of Health',
  summary: 'Official document directly contradicting later-released trial data.',
  evidenceDate: '2021-08-23',
};
const TIER3_ROW = {
  fileHash: '0xfff999ccc111ddd',
  evidenceTier: 'Tier 3: Supporting',
  category: 'Side Effect Withholding',
  targetEntity: 'Unknown',
  summary: 'Media report on patterns of unreported adverse events.',
  evidenceDate: 'Unknown',
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
    beforeEach(() => {
      mockFindMany.mockReset();
    });

    it('returns a validated ArgumentOutput when evidence is found', async () => {
      const vs = makeVectorStore([TIER1_VECTOR, TIER2_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW, TIER2_ROW]); // strict filter
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      const result = await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      expect(result.title).toBe(MOCK_ARGUMENT.title);
      expect(result.legalTheory).toBe(MOCK_ARGUMENT.legalTheory);
      expect(result.draftedText).toContain('0xabc123def456aaa');
      expect(result.citedHashes).toHaveLength(2);
    });

    it('invokes the chain with a system prompt and human message', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW]);
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
      const vs = makeVectorStore([TIER1_VECTOR, TIER2_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW, TIER2_ROW]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const humanContent = (getMockInvoke(agent).mock.calls[0][0] as Array<{ content: string }>)[1]
        .content;
      expect(humanContent).toContain(TIER1_VECTOR.fileHash);
      expect(humanContent).toContain(TIER2_VECTOR.fileHash);
    });

    it('sorts evidence so Tier 1 appears before Tier 3 in the prompt', async () => {
      // Prisma returns Tier 3 first then Tier 1 — agent must re-sort
      const vs = makeVectorStore([TIER3_VECTOR, TIER1_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER3_ROW, TIER1_ROW]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      const humanContent = (getMockInvoke(agent).mock.calls[0][0] as Array<{ content: string }>)[1]
        .content;
      const tier1Pos = humanContent.indexOf(TIER1_VECTOR.fileHash);
      const tier3Pos = humanContent.indexOf(TIER3_VECTOR.fileHash);
      expect(tier1Pos).toBeLessThan(tier3Pos);
    });

    it('queries Prisma with strict filter (category + targetEntity) first', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      await agent.generateArgument('Side Effect Withholding', 'Ministry of Health');

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const firstCallWhere = mockFindMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(firstCallWhere).toHaveProperty('category', 'Side Effect Withholding');
      expect(firstCallWhere).toHaveProperty('targetEntity', 'Ministry of Health');
    });

    it('falls back to category-only Prisma query when strict filter returns no results', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany
        .mockResolvedValueOnce([]) // strict filter — nothing
        .mockResolvedValueOnce([TIER1_ROW]); // category-only — match
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockResolvedValueOnce(MOCK_ARGUMENT);

      const result = await agent.generateArgument('Side Effect Withholding', 'Unknown Entity');

      expect(result).toBeDefined();
      expect(mockFindMany).toHaveBeenCalledTimes(2);
      const fallbackWhere = mockFindMany.mock.calls[1][0].where as Record<string, unknown>;
      expect(fallbackWhere).toHaveProperty('category', 'Side Effect Withholding');
      expect(fallbackWhere).not.toHaveProperty('targetEntity');
    });

    it('throws an error when both Prisma queries return no evidence', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany.mockResolvedValue([]);
      const agent = new LegalMasterAgent(vs);

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Unknown Entity'),
      ).rejects.toThrow('No evidence found');
    });

    it('propagates errors thrown by the LLM chain', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW]);
      const agent = new LegalMasterAgent(vs);
      getMockInvoke(agent).mockRejectedValueOnce(new Error('LLM rate limit'));

      await expect(
        agent.generateArgument('Side Effect Withholding', 'Ministry of Health'),
      ).rejects.toThrow('LLM rate limit');
    });

    it('throws a Zod error when the LLM returns a malformed object', async () => {
      const vs = makeVectorStore([TIER1_VECTOR]);
      mockFindMany.mockResolvedValueOnce([TIER1_ROW]);
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
