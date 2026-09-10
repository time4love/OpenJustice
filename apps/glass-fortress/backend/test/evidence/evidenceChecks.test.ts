// ---------------------------------------------------------------------------
// THE SIX CHECKS OF A6 — evidence step 15, chunk 2 §7.2.
//
// The gate MAPS and does not LOAD, and that is asserted on what the code ASKED
// rather than on what it answered: §5b's source scan can hold that the module
// imports no Prisma client, and only a case can hold that a run of it made no
// query of its own. Both are the same rule from two sides.
//
// THE ORDER IS THESIS A6's, AND IT IS NOT THE PREDICATE'S. `CONJUNCT_ORDER` is
// A3's clause order with the promoted precondition last; these are ids 5-10 of
// the gate's own table. §0a is what reconciles them, and the mapping is data so
// that an equality can police it.
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { asked, resetDouble, store, written, type Row } from '../helpers/evidenceDouble';
import { AFTER, BEFORE, CAPTURE_NAME, CURRENT_VERSION, DIFF_NAME, URL, anchorCheck } from '../helpers/corpusFixture';
import { evidenceChecks, type EvidenceCheck } from '../../src/services/evidenceChecks';

const withPage = (c: Record<string, unknown>): Row => ({ ...c, trackedUrl: { url: URL } });
const BEFORE_ROW = withPage(BEFORE);
const AFTER_ROW = withPage(AFTER);
const DOCUMENT_NAME = `0x${'dc'.repeat(32)}`;

/** Thesis A6 :1592-:1597, ids 5 to 10 — the order the gate renders. */
const A6_ORDER = [
  'EVIDENCE_VERIFIED',
  'EVIDENCE_PINNED_CURRENT',
  'EVIDENCE_ARGUED',
  'EVIDENCE_NOT_WITHDRAWN',
  'EVIDENCE_DERIVED',
  'EVIDENCE_DIFF_INPUT_SOUND',
];

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

const documentRow = (): Row => ({
  fileHash: DOCUMENT_NAME,
  kind: 'DOCUMENT',
  status: 'PROMOTED',
  snapshotId: null,
  snapshot: null,
  urlVersionDiffId: null,
  urlVersionDiff: null,
  documentCommitment: DOCUMENT_NAME,
});

function mentionRow(id: string, refId: string, over: Row = {}): Row {
  return {
    id,
    thesisVersionId: 'version-1',
    type: 'EVIDENCE',
    refId,
    contentVersionHash: refId === CAPTURE_NAME ? BEFORE.textHash : CURRENT_VERSION.contentVersionHash,
    debateSessionId: `session-${id}`,
    thesisVersion: { thesisId: 'thesis-1' },
    debateSession: { status: 'PROMOTED', recordFileHash: refId, thesisId: 'thesis-1' },
    ...over,
  };
}

function given(mentions: Row[], rows: Row[], checks: Row[] = [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)]): void {
  store.mentions = mentions;
  store.mention = mentions[0] ?? null;
  store.evidenceRows = rows;
  store.evidence = rows[0] ?? null;
  store.integrityChecks = checks;
}

const check = (checks: EvidenceCheck[], id: string): EvidenceCheck => {
  const held = checks.find((c) => c.id === id);
  if (held === undefined) throw new Error(`no check ${id}`);
  return held;
};

beforeEach(() => {
  jest.clearAllMocks();
  resetDouble();
});

describe('the six ids, in thesis A6\'s order', () => {
  it('BY EQUALITY, ids 5 to 10 — and it is NOT the predicate\'s conjunct order', async () => {
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    const checks = await evidenceChecks('version-1');
    expect(checks.map((c) => c.id)).toEqual(A6_ORDER);
  });

  it('SIX members, and EVIDENCE_TIER is not one of them', async () => {
    // A6 :1209: check 6 is RETIRED with the tier. It gated on `evidenceTier >= 2`
    // and reported itself NON-BINDING — the shape §0b's rule exists about — and
    // the id must not return as a seventh row with the same behaviour.
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    const checks = await evidenceChecks('version-1');
    expect(checks).toHaveLength(6);
    expect(checks.map((c) => c.id)).not.toContain('EVIDENCE_TIER');
  });

  it('every check is HARD — there is no advisory evidence check', async () => {
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    const checks = await evidenceChecks('version-1');
    expect(checks.map((c) => c.kind)).toEqual(Array<string>(6).fill('hard'));
  });

  it('the six rows are a BIJECTION with the six conjuncts — no conjunct is rendered twice or dropped', async () => {
    // §0a: A3 states five clauses and A6 six checks, so the checks are not a
    // bijection with A3 — but they ARE one with the conjuncts, because the sixth
    // is the precondition A6 promotes. A row that repeated a conjunct would be
    // the gate asking one predicate under two names.
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow({ status: 'WITHDRAWN' })]);
    const checks = await evidenceChecks('version-1');
    const failing = checks.filter((c) => c.verdict === 'FAIL').map((c) => c.id);
    expect(failing).toEqual(['EVIDENCE_NOT_WITHDRAWN']);
  });
});

