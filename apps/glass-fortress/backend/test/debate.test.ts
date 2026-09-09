import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// THE DEBATE ON A CITATION — evidence step 13, docs/gf-evidence-flows.md §4 and
// A4, docs/gf-thesis-flows.md T3.
//
// FIXTURES, AND THEY STAND IN FOR A STAGING EXERCISE THAT CANNOT HAPPEN. No act
// in this tree creates a Thesis, a ThesisVersion or a ThesisMention — the thesis
// writers are retired until thesis steps 19–20 — and staging's database, rebuilt
// at refactor step 9, holds none. So every `open_debate` against staging refuses
// NO_THESIS, and what proves this step is these cases: the plan's §6 instrument 3
// arrives at thesis step 21, the seam §9.4 already names.
//
// THE ASSESSOR IS MOCKED AT ITS BOUNDARY in every case below. It is the layer's
// one paid point, and no test spends a model call.
// ---------------------------------------------------------------------------

const assess = jest.fn();
jest.mock('../src/services/promotionAssessor', () => ({
  PromotionAssessor: class {
    assess = assess;
  },
}));

// The jsdom boundary (refactor plan §8): `debatePassage` reaches `extractText`
// dynamically so no consumer drags jsdom into a static graph; the cases still
// execute it, so it is mocked exactly as every other suite mocks jsdom away.
const extractText = jest.fn();
jest.mock('../src/services/thesisClaimAudit', () => ({ extractText }));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

interface Row {
  [key: string]: unknown;
}

/** Every write the handlers make, in order — what "ONE transaction" is checked against. */
let written: { model: string; op: string; data: Row }[] = [];
let transactions = 0;
let windows: unknown[] = [];

const store = {
  thesis: null as Row | null,
  mention: null as Row | null,
  version: null as Row | null,
  /** What `findUnique({ where: { id } })` answers — the session as it is read back. */
  session: null as Row | null,
  /** What `findUnique({ where: { openKey } })` answers — the OPEN one for the pair, or none. */
  openByKey: null as Row | null,
  evidence: null as Row | null,
  workList: null as Row | null,
  captures: [] as Row[],
  diffs: [] as Row[],
  collideOnCreate: null as Prisma.PrismaClientKnownRequestError | null,
};

const record = (model: string, op: string, data: Row): void => {
  written.push({ model, op, data });
};

/**
 * THE DEFAULTS, NAMED, BECAUSE `clearAllMocks` CLEARS CALLS AND NOT
 * IMPLEMENTATIONS.
 *
 * A `mockImplementation` set inside one case stands for every later one, which is
 * the cross-describe dependency `docs/gf-legacy-switch-2026-09-08.md` §5 records
 * this repository paying for once already: a value set in an earlier test held
 * for every test after it, and the failure surfaced only when the earlier group
 * was deleted. Two cases here override these, so both are re-established in
 * `corpus()` rather than left to Jest.
 */
const defaultSessionLookup = (args: { where: { id?: string; openKey?: string } }): Promise<Row | null> => {
  if (args.where.openKey !== undefined) return Promise.resolve(store.openByKey);
  if (store.session === null) return Promise.resolve(null);
  // The read-back reflects what was just WRITTEN: a double whose events were
  // frozen would let `priorTurns` look right while the handler passed the
  // assessor the wrong turns.
  const base = (store.session['events'] ?? []) as Row[];
  const appended = written
    .filter((w) => w.model === 'diffDebateEvent')
    .map((w) => ({ type: w.data['type'], content: w.data['content'], createdAt: new Date() }));
  return Promise.resolve({ ...store.session, events: [...base, ...appended] });
};

const defaultTransaction = async (fn: unknown, options?: unknown): Promise<unknown> => {
  transactions += 1;
  windows.push(options);
  return typeof fn === 'function' ? (fn as (tx: unknown) => Promise<unknown>)(db) : undefined;
};

