// THE PRISMA DOUBLE IS `test/helpers/evidenceDouble.ts`, SHARED WITH
// `test/debate.test.ts` — extracted at this step rather than copied, because two
// doubles would be free to disagree about what the database does.
//
// REACHED BY `require` INSIDE THE FACTORY: Jest hoists `jest.mock` above the
// `require` an `import` compiles to, so an imported binding is still unassigned
// when the factory runs.
jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

import { DIFF_VERSION } from '../src/lib/diffVersion';
import {
  movedBetween,
  whereChunksWent,
  type ContentUnit,
  type NarrowerRecord,
} from '../src/services/evidencePredicates';
import { listEvidenceReviews } from '../src/services/evidenceReviews';
import { listEvidenceReviewsHandler } from '../src/mcp/tools/listEvidenceReviews';
import { db, resetDouble, store, written, type Row } from './helpers/evidenceDouble';
import { AFTER, BEFORE, BETWEEN, CAPTURE_NAME, CHUNKS, DIFF_NAME, PAGE, URL } from './helpers/corpusFixture';

// ---------------------------------------------------------------------------
// EVIDENCE STEP 14 — REVIEW. docs/gf-evidence-flows.md §6 (Flow E3), §7, §9 and
// A4, composed with docs/gf-interaction-flows.md A2 and A4's segment rule,
// docs/gf-thesis-flows.md T6 and §9, docs/gf-document-flows.md §3 and §8.
//
// FIXTURES, AND THEY STAND IN FOR A STAGING EXERCISE THAT CANNOT HAPPEN. No act
// in this tree creates a Thesis, a ThesisVersion or a ThesisMention, so nothing
// can be PROMOTED, so no `Evidence` row can exist on staging and NEEDS_REVIEW has
// no subject there: `list_evidence_reviews` answers `owed: 0`, which is a TRUE
// answer and not a broken one. The plan's "a re-walk on staging putting one
// promoted record into review and both decisions exercised" is OWED to thesis
// step 20 and recorded so, never faked.
//
// NO MODEL IS MOCKED HERE BECAUSE THERE IS NONE. Step 14 has no assessor, no
// prompt and no passage: a review is a judgement no pass may make, so nothing in
// it calls one and no zod-validated model output is written.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// §7.1 — THE CONTAINMENT RULE. Pure, sync, over values a caller loaded.
// ---------------------------------------------------------------------------

/** A diff's chunk: a side and a text, as `DiffContentVersion.chunks` stores it. */
const chunk = (side: string, text: string): ContentUnit => ({ side, text });

/** A capture's segment: text alone — a capture's text has no sides. */
const segment = (text: string): ContentUnit => ({ text });

describe('movedBetween — what entered and what left, by CONTAINMENT', () => {
  // THE CASE IS REAL, AND IT IS WHY THE RULE IS CONTAINMENT. The re-walk of
  // 2026-09-07 found two positional rules mutilating one sentence: the old
  // derivation held the inline link's words alone, the new one holds the whole
  // sentence they sit inside. The phrase was present in all four documents as
  // served — nothing about the page changed.
  const FRAGMENT = 'מסמכים שפורסמו היום על ידי ה-FDA';
  const SENTENCE = `בתוך כך, ${FRAGMENT} אישרו כי החיסון בטוח`;

  it('a fragment absorbed into the sentence containing it ENTERS, and NOTHING LEFT', () => {
    const moved = movedBetween([chunk('REMOVED', FRAGMENT)], [chunk('REMOVED', SENTENCE)]);
    expect(moved.left).toEqual([]);
    expect(moved.entered).toEqual([chunk('REMOVED', SENTENCE)]);
  });

  it('under EQUALITY the same pair would read as two movements — the reading this rule replaces', () => {
    // Not a test of the code: a statement of what the rejected rule would say, so
    // the case above cannot be read as arbitrary. One text, reported as a
    // departure AND an arrival, asks a researcher to judge a change that did not
    // happen.
    expect(FRAGMENT).not.toEqual(SENTENCE);
    expect(SENTENCE).toContain(FRAGMENT);
  });

  it('reports a genuinely new unit as ENTERED and a genuinely gone one as LEFT', () => {
    const moved = movedBetween(
      [chunk('REMOVED', 'the paragraph on adverse events')],
      [chunk('REMOVED', 'the paragraph on efficacy')],
    );
    expect(moved.left).toEqual([chunk('REMOVED', 'the paragraph on adverse events')]);
    expect(moved.entered).toEqual([chunk('REMOVED', 'the paragraph on efficacy')]);
  });

  it('a unit unchanged between the two versions is in NEITHER list', () => {
    const same = [chunk('ADDED', 'unchanged text')];
    expect(movedBetween(same, same)).toEqual({ entered: [], left: [] });
  });

  it('WHITESPACE IS NOT A MOVEMENT — re-wrapping and re-indentation are normalised away', () => {
    const moved = movedBetween(
      [chunk('REMOVED', 'the paragraph  on   adverse events')],
      [chunk('REMOVED', 'the paragraph on\nadverse events')],
    );
    expect(moved).toEqual({ entered: [], left: [] });
  });

  it('A SIDE FLIP IS TWO FACTS: the same text is in BOTH lists', () => {
    // "A chunk that moved from REMOVED to ADDED is two facts and a researcher
    // re-affirming must see both." Containment is asked WITHIN SIDE, so the
    // ADDED unit cannot answer for the REMOVED one.
    const text = 'החיסון בטוח';
    const moved = movedBetween([chunk('REMOVED', text)], [chunk('ADDED', text)]);
    expect(moved.left).toEqual([chunk('REMOVED', text)]);
    expect(moved.entered).toEqual([chunk('ADDED', text)]);
  });

  it("a capture's SIDELESS segments compare as ONE BAG, never position by position", () => {
    // The segments are given in a DIFFERENT ORDER in the two versions. A rule
    // that compared them pairwise by position would report both as moved; as one
    // bag, only the segment that is genuinely gone leaves and only the genuinely
    // new one enters. A capture's text has no sides, so `undefined` compares with
    // `undefined` and the whole list is one bag.
    const moved = movedBetween(
      [segment('the ministry said so'), segment('a line that goes')],
      [segment('a line that arrives'), segment('the ministry said so')],
    );
    expect(moved.left).toEqual([segment('a line that goes')]);
    expect(moved.entered).toEqual([segment('a line that arrives')]);
  });

  it('BOTH SIDES EMPTY: nothing entered and nothing left — an answer, not an absence', () => {
    expect(movedBetween([], [])).toEqual({ entered: [], left: [] });
  });

  it('an EMPTY affirmed version means every current unit ENTERED', () => {
    expect(movedBetween([], [chunk('ADDED', 'x')])).toEqual({
      entered: [chunk('ADDED', 'x')],
      left: [],
    });
  });

  it('an EMPTY current version means every affirmed unit LEFT', () => {
    expect(movedBetween([chunk('ADDED', 'x')], [])).toEqual({
      entered: [],
      left: [chunk('ADDED', 'x')],
    });
  });
});

