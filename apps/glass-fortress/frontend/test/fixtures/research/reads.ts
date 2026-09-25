import type {
  ArticleRules,
  CaptureRow,
  DebateRead,
  EvidenceReviewList,
  FramingRead,
  FramingRow,
  PageEntry,
  RuleHistory,
  ThesesList,
  ThesisReviewList,
} from '@/types/research';

// ---------------------------------------------------------------------------
// THE OTHER TEN GATED BODIES — hand-written from the appendices they name, typed, every value invented.
// Each carries the arms the live corpus cannot produce, which is what a SET is for (the R58 ruling): a
// CONTENT_MOVED review and both `notEvaluable` reasons, a stop pending, a malformed round, an ended rule, a
// capture with gates and a stale one, the three non-published states, and `mine: false`.
// ---------------------------------------------------------------------------

const AUTHOR = 'handle-a';
const COLLEAGUE = 'handle-b';

const CAPTURE_RECORD = { url: 'https://example.gov/one/', capture: '20211223211940' } as const;
const DIFF_RECORD = { url: 'https://example.gov/two/', before: '20220301120000', after: '20220502120000' } as const;

/** `list_thesis_reviews` at `all` — all three kinds, each with its material and its ONE command (A4 :1523). */
export const thesisReviewsOwed: ThesisReviewList = {
  owed: 5,
  reviews: [
    {
      kind: 'FLAGGED',
      thesisId: 'cmu0aaaa00011112222333344',
      name: 'record-one',
      versionId: 'version-1',
      mentionId: 'mention-1',
      reasons: ['NOT_CITATION_CURRENT', 'AWAITING_DERIVATION'],
      command: 'add_thesis_version thesisId=cmu0aaaa00011112222333344',
      owedSince: '2026-02-10T09:00:00.000Z',
      author: AUTHOR,
      mine: true,
      material: {
        versionId: 'version-1',
        record: CAPTURE_RECORD,
        pin: { hash: 'pin-one', chunks: [{ text: 'המשפט כפי שאושר', survival: 'SURVIVES' }] },
        current: { hash: 'pin-two', chunks: [{ text: 'המשפט כפי שהוא כעת', survival: 'CONTRADICTED' }] },
        moved: { entered: [{ side: 'ADDED', text: 'משפט שנכנס' }], left: [{ side: 'REMOVED', text: 'משפט שיצא' }] },
        cause: [{ kind: 'EXTRACTOR', capture: '20211223211940', from: 'v2', to: 'v3', at: '2026-02-09T09:00:00.000Z' }],
        decision: null,
      },
    },
    {
      kind: 'STALE_TRAJECTORY',
      thesisId: 'cmu0aaaa00011112222333344',
      name: 'trajectory-one',
      citedOn: [{ versionId: 'version-2', published: false }],
      state: 'RECOMPUTED_DISAGREES',
      command: 'get_claim_trajectories url=https://example.gov/one/',
      owedSince: '2026-02-11T09:00:00.000Z',
      author: AUTHOR,
      mine: true,
      material: {
        citedOn: [{ versionId: 'version-2', published: false }],
        cited: {
          claimText: 'החיסון בטוח לחלוטין',
          url: 'https://example.gov/one/',
          finalState: 'REMOVED',
          changes: [{ capture: '20211223211940', present: true }],
          computation: { id: 'computation-1', computedAt: '2026-01-02T09:00:00.000Z' },
        },
        currency: { state: 'RECOMPUTED_DISAGREES' },
      },
    },
    {
      // THE FOURTH CURRENCY WORD. A3 :1386–:1388 puts RECOMPUTED_DISAGREES and NOT_FOLLOWED_BY_LATEST in ONE
      // class — both are STALE — and this entry is what makes that assertable by VALUE rather than by the
      // one state the other entry happens to carry.
      kind: 'STALE_TRAJECTORY',
      thesisId: 'cmu0aaaa00011112222333344',
      name: 'trajectory-two',
      citedOn: [{ versionId: 'version-2', published: false }],
      state: 'NOT_FOLLOWED_BY_LATEST',
      command: 'get_claim_trajectories url=https://example.gov/two/',
      owedSince: '2026-02-14T09:00:00.000Z',
      author: AUTHOR,
      mine: true,
      material: {
        citedOn: [{ versionId: 'version-2', published: false }],
        cited: {
          claimText: 'הנוהל עודכן בלי הודעה',
          url: 'https://example.gov/two/',
          finalState: 'PRESENT',
          changes: [],
          computation: { id: 'computation-2', computedAt: '2026-01-03T09:00:00.000Z' },
        },
        currency: { state: 'NOT_FOLLOWED_BY_LATEST' },
      },
    },
    {
      // AN UNARGUED CITATION ON THE CALLER'S OWN THESIS — added 2026-09-22 (UI-8 chunk B round 2), because the
      // WORKING VIEW's entries are this list's entries for one thesis, and that page must be able to draw the
      // arm that carries BOTH a record and a date (ui §11 :404). Its instant is that thesis's HEAD `createdAt`
      // (`thesisContext.ts` :378), which is what `thesisReviews.ts` :196 computes for this arm — so the two
      // fixtures describe ONE world rather than two that merely look alike.
      kind: 'UNARGUED',
      thesisId: 'cmu0aaaa00011112222333344',
      name: 'record-four',
      versionId: 'version-2',
      mentionId: 'mention-4',
      command: 'open_debate thesisId=cmu0aaaa00011112222333344',
      owedSince: '2026-02-01T08:00:00.000Z',
      author: AUTHOR,
      mine: true,
      material: { versionId: 'version-2', record: CAPTURE_RECORD, pin: 'pin-four' },
    },
    {
      kind: 'UNARGUED',
      thesisId: 'cmu0bbbb00011112222333344',
      name: 'record-three',
      versionId: 'version-7',
      mentionId: 'mention-7',
      command: 'open_debate thesisId=cmu0bbbb00011112222333344',
      owedSince: '2026-02-12T09:00:00.000Z',
      author: COLLEAGUE,
      mine: false,
      material: { versionId: 'version-7', record: DIFF_RECORD, pin: 'pin-seven' },
    },
  ],
};