const db = {
  thesis: { findUnique: jest.fn(() => Promise.resolve(store.thesis)) },
  thesisVersion: { findUnique: jest.fn(() => Promise.resolve(store.version)) },
  thesisMention: {
    findFirst: jest.fn(() => Promise.resolve(store.mention)),
    update: jest.fn((args: { data: Row }) => {
      record('thesisMention', 'update', args.data);
      return Promise.resolve({});
    }),
  },
  trackedUrl: {
    findUnique: jest.fn(() => Promise.resolve({ id: 'page-1', url: URL })),
    findMany: jest.fn(() => Promise.resolve([{ id: 'page-1', url: URL }])),
  },
  urlSnapshot: {
    findMany: jest.fn(() => Promise.resolve(store.captures)),
    findUnique: jest.fn(() => Promise.resolve({ text: 'the capture text' })),
  },
  urlVersionDiff: { findMany: jest.fn(() => Promise.resolve(store.diffs)) },
  cdxIndexEntry: { findFirst: jest.fn(() => Promise.resolve(store.workList)) },
  evidence: {
    findUnique: jest.fn(() => Promise.resolve(store.evidence)),
    create: jest.fn((args: { data: Row }) => {
      record('evidence', 'create', args.data);
      return Promise.resolve({
        id: 'ev-1',
        status: args.data['status'],
        affirmedContentVersionHash: args.data['affirmedContentVersionHash'],
      });
    }),
  },
  diffDebateSession: {
    // TWO LOOKUPS, ONE DELEGATE: `openOrRevise` asks by `openKey` (is there an
    // OPEN debate for this pair?) and `loadDebate` asks by `id`. A double that
    // answered both the same way would make the open path and the read-back move
    // together, which is exactly what they must not do.
    findUnique: jest.fn(defaultSessionLookup),
    create: jest.fn((args: { data: Row }) => {
      if (store.collideOnCreate !== null) return Promise.reject(store.collideOnCreate);
      record('diffDebateSession', 'create', args.data);
      return Promise.resolve({ id: 'session-1' });
    }),
    update: jest.fn((args: { data: Row }) => {
      record('diffDebateSession', 'update', args.data);
      return Promise.resolve({});
    }),
  },
  diffDebateEvent: {
    create: jest.fn((args: { data: Row }) => {
      record('diffDebateEvent', 'create', args.data);
      return Promise.resolve({});
    }),
    createMany: jest.fn((args: { data: Row[] }) => {
      for (const d of args.data) record('diffDebateEvent', 'create', d);
      return Promise.resolve({ count: args.data.length });
    }),
  },
  $transaction: jest.fn(defaultTransaction),
};

jest.mock('../src/lib/prisma', () => ({ prisma: db }));

import {
  AFTER,
  BEFORE,
  BETWEEN,
  CURRENT_VERSION,
  DIFF_NAME,
  DIFF_ROW,
  URL,
} from './helpers/corpusFixture';
import { openDebateHandler } from '../src/mcp/tools/openDebate';
import { respondInDebateHandler } from '../src/mcp/tools/respondInDebate';
import { promoteFromDebateHandler } from '../src/mcp/tools/promoteFromDebate';
import { getDebateHandler } from '../src/mcp/tools/getDebate';
import * as openDebateService from '../src/services/openDebate';
import { passagesCiting } from '../src/services/debatePassage';

const RESEARCHER = 'researcher-1';
const THESIS = 'thesis-1';
const PAIR = { url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp };

/** A TipTap body whose one paragraph carries the citation. */
const body = (paragraphs: string[]): Row => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

const parse = (json: string): Row => JSON.parse(json) as Row;
const events = (): Row[] => written.filter((w) => w.model === 'diffDebateEvent').map((w) => w.data);
const eventTypes = (): unknown[] => events().map((e) => e['type']);

/** The corpus every case starts from: one page, two captures, the pair, a citing head. */
function corpus(): void {
  written = [];
  transactions = 0;
  windows = [];
  store.thesis = { createdById: RESEARCHER, headVersionId: 'version-1' };
  store.version = { id: 'version-1', userContent: body([`the ministry said so #ev_${DIFF_NAME}`]) };
  store.mention = { id: 'mention-1', thesisVersionId: 'version-1', contentVersionHash: CURRENT_VERSION.contentVersionHash };
  // Nothing OPEN for the pair yet; the session exists to be read back after the
  // create, which is the order the handler actually runs in.
  store.openByKey = null;
  store.session = session();
  store.evidence = null;
  store.workList = null;
  store.captures = [BEFORE, AFTER];
  store.diffs = [DIFF_ROW];
  store.collideOnCreate = null;
  // Re-established, not assumed — see `defaultSessionLookup`.
  db.diffDebateSession.findUnique.mockImplementation(defaultSessionLookup);
  db.$transaction.mockImplementation(defaultTransaction);
  db.trackedUrl.findUnique.mockResolvedValue({ id: 'page-1', url: URL });
  mockResearcherId.mockReturnValue(RESEARCHER);
  // The one walker's contract, as this suite needs it: a paragraph node renders
  // to the text of its children. `extractText` itself is `thesisClaimAudit`'s and
  // is mocked away with jsdom.
  extractText.mockImplementation((node: unknown) => {
    const children = (node as { content?: unknown[] }).content ?? [];
    return children.map((c) => (c as { text?: string }).text ?? '').join(' ');
  });
  assess.mockResolvedValue({
    hasSubstance: true,
    substanceGaps: [],
    verdict: 'SUPPORTS',
    objection: '',
    assessment: 'הטיעון מעוגן בתוכן המחושב.',
  });
}

