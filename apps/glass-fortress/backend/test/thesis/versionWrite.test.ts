jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { CURRENT_VERSION, DIFF_NAME } from '../helpers/corpusFixture';
import { resetDouble, store, written, writtenViaTx, type Row } from '../helpers/evidenceDouble';
import { built } from './absent';
import {
  AUTHOR,
  CLAIM,
  DEBATE,
  FRAMING,
  MENTION,
  NEXT_VERSION_TEXT,
  OPEN_GAP,
  OTHER_RESEARCHER,
  PROVISION,
  ROUNDS,
  TRAJECTORY_ID,
  VERSION,
  VERSION_TEXT,
} from './fixtures';
import { mentionRow } from './rows';
import {
  AFFIRMED_BEFORE,
  MISSING_THESIS,
  NAMELESS_RECORD,
  ON_THE_FIXTURE,
  UNKNOWN_TRAJECTORY,
  answerOf,
  call,
  codeSetEquality,
  expectRefusal,
  forgetTheFirstCall,
  reaffirmDuringTheWrite,
  refusals,
  resetTools,
  seedCorpus,
  seedEvidence,
  seedThesis,
  textCiting,
} from './tools';

// ---------------------------------------------------------------------------
// THE VERSION WRITE — docs/gf-thesis-flows.md T2 (:398–:436) and A4 :1461–:1474,
// the R40 sketch §3b–§3c. THESIS STEP 20 builds `create_thesis` and
// `add_thesis_version` over `services/thesisVersionWrite.ts`, the one module the
// evidence writer map already names for `thesisMention.create`.
//
// Q1, THE RESEARCHER'S (memory/gf-step-17-rulings): STALE_PIN is the RACE refusal —
// the write reads `affirmed`, computes the pin and writes in ONE transaction; a
// REAFFIRM committing between that read and the commit refuses STALE_PIN; the NEXT
// write re-pins and reports that the argument did not carry. It is decided inside
// the transaction, so it is the LAST code of `add_thesis_version`'s set (7.1 round 2,
// L1), and it is `create_thesis`'s too — the first version's pins are computed by
// the same write (A2 :1290–:1291). The race is staged by `reaffirmDuringTheWrite`.
//
// `create_thesis`'s set is NARROWED from A4's (§6-13): no NOT_AUTHOR and no STALE_HEAD,
// which a call that creates the thesis cannot reach; no NO_THESIS, since it takes no
// `thesisId`; NO_PROVISION_SHAPE by Q2.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A framing with a CHOSEN claim and no thesis yet — what `create_thesis` attaches (T1 :318–:322). */
const UNATTACHED: Row = { ...FRAMING, thesisId: null };

function seedFraming(framing: Row = UNATTACHED): void {
  seedCorpus();
  store.framings = [framing];
  store.framingRounds = [...ROUNDS];
}

const mentionsIn = (out: Record<string, unknown>): Record<string, unknown>[] => {
  const list = out['mentions'];
  if (!Array.isArray(list)) throw new Error(`no mentions list in ${JSON.stringify(out)}`);
  return list as Record<string, unknown>[];
};

/** Where a REAFFIRM moves `affirmed` to: the pair's CURRENT content version. */
const MOVED = CURRENT_VERSION.contentVersionHash;

