// ---------------------------------------------------------------------------
// IS THE INPUT BEHIND A CITED EVIDENCE RECORD SOUND?
//
// The rule `EVIDENCE_DIFF_INPUT_SOUND` is computed from. Five survival states
// reach it and FOUR OF THEM FAIL, which is the departure from `promotionBlockFor`
// this suite exists to pin: promotion may proceed on an unchecked diff, because
// unchecked is not refuted; publication may not, because publishing asserts the
// change in public.
//
// The state-by-state table is asserted here rather than only through the gate so
// that a change to the mapping fails in the place that owns it. The BLOCKING
// behaviour is asserted at the hardest caller — the publication gate — in
// thesisPublication.test.ts.
// ---------------------------------------------------------------------------

const db = { evidence: [] as Record<string, unknown>[] };

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findMany: jest.fn(async ({ where }: { where: { fileHash: { in: string[] } } }) =>
        db.evidence.filter((e) => where.fileHash.in.includes(e['fileHash'] as string)),
      ),
    },
  },
}));

import { assessEvidenceInputSoundness } from '../src/services/evidenceInputSoundness';
import { SURVIVAL_CHECK_VERSION, survivalSourceStateHash } from '../src/lib/diffSurvival';
import { TEXT_VERSION, survivalFixture } from './helpers/survivalFixture';

const BEFORE_HASH = 'a'.repeat(64);
const AFTER_HASH = 'b'.repeat(64);
const CHUNKS = JSON.stringify([
  'The Ministry stated that side effects are mild and temporary in all reported cases.',
]);

/**
 * A content version's chunks, each carrying its own survival — the COMPUTED
 * register of `DiffContentVersion` (evidence A2).
 *
 * REBASED AT EVIDENCE STEP 11b. This built a stored ROW verdict and the four
 * columns that said whether it was still about the row's inputs. Both went: a
 * verdict per row cannot say WHICH chunk the documents refute, and the staleness
 * question existed only because a re-derivation overwrote the row in place. A
 * derivation is now an APPENDED version, so the current one IS the answer and
 * there is no stale one to detect.
 */
function chunksWith(
  value: 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE',
): Record<string, unknown>[] {
  return [{ side: 'REMOVED', text: 'הוסר משפט', survival: value }];
}

/** A DIFF record whose current version holds one chunk in the given state. */
function diffDerived(fileHash: string, chunks: Record<string, unknown>[]): Record<string, unknown> {
  return {
    fileHash,
    kind: 'DIFF',
    urlVersionDiffId: `diff-for-${fileHash}`,
    urlVersionDiff: { contentVersions: [{ chunks }] },
  };
}

/** A DIFF record the walk has not derived yet — AWAITING_DERIVATION, not unsound. */
function awaitingDerivation(fileHash: string): Record<string, unknown> {
  return {
    fileHash,
    kind: 'DIFF',
    urlVersionDiffId: `diff-for-${fileHash}`,
    urlVersionDiff: { contentVersions: [] },
  };
}

function documentEvidence(fileHash: string): Record<string, unknown> {
  return { fileHash, kind: 'DOCUMENT', urlVersionDiffId: null, urlVersionDiff: null };
}

beforeEach(() => {
  db.evidence = [];
});

