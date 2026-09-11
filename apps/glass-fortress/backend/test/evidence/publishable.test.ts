// ---------------------------------------------------------------------------
// PUBLISHABLE(m) AND THE VERSION FOLD — evidence step 15, chunk 2 §7.1.
//
// `test/evidence/predicates.test.ts` holds that `publishable` is one importable
// SYMBOL. A stub satisfies that: step 13 measured it, when `argued` with its
// thesis clause removed passed 1,216 unit cases and the same `typeof` shape. So
// what this file holds is the BEHAVIOUR — one case per conjunct, each of which
// reddens when that conjunct ALONE is broken — and the four ways a check can
// report that it examined none.
//
// IT USES THE SHARED DOUBLE, and that is why it is its own file rather than more
// cases in `predicates.test.ts`. That file mocks `lib/prisma` inline with a
// fixture shaped for `publicPage`'s two queries, and its EVER-PUBLISHED arm is
// RED BY NAME against exactly that shape; one module path takes one `jest.mock`
// per file, so putting these cases there would mean either a second evidence
// double — which step 14 refused, "two doubles free to disagree about what the
// database does" — or editing the fixture an acceptance case's redness rests on.
//
// NOTHING IS STUBBED AT A CONJUNCT'S BOUNDARY. §1d requires every conjunct to be
// the CALL it is, so a case that stubbed `verified` would leave that unproven —
// the double carries the stored anchor checks instead, and the "all six PASS"
// case reaches `verified: true` through the real predicate.
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { asked, resetDouble, store, written, type Row } from '../helpers/evidenceDouble';
import {
  AFTER,
  BEFORE,
  CAPTURE_NAME,
  CURRENT_VERSION,
  DIFF_NAME,
  URL,
  anchorCheck,
} from '../helpers/corpusFixture';
import { publishable, publishableEvidence, type Conjunct } from '../../src/services/evidencePredicates';

/** A capture as the identity select reads it — the page's url is part of the name. */
const withPage = (c: Record<string, unknown>): Row => ({ ...c, trackedUrl: { url: URL } });
const BEFORE_ROW = withPage(BEFORE);
const AFTER_ROW = withPage(AFTER);

const DOCUMENT_NAME = `0x${'dc'.repeat(32)}`;

/** The pair, promoted, whose CURRENT version is the one the fixture calls current. */
function diffRow(over: Row = {}): Row {
  return {
    fileHash: DIFF_NAME,
    kind: 'DIFF',
    status: 'PROMOTED',
    snapshotId: null,
    snapshot: null,
    urlVersionDiffId: 'diff-1',
    urlVersionDiff: {
      id: 'diff-1',
      beforeSnapshot: BEFORE_ROW,
      afterSnapshot: AFTER_ROW,
      contentVersions: [CURRENT_VERSION],
    },
    ...over,
  };
}

/** The same pair with a different set of stored content versions. */
function diffWithVersions(versions: Row[]): Row {
  return diffRow({
    urlVersionDiff: {
      id: 'diff-1',
      beforeSnapshot: BEFORE_ROW,
      afterSnapshot: AFTER_ROW,
      contentVersions: versions,
    },
  });
}

/** A CURRENT version of the pair whose chunks carry one survival verdict. */
function currentChunks(survival: string): Row {
  return { ...CURRENT_VERSION, chunks: [{ side: 'REMOVED', text: 'הוסר משפט', survival }] };
}

const captureRow = (over: Row = {}): Row => ({
  fileHash: CAPTURE_NAME,
  kind: 'CAPTURE',
  status: 'PROMOTED',
  snapshotId: BEFORE.id,
  snapshot: BEFORE_ROW,
  urlVersionDiffId: null,
  urlVersionDiff: null,
  ...over,
});

/** A DOCUMENT record: no corpus key at all, and no predicate until document step 28. */
const documentRow = (over: Row = {}): Row => ({
  fileHash: DOCUMENT_NAME,
  kind: 'DOCUMENT',
  status: 'PROMOTED',
  snapshotId: null,
  snapshot: null,
  urlVersionDiffId: null,
  urlVersionDiff: null,
  documentCommitment: DOCUMENT_NAME,
  ...over,
});

