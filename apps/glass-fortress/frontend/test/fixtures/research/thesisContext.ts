import type { ThesisContext, ThesisOwedEntry, ThesisReview, Turn } from '@/types/research';
import { thesisReviewsOwed } from './reads';

// ---------------------------------------------------------------------------
// THE WORKING VIEW'S BODIES — hand-written from thesis A4 :1476 (plan §4 :960–:963), never captured from a
// live answer. Every value is invented; no person is named; no product is named.
//
// THEY ARE TYPED, so `tsc` checks each against `types/research.ts` and a fixture that drifts from the appendix
// fails the BUILD as well as the suite. What the cases then assert is read off the PARSE and never off the
// literal (R65's trap): a literal can agree with itself.
//
// WHAT THE LIVE CORPUS CANNOT PRODUCE, AND WHY THIS SET EXISTS. Run B's thesis serves 14 of the seventeen
// kinds; RESPONSE, WITHDRAWAL and NOTE have never been written on staging. A suite that held only what the
// corpus happens to hold would hold three fewer kinds than the contract has — so the FULL transcript below
// carries every one of the seventeen at least once, and the floor counts them.
// ---------------------------------------------------------------------------

const AUTHOR = { handle: 'handle-a', mine: true } as const;
const COLLEAGUE = { handle: 'handle-b', mine: false } as const;

/** A model that recorded what ran. */
const RECORDED = { model: 'model-one', promptVersion: 'v4', spentBy: AUTHOR } as const;

/**
 * M1 — A MODEL THAT RECORDED NEITHER, which is what the two assessors do TODAY (`respondInDebate.ts` :65–:73,
 * `publishThesis.ts` :121; an A2 :1317 debt of the writer). A set whose MODEL turns all carried a model would
 * green `opinion-under-label` over a renderer that blanks or drops the label's right-hand side on the real
 * corpus — where five of run B's MODEL turns carry exactly this.
 */
const UNRECORDED = { model: null, promptVersion: null, spentBy: AUTHOR } as const;

const RESEARCHER = { voice: 'RESEARCHER', ...AUTHOR } as const;

