import {
  DevilsAdvocateAgent,
  DevilsAdvocateOutputSchema,
  type ReferencedEvidence,
  type DevilsAdvocateOutput,
} from '../src/services/DevilsAdvocateAgent';

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

function getMockInvoke(agent: DevilsAdvocateAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

const EVIDENCE_FIXTURE: ReferencedEvidence[] = [
  {
    fileHash: 'hash-001',
    targetEntity: 'Ministry of Health',
    evidenceTier: 'Tier1',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-06-10',
    summary: 'Internal report from June 2021 showing officials were aware of cardiac adverse events post-vaccination.',
  },
  {
    fileHash: 'hash-002',
    targetEntity: 'Dr. Sharon Alroy-Preis',
    evidenceTier: 'Tier2',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-07-15',
    summary: 'Public TV interview where the official stated there was no evidence of cardiac risks.',
  },
];

const THESIS_TEXT =
  'Based on the internal June 2021 report, officials knew about cardiac risks. ' +
  'Despite this, the official publicly denied any such risks in July 2021. ' +
  'This constitutes a proven knowingly false public statement.';

const VALID_RESPONSE: DevilsAdvocateOutput = {
  counterArguments: [
    {
      claim: 'Officials knowingly made a false public statement',
      rebuttal: 'The internal report may not have reached this specific official before the interview — no evidence of personal knowledge is provided.',
      strength: 'STRONG',
    },
  ],
  evidenceGaps: [
    {
      description: 'No direct evidence that the official received or read the internal report before the interview.',
      suggestedSearch: 'Internal email chain or meeting minutes from June–July 2021 showing the report was distributed to the official.',
    },
  ],
  alternativeInterpretations: [
    'The official may have acted on different data available to her department at the time, not the internal report.',
  ],
  overallStrengthAssessment: 'MODERATE',
  summaryHe: 'הטענה המרכזית — כי הצהרה פומבית הייתה שקרית ביודעין — חסרה הוכחה לידיעה אישית. הראיות מראות מודעות ברמה הארגונית, אך לא הועברו ישירות לבכירה.',
};

const NO_EVIDENCE_RESPONSE: DevilsAdvocateOutput = {
  counterArguments: [
    {
      claim: 'The entire thesis',
      rebuttal: 'No evidence records were cited — all claims are unsupported assertions.',
      strength: 'STRONG',
    },
  ],
  evidenceGaps: [
    {
      description: 'Primary documentation for every claim in the thesis.',
      suggestedSearch: 'Internal ministry reports, meeting minutes, or public statements matching the claimed dates.',
    },
  ],
  alternativeInterpretations: ['All described events could have innocent, bureaucratic explanations.'],
  overallStrengthAssessment: 'WEAK',
  summaryHe: 'התזה אינה מגובה בראיות. כל הטענות דורשות תיעוד ראשוני.',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DevilsAdvocateAgent', () => {
  describe('analyze — valid responses', () => {
    it('returns a valid DevilsAdvocateOutput for a well-evidenced thesis', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      const result = await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      expect(result.counterArguments).toHaveLength(1);
      expect(result.counterArguments[0]).toMatchObject({
        claim: expect.any(String),
        rebuttal: expect.any(String),
        strength: expect.stringMatching(/^(WEAK|MODERATE|STRONG)$/),
      });
      expect(result.evidenceGaps).toHaveLength(1);
      expect(result.alternativeInterpretations).toHaveLength(1);
      expect(result.overallStrengthAssessment).toBe('MODERATE');
      expect(result.summaryHe).toBeTruthy();
    });

    it('handles a thesis with no referenced evidence', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(NO_EVIDENCE_RESPONSE);

      const result = await agent.analyze('A thesis with no evidence', [], [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      expect(result.overallStrengthAssessment).toBe('WEAK');
      expect(result.counterArguments.length).toBeGreaterThan(0);
    });

    it('accepts empty counterArguments and evidenceGaps for a strong thesis', async () => {
      const agent = new DevilsAdvocateAgent();
      const compellingResponse: DevilsAdvocateOutput = {
        counterArguments: [],
        evidenceGaps: [],
        alternativeInterpretations: [],
        overallStrengthAssessment: 'COMPELLING',
        summaryHe: 'הטיעון חזק ומגובה היטב בראיות.',
      };
      getMockInvoke(agent).mockResolvedValueOnce(compellingResponse);

      const result = await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      expect(result.counterArguments).toEqual([]);
      expect(result.evidenceGaps).toEqual([]);
      expect(result.overallStrengthAssessment).toBe('COMPELLING');
    });
  });

  describe('analyze — message construction', () => {
    it('includes the thesis text in the human message', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain(THESIS_TEXT);
    });

    it('includes all evidence summaries in the human message', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain(EVIDENCE_FIXTURE[0].summary);
      expect(human).toContain(EVIDENCE_FIXTURE[1].summary);
      expect(human).toContain(EVIDENCE_FIXTURE[0].targetEntity);
      expect(human).toContain(EVIDENCE_FIXTURE[1].evidenceDate);
      expect(human).toContain(EVIDENCE_FIXTURE[0].fileHash);
    });

    it('signals no evidence in the human message when evidence array is empty', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(NO_EVIDENCE_RESPONSE);

      await agent.analyze('thesis without evidence', [], [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain('no evidence records were cited');
    });

    it('includes a system message', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const system = messages.find((m) => m.role === 'system');
      expect(system).toBeDefined();
      expect(system?.content).toContain("Devil's Advocate");
    });

    it('reports correct evidence count in human message', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      await agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain('2 records');
    });

    it('uses singular "record" for a single evidence item', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      await agent.analyze(THESIS_TEXT, [EVIDENCE_FIXTURE[0]], [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain('1 record');
      expect(human).not.toContain('1 records');
    });

    it('truncates long evidence summaries at 400 characters', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce(VALID_RESPONSE);

      const longSummary = 'x'.repeat(600);
      await agent.analyze(THESIS_TEXT, [{ ...EVIDENCE_FIXTURE[0], summary: longSummary }], [], { trajectories: [], coverage: [], omittedGroups: 0 }, null);

      const messages = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
      const human = messages.find((m) => m.role === 'human')?.content ?? '';
      expect(human).toContain('x'.repeat(400));
      expect(human).not.toContain('x'.repeat(401));
    });
  });

  describe('analyze — LLM configuration', () => {
    it('uses temperature 0 for deterministic output', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory') as {
        LLMFactory: { getChatModel: jest.Mock };
      };
      new DevilsAdvocateAgent();
      expect(LLMFactory.getChatModel).toHaveBeenCalledWith('DEVILS_ADVOCATE', { temperature: 0 });
    });

    it('registers structured output with the correct tool name', () => {
      const { LLMFactory } = jest.requireMock('../src/factories/LLMFactory') as {
        LLMFactory: { getChatModel: jest.Mock };
      };
      const mockWithStructured = jest.fn().mockReturnValue({ invoke: jest.fn() });
      LLMFactory.getChatModel.mockReturnValueOnce({ withStructuredOutput: mockWithStructured });

      new DevilsAdvocateAgent();

      expect(mockWithStructured).toHaveBeenCalledWith(
        DevilsAdvocateOutputSchema,
        { name: 'devils_advocate_analysis' },
      );
    });
  });

  describe('analyze — Zod validation', () => {
    it('throws when the model returns an invalid schema', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce({
        counterArguments: 'not an array', // wrong type
        evidenceGaps: [],
        alternativeInterpretations: [],
        overallStrengthAssessment: 'MODERATE',
        summaryHe: 'summary',
      });

      await expect(agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null)).rejects.toThrow();
    });

    it('throws when overallStrengthAssessment is an invalid enum value', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce({
        ...VALID_RESPONSE,
        overallStrengthAssessment: 'EXCELLENT', // not in enum
      });

      await expect(agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null)).rejects.toThrow();
    });

    it('throws when a counterArgument is missing the strength field', async () => {
      const agent = new DevilsAdvocateAgent();
      getMockInvoke(agent).mockResolvedValueOnce({
        ...VALID_RESPONSE,
        counterArguments: [{ claim: 'x', rebuttal: 'y' }], // missing strength
      });

      await expect(agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null)).rejects.toThrow();
    });

    it('throws when summaryHe is missing', async () => {
      const agent = new DevilsAdvocateAgent();
      const { summaryHe: _, ...withoutSummary } = VALID_RESPONSE;
      getMockInvoke(agent).mockResolvedValueOnce(withoutSummary);

      await expect(agent.analyze(THESIS_TEXT, EVIDENCE_FIXTURE, [], { trajectories: [], coverage: [], omittedGroups: 0 }, null)).rejects.toThrow();
    });
  });
});