function mentionRow(over: Row = {}): Row {
  const name = (over['name'] as string | undefined) ?? DIFF_NAME;
  return {
    id: 'mention-1',
    versionId: 'version-1',
    kind: 'EVIDENCE',
    contentVersionHash: CURRENT_VERSION.contentVersionHash,
    debateSessionId: 'session-1',
    thesisVersion: { thesisId: 'thesis-1' },
    debateSession: { status: 'PROMOTED', recordFileHash: name, thesisId: 'thesis-1' },
    ...over,
    name,
  };
}

/** One citation, one record, and the anchor checks the walk stored for its captures. */
function given(
  over: { mention?: Row; row?: Row | null; checks?: Row[] } = {},
): { mention: Row; row: Row | null } {
  const mention = over.mention ?? mentionRow();
  const row = over.row === undefined ? diffRow() : over.row;
  store.mentions = [mention];
  store.mention = mention;
  store.evidenceRows = row === null ? [] : [row];
  store.evidence = row;
  store.integrityChecks = over.checks ?? [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)];
  return { mention, row };
}

const verdictOf = (conjuncts: Conjunct[], id: string): string =>
  conjuncts.find((c) => c.id === id)?.verdict ?? 'ABSENT';
const detailOf = (conjuncts: Conjunct[], id: string): string =>
  conjuncts.find((c) => c.id === id)?.detail ?? '';

beforeEach(() => {
  jest.clearAllMocks();
  resetDouble();
});

describe('the report names what it examined, and renders every conjunct', () => {
  it('the six conjuncts, in A3\'s clause order with the promoted precondition — BY EQUALITY', async () => {
    // A list is a rule only when an equality polices it. The GATE's order is
    // thesis A6's (5–10) and evidenceChecks maps onto it at §7.2; this is the
    // predicate's own order, and the two are reconciled by §0a's table.
    given();
    const report = await publishable('mention-1');
    expect(report.conjuncts.map((c) => c.id)).toEqual([
      'RECORD_PROMOTED',
      'ARGUED',
      'VERIFIED',
      'CITATION_CURRENT',
      'DERIVED',
      'INPUT_SOUND',
    ]);
  });

  it('names the mention and the version it was examined at — A6 :1201-:1202', async () => {
    given();
    const report = await publishable('mention-1');
    expect(report.examined).toEqual({
      mentionId: 'mention-1',
      fileHash: DIFF_NAME,
      contentVersionHash: CURRENT_VERSION.contentVersionHash,
    });
  });

  it('all six PASS — the citation is publishable, and nothing was stubbed to get here', async () => {
    given();
    const report = await publishable('mention-1');
    expect(report.conjuncts.map((c) => c.verdict)).toEqual(Array<string>(6).fill('PASS'));
    expect(report.evaluable && report.publishable).toBe(true);
    // The stored attribution is what `verified` read — the CALL, not a stub.
    expect(asked.some((a) => a.model === 'integrityCheck' && a.op === 'findMany')).toBe(true);
  });

  it('WRITES NOTHING. It is a question, and every predicate is computed on read', async () => {
    given();
    await publishable('mention-1');
    expect(written).toEqual([]);
  });
});

