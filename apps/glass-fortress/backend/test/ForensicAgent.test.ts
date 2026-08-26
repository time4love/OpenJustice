import {
  ForensicAgent,
  ForensicOutputSchema,
  deriveSignificance,
  MAX_CLASSIFICATION_DRAWS,
} from '../src/services/ForensicAgent';
import { LLMFactory } from '../src/factories/LLMFactory';

// ---------------------------------------------------------------------------
// Mock LLMFactory — no real API calls
//
// Fixtures are mocked with mockResolvedValue rather than ...Once: the agent draws
// again when a draw leaves input undescribed, and several of these fixtures
// deliberately return no items for non-empty chunks. A one-shot mock would make
// the second draw return undefined and fail these tests for a reason unrelated to
// what they assert. Sequencing matters only in the best-of-N block below, which
// uses ...Once on purpose.
// ---------------------------------------------------------------------------

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
  // The agent records which model judged a row, so the factory mock has to
  // provide the identity too — a module mock that omits a real export makes the
  // agent unconstructable for reasons unrelated to what a test is asserting.
  resolveModelId: jest.fn().mockReturnValue('gemini:test-model'),
}));

function getMockInvoke(agent: ForensicAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// The model classifies PER ITEM; the diff-level category set and significance
// are both derived, so no fixture supplies either as model output.
const SIGNIFICANT_RESPONSE = {
  deletedItems: [
    {
      summary: 'הובטח כי תופעות הלוואי קלות וזמניות בלבד',
      exactQuote: 'Side effects are mild and temporary.',
      investigativeCategories: ['WITHHOLDING_INFORMATION'],
      relocated: false,
    },
    {
      summary: 'ניסוח "אישור שימוש חירום" הוסר מהדף',
      exactQuote: 'Emergency Use Authorization approved.',
      investigativeCategories: [],
      relocated: false,
    },
  ],
  addedItems: [
    {
      summary: 'נוספה הוראה המחייבת עובדים לקבל חיסון',
      exactQuote: 'All employees must be vaccinated.',
      investigativeCategories: ['COERCION_MANDATE'],
      relocated: false,
    },
  ],
  legalSignificance:
    'הסרת האזהרה בדבר תופעות לוואי נעשתה 18 יום לאחר שדו"ח פנימי הדגיש סיכונים קרדיולוגיים.',
};

const COSMETIC_RESPONSE = {
  deletedItems: [],
  addedItems: [],
  legalSignificance: 'עדכון קישורי ניווט בלבד ללא שינוי בתוכן הרפואי או הרגולטורי.',
};

const RELATED_EVIDENCE = [
  {
    date: '2021-05-15',
    summary: 'דו"ח פנימי של משרד הבריאות',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    targetEntity: 'Ministry of Health',
    evidenceRole: 'Incriminating',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForensicAgent', () => {
  it('parses a legally significant response and returns the correct shape', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue(SIGNIFICANT_RESPONSE);

    const result = await agent.analyzeChange(
      ['Side effects are mild and temporary.', 'Emergency Use Authorization approved.'],
      ['All employees must be vaccinated.'],
      'https://health.gov.il/vaccines',
      '2021-06-01',
      RELATED_EVIDENCE,
    );

    expect(result.isLegallySignificant).toBe(true);
    expect(result.deletedItems).toHaveLength(2);
    expect(result.addedItems).toHaveLength(1);
    expect(result.deletedItems[0]).toHaveProperty('summary');
    expect(result.deletedItems[0]).toHaveProperty('exactQuote');
    expect(result.legalSignificance).toContain('קרדיולוגיים');
  });

  it('parses a cosmetic (not significant) response', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue(COSMETIC_RESPONSE);

    const result = await agent.analyzeChange(
      ['Navigation item removed'],
      ['New footer link added'],
      'https://health.gov.il/vaccines',
      '2021-06-01',
      [],
    );

    expect(result.isLegallySignificant).toBe(false);
    expect(result.investigativeCategories).toEqual([]);
    expect(result.deletedItems).toEqual([]);
    expect(result.addedItems).toEqual([]);
  });

  it('throws a Zod validation error when the model returns an invalid schema', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [
        {
          summary: 'x',
          exactQuote: 'y',
          investigativeCategories: 'WITHHOLDING_INFORMATION', // should be an array
          relocated: false,
        },
      ],
      addedItems: [],
      legalSignificance: '',
    });

    await expect(
      agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []),
    ).rejects.toThrow();
  });

  it('rejects a category outside the approved taxonomy', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      ...COSMETIC_RESPONSE,
      deletedItems: [
        {
          summary: 'x',
          exactQuote: 'y',
          investigativeCategories: ['GENERALLY_SUSPICIOUS'],
          relocated: false,
        },
      ],
    });

    await expect(
      agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Significance derivation — a change is evidence for THIS investigation
  // exactly when it advances one of its standing concerns. The model is never
  // asked for the boolean, so classification and flag cannot disagree.
  // -------------------------------------------------------------------------
  describe('significance derivation', () => {
    it('is true when at least one category matched', async () => {
      const agent = new ForensicAgent();
      getMockInvoke(agent).mockResolvedValue({
        ...COSMETIC_RESPONSE,
        deletedItems: [
          {
            summary: 'x',
            exactQuote: 'y',
            investigativeCategories: ['INFORMED_CONSENT'],
            relocated: false,
          },
        ],
      });

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(true);
      expect(result.investigativeCategories).toEqual(['INFORMED_CONSENT']);
    });

    it('is false when no category matched', async () => {
      const agent = new ForensicAgent();
      getMockInvoke(agent).mockResolvedValue(COSMETIC_RESPONSE);

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(false);
    });

    it('ignores a significance flag the model volunteers', async () => {
      const agent = new ForensicAgent();
      // A model that hedges — claiming significance while matching no concern —
      // must not be able to force evidence creation.
      getMockInvoke(agent).mockResolvedValue({
        ...COSMETIC_RESPONSE,
        isLegallySignificant: true,
      });

      const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);

      expect(result.isLegallySignificant).toBe(false);
    });
  });

  it('exposes derivation independently of the agent', () => {
    expect(deriveSignificance([])).toBe(false);
    expect(deriveSignificance(['STATISTICAL_MANIPULATION'])).toBe(true);
  });

  it('passes both deletions and additions in the human message', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue(COSMETIC_RESPONSE);

    await agent.analyzeChange(
      ['deleted text chunk'],
      ['added text chunk'],
      'https://health.gov.il',
      '2021-06-01',
      [],
    );

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMessage = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMessage).toContain('deleted text chunk');
    expect(humanMessage).toContain('added text chunk');
    expect(humanMessage).toContain('https://health.gov.il');
    expect(humanMessage).toContain('2021-06-01');
  });

  it('includes correlated evidence in the human message', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue(COSMETIC_RESPONSE);

    await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', RELATED_EVIDENCE);

    const call = getMockInvoke(agent).mock.calls[0][0] as { role: string; content: string }[];
    const humanMessage = call.find((m) => m.role === 'human')?.content ?? '';
    expect(humanMessage).toContain('Ministry of Health');
    expect(humanMessage).toContain('WITHHOLDING_INFORMATION');
  });

  it('handles empty deletions and additions gracefully', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue(COSMETIC_RESPONSE);

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2021-06-01', []);
    expect(result).toMatchObject(COSMETIC_RESPONSE);
  });

  describe('ForensicOutputSchema validation', () => {
    it('accepts a valid significant output', () => {
      // ForensicOutputSchema is the PERSISTED shape: it carries both derived
      // fields, where the fixture is raw model output and carries neither.
      const result = ForensicOutputSchema.safeParse({
        ...SIGNIFICANT_RESPONSE,
        investigativeCategories: ['WITHHOLDING_INFORMATION', 'COERCION_MANDATE'],
        isLegallySignificant: true,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid cosmetic output', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        investigativeCategories: [],
        isLegallySignificant: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown investigative category', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        isLegallySignificant: false,
        deletedItems: [
          {
            summary: 'x',
            exactQuote: 'y',
            investigativeCategories: ['NOT_A_REAL_CATEGORY'],
            relocated: false,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing isLegallySignificant field', () => {
      const result = ForensicOutputSchema.safeParse({
        deletedItems: [],
        addedItems: [],
        legalSignificance: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-array deletedItems', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        deletedItems: 'not an array',
      });
      expect(result.success).toBe(false);
    });

    it('rejects deletedItems entry missing exactQuote', () => {
      const result = ForensicOutputSchema.safeParse({
        ...COSMETIC_RESPONSE,
        deletedItems: [{ summary: 'a summary' }],
      });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Item-level classification.
//
// Judging a diff as a whole let a consequential change be masked by the company
// it kept. On 2026-08-22 the deletion of the 4th-dose efficacy figures — the
// same text classified significant in five other diffs of the same scan — was
// rated immaterial in the one diff where it arrived bundled with six routine
// administrative removals and six additions announcing a new campaign.
//
// That is structural, not bad luck: it means the reliable way to remove a
// consequential claim unnoticed is to remove it alongside enough paperwork.
// ---------------------------------------------------------------------------
describe('item-level classification', () => {
  const routine = (n: number) => ({
    summary: `עדכון תפעולי ${n}`,
    exactQuote: `routine ${n}`,
    investigativeCategories: [],
    relocated: false,
  });

  it('flags a diff whose single significant item is buried among routine ones', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [
        routine(1),
        routine(2),
        routine(3),
        {
          summary: 'הסרת נתוני יעילות מספריים',
          exactQuote: 'הממצאים מראים כי מי שחוסנו בחיסון רביעי מוגנים מפני הדבקה פי 2',
          investigativeCategories: ['STATISTICAL_MANIPULATION'],
          relocated: false,
        },
        routine(4),
        routine(5),
      ],
      addedItems: [routine(6), routine(7)],
      legalSignificance: 'עדכון מבצע חיסונים.',
    });

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2022-11-29', []);

    expect(result.isLegallySignificant).toBe(true);
    expect(result.investigativeCategories).toEqual(['STATISTICAL_MANIPULATION']);
  });

  it('keeps a wholly routine diff routine, however many items it has', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [routine(1), routine(2), routine(3)],
      addedItems: [routine(4), routine(5)],
      legalSignificance: 'עדכון ניווט בלבד.',
    });

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2022-01-01', []);

    expect(result.isLegallySignificant).toBe(false);
    expect(result.investigativeCategories).toEqual([]);
  });

  it('unions categories across items without duplicating them', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [
        { summary: 'a', exactQuote: 'a', investigativeCategories: ['INFORMED_CONSENT'], relocated: false },
        { summary: 'b', exactQuote: 'b', investigativeCategories: ['INFORMED_CONSENT', 'WITHHOLDING_INFORMATION'], relocated: false },
      ],
      addedItems: [],
      legalSignificance: '',
    });

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2022-01-01', []);

    expect([...result.investigativeCategories].sort()).toEqual([
      'INFORMED_CONSENT',
      'WITHHOLDING_INFORMATION',
    ]);
  });

  // -------------------------------------------------------------------------
  // Relocation is the one case where surrounding context legitimately changes
  // the reading. Text moved elsewhere on the page appears as both a deletion and
  // an addition; reporting the deletion alone claims the removal of something
  // still on the page. The aggregate judgment used to absorb this — per-item
  // classification does not, so it is excluded explicitly.
  // -------------------------------------------------------------------------
  it('ignores a relocated item — moved text removes nothing', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [
        {
          summary: 'הנוסח המקורי הוסר',
          exactQuote: 'אין סיכוי לחלות בקורונה בגלל החיסון',
          investigativeCategories: ['SAFETY_CLAIM_ALTERATION'],
          relocated: true,
        },
      ],
      addedItems: [
        {
          summary: 'הנוסח שובץ מחדש במיקום אחר',
          exactQuote: 'אין סיכוי לחלות בקורונה בגלל החיסון',
          investigativeCategories: ['SAFETY_CLAIM_ALTERATION'],
          relocated: true,
        },
      ],
      legalSignificance: 'העברת פסקה בתוך הדף.',
    });

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2022-01-05', []);

    expect(result.investigativeCategories).toEqual([]);
    expect(result.isLegallySignificant).toBe(false);
  });

  it('still flags a genuine change that shares a diff with a relocation', async () => {
    const agent = new ForensicAgent();
    getMockInvoke(agent).mockResolvedValue({
      deletedItems: [
        { summary: 'הועבר', exactQuote: 'moved', investigativeCategories: ['SAFETY_CLAIM_ALTERATION'], relocated: true },
        { summary: 'נמחק באמת', exactQuote: 'gone', investigativeCategories: ['WITHHOLDING_INFORMATION'], relocated: false },
      ],
      addedItems: [
        { summary: 'הועבר', exactQuote: 'moved', investigativeCategories: ['SAFETY_CLAIM_ALTERATION'], relocated: true },
      ],
      legalSignificance: '',
    });

    const result = await agent.analyzeChange([], [], 'https://health.gov.il', '2022-01-05', []);

    expect(result.investigativeCategories).toEqual(['WITHHOLDING_INFORMATION']);
    expect(result.isLegallySignificant).toBe(true);
  });
});

