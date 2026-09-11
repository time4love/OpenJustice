// ---------------------------------------------------------------------------
// `thesis-cites-verified` — THE INSTRUMENT, AND THE BREAKAGE THAT PROVES IT.
//
// Plan §4 and both A7s: "None is proven until it has been observed to FAIL." The
// 11b precedent is exact — its cases went red by name against a checker that
// returned `{ rows, malformed: [] }` unconditionally before the real one turned
// them green. Here the stub returns `{ versions: 1, citations: 1, … [] }`
// unconditionally, and every case below was observed RED against it first.
//
// FIXTURES, AND THEY STAND IN FOR A STAGING EXERCISE THAT CANNOT HAPPEN YET.
// Nothing in this tree creates a thesis, a version or a mention, so on staging
// this instrument's honest answer is two zero counts. Thesis step 24's exercise
// is "exits 2 before the new version and 0 after"; the EXIT-1 breakage that
// proves the gate held belongs to no later step, and it is this file's.
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { asked, resetDouble, store, written, type Row } from '../helpers/evidenceDouble';
import { AFTER, BEFORE, CAPTURE_NAME, CURRENT_VERSION, DIFF_NAME, URL, anchorCheck } from '../helpers/corpusFixture';
import { auditTheses, exitCodeFor, formatThesisAudit } from '../../src/services/auditTheses';
import * as predicates from '../../src/services/evidencePredicates';

const withPage = (c: Record<string, unknown>): Row => ({ ...c, trackedUrl: { url: URL } });
const BEFORE_ROW = withPage(BEFORE);
const AFTER_ROW = withPage(AFTER);
const DOCUMENT_NAME = `0x${'dc'.repeat(32)}`;