describe('whereChunksWent — ONE ROW PER WIDE UNIT, always', () => {
  const WIDE = [chunk('REMOVED', 'הפסקה על תופעות הלוואי'), chunk('ADDED', 'טקסט חדש')];

  const narrower = (before: string, after: string, units: ContentUnit[]): NarrowerRecord => ({
    before,
    after,
    units,
  });

  it('names the narrower diffs that carry a chunk, in the order they were given', () => {
    const carried = whereChunksWent(WIDE, [
      narrower('20210101000000', '20210301000000', [
        chunk('REMOVED', 'הפסקה על תופעות הלוואי הוסרה מן העמוד'),
      ]),
      narrower('20210301000000', '20210612183110', [chunk('ADDED', 'טקסט חדש')]),
    ]);
    expect(carried).toEqual([
      {
        text: 'הפסקה על תופעות הלוואי',
        carriedBy: [{ before: '20210101000000', after: '20210301000000' }],
      },
      {
        text: 'טקסט חדש',
        carriedBy: [{ before: '20210301000000', after: '20210612183110' }],
      },
    ]);
  });

  it('A WIDE CHUNK NO NARROWER DIFF CONTAINS GETS ONE ROW WITH carriedBy: [] — went nowhere is an ANSWER', () => {
    // The whole of MEDIUM 2. A mapping that listed only what was carried would
    // leave the reader unable to tell "went nowhere" from "not computed", and
    // *went nowhere* is the fact that decides whether the narrower records
    // replace the wide one.
    const carried = whereChunksWent(WIDE, [
      narrower('20210101000000', '20210301000000', [chunk('ADDED', 'טקסט חדש')]),
    ]);
    expect(carried).toHaveLength(WIDE.length);
    expect(carried.at(0)).toEqual({ text: 'הפסקה על תופעות הלוואי', carriedBy: [] });
    expect(carried.at(1)?.carriedBy).toHaveLength(1);
  });

  it('answers every wide chunk even when there is NO narrower diff at all', () => {
    expect(whereChunksWent(WIDE, [])).toEqual([
      { text: 'הפסקה על תופעות הלוואי', carriedBy: [] },
      { text: 'טקסט חדש', carriedBy: [] },
    ]);
  });

  it('one chunk carried by TWO narrower diffs names both', () => {
    const carried = whereChunksWent([chunk('REMOVED', 'x')], [
      narrower('a', 'b', [chunk('REMOVED', 'x and more')]),
      narrower('b', 'c', [chunk('REMOVED', 'also x here')]),
    ]);
    expect(carried.at(0)?.carriedBy).toEqual([
      { before: 'a', after: 'b' },
      { before: 'b', after: 'c' },
    ]);
  });

  it('ASKS WITHIN SIDE: a narrower ADDED chunk does not carry a wide REMOVED one', () => {
    const carried = whereChunksWent([chunk('REMOVED', 'x')], [narrower('a', 'b', [chunk('ADDED', 'x')])]);
    expect(carried).toEqual([{ text: 'x', carriedBy: [] }]);
  });

  it('a WIDE version with no chunks yields no rows — nothing to answer for', () => {
    expect(whereChunksWent([], [narrower('a', 'b', [chunk('REMOVED', 'x')])])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §7.3 — `list_evidence_reviews`: the two-phase loader and the entry projection.
//
// Every fixture below is an EVIDENCE ROW in the shape the loader selects, on the
// shared double. The names are the corpus fixture's COMPUTED ones, so a case
// asserting that an entry carries a record's name cannot pass against a name
// somebody pasted in.
// ---------------------------------------------------------------------------

/** The nested `trackedUrl` shape the loader selects — the fixture's page, not a second one. */
const PAGE_URL = { url: PAGE.url };
const CURRENT_EXTRACTOR = 'v3-extractor';

/** A capture as the reviews loader selects it. */
const capture = (row: typeof BEFORE, over: Row = {}): Row => ({
  id: row.id,
  waybackTimestamp: row.waybackTimestamp,
  textHash: row.textHash,
  textExtractionVersion: CURRENT_EXTRACTOR,
  trackedUrlId: 'page-1',
  trackedUrl: PAGE_URL,
  ...over,
});

/**
 * A stored content version as PHASE 1 selects it — PROVENANCE ONLY.
 *
 * §2h bounds the expensive register by what is OWED, so the first query names
 * neither `chunks` nor `classification`; the computed register is registered
 * separately by `content()` and read per owed row.
 */
const version = (over: Row = {}): Row => ({
  contentVersionHash: 'content-current',
  beforeTextHash: BEFORE.textHash,
  afterTextHash: AFTER.textHash,
  diffVersion: DIFF_VERSION,
  derivedAt: new Date('2026-09-07T10:00:00.000Z'),
  ...over,
});

/** The COMPUTED register of one version of one diff — what phase 2 reads. */
const content = (contentVersionHash: string, chunks: Row[], diffId = 'diff-1'): Row => ({
  diffId,
  contentVersionHash,
  chunks,
});

const AFFIRMED_CHUNKS = [
  { side: 'REMOVED', text: 'הפסקה על תופעות הלוואי', survival: 'UNCHECKABLE' },
];

/** The version a human affirmed: an older derivation, from before an endpoint moved. */
const AFFIRMED_VERSION = version({
  contentVersionHash: 'content-affirmed',
  beforeTextHash: 'text-before-v2',
  derivedAt: new Date('2026-09-01T10:00:00.000Z'),
});

/** A promoted DIFF row, affirmed at a version that is no longer CURRENT. */
const diffRow = (over: Row = {}): Row => ({
  fileHash: DIFF_NAME,
  kind: 'DIFF',
  status: 'PROMOTED',
  affirmedContentVersionHash: 'content-affirmed',
  snapshot: null,
  urlVersionDiff: {
    id: 'diff-1',
    trackedUrlId: 'page-1',
    trackedUrl: PAGE_URL,
    beforeSnapshot: capture(BEFORE),
    afterSnapshot: capture(AFTER),
    contentVersions: [AFFIRMED_VERSION, version()],
  },
  ...over,
});

/** A promoted CAPTURE row, affirmed at a text version the snapshot no longer holds. */
const captureRow = (over: Row = {}): Row => ({
  fileHash: CAPTURE_NAME,
  kind: 'CAPTURE',
  status: 'PROMOTED',
  affirmedContentVersionHash: 'text-before-v2',
  snapshot: capture(BEFORE),
  urlVersionDiff: null,
  ...over,
});

/** A kept text version of a capture — superseded by a DECISION, or by an EXTRACTOR. */
const keptVersion = (over: Row = {}): Row => ({
  snapshotId: BEFORE.id,
  textHash: 'text-before-v2',
  text: 'הפסקה על תופעות הלוואי\nשורה שנשארה',
  textExtractionVersion: 'v2-extractor',
  supersededAt: new Date('2026-09-05T09:00:00.000Z'),
  supersededByDecisionId: null,
  supersededByDecision: null,
  ...over,
});

const DECISION = {
  id: 'decision-9',
  type: 'RULESET_CORRECTED',
  waybackTimestamp: BEFORE.waybackTimestamp,
  sequence: 9,
  researcherId: 'researcher-1',
  createdAt: new Date('2026-09-06T08:00:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  resetDouble();
  mockResearcherId.mockReturnValue('researcher-1');
  // THE CAPTURE'S CURRENT TEXT CARRIES BOTH HALVES OF THE SEGMENT RULE: a line
  // with no letter or digit (a bullet, which walla's extraction emits by the
  // dozen) and a doubled inner space. `segments` drops the first and collapses
  // the second; a `split('\n')` that only trimmed would keep both.
  store.captures = [
    { ...BEFORE, text: 'הפסקה על תופעות הלוואי המלאה\n•\nשורה  שנשארה\nשורה חדשה' },
    AFTER,
  ];
  store.diffs = [];
  store.textVersions = [keptVersion()];
  store.contentVersions = [
    content('content-affirmed', AFFIRMED_CHUNKS),
    content('content-current', CHUNKS),
  ];
});

describe('list_evidence_reviews — the entry, field by field', () => {
  it('a promoted DIFF whose ENDPOINT TEXT MOVED under a correction: cause DECISION', async () => {
    store.evidenceRows = [diffRow()];
    store.textVersions = [keptVersion({ supersededByDecisionId: 'decision-9', supersededByDecision: DECISION })];

    const list = await listEvidenceReviews();
    expect(list.owed).toBe(1);
    const entry = list.reviews.at(0);
    expect(entry?.kind).toBe('CONTENT_MOVED');
    expect(entry?.fileHash).toBe(DIFF_NAME);
    // A1: the record is named by its page and its two timestamps, never a row id.
    expect(entry?.record).toEqual({
      url: URL,
      before: BEFORE.waybackTimestamp,
      after: AFTER.waybackTimestamp,
    });
    expect(entry?.cause).toEqual([
      {
        kind: 'DECISION',
        capture: BEFORE.waybackTimestamp,
        decisionId: 'decision-9',
        decisionType: 'RULESET_CORRECTED',
        waybackTimestamp: BEFORE.waybackTimestamp,
        sequence: 9,
        researcherId: 'researcher-1',
        at: DECISION.createdAt,
      },
    ]);
    // OLD BESIDE NEW, both hashes named.
    expect(entry?.affirmed.hash).toBe('content-affirmed');
    expect(entry?.current.hash).toBe('content-current');
  });

  it("a promoted CAPTURE likewise: cause EXTRACTOR, and its chunks are SEGMENTS", async () => {
    store.evidenceRows = [captureRow()];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.record).toEqual({ url: URL, capture: BEFORE.waybackTimestamp });
    expect(entry?.cause).toEqual([
      {
        kind: 'EXTRACTOR',
        capture: BEFORE.waybackTimestamp,
        from: 'v2-extractor',
        to: CURRENT_EXTRACTOR,
        at: new Date('2026-09-05T09:00:00.000Z'),
      },
    ]);
    // SEGMENTS, through `lib/claimSurvival.segments`: line-wise, no side, no
    // survival — a capture's text has neither.
    expect(entry?.affirmed.chunks).toEqual([
      { text: 'הפסקה על תופעות הלוואי' },
      { text: 'שורה שנשארה' },
    ]);
    expect(entry?.current.chunks).toEqual([
      { text: 'הפסקה על תופעות הלוואי המלאה' },
      { text: 'שורה שנשארה' },
      { text: 'שורה חדשה' },
    ]);
    // And what moved is CONTAINMENT over those segments: the sentence grew, so it
    // entered and nothing left; the genuinely new line entered too.
    expect(entry?.moved.left).toEqual([]);
    expect(entry?.moved.entered).toEqual([
      { text: 'הפסקה על תופעות הלוואי המלאה' },
      { text: 'שורה חדשה' },
    ]);
  });

  it('a DIFF whose ENDPOINTS ARE UNCHANGED and whose DIFF_VERSION MOVED: one cause, no TextVersion read', async () => {
    // §3: "every CITED DIFF enters review — the price of a better differ, paid by
    // a human once per record, and stated here so nobody pays it by surprise."
    const affirmedAtOldLabel = version({
      contentVersionHash: 'content-affirmed',
      diffVersion: 'v3-older-differ',
      derivedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    store.evidenceRows = [
      diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          trackedUrlId: 'page-1',
          trackedUrl: PAGE_URL,
          beforeSnapshot: capture(BEFORE),
          afterSnapshot: capture(AFTER),
          contentVersions: [affirmedAtOldLabel, version()],
        },
      }),
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.cause).toEqual([
      {
        kind: 'DIFF_VERSION',
        from: 'v3-older-differ',
        to: DIFF_VERSION,
        at: new Date('2026-09-07T10:00:00.000Z'),
      },
    ]);
    // Neither endpoint moved, so no kept text version is consulted at all.
    expect(db.textVersion.findUnique).not.toHaveBeenCalled();
  });

  it('BOTH ENDPOINTS MOVED: two causes, in PAIR ORDER — before, then after', async () => {
    store.evidenceRows = [
      diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          trackedUrlId: 'page-1',
          trackedUrl: PAGE_URL,
          beforeSnapshot: capture(BEFORE),
          afterSnapshot: capture(AFTER),
          contentVersions: [
            version({
              contentVersionHash: 'content-affirmed',
              beforeTextHash: 'text-before-v2',
              afterTextHash: 'text-after-v2',
            }),
            version(),
          ],
        },
      }),
    ];
    store.textVersions = [
      keptVersion(),
      keptVersion({ snapshotId: AFTER.id, textHash: 'text-after-v2', textExtractionVersion: 'v2-extractor' }),
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.cause.map((c) => ('capture' in c ? c.capture : c.kind))).toEqual([
      BEFORE.waybackTimestamp,
      AFTER.waybackTimestamp,
    ]);
  });

  it('an OLDER diffVersion AND a moved endpoint: TWO causes, THE LABEL FIRST', async () => {
    // The routes are asked INDEPENDENTLY and the answers accumulate. Treating the
    // version label as the ELSE of the endpoints would hide a differ change behind
    // a rule change whenever both happened.
    store.evidenceRows = [
      diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          trackedUrlId: 'page-1',
          trackedUrl: PAGE_URL,
          beforeSnapshot: capture(BEFORE),
          afterSnapshot: capture(AFTER),
          contentVersions: [
            version({
              contentVersionHash: 'content-affirmed',
              beforeTextHash: 'text-before-v2',
              diffVersion: 'v3-older-differ',
            }),
            version(),
          ],
        },
      }),
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.cause.map((c) => c.kind)).toEqual(['DIFF_VERSION', 'EXTRACTOR']);
  });

  it('an endpoint whose KEPT VERSION IS ABSENT is UNREADABLE, and THE ENTRY STAYS', async () => {
    // "The record's CURRENT has moved off what a human affirmed whether or not the
    // platform can explain why", so withholding the entry would drop a real
    // obligation for a missing explanation.
    store.evidenceRows = [diffRow()];
    store.textVersions = [];

    const list = await listEvidenceReviews();
    expect(list.owed).toBe(1);
    expect(list.notEvaluable).toEqual([]);
    const entry = list.reviews.at(0);
    expect(entry?.cause.map((c) => c.kind)).toEqual(['UNREADABLE']);
    // And what MOVED is still computed — the two versions are both readable.
    expect(entry?.moved.entered.length).toBeGreaterThan(0);
  });

  it('a DECISION ID naming a decision the log does not hold is UNREADABLE too', async () => {
    store.evidenceRows = [diffRow()];
    store.textVersions = [keptVersion({ supersededByDecisionId: 'decision-gone', supersededByDecision: null })];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.cause.map((c) => c.kind)).toEqual(['UNREADABLE']);
    expect(String((entry?.cause.at(0) as { reason: string }).reason)).toContain('decision-gone');
  });
});