/** `{ owed: 0, reviews: [] }` IS AN ANSWER (A4 :1525) — the empty is the assertion. */
export const thesisReviewsEmpty: ThesisReviewList = { owed: 0, reviews: [] };

/**
 * `list_evidence_reviews` — one CONTENT_MOVED carrying ALL FOUR cause arms and TWO commands (§29 :892–:894's
 * plural), and a `notEvaluable` row of each reason.
 */
export const evidenceReviews: EvidenceReviewList = {
  owed: 1,
  reviews: [
    {
      kind: 'CONTENT_MOVED',
      fileHash: '1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa',
      record: DIFF_RECORD,
      owedSince: '2026-02-13T09:00:00.000Z',
      decisionSequence: 2,
      affirmed: { hash: 'affirmed-hash', chunks: [{ side: 'REMOVED', text: 'הקטע שאושר', survival: 'SURVIVES' }] },
      current: { hash: 'current-hash', chunks: [{ side: 'ADDED', text: 'הקטע כעת', survival: 'CONTRADICTED' }] },
      moved: { entered: [{ side: 'ADDED', text: 'הקטע כעת' }], left: [{ side: 'REMOVED', text: 'הקטע שאושר' }] },
      cause: [
        {
          kind: 'DECISION',
          capture: '20220301120000',
          decisionId: 'decision-1',
          decisionType: 'TRUST_RULE',
          waybackTimestamp: '20220301120000',
          sequence: 2,
          at: '2026-02-12T09:00:00.000Z',
        },
        { kind: 'EXTRACTOR', capture: '20220502120000', from: 'v2', to: 'v3', at: '2026-02-12T10:00:00.000Z' },
        { kind: 'DIFF_VERSION', from: 'd1', to: 'd2', at: '2026-02-12T11:00:00.000Z' },
        { kind: 'UNREADABLE', capture: '20220704090000', reason: 'הארכיון לא מסר את הבתים' },
      ],
      citedBy: [
        { thesisId: 'cmu0aaaa00011112222333344', versionId: 'version-1', published: true, argument: { debateSessionId: 'debate-1', argued: true } },
        { thesisId: 'cmu0bbbb00011112222333344', versionId: 'version-7', published: false, argument: null },
      ],
      narrowed: null,
      commands: ['review_evidence fileHash=1111aaaa', 'resolve_record name=record-one'],
    },
  ],
  notEvaluable: [
    {
      fileHash: '2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb',
      record: CAPTURE_RECORD,
      reason: 'AWAITING_DERIVATION',
      detail: 'אין גרסת תוכן',
    },
    { fileHash: '3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc', record: null, reason: 'AFFIRMED_VERSION_MISSING', detail: 'הגרסה שאושרה חסרה' },
  ],
};