function diffRow(over: Row = {}, versions: Row[] = [CURRENT_VERSION]): Row {
  return {
    fileHash: DIFF_NAME,
    kind: 'DIFF',
    status: 'PROMOTED',
    snapshotId: null,
    snapshot: null,
    urlVersionDiffId: 'diff-1',
    urlVersionDiff: { id: 'diff-1', beforeSnapshot: BEFORE_ROW, afterSnapshot: AFTER_ROW, contentVersions: versions },
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

/** A citation on a version — PUBLISHED when `published` is set, which is what FLAGGED reads. */
function mention(
  id: string,
  name: string,
  over: { thesisId?: string; versionId?: string; published?: boolean; pin?: string; debate?: Row | null } = {},
): Row {
  const thesisId = over.thesisId ?? 'thesis-1';
  return {
    id,
    versionId: over.versionId ?? 'version-1',
    kind: 'EVIDENCE',
    name,
    contentVersionHash:
      over.pin ?? (name === CAPTURE_NAME ? BEFORE.textHash : CURRENT_VERSION.contentVersionHash),
    debateSessionId: `session-${id}`,
    thesisVersion: { thesisId, isPublished: over.published === false ? null : { id: thesisId } },
    debateSession:
      over.debate === undefined ? { status: 'PROMOTED', recordFileHash: name, thesisId } : over.debate,
  };
}

/** One published thesis citing one record, and the anchor checks the walk stored. */
function published(
  over: { mentions?: Row[]; rows?: Row[]; checks?: Row[]; theses?: Row[] } = {},
): void {
  store.theses = over.theses ?? [{ id: 'thesis-1', publishedVersionId: 'version-1' }];
  store.mentions = over.mentions ?? [mention('mention-1', DIFF_NAME)];
  store.evidenceRows = over.rows ?? [diffRow()];
  store.evidence = store.evidenceRows[0] ?? null;
  store.integrityChecks = over.checks ?? [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetDouble();
});

describe('EXIT 1 — a failure whose REASON no flag names: the gate did not hold', () => {
  it('a published citation with NO evidence row — exit 1, and NO THROW', async () => {
    // RECORD_PROMOTED is the only FAIL and `flagged` returns unflagged on a
    // missing row, so the version routes through the uncovered arm with no
    // throw and no second judgement.
    published({ rows: [] });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => [f.conjunct, f.reason])).toEqual([['RECORD_PROMOTED', 'NO_EVIDENCE_ROW']]);
  });

  it('a record that is not VERIFIED — its attribution was never stored', async () => {
    published({ checks: [] });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => f.reason)).toEqual(['NOT_VERIFIED']);
  });

  it('a citation whose debate is OPEN — not ARGUED', async () => {
    published({
      mentions: [mention('mention-1', DIFF_NAME, { debate: { status: 'OPEN', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' } })],
    });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => f.reason)).toEqual(['NOT_ARGUED']);
  });

  it('a citation whose debate is PROMOTED for ANOTHER THESIS — not ARGUED', async () => {
    published({
      mentions: [mention('mention-1', DIFF_NAME, { debate: { status: 'PROMOTED', recordFileHash: DIFF_NAME, thesisId: 'thesis-2' } })],
    });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => f.reason)).toEqual(['NOT_ARGUED']);
  });

  it('a citation whose CURRENT holds a CONTRADICTED chunk', async () => {
    published({
      rows: [diffRow({}, [{ ...CURRENT_VERSION, chunks: [{ side: 'REMOVED', text: 'x', survival: 'CONTRADICTED' }] }])],
    });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => [f.conjunct, f.reason])).toEqual([['INPUT_SOUND', 'INPUT_UNSOUND']]);
  });

  it('a citation whose CURRENT holds an UNCHECKABLE chunk', async () => {
    published({
      rows: [diffRow({}, [{ ...CURRENT_VERSION, chunks: [{ side: 'REMOVED', text: 'x', survival: 'UNCHECKABLE' }] }])],
    });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable.map((f) => [f.conjunct, f.reason])).toEqual([['INPUT_SOUND', 'INPUT_UNSOUND']]);
  });

  it('a version citing a DOCUMENT record that fails nothing — exit NOT 0, under NOT ANSWERABLE and not among the failures', async () => {
    // R38 round 3's M6: `evaluable: false` had no exit, and in practice fell
    // through to 0 — an instrument reporting the gate held about a citation it
    // never graded. It is not exit 2 either: exit 2 is the FLAG's, and a
    // non-evaluable citation carries none. The exit is shared with a failure;
    // the WORDS are not.
    published({ mentions: [mention('mention-1', DOCUMENT_NAME)], rows: [documentRow()], checks: [] });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unpublishable).toEqual([]);
    expect(report.notAnswerable.map((n) => [n.mentionId, n.reason])).toEqual([['mention-1', 'DOCUMENT_CLASS_NOT_BUILT']]);
    expect(formatThesisAudit(report)).toContain('NOT ANSWERABLE: 1 citations.');
    expect(formatThesisAudit(report)).not.toContain('THE GATE DID NOT HOLD');
  });
});

describe('EXIT 2 — a failure whose REASON the flag names: an expected state, listed with its flag', () => {
  it('a WITHDRAWN record cited by a published version', async () => {
    published({ rows: [diffRow({ status: 'WITHDRAWN' })] });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(2);
    expect(report.flagged.map((f) => [f.conjunct, f.reason])).toEqual([['RECORD_PROMOTED', 'WITHDRAWN']]);
    expect(report.blocks[0]?.mentions[0]?.flag).toEqual(['WITHDRAWN']);
  });

  it('a published citation whose pin is not CURRENT', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME, { pin: 'content-older' })] });
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(2);
    expect(report.flagged.map((f) => f.reason)).toEqual(['NOT_CITATION_CURRENT']);
  });

  it('a diff the walk owes a version: INPUT_SOUND FAILED, and the exit was STILL 2 — the key is the REASON', async () => {
    // THE CASE THAT PROVES THE KEY. The record's only stored version was derived
    // from text an endpoint no longer has, so CURRENT(diff) is undefined: DERIVED
    // fails, and after 7.3's rebase INPUT_SOUND fails TOO, on the same
    // AWAITING_DERIVATION — which `flagged` names. An id-keyed rule would send
    // INPUT_SOUND to exit 1; keyed on the reason, both go to 2.
    published({ rows: [diffRow({}, [{ ...CURRENT_VERSION, beforeTextHash: 'text-before-v2' }])] });
    const report = await auditTheses();

    const inputSound = report.blocks[0]?.mentions[0]?.conjuncts.find((c) => c.id === 'INPUT_SOUND');
    expect(inputSound?.verdict).toBe('FAIL');
    expect(exitCodeFor(report)).toBe(2);
    expect(report.unpublishable).toEqual([]);
    expect(report.flagged.map((f) => [f.conjunct, f.reason])).toEqual([
      ['DERIVED', 'AWAITING_DERIVATION'],
      ['INPUT_SOUND', 'AWAITING_DERIVATION'],
    ]);
  });
});