describe('the gate MAPS and does not LOAD', () => {
  it('asks NOTHING of its own: the only mention query is publishableEvidence\'s', async () => {
    // The assertion §5b's source scan cannot make. The scan holds that this
    // module imports no Prisma client; this holds that a RUN of it made no query
    // — and a gate that could load would be the one function `publishable`
    // loaded two ways.
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    await evidenceChecks('version-1');

    const versionQueries = asked.filter((a) => a.model === 'thesisMention' && a.op === 'findMany');
    expect(versionQueries).toHaveLength(1);
    expect(versionQueries[0]?.args).toMatchObject({
      where: { thesisVersionId: 'version-1', type: 'EVIDENCE' },
    });
  });

  it('calls publishableEvidence ONCE for a version with THREE mentions, not three times', async () => {
    // COUNTED ON THE CALL, never on the answer: three calls would return the same
    // six rows, so an assertion about the output cannot tell one from three.
    given(
      [
        mentionRow('mention-1', DIFF_NAME),
        mentionRow('mention-2', CAPTURE_NAME),
        mentionRow('mention-3', DIFF_NAME),
      ],
      [diffRow(), captureRow()],
      [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)],
    );
    await evidenceChecks('version-1');

    // ONE version load, and one mention load per mention — publishable's own L1.
    expect(asked.filter((a) => a.model === 'thesisMention' && a.op === 'findMany')).toHaveLength(1);
    expect(asked.filter((a) => a.model === 'thesisMention' && a.op === 'findUnique')).toHaveLength(3);
  });

  it('WRITES NOTHING — readiness is a read that writes nothing (T5)', async () => {
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    await evidenceChecks('version-1');
    expect(written).toEqual([]);
  });
});

describe('each check names what it examined, and an empty scope says so', () => {
  it('names the mention and the version it examined it at, on EVERY check', async () => {
    given([mentionRow('mention-1', DIFF_NAME)], [diffRow()]);
    const checks = await evidenceChecks('version-1');

    for (const c of checks) {
      expect(c.examined).toEqual([
        {
          mentionId: 'mention-1',
          fileHash: DIFF_NAME,
          contentVersionHash: CURRENT_VERSION.contentVersionHash,
        },
      ]);
    }
  });

  it('a version with NO EVIDENCE mention: every check EXAMINED_NONE, and `examined` is present at zero', async () => {
    given([], []);
    const checks = await evidenceChecks('version-1');

    expect(checks.map((c) => c.verdict)).toEqual(Array<string>(6).fill('EXAMINED_NONE'));
    expect(checks.every((c) => c.examined.length === 0)).toBe(true);
    // A6 :1203 assigns the failure of a version citing nothing to CITES_EVIDENCE,
    // which is thesis A6's check 3 and thesis step 23's. These six report what
    // they examined and do not steal it.
    expect(checks.every((c) => c.failures.length === 0)).toBe(true);
  });

  it('check 17 over a CAPTURE-ONLY version: EXAMINED_NONE, never a PASS', async () => {
    // Document A6 :1533's rule, applied to the kind it was written about: a
    // check with no subject, never a check that passed. The other five PASS,
    // which is what makes this a scope answer rather than a failure.
    given([mentionRow('mention-1', CAPTURE_NAME)], [captureRow()], [anchorCheck(BEFORE.id)]);
    const checks = await evidenceChecks('version-1');

    expect(check(checks, 'EVIDENCE_DIFF_INPUT_SOUND').verdict).toBe('EXAMINED_NONE');
    expect(check(checks, 'EVIDENCE_DIFF_INPUT_SOUND').examined).toHaveLength(1);
    expect(checks.filter((c) => c.verdict === 'PASS').map((c) => c.id)).toEqual(
      A6_ORDER.filter((id) => id !== 'EVIDENCE_DIFF_INPUT_SOUND'),
    );
  });

  it('a DOCUMENT mention makes FOUR checks EXAMINED_NONE and leaves the other two answering', async () => {
    given([mentionRow('mention-1', DOCUMENT_NAME)], [documentRow()], []);
    const checks = await evidenceChecks('version-1');

    const none = checks.filter((c) => c.verdict === 'EXAMINED_NONE').map((c) => c.id);
    expect(none).toEqual([
      'EVIDENCE_VERIFIED',
      'EVIDENCE_PINNED_CURRENT',
      'EVIDENCE_DERIVED',
      'EVIDENCE_DIFF_INPUT_SOUND',
    ]);
    expect(check(checks, 'EVIDENCE_ARGUED').verdict).toBe('PASS');
    expect(check(checks, 'EVIDENCE_NOT_WITHDRAWN').verdict).toBe('PASS');
  });

  it('ONE subject examined and one that examined nothing: the check still PASSES', async () => {
    // The fold's third arm. A capture beside a diff means check 17 has a subject
    // and a non-subject; it is EXAMINED_NONE only when EVERY subject reported so.
    given(
      [mentionRow('mention-1', DIFF_NAME), mentionRow('mention-2', CAPTURE_NAME)],
      [diffRow(), captureRow()],
    );
    const checks = await evidenceChecks('version-1');

    expect(check(checks, 'EVIDENCE_DIFF_INPUT_SOUND').verdict).toBe('PASS');
    expect(check(checks, 'EVIDENCE_DIFF_INPUT_SOUND').examined).toHaveLength(2);
  });
});