describe('the four states that fail, named apart', () => {
  it('SURVIVES is sound — the check can be green', async () => {
    // Asserted first and deliberately: a check with no reachable passing state
    // is worse than no check, and this is the state 14 of staging's 109 diffs
    // currently hold.
    db.evidence = [diffDerived('0xsound', chunksWith('SURVIVES'))];

    const report = await assessEvidenceInputSoundness(['0xsound']);

    expect(report.passed).toBe(true);
    expect(report.binding).toBe(true);
    expect(report.inScope).toBe(1);
    expect(report.unsound).toHaveLength(0);
  });

  it('CONTRADICTED fails, in the same words the promotion gate refuses with', async () => {
    db.evidence = [diffDerived('0xrefuted', chunksWith('CONTRADICTED'))];

    const report = await assessEvidenceInputSoundness(['0xrefuted']);

    expect(report.passed).toBe(false);
    expect(report.unsound[0]?.unsoundReason).toContain('refute 1 of 1');
    // WHAT THE SENTENCE MUST SAY, rather than which function wrote it. It was
    // borrowed verbatim from `promotionBlockFor` so the promotion gate and this
    // one could not describe a verdict differently; that display module went at
    // evidence step 11b with the columns it read. The property that mattered is
    // kept as a property: the refusal names the DEFECT — a record whose own
    // report the documents refute is evidence of a pipeline fault, not of a
    // change — and never lets a reader take it for a weaker record.
    expect(report.unsound[0]?.unsoundReason).toContain('pipeline defect, not of a change');
  });

  it('UNCHECKABLE fails as ITS OWN outcome, never folded into refutation', async () => {
    // The distinction the researcher asked to keep: a diff nothing could be
    // checked about is not a diff the documents refute, and a refusal that said
    // so would send someone hunting for a contradiction that does not exist.
    db.evidence = [diffDerived('0xunverifiable', chunksWith('UNCHECKABLE'))];

    const report = await assessEvidenceInputSoundness(['0xunverifiable']);

    expect(report.passed).toBe(false);
    const reason = report.unsound[0]?.unsoundReason ?? '';
    expect(reason).toContain('No check of this record');
    expect(reason).not.toContain('CONTRADICTED');
    // The cause is carried through with a COUNT rather than a fixed sentence,
    // which is what a per-chunk register makes possible: the row-level verdict
    // could only say "something was uncheckable", and this says how much of the
    // record it was.
    expect(reason).toContain('1 of 1 chunks could not be checked');
  });

  it('AWAITING_DERIVATION fails — a diff with no version has never been checked', async () => {
    // The state the two row-level ones collapse into. `UNCHECKED` and `STALE`
    // were both "the platform has no current answer": the first because no
    // verdict had ever been written, the second because the one written was about
    // inputs the row no longer held. Under evidence A2 a derivation is APPENDED,
    // so the current version IS the answer and staleness is unrepresentable —
    // what remains is a diff the walk has not derived at all.
    //
    // AND IT IS STILL A FAILURE, not a shrug: a thesis may not assert in public a
    // change the platform has never checked.
    db.evidence = [awaitingDerivation('0xawaiting')];

    const report = await assessEvidenceInputSoundness(['0xawaiting']);

    expect(report.passed).toBe(false);
    expect(report.unsound[0]?.survival?.state).toBe('AWAITING_DERIVATION');
    expect(report.unsound[0]?.unsoundReason).toContain('nothing to judge yet');
  });

  // THE `STALE` CASE RETIRES WITH THE STATE AT EVIDENCE STEP 11b. It held that a
  // verdict saying SURVIVES over provenance that no longer matched the chunks
  // must not pass — the shape a gate reading the stored verdict alone would
  // publish on. That shape is now unconstructible: a re-derivation appends a
  // version rather than overwriting a row, so a verdict and the chunks it judged
  // cannot come apart. The defect is designed out rather than tested for.
});

describe('scope, and saying so', () => {
  it('is NON-BINDING when nothing cited is diff-derived', async () => {
    // A pass earned by having nothing to judge. It passes — refusing a thesis
    // for citing DOCUMENT evidence would be wrong — but it must not read as a
    // verification that never happened.
    db.evidence = [documentEvidence('0xdoc')];

    const report = await assessEvidenceInputSoundness(['0xdoc']);

    expect(report.passed).toBe(true);
    expect(report.binding).toBe(false);
    expect(report.inScope).toBe(0);
    expect(report.outOfScope).toBe(1);
  });

  it('judges the diff-derived records and counts the rest as uncovered', async () => {
    db.evidence = [documentEvidence('0xdoc'), diffDerived('0xsound', chunksWith('SURVIVES'))];

    const report = await assessEvidenceInputSoundness(['0xdoc', '0xsound']);

    expect(report.passed).toBe(true);
    expect(report.binding).toBe(true);
    expect(report.inScope).toBe(1);
    expect(report.outOfScope).toBe(1);
  });

  it('leaves "cited but not in the vault" to check 5 rather than answering it twice', async () => {
    const report = await assessEvidenceInputSoundness(['0xnowhere']);

    expect(report.rows).toHaveLength(0);
    expect(report.binding).toBe(false);
    // Passing here is correct and is not a hole: the gate's check 5 already
    // blocks on a hash the vault does not hold, and two refusals for one defect
    // send a researcher looking for two problems.
    expect(report.passed).toBe(true);
  });

  it('reports a record whose diff cannot be loaded rather than dropping it', async () => {
    // Unreachable behind a foreign key, and asserted anyway: a subject quietly
    // filtered out of a pass is a subject reported as nothing to check.
    db.evidence = [
      { fileHash: '0xorphan', evidenceType: 'FORENSIC_DIFF', urlVersionDiffId: 'gone', urlVersionDiff: null },
    ];

    const report = await assessEvidenceInputSoundness(['0xorphan']);

    expect(report.passed).toBe(false);
    expect(report.inScope).toBe(1);
    expect(report.unsound[0]?.unsoundReason).toContain('could not be loaded');
  });

  it('asks nothing when nothing is cited', async () => {
    const report = await assessEvidenceInputSoundness([]);

    expect(report.rows).toHaveLength(0);
    expect(report.binding).toBe(false);
  });
});