/** A loaded session, as `loadDebate` selects it. */
function session(over: Row = {}): Row {
  return {
    id: 'session-1',
    thesisId: THESIS,
    recordFileHash: DIFF_NAME,
    status: 'OPEN',
    hasSubstance: true,
    verdict: 'SUPPORTS',
    promotedOverObjection: false,
    evidenceId: null,
    recordSnapshotId: null,
    recordDiffId: 'diff-1',
    recordSnapshot: null,
    recordDiff: {
      trackedUrl: { url: URL },
      beforeSnapshot: { waybackTimestamp: BEFORE.waybackTimestamp },
      afterSnapshot: { waybackTimestamp: AFTER.waybackTimestamp },
    },
    evidence: null,
    thesis: { createdById: RESEARCHER, headVersionId: 'version-1' },
    events: [{ type: 'RATIONALE_SUBMITTED', content: 'the opening argument', createdAt: new Date() }],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  corpus();
});

const open = (over: Partial<{ thesisId: string; record: unknown; rationale: string }> = {}) =>
  openDebateHandler({
    thesisId: over.thesisId ?? THESIS,
    record: (over.record ?? PAIR) as never,
    rationale: over.rationale ?? 'the paragraph on adverse events was removed between these captures',
  });

describe('open_debate — the refusals, in the contract’s order', () => {
  it('NO_RESEARCHER first: a write here is attributed before anything is read', async () => {
    mockResearcherId.mockReturnValue(null);
    expect(parse(await open())['code']).toBe('NO_RESEARCHER');
    // Cheapest and most local first: nothing about the thesis or the corpus was read.
    expect(db.thesis.findUnique).not.toHaveBeenCalled();
    expect(db.trackedUrl.findUnique).not.toHaveBeenCalled();
  });

  it('NO_THESIS — promotion names the thesis it is made for, always', async () => {
    store.thesis = null;
    expect(parse(await open())['code']).toBe('NO_THESIS');
  });

  it('NOT_AUTHOR for a second researcher — a thesis has one author', async () => {
    mockResearcherId.mockReturnValue('someone-else');
    const refused = parse(await open());
    expect(refused['code']).toBe('NOT_AUTHOR');
    expect(String(refused['error'])).toContain('one author');
  });

  it('NOT_AUTHOR for a thesis whose author is NULL — nobody is its author', async () => {
    store.thesis = { createdById: null, headVersionId: 'version-1' };
    expect(parse(await open())['code']).toBe('NOT_AUTHOR');
  });

  it('REASON_REQUIRED before the corpus is touched — a blank rationale is no argument', async () => {
    expect(parse(await open({ rationale: '   ' }))['code']).toBe('REASON_REQUIRED');
    expect(db.trackedUrl.findUnique).not.toHaveBeenCalled();
  });

  it('NOT_SURVEYED — every operation refuses a page nobody surveyed', async () => {
    db.trackedUrl.findUnique.mockResolvedValueOnce(null as never);
    expect(parse(await open())['code']).toBe('NOT_SURVEYED');
  });

  it('NOT_A_CAPTURE for a DATE rather than a timestamp — never a guess', async () => {
    const refused = parse(await open({ record: { url: URL, capture: '2020-12-09' } }));
    expect(refused['code']).toBe('NOT_A_CAPTURE');
    expect(String(refused['error'])).toContain('14-digit');
  });

  it('NOT_A_CAPTURE, in get_diff_input’s own words, for a timestamp the work-list never held', async () => {
    store.captures = [];
    store.workList = null;
    const refused = parse(await open({ record: { url: URL, capture: '20991231235959' } }));
    expect(refused['code']).toBe('NOT_A_CAPTURE');
    // THE SHARED WORDING: one state must not acquire two sentences by being asked
    // from two files. This is `evidenceRefusals.notACapture`, the same function
    // the public read calls.
    expect(String(refused['error'])).toContain("is not on this page's work-list at all");
  });

  it('NOT_ACQUIRED names the work-list outcome — a SKIPPED capture does not speak', async () => {
    store.captures = [];
    store.workList = { status: 'SKIPPED' };
    const refused = parse(await open({ record: { url: URL, capture: BEFORE.waybackTimestamp } }));
    expect(refused['code']).toBe('NOT_ACQUIRED');
    expect(String(refused['error'])).toContain('SKIPPED');
  });

  it('NO_SUCH_DIFF — two real captures the walk never diffed as a pair', async () => {
    store.diffs = [];
    const refused = parse(await open());
    expect(refused['code']).toBe('NO_SUCH_DIFF');
    expect(String(refused['error'])).toContain('CONSECUTIVE');
  });

  it('NOT_CITED — PROVEN: the head version does not mention the record', async () => {
    // The citation comes first and the argument is made on it (§4). This is the
    // case the plan's step-13 line names by itself.
    store.mention = null;
    const refused = parse(await open());
    expect(refused['code']).toBe('NOT_CITED');
    expect(String(refused['error'])).toContain(`#ev_${DIFF_NAME}`);
    expect(db.diffDebateSession.create).not.toHaveBeenCalled();
    expect(assess).not.toHaveBeenCalled();
  });

  it('NOT_CITED when the thesis has no head version at all, and says so', async () => {
    store.thesis = { createdById: RESEARCHER, headVersionId: null };
    const refused = parse(await open());
    expect(refused['code']).toBe('NOT_CITED');
    expect(String(refused['error'])).toContain('no version yet');
  });

  it('AWAITING_DERIVATION NAMES THE PAIR — the walk owes a version', async () => {
    store.diffs = [{ ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, beforeTextHash: 'moved' }] }];
    const refused = parse(await open());
    expect(refused['code']).toBe('AWAITING_DERIVATION');
    expect(String(refused['error'])).toContain(`${BEFORE.waybackTimestamp} → ${AFTER.waybackTimestamp}`);
    // "Awaiting is not review": it must not read as a finding about the change.
    expect(String(refused['error'])).toContain('nothing has ');
  });

  it('CONTRADICTED CARRIES THE CHUNKS the documents refute', async () => {
    store.diffs = [
      {
        ...DIFF_ROW,
        contentVersions: [
          {
            ...CURRENT_VERSION,
            chunks: [{ side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'CONTRADICTED' }],
          },
        ],
      },
    ];
    const refused = parse(await open());
    expect(refused['code']).toBe('CONTRADICTED');
    expect(String(refused['error'])).toContain('הטקסט שהוסר');
  });

  it('NOTHING_TO_PROMOTE — a diff with no change is evidence of nothing', async () => {
    store.diffs = [{ ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, chunks: [] }] }];
    expect(parse(await open())['code']).toBe('NOTHING_TO_PROMOTE');
  });

  it('NARROWED NAMES THE INTERVENING CAPTURES a fresh citation takes instead', async () => {
    store.captures = [BEFORE, BETWEEN, AFTER];
    const refused = parse(await open());
    expect(refused['code']).toBe('NARROWED');
    expect(String(refused['error'])).toContain(BETWEEN.waybackTimestamp);
  });
});

