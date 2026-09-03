jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findMany: jest.fn(), update: jest.fn() },
    rule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    ruleMatch: { findMany: jest.fn() },
    pageDecision: { findMany: jest.fn(), create: jest.fn() },
  },
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

import { prisma } from '../../src/lib/prisma';
import { rulesetId } from '../../src/walk/derivations';
import { getArticleRulesHandler, listCapturesHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, T4, EMPTY_ID, OUTCOMES, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// get_article_rules and list_captures — A5's two reads.
//
//   get_article_rules({ url })
//     returns { rules: [{ ruleId, selector, validFrom, validTo, trusted, lastMatched }],
//               pendingStop: as scan_captures.stop | null,
//               counts: outcomes by kind, stale: n, decisions: n, lastDecisionAt }
//   list_captures({ url, outcome? })
//     returns [{ capture, snapshotDate, outcome, digest, comparedTo, rulesetId,
//                snapshotId, stale, stopGates }]
//
// THREE READINGS, ruled 2026-09-03. `rules` lists the rules under AUTHORITY,
// in force or ended — validTo says which — and not one RULE_RETIRED under it,
// nor one created before a RESET. `decisions` counts every decision on the
// page, since nothing is deleted. `stopGates` replaces A5's `stopGate` now
// that the row carries `stop: { gates }`: the gate labels of a pending stop,
// or null.
//
// CLASSIFICATION, so step 8 does not guess it: both reads are GATED in
// WRITE_TOOLS, by the existing precedent that a researcher's working state is
// not published evidence. The gate is the ROUTE's. The handlers themselves
// answer without an identity, which is what this file asserts.
//
// Neither read writes anything; neither runs a transaction. Both compose the
// REAL derivations — stale, trusted — over the rows and log the mocks return.
//
// RED until step 3 builds `src/walk/tools`.
// ---------------------------------------------------------------------------

const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const ABC = Buffer.from('<html>abc</html>');

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const trackedUpdate = delegate('trackedUrl')['update'] as Mock;
const rowsFind = delegate('cdxIndexEntry')['findMany'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const ruleCreate = delegate('rule')['create'] as Mock;
const ruleUpdate = delegate('rule')['update'] as Mock;
const matchesFind = delegate('ruleMatch')['findMany'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const decisionCreate = delegate('pageDecision')['create'] as Mock;

const WRITES = [trackedUpdate, rowUpdate, ruleCreate, ruleUpdate, decisionCreate];

// The page: one rule created before a RESET; after it, r1 in force and trusted,
// r2 ended at T3, r3 retired.
const rPre = rule('r-pre', '.pre', T09, 'd1');
const r1 = rule('r1', '.ticker', T09, 'd3');
const r2 = rule('r2', '.share', T2, 'd5', T3);
const r3 = rule('r3', '.old', T09, 'd3');
const RULES = [rPre, r1, r2, r3];
const LOG = log(RULES, [
  D.corrected(T09),
  D.reset(),
  D.corrected(T09),
  D.accepted(T09),
  D.corrected(T2),
  D.trusted('r1', T2),
  D.ended('r2', T3),
  D.retired('r3', T2),
  D.accepted(T2),
]).map((d, i) => ({ ...d, createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, i)) }));

const STOP = { gates: [{ gate: 4, material: { removals: [{ text: 'never seen', ruleId: 'r1', selector: '.ticker' }] } }] };

/** Rows out of timestamp order on purpose; the reads must sort. */
const ROWS = [
  { id: `row-${T2}`, waybackTimestamp: T2, digest: 'C', status: 'PENDING_JUDGEMENT', comparedTo: null, rulesetId: null, snapshotId: null, heldBody: ABC, stop: STOP },
  { id: `row-${T09}`, waybackTimestamp: T09, digest: 'A', status: 'ACQUIRED', comparedTo: null, rulesetId: rulesetId(['.ticker']), snapshotId: 'snap-09', heldBody: null, stop: null, textExtractionVersion: 'v2-fixture-extractor' },
  { id: `row-${T14}`, waybackTimestamp: T14, digest: 'B', status: 'ACQUIRED', comparedTo: null, rulesetId: EMPTY_ID, snapshotId: 'snap-14', heldBody: null, stop: null, textExtractionVersion: 'v2-fixture-extractor' },
  { id: `row-${T3}`, waybackTimestamp: T3, digest: 'C', status: 'IDENTICAL', comparedTo: T2, rulesetId: null, snapshotId: null, heldBody: null, stop: null },
  { id: `row-${T4}`, waybackTimestamp: T4, digest: 'D', status: 'UNFETCHED', comparedTo: null, rulesetId: null, snapshotId: null, heldBody: null, stop: null },
];

const MATCHES = [
  { ruleId: 'r1', waybackTimestamp: T09, matchedNodes: 2 },
  { ruleId: 'r1', waybackTimestamp: T2, matchedNodes: 0 },
  { ruleId: 'r2', waybackTimestamp: T2, matchedNodes: 1 },
];

async function getRules(): Promise<Record<string, unknown>> {
  return JSON.parse(await getArticleRulesHandler({ url: URL })) as Record<string, unknown>;
}
async function list(outcome?: string): Promise<unknown> {
  return JSON.parse(await listCapturesHandler(outcome === undefined ? { url: URL } : { url: URL, outcome })) as unknown;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(null);
  trackedFind.mockResolvedValue({ id: TRACKED, url: URL });
  rowsFind.mockResolvedValue(ROWS);
  rulesFind.mockResolvedValue(RULES);
  matchesFind.mockResolvedValue(MATCHES);
  decisionsFind.mockResolvedValue(LOG);
});