describe('create_thesis — A4 :1461–:1466 (thesis step 20)', () => {
  const first = { claim: CLAIM, provision: PROVISION, text: VERSION_TEXT, framingId: FRAMING.id };

  refusals('create_thesis', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedFraming, input: first },
    {
      code: 'NO_PROVISION_SHAPE',
      why: 'a provision the table does not know (Q2)',
      as: AUTHOR,
      seed: seedFraming,
      input: { ...first, provision: 'NO_SUCH_PROVISION' },
    },
    { code: 'EMPTY', why: 'no text', as: AUTHOR, seed: seedFraming, input: { ...first, text: '' } },
    {
      code: 'NOT_A_RECORD',
      why: 'a well-formed name that resolves to nothing the corpus holds',
      as: AUTHOR,
      seed: seedFraming,
      input: { ...first, text: textCiting(`#ev_${NAMELESS_RECORD}`) },
    },
    {
      code: 'NOT_ACQUIRED',
      why: 'a record over a capture fetched and SKIPPED, never acquired',
      as: AUTHOR,
      seed: () => {
        seedFraming();
        seedCorpus({ acquired: false });
      },
      input: first,
    },
    {
      code: 'AWAITING_DERIVATION',
      why: 'a pair the walk owes a content version — no pin can be computed',
      as: AUTHOR,
      seed: () => {
        seedFraming();
        seedCorpus({ derived: false });
      },
      input: first,
    },
    {
      code: 'UNKNOWN_TRAJECTORY_ID',
      why: 'a #tr_ token no detection pass stored',
      as: AUTHOR,
      seed: seedFraming,
      input: { ...first, text: textCiting(`#tr_${UNKNOWN_TRAJECTORY}`) },
    },
    {
      code: 'CLAIM_MISMATCH',
      why: 'the framing chose a different claim',
      as: AUTHOR,
      seed: seedFraming,
      input: { ...first, claim: 'טענה שלא נבחרה' },
    },
    {
      code: 'FRAMING_ATTACHED',
      why: 'the framing is attached to another thesis',
      as: AUTHOR,
      seed: () => seedFraming({ ...FRAMING, thesisId: 'thesis-2' }),
      input: first,
    },
    {
      code: 'STALE_PIN',
      why: "a REAFFIRM commits between the write's read of `affirmed` and its commit (Q1)",
      as: AUTHOR,
      seed: () => {
        seedFraming();
        reaffirmDuringTheWrite(AFFIRMED_BEFORE, MOVED);
      },
      input: first,
    },
  ]);

  it("writes the Thesis, its first version and the framing's attachment in ONE transaction, and answers add_thesis_version's shape with { thesisId, framingId } (A4 :1462–:1464)", async () => {
    seedFraming();
    const out = answerOf(await call('create_thesis', first, AUTHOR));
    expect(Object.keys(out).sort()).toEqual(
      ['contentHash', 'framingId', 'gapsNowOpen', 'mentions', 'thesisId', 'unargued', 'versionId'].sort(),
    );
    expect(out['framingId']).toBe(FRAMING.id);
    expect(new Set(written.map((w) => w.model))).toEqual(new Set(['thesis', 'thesisVersion', 'thesisMention', 'framing']));
    // ONE TRANSACTION, by equality — the double hands the callback a DISTINCT client (step 14's rule).
    expect(writtenViaTx).toEqual(written);
    const attached = written.find((w) => w.model === 'framing');
    expect(attached?.data['thesisId']).toBe(out['thesisId']);
  });

  codeSetEquality('create_thesis');
});

