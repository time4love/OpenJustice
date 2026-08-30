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

/** A stored verdict `survivalStateOf` reads as CURRENT — the provenance must match. */
function currentVerdict(
  value: 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE',
): Record<string, unknown> {
  return {
    survivalVerdict: value,
    survivalCheckVersion: SURVIVAL_CHECK_VERSION,
    survivalTextVersion: TEXT_VERSION,
    survivalCheckedAt: new Date('2026-08-28'),
    survivalChunksChecked: value === 'UNCHECKABLE' ? 0 : 1,
    survivalContradicted: value === 'CONTRADICTED' ? [{ side: 'REMOVED', excerpt: 'x' }] : [],
    survivalSourceStateHash: survivalSourceStateHash({
      beforeTextHash: BEFORE_HASH,
      afterTextHash: AFTER_HASH,
      rawDeletedText: CHUNKS,
      rawAddedText: '[]',
    }),
  };
}

function diffDerived(fileHash: string, survival: Record<string, unknown>): Record<string, unknown> {
  return {
    fileHash,
    evidenceType: 'FORENSIC_DIFF',
    urlVersionDiffId: `diff-for-${fileHash}`,
    urlVersionDiff: survivalFixture({
      rawDeletedText: CHUNKS,
      rawAddedText: '[]',
      beforeSnapshot: { textHash: BEFORE_HASH, textExtractionVersion: TEXT_VERSION },
      afterSnapshot: { textHash: AFTER_HASH, textExtractionVersion: TEXT_VERSION },
      ...survival,
    }),
  };
}

function documentEvidence(fileHash: string): Record<string, unknown> {
  return { fileHash, evidenceType: 'DOCUMENT', urlVersionDiffId: null, urlVersionDiff: null };
}

beforeEach(() => {
  db.evidence = [];
});

describe('the four states that fail, named apart', () => {
  it('SURVIVES is sound — the check can be green', async () => {
    // Asserted first and deliberately: a check with no reachable passing state
    // is worse than no check, and this is the state 14 of staging's 109 diffs
    // currently hold.
    db.evidence = [diffDerived('0xsound', currentVerdict('SURVIVES'))];

    const report = await assessEvidenceInputSoundness(['0xsound']);

    expect(report.passed).toBe(true);
    expect(report.binding).toBe(true);
    expect(report.inScope).toBe(1);
    expect(report.unsound).toHaveLength(0);
  });

  it('CONTRADICTED fails, in the same words the promotion gate refuses with', async () => {
    db.evidence = [diffDerived('0xrefuted', currentVerdict('CONTRADICTED'))];

    const report = await assessEvidenceInputSoundness(['0xrefuted']);

    expect(report.passed).toBe(false);
    expect(report.unsound[0]?.unsoundReason).toContain('CONTRADICTED');
    // The sentence is borrowed from promotionBlockFor rather than rewritten, so
    // the two gates cannot come to describe one verdict differently.
    expect(report.unsound[0]?.unsoundReason).toContain('cannot support evidence');
  });

  it('UNCHECKABLE fails as ITS OWN outcome, never folded into refutation', async () => {
    // The distinction the researcher asked to keep: a diff nothing could be
    // checked about is not a diff the documents refute, and a refusal that said
    // so would send someone hunting for a contradiction that does not exist.
    db.evidence = [diffDerived('0xunverifiable', currentVerdict('UNCHECKABLE'))];

    const report = await assessEvidenceInputSoundness(['0xunverifiable']);

    expect(report.passed).toBe(false);
    const reason = report.unsound[0]?.unsoundReason ?? '';
    expect(reason).toContain('No check of this record');
    expect(reason).not.toContain('CONTRADICTED');
    // The row's own cause is carried through, not a fixed sentence: this diff
    // reported nothing to compare, which is 88 of staging's 109.
    expect(reason).toContain('reports no changes');
  });

  it('UNCHECKED fails — never checked is not supported', async () => {
    // survivalFixture defaults to no verdict at all, which is what an untouched
    // row genuinely is.
    db.evidence = [diffDerived('0xunchecked', {})];

    const report = await assessEvidenceInputSoundness(['0xunchecked']);

    expect(report.passed).toBe(false);
    expect(report.unsound[0]?.survival?.state).toBe('UNCHECKED');
    expect(report.unsound[0]?.unsoundReason).toContain('never been checked');
  });

  it('STALE fails — a verdict about inputs the row no longer holds', async () => {
    // The verdict says SURVIVES and the provenance no longer matches the chunks.
    // A gate reading the stored verdict alone would publish on this.
    db.evidence = [
      diffDerived('0xstale', { ...currentVerdict('SURVIVES'), rawDeletedText: JSON.stringify(['rewritten since']) }),
    ];

    const report = await assessEvidenceInputSoundness(['0xstale']);

    expect(report.passed).toBe(false);
    expect(report.unsound[0]?.survival?.state).toBe('STALE');
    expect(report.unsound[0]?.unsoundReason).toContain('no current answer');
  });
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
    db.evidence = [documentEvidence('0xdoc'), diffDerived('0xsound', currentVerdict('SURVIVES'))];

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