describe('the two reads — surface', () => {
  it('both refuse NOT_SURVEYED', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(getRules()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
    await expect(list()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
  });

  it('both answer with no researcher in context — the gate is the route’s, not the handler’s', async () => {
    expect((await getRules())['code']).toBeUndefined();
    expect(Array.isArray(await list())).toBe(true);
  });

  it('neither writes anything', async () => {
    await getRules();
    await list();
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('get_article_rules', () => {
  it('lists the rules under AUTHORITY, ended ones with their validTo; retired and pre-RESET rules absent', async () => {
    const result = await getRules();
    const listed = [...(result['rules'] as { ruleId: string }[])].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    expect(listed).toEqual([
      { ruleId: 'r1', selector: '.ticker', validFrom: T09, validTo: null, trusted: true, lastMatched: T09 },
      { ruleId: 'r2', selector: '.share', validFrom: T2, validTo: T3, trusted: false, lastMatched: T2 },
    ]);
  });

  it('lastMatched is null for a rule that never matched', async () => {
    matchesFind.mockResolvedValue([{ ruleId: 'r1', waybackTimestamp: T2, matchedNodes: 0 }]);
    const result = await getRules();
    const r1Listed = (result['rules'] as { ruleId: string; lastMatched: string | null }[]).find((r) => r.ruleId === 'r1');
    expect(r1Listed?.lastMatched).toBeNull();
  });

  it('returns the pending stop verbatim, with the marking URL', async () => {
    const result = await getRules();
    expect(result['pendingStop']).toEqual({ capture: T2, gates: STOP.gates, markingUrl: expect.any(String) });
    expect((result['pendingStop'] as { markingUrl: string }).markingUrl.endsWith(`/article-rules/${TRACKED}/${T2}`)).toBe(true);
  });

  it('pendingStop is null with no pending row, and null for a pending row whose stop is null', async () => {
    rowsFind.mockResolvedValue(ROWS.filter((r) => r.status !== 'PENDING_JUDGEMENT'));
    expect((await getRules())['pendingStop']).toBeNull();
    rowsFind.mockResolvedValue(ROWS.map((r) => (r.status === 'PENDING_JUDGEMENT' ? { ...r, stop: null } : r)));
    expect((await getRules())['pendingStop']).toBeNull();
  });

  it('counts every outcome, zero-filled', async () => {
    const result = await getRules();
    expect(result['counts']).toEqual({ UNFETCHED: 1, UNSERVABLE: 0, IDENTICAL: 1, DUPLICATE: 0, ACQUIRED: 2, PENDING_JUDGEMENT: 1, SKIPPED: 0 });
    expect(Object.keys(result['counts'] as object).sort()).toEqual([...OUTCOMES].sort());
  });

  // T14 was acquired under the empty ruleset and r1 governs it now: stale.
  it('counts stale rows through the real derivation', async () => {
    expect((await getRules())['stale']).toBe(1);
  });

  it('counts every decision on the page and names the newest', async () => {
    const result = await getRules();
    expect(result['decisions']).toBe(9);
    expect(result['lastDecisionAt']).toBe(LOG.at(-1)?.createdAt.toISOString());
  });

  it('returns exactly A5’s keys', async () => {
    expect(Object.keys(await getRules()).sort()).toEqual(['counts', 'decisions', 'lastDecisionAt', 'pendingStop', 'rules', 'stale']);
  });
});

describe('list_captures', () => {
  it('one entry per row, in timestamp order whatever order the rows came in', async () => {
    const entries = (await list()) as { capture: string }[];
    expect(entries.map((e) => e.capture)).toEqual([T09, T14, T2, T3, T4]);
  });

  it('exactly A5’s fields, and never the held bytes', async () => {
    const entries = (await list()) as Record<string, unknown>[];
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ['capture', 'comparedTo', 'digest', 'outcome', 'rulesetId', 'snapshotDate', 'snapshotId', 'stale', 'stopGates'].sort(),
      );
    }
    expect(JSON.stringify(entries)).not.toContain(ABC.toString('base64'));
  });

  it('derives snapshotDate from the timestamp', async () => {
    const entries = (await list()) as { capture: string; snapshotDate: string }[];
    expect(entries.find((e) => e.capture === T09)?.snapshotDate).toBe('2020-03-01');
    expect(entries.find((e) => e.capture === T4)?.snapshotDate).toBe('2020-03-04');
  });

  it('marks stale through the real derivation', async () => {
    const entries = (await list()) as { capture: string; stale: boolean }[];
    expect(entries.find((e) => e.capture === T09)?.stale).toBe(false);
    expect(entries.find((e) => e.capture === T14)?.stale).toBe(true);
    expect(entries.find((e) => e.capture === T3)?.stale).toBe(false);
  });

  it('carries the gate labels of a pending stop, null otherwise', async () => {
    const entries = (await list()) as { capture: string; stopGates: unknown }[];
    expect(entries.find((e) => e.capture === T2)?.stopGates).toEqual([4]);
    expect(entries.find((e) => e.capture === T09)?.stopGates).toBeNull();
  });

  it('filters to one outcome', async () => {
    const entries = (await list('ACQUIRED')) as { capture: string; outcome: string }[];
    expect(entries.map((e) => e.capture)).toEqual([T09, T14]);
  });

  it('refuses INVALID_OUTCOME for an outcome that is not one of the seven', async () => {
    await expect(list('STORED')).resolves.toEqual({ error: expect.any(String), code: 'INVALID_OUTCOME' });
  });
});