/** THE SEVENTEEN KINDS, each at least once, across eight threads. Ordered oldest first, as the read serves them. */
export const fullTranscript: Turn[] = [
  {
    kind: 'FRAMING_OPENED',
    id: 't-01',
    at: '2026-01-04T09:00:00.000Z',
    thread: { step: 'FRAMING', id: 'framing-1' },
    by: RESEARCHER,
    line: 'מה נמסר לציבור על תופעות הלוואי, ומתי',
    body: { question: 'מה נמסר לציבור על תופעות הלוואי, ומתי', provision: 'NUREMBERG_1', fromRunId: null },
  },
  {
    kind: 'ROUND_PROPOSED',
    id: 't-02',
    at: '2026-01-04T09:10:00.000Z',
    thread: { step: 'FRAMING', id: 'framing-1' },
    by: RESEARCHER,
    line: 'המשרד ידע ולא מסר',
    body: {
      malformed: false,
      framing: 'המשרד ידע ולא מסר',
      elements: [
        { element: 'KNOWLEDGE', records: ['capture-one'] },
        { element: 'DISCLOSURE', records: 'MISSING' },
      ],
    },
  },
  {
    kind: 'ROUND_ASSESSED',
    id: 't-03',
    at: '2026-01-04T09:12:00.000Z',
    thread: { step: 'FRAMING', id: 'framing-1' },
    by: { voice: 'MODEL', ...RECORDED },
    line: null,
    body: {
      malformed: false,
      // THE REAL ASSESSED SHAPE, corrected 2026-09-22 against run B's own body: `elements` is a LIST and
      // each carries `filled`. The fixture held `elementsFilled: 1`, a field no assessment writes, so the
      // row's composed count was measured against a shape the platform does not produce. Three of four
      // filled is exactly what board ג3 draws („הוערך: 0 סתירות, 3 רכיבים שמולאו").
      content: {
        contradictions: [],
        elements: [
          { element: 'DUTY_HOLDER', filled: true, records: ['capture-one'] },
          { element: 'MATERIAL_INFORMATION', filled: false, records: [] },
          { element: 'DISCLOSURE_GIVEN', filled: true, records: ['capture-one'] },
          { element: 'OMISSION_WINDOW', filled: true, records: ['capture-one'] },
        ],
        recommended: 'המשרד ידע ולא מסר',
      },
    },
  },
  {
    kind: 'ROUND_CHOSEN',
    id: 't-04',
    at: '2026-01-04T09:20:00.000Z',
    thread: { step: 'FRAMING', id: 'framing-1' },
    by: RESEARCHER,
    line: 'המשרד החזיק במידע ולא מסר אותו',
    body: {
      malformed: false,
      claim: 'המשרד החזיק במידע ולא מסר אותו',
      provision: 'NUREMBERG_1',
      elements: [{ element: 'KNOWLEDGE', records: ['capture-one'] }],
      restatedBy: ['version-1'],
    },
  },
  {
    kind: 'VERSION',
    id: 't-05',
    at: '2026-01-05T08:00:00.000Z',
    thread: { step: 'VERSION', id: 'version-1' },
    by: RESEARCHER,
    line: 'המשרד החזיק במידע ולא מסר אותו',
    body: {
      text: 'הגרסה הראשונה של התזה.',
      claim: 'המשרד החזיק במידע ולא מסר אותו',
      contentHash: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
      parentVersionId: null,
      // THE STORED ROWS (Q-D), not the resolved citations `head.mentions` carries.
      mentions: [{ versionId: 'version-1', kind: 'EVIDENCE', name: '0x1111111111111111111111111111111111111111111111111111111111111111', contentVersionHash: 'pin-one', debateSessionId: 'debate-1' }],
      citationsVsParent: { added: ['0x1111111111111111111111111111111111111111111111111111111111111111'], repinned: [], dropped: [], carried: [] },
    },
  },
  {
    kind: 'VERSION',
    id: 't-06',
    at: '2026-02-01T08:00:00.000Z',
    thread: { step: 'VERSION', id: 'version-2' },
    by: RESEARCHER,
    line: 'המשרד החזיק במידע ולא מסר אותו במועד',
    body: {
      text: 'הגרסה השנייה של התזה, עם ציטוט נוסף.',
      claim: 'המשרד החזיק במידע ולא מסר אותו במועד',
      contentHash: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
      parentVersionId: 'version-1',
      mentions: [
        { versionId: 'version-2', kind: 'EVIDENCE', name: '0x1111111111111111111111111111111111111111111111111111111111111111', contentVersionHash: 'pin-two', debateSessionId: 'debate-1' },
        // AN EVIDENCE CITATION NOBODY HAS ARGUED — added 2026-09-22 so the row's UNARGUED count DISCRIMINATES.
        // Without it every version in this fixture scored 0 and a renderer answering a constant would have
        // passed; run B's four VERSION rows read 1, 2, 0, 0, so a fixture flat at 0 was not the platform's
        // shape either. The TRAJECTORY below keeps its null session deliberately: it is the guard that the
        // EVIDENCE-only half of `thesisPredicates.ts` :152–:156 is really applied, and a renderer that
        // dropped that test would count it and read 2.
        { versionId: 'version-2', kind: 'EVIDENCE', name: '0x3333333333333333333333333333333333333333333333333333333333333333', contentVersionHash: 'pin-three', debateSessionId: null },
        { versionId: 'version-2', kind: 'TRAJECTORY', name: 'ctrajaaaaaaaaaaaaaaaaaaaa', contentVersionHash: null, debateSessionId: null },
      ],
      citationsVsParent: { added: ['ctrajaaaaaaaaaaaaaaaaaaaa', '0x3333333333333333333333333333333333333333333333333333333333333333'], repinned: ['0x1111111111111111111111111111111111111111111111111111111111111111'], dropped: [], carried: [] },
    },
  },
  {
    kind: 'DEBATE_OPENED',
    id: 't-07',
    at: '2026-01-06T10:00:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-1' },
    by: RESEARCHER,
    line: 'example.gov/one/ · 2021-12-23',
    body: { sessionId: 'debate-1', record: { url: 'https://example.gov/one/', capture: '20211223211940' }, pin: 'pin-one' },
  },
  {
    kind: 'RATIONALE',
    id: 't-08',
    at: '2026-01-06T10:05:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-1' },
    by: RESEARCHER,
    line: null,
    body: { text: 'הפסקה נשענת על המשפט שהוסר מן העמוד.' },
  },
  {
    kind: 'ASSESSMENT',
    id: 't-09',
    at: '2026-01-06T10:06:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-1' },
    by: { voice: 'MODEL', ...UNRECORDED },
    line: null,
    body: { malformed: false, hasSubstance: true, substanceGaps: [], verdict: 'DISPUTES', objection: 'ההסתמכות רחבה מן הקטע', assessment: 'הטיעון נטען כראוי', assertions: null },
  },
  {
    kind: 'RESPONSE',
    id: 't-10',
    at: '2026-01-06T10:20:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-1' },
    by: RESEARCHER,
    line: null,
    body: { text: 'צמצמתי את ההסתמכות למשפט עצמו.' },
  },
  {
    kind: 'DEBATE_CLOSED',
    id: 't-11',
    at: '2026-01-06T10:30:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-1' },
    by: { voice: 'PLATFORM' },
    line: null,
    body: { outcome: 'PROMOTED', overObjection: true, evidenceFileHash: 'cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333' },
  },
  {
    kind: 'DEBATE_OPENED',
    id: 't-12',
    at: '2026-01-07T10:00:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-2' },
    by: RESEARCHER,
    line: 'example.gov/two/ · 2022-03-01 → 2022-05-02',
    body: { sessionId: 'debate-2', record: { url: 'https://example.gov/two/', before: '20220301120000', after: '20220502120000' }, pin: null },
  },
  {
    kind: 'ASSESSMENT',
    id: 't-13',
    at: '2026-01-07T10:06:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-2' },
    by: { voice: 'MODEL', ...UNRECORDED },
    line: null,
    body: { malformed: true, hasSubstance: null, substanceGaps: null, verdict: null, objection: null, assessment: null, assertions: null },
  },
  {
    kind: 'DEBATE_CLOSED',
    id: 't-14',
    at: '2026-01-07T11:00:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-2' },
    by: { voice: 'PLATFORM' },
    line: null,
    body: { outcome: 'ABANDONED', overObjection: false, evidenceFileHash: null },
  },
  {
    kind: 'DEBATE_OPENED',
    id: 't-15',
    at: '2026-01-08T10:00:00.000Z',
    thread: { step: 'DEBATE', id: 'debate-3' },
    by: RESEARCHER,
    line: 'example.gov/three/ · 2022-07-04',
    body: { sessionId: 'debate-3', record: { url: 'https://example.gov/three/', capture: '20220704090000' }, pin: 'pin-three' },
  },
  {
    kind: 'ANALYSIS',
    id: 't-16',
    at: '2026-02-02T09:00:00.000Z',
    thread: { step: 'ANALYSIS', id: 'analysis-1' },
    by: { voice: 'MODEL', ...RECORDED },
    line: 'בינונית',
    body: { analysisId: 'analysis-1', inputFingerprint: 'dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444', current: true, opinion: { strength: 'בינונית' } },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-17',
    at: '2026-02-03T09:00:00.000Z',
    thread: { step: 'GAP', id: 'gap-1' },
    by: RESEARCHER,
    line: 'חסר פרוטוקול הדיון',
    body: {
      gapId: 'gap-1',
      description: 'חסר פרוטוקול הדיון',
      sequence: 1,
      decision: 'OPEN',
      citedName: null,
      request: null,
      callItem: null,
      reason: null,
      earlier: [],
    },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-18',
    at: '2026-02-03T09:05:00.000Z',
    thread: { step: 'GAP', id: 'gap-2' },
    by: RESEARCHER,
    line: 'חסר מכתב ההנחיה',
    body: {
      gapId: 'gap-2',
      description: 'חסר מכתב ההנחיה',
      sequence: 2,
      decision: 'CITED',
      citedName: '0x1111111111111111111111111111111111111111111111111111111111111111',
      request: null,
      callItem: null,
      reason: null,
      earlier: [{ sequence: 1, decision: 'OPEN', at: '2026-02-01T09:00:00.000Z' }],
    },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-19',
    at: '2026-02-03T09:10:00.000Z',
    thread: { step: 'GAP', id: 'gap-3' },
    by: RESEARCHER,
    line: 'חסרה תשובת הממונה',
    body: {
      gapId: 'gap-3',
      description: 'חסרה תשובת הממונה',
      sequence: 1,
      decision: 'REQUESTED',
      citedName: null,
      request: { authority: 'רשות ציבורית', text: 'בקשה לפי חוק חופש המידע' },
      callItem: null,
      reason: null,
      earlier: [],
    },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-20',
    at: '2026-02-03T09:15:00.000Z',
    thread: { step: 'GAP', id: 'gap-4' },
    by: RESEARCHER,
    line: 'חסרה עדות מן הוועדה',
    body: {
      gapId: 'gap-4',
      description: 'חסרה עדות מן הוועדה',
      sequence: 1,
      decision: 'CALLED',
      citedName: null,
      request: null,
      callItem: { whatIsNeeded: 'מסמך מן הוועדה' },
      reason: null,
      earlier: [],
    },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-21',
    at: '2026-02-03T09:20:00.000Z',
    thread: { step: 'GAP', id: 'gap-5' },
    by: RESEARCHER,
    line: 'חסר נתון ההשוואה',
    body: {
      gapId: 'gap-5',
      description: 'חסר נתון ההשוואה',
      sequence: 1,
      decision: 'CONCEDED',
      citedName: null,
      request: null,
      callItem: null,
      reason: 'אין ברשומות נתון כזה',
      earlier: [],
    },
  },
  {
    kind: 'GAP_DECISION',
    id: 't-22',
    at: '2026-02-03T09:25:00.000Z',
    thread: { step: 'GAP', id: 'gap-6' },
    by: RESEARCHER,
    line: 'חסר דוח חיצוני',
    body: {
      gapId: 'gap-6',
      description: 'חסר דוח חיצוני',
      sequence: 2,
      decision: 'DISMISSED',
      citedName: null,
      request: null,
      callItem: null,
      reason: 'אינו נדרש לטענה',
      earlier: [{ sequence: 1, decision: 'OPEN', at: '2026-02-02T09:00:00.000Z' }],
    },
  },
  {
    kind: 'PUBLICATION_RATIONALE',
    id: 't-23',
    at: '2026-02-04T09:00:00.000Z',
    thread: { step: 'PUBLICATION', id: 'attempt-1' },
    by: RESEARCHER,
    line: null,
    body: { attemptId: 'attempt-1', rationale: 'הטקסט נשען על שתי רשומות מאומתות.' },
  },
  {
    kind: 'PUBLICATION_ASSESSMENT',
    id: 't-24',
    at: '2026-02-04T09:01:00.000Z',
    thread: { step: 'PUBLICATION', id: 'attempt-1' },
    by: { voice: 'MODEL', ...UNRECORDED },
    line: null,
    body: { attemptId: 'attempt-1', assessment: { note: 'הנימוק תואם את הטקסט' }, verdict: 'SUPPORTS' },
  },
  {
    kind: 'PUBLICATION_VERDICT',
    id: 't-25',
    at: '2026-02-04T09:02:00.000Z',
    thread: { step: 'PUBLICATION', id: 'attempt-1' },
    by: { voice: 'PLATFORM' },
    line: null,
    body: { attemptId: 'attempt-1', outcome: 'PUBLISHED', refusedBy: [] },
  },
  {
    kind: 'WITHDRAWAL',
    id: 't-26',
    at: '2026-02-05T09:00:00.000Z',
    thread: { step: 'WITHDRAWAL', id: 'withdrawal-1' },
    by: RESEARCHER,
    line: null,
    body: { versionId: 'version-1', reason: 'הרשומה שצוטטה הוחלפה' },
  },
  {
    kind: 'NOTE',
    id: 't-27',
    at: '2026-02-06T09:00:00.000Z',
    thread: { step: 'NOTE', id: 'note-1' },
    by: RESEARCHER,
    line: 'לבדוק את הצילום מחודש מרץ',
    body: { text: 'לבדוק את הצילום מחודש מרץ, ייתכן שיש בו ניסוח מוקדם יותר.', on: 'THESIS' },
  },
];