describe('the refusal ORDER is part of the contract', () => {
  // Cheapest and most local first, and AUTHOR BEFORE CONTENT: a researcher who
  // may not write on this thesis is told that, and not that their rationale is
  // blank — the second would be the platform grading the work of someone it is
  // about to refuse anyway. The order is NO_RESEARCHER · NO_THESIS · NOT_AUTHOR ·
  // REASON_REQUIRED · the seven record checks.
  it('open_debate: a blank rationale from a NON-AUTHOR answers NOT_AUTHOR', async () => {
    mockResearcherId.mockReturnValue('someone-else');
    expect(parse(await open({ rationale: '  ' }))['code']).toBe('NOT_AUTHOR');
  });

  it('respond_in_debate: an ANONYMOUS call reads NOTHING before it refuses', async () => {
    store.session = session();
    mockResearcherId.mockReturnValue(null);
    const refused = parse(await respondInDebateHandler({ sessionId: 'session-1', response: 'x' }));
    expect(refused['code']).toBe('NO_RESEARCHER');
    // The identity is in memory and the session is a query: an anonymous caller
    // must not cost a round trip, and must not be able to probe which session ids
    // exist by timing or by error.
    expect(db.diffDebateSession.findUnique).not.toHaveBeenCalled();
  });

  it('promote_from_debate: an ANONYMOUS call reads NOTHING before it refuses', async () => {
    store.session = session();
    mockResearcherId.mockReturnValue(null);
    const refused = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(refused['code']).toBe('NO_RESEARCHER');
    expect(db.diffDebateSession.findUnique).not.toHaveBeenCalled();
  });
});