describe('the routing across versions, and the pass', () => {
  it('one version with a flagged citation AND one with a failed conjunct — exit 1 outranks exit 2', async () => {
    published({
      theses: [
        { id: 'thesis-1', publishedVersionId: 'version-1' },
        { id: 'thesis-2', publishedVersionId: 'version-2' },
      ],
      mentions: [
        mention('mention-1', DIFF_NAME),
        mention('mention-2', CAPTURE_NAME, {
          thesisId: 'thesis-2',
          versionId: 'version-2',
          debate: { status: 'OPEN', recordFileHash: CAPTURE_NAME, thesisId: 'thesis-2' },
        }),
      ],
      rows: [diffRow({ status: 'WITHDRAWN' }), captureRow()],
    });
    const report = await auditTheses();

    expect(report.flagged.map((f) => f.versionId)).toEqual(['version-1']);
    expect(report.unpublishable.map((f) => f.versionId)).toEqual(['version-2']);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('every citation publishable and unflagged — exit 0, and the block names what it examined', async () => {
    published();
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(0);
    expect([report.versions, report.citations]).toEqual([1, 1]);
    expect(report.blocks.map((b) => [b.versionId, b.mentions.map((m) => m.examined.mentionId)])).toEqual([
      ['version-1', ['mention-1']],
    ]);
  });

  it('ZERO published versions — exit 0, and the first two lines are the COUNTS', async () => {
    // Evidence A6 :1202, thesis A6 :1588, thesis A7 :1656-:1657 — "a pass that
    // examined nothing says zero, never nothing". Not a refusal: the question
    // "is any published citation unpublishable?" has a true answer at zero.
    published({ theses: [], mentions: [], rows: [] });
    const report = await auditTheses();
    const text = formatThesisAudit(report);

    expect(exitCodeFor(report)).toBe(0);
    expect(text.split('\n').slice(0, 2)).toEqual(['Published versions: 0', 'EVIDENCE citations: 0']);
    expect(text).toContain('this is a true answer about the');
    expect(text).toContain('NOT ANSWERABLE: 0 citations.');
    expect(text).toContain('NOT EXAMINED');
  });

  it('a HEAD-only citation is NOT examined — the non-firing control', async () => {
    // An unpublishable citation on a draft's head is a draft's ordinary state.
    // A case that fired here would mean the instrument had the wrong subject set.
    published({
      theses: [{ id: 'thesis-1', publishedVersionId: null }],
      mentions: [mention('mention-1', DIFF_NAME, { published: false })],
      rows: [],
    });
    const report = await auditTheses();

    expect(report.versions).toBe(0);
    expect(exitCodeFor(report)).toBe(0);
    expect(asked.filter((a) => a.model === 'thesisMention')).toEqual([]);
  });
});

describe('the fold ASSERTS the agreement between PUBLISHABLE and FLAGGED rather than assuming it', () => {
  it('a DERIVED FAIL on a mention FLAGGED reports unflagged — THROWS, naming the mention', async () => {
    // Planted by stubbing `flagged` to return unflagged. The two read the same
    // rows, so a DERIVED failure the flag does not cover is a contradiction
    // between two functions, and silently choosing an exit for it would hide
    // which one is wrong.
    published({ rows: [diffRow({}, [{ ...CURRENT_VERSION, beforeTextHash: 'text-before-v2' }])] });
    jest
      .spyOn(predicates, 'flagged')
      .mockResolvedValue({ flagged: false, armsEvaluated: predicates.FLAG_ARMS_EVALUATED, reasons: [] });

    await expect(auditTheses()).rejects.toThrow('mention-1');
  });
});

describe('READ-ONLY by construction', () => {
  it('WRITES NOTHING — an instrument that could repair would verify its own repair', async () => {
    published({ rows: [diffRow({ status: 'WITHDRAWN' })] });
    await auditTheses();
    expect(written).toEqual([]);
  });
});
