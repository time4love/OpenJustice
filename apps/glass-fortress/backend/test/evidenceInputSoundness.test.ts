// ---------------------------------------------------------------------------
// IS THE INPUT BEHIND A CITED EVIDENCE RECORD SOUND?
//
// The rule `EVIDENCE_DIFF_INPUT_SOUND` is computed from. `DiffSurvivalView.state`
// is FOUR-VALUED and THREE OF THEM FAIL — CONTRADICTED, UNCHECKABLE and
// AWAITING_DERIVATION — which is the departure from `promotionBlockFor` this
// suite exists to pin: promotion may proceed on an underived diff, because
// unchecked is not refuted; publication may not, because publishing asserts the
// change in public.
//
// (It read "Five survival states … FOUR OF THEM FAIL" until evidence step 15.
// That was true of the five-state display the rule was MEASURED against on
// 2026-08-30 — SURVIVES · CONTRADICTED · UNCHECKABLE · UNCHECKED · STALE — and
// `UNCHECKED` and `STALE` retired at 11b, when a derivation became an APPENDED
// version and staleness stopped being representable. The union has been four
// values since; the sentence had not caught up.)
//
// REBASED AT EVIDENCE STEP 15 ONTO CURRENT(diff). The SELECT and the report
// shape moved; THE FOLD DID NOT, and no assertion below moves from FAIL to
// not-FAIL. The state-by-state table is asserted here rather than only through
// the gate so that a change to the mapping fails in the place that owns it.
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
import { DIFF_VERSION } from '../src/lib/diffVersion';

const BEFORE_TEXT = { textHash: 'text-before', textExtractionVersion: 'v3-extractor' };
const AFTER_TEXT = { textHash: 'text-after', textExtractionVersion: 'v3-extractor' };

/**
 * A content version's chunks, each carrying its own survival — the COMPUTED
 * register of `DiffContentVersion` (evidence A2).
 */
function chunksWith(value: 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE'): Record<string, unknown>[] {
  return [{ side: 'REMOVED', text: 'הוסר משפט', survival: value }];
}

/** One stored content version of the pair, with its provenance — what CURRENT asks. */
function version(
  over: Partial<{
    hash: string;
    before: string;
    after: string;
    diff: string;
    chunks: Record<string, unknown>[];
  }> = {},
): Record<string, unknown> {
  return {
    contentVersionHash: over.hash ?? 'content-current',
    beforeTextHash: over.before ?? BEFORE_TEXT.textHash,
    afterTextHash: over.after ?? AFTER_TEXT.textHash,
    diffVersion: over.diff ?? DIFF_VERSION,
    chunks: over.chunks ?? chunksWith('SURVIVES'),
  };
}

/** A DIFF record and every version the walk has stored for its pair. */
function diffDerived(
  fileHash: string,
  versions: Record<string, unknown>[],
  endpoints: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
): Record<string, unknown> {
  return {
    fileHash,
    kind: 'DIFF',
    urlVersionDiffId: `diff-for-${fileHash}`,
    urlVersionDiff: {
      beforeSnapshot: endpoints.before ?? BEFORE_TEXT,
      afterSnapshot: endpoints.after ?? AFTER_TEXT,
      contentVersions: versions,
    },
  };
}

function documentEvidence(fileHash: string): Record<string, unknown> {
  return { fileHash, kind: 'DOCUMENT', urlVersionDiffId: null, urlVersionDiff: null };
}

function captureEvidence(fileHash: string): Record<string, unknown> {
  return { fileHash, kind: 'CAPTURE', urlVersionDiffId: null, urlVersionDiff: null };
}

beforeEach(() => {
  db.evidence = [];
});