describe('RECORD_PROMOTED — A3\'s first clause, and the only one a missing row can answer', () => {
  it('no evidence row: RECORD_PROMOTED FAILs and the OTHER FOUR examined none', async () => {
    // The commonest of the three EXAMINED_NONE states in a real corpus: a
    // draft's citation of a record nobody has promoted, which T2 allows in the
    // head and the gate refuses. ARGUED is computed — it is row-independent.
    given({ row: null });
    const report = await publishable('mention-1');

    expect(verdictOf(report.conjuncts, 'RECORD_PROMOTED')).toBe('FAIL');
    expect(verdictOf(report.conjuncts, 'ARGUED')).toBe('PASS');
    for (const id of ['VERIFIED', 'CITATION_CURRENT', 'DERIVED', 'INPUT_SOUND']) {
      expect(verdictOf(report.conjuncts, id)).toBe('EXAMINED_NONE');
      // The word is borrowed from `verified`'s own arm, never re-coined.
      expect(detailOf(report.conjuncts, id)).toContain('NOT_PROMOTED');
    }
    // EVALUABLE: *there is no row* is a judgement this tree makes completely.
    expect(report.evaluable).toBe(true);
    expect(report.evaluable && report.publishable).toBe(false);
  });

  it('a WITHDRAWN record FAILs, and the detail names the status', async () => {
    given({ row: diffRow({ status: 'WITHDRAWN' }) });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'RECORD_PROMOTED')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'RECORD_PROMOTED')).toContain('WITHDRAWN');
  });
});

describe('ARGUED — the mention\'s debate is PROMOTED for THIS record and THIS thesis', () => {
  it('an OPEN debate has not cleared', async () => {
    given({
      mention: mentionRow({ debateSession: { status: 'OPEN', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' } }),
    });
    expect(verdictOf((await publishable('mention-1')).conjuncts, 'ARGUED')).toBe('FAIL');
  });

  it('a debate PROMOTED for ANOTHER THESIS argues nothing here', async () => {
    given({
      mention: mentionRow({
        debateSession: { status: 'PROMOTED', recordFileHash: DIFF_NAME, thesisId: 'thesis-2' },
      }),
    });
    expect(verdictOf((await publishable('mention-1')).conjuncts, 'ARGUED')).toBe('FAIL');
  });

  it('a debate PROMOTED for ANOTHER RECORD argues nothing here', async () => {
    given({
      mention: mentionRow({
        debateSession: { status: 'PROMOTED', recordFileHash: CAPTURE_NAME, thesisId: 'thesis-1' },
      }),
    });
    expect(verdictOf((await publishable('mention-1')).conjuncts, 'ARGUED')).toBe('FAIL');
  });

  it('a citation with NO debate is one nobody has argued for', async () => {
    given({ mention: mentionRow({ debateSessionId: null, debateSession: null }) });
    expect(verdictOf((await publishable('mention-1')).conjuncts, 'ARGUED')).toBe('FAIL');
  });
});

describe('VERIFIED — RECOMPUTABLE, and every capture attributed on chain', () => {
  it('attribution never stored: VERIFIED FAILs — an unanswered question is not a pass', async () => {
    given({ checks: [] });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'VERIFIED')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'VERIFIED')).toContain('no stored attribution');
  });

  it('a verdict stored under an OLDER check version reads as never asked', async () => {
    given({ checks: [anchorCheck(BEFORE.id), anchorCheck(AFTER.id, { verifierVersion: 'v1-registration' })] });
    expect(verdictOf((await publishable('mention-1')).conjuncts, 'VERIFIED')).toBe('FAIL');
  });

  it('anchoredHash ≠ documentHash: VERIFIED FAILs and names the capture', async () => {
    const moved = withPage({ ...AFTER, anchoredHash: `0x${'ee'.repeat(32)}` });
    given({
      row: diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          beforeSnapshot: BEFORE_ROW,
          afterSnapshot: moved,
          contentVersions: [CURRENT_VERSION],
        },
      }),
    });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'VERIFIED')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'VERIFIED')).toContain(AFTER.waybackTimestamp);
  });
});

describe('CITATION_CURRENT — the pin names the version CURRENT resolves to', () => {
  it('a stale pin FAILs, naming the pinned hash and the current one', async () => {
    given({ mention: mentionRow({ contentVersionHash: 'content-older' }) });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'CITATION_CURRENT')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'CITATION_CURRENT')).toContain('content-older');
    expect(detailOf(report.conjuncts, 'CITATION_CURRENT')).toContain(CURRENT_VERSION.contentVersionHash);
  });
});