/**
 * THE CITATION NAMES OBEY THE APPENDIX'S GRAMMAR — thesis A1 :1241–:1244, `#ev_0x<64 hex>` and `#tr_<cuid>`,
 * which `lib/citationTokens.ts` :37 enforces with its own regex.
 *
 * They were `'record-one'` and `'trajectory-one'` until R73 chunk 2, which was harmless only while nothing
 * put a token in a fixture's TEXT: a name that cannot appear after a prefix can never be matched to the
 * chip that cites it, so a centre rendered over the old names would have drawn no chip and passed a case
 * asserting it drew none. The names are long because the grammar is; `no-id-as-text` holds that no reader
 * ever sees one.
 */
const RECORD_CAPTURE = '0x1111111111111111111111111111111111111111111111111111111111111111';
const RECORD_PUBLISHED_ONLY = '0x2222222222222222222222222222222222222222222222222222222222222222';
const RECORD_DIFF = '0x3333333333333333333333333333333333333333333333333333333333333333';
const TRAJECTORY = 'ctrajaaaaaaaaaaaaaaaaaaaa';

/** The two cited pages. HEAD cites only the first; `pages` carries both, which is what the union is for. */
const PAGE_A = { trackedUrlId: 'page-a', url: 'https://example.gov.il/vaccine' };
const PAGE_B = { trackedUrlId: 'page-b', url: 'https://example.gov.il/reports' };

