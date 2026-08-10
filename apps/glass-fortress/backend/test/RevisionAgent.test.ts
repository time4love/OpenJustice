import { RevisionAgent, RevisionOutputSchema, type UncitedEvidence } from '../src/services/RevisionAgent';
import type { DevilsAdvocateOutput } from '../src/services/DevilsAdvocateAgent';

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

function getMockInvoke(agent: RevisionAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CRITIQUE: DevilsAdvocateOutput = {
  counterArguments: [
    {
      claim: 'Three state arms acted in coordination',
      rebuttal: 'No evidence of inter-agency communication — only parallel independent actions.',
      strength: 'STRONG',
    },
  ],
  evidenceGaps: [
    {
      description: 'Missing MOH press directives to media about EUA messaging.',
      suggestedSearch: 'MOH press directives COVID vaccine EUA December 2020',
    },
  ],
  alternativeInterpretations: ['Simplified messaging was intentional for public accessibility, not deceptive.'],
  overallStrengthAssessment: 'WEAK',
  summaryHe: 'הטיעון סובל מפערים ראייתיים.',
};

const UNCITED: UncitedEvidence[] = [
  {
    fileHash: '0xnew001',
    summary: 'MOH internal briefing document on vaccine communication strategy.',
    category: 'Government Document',
    evidenceTier: 'Tier 1',
    evidenceRole: 'Incriminating',
    evidenceDate: '2020-11-15',
    targetEntity: 'משרד הבריאות',
  },
];

const VALID_REVISION = {
  revisedBody:
    '# הכחשת ה-EUA — התנהגות מקבילה של שלוש זרועות המדינה\n\n' +
    'בעוד שלא הוכח תיאום ישיר, **שלושה גורמים ממשלתיים** פעלו בנפרד תוך השמטת אותה עובדה קריטית.\n\n' +
    '## ציר הזמן\n\n' +
    '- 8 בדצמבר 2020 — כתבת Ynet: מעמד ה-EUA מוכר\n' +
    '- 19 בדצמבר 2020 — מאמר דעה של בליצר: אין אזכור ל-EUA\n' +
    '- 23 בדצמבר 2020 — איגרת צבאית: לחץ עמיתים ללא גילוי EUA',
  evidenceHashesToInclude: ['0xnew001'],
  revisionsExplained:
    'Softened "coordinated" to "parallel conduct" to address the main counter-argument. ' +
    'Added the MOH communication strategy document to partially close the directives gap.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RevisionAgent', () => {
  let agent: RevisionAgent;
  let mockInvoke: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new RevisionAgent();
    mockInvoke = getMockInvoke(agent);
    mockInvoke.mockResolvedValue(VALID_REVISION);
  });

  it('calls LLMFactory.getChatModel with REVISION provider key', () => {
    const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory') as {
      LLMFactory: { getChatModel: jest.Mock };
    };
    expect(LLMFactory.getChatModel).toHaveBeenCalledWith('REVISION', expect.objectContaining({ temperature: 0.3 }));
  });

  it('returns a valid RevisionOutput', async () => {
    const result = await agent.revise('Original thesis text.', CRITIQUE, UNCITED);

    expect(RevisionOutputSchema.safeParse(result).success).toBe(true);
    expect(result.revisedBody).toContain('EUA');
    expect(result.evidenceHashesToInclude).toContain('0xnew001');
    expect(result.revisionsExplained).toBeTruthy();
  });

  it('sends original thesis text in the human message', async () => {
    await agent.revise('The ministry concealed adverse events.', CRITIQUE, UNCITED);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('The ministry concealed adverse events.');
  });

  it('includes counter-arguments in the prompt', async () => {
    await agent.revise('Thesis text.', CRITIQUE, UNCITED);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('Three state arms acted in coordination');
    expect(humanMsg.content).toContain('No evidence of inter-agency communication');
  });

  it('includes evidence gaps in the prompt', async () => {
    await agent.revise('Thesis text.', CRITIQUE, UNCITED);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('Missing MOH press directives');
  });

  it('includes uncited evidence records in the prompt', async () => {
    await agent.revise('Thesis text.', CRITIQUE, UNCITED);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('0xnew001');
    expect(humanMsg.content).toContain('MOH internal briefing document');
  });

  it('sends a placeholder when no uncited evidence is available', async () => {
    await agent.revise('Thesis text.', CRITIQUE, []);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('no uncited evidence available');
  });

  it('includes overall strength in the critique block', async () => {
    await agent.revise('Thesis text.', CRITIQUE, UNCITED);

    const [, humanMsg] = mockInvoke.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(humanMsg.content).toContain('WEAK');
  });

  it('throws if the LLM returns an invalid schema', async () => {
    mockInvoke.mockResolvedValue({ revisedBody: 'only this field' });

    await expect(agent.revise('Text.', CRITIQUE, UNCITED)).rejects.toThrow();
  });

  it('RevisionOutputSchema validates a correct response', () => {
    expect(RevisionOutputSchema.safeParse(VALID_REVISION).success).toBe(true);
  });

  it('RevisionOutputSchema rejects when revisedBody is missing', () => {
    const { revisedBody: _, ...invalid } = VALID_REVISION;
    expect(RevisionOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('RevisionOutputSchema rejects when evidenceHashesToInclude is not an array', () => {
    expect(RevisionOutputSchema.safeParse({ ...VALID_REVISION, evidenceHashesToInclude: 'oops' }).success).toBe(false);
  });
});
