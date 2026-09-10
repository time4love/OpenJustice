jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { AFTER, BEFORE, CURRENT_VERSION, DIFF_NAME } from '../helpers/corpusFixture';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { built } from './absent';
import type { ThesisPredicatesModule } from './contract';
import { ANALYSIS, AUTHOR, OPEN_GAP, OPEN_GAP_DESCRIPTION_SPACED, OTHER_RESEARCHER, THESIS, VERSION } from './fixtures';
import {
  MISSING_THESIS,
  NAMELESS_RECORD,
  ON_THE_FIXTURE,
  answerOf,
  call,
  codeSetEquality,
  refusals,
  resetTools,
  seedCorpus,
  seedThesis,
} from './tools';

// ---------------------------------------------------------------------------
// ANALYSIS AND GAPS — docs/gf-thesis-flows.md T4 and A4 :1481–:1499, the R40
// sketch §3b. THESIS STEP 22 builds the three tools.
//
// NO_HEAD IS THE FLOW'S (§0g): T4 :583, :626 and :665 refuse NO_HEAD where A4's
// lists do not, and the flows win. `decide_gap`'s NAMES_PERSON is OWED to step 22
// (§8): its rule is T5's publication assessor — a model nothing mocks here — so it
// is in the code set as owed, never claimed tested. `run_analysis` and
// `draft_foia_request` are paid; nothing past their model is written at step 17,
// and the TRIPWIRE holds that no refusal — ANALYSIS_CURRENT above all — spent a call.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A thesis whose gap list holds OPEN_GAP, decided once. */
function seedGapped(): void {
  seedThesis();
  store.gapDecisions = [{ ...OPEN_GAP }];
}

/** A thesis with no version at all — nothing for an analysis, a decision or a draft to be about. */
function seedHeadless(): void {
  seedThesis({ headVersionId: null });
}

describe('run_analysis — T4 :580–:584, A4 :1481–:1486, WRITE and paid (thesis step 22)', () => {
  const ask = ON_THE_FIXTURE.run_analysis;

  refusals('run_analysis', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: ask },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — never NOT_AUTHOR',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...ask, thesisId: MISSING_THESIS },
    },
    { code: 'NOT_AUTHOR', why: "another researcher's thesis", as: OTHER_RESEARCHER, seed: seedThesis, input: ask },
    { code: 'NO_HEAD', why: 'a thesis with no version (T4 :583)', as: AUTHOR, seed: seedHeadless, input: ask },
    {
      code: 'ANALYSIS_CURRENT',
      why: 'an analysis for this exact input exists — and NOTHING is spent twice on the same question (A2 @@unique([versionId, inputFingerprint]))',
      as: AUTHOR,
      seed: async () => {
        seedThesis();
        // The head's fingerprint, computed by the ONE symbol — never a literal the
        // case guessed. No gap is decided and no trajectory cited on this world.
        const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['fingerprint', 'CRITIC_PROMPT_VERSION']);
        const now = p.fingerprint({
          contentHash: VERSION.contentHash,
          evidence: [
            {
              name: DIFF_NAME,
              record: {
                kind: 'DIFF',
                before: { textHash: BEFORE.textHash, textExtractionVersion: BEFORE.textExtractionVersion },
                after: { textHash: AFTER.textHash, textExtractionVersion: AFTER.textExtractionVersion },
                versions: [CURRENT_VERSION],
              },
            },
          ],
          trajectoryIds: [],
          gaps: [],
          promptVersion: p.CRITIC_PROMPT_VERSION,
        });
        if (!now.defined) throw new Error(`the fixture head has no fingerprint: ${now.reason} for ${now.name}`);
        store.analyses = [{ ...ANALYSIS, inputFingerprint: now.fingerprint }];
      },
      input: ask,
    },
    {
      code: 'AWAITING_DERIVATION',
      why: 'a cited pair the walk owes a version — the critic is never handed content that does not exist',
      as: AUTHOR,
      seed: () => {
        seedThesis();
        seedCorpus({ derived: false });
      },
      input: ask,
    },
  ]);

  codeSetEquality('run_analysis');
});

