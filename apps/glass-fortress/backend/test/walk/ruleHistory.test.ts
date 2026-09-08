jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findMany: jest.fn(), update: jest.fn() },
    urlSnapshot: { findUnique: jest.fn() },
    rule: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    ruleMatch: { findMany: jest.fn() },
    pageDecision: { findMany: jest.fn(), create: jest.fn() },
  },
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

// THE JSDOM BOUNDARY, the house pattern: `chromeRulesetApply` is ESM-only and
// every suite that reaches it stubs the module (markingRoutes does the same).
// The stub is a real derivation over a fixed document — it applies the ruleset
// it is GIVEN, so the case that proves this read derives under the capture's
// own ruleset is a real assertion and not a tautology.
const mockDerive = jest.fn();
jest.mock('../../src/lib/chromeRulesetApply', () => ({ deriveTextUnderRuleset: mockDerive }));

import { prisma } from '../../src/lib/prisma';
import { getRuleHistoryHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, T4, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// get_rule_history({ url, ruleId }) — A5, amended 2026-09-07, a READ, GATED.
//
//   returns { rule: { ruleId, selector, validFrom, validTo, trusted, createdAt,
//                     createdById, decisions: [{ type, waybackTimestamp,
//                     researcherId, createdAt }] },
//             matches: [{ capture, outcome, matchedNodes,
//                         removed: [text…] | null, removedCount: n | null }] }
//
// WHAT IT IS FOR. Judgement moved to the chat on 2026-09-07, after a researcher
// was asked to trust a rule on a page that could tell them nothing about it. A
// rule's history is the thing a human needs to answer "is this element
// furniture whatever it contains" — created against which capture, matched
// since, trusted or not, and WHAT IT ACTUALLY REMOVED, in the page's own words.
// This read is that history, and Flow 2's per-rule script is what reads it.
//
// IT DECIDES NOTHING. No verdict, no threshold, no ordering by an opinion: a
// series and its texts, in timestamp order, and the caller says what it shows.
//
// REMOVED IS RE-DERIVED, UNDER THAT DATE'S RULESET AND NOT TODAY'S. A rule's
// removals on a 2020 capture are what the 2020 ruleset produced; deriving them
// under today's would show the researcher text a later rule takes, attributed
// to this one. The bytes come from `bytesOf`, the one implementation the
// marking route also reads, and only ACQUIRED and PENDING_JUDGEMENT rows hold
// any: DUPLICATE and IDENTICAL keep no body by the 2026-09-02 ruling, and null
// is that fact rather than an empty list, which would read as "removed
// nothing".
//
// RED until the module exists.
// ---------------------------------------------------------------------------

const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const DOC = Buffer.from('<html><body><p>article</p><div class="ticker">ticker item</div></body></html>');

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const rowsFind = delegate('cdxIndexEntry')['findMany'] as Mock;
const snapshotFind = delegate('urlSnapshot')['findUnique'] as Mock;
const ruleFind = delegate('rule')['findUnique'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const matchesFind = delegate('ruleMatch')['findMany'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const WRITES = [
  delegate('trackedUrl')['update'] as Mock,
  delegate('cdxIndexEntry')['update'] as Mock,
  delegate('rule')['create'] as Mock,
  delegate('rule')['update'] as Mock,
  delegate('pageDecision')['create'] as Mock,
];

// r1 is created at T09 and trusted at T2; rLater is created at T2, so it must
// not appear in T09's derivation. rPre is created before a RESET.
const rPre = rule('r-pre', '.pre', T09, 'd1');
const r1 = rule('r1', '.ticker', T09, 'd3');
const rLater = rule('r-later', 'p', T2, 'd5');
const RULES = [rPre, r1, rLater];
const LOG = log(RULES, [
  D.corrected(T09),
  D.reset(),
  D.corrected(T09),
  D.accepted(T09),
  D.corrected(T2),
  D.trusted('r1', T2),
  D.accepted(T2),
]).map((d, i) => ({ ...d, researcherId: 'researcher-1', createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, i)) }));
// `researcherId` and `createdAt` are stamped here rather than in the shared
// fixture: A2 makes both REQUIRED on every decision row, and this read returns
// them, so the fixture has to carry what the column does.

const ROWS = [
  { id: `row-${T09}`, waybackTimestamp: T09, digest: 'A', status: 'ACQUIRED', comparedTo: null, rulesetId: null, snapshotId: 'snap-09', heldBody: null, contentType: 'text/html', contentEncoding: null, stop: null },
  { id: `row-${T14}`, waybackTimestamp: T14, digest: 'B', status: 'DUPLICATE', comparedTo: T09, rulesetId: null, snapshotId: null, heldBody: null, contentType: null, contentEncoding: null, stop: null },
  { id: `row-${T2}`, waybackTimestamp: T2, digest: 'C', status: 'PENDING_JUDGEMENT', comparedTo: null, rulesetId: null, snapshotId: null, heldBody: DOC, contentType: 'text/html', contentEncoding: null, stop: null },
  { id: `row-${T3}`, waybackTimestamp: T3, digest: 'C', status: 'IDENTICAL', comparedTo: T2, rulesetId: null, snapshotId: null, heldBody: null, contentType: null, contentEncoding: null, stop: null },
  { id: `row-${T4}`, waybackTimestamp: T4, digest: 'D', status: 'UNFETCHED', comparedTo: null, rulesetId: null, snapshotId: null, heldBody: null, contentType: null, contentEncoding: null, stop: null },
];

const MATCHES = [
  { ruleId: 'r1', waybackTimestamp: T2, matchedNodes: 0 },
  { ruleId: 'r1', waybackTimestamp: T09, matchedNodes: 2 },
  { ruleId: 'r1', waybackTimestamp: T14, matchedNodes: 1 },
  { ruleId: 'r1', waybackTimestamp: T3, matchedNodes: 1 },
];

async function history(input: { url?: string; ruleId?: string; maxCaptures?: number } = {}): Promise<Record<string, unknown>> {
  return JSON.parse(
    await getRuleHistoryHandler({ url: input.url ?? URL, ruleId: input.ruleId ?? 'r1', maxCaptures: input.maxCaptures }),
  ) as Record<string, unknown>;
}

const matchesOf = (result: Record<string, unknown>): Record<string, unknown>[] =>
  result['matches'] as Record<string, unknown>[];

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue('researcher-1');
  trackedFind.mockResolvedValue({ id: TRACKED, url: URL });
  ruleFind.mockResolvedValue({ ...r1, trackedUrlId: TRACKED, createdAt: new Date(Date.UTC(2026, 8, 1)) });
  rulesFind.mockResolvedValue(RULES);
  decisionsFind.mockResolvedValue(LOG);
  rowsFind.mockResolvedValue(ROWS);
  matchesFind.mockResolvedValue(MATCHES);
  snapshotFind.mockResolvedValue({ id: 'snap-09', document: DOC, documentContentType: 'text/html', documentContentEncoding: null });
  // Removes what the GIVEN ruleset names: `.ticker` takes the ticker item, `p`
  // takes the article paragraph. So a derivation under the wrong date's ruleset
  // would show `article` under a rule that never took it.
  mockDerive.mockImplementation((_bytes: Buffer, _type: unknown, _enc: unknown, ruleset: { selectors: string[] }) => ({
    text: 'article',
    textHash: 'hash',
    textExtractionVersion: 'v2-fixture-extractor',
    chrome: {
      html: '<html/>',
      removedText: '',
      removedSegments: [
        ...(ruleset.selectors.includes('.ticker') ? [{ selector: '.ticker', text: 'ticker item' }] : []),
        ...(ruleset.selectors.includes('.menu') ? [{ selector: '.menu', text: 'home\nnews\nsport' }] : []),
        ...(ruleset.selectors.includes('p') ? [{ selector: 'p', text: 'article' }] : []),
      ],
      matchCounts: {},
      invalidSelectors: [],
    },
  }));
});