describe('add_thesis_version — A4 :1468–:1474 (thesis step 20)', () => {
  const next = ON_THE_FIXTURE.add_thesis_version;

  refusals('add_thesis_version', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: next },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — asked by ANOTHER researcher it is still NO_THESIS',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...next, thesisId: MISSING_THESIS },
    },
    { code: 'NOT_AUTHOR', why: "another researcher's thesis (§9 :1001)", as: OTHER_RESEARCHER, seed: seedThesis, input: next },
    {
      code: 'STALE_HEAD',
      why: 'written against a head that is not the head — someone wrote first',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...next, expectedHeadVersionId: 'version-0' },
    },
    {
      code: 'NOT_A_RECORD',
      why: 'a well-formed name that resolves to nothing',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...next, text: textCiting(`#ev_${NAMELESS_RECORD}`) },
    },
    {
      code: 'NOT_ACQUIRED',
      why: 'a record over a capture fetched and SKIPPED',
      as: AUTHOR,
      seed: () => {
        seedThesis();
        seedCorpus({ acquired: false });
      },
      input: next,
    },
    {
      code: 'AWAITING_DERIVATION',
      why: 'a pair the walk owes a content version',
      as: AUTHOR,
      seed: () => {
        seedThesis();
        seedCorpus({ derived: false });
      },
      input: next,
    },
    {
      code: 'UNKNOWN_TRAJECTORY_ID',
      why: 'a #tr_ token no pass stored',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...next, text: textCiting(`#tr_${UNKNOWN_TRAJECTORY}`) },
    },
    { code: 'EMPTY', why: 'no text', as: AUTHOR, seed: seedThesis, input: { ...next, text: '' } },
    { code: 'EMPTY', why: 'no claim', as: AUTHOR, seed: seedThesis, input: { ...next, claim: '' } },
  ]);

  describe('the version write — T2 :398–:436, sketch §3c', () => {
    it('writes the version, its mentions and the head pointer in ONE transaction — by equality with what went through its client', async () => {
      seedThesis();
      const out = answerOf(await call('add_thesis_version', next, AUTHOR));
      expect(new Set(written.map((w) => w.model))).toEqual(new Set(['thesisVersion', 'thesisMention', 'thesis']));
      expect(writtenViaTx).toEqual(written);
      expect(written.find((w) => w.model === 'thesis')?.data['headVersionId']).toBe(out['versionId']);
    });

    it('answers contentHash = sha256(utf8(text)) — the shell-derived vector of VERSION_TEXT (A1 :1231)', async () => {
      seedThesis();
      expect(answerOf(await call('add_thesis_version', next, AUTHOR))['contentHash']).toBe(VERSION.contentHash);
    });

    it('makes every #ev_ and #tr_ token ONE mention, deduplicated per (kind, name) — one row each (A2 @@unique([versionId, kind, name]))', async () => {
      seedThesis();
      const text = textCiting(`#ev_${DIFF_NAME}`, `#ev_${DIFF_NAME}`, `#tr_${TRAJECTORY_ID}`);
      const out = answerOf(await call('add_thesis_version', { ...next, text }, AUTHOR));
      expect(mentionsIn(out).map((m) => [m['kind'], m['name']]).sort()).toEqual([
        ['EVIDENCE', DIFF_NAME],
        ['TRAJECTORY', TRAJECTORY_ID],
      ]);
      expect(written.filter((w) => w.model === 'thesisMention')).toHaveLength(2);
    });

    for (const [shape, token] of [
      ['#ev_0x followed by 63 hex', `#ev_0x${'a'.repeat(63)}`],
      ['#ev_0x followed by a non-hex character', `#ev_0xg${'a'.repeat(63)}`],
      ['#ev_ followed by nothing', '#ev_'],
    ] as const) {
      it(`a malformed token — ${shape} — refuses NOT_A_RECORD, never a plain string (A1 :1245)`, async () => {
        seedThesis();
        const out = await call('add_thesis_version', { ...next, text: textCiting(token) }, AUTHOR);
        expectRefusal('add_thesis_version', out, 'NOT_A_RECORD');
      });
    }

    it("pins an Evidence row's `affirmed` — the only value allowed (T2 :408–:411)", async () => {
      seedThesis();
      seedEvidence(AFFIRMED_BEFORE);
      const out = answerOf(await call('add_thesis_version', next, AUTHOR));
      expect(mentionsIn(out).find((m) => m['name'] === DIFF_NAME)?.['pin']).toBe(AFFIRMED_BEFORE);
    });

    it('pins CURRENT(record) where no Evidence row exists — what the author read (T2 :412)', async () => {
      seedThesis();
      const out = answerOf(await call('add_thesis_version', next, AUTHOR));
      expect(mentionsIn(out).find((m) => m['name'] === DIFF_NAME)?.['pin']).toBe(CURRENT_VERSION.contentVersionHash);
    });

    it('takes NO pin from its input — neither tool schema has a key that could carry one (T2 :429; target §10.5)', async () => {
      const add = await built<{ addThesisVersionSchema: Record<string, unknown> }>('mcp/tools/addThesisVersion', [
        'addThesisVersionSchema',
      ]);
      const create = await built<{ createThesisSchema: Record<string, unknown> }>('mcp/tools/createThesis', ['createThesisSchema']);
      const keys = [...Object.keys(add.addThesisVersionSchema), ...Object.keys(create.createThesisSchema)];
      expect(keys.filter((k) => /pin|contentversionhash|affirmed/i.test(k))).toEqual([]);
    });

    it('CARRIES the argument where the parent has the same (name, pin) with a debate (T2 :415–:416)', async () => {
      seedThesis();
      store.mentions = [mentionRow(MENTION, false, DEBATE)];
      store.debates = [{ ...DEBATE }];
      const out = answerOf(await call('add_thesis_version', next, AUTHOR));
      expect(mentionsIn(out).find((m) => m['name'] === DIFF_NAME)?.['argued']).toBe(true);
      expect(out['unargued']).toEqual([]);
    });

    it("carries NO argument where the pin changed — the mention is unargued, T3's to argue (T2 :417–:418)", async () => {
      seedThesis();
      store.mentions = [mentionRow(MENTION, false, DEBATE)];
      store.debates = [{ ...DEBATE }];
      seedEvidence(AFFIRMED_BEFORE);
      const out = answerOf(await call('add_thesis_version', next, AUTHOR));
      expect(mentionsIn(out).find((m) => m['name'] === DIFF_NAME)?.['argued']).toBe(false);
      expect(out['unargued']).toEqual([DIFF_NAME]);
    });

    it('two writes against one head: the second refuses STALE_HEAD, and its message names the head that won (A4 :1473; A7 :1634–:1637)', async () => {
      seedThesis();
      const won = answerOf(await call('add_thesis_version', next, AUTHOR));
      forgetTheFirstCall();
      const lost = await call('add_thesis_version', next, AUTHOR);
      expectRefusal('add_thesis_version', lost, 'STALE_HEAD');
      expect(lost).toContain(String(won['versionId']));
    });

    it('answers { versionId, contentHash, mentions, unargued, gapsNowOpen } — a CITED gap whose citation left the text is now open (A4 :1471–:1472)', async () => {
      seedThesis();
      store.gapDecisions = [{ ...OPEN_GAP, id: 'gap-decision-cited', sequence: 2, decision: 'CITED', citedName: DIFF_NAME }];
      const out = answerOf(await call('add_thesis_version', { ...next, text: NEXT_VERSION_TEXT }, AUTHOR));
      expect(Object.keys(out).sort()).toEqual(['contentHash', 'gapsNowOpen', 'mentions', 'unargued', 'versionId']);
      expect(out['gapsNowOpen']).toEqual([OPEN_GAP.gapId]);
      expect(out['mentions']).toEqual([]);
    });

    describe('pin-equals-affirmed', () => {
      // THESIS A7 :1649–:1650: "evidence A7's test, unchanged and owned here: move
      // `affirmed` between two writes and watch the second refuse STALE_PIN" — under
      // Q1's reading, the race: the REAFFIRM lands between the write's read and its
      // commit. The parent pinned the version affirmed BEFORE, and was argued on it.
      function seedTheRace(): void {
        seedThesis();
        store.mentions = [mentionRow({ ...MENTION, contentVersionHash: AFFIRMED_BEFORE }, false, DEBATE)];
        store.debates = [{ ...DEBATE }];
        reaffirmDuringTheWrite(AFFIRMED_BEFORE, MOVED);
      }

      it("a REAFFIRM committing between the write's read of `affirmed` and its commit refuses STALE_PIN — and commits nothing (Q1)", async () => {
        seedTheRace();
        expectRefusal('add_thesis_version', await call('add_thesis_version', next, AUTHOR), 'STALE_PIN');
      });

      it('the NEXT write re-pins to `affirmed` and reports the argument did not carry — the thesis side of T3 (T2 :429–:436; T3 :537–:542)', async () => {
        seedTheRace();
        await call('add_thesis_version', next, AUTHOR);
        forgetTheFirstCall();
        const out = answerOf(await call('add_thesis_version', next, AUTHOR));
        expect(mentionsIn(out).find((m) => m['name'] === DIFF_NAME)).toMatchObject({ pin: MOVED, argued: false });
        expect(out['unargued']).toEqual([DIFF_NAME]);
      });
    });
  });

  codeSetEquality('add_thesis_version');
});
