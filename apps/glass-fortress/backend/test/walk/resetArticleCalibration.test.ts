jest.mock('../../src/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    rule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    pageDecision: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  };
  prisma['$transaction'] = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return { prisma };
});

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { approvedBefore, rulesInForce, trusted, type Decision } from '../../src/walk/derivations';
import { resetArticleCalibrationHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, T5, ids, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// reset_article_calibration — A5, as amended 2026-09-02.
//
//   does      ONE RESET decision — every rule created before it loses authority
//             by A3, no per-rule row is written · draft cleared · RULED
//             2026-09-03: `stop` cleared on every PENDING_JUDGEMENT row of the
//             page, the held bytes kept, in the same transaction
//   returns   { rulesLostAuthority: n, decisionsSuperseded: n }
//   refuses   NO_RESEARCHER · NOT_SURVEYED · NOTHING_TO_RETIRE (no rule in force
//             and no decision under AUTHORITY) · REASON_REQUIRED · STALE_SEQUENCE
//
// "START AGAIN" IS FREE. A reset writes one row. The rules stay, readable,
// with their dates untouched; they lose authority because AUTHORITY is
// "decisions after the newest RESET" and a rule's authority is its creating
// decision's. That is the property this suite's first file found missing and
// the contract was amended for, and the load-bearing case here composes the
// tool's effect with the REAL derivations: the log it leaves, fed to
// rulesInForce, is empty at every timestamp; every rule is REVIEWED; nothing
// is approved, so the next capture stops on Gate 0 like any page's first.
//
// This is the REWRITE of test/resetArticleCalibration.test.ts: a reset
// decision, refused when there is nothing to retire; "era boundaries did not
// survive" goes with the concept.
//
// RED until step 3 builds `src/walk/tools`.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const ABC = Buffer.from('<html>abc</html>');
const REASON = 'the calibration is garbage';

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const trackedUpdate = delegate('trackedUrl')['update'] as Mock;
const rowsFind = delegate('cdxIndexEntry')['findMany'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const rowsUpdateMany = delegate('cdxIndexEntry')['updateMany'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const ruleCreate = delegate('rule')['create'] as Mock;
const ruleUpdate = delegate('rule')['update'] as Mock;
const ruleDelete = delegate('rule')['delete'] as Mock;
const ruleDeleteMany = delegate('rule')['deleteMany'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const decisionFindFirst = delegate('pageDecision')['findFirst'] as Mock;
const decisionCreate = delegate('pageDecision')['create'] as Mock;
const transaction = (prisma as unknown as { $transaction: Mock }).$transaction;

const WRITES = [trackedUpdate, rowUpdate, rowsUpdateMany, ruleCreate, ruleUpdate, ruleDelete, ruleDeleteMany, decisionCreate];

/** Two rules, one ended, one retired; five decisions; a draft on the page. */
const r1 = rule('r1', '.ticker', T09, 'd1', T3);
const r2 = rule('r2', '.share', T2, 'd3');
const r3 = rule('r3', '.old', T09, 'd1');
const RULES = [r1, r2, r3];
const LOG = log(RULES, [D.corrected(T09), D.accepted(T09), D.corrected(T2), D.trusted('r2', T2), D.retired('r3', T2), D.accepted(T2)]);

function pageWith(rules = RULES, decisions = LOG, draftCapture: string | null = T14) {
  trackedFind.mockResolvedValue({
    id: TRACKED,
    url: URL,
    draftCapture,
    draftSelectors: draftCapture === null ? [] : ['.ticker'],
    draftTrusted: [],
    draftReturnedAt: draftCapture === null ? null : new Date('2026-09-03T10:00:00Z'),
  });
  rulesFind.mockResolvedValue(rules);
  decisionsFind.mockResolvedValue(decisions);
}

const decisionsCreated = () =>
  decisionCreate.mock.calls.map(([call]: [{ data: Record<string, unknown> }]) => call.data);

/** The page's log as the tool leaves it: what it read, plus what it wrote. */
function logAfter(): Decision[] {
  const written = decisionsCreated().map((data) => ({
    id: `d${String(data['sequence'])}`,
    sequence: data['sequence'] as number,
    type: data['type'] as Decision['type'],
    waybackTimestamp: (data['waybackTimestamp'] as string | null | undefined) ?? null,
    ruleId: (data['ruleId'] as string | null | undefined) ?? null,
    rulesetId: (data['rulesetId'] as string | null | undefined) ?? null,
  }));
  return [...LOG, ...written];
}

/** "No reason at all": a sentinel, because an explicit `undefined` would take the helper's default. */
const MISSING = Symbol('missing reason');

async function reset(reason: string | typeof MISSING = REASON): Promise<Record<string, unknown>> {
  const input = { url: URL, ...(reason === MISSING ? {} : { reason }) };
  return JSON.parse(await resetArticleCalibrationHandler(input)) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(RESEARCHER);
  pageWith();
  rowsFind.mockResolvedValue([]);
  decisionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `d${String(data['sequence'])}`, ...data }));
  // A7: the page log reads the page's last sequence inside the transaction.
  // The mock answers with the last in the log this test set, or the last this
  // test has created. RULED 2026-09-05 (Q1 of step 3): a mock-shape
  // amendment, no assertion touched.
  decisionFindFirst.mockImplementation(async () => {
    const inLog = ((await decisionsFind()) as { sequence: number }[]).map((d) => d.sequence);
    const created = decisionsCreated().map((d) => d['sequence'] as number);
    const last = Math.max(0, ...inLog, ...created);
    return last === 0 ? null : { sequence: last };
  });
  rowUpdate.mockResolvedValue({});
  rowsUpdateMany.mockResolvedValue({ count: 0 });
  trackedUpdate.mockResolvedValue({});
});