describe('the three states that fail, named apart', () => {
  it('SURVIVES is sound — the check can be green, and it names the record it examined', async () => {
    // Asserted first and deliberately: a check with no reachable passing state is
    // worse than no check.
    db.evidence = [diffDerived('0xsound', [version()])];

    const report = await assessEvidenceInputSoundness(['0xsound']);

    expect(report.verdict).toBe('PASS');
    expect(report.examined.map((r) => r.fileHash)).toEqual(['0xsound']);
    expect(report.unsound).toHaveLength(0);
  });

  it('CONTRADICTED fails, in the same words the promotion gate refuses with', async () => {
    db.evidence = [diffDerived('0xrefuted', [version({ chunks: chunksWith('CONTRADICTED') })])];

    const report = await assessEvidenceInputSoundness(['0xrefuted']);

    expect(report.verdict).toBe('FAIL');
    expect(report.unsound[0]?.unsoundReason).toContain('refute 1 of 1');
    // WHAT THE SENTENCE MUST SAY, rather than which function wrote it: the
    // refusal names the DEFECT — a record whose own report the documents refute
    // is evidence of a pipeline fault, not of a change.
    expect(report.unsound[0]?.unsoundReason).toContain('pipeline defect, not of a change');
  });

  it('UNCHECKABLE fails as ITS OWN outcome, never folded into refutation', async () => {
    // The distinction the researcher asked to keep: a diff nothing could be
    // checked about is not a diff the documents refute, and a refusal that said
    // so would send someone hunting for a contradiction that does not exist.
    db.evidence = [diffDerived('0xunverifiable', [version({ chunks: chunksWith('UNCHECKABLE') })])];

    const report = await assessEvidenceInputSoundness(['0xunverifiable']);

    expect(report.verdict).toBe('FAIL');
    const reason = report.unsound[0]?.unsoundReason ?? '';
    expect(reason).toContain('No check of this record');
    expect(reason).not.toContain('CONTRADICTED');
    expect(reason).toContain('1 of 1 chunks could not be checked');
  });

  it('AWAITING_DERIVATION fails — a diff with no version has never been checked', async () => {
    // The state the two row-level ones collapse into. `UNCHECKED` and `STALE`
    // were both "the platform has no current answer": the first because no
    // verdict had ever been written, the second because the one written was about
    // inputs the row no longer held. Under evidence A2 a derivation is APPENDED,
    // so the current version IS the answer and staleness is unrepresentable —
    // what remains is a diff with no CURRENT version.
    //
    // AND IT IS STILL A FAILURE, not a shrug: a thesis may not assert in public a
    // change the platform has never checked. UNCHANGED IN OUTCOME BY THE STEP-15
    // REBASE, and asserted through the new path.
    db.evidence = [diffDerived('0xawaiting', [])];

    const report = await assessEvidenceInputSoundness(['0xawaiting']);

    expect(report.verdict).toBe('FAIL');
    expect(report.unsound[0]?.survival?.state).toBe('AWAITING_DERIVATION');
    expect(report.unsound[0]?.unsoundReason).toContain('No content version of this diff is CURRENT');
  });

  // THE `STALE` CASE RETIRED WITH THE STATE AT EVIDENCE STEP 11b. It held that a
  // verdict saying SURVIVES over provenance that no longer matched the chunks
  // must not pass. That shape is now unconstructible: a re-derivation appends a
  // version rather than overwriting a row, so a verdict and the chunks it judged
  // cannot come apart. The defect is designed out rather than tested for.
});

describe('CURRENT(diff), not the newest row — evidence step 15\'s rebase', () => {
  it('judges the version whose provenance matches BOTH endpoints, not the last one derived', async () => {
    // THE DEFECT THIS REBASE REMOVES. Two versions on one pair: the CURRENT one
    // holds a CONTRADICTED chunk, and a LATER-derived one — from text this pair
    // no longer has — holds none. Reading the newest by `derivedAt` reports
    // SURVIVES over a record the documents refute, which is the direction that
    // publishes a false claim.
    // THE LATER-DERIVED VERSION IS FIRST IN THE LIST, because that is what the
    // defect's own query returned: `orderBy: { derivedAt: 'desc' }, take: 1`. A
    // fixture with CURRENT first would be judged correctly BY ACCIDENT and the
    // case could not fire — which it did not, until this line was written the
    // way the database would have answered.
    db.evidence = [
      diffDerived('0xtwo-versions', [
        version({ hash: 'content-newer', before: 'text-before-v4', chunks: chunksWith('SURVIVES') }),
        version({ hash: 'content-current', chunks: chunksWith('CONTRADICTED') }),
      ]),
    ];

    const report = await assessEvidenceInputSoundness(['0xtwo-versions']);

    expect(report.verdict).toBe('FAIL');
    expect(report.unsound[0]?.survival?.state).toBe('CONTRADICTED');
  });

  it('an ENDPOINT whose text moved is AWAITING_DERIVATION — the walk owes a version', async () => {
    // A re-walk supersedes an endpoint's text and Level 5 re-derives every diff
    // spanning it. Between the two, CURRENT is undefined — and the old select
    // returned the stale row and reported SURVIVES.
    db.evidence = [
      diffDerived(
        '0xendpoint-moved',
        [version({ chunks: chunksWith('SURVIVES') })],
        { before: { textHash: 'text-before-v4', textExtractionVersion: 'v4-extractor' } },
      ),
    ];

    const report = await assessEvidenceInputSoundness(['0xendpoint-moved']);

    expect(report.verdict).toBe('FAIL');
    expect(report.unsound[0]?.survival?.state).toBe('AWAITING_DERIVATION');
    // NAMES THE CAUSE a reader would otherwise hunt for: not "never derived" but
    // "derived from text this pair no longer has".
    expect(report.unsound[0]?.unsoundReason).toContain("endpoint's text has moved");
  });

  it('DIFF_VERSION moved, though BOTH texts are unchanged — the third equality', async () => {
    // "`DIFF_VERSION` moves → every diff gains a version … the price of a better
    // differ, paid by a human once per record." Until the walk pays it, the
    // record has no CURRENT version.
    db.evidence = [
      diffDerived('0xdiffer-moved', [version({ diff: 'v2-old-differ+v1-old-classifier' })]),
    ];

    const report = await assessEvidenceInputSoundness(['0xdiffer-moved']);

    expect(report.verdict).toBe('FAIL');
    expect(report.unsound[0]?.survival?.state).toBe('AWAITING_DERIVATION');
  });
});

