import type { ThesisContext, Turn } from '@/types/research';

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
    body: { malformed: false, content: { contradictions: [], elementsFilled: 1, recommended: 'המשרד ידע ולא מסר' } },
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
      mentions: [{ versionId: 'version-1', kind: 'EVIDENCE', name: 'record-one', contentVersionHash: 'pin-one', debateSessionId: 'debate-1' }],
      citationsVsParent: { added: ['record-one'], repinned: [], dropped: [], carried: [] },
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
        { versionId: 'version-2', kind: 'EVIDENCE', name: 'record-one', contentVersionHash: 'pin-two', debateSessionId: 'debate-1' },
        { versionId: 'version-2', kind: 'TRAJECTORY', name: 'trajectory-one', contentVersionHash: null, debateSessionId: null },
      ],
      citationsVsParent: { added: ['trajectory-one'], repinned: ['record-one'], dropped: [], carried: [] },
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
    body: { malformed: false, hasSubstance: true, substanceGaps: [], verdict: 'DISPUTES', objection: 'ההסתמכות רחבה מן הקטע', assessment: 'הטיעון נטען כראוי' },
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
    body: { malformed: true, hasSubstance: null, substanceGaps: null, verdict: null, objection: null, assessment: null },
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
      citedName: 'record-one',
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

const HEAD = {
  versionId: 'version-2',
  by: AUTHOR,
  text: 'הגרסה השנייה של התזה, עם ציטוט נוסף.',
  claim: 'המשרד החזיק במידע ולא מסר אותו במועד',
  contentHash: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
  createdAt: '2026-02-01T08:00:00.000Z',
  mentions: [
    { kind: 'EVIDENCE' as const, name: 'record-one', pin: 'pin-two', argued: true },
    { kind: 'TRAJECTORY' as const, name: 'trajectory-one', pin: null, argued: false as const, resolves: true },
  ],
};

const PUBLISHED = {
  versionId: 'version-1',
  by: AUTHOR,
  text: 'הגרסה הראשונה של התזה.',
  claim: 'המשרד החזיק במידע ולא מסר אותו',
  contentHash: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
  createdAt: '2026-01-05T08:00:00.000Z',
  mentions: [{ kind: 'EVIDENCE' as const, name: 'record-one', pin: 'pin-one', argued: true }],
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
    citedName: decision === 'CITED' ? 'record-one' : null,
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
  unargued: ['trajectory-one'],
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
    mentions: [{ kind: 'EVIDENCE', name: 'record-two', pin: 'pin-four', argued: false }],
  },
  published: null,
  unargued: ['record-two'],
  gapList: [],
  analysis: { state: 'AWAITING_DERIVATION', name: 'record-two' },
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
        mentions: [{ versionId: 'version-solo', kind: 'EVIDENCE', name: 'record-two', contentVersionHash: 'pin-four', debateSessionId: null }],
        citationsVsParent: { added: ['record-two'], repinned: [], dropped: [], carried: [] },
      },
    },
  ],
};
