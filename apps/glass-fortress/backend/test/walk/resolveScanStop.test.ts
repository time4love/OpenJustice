jest.mock('../../src/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findFirst: jest.fn(), update: jest.fn() },
    rule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
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
import { rulesetId } from '../../src/walk/derivations';
import { resolveScanStopHandler } from '../../src/walk/tools';
import { T09, T14, T3, OUTCOMES, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// resolve_scan_stop — A5. Flow 2's one answer that is not a draft.
//
//   does      CAPTURE_SKIPPED · row := SKIPPED, heldBody cleared, reason stored
//   returns   { capture, outcome: 'SKIPPED', decisionSequence }
//   refuses   NO_RESEARCHER · NOT_SURVEYED · NOT_PENDING · reason empty ·
//             STALE_SEQUENCE
//
// A SKIPPED CAPTURE DOES NOT SPEAK. It is a human's verdict that this capture
// cannot be used — a truncated archive page, a paywall redirect — and it
// carries a reason, because a silent hole in the record is the one outcome
// this corpus does not permit. It is not UNSERVABLE: that is a fact about the
// archive, this is a judgement about a capture we hold. From a stop it is
// always unstored, so nothing holds it but its row, and the row's bytes are
// cleared with the outcome.
//
// THREE ASSERTIONS MIGRATE HERE from resolveEraBoundary's BAD_CAPTURE group,
// re-expressed against this contract rather than copied with their fixtures:
// a skip writes one CAPTURE_SKIPPED and touches no rule; however many bad
// captures occur in a row, none of them changes the rules; and a missing or
// blank reason is refused with nothing written.
//
// RULED 2026-09-03: the draft is cleared when it names THIS capture, and left
// alone when it names another.
//
// RED until step 3 builds `src/walk/tools`.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const ABC = Buffer.from('<html>abc</html>');
const REASON = 'truncated archive capture';

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const trackedUpdate = delegate('trackedUrl')['update'] as Mock;
const rowFind = delegate('cdxIndexEntry')['findFirst'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const ruleCreate = delegate('rule')['create'] as Mock;
const ruleUpdate = delegate('rule')['update'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const decisionFindFirst = delegate('pageDecision')['findFirst'] as Mock;
const decisionCreate = delegate('pageDecision')['create'] as Mock;
const transaction = (prisma as unknown as { $transaction: Mock }).$transaction;

const WRITES = [trackedUpdate, rowUpdate, ruleCreate, ruleUpdate, decisionCreate];

const r1 = rule('r1', '.ticker', T09, 'd1');

function pageWith(rowStatus = 'PENDING_JUDGEMENT', draftCapture: string | null = null) {
  trackedFind.mockResolvedValue({
    id: TRACKED,
    url: URL,
    draftCapture,
    draftSelectors: draftCapture === null ? [] : ['.ticker'],
    draftTrusted: [],
    draftReturnedAt: draftCapture === null ? null : new Date('2026-09-03T10:00:00Z'),
  });
  rowFind.mockResolvedValue({
    id: `row-${T14}`,
    trackedUrlId: TRACKED,
    waybackTimestamp: T14,
    status: rowStatus,
    heldBody: rowStatus === 'PENDING_JUDGEMENT' ? ABC : null,
    stop: rowStatus === 'PENDING_JUDGEMENT' ? { gates: [{ gate: 1, material: {} }] } : null,
  });
}

const decisionsCreated = () =>
  decisionCreate.mock.calls.map(([call]: [{ data: Record<string, unknown> }]) => call.data);

/** "No reason at all": a sentinel, because an explicit `undefined` would take the helper's default. */
const MISSING = Symbol('missing reason');

async function resolve(reason: string | typeof MISSING = REASON, resolution = 'BAD_CAPTURE'): Promise<Record<string, unknown>> {
  const input = { url: URL, capture: T14, resolution, ...(reason === MISSING ? {} : { reason }) };
  return JSON.parse(await resolveScanStopHandler(input)) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(RESEARCHER);
  pageWith();
  rulesFind.mockResolvedValue([r1]);
  decisionsFind.mockResolvedValue(log([r1], [D.corrected(T09), D.accepted(T09)]));
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
  trackedUpdate.mockResolvedValue({});
});

describe('resolve_scan_stop — refusals, as JSON, with nothing written', () => {
  it('refuses NO_RESEARCHER', async () => {
    mockResearcherId.mockReturnValue(null);
    await expect(resolve()).resolves.toEqual({ error: expect.any(String), code: 'NO_RESEARCHER' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NOT_SURVEYED', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(resolve()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NOT_PENDING for every outcome but PENDING_JUDGEMENT', async () => {
    for (const outcome of OUTCOMES.filter((o) => o !== 'PENDING_JUDGEMENT')) {
      jest.clearAllMocks();
      pageWith(outcome);
      const result = await resolve();
      expect({ outcome, code: result['code'] }).toEqual({ outcome, code: 'NOT_PENDING' });
      for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    }
  });

  // A SILENT HOLE IN THE RECORD IS THE ONE OUTCOME THIS CORPUS DOES NOT PERMIT.
  it('refuses a missing reason, and a blank one', async () => {
    for (const reason of [MISSING, '   '] as const) {
      jest.clearAllMocks();
      pageWith();
      await expect(resolve(reason)).resolves.toEqual({ error: expect.stringContaining('reason'), code: 'REASON_REQUIRED' });
      for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    }
  });

  it('refuses a resolution that is not BAD_CAPTURE — every other answer is a draft', async () => {
    await expect(resolve(REASON, 'REDESIGN')).resolves.toEqual({ error: expect.any(String), code: 'INVALID_RESOLUTION' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses STALE_SEQUENCE when the sequence moved under the write, and changes no row', async () => {
    decisionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(resolve()).resolves.toEqual({ error: expect.any(String), code: 'STALE_SEQUENCE' });
    expect(rowUpdate).not.toHaveBeenCalled();
  });
});

describe('resolve_scan_stop — the decision', () => {
  it('writes one CAPTURE_SKIPPED naming the capture, with the reason, the researcher and the ruleset in force at its timestamp', async () => {
    await resolve();
    expect(decisionsCreated()).toEqual([
      expect.objectContaining({
        type: 'CAPTURE_SKIPPED',
        trackedUrlId: TRACKED,
        waybackTimestamp: T14,
        reason: REASON,
        researcherId: RESEARCHER,
        rulesetId: rulesetId(['.ticker']),
      }),
    ]);
  });

  it('numbers it after the page’s last sequence', async () => {
    await resolve();
    expect(decisionsCreated().at(0)?.['sequence']).toBe(3);
  });

  // Migrated: "BAD_CAPTURE writes a SKIP and opens no era". A skip is a verdict
  // on one capture and says nothing about the rules.
  it('writes no other decision and touches no rule', async () => {
    await resolve();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['CAPTURE_SKIPPED']);
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(ruleUpdate).not.toHaveBeenCalled();
  });
});

describe('resolve_scan_stop — the row', () => {
  it('records SKIPPED with the reason, and clears the held bytes and the stop', async () => {
    await resolve();
    expect(rowUpdate).toHaveBeenCalledWith({
      where: { id: `row-${T14}` },
      // SQL NULL is Prisma.DbNull on a nullable Json column; it reads back as
      // null, which is what every derivation compares against. RULED
      // 2026-09-05 (Q8 of step 3): the suite saying what the client can do.
      data: { status: 'SKIPPED', reason: REASON, heldBody: null, stop: Prisma.DbNull },
    });
  });

  it('runs the decision and the row update as one transaction', async () => {
    await resolve();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('resolve_scan_stop — the draft', () => {
  // RULED: a draft for THIS capture is moot once the capture is skipped; a
  // draft for another capture is someone's work in progress and stays.
  it('clears the draft when it names this capture', async () => {
    pageWith('PENDING_JUDGEMENT', T14);
    await resolve();
    expect(trackedUpdate).toHaveBeenCalledWith({
      where: { id: TRACKED },
      data: { draftCapture: null, draftSelectors: [], draftTrusted: [], draftReturnedAt: null },
    });
  });

  it('leaves the draft alone when it names another capture', async () => {
    pageWith('PENDING_JUDGEMENT', T3);
    await resolve();
    expect(trackedUpdate).not.toHaveBeenCalled();
  });

  it('writes no draft when there is none', async () => {
    await resolve();
    expect(trackedUpdate).not.toHaveBeenCalled();
  });
});

describe('resolve_scan_stop — consecutive skips', () => {
  // Migrated: "however many consecutive bad captures occur, none of them opens
  // an era". An archive outage is a real pattern, and an earlier draft would
  // have declared a redesign after k of them. Here: five skips are five
  // CAPTURE_SKIPPED rows, and the rules before and after are the same rows.
  it('five bad captures in a row are five CAPTURE_SKIPPED and nothing else; the rules are untouched', async () => {
    const before = [rule('r1', '.ticker', T09, 'd1')];
    rulesFind.mockResolvedValue(before);
    let sequence = 2;
    for (let i = 0; i < 5; i += 1) {
      decisionsFind.mockResolvedValue(log(before, [D.corrected(T09), D.accepted(T09), ...Array<ReturnType<typeof D.skipped>>(i).fill(D.skipped(T09))]));
      sequence += 1;
      await resolve(`paywall redirect ${String(i)}`);
    }
    expect(decisionsCreated().map((d) => d['type'])).toEqual(Array<string>(5).fill('CAPTURE_SKIPPED'));
    expect(decisionsCreated().at(-1)?.['sequence']).toBe(sequence);
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(ruleUpdate).not.toHaveBeenCalled();
  });
});

describe('resolve_scan_stop — the return', () => {
  it('returns exactly { capture, outcome: SKIPPED, decisionSequence }', async () => {
    const result = await resolve();
    expect(result).toEqual({ capture: T14, outcome: 'SKIPPED', decisionSequence: 3 });
  });
});