describe('a failure names the subject and the sentence', () => {
  it('the failing mention, its record, and the detail the predicate produced', async () => {
    given([mentionRow('mention-1', DIFF_NAME, { contentVersionHash: 'content-older' })], [diffRow()]);
    const checks = await evidenceChecks('version-1');

    const pinned = check(checks, 'EVIDENCE_PINNED_CURRENT');
    expect(pinned.verdict).toBe('FAIL');
    expect(pinned.failures).toHaveLength(1);
    expect(pinned.failures[0]?.mentionId).toBe('mention-1');
    expect(pinned.failures[0]?.fileHash).toBe(DIFF_NAME);
    expect(pinned.failures[0]?.detail).toContain('content-older');
  });

  it('one failing mention of two: the check FAILS and names only the one that did', async () => {
    given(
      [mentionRow('mention-1', DIFF_NAME), mentionRow('mention-2', CAPTURE_NAME)],
      [diffRow(), captureRow({ status: 'WITHDRAWN' })],
    );
    const checks = await evidenceChecks('version-1');

    const withdrawn = check(checks, 'EVIDENCE_NOT_WITHDRAWN');
    expect(withdrawn.verdict).toBe('FAIL');
    expect(withdrawn.failures.map((f) => f.mentionId)).toEqual(['mention-2']);
    expect(withdrawn.examined).toHaveLength(2);
  });

  it('THE ROWS ALONE READ AS A CLEAN BILL over a version the predicate cannot grade', async () => {
    // THE SEAM, ASSERTED AS WHAT THE OUTPUT DOES NOT CLAIM. `publishableEvidence`
    // answers `evaluable: false` for this version — four conjuncts examined
    // nothing because the DOCUMENT class has no predicates, and none failed — and
    // the six rows have no field that can carry it. Mapped alone they are two
    // PASSes, four EXAMINED_NONEs and NO failure.
    //
    // The rows are not wrong; they say exactly what they examined. What they
    // cannot say is the thing one level up, so thesis step 23's consumer must ask
    // for BOTH, and §4c's instrument routes `evaluable: false` to exit 1 under
    // NOT_ANSWERABLE rather than reading these rows as a pass. Without this case
    // the drop is invisible: every assertion above it passes.
    given([mentionRow('mention-1', DOCUMENT_NAME)], [documentRow()], []);
    const checks = await evidenceChecks('version-1');

    expect(checks.filter((c) => c.verdict === 'FAIL')).toEqual([]);
    expect(checks.filter((c) => c.verdict === 'PASS').map((c) => c.id)).toEqual([
      'EVIDENCE_ARGUED',
      'EVIDENCE_NOT_WITHDRAWN',
    ]);
    // AND NOTHING IN THE SHAPE SAYS THE VERSION COULD NOT BE ANSWERED FOR.
    const keys = new Set(checks.flatMap((c) => Object.keys(c)));
    expect(keys).toEqual(new Set(['id', 'kind', 'verdict', 'examined', 'failures']));
    expect(JSON.stringify(checks)).not.toContain('evaluable');
  });

  it('a version whose report is NOT EVALUABLE still renders six rows', async () => {
    // `publishableEvidence` returns the non-evaluable shape for a version citing
    // a DOCUMENT record that failed nothing, and the gate maps its per-mention
    // reports either way: a version the gate could not answer for is not a
    // version with no checks.
    given([mentionRow('mention-1', DOCUMENT_NAME)], [documentRow()], []);
    const checks = await evidenceChecks('version-1');

    expect(checks.map((c) => c.id)).toEqual(A6_ORDER);
    // AND EACH ROW NAMES THE MENTION IT EXAMINED. Six rows rendered from the
    // table alone would satisfy the id equality above while never having mapped
    // anything — the shape a gate that skipped the predicate returns.
    expect(checks.every((c) => c.examined.length === 1)).toBe(true);
    expect(check(checks, 'EVIDENCE_DERIVED').examined[0]?.fileHash).toBe(DOCUMENT_NAME);
  });
});