describe('DERIVED and INPUT_SOUND — the precondition A6 promotes, and check 17', () => {
  it('no version at all: DERIVED FAILs naming the diff, INPUT_SOUND FAILs, CITATION_CURRENT examined none', async () => {
    // TWO FAILURES AND ONE UNEXAMINABLE CONJUNCT ON ONE RECORD, and it is the
    // shape §0e's REASON key exists for: both failures carry AWAITING_DERIVATION,
    // which `flagged` names, so the citation routes to exit 2 at §4d — while an
    // id-keyed rule would send INPUT_SOUND to exit 1.
    given({ row: diffWithVersions([]) });
    const report = await publishable('mention-1');

    expect(verdictOf(report.conjuncts, 'DERIVED')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'DERIVED')).toContain(DIFF_NAME);
    expect(verdictOf(report.conjuncts, 'INPUT_SOUND')).toBe('FAIL');
    expect(verdictOf(report.conjuncts, 'CITATION_CURRENT')).toBe('EXAMINED_NONE');
    expect(detailOf(report.conjuncts, 'CITATION_CURRENT')).toContain('AWAITING_DERIVATION');
    expect(report.evaluable && report.publishable).toBe(false);
  });

  it('a STALE-but-present version: BOTH failures carry AWAITING_DERIVATION — the reason §0e routes on', async () => {
    // WRITTEN AT 7.3, AND IT COULD NOT BE WRITTEN AT 7.1. Before check 17's
    // rebase a stale-but-present version was read as the newest and folded to
    // UNCHECKABLE, so the two failures did NOT share a reason and the case would
    // have asserted something the rebase then moved. With CURRENT(diff) asked
    // properly, an endpoint whose text has moved leaves no CURRENT version and
    // both DERIVED and INPUT_SOUND fail on AWAITING_DERIVATION — which `flagged`
    // names, so §4d's citation routes to exit 2 rather than to exit 1.
    //
    // §4f case 10 at 7.4 is what asserts that end to end; this is the predicate
    // half of it.
    given({ row: diffWithVersions([{ ...CURRENT_VERSION, beforeTextHash: 'text-before-v2' }]) });
    const report = await publishable('mention-1');

    expect(verdictOf(report.conjuncts, 'DERIVED')).toBe('FAIL');
    expect(verdictOf(report.conjuncts, 'INPUT_SOUND')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'INPUT_SOUND')).toContain('CURRENT');
    expect(detailOf(report.conjuncts, 'INPUT_SOUND')).not.toContain('could not be checked');
    expect(verdictOf(report.conjuncts, 'CITATION_CURRENT')).toBe('EXAMINED_NONE');
    expect(detailOf(report.conjuncts, 'CITATION_CURRENT')).toContain('AWAITING_DERIVATION');
  });

  it('a CONTRADICTED chunk in CURRENT: INPUT_SOUND FAILs and the rest stand', async () => {
    given({ row: diffWithVersions([currentChunks('CONTRADICTED')]) });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'INPUT_SOUND')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'INPUT_SOUND')).toContain('refute');
    expect(verdictOf(report.conjuncts, 'DERIVED')).toBe('PASS');
  });

  it('an UNCHECKABLE chunk FAILs too — stricter than A3\'s summary line, on Q1\'s ruling', async () => {
    // A3's last clause names CONTRADICTED alone; check 17 has failed on
    // UNCHECKABLE since 2026-08-30, and the fold is not this step's to touch.
    given({ row: diffWithVersions([currentChunks('UNCHECKABLE')]) });
    const report = await publishable('mention-1');
    expect(verdictOf(report.conjuncts, 'INPUT_SOUND')).toBe('FAIL');
    expect(detailOf(report.conjuncts, 'INPUT_SOUND')).not.toContain('CONTRADICTED');
  });

  it('a CAPTURE mention: INPUT_SOUND examined none, and the mention IS publishable', async () => {
    // Document A6 :1533's rule applied to the kind it was written about: a check
    // with no subject, never a check that passed.
    given({
      mention: mentionRow({ name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }),
      row: captureRow(),
      checks: [anchorCheck(BEFORE.id)],
    });
    const report = await publishable('mention-1');

    expect(verdictOf(report.conjuncts, 'INPUT_SOUND')).toBe('EXAMINED_NONE');
    expect(detailOf(report.conjuncts, 'INPUT_SOUND')).toContain('NOT_DIFF_DERIVED');
    expect(report.evaluable && report.publishable).toBe(true);
  });
});