describe('open_debate — what it writes, and what it spends', () => {
  it('writes the session, its two events, and calls the assessor ONCE', async () => {
    const state = parse(await open());
    expect(eventTypes()).toEqual(['DEBATE_OPENED', 'RATIONALE_SUBMITTED', 'ASSESSMENT_RETURNED']);
    expect(assess).toHaveBeenCalledTimes(1);
    expect(state['sessionId']).toBe('session-1');
    expect(state['hasSubstance']).toBe(true);
  });

  it('THE PAID DRAW IS BETWEEN THE TRANSACTIONS, never inside one', async () => {
    // A model call inside a transaction holds a connection for the length of a
    // model call; the 2026-09-06 exercise found a seventeen-rule approval rolling
    // back under Prisma's five-second default.
    let insideWhenAssessed = false;
    let depth = 0;
    db.$transaction.mockImplementation(async (fn: unknown, options?: unknown) => {
      transactions += 1;
      windows.push(options);
      depth += 1;
      const out = typeof fn === 'function' ? await (fn as (tx: unknown) => Promise<unknown>)(db) : undefined;
      depth -= 1;
      return out;
    });
    assess.mockImplementation(() => {
      insideWhenAssessed = depth > 0;
      return Promise.resolve({ hasSubstance: true, substanceGaps: [], verdict: 'SUPPORTS', objection: '', assessment: '' });
    });
    await open();
    expect(insideWhenAssessed).toBe(false);
  });

  it('every transaction it opens carries the shared window', async () => {
    await open();
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) expect(w).toEqual({ maxWait: 10_000, timeout: 60_000 });
  });

  it('hands the assessor the COMPUTED content and the PASSAGE, and never the opinion', async () => {
    await open();
    const handed = assess.mock.calls[0]?.[0] as { content: Row; passages: string[] };
    expect(handed.passages).toEqual([`the ministry said so #ev_${DIFF_NAME}`]);
    expect(JSON.stringify(handed.content)).not.toContain('legalSignificance');
    expect(JSON.stringify(handed.content)).not.toContain('SAFETY_SIGNAL');
    // side and text only: survival is the CHECK's verdict about a chunk, and A1
    // keeps it out of the version's hash for the same reason.
    expect(JSON.stringify(handed.content)).not.toContain('SURVIVES');
  });

  it('REOPENING WITH A NEW RATIONALE IS A REVISION: one event, ONE session, one call', async () => {
    store.openByKey = { id: 'session-1' };
    await open({ rationale: 'a second, sharper argument' });
    expect(db.diffDebateSession.create).not.toHaveBeenCalled();
    const rationales = events().filter((e) => e['type'] === 'RATIONALE_SUBMITTED');
    expect(rationales).toHaveLength(1);
    expect(rationales[0]?.['content']).toBe('a second, sharper argument');
    // The accumulated argument: the earlier turn is a prior, the new one is the
    // argument — never handed over twice.
    const handed = assess.mock.calls[0]?.[0] as { rationale: string; priorTurns: string[] };
    expect(handed.rationale).toBe('a second, sharper argument');
    expect(handed.priorTurns.join(' ')).toContain('the opening argument');
  });

  it('TWO CONCURRENT OPENS: P2002 on openKey is the race, and it becomes a revision', async () => {
    store.collideOnCreate = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['openKey'] },
    });
    // Nothing OPEN when we looked; the winner's row is there when we re-read.
    let seen = 0;
    db.diffDebateSession.findUnique.mockImplementation((args: { where: { openKey?: string } }) => {
      if (args.where.openKey === undefined) return Promise.resolve(session());
      seen += 1;
      return Promise.resolve(seen === 1 ? null : { id: 'session-1' });
    });
    const state = parse(await open());
    expect(state['sessionId']).toBe('session-1');
    expect(events().filter((e) => e['type'] === 'RATIONALE_SUBMITTED')).toHaveLength(1);
  });

  it('a P2002 on ANOTHER constraint PROPAGATES — it is a different collision', async () => {
    // P2002 is *a* unique violation, not *this* one. `id` is unique, as is every
    // other constraint on the table, and swallowing another one's collision into
    // "someone else opened this debate" would be a wrong answer built out of a
    // right catch. (`evidenceId` is NOT an example any more: this step's
    // migration is what dropped its unique index.)
    store.collideOnCreate = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['id'] },
    });
    await expect(open()).rejects.toThrow('unique');
  });
});

