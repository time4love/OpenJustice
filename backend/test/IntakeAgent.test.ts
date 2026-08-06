import { IntakeAgent, IntakeOutputSchema, EVIDENCE_TIER } from '../src/services/IntakeAgent';
import type { VectorStoreService } from '../src/services/VectorStoreService';

// ---------------------------------------------------------------------------
// Mock @langchain/anthropic so no real API calls are made.
// The mock model exposes both .invoke() (for vision extraction) and
// .withStructuredOutput() (which returns a chain with its own .invoke()).
// ---------------------------------------------------------------------------

jest.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: jest.fn().mockImplementation(() => ({
      invoke: jest.fn(),
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the mocked extraction `invoke` from agent.model. */
function getExtractionInvoke(agent: IntakeAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).model.invoke as jest.Mock;
}

/** Returns the mocked classification `invoke` from the structured output chain. */
function getClassificationInvoke(agent: IntakeAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).classificationChain.invoke as jest.Mock;
}

/** Creates a minimal VectorStoreService mock. */
function makeMockVectorStore(
  contextResults: Array<{ metadata: { tier: string; category: string; summary: string } }> = [],
): VectorStoreService {
  return {
    searchSimilarEvidence: jest.fn().mockResolvedValue(contextResults),
  } as unknown as VectorStoreService;
}

/** Simulates a LangChain BaseMessageChunk with string content. */
function mockExtractionMessage(text: string) {
  return { content: text };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXTRACTED_TEXT = 'INTERNAL MEMO — Ministry of Health, Dept. of Vaccines. Date: 2021-03-10.\n' +
  'Subject: Adverse event reporting — myocarditis cases under age 30.\n' +
  'This memo instructs regional directors to delay publication of myocarditis figures pending review.';

const SMOKING_GUN_RESPONSE = {
  isRelevant: true,
  category: 'Side Effect Withholding' as const,
  summary:
    'מסמך פנימי של משרד הבריאות מנחה מנהלים אזוריים לעכב פרסום נתוני דלקת שריר לב לאחר חיסון. ' +
    'המסמך נושא תאריך ולוגו רשמי ומהווה הוכחה ישירה להסתרת מידע.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidenceTier: EVIDENCE_TIER.SMOKING_GUN,
};

const ANECDOTAL_RESPONSE = {
  isRelevant: true,
  category: 'Coercion' as const,
  summary: 'פוסט ברשת חברתית מתאר לחץ מצד מעסיק להתחסן. אין תיעוד נוסף או פרטים מזהים.',
  missingInformation: ['שם המעסיק חסר', 'אין תאריך', 'אין תיעוד כתוב'],
  targetEntity: 'Unknown',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
};

const IRRELEVANT_RESPONSE = {
  isRelevant: false,
  category: 'Other' as const,
  summary: 'הטקסט שהוגש הוא ביקורת מסעדה ואינו רלוונטי לתביעה.',
  missingInformation: [],
  targetEntity: 'Unknown',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
};

const TEST_FILE_BUFFER = Buffer.from('fake-file-content');
const TEST_MIME_JPEG = 'image/jpeg';
const TEST_MIME_PDF = 'application/pdf';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntakeAgent', () => {
  let mockVectorStore: VectorStoreService;
  let agent: IntakeAgent;

  beforeEach(() => {
    mockVectorStore = makeMockVectorStore();
    agent = new IntakeAgent(mockVectorStore);
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

    it('rejects a missing targetEntity field', () => {
      const { targetEntity: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts a targetEntity of "Unknown" for unidentifiable entity', () => {
      expect(() => IntakeOutputSchema.parse(IRRELEVANT_RESPONSE)).not.toThrow();
    });
  });

  // ---- analyzeEvidence — happy paths --------------------------------------

  describe('analyzeEvidence', () => {
    it('returns a correctly typed Smoking Gun result', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(true);
      expect(result.category).toBe('Side Effect Withholding');
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.SMOKING_GUN);
      expect(result.missingInformation).toHaveLength(0);
      expect(result.targetEntity).toBe('Ministry of Health');
    });

    it('returns a correctly typed Anecdotal result', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.ANECDOTAL);
      expect(result.missingInformation).toHaveLength(3);
    });

    it('returns isRelevant=false for unrelated content', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage('Great pasta restaurant!'));
      getClassificationInvoke(agent).mockResolvedValueOnce(IRRELEVANT_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(false);
      expect(result.category).toBe('Other');
    });

    it('passes a system prompt and file content block to the extraction model', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const extractionArgs = getExtractionInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: unknown;
      }>;
      expect(extractionArgs[0].role).toBe('system');
      expect(extractionArgs[1].role).toBe('human');
      // Human message content should be an array (file block + text block)
      expect(Array.isArray(extractionArgs[1].content)).toBe(true);
    });

    it('embeds the file as an image_url block for JPEG', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const extractionArgs = getExtractionInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: Array<{ type: string; image_url?: { url: string } }>;
      }>;
      const humanContent = extractionArgs[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('embeds the file as a document block for PDF', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PDF);

      const extractionArgs = getExtractionInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: Array<{ type: string; source?: { media_type: string } }>;
      }>;
      const humanContent = extractionArgs[1].content;
      expect(humanContent[0].type).toBe('document');
      expect(humanContent[0].source?.media_type).toBe('application/pdf');
    });

    it('queries the vector store with the first 500 chars of extracted text', async () => {
      const longText = 'A'.repeat(600);
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(longText));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const searchArg = (mockVectorStore.searchSimilarEvidence as jest.Mock).mock.calls[0][0] as string;
      expect(searchArg).toHaveLength(500);
    });

    it('requests exactly 3 context results from the vector store', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const limitArg = (mockVectorStore.searchSimilarEvidence as jest.Mock).mock.calls[0][1] as number;
      expect(limitArg).toBe(3);
    });

    it('includes extracted text in the classification human message', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const classArgs = getClassificationInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(classArgs[0].role).toBe('system');
      expect(classArgs[1].role).toBe('human');
      expect(classArgs[1].content).toContain(EXTRACTED_TEXT);
    });

    it('appends context block to classification message when vector store returns results', async () => {
      const contextResults = [
        { metadata: { tier: 'Tier 1: Smoking Gun', category: 'Side Effect Withholding', summary: 'Related existing evidence.' } },
      ];
      mockVectorStore = makeMockVectorStore(contextResults);
      agent = new IntakeAgent(mockVectorStore);

      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const classArgs = getClassificationInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(classArgs[1].content).toContain('Context');
      expect(classArgs[1].content).toContain('Related existing evidence.');
    });

    it('sends no context block when vector store returns empty results', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const classArgs = getClassificationInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(classArgs[1].content).not.toContain('Context');
      expect(classArgs[1].content).toBe(EXTRACTED_TEXT);
    });

    it('propagates errors thrown by the extraction model', async () => {
      getExtractionInvoke(agent).mockRejectedValueOnce(new Error('Vision API timeout'));

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow(
        'Vision API timeout',
      );
    });

    it('propagates errors thrown by the classification chain', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockRejectedValueOnce(new Error('Classification failed'));

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow(
        'Classification failed',
      );
    });

    it('propagates errors thrown by the vector store', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      (mockVectorStore.searchSimilarEvidence as jest.Mock).mockRejectedValueOnce(
        new Error('Pinecone unavailable'),
      );

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow(
        'Pinecone unavailable',
      );
    });

    it('throws a Zod error if the classification LLM returns a malformed object', async () => {
      getExtractionInvoke(agent).mockResolvedValueOnce(mockExtractionMessage(EXTRACTED_TEXT));
      getClassificationInvoke(agent).mockResolvedValueOnce({ isRelevant: 'not-a-boolean' });

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow();
    });

    it('handles BaseMessageChunk with content block array (not plain string)', async () => {
      // Simulate Claude returning content as an array of text blocks
      const arrayContentMessage = {
        content: [{ type: 'text', text: 'Block one. ' }, { type: 'text', text: 'Block two.' }],
      };
      getExtractionInvoke(agent).mockResolvedValueOnce(arrayContentMessage);
      getClassificationInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.isRelevant).toBe(true);

      // Verify the classification received the concatenated text
      const classArgs = getClassificationInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      expect(classArgs[1].content).toContain('Block one.');
      expect(classArgs[1].content).toContain('Block two.');
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
