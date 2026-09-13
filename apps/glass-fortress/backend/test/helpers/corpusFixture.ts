import { createHash } from 'node:crypto';
import { DIFF_VERSION } from '../../src/lib/diffVersion';
import { recordId } from '../../src/lib/evidenceIdentity';
import { ON_CHAIN_CHECK_VERSION } from '../../src/lib/onChainVerdict';

// ---------------------------------------------------------------------------
// ONE CORPUS, SHARED BY THE FOUR READS' TESTS — a page, two captures and the
// pair between them, in the shapes the four handlers select.
//
// Fixtures rather than a database: the reads are queries plus predicates, and
// what is under test is the SHAPE they publish and the refusals they choose. The
// predicates themselves are held over their own fixtures in
// test/evidence/predicates.test.ts.
//
// THE NAMES ARE COMPUTED, NEVER TYPED. Every `fileHash` here comes from
// `recordId`, so a case asserting that a read returns a record's name cannot
// pass against a name someone pasted in — which is the only way this file could
// agree with the code while both were wrong.
// ---------------------------------------------------------------------------

export const URL = 'https://news.walla.co.il/item/3403847';
export const PAGE = { id: 'page-1', url: URL };

const hash = (seed: string): string => createHash('sha256').update(seed).digest('hex');

export const BEFORE = {
  id: 'snap-before',
  waybackTimestamp: '20201209134003',
  snapshotDate: '2020-12-09',
  textHash: 'text-before',
  textExtractionVersion: 'v3-extractor',
  documentHash: hash('before-bytes'),
  anchoredHash: hash('before-bytes'),
};

export const AFTER = {
  id: 'snap-after',
  waybackTimestamp: '20210612183110',
  snapshotDate: '2021-06-12',
  textHash: 'text-after',
  textExtractionVersion: 'v3-extractor',
  documentHash: hash('after-bytes'),
  anchoredHash: hash('after-bytes'),
};

/** A third capture, ACQUIRED between the two — what makes the pair NARROWED (§7). */
export const BETWEEN = {
  id: 'snap-between',
  waybackTimestamp: '20210101000000',
  snapshotDate: '2021-01-01',
  textHash: 'text-between',
  textExtractionVersion: 'v3-extractor',
  documentHash: hash('between-bytes'),
  anchoredHash: hash('between-bytes'),
};

export const CAPTURE_NAME = recordId({
  kind: 'CAPTURE',
  url: URL,
  capture: { waybackTimestamp: BEFORE.waybackTimestamp, documentHash: BEFORE.documentHash },
});

export const DIFF_NAME = recordId({
  kind: 'DIFF',
  url: URL,
  before: { waybackTimestamp: BEFORE.waybackTimestamp, documentHash: BEFORE.documentHash },
  after: { waybackTimestamp: AFTER.waybackTimestamp, documentHash: AFTER.documentHash },
});

/**
 * A whole classification, exactly as `recordDiff` writes one — all fourteen keys
 * of `CLASSIFICATION_KEYS`. The reader validates against that list, so a fixture
 * missing one is a HALF row and must be rejected rather than read.
 */
export const WHOLE_CLASSIFICATION = {
  deletedItems: [{ summary: 'הוסר', verbatim: 'הטקסט שהוסר', relocated: false, investigativeCategories: [] }],
  addedItems: [],
  legalSignificance: 'הפסקה על תופעות לוואי הוסרה מהעמוד.',
  investigativeCategories: ['SAFETY_SIGNAL'],
  isLegallySignificant: true,
  editorial: true,
  editorialReason: 'authored content changed',
  coverage: { covered: 1, total: 1 },
  draws: 1,
  classifierVersion: 'v7-classifier',
  classifiedInputVersion: 'v4-chunker',
  classifierModel: 'claude-x',
  classifierPromptHash: hash('prompt'),
  summaryVersion: 'v2-summary',
};

export const CHUNKS = [
  { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'SURVIVES' },
  { side: 'ADDED', text: 'הטקסט שנוסף', survival: 'SURVIVES' },
];

/** The CURRENT content version of the pair: both endpoints' text, at DIFF_VERSION. */
export const CURRENT_VERSION = {
  contentVersionHash: 'content-current',
  beforeTextHash: BEFORE.textHash,
  afterTextHash: AFTER.textHash,
  diffVersion: DIFF_VERSION,
  chunks: CHUNKS,
  classification: WHOLE_CLASSIFICATION,
  survivalVersion: 'v1-survival',
};

/** A version of the same pair from before an extraction change — never CURRENT. */
export const SUPERSEDED_VERSION = {
  ...CURRENT_VERSION,
  contentVersionHash: 'content-older',
  beforeTextHash: 'text-before-v2',
  chunks: [{ side: 'REMOVED', text: 'קודם', survival: 'UNCHECKABLE' }],
};

export const DIFF_ROW = {
  id: 'diff-1',
  beforeSnapshot: BEFORE,
  afterSnapshot: AFTER,
  contentVersions: [CURRENT_VERSION],
};

/** A stored anchor check, as `recordOnChainCheck` writes one at v2. */
export function anchorCheck(
  subjectId: string,
  over: Partial<{ attributed: boolean; verifierVersion: string; checkedAt: Date }> = {},
) {
  return {
    subjectId,
    // NAMED, because the reader names them: `storedAttributionFor` asks
    // `subjectType: 'URL_SNAPSHOT'` and `checkType: 'ON_CHAIN_ANCHOR'`, and a
    // fixture row that declared neither would be answered by a double that
    // ignored the `where` — which is the trap the double stopped having.
    subjectType: 'URL_SNAPSHOT',
    checkType: 'ON_CHAIN_ANCHOR',
    verdict: 'VERIFIED',
    detail: { attributed: over.attributed ?? true, attributionVerdict: 'ATTRIBUTED' },
    verifierVersion: over.verifierVersion ?? ON_CHAIN_CHECK_VERSION,
    checkedAt: over.checkedAt ?? new Date('2026-09-06T10:00:00.000Z'),
  };
}
