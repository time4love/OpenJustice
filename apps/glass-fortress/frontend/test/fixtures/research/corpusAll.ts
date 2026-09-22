import type { CorpusAnswer, PageShape, TrajectoryAnswer } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CORPUS AT `scope: 'all'` — the body `/research/corpus` and `/research/corpus/claims` read.
//
// Hand-written from the appendices (§6.1 :239–:249, amended by UI-2 for `page.public`; plan §4 :957–:960),
// never captured from a live response, so it asserts what the CONTRACT says rather than what one environment
// answered on one day. Each is TYPED, so `tsc` checks it against `types/corpus.ts`.
//
// WHY IT EXISTS AT ALL, AND IT IS NOT "the public one with a flag flipped". `test/fixtures/corpus/stream.ts`
// and `claims.ts` carry `page.public: true` on EVERY row — correctly, because at `public` the read returns
// only opened pages. Every case about the NOT PUBLIC mark written over those fixtures would examine nothing
// and pass: the vacuity this repository names as its own, and the reason the sketch's (d) gave this file a
// floor of "≥ 1 entry whose page is `public: false`".
//
// BOTH ROW WEIGHTS ON THE CLOSED PAGE. §27 :866 says "rows", and the stream has two kinds of row: a capture
// is a thin row and a diff is a card. A fixture with only a closed CAPTURE would leave the diff card's mark
// drawn by nothing, which is how a mark goes missing on half a stream without a red case.
//
// THE PAGE IDS ARE `list_pages`' OWN (`reads.ts`' `pages`), because `/research/corpus` JOINS the facet to
// `list_pages` by `trackedUrlId` and that join is TOTAL. A facet naming a page the other read does not is a
// contradiction the page throws on — so the fixture's facet is a SUBSET of `reads.ts`' three pages, which is
// exactly the relation the contract describes (§28 :883 "every surveyed page" at `all`).
// ---------------------------------------------------------------------------

const OPEN = { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true };
const CLOSED = { trackedUrlId: 'page-two', url: 'https://example.gov/two/', public: false };

/**
 * The stream at `all`: a capture and a diff on an OPENED page, a capture and a diff on one no published
 * thesis has opened. The capture instants are `reads.ts`' work-list rows, so the extraction sheet opened from
 * a row finds its own row rather than throwing.
 */
export const corpusAtAll: CorpusAnswer = {
  entries: [
    {
      kind: 'CAPTURE',
      capture: '20211223211940',
      snapshotDate: '2021-12-23',
      fileHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      textHash: '2222222222222222222222222222222222222222222222222222222222222222',
      textExtractionVersion: 'v3-fixture',
      anchor: { documentHash: '3333333333333333333333333333333333333333333333333333333333333333', attributed: true },
      evidence: null,
      page: OPEN,
    },
    {
      kind: 'DIFF',
      before: '20211223211940',
      after: '20220301120000',
      fileHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
      current: {
        contentVersionHash: '5555555555555555555555555555555555555555555555555555555555555555',
        chunks: [
          { side: 'REMOVED', text: 'המשפט שהוסר מן העמוד הפתוח' },
          { side: 'ADDED', text: 'המשפט שנכנס במקומו' },
        ],
      },
      awaitingDerivation: false,
      opinion: {
        significance: 'שינוי בניסוח ההמלצה',
        categories: ['SAFETY_CLAIM_ALTERATION'],
        legallySignificant: true,
        editorial: false,
        classifierVersion: 'fixture-v1',
        draws: 1,
      },
      narrowed: false,
      evidence: null,
      page: OPEN,
    },
    // THE CLOSED PAGE'S TWO ROWS — the whole reason this file exists.
    {
      kind: 'CAPTURE',
      capture: '20220502120000',
      snapshotDate: '2022-05-02',
      fileHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
      textHash: '7777777777777777777777777777777777777777777777777777777777777777',
      textExtractionVersion: 'v3-fixture',
      anchor: { documentHash: '8888888888888888888888888888888888888888888888888888888888888888', attributed: false },
      evidence: null,
      page: CLOSED,
    },
    {
      kind: 'DIFF',
      before: '20220502120000',
      after: '20220704090000',
      fileHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
      current: {
        contentVersionHash: 'aaaa111111111111111111111111111111111111111111111111111111111111',
        chunks: [{ side: 'REMOVED', text: 'המשפט שהוסר מן העמוד הסגור' }],
      },
      awaitingDerivation: false,
      opinion: null,
      narrowed: true,
      evidence: null,
      page: CLOSED,
    },
  ],
  // §28 :882–:883 — at `all` the facet is every surveyed page in scope, opened or not.
  pages: [
    { ...OPEN, first: '20211223211940', last: '20220301120000', entries: 2, shape: null },
    { ...CLOSED, first: '20220502120000', last: '20220704090000', entries: 2, shape: null },
  ],
  nextCursor: null,
};

/**
 * THE OPENED PAGE'S WHOLE SHAPE — §28's `shape`, carried only by a read that NAMES a page.
 *
 * BIGGER THAN THE WINDOW ON PURPOSE, for `fixtures/corpus/stream.ts`' reason: the facet is computed before
 * the filter and before the cursor's slice, so a fixture whose shape equalled its entries could not tell a
 * strip drawn from the page from one drawn from the view. Four capture bins holding five captures and three
 * diff bins holding four diffs, inside the row's own 23.12.2021 → 1.3.2022 interval.
 */
