const invoked: unknown[][] = [];
const answers: { value: unknown } = { value: null };
/** Every agent the chat model was built for — the boundary records it, so the model that JUDGED is held (R82 Entry 3). */
const agents: string[] = [];
jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: (agent: string) => {
      agents.push(agent);
      return {
        withStructuredOutput: () => ({
          invoke: (messages: unknown[]) => {
            invoked.push(messages);
            return Promise.resolve(answers.value);
          },
        }),
      };
    },
  },
  resolveModelId: (agent: string) => `double:${agent}`,
}));

import { DESCRIBE_BOUND_PROVIDER } from '../src/lib/acceptedDocumentTypes';
import { modelFilePart } from '../src/lib/documentModelPart';
import {
  FORENSIC_PROMOTION_ASSESSMENT_PROMPT,
  FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION,
} from '../src/prompts/forensicPromotionAssessment';
import {
  PROMOTION_ASSESSOR_AGENT,
  PROMOTION_ASSESSOR_MODEL,
  PromotionAssessmentSchema,
  PromotionAssessor,
  type AssessedContent,
} from '../src/services/promotionAssessor';

// ---------------------------------------------------------------------------
// THE DEBATE'S ASSESSOR, HANDED A DOCUMENT — document flows §6 :705–:708, :739 (RULED 2026-09-25, R81 Q-3); evidence A4
// :1121 (R81 QA). THE MODEL IS MOCKED AT ITS BOUNDARY, `factories/LLMFactory`, as the describer's suite mocks it: what
// is held is the MESSAGE the provider would receive, and the schema its answer is parsed by. Nothing here spends a call.
// ---------------------------------------------------------------------------

const ANSWER = {
  hasSubstance: true,
  substanceGaps: [],
  verdict: 'SUPPORTS',
  objection: '',
  assessment: 'הטיעון מעוגן בתוכן.',
  assertions: [{ researcherClaim: 'ערוץ הדיווח', whatEvidenceShows: 'ערוץ הדיווח' }],
};

beforeEach(() => {
  invoked.length = 0;
  agents.length = 0;
  answers.value = ANSWER;
});

const TITLE = 'חוזר המנכ״ל';
const round = (content: AssessedContent, url: string | null = null) => ({
  url,
  content,
  passages: [`החוזר מורה לשמור את ערוץ הדיווח #doc_0x${'c1'.repeat(32)}`],
  rationale: 'החוזר מורה לשמור את ערוץ הדיווח פתוח, והפסקה המצטטת אומרת זאת במפורש.',
  priorTurns: [],
});

/** The user message the provider was handed — its one `content`, a string or the parts. */
function userContent(): unknown {
  const messages = invoked.at(0) as { role: string; content: unknown }[] | undefined;
  const user = messages?.find((m) => m.role === 'user');
  if (user === undefined) throw new Error('the assessor was not invoked with a user message');
  return user.content;
}

describe('what the assessor is handed about a DOCUMENT, by reading (§6 :705–:708, :739)', () => {
  it('TEXT: the title and CURRENT(d)’s computed text, in one string — and NO page line, a document has no page', async () => {
    await new PromotionAssessor().assess(round({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'TEXT', text: 'יש לשמור את ערוץ הדיווח פתוח.' } }));
    const content = userContent();
    expect(typeof content).toBe('string');
    expect(content).toContain(`מסמך „${TITLE}”`);
    expect(content).toContain('--- הטקסט המחושב של המסמך ---\nיש לשמור את ערוץ הדיווח פתוח.');
    expect(content).not.toContain('דף:');
  });

  it('FILE: a HELD file with no text travels AS ITS FILE — the ONE builder’s part, the text beside it', async () => {
    const file = { mimeType: 'image/png', base64: 'iVBORw0KGgo=' };
    await new PromotionAssessor().assess(round({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'FILE', file } }));
    const content = userContent() as unknown[];
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);
    expect(content.at(0)).toEqual({ type: 'text', text: expect.stringContaining('הקובץ עצמו מצורף') as unknown });
    // EXACTLY what `describe_document` hands a provider — `modelFilePart`, the builder both call (§6 :739 as ruled).
    expect(content.at(1)).toEqual(modelFilePart(file));
  });

  it('UNREAD: bytes no model reads — the title plus ONE sentence saying so, and no part at all', async () => {
    await new PromotionAssessor().assess(round({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'UNREAD' } }));
    const content = userContent();
    expect(typeof content).toBe('string');
    expect(content).toContain(`רשומה: מסמך „${TITLE}”\n\nתוכן המסמך הוא קובץ שאף מודל אינו קורא, ולכן לא הועבר אליך דבר מלבד שמו.\n\n`);
  });

  it('a SEALED document without a title (step 32’s door) is named as untitled — never an empty pair of quotes', async () => {
    await new PromotionAssessor().assess(round({ kind: 'DOCUMENT', title: null, reading: { form: 'TEXT', text: 'x' } }));
    expect(userContent()).toContain('רשומה: מסמך ללא כותרת');
  });

  it('a CAPTURE is the string it always was — the page line kept, no part added', async () => {
    await new PromotionAssessor().assess(round({ kind: 'CAPTURE', capture: '20220805120000', text: 'טקסט' }, 'https://corona.health.gov.il/'));
    const content = userContent();
    expect(typeof content).toBe('string');
    expect(content).toContain('דף: https://corona.health.gov.il/\n\nרשומה: צילום 20220805120000');
  });
});