/** Not `as const`: `CitationVerdict`'s `captures` is a mutable array, and a readonly tuple does not satisfy it. */
const VERIFIED_OK = {
  verified: true,
  captures: [{ capture: '20220628120000', attributed: true, anchoredHashMatchesDocumentHash: true }],
};
const UNFLAGGED = { flagged: false, reasons: [] as string[] };

/**
 * HEAD's citations, RESOLVED — A4 :1476's `V.mentions`, the ONE citation shape, with the record, the pinned
 * content, the verdict and the flag the backend serves (`getThesisContext.ts` :71).
 *
 * THREE ARMS ON PURPOSE: a CAPTURE, a DIFF (whose chip draws an interval rather than a date, `Tick.tsx`
 * :48–:51) and a TRAJECTORY (whose chip draws the claim's first words). A fixture with one arm would green a
 * centre that drew only captures.
 */
const HEAD_CITATIONS = [
  {
    kind: 'EVIDENCE' as const,
    name: RECORD_CAPTURE,
    pin: 'pin-two',
    record: { url: PAGE_A.url, capture: '20220628120000' },
    content: { kind: 'CAPTURE' as const, text: 'הטקסט שנלכד בצילום.' },
    verified: VERIFIED_OK,
    flag: UNFLAGGED,
    argued: true,
    overObjection: false,
  },
  {
    kind: 'EVIDENCE' as const,
    name: RECORD_DIFF,
    pin: 'pin-three',
    record: { url: PAGE_A.url, before: '20220628120000', after: '20220805053301' },
    content: { kind: 'DIFF' as const, chunks: [{ side: 'REMOVED' as const, text: 'סעיף תופעות הלוואי' }] },
    verified: { notEvaluable: 'NOT_PROMOTED' },
    flag: UNFLAGGED,
    argued: false,
    overObjection: false,
  },
  {
    kind: 'TRAJECTORY' as const,
    name: TRAJECTORY,
    resolves: true as const,
    claimText: 'הקישור לדיווח על תופעות לוואי הוסר ולא הוחזר',
    url: PAGE_A.url,
    transitions: 3,
    current: true,
  },
];