const OPEN_SHAPE: PageShape = {
  captures: [
    { day: '20211223', count: 2, cited: false },
    { day: '20220118', count: 1, cited: true },
    { day: '20220214', count: 1, cited: false },
    { day: '20220301', count: 1, cited: false },
  ],
  diffs: [
    { before: '20211223', after: '20220118', count: 1, chunks: 2, passed: true },
    { before: '20220118', after: '20220214', count: 2, chunks: 5, passed: false },
    { before: '20220214', after: '20220301', count: 1, chunks: 1, passed: true },
  ],
};

/**
 * THE BODY OF `?page=page-one` AT `all` — the window narrowed to the page the read names, and the facet NOT.
 *
 * THE FACET IS EVERY PAGE OF THE SCOPE, WHATEVER THE CALL NAMED, and that is the backend's own shape rather
 * than an inference from a body: `scopedPages` is `pagesInScope(scope)` — the whole scope — and the page the
 * call named decides exactly two things downstream, which ENTRIES are kept and which facet row carries a
 * `shape`. So the row for the page nobody named is still here, with `shape: null` on it.
 *
 * AN EARLIER DRAFT OF THIS FIXTURE CARRIED ONE ROW, "measured on the real body". The measurement was real and
 * the inference was wrong: the live public scope holds exactly ONE opened page, so a one-row answer there
 * cannot tell "the facet is the scope" from "the facet is the named page". A fixture that is the scope's own
 * size is what lets `chipsTouchingThePage` see a PAGE PICKER at all — with one row, the only chip a picker
 * could draw is the page already in force, and the predicate has nothing to catch.
 */
export const corpusAtAllAtPageOne: CorpusAnswer = {
  ...corpusAtAll,
  entries: corpusAtAll.entries.filter((entry) => entry.page.trackedUrlId === OPEN.trackedUrlId),
  pages: [
    { ...OPEN, first: '20211223211940', last: '20220301120000', entries: 9, shape: OPEN_SHAPE },
    { ...CLOSED, first: '20220502120000', last: '20220704090000', entries: 2, shape: null },
  ],
};

/**
 * The claims lens at `all` — one claim on the OPENED page and one on the closed one.
 *
 * The closed row is what holds that the sheet draws its capture and diff words as TEXT rather than as anchors
 * to record pages the public door refuses (`getCapture.ts` :89's `NOT_PUBLIC`). Each row's `captures` vector
 * FLIPS, so `flipsOf` composes a real pair on both and the two branches are both exercised.
 */
export const claimsAtAll: TrajectoryAnswer = {
  entries: [
    {
      patternHash: 'bbbb111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'cccc111111111111111111111111111111111111111111111111111111111111',
      transitions: 1,
      firstSeen: '2021-12-23',
      lastSeen: '2022-03-01',
      finalState: 'REMOVED',
      claimCount: 1,
      captures: [
        { snapshotDate: '2021-12-23', waybackTimestamp: '20211223211940', present: true },
        { snapshotDate: '2022-03-01', waybackTimestamp: '20220301120000', present: false },
      ],
      changes: [
        { snapshotDate: '2021-12-23', waybackTimestamp: '20211223211940', snapshotUrl: 'https://archive.test/20211223211940', present: true, captures: 1, days: 68, openEnded: false },
        { snapshotDate: '2022-03-01', waybackTimestamp: '20220301120000', snapshotUrl: 'https://archive.test/20220301120000', present: false, captures: 1, days: null, openEnded: true },
      ],
      claims: [{ trajectoryId: 'trajectory-open-1', claimHash: 'dddd1111', claimText: 'הטענה שעזבה את העמוד הפתוח' }],
      page: OPEN,
    },
    {
      patternHash: 'eeee111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'ffff111111111111111111111111111111111111111111111111111111111111',
      transitions: 1,
      firstSeen: '2022-05-02',
      lastSeen: '2022-07-04',
      finalState: 'REMOVED',
      claimCount: 2,
      captures: [
        { snapshotDate: '2022-05-02', waybackTimestamp: '20220502120000', present: true },
        { snapshotDate: '2022-07-04', waybackTimestamp: '20220704090000', present: false },
      ],
      changes: [
        { snapshotDate: '2022-05-02', waybackTimestamp: '20220502120000', snapshotUrl: 'https://archive.test/20220502120000', present: true, captures: 1, days: 63, openEnded: false },
        { snapshotDate: '2022-07-04', waybackTimestamp: '20220704090000', snapshotUrl: 'https://archive.test/20220704090000', present: false, captures: 1, days: null, openEnded: true },
      ],
      claims: [
        { trajectoryId: 'trajectory-closed-1', claimHash: 'aaab1111', claimText: 'הטענה שעזבה את העמוד הסגור' },
        { trajectoryId: 'trajectory-closed-2', claimHash: 'aaac1111', claimText: 'טענה נוספת שזזה יחד איתה' },
      ],
      page: CLOSED,
    },
  ],
  undetected: [],
  nextCursor: null,
};