/** `list_theses` at `all` — ALL FOUR states, `mine` both ways, and one row with no framing attached. */
export const thesesList: ThesesList = {
  theses: [
    {
      thesisId: 'cmu0aaaa00011112222333344',
      state: { kind: 'PUBLISHED_BEHIND', versionsAhead: 1 },
      claim: 'המשרד החזיק במידע ולא מסר אותו במועד',
      provision: 'NUREMBERG_1',
      headVersionId: 'version-2',
      publishedVersionId: 'version-1',
      headIsPublished: false,
      framingIds: ['framing-1'],
      unarguedMentions: 1,
      openGaps: 1,
      author: AUTHOR,
      mine: true,
    },
    {
      thesisId: 'cmu0bbbb00011112222333344',
      state: { kind: 'PUBLISHED_IS_HEAD' },
      claim: 'התוכנית הורחבה לאחר האות',
      provision: 'NUREMBERG_10',
      headVersionId: 'version-7',
      publishedVersionId: 'version-7',
      headIsPublished: true,
      framingIds: ['framing-2'],
      unarguedMentions: 0,
      openGaps: 0,
      author: COLLEAGUE,
      mine: false,
    },
    {
      thesisId: 'cmu0cccc00011112222333344',
      state: { kind: 'WITHDRAWN', at: '2026-03-09T09:00:00.000Z', reason: 'הרשומה שצוטטה הוחלפה' },
      claim: 'התוכנית נמשכה לאחר האות',
      provision: 'NUREMBERG_10',
      headVersionId: 'version-9',
      publishedVersionId: null,
      headIsPublished: false,
      framingIds: [],
      unarguedMentions: 0,
      openGaps: 2,
      author: AUTHOR,
      mine: true,
    },
    {
      thesisId: 'cmu0dddd00011112222333344',
      state: { kind: 'DRAFT_ONLY' },
      claim: 'הנוהל לא פורסם',
      provision: null,
      headVersionId: 'version-solo',
      publishedVersionId: null,
      headIsPublished: false,
      framingIds: [],
      unarguedMentions: 1,
      openGaps: 0,
      author: COLLEAGUE,
      mine: false,
    },
  ],
  published: [
    {
      thesisId: 'cmu0bbbb00011112222333344',
      claim: 'התוכנית הורחבה לאחר האות',
      provision: 'NUREMBERG_10',
      publishedAt: '2026-02-20T09:00:00.000Z',
      author: COLLEAGUE,
      contentHash: '4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd',
    },
  ],
};