describe('a stored chunk is whole, or the read of it is a walk defect', () => {
  it('a chunk missing its text THROWS, naming the pair — never a silent drop', async () => {
    // The `opinionOf` precedent, one register over: "a stored row that fails the
    // schema is a WALK DEFECT and THROWS, naming the diff — never null". A chunk
    // quietly dropped is worse than a half classification, because it changes the
    // ANSWER: a CONTRADICTED chunk with a malformed text would vanish, the
    // refusal would not fire, NOTHING_TO_PROMOTE could fire on a diff that has
    // chunks, and the assessor would be handed partial content as if it were all
    // of it.
    store.diffs = [
      {
        ...DIFF_ROW,
        contentVersions: [
          {
            ...CURRENT_VERSION,
            chunks: [
              { side: 'REMOVED', text: 'הטקסט שהוסר', survival: 'SURVIVES' },
              { side: 'REMOVED', survival: 'CONTRADICTED' },
            ],
          },
        ],
      },
    ];
    await expect(open()).rejects.toThrow(
      new RegExp(`${BEFORE.waybackTimestamp} → ${AFTER.waybackTimestamp}`),
    );
  });

  it('and a chunk missing its survival verdict throws too — the writer writes it', async () => {
    store.diffs = [
      {
        ...DIFF_ROW,
        contentVersions: [{ ...CURRENT_VERSION, chunks: [{ side: 'ADDED', text: 'הטקסט שנוסף' }] }],
      },
    ];
    await expect(open()).rejects.toThrow(/Walk defect: .*HALF chunk at index 0/);
  });
});

describe('the PASSAGE — the paragraph that cites, never the whole thesis', () => {
  it('is taken PER NODE, before extractText collapses the document to one line', async () => {
    const version = {
      id: 'version-1',
      userContent: body(['an unrelated paragraph', `the ministry said so #ev_${DIFF_NAME}`]),
    };
    expect(await passagesCiting(version, DIFF_NAME)).toEqual([`the ministry said so #ev_${DIFF_NAME}`]);
  });

  it('CITED IN TWO PARAGRAPHS: both are handed over, in document order', async () => {
    // A thesis that cites one record in two places says two things with it, and
    // the assessor is asked whether the record supports what the thesis says.
    const version = {
      id: 'version-1',
      userContent: body([`first #ev_${DIFF_NAME}`, 'unrelated', `second #ev_${DIFF_NAME}`]),
    };
    expect(await passagesCiting(version, DIFF_NAME)).toEqual([
      `first #ev_${DIFF_NAME}`,
      `second #ev_${DIFF_NAME}`,
    ]);
  });

  it('THROWS when the mention says CITED and no paragraph carries the token', async () => {
    // Under the target the mentions are parsed FROM the text, so the two cannot
    // disagree; a disagreement is a malformed version, not an answerable state.
    await expect(passagesCiting({ id: 'version-1', userContent: body(['nothing here']) }, DIFF_NAME))
      .rejects.toThrow('malformed version');
  });
});