describe('DevilsAdvocateOutputSchema', () => {
  it('accepts a valid full response', () => {
    expect(DevilsAdvocateOutputSchema.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it('accepts empty arrays for all array fields', () => {
    expect(
      DevilsAdvocateOutputSchema.safeParse({
        counterArguments: [],
        evidenceGaps: [],
        alternativeInterpretations: [],
        overallStrengthAssessment: 'WEAK',
        summaryHe: 'אין ממצאים.',
      }).success,
    ).toBe(true);
  });

  it('accepts all valid overallStrengthAssessment values', () => {
    for (const value of ['WEAK', 'MODERATE', 'STRONG', 'COMPELLING']) {
      expect(
        DevilsAdvocateOutputSchema.safeParse({ ...VALID_RESPONSE, overallStrengthAssessment: value }).success,
      ).toBe(true);
    }
  });

  it('accepts all valid counterArgument strength values', () => {
    for (const strength of ['WEAK', 'MODERATE', 'STRONG']) {
      const response = {
        ...VALID_RESPONSE,
        counterArguments: [{ claim: 'x', rebuttal: 'y', strength }],
      };
      expect(DevilsAdvocateOutputSchema.safeParse(response).success).toBe(true);
    }
  });

  it('rejects invalid counterArgument strength value', () => {
    expect(
      DevilsAdvocateOutputSchema.safeParse({
        ...VALID_RESPONSE,
        counterArguments: [{ claim: 'x', rebuttal: 'y', strength: 'DEVASTATING' }],
      }).success,
    ).toBe(false);
  });

  it('rejects missing evidenceGap description', () => {
    expect(
      DevilsAdvocateOutputSchema.safeParse({
        ...VALID_RESPONSE,
        evidenceGaps: [{ suggestedSearch: 'search query' }], // missing description
      }).success,
    ).toBe(false);
  });

  it('rejects non-string alternativeInterpretations entry', () => {
    expect(
      DevilsAdvocateOutputSchema.safeParse({
        ...VALID_RESPONSE,
        alternativeInterpretations: [{ text: 'object instead of string' }],
      }).success,
    ).toBe(false);
  });
});