describe('decide_gap — T4 :625–:634, A4 :1488–:1494 (thesis step 22)', () => {
  const onTheGap = ON_THE_FIXTURE.decide_gap;
  /** A gap ENTERED by its description, against a log that holds none for it yet. */
  const entering = { thesisId: THESIS.id, description: OPEN_GAP.description, decision: 'OPEN', expectedSequence: 0 };

  refusals('decide_gap', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedGapped, input: onTheGap },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none',
      as: OTHER_RESEARCHER,
      seed: seedGapped,
      input: { ...onTheGap, thesisId: MISSING_THESIS },
    },
    { code: 'NOT_AUTHOR', why: "another researcher's thesis", as: OTHER_RESEARCHER, seed: seedGapped, input: onTheGap },
    { code: 'NO_HEAD', why: 'a thesis with no version (T4 :626, §0g)', as: AUTHOR, seed: seedHeadless, input: entering },
    {
      code: 'NOT_CITED',
      why: 'CITED naming a record the head does not mention',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, decision: 'CITED', citedName: NAMELESS_RECORD, reason: undefined },
    },
    {
      code: 'REASON_REQUIRED',
      why: 'CONCEDED with no reason',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, decision: 'CONCEDED', reason: undefined },
    },
    {
      code: 'REASON_REQUIRED',
      why: 'DISMISSED with no reason',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, decision: 'DISMISSED', reason: undefined },
    },
    {
      code: 'REQUEST_REQUIRED',
      why: 'REQUESTED with no request',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, decision: 'REQUESTED', reason: undefined },
    },
    {
      code: 'CALL_ITEM_REQUIRED',
      why: 'CALLED with no call item',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, decision: 'CALLED', reason: undefined },
    },
    {
      code: 'STALE_SEQUENCE',
      why: 'a decision written against a sequence the log has moved past',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...onTheGap, expectedSequence: 0 },
    },
  ]);

  it('appends ONE decision and answers { gapId, decision, sequence } — the decision in force is the latest (A4 :1491; T4 :628–:629)', async () => {
    seedGapped();
    const out = answerOf(await call('decide_gap', onTheGap, AUTHOR));
    expect(out).toEqual({ gapId: OPEN_GAP.gapId, decision: 'DISMISSED', sequence: OPEN_GAP.sequence + 1 });
    expect(written.map((w) => [w.model, w.op])).toEqual([['thesisGapDecision', 'create']]);
  });

  it('a description with no known gapId ENTERS the list under gapId(description) — whitespace-different is the same gap, the shell vector (A1 :1234–:1235; sketch §5f)', async () => {
    seedThesis();
    const out = answerOf(await call('decide_gap', { ...entering, description: OPEN_GAP_DESCRIPTION_SPACED }, AUTHOR));
    expect(out['gapId']).toBe(OPEN_GAP.gapId);
  });

  it("CITED names a record the head mentions and carries NO pin of its own — the pin is the mention's (T4 :632–:634)", async () => {
    seedGapped();
    answerOf(await call('decide_gap', { ...onTheGap, decision: 'CITED', citedName: DIFF_NAME, reason: undefined }, AUTHOR));
    const decision = written.find((w) => w.model === 'thesisGapDecision')?.data ?? {};
    expect(decision['citedName']).toBe(DIFF_NAME);
    expect(Object.keys(decision).filter((k) => /pin|contentversionhash|affirmed/i.test(k))).toEqual([]);
  });

  codeSetEquality('decide_gap');
});

describe('draft_foia_request — T4 :663–:666, A4 :1496–:1499, GATED and paid (thesis step 22)', () => {
  const ask = ON_THE_FIXTURE.draft_foia_request;

  refusals('draft_foia_request', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context (L9)', as: null, seed: seedGapped, input: ask },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none',
      as: OTHER_RESEARCHER,
      seed: seedGapped,
      input: { ...ask, thesisId: MISSING_THESIS },
    },
    { code: 'NOT_AUTHOR', why: "another researcher's thesis", as: OTHER_RESEARCHER, seed: seedGapped, input: ask },
    { code: 'NO_HEAD', why: 'a thesis with no version (T4 :665, §0g)', as: AUTHOR, seed: seedHeadless, input: ask },
    {
      code: 'NO_SUCH_GAP',
      why: 'a gapId the list does not hold',
      as: AUTHOR,
      seed: seedGapped,
      input: { ...ask, gapId: `0x${'cd'.repeat(32)}` },
    },
  ]);

  codeSetEquality('draft_foia_request');
});
