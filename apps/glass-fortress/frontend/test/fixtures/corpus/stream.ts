import type { CorpusAnswer, PageShape } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/**
 * A stream over TWO pages with both row kinds: a cited diff, an awaiting-derivation diff, a narrowed diff, and
 * — added with the significance gate — a diff that is EDITORIAL *and* LEGALLY SIGNIFICANT beside one that is
 * editorial only. That pair is what makes the gate assertable by VALUE rather than by property name: 20 of 21
 * diffs on the real corpus are editorial and EIGHT of those are also legally significant, so a gate written on
 * `editorial` would hide the first of these two, which is exactly the row the page exists to show.
 *
 * A CITED CAPTURE was added 2026-09-19 for the same reason, and the same way. Both captures carried
 * `evidence: null`, so a case asserting the capture row's CITED mark would have examined nothing and passed —
 * the vacuity this repository names as its own. The field is grounded in the appendix, not in the body: A4
 * gives `evidence` to the diff row, and §6.1 defines `cited` as the entries with `evidence` ≠ null WITHOUT
 * restricting the kind, which `types/corpus.ts` already records as the reading it took. The real corpus agrees
 * — 3 of 22 captures carry one and 0 of 21 diffs do — and that reading CHECKS the appendix rather than
 * supplying it. It is also region 3's ringed dot: the strip rings a capture by this very field.
 *
 * THE FACET'S `shape` IS `null` ON EVERY ROW HERE, AND THAT IS THE CONTRACT (§28, §24 :755): a read that
 * names no page carries no shape, because region 0 draws no strip. This body is the one every CROSS-PAGE
 * staging wants — `/api/corpus`, `?kind=`, `?cited=` — and `corpusAtPageOne` below is the body of a read that
 * DOES name a page. Two bodies rather than one with a flag, because "which reads carry a shape" is a rule of
 * the contract and a fixture is where this suite states the contract.
 */