describe('list_evidence_reviews — what is NOT owed, and what cannot be judged', () => {
  it('a record whose AFFIRMED IS CURRENT is absent — there is nothing to re-affirm', async () => {
    store.evidenceRows = [diffRow({ affirmedContentVersionHash: 'content-current' })];
    const list = await listEvidenceReviews();
    expect(list.owed).toBe(0);
    expect(list.reviews).toEqual([]);
    expect(list.notEvaluable).toEqual([]);
  });

  it('a WITHDRAWN row is absent — decided by the PREDICATE, not by a where clause', async () => {
    store.evidenceRows = [diffRow({ status: 'WITHDRAWN' })];
    const list = await listEvidenceReviews();
    expect(list.owed).toBe(0);
    // The row WAS loaded: the query asks for every evidence row, and `needsReview`
    // is what says a withdrawn record is owed nothing.
    expect(db.evidence.findMany).toHaveBeenCalledTimes(1);
  });

  it('AWAITING_DERIVATION: named in notEvaluable, never silently dropped', async () => {
    store.evidenceRows = [
      diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          trackedUrlId: 'page-1',
          trackedUrl: PAGE_URL,
          beforeSnapshot: capture(BEFORE),
          afterSnapshot: capture(AFTER),
          // No version matches BOTH endpoints' current text at the current label.
          contentVersions: [AFFIRMED_VERSION],
        },
      }),
    ];

    const list = await listEvidenceReviews();
    expect(list.owed).toBe(0);
    expect(list.notEvaluable).toHaveLength(1);
    expect(list.notEvaluable.at(0)?.reason).toBe('AWAITING_DERIVATION');
    expect(list.notEvaluable.at(0)?.fileHash).toBe(DIFF_NAME);
    expect(String(list.notEvaluable.at(0)?.detail)).toContain('scan_captures');
  });

  it('a DOCUMENT row is reported under THE SAME reason word, with detail naming step 28', async () => {
    // LOW 6: one state, one word, on both surfaces. A second code for the same
    // state is the "one state, two codes" defect step 13 removed.
    store.evidenceRows = [
      { fileHash: '0xcommitment', kind: 'DOCUMENT', status: 'PROMOTED', affirmedContentVersionHash: 'x', snapshot: null, urlVersionDiff: null },
    ];

    const list = await listEvidenceReviews();
    expect(list.notEvaluable).toHaveLength(1);
    expect(list.notEvaluable.at(0)?.reason).toBe('AWAITING_DERIVATION');
    expect(list.notEvaluable.at(0)?.record).toBeNull();
    expect(String(list.notEvaluable.at(0)?.detail)).toContain('step 28');
  });

  it('a MISSING AFFIRMED VERSION is its own reason word, and names the record', async () => {
    store.evidenceRows = [diffRow({ affirmedContentVersionHash: 'content-nobody-holds' })];
    const list = await listEvidenceReviews();
    expect(list.owed).toBe(0);
    expect(list.notEvaluable.at(0)?.reason).toBe('AFFIRMED_VERSION_MISSING');
    expect(list.notEvaluable.at(0)?.record).toEqual({
      url: URL,
      before: BEFORE.waybackTimestamp,
      after: AFTER.waybackTimestamp,
    });
  });

  it('owed: 0 on an EMPTY CORPUS — the count is the first field, and it is an ANSWER', async () => {
    store.evidenceRows = [];
    expect(await listEvidenceReviews()).toEqual({ owed: 0, reviews: [], notEvaluable: [] });
  });

  it('THE READ WRITES NOTHING', async () => {
    store.evidenceRows = [diffRow(), captureRow()];
    await listEvidenceReviews();
    expect(written).toEqual([]);
  });
});