describe('respond_in_debate', () => {
  beforeEach(() => {
    store.session = session();
  });

  it('records the response and re-assesses the ACCUMULATED argument', async () => {
    await respondInDebateHandler({ sessionId: 'session-1', response: 'the objection is answered thus' });
    expect(eventTypes()).toEqual(['RESPONSE_SUBMITTED', 'ASSESSMENT_RETURNED']);
    const handed = assess.mock.calls[0]?.[0] as { priorTurns: string[] };
    expect(handed.priorTurns.join(' ')).toContain('the opening argument');
  });

  it('RE-RUNS THE RECORD CHECKS and refuses with the record’s own code, writing nothing', async () => {
    // Beyond A4's two codes, and deliberately: the assessor is handed the
    // record's CURRENT computed content, so the record's checks are a
    // PRECONDITION OF THE PAID CALL. A re-walk can supersede an endpoint's text
    // between two rounds; assessing against a version that no longer exists
    // would spend money to judge an argument about nothing.
    store.diffs = [{ ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, beforeTextHash: 'moved' }] }];
    const refused = parse(await respondInDebateHandler({ sessionId: 'session-1', response: 'my answer' }));
    expect(refused['code']).toBe('AWAITING_DERIVATION');
    // AND THE RESPONSE IS NOT RECORDED: a turn written against a version the
    // assessor never read would be a turn the debate cannot account for.
    expect(eventTypes()).toEqual([]);
    expect(assess).not.toHaveBeenCalled();
  });

  it('SESSION_NOT_FOUND, NOT_AUTHOR, REASON_REQUIRED and SESSION_CLOSED', async () => {
    store.session = null;
    expect(parse(await respondInDebateHandler({ sessionId: 'nope', response: 'x' }))['code']).toBe('SESSION_NOT_FOUND');

    store.session = session();
    mockResearcherId.mockReturnValue('someone-else');
    expect(parse(await respondInDebateHandler({ sessionId: 'session-1', response: 'x' }))['code']).toBe('NOT_AUTHOR');

    mockResearcherId.mockReturnValue(RESEARCHER);
    expect(parse(await respondInDebateHandler({ sessionId: 'session-1', response: ' ' }))['code']).toBe('REASON_REQUIRED');

    store.session = session({ status: 'PROMOTED' });
    expect(parse(await respondInDebateHandler({ sessionId: 'session-1', response: 'x' }))['code']).toBe('SESSION_CLOSED');
  });
});

describe('promote_from_debate — one transaction, three rows, nothing on chain', () => {
  beforeEach(() => {
    store.session = session();
  });

  it('writes the Evidence row with status STATED, the debate closed, and the mention’s argument', async () => {
    const promoted = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));

    const evidence = written.find((w) => w.model === 'evidence');
    expect(evidence?.data['status']).toBe('PROMOTED');
    expect(evidence?.data['kind']).toBe('DIFF');
    expect(evidence?.data['urlVersionDiffId']).toBe('diff-1');
    expect(evidence?.data['snapshotId']).toBeNull();
    expect(evidence?.data['affirmedContentVersionHash']).toBe(CURRENT_VERSION.contentVersionHash);
    expect(evidence?.data['promotedById']).toBe(RESEARCHER);

    const close = written.filter((w) => w.model === 'diffDebateSession' && w.op === 'update');
    expect(close).toHaveLength(1); // ONE update per promotion
    expect(close[0]?.data['status']).toBe('PROMOTED');
    expect(close[0]?.data['evidenceId']).toBe('ev-1');
    expect(close[0]?.data['openKey']).toBeNull(); // closing NULLS the key

    expect(written.find((w) => w.model === 'thesisMention')?.data['debateSessionId']).toBe('session-1');
    expect(promoted['created']).toBe(true);
    expect(promoted['fileHash']).toBe(DIFF_NAME);
  });

  it('all of it in ONE transaction, under the shared window', async () => {
    await promoteFromDebateHandler({ sessionId: 'session-1' });
    expect(transactions).toBe(1);
    expect(windows).toEqual([{ maxWait: 10_000, timeout: 60_000 }]);
  });

  it('NOTHING ON CHAIN — every write it makes is to one of three tables', async () => {
    // §5: "No research act writes to the chain." The IMPORT is held by
    // test/evidence/scans.test.ts, which strips comments; this holds the
    // BEHAVIOUR, as a property over what the promotion actually wrote — so a
    // chain call reached through any path at all would have to show up as a
    // fourth kind of write or as a call this double never provided.
    await promoteFromDebateHandler({ sessionId: 'session-1' });
    expect([...new Set(written.map((w) => w.model))].sort()).toEqual([
      'diffDebateEvent',
      'diffDebateSession',
      'evidence',
      'thesisMention',
    ]);
  });

  it('JOINS an existing row rather than creating a second — created: false', async () => {
    store.evidence = { id: 'ev-1', status: 'PROMOTED', affirmedContentVersionHash: CURRENT_VERSION.contentVersionHash };
    const promoted = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(db.evidence.create).not.toHaveBeenCalled();
    expect(promoted['created']).toBe(false);
    // The debate still closes onto the row it joined — what the dropped unique
    // index on `evidenceId` made expressible.
    expect(written.find((w) => w.model === 'diffDebateSession')?.data['evidenceId']).toBe('ev-1');
  });

  it('JOINS a WITHDRAWN row and returns WITHDRAWN — nothing moves it back', async () => {
    store.evidence = { id: 'ev-1', status: 'WITHDRAWN', affirmedContentVersionHash: 'older' };
    const promoted = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(promoted['status']).toBe('WITHDRAWN');
    expect(promoted['created']).toBe(false);
  });

  it('promotedOverObjection from a DISPUTES verdict, once the objection is answered', async () => {
    store.session = session({
      verdict: 'DISPUTES',
      events: [
        { type: 'RATIONALE_SUBMITTED', content: 'the opening argument', createdAt: new Date() },
        { type: 'RESPONSE_SUBMITTED', content: 'answered', createdAt: new Date() },
      ],
    });
    const promoted = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(promoted['promotedOverObjection']).toBe(true);
  });

  it('NOT_READY with OBJECTION_UNANSWERED while a DISPUTES has no response', async () => {
    store.session = session({ verdict: 'DISPUTES' });
    const refused = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(refused['code']).toBe('NOT_READY');
    expect(String(refused['error'])).toContain('OBJECTION_UNANSWERED');
  });

  it('NOT_READY with NO_SUBSTANCE while the assessor could not check the argument', async () => {
    store.session = session({ hasSubstance: false, verdict: null });
    const refused = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(refused['code']).toBe('NOT_READY');
    expect(String(refused['error'])).toContain('NO_SUBSTANCE');
  });

  it('SESSION_CLOSED on a debate that already promoted', async () => {
    store.session = session({ status: 'PROMOTED' });
    expect(parse(await promoteFromDebateHandler({ sessionId: 'session-1' }))['code']).toBe('SESSION_CLOSED');
  });

  it('STALE_PIN when the head’s citation pins a version that is not CURRENT', async () => {
    store.mention = { id: 'mention-1', thesisVersionId: 'version-1', contentVersionHash: 'content-older' };
    const refused = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(refused['code']).toBe('STALE_PIN');
    expect(String(refused['error'])).toContain('re-pins');
  });

  it('RE-CHECKS THE RECORD NOW: a diff contradicted since the argument keeps its own code', async () => {
    store.diffs = [
      {
        ...DIFF_ROW,
        contentVersions: [
          { ...CURRENT_VERSION, chunks: [{ side: 'REMOVED', text: 'x', survival: 'CONTRADICTED' }] },
        ],
      },
    ];
    expect(parse(await promoteFromDebateHandler({ sessionId: 'session-1' }))['code']).toBe('CONTRADICTED');
  });
});