export const corpusStream: CorpusAnswer = {
  "entries": [
    {
      "kind": "CAPTURE",
      "capture": "20211223211940",
      "snapshotDate": "2021-12-23",
      "fileHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "textHash": "2222222222222222222222222222222222222222222222222222222222222222",
      "textExtractionVersion": "v3-fixture",
      "anchor": {
        "documentHash": "3333333333333333333333333333333333333333333333333333333333333333",
        "attributed": true
      },
      "evidence": null,
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "CAPTURE",
      "capture": "20220105090000",
      "snapshotDate": "2022-01-05",
      "fileHash": "0x4444444444444444444444444444444444444444444444444444444444444444",
      "textHash": "5555555555555555555555555555555555555555555555555555555555555555",
      "textExtractionVersion": "v3-fixture",
      "anchor": {
        "documentHash": "6666666666666666666666666666666666666666666666666666666666666666",
        "attributed": false
      },
      "evidence": {
        "fileHash": "0x8888888888888888888888888888888888888888888888888888888888888888",
        "status": "PROMOTED",
        "citedBy": [
          {
            "thesisId": "thesis-one",
            "published": true
          }
        ]
      },
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20211223211940",
      "after": "20220105090000",
      "fileHash": "0x7777777777777777777777777777777777777777777777777777777777777777",
      "current": {
        "contentVersionHash": "8888888888888888888888888888888888888888888888888888888888888888",
        "chunks": [
          {
            "side": "REMOVED",
            "text": "הקישור לדיווח על תופעות לוואי"
          },
          {
            "side": "REMOVED",
            "text": "והפירוט של תופעות הלוואי השכיחות"
          },
          {
            "side": "ADDED",
            "text": "מומלץ להתחסן"
          }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "מגוף הדף נגרע סעיף תופעות הלוואי ובמקומו נוספה המלצה להתחסן.",
        "categories": [
          "WITHHOLDING_INFORMATION",
          "SAFETY_CLAIM_ALTERATION"
        ],
        "legallySignificant": true,
        "editorial": false,
        "classifierVersion": "classifier-fixture-1",
        "draws": 1
      },
      "narrowed": false,
      "evidence": {
        "fileHash": "0x7777777777777777777777777777777777777777777777777777777777777777",
        "status": "PROMOTED",
        "citedBy": [
          {
            "thesisId": "thesis-one",
            "published": true
          }
        ]
      },
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220105090000",
      "after": "20220211120000",
      "fileHash": "0x9999999999999999999999999999999999999999999999999999999999999999",
      "current": null,
      "awaitingDerivation": true,
      "opinion": null,
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220301080000",
      "after": "20220415080000",
      "fileHash": "0xaaaa111111111111111111111111111111111111111111111111111111111111",
      "current": {
        "contentVersionHash": "bbbb111111111111111111111111111111111111111111111111111111111111",
        "chunks": [
          {
            "side": "ADDED",
            "text": "עדכון מרווחי מתן"
          }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "עדכון הנחיות שגרתי, ללא גריעת אזהרות בטיחות.",
        "categories": [],
        "legallySignificant": false,
        "editorial": false,
        "classifierVersion": "classifier-fixture-1",
        "draws": 1
      },
      "narrowed": true,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220415080000",
      "after": "20220520080000",
      "fileHash": "0xaaaa0000000000000000000000000000000000000000000000000000000000aa",
      "current": {
        "contentVersionHash": "bbbb000000000000000000000000000000000000000000000000000000000000",
        "chunks": [
          { "side": "REMOVED", "text": "רשימת התופעות השכיחות" },
          { "side": "ADDED", "text": "רשימת התופעות" }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "הפסקה נוסחה מחדש, ובתוך אותו ניסוח נגרעה ממנה רשימת התופעות השכיחות.",
        "categories": ["SAFETY_CLAIM_ALTERATION"],
        "legallySignificant": true,
        "editorial": true,
        "classifierVersion": "v5-editorial-verdict",
        "draws": 1
      },
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220520080000",
      "after": "20220601080000",
      "fileHash": "0xcccc0000000000000000000000000000000000000000000000000000000000cc",
      "current": {
        "contentVersionHash": "dddd000000000000000000000000000000000000000000000000000000000000",
        "chunks": [
          { "side": "ADDED", "text": "עודכן בתאריך" }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "עדכון תאריך בתחתית הדף, ללא שינוי בתוכן ההנחיות עצמן.",
        "categories": [],
        "legallySignificant": false,
        "editorial": true,
        "classifierVersion": "v5-editorial-verdict",
        "draws": 1
      },
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    }
  ],
  "pages": [
    {
      "trackedUrlId": "page-one",
      "url": "https://example.gov/one/",
      "public": true,
      "first": "20211223211940",
      "last": "20220211120000",
      "entries": 4,
      "shape": null
    },
    {
      "trackedUrlId": "page-two",
      "url": "https://example.gov/two/",
      "public": true,
      "first": "20220301080000",
      "last": "20220415080000",
      "entries": 1,
      "shape": null
    }
  ],
  "nextCursor": "cursor-fixture-2"
};

/**
 * ONE PAGE'S WHOLE SHAPE, as the facet computes it — BEFORE the filter and BEFORE the cursor's slice.
 *
 * IT IS DELIBERATELY BIGGER THAN THE WINDOW BELOW, because that is the real corpus: `?page=<corona>` holds 43
 * records and the strip's ruling was measured on a window of 32. A fixture whose shape equalled its entries
 * could not tell a strip drawn from the page from one drawn from the view — the two sources would agree by
 * construction — and telling them apart is the whole of the 2026-09-21 ruling.
 *
 * TWO BINS CARRY MORE THAN ONE RECORD, and that is the second thing this fixture is for: a merged mark's
 * count is the SUM of its bins' counts, never the number of bins, and a shape of all-ones cannot see the
 * difference. `20211223` holds two captures and the `20220205 → 20220211` pair holds two diffs.
 *
 * The days sit inside the row's own `first`…`last` (23.12.2021 → 11.2.2022, fifty days), far enough apart
 * that the 5px merge does not fire: at 319 units that is 6.38 units a day, so every bin is its own mark and
 * the counts a case reads are the bins' own.
 */
const PAGE_ONE_SHAPE: PageShape = {
  captures: [
    { day: '20211223', count: 2, cited: false },
    { day: '20220105', count: 1, cited: true },
    { day: '20220128', count: 1, cited: false },
    { day: '20220211', count: 1, cited: false },
  ],
  diffs: [
    { before: '20211223', after: '20220105', count: 1, chunks: 3, passed: true },
    // A pair still AWAITING DERIVATION counts 0 chunks and is never gated — a classifier that has not spoken
    // has not judged it insignificant.
    { before: '20220105', after: '20220128', count: 1, chunks: 0, passed: true },
    { before: '20220128', after: '20220205', count: 1, chunks: 1, passed: false },
    { before: '20220205', after: '20220211', count: 2, chunks: 2, passed: false },
  ],
};

/**
 * THE BODY OF `?page=page-one` — the window that read returns, and the page's whole shape beside it.
 *
 * `entries` HOLDS ONLY THIS PAGE'S ROWS, because that is what the read answers, and only SOME of them,
 * because a window is a window. Every row here is one the shape above also counts, so the window is a SUBSET
 * of the page and never a second account of it: two captures of the page's five, four diffs of its five.
 *
 * THE GATE HIDES TWO OF THE WINDOW'S DIFFS AND THREE OF THE PAGE'S. That difference is the point of the
 * second half of the ruling: „N מוסתרים" on a single-page view is the PAGE'S figure, so a case can tell it
 * from the window's only where the two disagree.
 */
export const corpusAtPageOne: CorpusAnswer = {
  entries: [
    ...corpusStream.entries.filter((entry) => entry.page.trackedUrlId === 'page-one' && entry.kind === 'CAPTURE'),
    {
      kind: 'DIFF',
      before: '20211223211940',
      after: '20220105090000',
      fileHash: '0xdeed000000000000000000000000000000000000000000000000000000000001',
      current: { contentVersionHash: 'eeee000000000000000000000000000000000000000000000000000000000001', chunks: [
        { side: 'REMOVED', text: 'המשפט שהוסר' },
        { side: 'ADDED', text: 'המשפט שנכנס' },
        { side: 'ADDED', text: 'ומשפט נוסף' },
      ] },
      awaitingDerivation: false,
      opinion: { significance: 'שינוי בניסוח ההמלצה על החיסון.', categories: ['SAFETY_CLAIM_ALTERATION'], legallySignificant: true, editorial: true, classifierVersion: 'v5', draws: 1 },
      narrowed: false,
      evidence: null,
      page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
    },
    {
      kind: 'DIFF',
      before: '20220105090000',
      after: '20220128090000',
      fileHash: '0xdeed000000000000000000000000000000000000000000000000000000000002',
      current: null,
      awaitingDerivation: true,
      opinion: null,
      narrowed: false,
      evidence: null,
      page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
    },
    {
      kind: 'DIFF',
      before: '20220128090000',
      after: '20220205090000',
      fileHash: '0xdeed000000000000000000000000000000000000000000000000000000000003',
      current: { contentVersionHash: 'eeee000000000000000000000000000000000000000000000000000000000003', chunks: [{ side: 'ADDED', text: 'עודכן בתאריך' }] },
      awaitingDerivation: false,
      opinion: { significance: 'עדכון תאריך בתחתית הדף, ללא שינוי בהנחיות.', categories: [], legallySignificant: false, editorial: true, classifierVersion: 'v5', draws: 1 },
      narrowed: false,
      evidence: null,
      page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
    },
    {
      kind: 'DIFF',
      before: '20220205090000',
      after: '20220211120000',
      fileHash: '0xdeed000000000000000000000000000000000000000000000000000000000004',
      current: { contentVersionHash: 'eeee000000000000000000000000000000000000000000000000000000000004', chunks: [
        { side: 'ADDED', text: 'תוקן קישור' },
        { side: 'REMOVED', text: 'קישור ישן' },
      ] },
      awaitingDerivation: false,
      opinion: { significance: 'תיקון קישור שבור.', categories: [], legallySignificant: false, editorial: true, classifierVersion: 'v5', draws: 1 },
      narrowed: false,
      evidence: null,
      page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
    },
  ],
  // THE FACET IS EVERY PAGE OF THE SCOPE, WHATEVER THE CALL NAMED — the backend's own shape: `scopedPages` is
  // `pagesInScope(scope)`, and the named page decides only which ENTRIES are kept and which row carries a
  // `shape`. An earlier draft kept one row on the strength of a live reading, and the reading could not say
  // what it was taken to say: the real public scope holds exactly ONE opened page, so a one-row answer there
  // is consistent with either rule.
  pages: corpusStream.pages.map((row) => (row.trackedUrlId === 'page-one' ? { ...row, entries: 10, shape: PAGE_ONE_SHAPE } : row)),
  nextCursor: null,
};