describe('list_evidence_reviews — the citations, one row per MENTION', () => {
  const mention = (over: Row = {}): Row => ({
    name: DIFF_NAME,
    debateSessionId: null,
    thesisVersion: { id: 'version-head', thesisId: 'thesis-1', isPublished: null },
    debateSession: null,
    ...over,
  });

  beforeEach(() => {
    store.evidenceRows = [diffRow()];
  });

  it('a HEAD-ONLY citation is published: false, with no argument', async () => {
    store.mentions = [mention()];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.citedBy).toEqual([
      { thesisId: 'thesis-1', versionId: 'version-head', published: false, argument: null },
    ]);
  });

  it('a PUBLISHED citation is published: true — the PIN itself decides', async () => {
    store.mentions = [
      mention({ thesisVersion: { id: 'version-pub', thesisId: 'thesis-1', isPublished: { id: 'thesis-1' } } }),
    ];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.citedBy.at(0)?.published).toBe(true);
  });

  it('ONE THESIS CITING FROM BOTH ITS HEAD AND ITS PUBLISHED VERSION YIELDS TWO ROWS', async () => {
    // T2/T3 make the argument travel with (name, pin), so the published citation
    // can be ARGUED while the re-pinned draft's is not. One row per thesis would
    // hide exactly the fact a reviewer needs.
    store.mentions = [
      mention({
        thesisVersion: { id: 'version-pub', thesisId: 'thesis-1', isPublished: { id: 'thesis-1' } },
        debateSessionId: 'session-1',
        debateSession: { status: 'PROMOTED', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' },
      }),
      mention({ thesisVersion: { id: 'version-head', thesisId: 'thesis-1', isPublished: null } }),
    ];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.citedBy).toHaveLength(2);
    expect(entry?.citedBy.at(0)).toEqual({
      thesisId: 'thesis-1',
      versionId: 'version-pub',
      published: true,
      argument: { debateSessionId: 'session-1', argued: true },
    });
    expect(entry?.citedBy.at(1)?.argument).toBeNull();
  });

  it('ARGUED is CALLED: a debate PROMOTED for ANOTHER record argues nothing here', async () => {
    store.mentions = [
      mention({
        debateSessionId: 'session-1',
        debateSession: { status: 'PROMOTED', recordFileHash: CAPTURE_NAME, thesisId: 'thesis-1' },
      }),
    ];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.citedBy.at(0)?.argument).toEqual({ debateSessionId: 'session-1', argued: false });
  });

  it('an OPEN debate has not cleared — argued: false', async () => {
    store.mentions = [
      mention({
        debateSessionId: 'session-1',
        debateSession: { status: 'OPEN', recordFileHash: DIFF_NAME, thesisId: 'thesis-1' },
      }),
    ];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.citedBy.at(0)?.argument?.argued).toBe(false);
  });
});

