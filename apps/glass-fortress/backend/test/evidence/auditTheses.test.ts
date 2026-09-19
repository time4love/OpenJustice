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
// Staging holds one thesis and it has never been published, so this instrument's
// honest answer there is three zero counts. Thesis step 24's exercise — "exits 2
// before the new version and 0 after" — waits on the first real publication (the
// researcher's ruling, 2026-09-14); the EXIT-1 breakage that proves the gate held
// belongs to no later step, and it is this file's.
//
// COMPLETED AT THESIS STEP 24 (the R50 sketch §d, D11–D13, D18). The audit reads ONE
// `evaluatePublication` per published version, so every case's world holds what that
// evaluation loads: the version row, a framing that CHOSE its claim after an assessed
// round, and the corpus beneath the cited records — `loadHead` resolves every EVIDENCE
// name through it. TRAJECTORY_CURRENT and CLAIM_FRAMED join the evidence half; the
// NOT ANSWERABLE arm left, unreachable: a DOCUMENT citation cannot be resolved by the
// corpus, so its version THROWS (k′), and a version citing a document is audited from
// document refactor plan :396 (step 34).
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { asked, resetDouble, store, written, type Row } from '../helpers/evidenceDouble';
import { AFTER, BEFORE, CAPTURE_NAME, CURRENT_VERSION, DIFF_NAME, URL, anchorCheck } from '../helpers/corpusFixture';
import { auditTheses, exitCodeFor, formatThesisAudit } from '../../src/services/auditTheses';
import * as predicates from '../../src/services/evidencePredicates';
import * as publicationEvaluation from '../../src/services/publicationEvaluation';
import * as thesisPredicates from '../../src/services/thesisPredicates';
import { FRAMING, ROUNDS, THESIS, TRAJECTORY_ID, VERSION } from '../thesis/fixtures';
import { CURRENCIES, trajectoriesAre, trajectoriesUnresolved } from '../thesis/gateWorld';
import { seedCorpus } from '../thesis/tools';

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

/** A trajectory citation on a version — no pin, no debate (thesis A2). */
function trajectoryMention(id: string, over: { thesisId?: string; versionId?: string; published?: boolean } = {}): Row {
  const thesisId = over.thesisId ?? 'thesis-1';
  return {
    id,
    versionId: over.versionId ?? 'version-1',
    kind: 'TRAJECTORY',
    name: TRAJECTORY_ID,
    contentVersionHash: null,
    debateSessionId: null,
    thesisVersion: { thesisId, isPublished: over.published === false ? null : { id: thesisId } },
    debateSession: null,
  };
}

/**
 * One published thesis citing one record, and the anchor checks the walk stored — AND what the ONE evaluation loads
 * (D12, thesis step 24): each thesis whole, its published version, a framing that CHOSE the version's claim after an
 * assessed round, and the corpus beneath the cited records.
 */
