jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
// THE MODEL FACTORY STAYS A TRIPWIRE for every draw; only the model's NAME resolves — naming a model spends nothing,
// and the analysis row records it (A2 :1317).
jest.mock('../src/factories/LLMFactory', () => ({
  ...(require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire,
  resolveModelId: (agent: string): string => `model-of-${agent}`,
}));

import { Prisma } from '@prisma/client';
import { runAnalysisHandler } from '../src/mcp/tools/runAnalysis';
import * as thesisCritic from '../src/services/thesisCritic';
import type { CritiqueInput, ThesisCritique } from '../src/services/thesisCritic';
import { CRITIC_PROMPT_VERSION, fingerprint } from '../src/services/thesisPredicates';
import { DIFF_NAME } from './helpers/corpusFixture';
import { db, resetDouble, store, written } from './helpers/evidenceDouble';
import {
  ANALYSIS,
  AUTHOR,
  BOTH_EVIDENCE_MENTION,
  BOTH_TRAJECTORY_MENTION,
  CITING_BOTH_VERSION,
  OPEN_GAP,
  OPEN_GAP_DESCRIPTION_SPACED,
  THESIS,
  TRAJECTORY_ID,
  VERSION,
} from './thesis/fixtures';
import { diffRecord } from './thesis/gateWorld';
import { mentionRow } from './thesis/rows';
import { actAs, committed, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// run_analysis's PAID PATH — what `test/thesis/analysis.test.ts` cannot see. docs/gf-thesis-flows.md T4 :586–:602,
// A2 :1313–:1318, A4 :1481–:1486; the R48 sketch §b1, §f2.
//
// IN THE UNIT PROJECT, which gates. The acceptance suite holds every REFUSAL with the model a tripwire; the path that
// SPENDS is held here with the critic STUBBED AT ITS ONE EXPORT, `critique` — and the audit, the write and the race over
// its stubbed output:
//
//   ONE draw, then ONE create        the analysis row with every verdict beside its assertion, the model, the prompt
//   what the critic is HANDED        the computed chunks and a trajectory's spans, labelled — never a summary
//   the RACE                         a run that recorded this input between the read and the create → ANALYSIS_CURRENT,
//                                    saying this call's draw was spent and not recorded
//   a draw that throws               writes nothing
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const CRITIQUE: ThesisCritique = {
  counterArguments: [
    {
      quote: 'כפי שהעמוד הראה בין 9 בדצמבר 2020',
      challenge: 'השינוי יכול להיות עיצובי',
      grounding: 'RECORD',
      source: '[1]',
      phrase: 'הטקסט שהוסר',
    },
  ],
  suggestedGaps: [{ description: OPEN_GAP_DESCRIPTION_SPACED, document: 'המצגת', holder: 'משרד הבריאות' }],
  alternativeReadings: ['עדכון שגרתי'],
  strength: { grade: 'MODERATE', reasoning: 'נימוק' },
};

/** FINGERPRINT(HEAD) on `seedThesis`'s world, by the ONE symbol over the fixture's own record — never a literal. */
const HEAD_FINGERPRINT = (): string => {
  const f = fingerprint({
    contentHash: VERSION.contentHash,
    evidence: [{ name: DIFF_NAME, record: diffRecord() }],
    trajectoryIds: [],
    gaps: [],
    promptVersion: CRITIC_PROMPT_VERSION,
  });
  if (!f.defined) throw new Error(f.name);
  return f.fingerprint;
};

const run = async (): Promise<Record<string, unknown>> => {
  actAs(AUTHOR);
  return JSON.parse(await runAnalysisHandler({ thesisId: THESIS.id })) as Record<string, unknown>;
};

describe('run_analysis — ONE draw, the audit, ONE analysis row (T4 :595–:602)', () => {
  it('draws the critic ONCE and appends ONE ThesisAnalysis: the fingerprint of HEAD, every verdict beside its assertion, the model and the prompt version', async () => {
    seedThesis();
    const draw = jest.spyOn(thesisCritic, 'critique').mockResolvedValue(CRITIQUE);

    const out = await run();

    expect(draw).toHaveBeenCalledTimes(1);
    expect(written.map((w) => [w.model, w.op])).toEqual([['thesisAnalysis', 'create']]);
    const row = written.at(0)?.data ?? {};
    expect(row).toMatchObject({
      versionId: VERSION.id,
      inputFingerprint: HEAD_FINGERPRINT(),
      model: 'model-of-THESIS_CRITIC',
      promptVersion: CRITIC_PROMPT_VERSION,
      // A PAID ACT RECORDS WHO SPENT IT — A2 :1317 as amended, thesis step 23.
      researcherId: AUTHOR,
      opinion: {
        counterArguments: [{ quoteVerified: true, phraseVerified: 'PRESENT', phraseVerifiedReason: null }],
        strength: { by: 'the critic' },
      },
    });
    expect(out).toMatchObject({
      inputFingerprint: HEAD_FINGERPRINT(),
      suggestedGaps: [{ gapId: OPEN_GAP.gapId, document: 'המצגת', holder: 'משרד הבריאות' }],
    });
    expect(tripped).toEqual([]);
  });

  it('the critic is handed the COMPUTED register — the chunks under a label, a trajectory\'s spans — and no summary', async () => {
    seedThesis({ headVersionId: CITING_BOTH_VERSION.id });
    store.versions = [CITING_BOTH_VERSION];
    store.mentions = [mentionRow(BOTH_EVIDENCE_MENTION, false), mentionRow(BOTH_TRAJECTORY_MENTION, false)];
    const observations = [
      { snapshotDate: '2022-05-13', waybackTimestamp: '20220513000000', snapshotUrl: 'u1', present: false },
      { snapshotDate: '2022-05-17', waybackTimestamp: '20220517000000', snapshotUrl: 'u2', present: true },
      { snapshotDate: '2022-08-05', waybackTimestamp: '20220805000000', snapshotUrl: 'u3', present: true },
    ];
    store.trajectories = store.trajectories.map((t) => ({ ...t, observations: JSON.stringify(observations) }));
    const draw = jest.spyOn(thesisCritic, 'critique').mockResolvedValue(CRITIQUE);

    await run();

    const material: CritiqueInput | undefined = draw.mock.calls.at(0)?.[0];
    expect(material?.records).toEqual([
      expect.objectContaining({ label: '[1]', name: DIFF_NAME, kind: 'DIFF', chunks: [{ side: 'REMOVED', text: 'הטקסט שהוסר' }, { side: 'ADDED', text: 'הטקסט שנוסף' }] }),
    ]);
    expect(material?.trajectories).toEqual([
      expect.objectContaining({
        label: `[T1·${TRAJECTORY_ID.slice(0, 8)}]`,
        resolves: true,
        spans: [
          { date: '2022-05-13', present: false, captures: 1, days: 4, openEnded: false },
          { date: '2022-05-17', present: true, captures: 2, days: 80, openEnded: true },
        ],
      }),
    ]);
    expect(JSON.stringify(material)).not.toMatch(/summary/i);
  });
});

describe('run_analysis — nothing is spent twice, and a lost race says what it cost (A2 :1318; R48 §6-8)', () => {
  it('an analysis of this input recorded BETWEEN the read and the create → ANALYSIS_CURRENT, saying the draw was spent and not recorded — nothing committed', async () => {
    seedThesis();
    // The other run's row is already held when this one creates; this one's read answered before it landed.
    store.analyses = [{ ...ANALYSIS, versionId: VERSION.id, inputFingerprint: HEAD_FINGERPRINT() }];
    db.thesisAnalysis.findMany.mockImplementationOnce(() => Promise.resolve([]));
    const draw = jest.spyOn(thesisCritic, 'critique').mockResolvedValue(CRITIQUE);

    const out = await run();

    expect(out).toEqual({ code: 'ANALYSIS_CURRENT', error: expect.stringContaining('spent and its critique was not recorded') as unknown });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(committed()).toEqual([]);
  });

  it('a unique violation on ANOTHER index propagates — never read as the race', async () => {
    seedThesis();
    jest.spyOn(thesisCritic, 'critique').mockResolvedValue(CRITIQUE);
    db.thesisAnalysis.create.mockImplementationOnce(() =>
      Promise.reject(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x', meta: { target: ['versionId'] } })),
    );
    await expect(run()).rejects.toThrow('unique');
  });

  it('a draw that throws writes nothing', async () => {
    seedThesis();
    jest.spyOn(thesisCritic, 'critique').mockRejectedValue(new Error('the provider failed'));
    await expect(run()).rejects.toThrow('the provider failed');
    expect(written).toEqual([]);
  });
});