const HEAD = {
  versionId: 'version-2',
  by: AUTHOR,
  text: `הגרסה השנייה של התזה, עם ציטוט נוסף #ev_${RECORD_CAPTURE} וגם שינוי #ev_${RECORD_DIFF} וטענה לאורך זמן #tr_${TRAJECTORY}.`,
  claim: 'המשרד החזיק במידע ולא מסר אותו במועד',
  contentHash: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
  createdAt: '2026-02-01T08:00:00.000Z',
  mentions: HEAD_CITATIONS,
};

/** PUBLISHED cites a page HEAD does not — the reason `pages` is a UNION and not HEAD's own list. */
const PUBLISHED = {
  versionId: 'version-1',
  by: AUTHOR,
  text: `הגרסה הראשונה של התזה #ev_${RECORD_PUBLISHED_ONLY}.`,
  claim: 'המשרד החזיק במידע ולא מסר אותו',
  contentHash: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
  createdAt: '2026-01-05T08:00:00.000Z',
  mentions: [
    {
      kind: 'EVIDENCE' as const,
      name: RECORD_PUBLISHED_ONLY,
      pin: 'pin-one',
      record: { url: PAGE_B.url, capture: '20220301090000' },
      content: { kind: 'CAPTURE' as const, text: 'טקסט הדוח.' },
      verified: VERIFIED_OK,
      flag: UNFLAGGED,
      argued: true,
      overObjection: false,
    },
  ],
};