/** `list_framings` — one per `latest.type`, one attached to no thesis, one with no claim yet, one with no round. */
export const framings: FramingRow[] = [
  {
    framingId: 'framing-1',
    question: 'מה נמסר לציבור על תופעות הלוואי, ומתי',
    provision: 'NUREMBERG_1',
    author: AUTHOR,
    thesisId: 'cmu0aaaa00011112222333344',
    openedAt: '2026-01-04T09:00:00.000Z',
    rounds: 3,
    latest: { sequence: 3, type: 'CHOSEN' },
    claim: 'המשרד החזיק במידע ולא מסר אותו',
  },
  {
    framingId: 'framing-2',
    question: 'מה נעשה לאחר האות הראשון',
    provision: 'NUREMBERG_10',
    author: COLLEAGUE,
    thesisId: null,
    openedAt: '2026-01-10T09:00:00.000Z',
    rounds: 2,
    latest: { sequence: 2, type: 'ASSESSED' },
    claim: null,
  },
  {
    framingId: 'framing-3',
    question: 'האם נערכה הערכת סיכונים',
    provision: null,
    author: AUTHOR,
    thesisId: null,
    openedAt: '2026-01-20T09:00:00.000Z',
    rounds: 1,
    latest: { sequence: 1, type: 'PROPOSED' },
    claim: null,
  },
  {
    framingId: 'framing-4',
    question: 'מה תועד בוועדה',
    provision: null,
    author: COLLEAGUE,
    thesisId: null,
    openedAt: '2026-01-25T09:00:00.000Z',
    rounds: 0,
    latest: null,
    claim: null,
  },
];