describe('list_evidence_reviews — the order, the sequence and the commands', () => {
  it('OLDEST FIRST, by owedSince — an order the reader can SEE', async () => {
    // TWO RECORDS THAT MOVED AT DIFFERENT MOMENTS, given to the loader in the
    // WRONG order: the capture's kept text was superseded by an extractor on
    // 09-05, the diff's AFTER endpoint by a decision on 09-06. What is owed
    // longest is what MOVED longest ago, never when the selection was made.
    store.evidenceRows = [
      diffRow({
        urlVersionDiff: {
          id: 'diff-1',
          trackedUrlId: 'page-1',
          trackedUrl: PAGE_URL,
          beforeSnapshot: capture(BEFORE),
          afterSnapshot: capture(AFTER),
          contentVersions: [
            version({ contentVersionHash: 'content-affirmed', afterTextHash: 'text-after-v2' }),
            version(),
          ],
        },
      }),
      captureRow(),
    ];
    store.textVersions = [
      keptVersion(),
      keptVersion({
        snapshotId: AFTER.id,
        textHash: 'text-after-v2',
        supersededByDecisionId: 'decision-9',
        supersededByDecision: DECISION,
      }),
    ];

    const list = await listEvidenceReviews();
    expect(list.owed).toBe(2);
    const owedSince = list.reviews.map((r) => r.owedSince.toISOString());
    expect(owedSince).toEqual([...owedSince].sort());
    expect(list.reviews.map((r) => r.fileHash)).toEqual([CAPTURE_NAME, DIFF_NAME]);
    expect(list.reviews.at(0)?.owedSince).toEqual(new Date('2026-09-05T09:00:00.000Z'));
    expect(list.reviews.at(1)?.owedSince).toEqual(DECISION.createdAt);
  });

  it('decisionSequence is 0 when the record has NEVER been reviewed', async () => {
    store.evidenceRows = [diffRow()];
    store.decisions = [];
    expect((await listEvidenceReviews()).reviews.at(0)?.decisionSequence).toBe(0);
  });

  it('decisionSequence is the LATEST sequence when it has', async () => {
    store.evidenceRows = [diffRow()];
    store.decisions = [
      { fileHash: DIFF_NAME, sequence: 1 },
      { fileHash: DIFF_NAME, sequence: 3 },
      { fileHash: DIFF_NAME, sequence: 2 },
    ];
    expect((await listEvidenceReviews()).reviews.at(0)?.decisionSequence).toBe(3);
  });

  it('BOTH COMMANDS PASTE AS WRITTEN, each embedding THE ENTRY’S OWN expectedSequence', async () => {
    // RULED 2026-09-09: a compare-and-set whose expected value the caller cannot
    // obtain is a parameter nobody can supply correctly.
    store.evidenceRows = [diffRow()];
    store.decisions = [{ fileHash: DIFF_NAME, sequence: 4 }];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.commands).toEqual([
      `review_evidence fileHash=${DIFF_NAME} decision=REAFFIRM expectedSequence=4`,
      `review_evidence fileHash=${DIFF_NAME} decision=WITHDRAW reason=… expectedSequence=4`,
    ]);
    for (const command of entry?.commands ?? []) {
      expect(command).toContain(`expectedSequence=${String(entry?.decisionSequence)}`);
    }
  });
});