function published(
  over: { mentions?: Row[]; rows?: Row[]; checks?: Row[]; theses?: { id: string; publishedVersionId: string | null }[] } = {},
): void {
  seedCorpus();
  const theses = over.theses ?? [{ id: 'thesis-1', publishedVersionId: 'version-1' }];
  store.theses = theses.map((t) => ({ ...THESIS, ...t, headVersionId: t.publishedVersionId ?? VERSION.id }));
  store.versions = theses.flatMap((t) => (t.publishedVersionId === null ? [] : [{ ...VERSION, id: t.publishedVersionId, thesisId: t.id }]));
  store.framings = theses.map((t) => ({ ...FRAMING, id: `framing-of-${t.id}`, thesisId: t.id }));
  store.framingRounds = theses.flatMap((t) => ROUNDS.map((r) => ({ ...r, id: `${r.id}-of-${t.id}`, framingId: `framing-of-${t.id}` })));
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

  it('(c) a published trajectory NO stored pass holds — exit 1, under THE GATE DID NOT HOLD', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME), trajectoryMention('mention-t')] });
    trajectoriesUnresolved();
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unresolved.map((t) => [t.versionId, t.trajectoryId])).toEqual([['version-1', TRAJECTORY_ID]]);
    expect(formatThesisAudit(report)).toContain('THE GATE DID NOT HOLD');
  });

  it('(d) a published version whose claim NO framing chose — CLAIM_FRAMED false, exit 1', async () => {
    published();
    store.framingRounds = store.framingRounds.map((r) => (r['type'] === 'CHOSEN' ? { ...r, content: { ...(r['content'] as Row), claim: 'טענה אחרת' } } : r));
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unframed).toEqual([{ thesisId: 'thesis-1', versionId: 'version-1' }]);
  });

  it('(g) the evaluation\'s claimFramed IS what is read — stubbed false over a framed world, exit 1', async () => {
    published();
    const real = publicationEvaluation.evaluatePublication;
    jest
      .spyOn(publicationEvaluation, 'evaluatePublication')
      .mockImplementation(async (versionId, assessment) => ({ ...(await real(versionId, assessment)), claimFramed: false }));
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(1);
    expect(report.unframed.map((u) => u.versionId)).toEqual(['version-1']);
  });

  it('(e) a stale trajectory AND an evidence citation NOT_ARGUED on one version — exit 1 outranks exit 2, and both are listed', async () => {
    published({
      mentions: [
        mention('mention-1', DIFF_NAME, { debate: { status: 'OPEN', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' } }),
        trajectoryMention('mention-t'),
      ],
    });
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const report = await auditTheses();

    expect([report.unpublishable.map((f) => f.reason), report.stale.map((t) => t.trajectoryId)]).toEqual([['NOT_ARGUED'], [TRAJECTORY_ID]]);
    expect(exitCodeFor(report)).toBe(1);
  });
});

describe('THROWN — a malformed load inside the ONE evaluation is never answered as "the gate held" (q7; §6-D18)', () => {
  it('(k) a published citation whose name NO corpus record resolves — auditTheses() REJECTS naming the version, and nothing is swallowed', async () => {
    const NOWHERE = `0x${'ab'.repeat(32)}`;
    published({ mentions: [mention('mention-1', NOWHERE)], rows: [] });

    await expect(auditTheses()).rejects.toThrow(new RegExp(`version-1.*${NOWHERE}`));
  });

  it("(k′) a version citing a DOCUMENT record — auditTheses() REJECTS naming the version and the citation's record; the report is never produced (moved from the NOT ANSWERABLE case)", async () => {
    // R38 round 3's M6 kept the PROPERTY this case holds: a citation nobody graded is never reported as the gate holding.
    // Before thesis step 24 it exited 1 under NOT ANSWERABLE. Since the audit reads the ONE evaluation, the corpus cannot
    // resolve a DOCUMENT's name and the evaluation throws first — so there is no report to be read as a pass, and
    // `runOperationalScript` exits 1 on the throw (test/operationalScriptExit.test.ts). Documents are citable, and this
    // version audited, from document refactor plan :396 (step 34).
    published({ mentions: [mention('mention-1', DOCUMENT_NAME)], rows: [documentRow()], checks: [] });

    await expect(auditTheses()).rejects.toThrow(new RegExp(`version-1.*${DOCUMENT_NAME}`));
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

  it('(a) a published trajectory the newest pass DISAGREES with — exit 2, listed under STALE_TRAJECTORY', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME), trajectoryMention('mention-t')] });
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(2);
    expect(report.stale.map((t) => [t.versionId, t.trajectoryId, t.state])).toEqual([['version-1', TRAJECTORY_ID, 'RECOMPUTED_DISAGREES']]);
    // THE THIRD COUNT, above zero (chunk 3 round 1, M1): one trajectory citation examined, and the report's third line says so.
    expect(report.trajectories).toBe(1);
    expect(formatThesisAudit(report).split('\n').at(2)).toBe('TRAJECTORY citations: 1');
    expect(formatThesisAudit(report)).toContain('STALE_TRAJECTORY');
  });

  it('(b) a published trajectory the newest pass NO LONGER FOLLOWS — exit 2: STALE_TRAJECTORY through the ONE predicate', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME), trajectoryMention('mention-t')] });
    trajectoriesAre(CURRENCIES.NOT_FOLLOWED_BY_LATEST);
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(2);
    expect(report.stale.map((t) => t.state)).toEqual(['NOT_FOLLOWED_BY_LATEST']);
  });

  it('(f) `trajectoryCurrent` IS what decides — stubbed false over an AGREEING world, exit 2', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME), trajectoryMention('mention-t')] });
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    jest.spyOn(thesisPredicates, 'trajectoryCurrent').mockReturnValue(false);
    const report = await auditTheses();

    expect(exitCodeFor(report)).toBe(2);
    expect(report.stale.map((t) => t.state)).toEqual(['RECOMPUTED_AGREES']);
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

  it('(i) ZERO published versions — exit 0, the first THREE lines are the COUNTS, and NOT EXAMINED names what A7 does not audit', async () => {
    // Evidence A6 :1202, thesis A6 :1588, thesis A7 :1656-:1657 — "a pass that
    // examined nothing says zero, never nothing". Not a refusal: the question
    // "is any published citation unpublishable?" has a true answer at zero.
    published({ theses: [], mentions: [], rows: [] });
    const report = await auditTheses();
    const text = formatThesisAudit(report);

    expect(exitCodeFor(report)).toBe(0);
    expect(text.split('\n').slice(0, 3)).toEqual(['Published versions: 0', 'EVIDENCE citations: 0', 'TRAJECTORY citations: 0']);
    expect(text).toContain('this is a true answer about the');
    const notExamined = text.slice(text.indexOf('NOT EXAMINED'));
    for (const named of ['CURRENT_ANALYSIS', 'GAPS_DECIDED', 'public-interest', 'publication assessment', 'SHED']) {
      expect(notExamined).toContain(named);
    }
    expect(text).not.toContain('NOT ANSWERABLE');
  });

  it('(h) a HEAD-only TRAJECTORY citation is NOT examined — the non-firing control for the new arm', async () => {
    published({ theses: [{ id: 'thesis-1', publishedVersionId: null }], mentions: [trajectoryMention('mention-t', { published: false })], rows: [] });
    const resolve = trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const report = await auditTheses();

    expect([report.versions, report.trajectories, report.stale]).toEqual([0, 0, []]);
    expect(resolve).not.toHaveBeenCalled();
    expect(exitCodeFor(report)).toBe(0);
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

  it('(j) WRITES NOTHING with the new arms — a stale trajectory and an unframed claim graded, no row written', async () => {
    published({ mentions: [mention('mention-1', DIFF_NAME), trajectoryMention('mention-t')] });
    store.framingRounds = store.framingRounds.map((r) => (r['type'] === 'CHOSEN' ? { ...r, content: { ...(r['content'] as Row), claim: 'טענה אחרת' } } : r));
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const report = await auditTheses();

    expect([report.stale.length, report.unframed.length]).toEqual([1, 1]);
    expect(written).toEqual([]);
  });
});