describe('scope, and saying so', () => {
  it('nothing cited is diff-derived: the verdict is EXAMINED_NONE, and the report does NOT say passed', async () => {
    // THE CASE THIS ONE REPLACES ASSERTED `binding: false` BESIDE `passed: true`.
    // That pair is a non-binding pass by name — the state A6 :1222 and document
    // A6 :1533 forbid, and the one check 6 was retired for. A three-valued
    // verdict is the only shape that can say "no subject" without saying "pass".
    db.evidence = [documentEvidence('0xdoc')];

    const report = await assessEvidenceInputSoundness(['0xdoc']);

    expect(report.verdict).toBe('EXAMINED_NONE');
    expect(report.examined).toHaveLength(0);
    expect(report.outOfScope.map((r) => r.fileHash)).toEqual(['0xdoc']);
    expect(Object.keys(report)).not.toContain('passed');
    expect(Object.keys(report)).not.toContain('binding');
  });

  it('names what it stepped over rather than counting it — §2b\'s `examined` needs the names', async () => {
    // `outOfScope` was a NUMBER until this step. A number cannot say WHICH record
    // was stepped over, and the check row above this one has to name its subjects
    // "per subject, always present even at zero".
    db.evidence = [documentEvidence('0xdoc'), captureEvidence('0xcapture')];

    const report = await assessEvidenceInputSoundness(['0xdoc', '0xcapture']);

    expect(report.outOfScope.map((r) => r.fileHash).sort()).toEqual(['0xcapture', '0xdoc']);
    expect(report.outOfScope.every((r) => r.survival === null)).toBe(true);
  });

  it('a CAPTURE and a DIFF together: the DIFF is examined and the verdict is its alone', async () => {
    db.evidence = [captureEvidence('0xcapture'), diffDerived('0xsound', [version()])];

    const report = await assessEvidenceInputSoundness(['0xcapture', '0xsound']);

    expect(report.verdict).toBe('PASS');
    expect(report.examined.map((r) => r.fileHash)).toEqual(['0xsound']);
    expect(report.outOfScope.map((r) => r.fileHash)).toEqual(['0xcapture']);
  });

  it('leaves "cited but not in the vault" to check 5 rather than answering it twice', async () => {
    const report = await assessEvidenceInputSoundness(['0xnowhere']);

    expect(report.rows).toHaveLength(0);
    // EXAMINED_NONE here is correct and is not a hole: the gate's check 5 already
    // blocks on a hash the vault does not hold, and two refusals for one defect
    // send a researcher looking for two problems.
    expect(report.verdict).toBe('EXAMINED_NONE');
  });

  it('reports a record whose diff cannot be loaded rather than dropping it', async () => {
    // Unreachable behind a foreign key, and asserted anyway: a subject quietly
    // filtered out of a pass is a subject reported as nothing to check.
    db.evidence = [{ fileHash: '0xorphan', kind: 'DIFF', urlVersionDiffId: 'gone', urlVersionDiff: null }];

    const report = await assessEvidenceInputSoundness(['0xorphan']);

    expect(report.verdict).toBe('FAIL');
    expect(report.examined).toHaveLength(1);
    expect(report.unsound[0]?.unsoundReason).toContain('could not be loaded');
  });

  it('asks nothing when nothing is cited', async () => {
    const report = await assessEvidenceInputSoundness([]);

    expect(report.rows).toHaveLength(0);
    expect(report.verdict).toBe('EXAMINED_NONE');
  });
});