describe('get_rule_history — refusals', () => {
  it('refuses NOT_SURVEYED for a url with no TrackedUrl', async () => {
    trackedFind.mockResolvedValue(null);
    expect(await history()).toEqual(expect.objectContaining({ code: 'NOT_SURVEYED' }));
  });

  it('refuses NO_SUCH_RULE for a rule id the page does not have', async () => {
    ruleFind.mockResolvedValue(null);
    expect(await history({ ruleId: 'nope' })).toEqual(expect.objectContaining({ code: 'NO_SUCH_RULE' }));
  });

  it('refuses NO_SUCH_RULE for a rule belonging to ANOTHER page', async () => {
    ruleFind.mockResolvedValue({ ...r1, trackedUrlId: 'another-page', createdAt: new Date() });
    expect(await history()).toEqual(expect.objectContaining({ code: 'NO_SUCH_RULE' }));
  });

  it('answers without a researcher in context — the gate is the route’s', async () => {
    mockResearcherId.mockReturnValue(null);
    expect(await history()).toEqual(expect.objectContaining({ rule: expect.any(Object) }));
  });

  it('writes nothing', async () => {
    await history();
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('get_rule_history — the rule and its decisions', () => {
  it('returns the rule with its dates, its trust folded from the log, and its author', async () => {
    const result = await history();
    expect(result['rule']).toEqual(
      expect.objectContaining({ ruleId: 'r1', selector: '.ticker', validFrom: T09, validTo: null, trusted: true }),
    );
  });

  it('lists only THIS rule’s decisions, in sequence order, each with its type, capture, researcher and time', async () => {
    const rule = history().then((r) => r['rule'] as Record<string, unknown>);
    const decisions = (await rule)['decisions'] as Record<string, unknown>[];
    expect(decisions).toEqual([
      expect.objectContaining({ type: 'RULE_TRUSTED', waybackTimestamp: T2, researcherId: expect.any(String) }),
    ]);
  });

  it('respects AUTHORITY: a rule whose creating decision is pre-RESET reads as untrusted and lists no pre-RESET decision', async () => {
    ruleFind.mockResolvedValue({ ...rPre, trackedUrlId: TRACKED, createdAt: new Date() });
    const result = await history({ ruleId: 'r-pre' });
    expect((result['rule'] as Record<string, unknown>)['trusted']).toBe(false);
    expect((result['rule'] as Record<string, unknown>)['decisions']).toEqual([]);
  });
});

describe('get_rule_history — the match series', () => {
  it('joins every RuleMatch to its row’s outcome, in TIMESTAMP order', async () => {
    const matches = matchesOf(await history());
    expect(matches.map((m) => [m['capture'], m['outcome']])).toEqual([
      [T09, 'ACQUIRED'],
      [T14, 'DUPLICATE'],
      [T2, 'PENDING_JUDGEMENT'],
      [T3, 'IDENTICAL'],
    ]);
  });

  it('carries matchedNodes as observed', async () => {
    const matches = matchesOf(await history());
    expect(matches.map((m) => m['matchedNodes'])).toEqual([2, 1, 0, 1]);
  });

  it('re-derives removed for an ACQUIRED row from its snapshot', async () => {
    const first = matchesOf(await history()).at(0);
    expect(first?.['removed']).toEqual(['ticker item']);
    expect(first?.['removedCount']).toBe(1);
  });

  it('re-derives removed for a PENDING_JUDGEMENT row from its held body', async () => {
    const pending = matchesOf(await history()).find((m) => m['capture'] === T2);
    expect(pending?.['removed']).toEqual(['ticker item']);
  });

  it('derives under the ruleset in force for THAT capture, not today’s: a later rule takes nothing from an earlier capture', async () => {
    // `rLater` (selector `p`) is created at T2. Asked about it, T09 is not in
    // its series at all; asked about r1, T09's removal is the ticker only —
    // never the paragraph a 2026 rule removes.
    const first = matchesOf(await history()).at(0);
    expect(first?.['removed']).not.toContain('article');
  });

  it('removed and removedCount are NULL where no body is held — DUPLICATE, IDENTICAL', async () => {
    const matches = matchesOf(await history());
    for (const capture of [T14, T3]) {
      const entry = matches.find((m) => m['capture'] === capture);
      expect(entry).toEqual(expect.objectContaining({ removed: null, removedCount: null }));
    }
  });

  it('maxCaptures keeps the LATEST n and still answers in timestamp order', async () => {
    const matches = matchesOf(await history({ maxCaptures: 2 }));
    expect(matches.map((m) => m['capture'])).toEqual([T2, T3]);
  });

  it('a row that claims bytes it does not hold is a walk defect and THROWS, never a refusal', async () => {
    rowsFind.mockResolvedValue([{ ...ROWS[0], snapshotId: null }]);
    matchesFind.mockResolvedValue([{ ruleId: 'r1', waybackTimestamp: T09, matchedNodes: 2 }]);
    await expect(history()).rejects.toThrow(/Walk defect/);
  });
});

// A5, amended 2026-09-08: `removed` is the LINES a rule took, not one text per
// matched element. Read from the live run — a header's single "text" ran to 150
// lines, so the first-5 rule the script states could not be applied to it, and
// Gate 4's material is per SEGMENT (A4: "∃ segment s ∈ removed(c)"), which this
// read must agree with or the two disagree about what a rule removed.
describe('get_rule_history — removed is segments, at Gate 4’s granularity (amended 2026-09-08)', () => {
  const menu = rule('r-menu', '.menu', T09, 'd3');

  beforeEach(() => {
    ruleFind.mockResolvedValue({ ...menu, trackedUrlId: TRACKED, createdAt: new Date(Date.UTC(2026, 8, 1)) });
    rulesFind.mockResolvedValue([...RULES, menu]);
    matchesFind.mockResolvedValue([{ ruleId: 'r-menu', waybackTimestamp: T09, matchedNodes: 1 }]);
  });

  it('an element whose removed text is three lines yields three entries, and removedCount counts them', async () => {
    const first = matchesOf(await history({ ruleId: 'r-menu' })).at(0);
    expect(first?.['removed']).toEqual(['home', 'news', 'sport']);
    expect(first?.['removedCount']).toBe(3);
  });

  it('de-duplicates within a capture — one line repeated across matched elements is one entry', async () => {
    mockDerive.mockImplementation(() => ({
      text: 'article',
      textHash: 'hash',
      textExtractionVersion: 'v2-fixture-extractor',
      chrome: {
        html: '<html/>',
        removedText: '',
        removedSegments: [
          { selector: '.menu', text: 'home\nnews' },
          { selector: '.menu', text: 'news\nsport' },
        ],
        matchCounts: {},
        invalidSelectors: [],
      },
    }));
    expect(matchesOf(await history({ ruleId: 'r-menu' })).at(0)?.['removed']).toEqual(['home', 'news', 'sport']);
  });

  it('blank and punctuation-only lines are dropped, as the gates drop them', async () => {
    mockDerive.mockImplementation(() => ({
      text: 'article',
      textHash: 'hash',
      textExtractionVersion: 'v2-fixture-extractor',
      chrome: {
        html: '<html/>',
        removedText: '',
        removedSegments: [{ selector: '.menu', text: 'home\n\n  \n•\nnews' }],
        matchCounts: {},
        invalidSelectors: [],
      },
    }));
    expect(matchesOf(await history({ ruleId: 'r-menu' })).at(0)?.['removed']).toEqual(['home', 'news']);
  });
});