describe('a DOCUMENT record — the class whose predicates document step 28 builds', () => {
  it('failing nothing: FOUR conjuncts examined none, and the report is NOT EVALUABLE', async () => {
    given({ mention: mentionRow({ name: DOCUMENT_NAME }), row: documentRow(), checks: [] });
    const report = await publishable('mention-1');

    for (const id of ['VERIFIED', 'CITATION_CURRENT', 'DERIVED', 'INPUT_SOUND']) {
      expect(verdictOf(report.conjuncts, id)).toBe('EXAMINED_NONE');
      expect(detailOf(report.conjuncts, id)).toContain('DOCUMENT_CLASS_NOT_BUILT');
    }
    expect(verdictOf(report.conjuncts, 'ARGUED')).toBe('PASS');
    expect(verdictOf(report.conjuncts, 'RECORD_PROMOTED')).toBe('PASS');
    expect(report.evaluable).toBe(false);
    expect(!report.evaluable && report.reason).toBe('DOCUMENT_CLASS_NOT_BUILT');
  });

  it('whose debate is OPEN: EVALUABLE and NOT publishable — the CONDITION, not the arm', async () => {
    // Round 3's finding. `ARGUED` and `RECORD_PROMOTED` are kind-independent, so
    // this citation HAS been judged — completely — and reporting "we cannot
    // tell" over one the platform just refused would be the honest word used
    // dishonestly.
    given({
      mention: mentionRow({
        name: DOCUMENT_NAME,
        debateSession: { status: 'OPEN', recordFileHash: DOCUMENT_NAME, thesisId: 'thesis-1' },
      }),
      row: documentRow(),
      checks: [],
    });
    const report = await publishable('mention-1');

    expect(verdictOf(report.conjuncts, 'ARGUED')).toBe('FAIL');
    expect(report.evaluable).toBe(true);
    expect(report.evaluable && report.publishable).toBe(false);
    for (const id of ['VERIFIED', 'CITATION_CURRENT', 'DERIVED', 'INPUT_SOUND']) {
      expect(verdictOf(report.conjuncts, id)).toBe('EXAMINED_NONE');
    }
  });
});