describe('ForensicAgent — best of N draws, scored on coverage', () => {
  const CHUNKS = ['first chunk of page text', 'second chunk of page text'];

  function draw(quotes: string[]): Record<string, unknown> {
    return {
      deletedItems: quotes.map((q) => ({
        summary: 's', exactQuote: q, investigativeCategories: [], relocated: false,
      })),
      addedItems: [],
      legalSignificance: 'x',
    };
  }

  function agentWith(...responses: Record<string, unknown>[]): {
    agent: ForensicAgent; invoke: jest.Mock;
  } {
    const invoke = jest.fn();
    for (const r of responses) invoke.mockResolvedValueOnce(r);
    (LLMFactory.getChatModel as jest.Mock).mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({ invoke }),
    });
    return { agent: new ForensicAgent(), invoke };
  }

  it('stops after one draw when coverage is already complete', async () => {
    const { agent, invoke } = agentWith(draw(CHUNKS));

    const out = await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    // The common case must cost exactly one call.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(out.draws).toBe(1);
    expect(out.coverage.complete).toBe(true);
  });

  it('redraws when a draw leaves chunks undescribed, and keeps the better one', async () => {
    const { agent, invoke } = agentWith(draw([CHUNKS[0] ?? '']), draw(CHUNKS));

    const out = await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(out.draws).toBe(2);
    expect(out.coverage.complete).toBe(true);
    expect(out.deletedItems).toHaveLength(2);
  });

  it('keeps the best draw when none is complete, rather than the last', async () => {
    const { agent } = agentWith(draw(CHUNKS.slice(0, 1)), draw([]), draw([]));

    const out = await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    // Last-wins would silently downgrade a row by redrawing it.
    expect(out.draws).toBe(3);
    expect(out.coverage.coveredChunks).toBe(1);
    expect(out.deletedItems).toHaveLength(1);
  });

  it('is bounded — a permanently incomplete diff cannot bill without limit', async () => {
    const { agent, invoke } = agentWith(draw([]), draw([]), draw([]), draw([]), draw([]));

    const out = await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    expect(invoke).toHaveBeenCalledTimes(MAX_CLASSIFICATION_DRAWS);
    expect(out.coverage.complete).toBe(false);
  });

  it('redraws the WHOLE diff, never the missed chunks in isolation', async () => {
    const { agent, invoke } = agentWith(draw([CHUNKS[0] ?? '']), draw(CHUNKS));

    await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    // Feeding back only the uncovered text would strip the surrounding page and
    // bias a fragment toward looking significant on its own.
    const first = JSON.stringify(invoke.mock.calls[0]);
    const second = JSON.stringify(invoke.mock.calls[1]);
    expect(second).toBe(first);
  });
});