const GAP_LIST: ThesisContext['gapList'] = (
  [
    ['gap-1', 'OPEN', 'חסר פרוטוקול הדיון', 1],
    ['gap-2', 'CITED', 'חסר מכתב ההנחיה', 2],
    ['gap-3', 'REQUESTED', 'חסרה תשובת הממונה', 1],
    ['gap-4', 'CALLED', 'חסרה עדות מן הוועדה', 1],
    ['gap-5', 'CONCEDED', 'חסר נתון ההשוואה', 1],
    ['gap-6', 'DISMISSED', 'חסר דוח חיצוני', 2],
  ] as const
).map(([gapId, decision, description, sequence]) => ({
  gapId,
  readsAs: decision,
  inForce: {
    id: `decision-${gapId}`,
    thesisId: 'thesis-one',
    versionId: 'version-2',
    gapId,
    description,
    sequence,
    decision,
    citedName: decision === 'CITED' ? '0x1111111111111111111111111111111111111111111111111111111111111111' : null,
    request: decision === 'REQUESTED' ? { authority: 'רשות ציבורית' } : null,
    callItem: decision === 'CALLED' ? { whatIsNeeded: 'מסמך מן הוועדה' } : null,
    reason: decision === 'CONCEDED' || decision === 'DISMISSED' ? 'הנימוק נרשם' : null,
    createdAt: '2026-02-03T09:00:00.000Z',
  },
  by: AUTHOR,
}));

/**
 * THE FULL BODY — every one of the seventeen kinds, three debate threads, all six gap decisions, an analysis
 * that is CURRENT, a head and a published version that differ, and `state: PUBLISHED_BEHIND`.
 */
export const thesisContextFull: ThesisContext = {
  thesis: {
    thesisId: 'thesis-one',
    provision: 'NUREMBERG_1',
    by: AUTHOR,
    headVersionId: 'version-2',
    publishedVersionId: 'version-1',
    publishedAt: '2026-02-04T09:02:00.000Z',
    publicInterestStatement: 'עניין ציבורי: מה נמסר לציבור ומתי.',
    createdAt: '2026-01-04T09:00:00.000Z',
    state: { kind: 'PUBLISHED_BEHIND', versionsAhead: 1 },
  },
  head: HEAD,
  published: PUBLISHED,
  // THE UNION, deduplicated by url (A4 :1476): PAGE_A is HEAD's, PAGE_B is PUBLISHED's alone.
  pages: [PAGE_A, PAGE_B],
  unargued: ['ctrajaaaaaaaaaaaaaaaaaaaa'],
  gapList: GAP_LIST,
  analysis: {
    state: 'CURRENT',
    fingerprint: 'dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444',
    analysisId: 'analysis-1',
    runAt: '2026-02-02T09:00:00.000Z',
    by: RECORDED,
    opinion: { strength: 'בינונית' },
  },
  framings: [{ framingId: 'framing-1', question: 'מה נמסר לציבור על תופעות הלוואי, ומתי', provision: 'NUREMBERG_1', by: AUTHOR, createdAt: '2026-01-04T09:00:00.000Z' }],
  history: fullTranscript,
  // NOTHING OWED — the other half of WV-8's question, and `{ owed: 0, reviews: [] }` is an ANSWER (A4 :1476).
  owed: 0,
  reviews: [],
};

const OWED_THESIS_ID = 'cmu0aaaa00011112222333344';

/**
 * A4 :1476's `E` — :1523's element WITHOUT what the list pays reads to add (`owedSince`, `author`, `mine`, the
 * material). Spelled arm by arm rather than by discarding keys, so a field added to either shape is a `tsc`
 * failure here and not a key quietly carried onto the wrong envelope.
 */
