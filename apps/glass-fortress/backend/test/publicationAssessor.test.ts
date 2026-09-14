jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
// THE MODEL, RECORDED: `getChatModel` hands back a structured-output chain that records what it was invoked with and answers
// the raw object a case queued — the one place in the suite a model's RAW output reaches the parse. `mockModel` is read at
// CALL time only, so the hoisted factory never touches it before it is initialised.
const mockModel = { answers: [] as unknown[], invocations: [] as unknown[], asked: [] as unknown[] };
jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: (agent: string, options: unknown) => {
      mockModel.asked.push([agent, options]);
      return {
        withStructuredOutput: () => ({
          invoke: (messages: unknown): Promise<unknown> => {
            mockModel.invocations.push(messages);
            return Promise.resolve(mockModel.answers.shift());
          },
        }),
      };
    },
  },
}));

import * as corpusReads from '../src/services/corpusReads';
import { critiqueMaterial, loadHead } from '../src/services/criticMaterial';
import * as framingRounds from '../src/services/framingRounds';
import {
  assess,
  projectionOf,
  type PublicationAssessorOutput,
  type PublicationMaterial,
} from '../src/services/publicationAssessor';
import { assessorMaterial } from '../src/services/publishedThesis';
import * as trajectoryCitation from '../src/services/trajectoryCitation';
import { DIFF_NAME } from './helpers/corpusFixture';
import { resetDouble, store } from './helpers/evidenceDouble';
import {
  ANALYSIS,
  BOTH_EVIDENCE_MENTION,
  BOTH_TRAJECTORY_MENTION,
  CITING_BOTH_VERSION,
  NEXT_VERSION,
  NOTE,
  THESIS,
  TRAJECTORY_ID,
  TRAJECTORY_VERSION,
  VERSION,
} from './thesis/fixtures';
import { gap, round } from './thesis/gateWorld';
import { mentionRow } from './thesis/rows';
import { seedThesis } from './thesis/tools';

// ---------------------------------------------------------------------------
// THE PUBLICATION ASSESSOR — docs/gf-thesis-flows.md T5 :755–:765; the R49 sketch §d1–§d4, §f3. Thesis step 23.
//
// IN THE UNIT PROJECT, which gates. What the acceptance suite cannot see of a model actor:
//
//   the PARSE          a well-formed output passes; NOT_REACHED is exactly the rationale with no substance (refined)
//   the PROJECTION     what the gate reads — substance, the names, the allegations opinion
//   the MATERIAL       the text, the claim, the appeals that would publish, the rationale — and NO RECORD'S CONTENT,
//                      no analysis, no framing round, no note (R2 M2: the assessor judges only what it is handed)
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  mockModel.answers.length = 0;
  mockModel.invocations.length = 0;
  mockModel.asked.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const OUTPUT: PublicationAssessorOutput = {
  rationaleHasSubstance: true,
  substanceGaps: [],
  verdict: 'SUPPORTS',
  objection: '',
  names: [{ name: 'ישראל ישראלי', where: 'CALL', quote: 'ישראל ישראלי ראה את המסמך' }],
  allegationsFramed: true,
  allegationsNote: '',
  assessment: 'הנימוק בעל ממש, תואם את הטקסט, ללא שמות בטקסט.',
};

const MATERIAL: PublicationMaterial = {
  claim: 'הטענה',
  provision: null,
  text: 'הטקסט',
  call: [],
  requests: [],
  rationale: 'הנימוק',
};

describe('the parse — zod over the raw output, refined, never retried (T5 :755; R48 §6-R25)', () => {
  it('a well-formed output parses and is returned as the model gave it, from ONE draw of THESIS_PUBLICATION at temperature 0', async () => {
    mockModel.answers.push(OUTPUT);
    await expect(assess(MATERIAL)).resolves.toEqual(OUTPUT);
    expect(mockModel.asked).toEqual([['THESIS_PUBLICATION', { temperature: 0 }]]);
    expect(mockModel.invocations).toHaveLength(1);
  });

  it('SUPPORTS on a rationale with no substance REFUSES the parse and throws — and NOT_REACHED on a substantive one too', async () => {
    mockModel.answers.push({ ...OUTPUT, rationaleHasSubstance: false, substanceGaps: ['היכן היא נעצרת'] });
    await expect(assess(MATERIAL)).rejects.toThrow(/NOT_REACHED is exactly the rationale with no substance/);
    mockModel.answers.push({ ...OUTPUT, verdict: 'NOT_REACHED' });
    await expect(assess(MATERIAL)).rejects.toThrow(/NOT_REACHED is exactly the rationale with no substance/);
    expect(mockModel.invocations).toHaveLength(2);
  });

  it('NOT_REACHED with no substance parses — the one shape a null verdict is stored from', async () => {
    const empty = { ...OUTPUT, rationaleHasSubstance: false, verdict: 'NOT_REACHED' as const, substanceGaps: ['מה התזה טוענת'] };
    mockModel.answers.push(empty);
    await expect(assess(MATERIAL)).resolves.toEqual(empty);
  });

  it('an output missing a field throws, and nothing retries it', async () => {
    const { allegationsNote: _dropped, ...partial } = OUTPUT;
    mockModel.answers.push(partial);
    await expect(assess(MATERIAL)).rejects.toThrow();
    expect(mockModel.invocations).toHaveLength(1);
  });
});