describe('the ASSERTIONS are the model’s to name and the audit’s to verify (evidence A4 :1121, R81 QA)', () => {
  it('the schema REQUIRES them — an answer without the key is refused by zod, never defaulted', async () => {
    const { assertions: _dropped, ...without } = ANSWER;
    answers.value = without;
    await expect(new PromotionAssessor().assess(round({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'UNREAD' } }))).rejects.toThrow();
  });

  it('the schema asks for the two model-written fields ONLY — no verdict the model could grade itself with', () => {
    const element = PromotionAssessmentSchema.shape.assertions.element;
    expect(Object.keys(element.shape).sort()).toEqual(['researcherClaim', 'whatEvidenceShows']);
  });

  it('the prompt asks for them by name, and carries its version stamp', () => {
    expect(FORENSIC_PROMOTION_ASSESSMENT_PROMPT).toContain('## הטענות שאתה טוען (assertions)');
    expect(FORENSIC_PROMOTION_ASSESSMENT_PROMPT).toContain('researcherClaim');
    expect(FORENSIC_PROMOTION_ASSESSMENT_PROMPT).toContain('whatEvidenceShows');
    expect(FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION).toBe('v3-document-record-and-assertions');
  });
});

describe('THE MODEL THAT JUDGED IS THE MODEL RECORDED — thesis A4 :1476’s `M`, A2 :1317 (R82 Entry 3, MEDIUM 2)', () => {
  it('the chat model is built for PROMOTION_ASSESSOR_AGENT — the agent PROMOTION_ASSESSOR_MODEL() names', () => {
    new PromotionAssessor();
    // ONE build, for the one agent; and the recorded id is that agent's (the factory double answers `double:<agent>`).
    expect(agents).toEqual([PROMOTION_ASSESSOR_AGENT]);
    expect(PROMOTION_ASSESSOR_MODEL()).toBe(`double:${String(agents.at(0))}`);
  });
});

describe('THE BOUND’S PROVIDER — a file part goes only to the provider `DESCRIBE_TOO_LARGE_BYTES` was measured for (R82 H2)', () => {
  const VARIABLE = `${PROMOTION_ASSESSOR_AGENT}_PROVIDER`;
  const ORIGINAL = process.env[VARIABLE];
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[VARIABLE];
    else process.env[VARIABLE] = ORIGINAL;
  });

  it('with FORENSIC_PROMOTION_PROVIDER unset, the assessor resolves to DESCRIBE_BOUND_PROVIDER — a change reddens here', () => {
    // The REAL factory: this suite mocks it at its boundary (`acceptedDocumentTypes.test.ts`' shape for the describer).
    const { resolveModelId } = jest.requireActual<{ resolveModelId: (agent: string) => string }>('../src/factories/LLMFactory');
    delete process.env[VARIABLE];
    expect(VARIABLE).toBe('FORENSIC_PROMOTION_PROVIDER');
    expect(resolveModelId(PROMOTION_ASSESSOR_AGENT).split(':').at(0)).toBe(DESCRIBE_BOUND_PROVIDER);
  });
});