describe('list_evidence_reviews — the narrowing material (§7)', () => {
  /** A stored diff row as `loadDiffs` selects it — the PAIR, and its versions. */
  const narrowerDiff = (before: typeof BEFORE, after: typeof BEFORE, chunks: Row[]) => ({
    id: `diff-${before.waybackTimestamp}`,
    beforeSnapshot: before,
    afterSnapshot: after,
    contentVersions: [
      {
        contentVersionHash: `content-${after.waybackTimestamp}`,
        beforeTextHash: before.textHash,
        afterTextHash: after.textHash,
        diffVersion: DIFF_VERSION,
        chunks,
        classification: null,
        survivalVersion: 'v1',
      },
    ],
  });

  it('a NARROWED pair answers EVERY wide chunk, one of them with carriedBy: []', async () => {
    store.evidenceRows = [diffRow()];
    store.captures = [BEFORE, BETWEEN, AFTER];
    store.diffs = [
      { id: 'diff-1', beforeSnapshot: BEFORE, afterSnapshot: AFTER, contentVersions: [version()] },
      narrowerDiff(BEFORE, BETWEEN, [{ side: 'REMOVED', text: 'הטקסט שהוסר לגמרי', survival: 'SURVIVES' }]),
      narrowerDiff(BETWEEN, AFTER, [{ side: 'ADDED', text: 'משהו אחר', survival: 'SURVIVES' }]),
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.narrowed?.intervening).toEqual([BETWEEN.waybackTimestamp]);
    expect(entry?.narrowed?.narrowerDiffs.map((d) => `${d.before}→${d.after}`)).toEqual([
      `${BEFORE.waybackTimestamp}→${BETWEEN.waybackTimestamp}`,
      `${BETWEEN.waybackTimestamp}→${AFTER.waybackTimestamp}`,
    ]);
    // ONE ROW PER WIDE CHUNK, in the wide version's order — the CURRENT version's
    // two chunks. The REMOVED one is carried by the first narrower diff; the ADDED
    // one is carried by nothing, and says so.
    expect(entry?.narrowed?.carried).toEqual([
      {
        text: CHUNKS[0]?.text,
        carriedBy: [{ before: BEFORE.waybackTimestamp, after: BETWEEN.waybackTimestamp }],
      },
      { text: CHUNKS[1]?.text, carriedBy: [] },
    ]);
  });

  it('the OPINION is LABELLED and never mixed with the computed chunks', async () => {
    store.evidenceRows = [diffRow()];
    store.captures = [BEFORE, BETWEEN, AFTER];
    store.diffs = [
      { id: 'diff-1', beforeSnapshot: BEFORE, afterSnapshot: AFTER, contentVersions: [version()] },
      narrowerDiff(BEFORE, BETWEEN, []),
    ];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    const narrower = entry?.narrowed?.narrowerDiffs.at(0);
    expect(narrower?.opinion).toBeNull();
    expect(narrower?.current?.chunks).toEqual([]);
  });

  it('a pair the corpus holds nothing between is NOT narrowed', async () => {
    store.evidenceRows = [diffRow()];
    store.captures = [BEFORE, AFTER];
    expect((await listEvidenceReviews()).reviews.at(0)?.narrowed).toBeNull();
  });

  it('A CAPTURE RECORD IS NEVER NARROWED — null by construction, not by an unasked question', async () => {
    store.evidenceRows = [captureRow()];
    store.captures = [
      { ...BEFORE, text: 'הפסקה על תופעות הלוואי המלאה' },
      BETWEEN,
      AFTER,
    ];
    expect((await listEvidenceReviews()).reviews.at(0)?.narrowed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ROUND 1's FINDINGS — the clauses that were stated in prose and held by nothing.
// ---------------------------------------------------------------------------

describe('whereChunksWent — the DIRECTION, which is not symmetric', () => {
  it('a NARROWER unit CONTAINING the wide one carries it', () => {
    const carried = whereChunksWent(
      [{ side: 'REMOVED', text: 'תופעות לוואי' }],
      [{ before: 'a', after: 'b', units: [{ side: 'REMOVED', text: 'הפסקה על תופעות לוואי הוסרה' }] }],
    );
    expect(carried.at(0)?.carriedBy).toEqual([{ before: 'a', after: 'b' }]);
  });

  it('THE REVERSE DOES NOT: a wide unit CONTAINING a narrower fragment is NOT carried', () => {
    // The asymmetry is the whole answer. A narrower diff spans a shorter
    // interval and holds the change in equal or finer grain; reporting the
    // reverse as carriage would tell a researcher the narrower records replace
    // the wide one when they do not.
    const carried = whereChunksWent(
      [{ side: 'REMOVED', text: 'הפסקה על תופעות לוואי הוסרה' }],
      [{ before: 'a', after: 'b', units: [{ side: 'REMOVED', text: 'תופעות לוואי' }] }],
    );
    expect(carried).toEqual([{ text: 'הפסקה על תופעות לוואי הוסרה', carriedBy: [] }]);
  });
});

describe('a DIFF unit is the STORED CHUNK, as written — survival included', () => {
  it("the CURRENT version's CONTRADICTED chunk reaches the entry, on both sides of the pair", async () => {
    // §2a's table: a DIFF's unit is "the stored DiffContentVersion.chunks, AS
    // WRITTEN". The "no survival" clause is the CAPTURE row's and explains why a
    // segment has none. This is the material a WITHDRAW rests on: a chunk the
    // archived documents refute is what E1 refuses a FRESH promotion for
    // (evidence §5), so a reviewer must see it without a second read.
    store.evidenceRows = [diffRow()];
    store.contentVersions = [
      content('content-affirmed', [{ side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'SURVIVES' }]),
      content('content-current', [
        { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'CONTRADICTED' },
        { side: 'ADDED', text: 'הטקסט שנוסף', survival: 'UNCHECKABLE' },
      ]),
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.affirmed.chunks).toEqual([
      { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'SURVIVES' },
    ]);
    expect(entry?.current.chunks).toEqual([
      { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'CONTRADICTED' },
      { side: 'ADDED', text: 'הטקסט שנוסף', survival: 'UNCHECKABLE' },
    ]);
    // The verdict is CARRIED and never COMPARED: the REMOVED chunk's text is
    // unchanged, so it neither entered nor left even though its verdict moved.
    expect(entry?.moved.left).toEqual([]);
    expect(entry?.moved.entered).toEqual([
      { side: 'ADDED', text: 'הטקסט שנוסף', survival: 'UNCHECKABLE' },
    ]);
  });

  it("a narrower diff's chunks carry it too", async () => {
    store.evidenceRows = [diffRow()];
    store.captures = [BEFORE, BETWEEN, AFTER];
    store.diffs = [
      { id: 'diff-1', beforeSnapshot: BEFORE, afterSnapshot: AFTER, contentVersions: [version()] },
      {
        id: 'diff-narrow',
        beforeSnapshot: BEFORE,
        afterSnapshot: BETWEEN,
        contentVersions: [
          {
            contentVersionHash: 'content-narrow',
            beforeTextHash: BEFORE.textHash,
            afterTextHash: BETWEEN.textHash,
            diffVersion: DIFF_VERSION,
            chunks: [{ side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'CONTRADICTED' }],
            classification: null,
            survivalVersion: 'v1',
          },
        ],
      },
    ];

    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.narrowed?.narrowerDiffs.at(0)?.current?.chunks).toEqual([
      { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'CONTRADICTED' },
    ]);
  });
});

describe('the two phases — the cost is bounded by what is OWED (§2h)', () => {
  /** A fourth capture, so two owed pairs on one page can each be narrowed. */
  const LATER = {
    id: 'snap-later',
    waybackTimestamp: '20220523123302',
    snapshotDate: '2022-05-23',
    textHash: 'text-later',
    textExtractionVersion: CURRENT_EXTRACTOR,
    documentHash: 'later-bytes',
    anchoredHash: 'later-bytes',
  };

  const pairRow = (fileHash: string, id: string, before: typeof BEFORE, after: typeof BEFORE): Row => ({
    fileHash,
    kind: 'DIFF',
    status: 'PROMOTED',
    affirmedContentVersionHash: `${id}-affirmed`,
    snapshot: null,
    urlVersionDiff: {
      id,
      trackedUrlId: 'page-1',
      trackedUrl: PAGE_URL,
      beforeSnapshot: capture(before, { textHash: before.textHash }),
      afterSnapshot: capture(after, { textHash: after.textHash }),
      contentVersions: [
        version({
          contentVersionHash: `${id}-affirmed`,
          beforeTextHash: 'moved-away',
          afterTextHash: after.textHash,
          derivedAt: new Date('2026-09-01T10:00:00.000Z'),
        }),
        version({
          contentVersionHash: `${id}-current`,
          beforeTextHash: before.textHash,
          afterTextHash: after.textHash,
        }),
      ],
    },
  });

  it('A PAGE IS LOADED ONCE PER PASS, not once per entry', async () => {
    // R34 recorded the opposite shape as a LOW on `open_debate` — three loads per
    // call — and §2h says "`loadCaptures` runs ONCE PER PAGE, not once per entry".
    store.captures = [BEFORE, BETWEEN, AFTER, LATER];
    store.evidenceRows = [
      pairRow(DIFF_NAME, 'diff-1', BEFORE, AFTER),
      pairRow('0xsecond-record', 'diff-2', BETWEEN, LATER),
    ];
    store.diffs = [
      { id: 'diff-1', beforeSnapshot: BEFORE, afterSnapshot: AFTER, contentVersions: [] },
      { id: 'diff-2', beforeSnapshot: BETWEEN, afterSnapshot: LATER, contentVersions: [] },
    ];
    store.textVersions = [];
    store.contentVersions = [
      content('diff-1-affirmed', [], 'diff-1'),
      content('diff-1-current', CHUNKS, 'diff-1'),
      content('diff-2-affirmed', [], 'diff-2'),
      content('diff-2-current', CHUNKS, 'diff-2'),
    ];

    const list = await listEvidenceReviews();
    expect(list.owed).toBe(2);
    // BOTH entries are narrowed, so both loaders were asked for by both — and
    // both answered from the cache the second time.
    expect(list.reviews.every((r) => r.narrowed !== null)).toBe(true);
    expect(db.urlSnapshot.findMany).toHaveBeenCalledTimes(1);
    expect(db.urlVersionDiff.findMany).toHaveBeenCalledTimes(1);
  });

  it('PHASE 1 SELECTS NEITHER REGISTER: no chunks and no classification before anything is owed', async () => {
    store.evidenceRows = [diffRow()];
    await listEvidenceReviews();
    const select = db.evidence.findMany.mock.calls.at(0)?.at(0) as { select: Row } | undefined;
    const versionSelect = JSON.stringify(select?.select ?? {});
    expect(versionSelect).toContain('contentVersionHash');
    expect(versionSelect).not.toContain('chunks');
    expect(versionSelect).not.toContain('classification');
    // And the computed register IS read, for the owed row alone.
    expect(db.diffContentVersion.findMany).toHaveBeenCalledTimes(1);
  });

  it('a row that is NOT owed costs no content read at all', async () => {
    store.evidenceRows = [diffRow({ affirmedContentVersionHash: 'content-current' })];
    expect((await listEvidenceReviews()).owed).toBe(0);
    expect(db.diffContentVersion.findMany).not.toHaveBeenCalled();
  });
});


describe('list_evidence_reviews — the tool: GATED, and gated from memory', () => {
  const parse = (json: string): Row => JSON.parse(json) as Row;

  it('NO_RESEARCHER, AND NOTHING IS READ — the identity is answered before any query', async () => {
    // A4: "refuses nothing but NO_RESEARCHER". Answered from an AsyncLocalStorage,
    // so an anonymous call costs no round trip and learns nothing from the
    // difference between two refusals.
    mockResearcherId.mockReturnValue(null);
    expect(parse(await listEvidenceReviewsHandler())['code']).toBe('NO_RESEARCHER');
    expect(db.evidence.findMany).not.toHaveBeenCalled();
  });

  it('answers a researcher with the list — and REFUSES NOTHING ELSE', async () => {
    store.evidenceRows = [diffRow()];
    const answered = parse(await listEvidenceReviewsHandler());
    expect(answered['code']).toBeUndefined();
    expect(answered['owed']).toBe(1);
  });

  it('owed: 0 is an ANSWER, not a refusal — the count is the first field', async () => {
    store.evidenceRows = [];
    expect(parse(await listEvidenceReviewsHandler())).toEqual({
      owed: 0,
      reviews: [],
      notEvaluable: [],
    });
  });
});