describe('ForensicAgent — a failed draw is not a failed classification', () => {
  const CHUNKS = ['first chunk of page text', 'second chunk of page text'];

  function ok(quotes: string[]): Record<string, unknown> {
    return {
      deletedItems: quotes.map((q) => ({
        summary: 's', exactQuote: q, investigativeCategories: [], relocated: false,
      })),
      addedItems: [],
      legalSignificance: 'x',
    };
  }

  function agentWith(...outcomes: (Record<string, unknown> | Error)[]): {
    agent: ForensicAgent; invoke: jest.Mock;
  } {
    const invoke = jest.fn();
    for (const o of outcomes) {
      if (o instanceof Error) invoke.mockRejectedValueOnce(o);
      else invoke.mockResolvedValueOnce(o);
    }
    (LLMFactory.getChatModel as jest.Mock).mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({ invoke }),
    });
    return { agent: new ForensicAgent(), invoke };
  }

  it('retries after a truncated-JSON draw and uses the draw that succeeds', async () => {
    // The real failure: structured output cut mid-string when the answer does not
    // fit the budget. Letting it escape would abort a whole write run.
    const { agent, invoke } = agentWith(
      new Error('Unterminated string in JSON at position 16671'),
      ok(CHUNKS),
    );

    const out = await agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', []);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(out.draws).toBe(2);
    expect(out.coverage.complete).toBe(true);
  });

  it('counts a failed draw against the bound rather than retrying forever', async () => {
    const { agent, invoke } = agentWith(
      new Error('boom'), new Error('boom'), new Error('boom'), ok(CHUNKS),
    );

    await expect(agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', [])).rejects.toThrow(
      /Classification failed on all 3 draws/u,
    );
    expect(invoke).toHaveBeenCalledTimes(MAX_CLASSIFICATION_DRAWS);
  });

  it('throws rather than inventing an empty result when every draw fails', async () => {
    // An empty result would record "nothing changed on this page" as though a
    // model had said so.
    const { agent } = agentWith(new Error('a'), new Error('b'), new Error('c'));

    await expect(agent.analyzeChange(CHUNKS, [], 'u', '2022-01-01', [])).rejects.toThrow();
  });
});