function entryOf(review: ThesisReview): ThesisOwedEntry {
  const common = { thesisId: review.thesisId, name: review.name, command: review.command };
  if (review.kind === 'FLAGGED') {
    // THE DATE IS DROPPED ON THIS ARM AND THAT IS THE RULING: FLAGGED's `owedSince` is computed from the
    // material (`thesisReviews.ts` :228), which this read does not load — ui §11 :404 sends it to the sheet.
    return { ...common, kind: review.kind, versionId: review.versionId, mentionId: review.mentionId, reasons: review.reasons, record: review.material.record, owedSince: null };
  }
  if (review.kind === 'STALE_TRAJECTORY') {
    return { ...common, kind: review.kind, citedOn: review.citedOn, state: review.state, record: null, owedSince: review.owedSince };
  }
  return { ...common, kind: review.kind, versionId: review.versionId, mentionId: review.mentionId, record: review.material.record, owedSince: review.owedSince };
}

/** A3 :1408–:1410's kind order — what `reviewsOf` returns, which is not the LIST's oldest-first. */
const KIND_ORDER = ['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED'];

/**
 * THIS THESIS'S ENTRIES, DERIVED FROM THE LIST FIXTURE and never written twice.
 *
 * The two bodies are the SAME entries under different cover (A4 :1476 and :1523), so writing them out here
 * would be two literals free to disagree — and the case that reads them would hold only that each agrees with
 * itself. The list's own entries for the OTHER thesis are what the working view must NOT carry, and the filter
 * here is the SERVER's narrowing stated as a fixture, not the page's: the page no longer keeps anything.
 */
const OWED_ENTRIES: ThesisOwedEntry[] = thesisReviewsOwed.reviews
  .filter((review) => review.thesisId === OWED_THESIS_ID)
  .map(entryOf)
  // IN THE ORDER THE BACKEND SENDS, not the order the LIST sorts by: `reviewsOf` builds FLAGGED, then
  // STALE_TRAJECTORY, then UNARGUED (A3's kinds), while the list sorts oldest first (A4 :1524). A fixture in
  // the list's order would let a page case pass over a sequence the wire never carries.
  .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

/**
 * THE SAME FULL BODY, ANSWERING FOR THE THESIS THE OWED LIST NAMES (`reads.ts`' `thesisReviewsOwed`).
 *
 * WHY IT EXISTS: the working view KEEPS the owed entries whose `thesisId` is its own, and the two fixtures
 * were written for different pages — so without a body under that id, every render of this page shows a
 * thesis with nothing owed, and the region that carries the dates, the records and the commands is never
 * drawn for a scan to read. The id is pinned as a literal here and asserted against the owed list in
 * `researchThesis.test.tsx`, so the two cannot drift apart silently.
 */
export const thesisContextOwed: ThesisContext = {
  ...thesisContextFull,
  thesis: { ...thesisContextFull.thesis, thesisId: OWED_THESIS_ID },
  owed: OWED_ENTRIES.length,
  reviews: OWED_ENTRIES,
};

/** A COLLEAGUE'S THESIS — identical in shape, `mine` false in every voice and on the thesis itself (§13 :480). */
export const thesisContextColleague: ThesisContext = {
  ...thesisContextFull,
  thesis: { ...thesisContextFull.thesis, thesisId: 'thesis-two', by: COLLEAGUE },
  head: { ...HEAD, by: COLLEAGUE },
  published: { ...PUBLISHED, by: COLLEAGUE },
  gapList: GAP_LIST.map((entry) => ({ ...entry, by: COLLEAGUE })),
  analysis: {
    state: 'CURRENT',
    fingerprint: 'dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444',
    analysisId: 'analysis-1',
    runAt: '2026-02-02T09:00:00.000Z',
    by: { ...RECORDED, spentBy: COLLEAGUE },
    opinion: { strength: 'בינונית' },
  },
  framings: thesisContextFull.framings.map((framing) => ({ ...framing, by: COLLEAGUE })),
  history: fullTranscript.map((one): Turn => {
    if (one.by.voice === 'RESEARCHER') return { ...one, by: { voice: 'RESEARCHER', ...COLLEAGUE } };
    if (one.by.voice === 'MODEL') return { ...one, by: { ...one.by, spentBy: COLLEAGUE } };
    return one;
  }),
};