/** `get_framing` — the FRAMING thread's four kinds through the one builder, one of them MALFORMED. */
export const framingRead: FramingRead = {
  framingId: 'framing-5',
  question: 'מה נמסר לציבור על תופעות הלוואי, ומתי',
  provision: 'NUREMBERG_1',
  thesisId: 'cmu0aaaa00011112222333344',
  by: { handle: AUTHOR, mine: true },
  turns: [
    {
      kind: 'FRAMING_OPENED',
      id: 'f-1',
      at: '2026-01-04T09:00:00.000Z',
      thread: { step: 'FRAMING', id: 'framing-5' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: 'מה נמסר לציבור על תופעות הלוואי, ומתי',
      body: { question: 'מה נמסר לציבור על תופעות הלוואי, ומתי', provision: 'NUREMBERG_1', fromRunId: null },
    },
    {
      kind: 'ROUND_PROPOSED',
      id: 'f-2',
      at: '2026-01-04T09:10:00.000Z',
      thread: { step: 'FRAMING', id: 'framing-5' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: 'המשרד ידע ולא מסר',
      body: { malformed: false, framing: 'המשרד ידע ולא מסר', elements: [{ element: 'KNOWLEDGE', records: 'MISSING' }] },
    },
    {
      // THE MALFORMED ROUND — the stored Json was not an object, and that is SAID rather than smoothed to `{}`
      // (A4 :1459). The live corpus has never produced one.
      kind: 'ROUND_ASSESSED',
      id: 'f-3',
      at: '2026-01-04T09:12:00.000Z',
      thread: { step: 'FRAMING', id: 'framing-5' },
      by: { voice: 'MODEL', model: null, promptVersion: null, spentBy: { handle: AUTHOR, mine: true } },
      line: null,
      body: { malformed: true, content: null },
    },
    {
      kind: 'ROUND_CHOSEN',
      id: 'f-4',
      at: '2026-01-04T09:20:00.000Z',
      thread: { step: 'FRAMING', id: 'framing-5' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: 'המשרד החזיק במידע ולא מסר אותו',
      body: { malformed: false, claim: 'המשרד החזיק במידע ולא מסר אותו', provision: 'NUREMBERG_1', elements: null, restatedBy: ['version-1'] },
    },
  ],
};

/** `get_debate` — the record NAMED, and the five debate kinds in order from the one builder. */
export const debateRead: DebateRead = {
  sessionId: 'debate-1',
  thesisId: 'cmu0aaaa00011112222333344',
  fileHash: '1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa',
  record: CAPTURE_RECORD,
  status: 'PROMOTED',
  hasSubstance: true,
  verdict: 'DISPUTES',
  canPromote: false,
  blockedBy: [],
  promotedOverObjection: true,
  evidenceFileHash: 'cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333',
  turns: [
    {
      kind: 'DEBATE_OPENED',
      id: 'd-1',
      at: '2026-01-06T10:00:00.000Z',
      thread: { step: 'DEBATE', id: 'debate-1' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: 'example.gov/one/ · 2021-12-23',
      body: { sessionId: 'debate-1', record: CAPTURE_RECORD, pin: 'pin-one' },
    },
    {
      kind: 'RATIONALE',
      id: 'd-2',
      at: '2026-01-06T10:05:00.000Z',
      thread: { step: 'DEBATE', id: 'debate-1' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: null,
      body: { text: 'הפסקה נשענת על המשפט שהוסר מן העמוד.' },
    },
    {
      kind: 'ASSESSMENT',
      id: 'd-3',
      at: '2026-01-06T10:06:00.000Z',
      thread: { step: 'DEBATE', id: 'debate-1' },
      by: { voice: 'MODEL', model: null, promptVersion: null, spentBy: { handle: AUTHOR, mine: true } },
      line: null,
      body: { malformed: false, hasSubstance: true, substanceGaps: [], verdict: 'DISPUTES', objection: 'ההסתמכות רחבה', assessment: 'נטען כראוי', assertions: null },
    },
    {
      kind: 'RESPONSE',
      id: 'd-4',
      at: '2026-01-06T10:20:00.000Z',
      thread: { step: 'DEBATE', id: 'debate-1' },
      by: { voice: 'RESEARCHER', handle: AUTHOR, mine: true },
      line: null,
      body: { text: 'צמצמתי את ההסתמכות.' },
    },
    {
      kind: 'DEBATE_CLOSED',
      id: 'd-5',
      at: '2026-01-06T10:30:00.000Z',
      thread: { step: 'DEBATE', id: 'debate-1' },
      by: { voice: 'PLATFORM' },
      line: null,
      body: { outcome: 'PROMOTED', overObjection: true, evidenceFileHash: 'cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333' },
    },
  ],
};

/**
 * `list_pages` — a page NOT PUBLIC, a page with a STOP PENDING, and every one of the seven outcome keys on
 * every row. `public: false` is the field the NOT PUBLIC mark is drawn from, and `stopPending: true` is what
 * the live corpus does not have (no PENDING row on staging).
 */
export const pages: PageEntry[] = [
  {
    trackedUrlId: 'page-one',
    url: 'https://example.gov/one/',
    public: true,
    title: 'העמוד הראשון',
    surveyedAt: '2026-01-02T09:00:00.000Z',
    total: 43,
    outcomes: { UNFETCHED: 1, UNSERVABLE: 0, IDENTICAL: 20, DUPLICATE: 0, ACQUIRED: 22, PENDING_JUDGEMENT: 0, SKIPPED: 0 },
    stopPending: false,
  },
  {
    trackedUrlId: 'page-two',
    url: 'https://example.gov/two/',
    public: false,
    title: null,
    surveyedAt: '2026-01-03T09:00:00.000Z',
    total: 12,
    outcomes: { UNFETCHED: 0, UNSERVABLE: 1, IDENTICAL: 4, DUPLICATE: 2, ACQUIRED: 4, PENDING_JUDGEMENT: 1, SKIPPED: 0 },
    stopPending: true,
  },
  {
    trackedUrlId: 'page-three',
    url: 'https://example.gov/three/',
    public: false,
    title: 'העמוד השלישי',
    surveyedAt: '2026-01-04T09:00:00.000Z',
    total: 3,
    outcomes: { UNFETCHED: 3, UNSERVABLE: 0, IDENTICAL: 0, DUPLICATE: 0, ACQUIRED: 0, PENDING_JUDGEMENT: 0, SKIPPED: 0 },
    stopPending: false,
  },
];

/** `list_captures` — a row per outcome, one carrying `stopGates`, one `stale`. */
export const captures: CaptureRow[] = [
  {
    capture: '20211223211940',
    snapshotDate: '2021-12-23',
    outcome: 'ACQUIRED',
    digest: 'digest-one',
    comparedTo: null,
    rulesetId: 'ruleset-1',
    snapshotId: 'snapshot-1',
    stale: false,
    stopGates: null,
  },
  {
    capture: '20220301120000',
    snapshotDate: '2022-03-01',
    outcome: 'IDENTICAL',
    digest: 'digest-two',
    comparedTo: '20211223211940',
    rulesetId: 'ruleset-1',
    snapshotId: 'snapshot-2',
    stale: true,
    stopGates: null,
  },
  {
    capture: '20220502120000',
    snapshotDate: '2022-05-02',
    outcome: 'PENDING_JUDGEMENT',
    digest: 'digest-three',
    comparedTo: '20220301120000',
    rulesetId: 'ruleset-1',
    snapshotId: 'snapshot-3',
    stale: false,
    stopGates: [1, 'DIGEST'],
  },
  {
    capture: '20220704090000',
    snapshotDate: '2022-07-04',
    outcome: 'UNFETCHED',
    digest: 'digest-four',
    comparedTo: null,
    rulesetId: null,
    snapshotId: null,
    stale: false,
    stopGates: null,
  },
  {
    capture: '20220805090000',
    snapshotDate: '2022-08-05',
    outcome: 'DUPLICATE',
    digest: 'digest-five',
    comparedTo: '20220704090000',
    rulesetId: 'ruleset-1',
    snapshotId: 'snapshot-5',
    stale: false,
    stopGates: null,
  },
];

/**
 * `get_article_rules` — an ended rule beside a live one, and a PENDING STOP whose `markingUrl` IS PRESENT.
 *
 * The URL being in the body is what makes `no-marking-link-from-research` an absence over SOMETHING: the read
 * view renders it as no anchor (ui §31 :925), and a fixture without it would let the instrument pass over a
 * page that had nothing to render either way.
 */
export const articleRules: ArticleRules = {
  rules: [
    // `validFrom` AND `validTo` ARE 14-DIGIT CAPTURE INSTANTS, not days — `schema.prisma` :1790–:1795, and
    // REVIEW read `20211223211940` on the real body. Written as days here, this fixture asserted a spelling
    // the wire does not use and made a live rule read as not-yet-begun on every real page.
    { ruleId: 'rule-1', selector: 'main article', validFrom: '20211201000000', validTo: null, trusted: true, lastMatched: '20220502120000' },
    { ruleId: 'rule-2', selector: 'div.legacy', validFrom: '20210101000000', validTo: '20211130000000', trusted: false, lastMatched: null },
  ],
  pendingStop: {
    capture: '20220502120000',
    gates: [{ gate: 1, material: { removed: ['משפט שהוסר'] } }, { gate: 'DIGEST', material: null }],
    markingUrl: 'https://example.test/he/article-rules/page-two/20220502120000',
  },
  counts: { UNFETCHED: 0, UNSERVABLE: 1, IDENTICAL: 4, DUPLICATE: 2, ACQUIRED: 4, PENDING_JUDGEMENT: 1, SKIPPED: 0 },
  stale: 1,
  decisions: 6,
  lastDecisionAt: '2026-01-30T09:00:00.000Z',
};

/** `get_rule_history` — two decisions, and a match whose `removed` lines are held beside one whose are not. */
export const ruleHistory: RuleHistory = {
  rule: {
    ruleId: 'rule-1',
    selector: 'main article',
    validFrom: '20211201000000',
    validTo: null,
    trusted: true,
    createdAt: '2021-12-01T09:00:00.000Z',
    createdById: 'researcher-row-1',
    decisions: [
      { type: 'TRUST_RULE', waybackTimestamp: '20211223211940', researcherId: 'researcher-row-1', createdAt: '2021-12-02T09:00:00.000Z' },
      { type: 'NARROW_RULE', waybackTimestamp: null, researcherId: 'researcher-row-1', createdAt: '2022-01-02T09:00:00.000Z' },
    ],
  },
  matches: [
    { capture: '20211223211940', outcome: 'ACQUIRED', matchedNodes: 3, removed: ['שורה שהוסרה', 'שורה שנייה'], removedCount: 2 },
    { capture: '20220301120000', outcome: 'IDENTICAL', matchedNodes: 1, removed: null, removedCount: null },
  ],
};