describe("the projection — what the gate reads of the assessor's answer (A3 :1394)", () => {
  it('substance, the names as strings, and the allegations opinion — nothing else', () => {
    expect(projectionOf({ ...OUTPUT, allegationsFramed: false })).toEqual({
      substance: true,
      names: ['ישראל ישראלי'],
      allegationsFramed: false,
    });
  });
});

describe('the material — the version, its appeals and the rationale; never the corpus (the R49 sketch §d1, R2 M2)', () => {
  const CALL_ITEM = { whatIsNeeded: 'מצגת הנתונים', whoWouldHaveSeenIt: 'עובדי אגף האפידמיולוגיה', unit: 'אגף האפידמיולוגיה', window: '2021' };
  const REQUEST = { text: 'בקשה לפי חוק חופש המידע', authority: 'משרד הבריאות', legalBasis: 'סעיף 7', addresses: ['foia@health.gov.il'], restsOn: [DIFF_NAME] };

  /** The head citing the diff AND the trajectory, with every row the corpus, a critic and a framing hold beneath it. */
  const seedCitingBoth = (): void => {
    seedThesis({ headVersionId: CITING_BOTH_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    store.mentions = [mentionRow(BOTH_EVIDENCE_MENTION, false), mentionRow(BOTH_TRAJECTORY_MENTION, false)];
    store.gapDecisions = [
      gap(1, 'CALLED', { callItem: CALL_ITEM, versionId: CITING_BOTH_VERSION.id }),
      gap(1, 'REQUESTED', { gapId: `0x${'12'.repeat(32)}`, request: REQUEST, versionId: CITING_BOTH_VERSION.id }),
    ];
    store.analyses = [{ ...ANALYSIS, versionId: CITING_BOTH_VERSION.id, opinion: { counterArguments: 'MARK-ANALYSIS-OPINION' } }];
    store.framingRounds = [...store.framingRounds, round(9, 'ASSESSED', { assessment: 'MARK-FRAMING-ROUND' })];
    store.notes = [{ ...NOTE, text: 'MARK-RESEARCH-NOTE' }];
  };

  it('hands the text VERBATIM, the claim, the provision, THE_CALL and THE_REQUESTS as they would publish, and the rationale', async () => {
    seedCitingBoth();
    const material = await assessorMaterial(THESIS, CITING_BOTH_VERSION.id, 'הנימוק המלא');
    expect(material).toEqual({
      claim: CITING_BOTH_VERSION.claim,
      provision: THESIS.provision,
      text: CITING_BOTH_VERSION.text,
      call: [CALL_ITEM],
      requests: [REQUEST],
      rationale: 'הנימוק המלא',
    });

    mockModel.answers.push(OUTPUT);
    await assess(material);
    const prompt = JSON.stringify(mockModel.invocations.at(0));
    for (const handed of [CITING_BOTH_VERSION.text, 'הנימוק המלא', '[C1]', CALL_ITEM.whoWouldHaveSeenIt, '[R1]', REQUEST.authority]) {
      expect([handed, prompt.includes(JSON.stringify(handed).slice(1, -1))]).toEqual([handed, true]);
    }
    for (const withheld of ['MARK-ANALYSIS-OPINION', 'MARK-FRAMING-ROUND', 'MARK-RESEARCH-NOTE']) {
      expect([withheld, prompt.includes(withheld)]).toEqual([withheld, false]);
    }
  });

  it("carries NO RECORD'S CONTENT — the #ev_ and #tr_ names only: no chunk, no capture text, no trajectory claim, and no resolver is asked", async () => {
    seedCitingBoth();
    // WHAT THE CORPUS HOLDS beneath the two citations — read FIRST, through the critic's own loader, so every string a
    // record-resolving material would carry is known before anything is spied.
    const critic = await critiqueMaterial(await loadHead(THESIS.id, CITING_BOTH_VERSION.id));
    const recordContent = critic.records.flatMap((r) => (r.kind === 'CAPTURE' ? [r.text] : r.chunks.map((c) => c.text)));
    const trajectoryContent = critic.trajectories.flatMap((t) => (t.resolves ? [t.claimText] : []));
    expect([recordContent.length, trajectoryContent.length]).toEqual([2, 1]);

    const resolvers = [
      jest.spyOn(corpusReads, 'resolveRecordByName'),
      jest.spyOn(framingRounds, 'currentContentOf'),
      jest.spyOn(trajectoryCitation, 'resolveTrajectoryCitations'),
    ];
    mockModel.answers.push(OUTPUT);
    await assess(await assessorMaterial(THESIS, CITING_BOTH_VERSION.id, 'הנימוק'));

    const prompt = JSON.stringify(mockModel.invocations.at(0));
    expect([`#ev_${DIFF_NAME}`, `#tr_${TRAJECTORY_ID}`].filter((name) => !prompt.includes(name))).toEqual([]);
    expect([...recordContent, ...trajectoryContent].filter((content) => prompt.includes(content))).toEqual([]);
    expect(resolvers.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });
});