describe('every verdict that is not a PASS carries its KEY — the reason a program routes on', () => {
  // THE REASON IS HELD AT ITS SOURCE. `audit-theses` routes its exit on
  // `conjunct.reason` by equality with FLAGGED's reasons, so a wrong key here
  // would move an exit — and without this case only the instrument's own suite
  // would notice. `detail` is for a person and nothing compares it; `reason` is
  // for a program, and every arm below states it.
  const reasonsOf = (conjuncts: Conjunct[]): Record<string, string | null> =>
    Object.fromEntries(conjuncts.map((c) => [c.id, c.reason]));

  const ALL_PASS = {
    RECORD_PROMOTED: null,
    ARGUED: null,
    VERIFIED: null,
    CITATION_CURRENT: null,
    DERIVED: null,
    INPUT_SOUND: null,
  };

  it.each<[string, () => void, Record<string, string | null>]>([
    ['all six PASS — every reason null', () => given(), ALL_PASS],
    [
      'no evidence row',
      () => given({ row: null }),
      {
        RECORD_PROMOTED: 'NO_EVIDENCE_ROW',
        ARGUED: null,
        VERIFIED: 'NOT_PROMOTED',
        CITATION_CURRENT: 'NOT_PROMOTED',
        DERIVED: 'NOT_PROMOTED',
        INPUT_SOUND: 'NOT_PROMOTED',
      },
    ],
    ['a WITHDRAWN record', () => given({ row: diffRow({ status: 'WITHDRAWN' }) }), { ...ALL_PASS, RECORD_PROMOTED: 'WITHDRAWN' }],
    [
      'an OPEN debate',
      () =>
        given({
          mention: mentionRow({ debateSession: { status: 'OPEN', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' } }),
        }),
      { ...ALL_PASS, ARGUED: 'NOT_ARGUED' },
    ],
    ['attribution never stored', () => given({ checks: [] }), { ...ALL_PASS, VERIFIED: 'NOT_VERIFIED' }],
    [
      'a stale pin',
      () => given({ mention: mentionRow({ contentVersionHash: 'content-older' }) }),
      { ...ALL_PASS, CITATION_CURRENT: 'NOT_CITATION_CURRENT' },
    ],
    [
      'a STALE-but-present version — both failures carry AWAITING_DERIVATION',
      () => given({ row: diffWithVersions([{ ...CURRENT_VERSION, beforeTextHash: 'text-before-v2' }]) }),
      {
        ...ALL_PASS,
        CITATION_CURRENT: 'AWAITING_DERIVATION',
        DERIVED: 'AWAITING_DERIVATION',
        INPUT_SOUND: 'AWAITING_DERIVATION',
      },
    ],
    [
      'a CONTRADICTED chunk in CURRENT',
      () => given({ row: diffWithVersions([currentChunks('CONTRADICTED')]) }),
      { ...ALL_PASS, INPUT_SOUND: 'INPUT_UNSOUND' },
    ],
    [
      'a CAPTURE record',
      () =>
        given({
          mention: mentionRow({ name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }),
          row: captureRow(),
          checks: [anchorCheck(BEFORE.id)],
        }),
      { ...ALL_PASS, INPUT_SOUND: 'NOT_DIFF_DERIVED' },
    ],
    [
      'a DOCUMENT record',
      () => given({ mention: mentionRow({ name: DOCUMENT_NAME }), row: documentRow(), checks: [] }),
      {
        ...ALL_PASS,
        VERIFIED: 'DOCUMENT_CLASS_NOT_BUILT',
        CITATION_CURRENT: 'DOCUMENT_CLASS_NOT_BUILT',
        DERIVED: 'DOCUMENT_CLASS_NOT_BUILT',
        INPUT_SOUND: 'DOCUMENT_CLASS_NOT_BUILT',
      },
    ],
  ])('%s', async (_label, setup, expected) => {
    setup();
    expect(reasonsOf((await publishable('mention-1')).conjuncts)).toEqual(expected);
  });
});

describe('what publishable LOADS — five round trips, and not one chunk of its own', () => {
  it('its own query selects PROVENANCE and NEVER `chunks`', async () => {
    // REVIEW's round-1 finding, held as an assertion on what the double was
    // ASKED. The first draft selected `chunks` here AND called check 17, which
    // does its own `findMany` for them — so the column was loaded twice and the
    // first copy was either dead or the beginning of a second spelling of the
    // last clause.
    given();
    await publishable('mention-1');

    const own = asked.find((a) => a.model === 'evidence' && a.op === 'findUnique');
    expect(own).toBeDefined();
    expect(JSON.stringify(own?.args)).not.toContain('chunks');
  });

  it('check 17 is the ONE caller that loads them, and it is CALLED even for a capture', async () => {
    // The scope rule — "names a diff, NOT typed FORENSIC_DIFF" — lives in that
    // module; deciding here that a capture need not be asked would put one rule
    // in two files.
    given({
      mention: mentionRow({ name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }),
      row: captureRow(),
      checks: [anchorCheck(BEFORE.id)],
    });
    await publishable('mention-1');

    const soundness = asked.filter(
      (a) => a.model === 'evidence' && a.op === 'findMany' && JSON.stringify(a.args).includes('chunks'),
    );
    expect(soundness).toHaveLength(1);
  });

  it('a mention that does not exist THROWS, naming it — there is no report to be its subject', async () => {
    given();
    await expect(publishable('mention-absent')).rejects.toThrow('mention-absent');
  });
});

describe('publishableEvidence — the EVIDENCE half of PUBLISHABLE(v)', () => {
  const second = (over: Row = {}): Row =>
    mentionRow({ id: 'mention-2', name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash, ...over });

  function twoMentions(rows: Row[], mentions: Row[], checks: Row[]): void {
    store.mentions = mentions;
    store.mention = mentions[0] ?? null;
    store.evidenceRows = rows;
    store.evidence = rows[0] ?? null;
    store.integrityChecks = checks;
  }

  it('folds over both mentions: one failing makes the version unpublishable, and it is NAMED', async () => {
    twoMentions(
      [diffRow(), captureRow({ status: 'WITHDRAWN' })],
      [mentionRow(), second()],
      [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)],
    );
    const report = await publishableEvidence('version-1');

    expect(report.mentionsExamined).toBe(2);
    expect(report.evaluable && report.publishable).toBe(false);
    const failed = report.mentions.filter((m) => m.evaluable && !m.publishable).map((m) => m.examined.mentionId);
    expect(failed).toEqual(['mention-2']);
  });

  it('every mention publishable: the version is, and EACH mention\'s own report is carried', async () => {
    // ASSERTED OVER THE MENTIONS, not over the verdict alone. `publishable: true`
    // beside an empty `mentions` is what an unconditional stub returns, so a case
    // that read only the verdict would be satisfied by one — the `argued` lesson,
    // which this file exists to apply per conjunct.
    twoMentions(
      [diffRow(), captureRow()],
      [mentionRow(), second()],
      [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)],
    );
    const report = await publishableEvidence('version-1');

    expect(report.evaluable && report.publishable).toBe(true);
    expect(report.mentions.map((m) => m.examined.mentionId)).toEqual(['mention-1', 'mention-2']);
    expect(report.mentions.every((m) => m.evaluable && m.publishable)).toBe(true);
  });

  it('mentionsExamined is reported EVEN AT ZERO, and precedes the verdict', async () => {
    // 11b's rule: an instrument over an empty subject set is honest only when the
    // count comes before the answer. A version with no EVIDENCE mention folds
    // vacuously true — A6 :1203 assigns that failure to `CITES_EVIDENCE`, which
    // is thesis A6's check 3 and thesis step 23's, so this fold does not steal it.
    twoMentions([], [], []);
    const report = await publishableEvidence('version-1');

    // IT COUNTED, rather than guessing zero: the count is what the fold ASKED
    // for, and a report that never asked would carry the same number.
    expect(asked.filter((a) => a.model === 'thesisMention' && a.op === 'findMany')).toHaveLength(1);
    expect(report.mentionsExamined).toBe(0);
    expect(Object.keys(report).indexOf('mentionsExamined')).toBeLessThan(
      Object.keys(report).indexOf('publishable'),
    );
    expect(report.evaluable && report.publishable).toBe(true);
  });

  it('asks for the version\'s EVIDENCE mentions alone — the fold widens at document step 28', async () => {
    twoMentions([diffRow()], [mentionRow()], [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)]);
    await publishableEvidence('version-1');

    const query = asked.find((a) => a.model === 'thesisMention' && a.op === 'findMany');
    expect(query?.args).toMatchObject({ where: { versionId: 'version-1', kind: 'EVIDENCE' } });
  });

  it('a version citing a DOCUMENT record is NOT EVALUABLE, and names the mention it could not grade', async () => {
    twoMentions(
      [diffRow(), documentRow()],
      [mentionRow(), second({ name: DOCUMENT_NAME })],
      [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)],
    );
    const report = await publishableEvidence('version-1');

    expect(report.evaluable).toBe(false);
    expect(!report.evaluable && report.reason).toBe('DOCUMENT_CLASS_NOT_BUILT');
    expect(!report.evaluable && report.notEvaluable.map((m) => m.mentionId)).toEqual(['mention-2']);
  });
});