describe('get_debate — GATED, and not by authorship', () => {
  beforeEach(() => {
    store.session = session();
  });

  it('answers ANY researcher, including one who is not the author', async () => {
    mockResearcherId.mockReturnValue('a-colleague');
    const state = parse(await getDebateHandler({ sessionId: 'session-1' }));
    expect(state['sessionId']).toBe('session-1');
    expect(state['code']).toBeUndefined();
  });

  it('refuses NO_RESEARCHER and SESSION_NOT_FOUND, and writes nothing', async () => {
    mockResearcherId.mockReturnValue(null);
    expect(parse(await getDebateHandler({ sessionId: 'session-1' }))['code']).toBe('NO_RESEARCHER');
    mockResearcherId.mockReturnValue(RESEARCHER);
    store.session = null;
    expect(parse(await getDebateHandler({ sessionId: 'nope' }))['code']).toBe('SESSION_NOT_FOUND');
    expect(written).toEqual([]);
    expect(assess).not.toHaveBeenCalled();
  });

  it('canPromote and blockedBy come from the SAME function the promotion refuses on', async () => {
    store.session = session({ hasSubstance: false, verdict: null });
    const state = parse(await getDebateHandler({ sessionId: 'session-1' }));
    expect(state['canPromote']).toBe(false);
    expect(state['blockedBy']).toEqual(['NO_SUBSTANCE']);
    const refused = parse(await promoteFromDebateHandler({ sessionId: 'session-1' }));
    expect(String(refused['error'])).toContain('NO_SUBSTANCE');
  });
});

describe('recordChecks is ONE function, and both tools go through it', () => {
  it('stubbing it to a refusal turns cases red in BOTH tools’ paths', async () => {
    // A shared function only one caller actually reaches is shared in name. This
    // is the case that says the sharing is real.
    const stub = jest
      .spyOn(openDebateService, 'recordChecks')
      .mockResolvedValue({ error: 'stubbed', code: 'NARROWED' });

    expect(parse(await open())['code']).toBe('NARROWED');

    store.session = session();
    expect(parse(await promoteFromDebateHandler({ sessionId: 'session-1' }))['code']).toBe('NARROWED');

    expect(stub).toHaveBeenCalledTimes(2);
    stub.mockRestore();
  });
});
