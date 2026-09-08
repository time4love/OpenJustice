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

  // RULED 2026-09-07 (step 5's staging exercise): an UNFETCHED row may be
  // skipped too — the archive refused capture 20250208221410 with 429 for over
  // an hour, from three clients, while its neighbours served; a third archive
  // answer A5 had not named, and only the researcher's word moves the page
  // past it. No threshold, ever: the walk keeps asking until a human says stop.
  it('refuses NOT_PENDING for every outcome but PENDING_JUDGEMENT and UNFETCHED', async () => {
    for (const outcome of OUTCOMES.filter((o) => o !== 'PENDING_JUDGEMENT' && o !== 'UNFETCHED')) {
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
  it('skips an UNFETCHED row the archive will not serve: CAPTURE_SKIPPED with the reason, the row SKIPPED, nothing held to clear', async () => {
    pageWith('UNFETCHED');
    const result = await resolve('the archive answers 429 for this capture, for over an hour, from three clients');
    expect(result).toEqual({ capture: T14, outcome: 'SKIPPED', decisionSequence: 3 });
    expect(decisionsCreated()).toEqual([
      expect.objectContaining({ type: 'CAPTURE_SKIPPED', waybackTimestamp: T14, researcherId: RESEARCHER }),
    ]);
    expect(rowUpdate).toHaveBeenCalledWith({
      where: { id: `row-${T14}` },
      data: { status: 'SKIPPED', reason: expect.any(String), heldBody: null, stop: Prisma.DbNull },
    });
  });

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
      data: { draftCapture: null, draftSelectors: [], draftReturnedAt: null },
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

// ---------------------------------------------------------------------------
// CONTINUE — A5, amended 2026-09-07 (Flow 2, "judgement in the chat").
//
// A stop is a task inside the walk, and the chat is where a task with
// judgement in it is done. CONTINUE, TRUST per rule and END per rule are given
// there and recorded by ONE call; only CORRECT — marking with the element under
// the cursor — still goes through the page. So this tool gains the three
// answers that are not a draft, in A5's order: RULE_TRUSTED, then RULE_ENDED,
// then CAPTURE_ACCEPTED carrying the ruleset id AFTER the changes.
//
// THE ROW STAYS PENDING_JUDGEMENT, HOLDING ITS BYTES. CONTINUE resolves the
// stop; it does not acquire the capture. The retry does, exactly as after
// approve_article_rules — which is what keeps "no capture is stored under rules
// a gate has doubted" true with a second way to resolve a stop.
//
// AND ON AN ALREADY-RESOLVED ROW, NO SECOND CAPTURE_ACCEPTED. A mixed stop is
// marked first and answered after, so approve_article_rules has already
// accepted the capture under the ruleset the marking left; a second acceptance
// would be a decision nobody made, and RESOLVED is the predicate that says so.
// ---------------------------------------------------------------------------

const rShare = rule('r2', '.share', T09, 'd1');

/** CONTINUE, with whatever the researcher answered in the chat. */
async function cont(body: { trust?: string[]; end?: string[] } = {}): Promise<Record<string, unknown>> {
  return JSON.parse(
    await resolveScanStopHandler({ url: URL, capture: T14, resolution: 'CONTINUE', ...body }),
  ) as Record<string, unknown>;
}

describe('resolve_scan_stop — CONTINUE', () => {
  beforeEach(() => {
    rulesFind.mockResolvedValue([r1, rShare]);
    decisionsFind.mockResolvedValue(log([r1, rShare], [D.corrected(T09), D.accepted(T09)]));
  });

  it('with neither list: one CAPTURE_ACCEPTED carrying the ruleset in force at the capture, and nothing else', async () => {
    await cont();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['CAPTURE_ACCEPTED']);
    expect(decisionsCreated().at(0)).toEqual(
      expect.objectContaining({ waybackTimestamp: T14, researcherId: RESEARCHER, rulesetId: rulesetId(['.ticker', '.share']) }),
    );
  });

  it('clears the stop and LEAVES the row PENDING_JUDGEMENT holding its bytes — the retry acquires it', async () => {
    await cont();
    expect(rowUpdate).toHaveBeenCalledWith({ where: { id: `row-${T14}` }, data: { stop: Prisma.DbNull } });
  });

  it('trust: one RULE_TRUSTED per selector, mapped to the live rule, before the acceptance', async () => {
    await cont({ trust: ['.ticker'] });
    expect(decisionsCreated().map((d) => [d['type'], d['ruleId']])).toEqual([
      ['RULE_TRUSTED', 'r1'],
      ['CAPTURE_ACCEPTED', null],
    ]);
  });

  it('end: one RULE_ENDED per selector, validTo = this capture, and the Rule row follows its decision', async () => {
    await cont({ end: ['.share'] });
    expect(decisionsCreated().map((d) => [d['type'], d['ruleId']])).toEqual([
      ['RULE_ENDED', 'r2'],
      ['CAPTURE_ACCEPTED', null],
    ]);
    expect(ruleUpdate).toHaveBeenCalledWith({ where: { id: 'r2' }, data: { validTo: T14 } });
  });

  it('both, in A5’s order: TRUSTED, ENDED, then ACCEPTED with the ruleset AFTER the changes', async () => {
    await cont({ trust: ['.ticker'], end: ['.share'] });
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['RULE_TRUSTED', 'RULE_ENDED', 'CAPTURE_ACCEPTED']);
    expect(decisionsCreated().at(-1)?.['rulesetId']).toBe(rulesetId(['.ticker']));
  });

  it('refuses NO_SUCH_RULE for a selector with no live rule at the capture, and writes nothing', async () => {
    const result = await cont({ trust: ['.nothing'] });
    expect(result).toEqual({ error: expect.stringContaining('.nothing'), code: 'NO_SUCH_RULE' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses INVALID_RESOLUTION naming a selector given in BOTH trust and end, and writes nothing', async () => {
    const result = await cont({ trust: ['.ticker'], end: ['.ticker'] });
    expect(result).toEqual({ error: expect.stringContaining('.ticker'), code: 'INVALID_RESOLUTION' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    expect(decisionFindFirst).not.toHaveBeenCalled();
  });

  it('on an already-RESOLVED row writes the rule decisions and NO second CAPTURE_ACCEPTED', async () => {
    // approve_article_rules ran first, for CORRECT: the capture is accepted
    // under the ruleset now in force, so RESOLVED is true.
    decisionsFind.mockResolvedValue(
      log([r1, rShare], [D.corrected(T09), D.accepted(T09), D.accepted(T14, rulesetId(['.ticker', '.share']))]),
    );
    await cont({ trust: ['.ticker'] });
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['RULE_TRUSTED']);
  });

  it('refuses trust or end given with BAD_CAPTURE', async () => {
    const result = JSON.parse(
      await resolveScanStopHandler({ url: URL, capture: T14, resolution: 'BAD_CAPTURE', reason: REASON, trust: ['.ticker'] }),
    ) as Record<string, unknown>;
    expect(result).toEqual({ error: expect.any(String), code: 'INVALID_RESOLUTION' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NOT_PENDING on an UNFETCHED row — only a skip may take one', async () => {
    pageWith('UNFETCHED');
    expect(await cont()).toEqual({ error: expect.any(String), code: 'NOT_PENDING' });
  });

  it('runs as ONE transaction', async () => {
    await cont({ trust: ['.ticker'] });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns { capture, resolution, changes: { trusted, ended }, decisionSequence }', async () => {
    const result = await cont({ trust: ['.ticker'], end: ['.share'] });
    expect(result).toEqual({
      capture: T14,
      resolution: 'CONTINUE',
      changes: { trusted: [{ ruleId: 'r1', selector: '.ticker' }], ended: [{ ruleId: 'r2', selector: '.share' }] },
      decisionSequence: expect.any(Number),
    });
  });
});