describe('reset_article_calibration — refusals, as JSON, with nothing written', () => {
  it('refuses NO_RESEARCHER', async () => {
    mockResearcherId.mockReturnValue(null);
    await expect(reset()).resolves.toEqual({ error: expect.any(String), code: 'NO_RESEARCHER' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NOT_SURVEYED', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(reset()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  // A reset ends the authority of real work, and why is not optional.
  it('refuses REASON_REQUIRED for a missing reason, and a blank one', async () => {
    for (const reason of [MISSING, '   '] as const) {
      jest.clearAllMocks();
      pageWith();
      await expect(reset(reason)).resolves.toEqual({ error: expect.stringContaining('reason'), code: 'REASON_REQUIRED' });
      for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    }
  });

  it('refuses NOTHING_TO_RETIRE on a bare page', async () => {
    pageWith([], [], null);
    await expect(reset()).resolves.toEqual({ error: expect.any(String), code: 'NOTHING_TO_RETIRE' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  // The previous reset already ended everything; a second one would supersede
  // nothing — the "accepts a reset that supersedes nothing" defect, closed.
  it('refuses NOTHING_TO_RETIRE when the newest decision is already a RESET', async () => {
    pageWith(RULES, log(RULES, [D.corrected(T09), D.accepted(T09), D.reset()]), null);
    await expect(reset()).resolves.toEqual({ error: expect.any(String), code: 'NOTHING_TO_RETIRE' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses STALE_SEQUENCE when the sequence moved under the write, and clears nothing', async () => {
    decisionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(reset()).resolves.toEqual({ error: expect.any(String), code: 'STALE_SEQUENCE' });
    expect(trackedUpdate).not.toHaveBeenCalled();
    expect(rowUpdate).not.toHaveBeenCalled();
    expect(rowsUpdateMany).not.toHaveBeenCalled();
  });
});

describe('reset_article_calibration — the decision', () => {
  it('writes exactly one decision: a RESET with the reason and the researcher, naming no capture, rule or ruleset', async () => {
    await reset();
    expect(decisionsCreated()).toEqual([
      expect.objectContaining({ type: 'RESET', trackedUrlId: TRACKED, reason: REASON, researcherId: RESEARCHER }),
    ]);
    const written = decisionsCreated().at(0) ?? {};
    expect(written['waybackTimestamp'] ?? null).toBeNull();
    expect(written['ruleId'] ?? null).toBeNull();
    expect(written['rulesetId'] ?? null).toBeNull();
  });

  it('numbers it after the page’s last sequence', async () => {
    await reset();
    expect(decisionsCreated().at(0)?.['sequence']).toBe(7);
  });

  // The assertion that would have caught the earlier wording.
  it('writes no RULE_RETIRED and no other decision', async () => {
    await reset();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['RESET']);
  });
});

describe('reset_article_calibration — the rules stay, and lose authority by the predicate', () => {
  it('creates, changes and deletes no Rule row — validTo untouched, every row kept', async () => {
    await reset();
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(ruleUpdate).not.toHaveBeenCalled();
    expect(ruleDelete).not.toHaveBeenCalled();
    expect(ruleDeleteMany).not.toHaveBeenCalled();
  });

  // THE LOAD-BEARING CASE, through the real derivations.
  it('leaves a log under which nothing is in force at any timestamp, every rule is REVIEWED, and nothing is approved', async () => {
    await reset();
    const after = logAfter();
    for (const t of [T09, T14, T2, T3, T5]) {
      expect(ids(rulesInForce(RULES, after, t))).toEqual([]);
      expect(approvedBefore(after, t)).toBe(false);
    }
    for (const r of RULES) expect(trusted(r, after)).toBe('REVIEWED');
  });
});

describe('reset_article_calibration — a page with decisions and no rule', () => {
  it('resets, superseding the decisions and losing no rule', async () => {
    pageWith([], log([], [D.accepted(T09), D.accepted(T2)]), null);
    const result = await reset();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['RESET']);
    expect(result).toEqual({ rulesLostAuthority: 0, decisionsSuperseded: 2 });
  });
});

describe('reset_article_calibration — pending stops, the draft, and the transaction', () => {
  // RULED: a stop written under authority the reset ends names rules that no
  // longer govern anything. The row stays PENDING_JUDGEMENT with its bytes, its
  // stop is cleared, and the next scan_captures EVALUATES it — Gate 0, by
  // construction — rather than returning it.
  it('clears the stop on every PENDING_JUDGEMENT row of the page, keeping the held bytes, in the same transaction', async () => {
    const pending = (ts: string) => ({
      id: `row-${ts}`,
      trackedUrlId: TRACKED,
      waybackTimestamp: ts,
      status: 'PENDING_JUDGEMENT',
      heldBody: ABC,
      stop: { gates: [{ gate: 1, material: {} }] },
    });
    rowsFind.mockResolvedValue([
      { id: `row-${T09}`, trackedUrlId: TRACKED, waybackTimestamp: T09, status: 'ACQUIRED', heldBody: null, stop: null },
      pending(T14),
      pending(T3),
    ]);
    const result = await reset();
    const cleared = [
      ...rowUpdate.mock.calls.map(([call]: [{ where: unknown; data: Record<string, unknown> }]) => call),
      ...rowsUpdateMany.mock.calls.map(([call]: [{ where: unknown; data: Record<string, unknown> }]) => call),
    ];
    expect(cleared.length).toBeGreaterThan(0);
    for (const call of cleared) {
      // SQL NULL is Prisma.DbNull on a nullable Json column; it reads back as
      // null, which is what every derivation compares against. RULED
      // 2026-09-05 (Q8 of step 3): the suite saying what the client can do.
      expect(call.data).toEqual({ stop: Prisma.DbNull });
      expect(JSON.stringify(call.where)).toContain('PENDING_JUDGEMENT');
    }
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rulesLostAuthority: 2, decisionsSuperseded: 6 });
  });

  it('clears the draft, whatever capture it named', async () => {
    await reset();
    expect(trackedUpdate).toHaveBeenCalledWith({
      where: { id: TRACKED },
      data: { draftCapture: null, draftSelectors: [], draftTrusted: [], draftReturnedAt: null },
    });
  });

  it('runs as one transaction', async () => {
    await reset();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('reset_article_calibration — the return', () => {
  // r1 and r2 were created under the authority being ended and are not
  // retired under it; r3 was retired already, so it had no authority to lose.
  // All six decisions were under that authority.
  it('returns exactly { rulesLostAuthority, decisionsSuperseded }, counted under the authority being ended', async () => {
    const result = await reset();
    expect(result).toEqual({ rulesLostAuthority: 2, decisionsSuperseded: 6 });
  });

  it('counts only the decisions since the previous RESET', async () => {
    // r1 was created before the earlier RESET; r2 after it, by d4.
    const r2AfterReset = rule('r2', '.share', T2, 'd4');
    const decisions = log([r1, r2AfterReset], [D.corrected(T09), D.accepted(T09), D.reset(), D.corrected(T2), D.accepted(T2)]);
    pageWith([r1, r2AfterReset], decisions);
    const result = await reset();
    expect(result).toEqual({ rulesLostAuthority: 1, decisionsSuperseded: 2 });
  });
});