/** WITHDRAWN — the state carries the moment and the reason, and the stream carries the WITHDRAWAL turn. */
export const thesisContextWithdrawn: ThesisContext = {
  thesis: {
    thesisId: 'thesis-three',
    provision: 'NUREMBERG_10',
    by: AUTHOR,
    headVersionId: 'version-9',
    publishedVersionId: null,
    publishedAt: null,
    publicInterestStatement: null,
    createdAt: '2026-03-01T09:00:00.000Z',
    state: { kind: 'WITHDRAWN', at: '2026-03-09T09:00:00.000Z', reason: 'הרשומה שצוטטה הוחלפה' },
  },
  head: {
    versionId: 'version-9',
    by: AUTHOR,
    text: 'הטקסט של התזה שפרסומה בוטל.',
    claim: 'התוכנית נמשכה לאחר האות',
    contentHash: 'eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555',
    createdAt: '2026-03-02T09:00:00.000Z',
    mentions: [],
  },
  published: null,
  // A THESIS THAT CITES NOTHING — `TickLine.tsx` :37 renders NOTHING for it, which is a real state of a
  // thesis and not an empty rail. `pages` is empty for the same reason and is not a missing field.
  pages: [],
  unargued: [],
  gapList: [],
  analysis: { state: 'NONE' },
  framings: [],
  history: [
    {
      kind: 'WITHDRAWAL',
      id: 't-90',
      at: '2026-03-09T09:00:00.000Z',
      thread: { step: 'WITHDRAWAL', id: 'withdrawal-9' },
      by: RESEARCHER,
      line: null,
      body: { versionId: 'version-9', reason: 'הרשומה שצוטטה הוחלפה' },
    },
  ],
  owed: 0,
  reviews: [],
};

/** ONE VERSION AND NOTHING ELSE — §13 :477's row: one VERSION turn, UNARGUED n, and no analysis. */
export const thesisContextThin: ThesisContext = {
  thesis: {
    thesisId: 'thesis-four',
    provision: null,
    by: AUTHOR,
    headVersionId: 'version-solo',
    publishedVersionId: null,
    publishedAt: null,
    publicInterestStatement: null,
    createdAt: '2026-04-01T09:00:00.000Z',
    state: { kind: 'DRAFT_ONLY' },
  },
  head: {
    versionId: 'version-solo',
    by: AUTHOR,
    text: 'טיוטה אחת, בלי דיון.',
    claim: 'הנוהל לא פורסם',
    contentHash: 'ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666',
    createdAt: '2026-04-01T09:00:00.000Z',
    mentions: [
      {
        kind: 'EVIDENCE',
        name: RECORD_PUBLISHED_ONLY,
        pin: 'pin-four',
        record: { url: PAGE_B.url, capture: '20220301090000' },
        content: { kind: 'CAPTURE', text: 'טקסט הדוח.' },
        verified: { notEvaluable: 'NOT_PROMOTED' },
        flag: UNFLAGGED,
        argued: false,
        overObjection: false,
      },
    ],
  },
  published: null,
  pages: [PAGE_B],
  unargued: ['0x2222222222222222222222222222222222222222222222222222222222222222'],
  gapList: [],
  analysis: { state: 'AWAITING_DERIVATION', name: '0x2222222222222222222222222222222222222222222222222222222222222222' },
  framings: [],
  history: [
    {
      kind: 'VERSION',
      id: 't-80',
      at: '2026-04-01T09:00:00.000Z',
      thread: { step: 'VERSION', id: 'version-solo' },
      by: RESEARCHER,
      line: 'הנוהל לא פורסם',
      body: {
        text: 'טיוטה אחת, בלי דיון.',
        claim: 'הנוהל לא פורסם',
        contentHash: 'ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666',
        parentVersionId: null,
        mentions: [{ versionId: 'version-solo', kind: 'EVIDENCE', name: '0x2222222222222222222222222222222222222222222222222222222222222222', contentVersionHash: 'pin-four', debateSessionId: null }],
        citationsVsParent: { added: ['0x2222222222222222222222222222222222222222222222222222222222222222'], repinned: [], dropped: [], carried: [] },
      },
    },
  ],
  owed: 0,
  reviews: [],
};
