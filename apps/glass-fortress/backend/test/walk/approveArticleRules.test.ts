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
import { approveArticleRulesHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, T5, EMPTY_ID, OUTCOMES, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// approve_article_rules — A5. MARKING's one command, whichever answer it was.
//
//   does      ONE transaction, in order:
//               draft must exist, be returned, and name THIS capture → else REFUSES
//               selectors added vs RULES_IN_FORCE(page, t)  → Rule rows (validFrom = t),
//                                                              one RULESET_CORRECTED
//               selectors removed                             → RULE_ENDED each, validTo = t
//               draftTrusted (SELECTORS)                       → RULE_TRUSTED each, mapped to the
//                                                              live rule — created here or existing
//               then CAPTURE_ACCEPTED, carrying RULESET_ID(page, t) after the changes
//               draft cleared
//   returns   { rules: in force at t after the approval [{ ruleId, selector, validFrom, validTo,
//               trusted }], changes: { added, ended, trusted, extended } each [{ ruleId, selector }],
//               decisionSequence }
//   refuses   NO_RESEARCHER · NOT_SURVEYED · NO_DRAFT · DRAFT_NOT_RETURNED ·
//             DRAFT_FOR_OTHER_CAPTURE · CAPTURE_NOT_MARKABLE · EMPTY_RULESET_UNCONFIRMED ·
//             STALE_SEQUENCE
//
// RULED 2026-09-03: ONE SELECTOR, ONE LIVE RULE. A draft selector that already
// lives as a rule with a LATER validFrom extends that rule's validFrom to this
// timestamp and writes RULE_EXTENDED; no second row. And because one live rule
// per selector makes a selector a unique name, `draftTrusted` is a list of
// SELECTORS: the approval maps each to its live rule, whether this approval
// created it or it already existed — so a rule can be created and trusted in
// one draft.
//
// A7: the page's decision sequence is the compare-and-set. The unique index on
// (trackedUrlId, sequence) rejects a write that found the sequence moved, and
// the tool answers STALE_SEQUENCE. Observed here at the insert: the mock
// rejects with Prisma's unique-violation error.
//
// CONTINUE hands back an unchanged draft, CORRECT a changed one, TRUST a draft
// carrying trusted selectors — the same approval promotes all of it. The work-list row
// is never written here: acquisition is the walk's retry.
//
// RED until step 3 builds `src/walk/tools`.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const RETURNED_AT = new Date('2026-09-03T10:00:00Z');

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

interface Draft {
  draftCapture: string | null;
  draftSelectors: string[];
  draftTrusted: string[];
  draftReturnedAt: Date | null;
}

function pageWith(draft: Partial<Draft> = {}, rowStatus = 'PENDING_JUDGEMENT') {
  trackedFind.mockResolvedValue({
    id: TRACKED,
    url: URL,
    draftCapture: T14,
    draftSelectors: ['.ticker'],
    draftTrusted: [],
    draftReturnedAt: RETURNED_AT,
    ...draft,
  });
  rowFind.mockResolvedValue({ id: `row-${T14}`, trackedUrlId: TRACKED, waybackTimestamp: T14, status: rowStatus });
}

/** r1 = '.ticker', in force since T09, approved at T09. The page's last sequence is 2. */
const r1 = rule('r1', '.ticker', T09, 'd1');

const decisionsCreated = () =>
  decisionCreate.mock.calls.map(([call]: [{ data: Record<string, unknown> }]) => call.data);
const rulesCreated = () => ruleCreate.mock.calls.map(([call]: [{ data: Record<string, unknown> }]) => call.data);
const ruleUpdates = () =>
  ruleUpdate.mock.calls.map(([call]: [{ where: { id: string }; data: Record<string, unknown> }]) => ({
    id: call.where.id,
    ...call.data,
  }));

async function approve(rules?: 0, capture = T14): Promise<Record<string, unknown>> {
  const input = rules === undefined ? { url: URL, capture } : { url: URL, capture, rules };
  return JSON.parse(await approveArticleRulesHandler(input)) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(RESEARCHER);
  pageWith();
  rulesFind.mockResolvedValue([r1]);
  decisionsFind.mockResolvedValue(log([r1], [D.corrected(T09), D.accepted(T09)]));
  let created = 0;
  ruleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `rule-new-${++created}`, ...data }));
  ruleUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ ...where, ...data }));
  decisionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `d${String(data['sequence'])}`, ...data }));
  // A7: the page log reads the page's last sequence inside the transaction.
  // The mock answers with the last in the log this test set, or the last this
  // test has created — an approval appends twice (RULESET_CORRECTED before the
  // Rule rows, the rest after) and the two must number contiguously. RULED
  // 2026-09-05 (Q1 of step 3): a mock-shape amendment, no assertion touched.
  decisionFindFirst.mockImplementation(async () => {
    const inLog = ((await decisionsFind()) as { sequence: number }[]).map((d) => d.sequence);
    const created = decisionsCreated().map((d) => d['sequence'] as number);
    const last = Math.max(0, ...inLog, ...created);
    return last === 0 ? null : { sequence: last };
  });
  trackedUpdate.mockResolvedValue({});
});

describe('approve_article_rules — refusals, as JSON, with nothing written', () => {
  it('refuses NO_RESEARCHER', async () => {
    mockResearcherId.mockReturnValue(null);
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'NO_RESEARCHER' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NOT_SURVEYED', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses NO_DRAFT when the page holds none', async () => {
    pageWith({ draftCapture: null, draftSelectors: [], draftReturnedAt: null });
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'NO_DRAFT' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses DRAFT_NOT_RETURNED when the page has not handed it back', async () => {
    pageWith({ draftReturnedAt: null });
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'DRAFT_NOT_RETURNED' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  // "A mismatch means the wrong page is open."
  it('refuses DRAFT_FOR_OTHER_CAPTURE when the draft names another capture', async () => {
    pageWith({ draftCapture: T3 });
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'DRAFT_FOR_OTHER_CAPTURE' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses CAPTURE_NOT_MARKABLE for every outcome but PENDING_JUDGEMENT and ACQUIRED', async () => {
    for (const outcome of OUTCOMES.filter((o) => o !== 'PENDING_JUDGEMENT' && o !== 'ACQUIRED')) {
      jest.clearAllMocks();
      pageWith({}, outcome);
      const result = await approve();
      expect({ outcome, code: result['code'] }).toEqual({ outcome, code: 'CAPTURE_NOT_MARKABLE' });
      for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    }
  });

  // "An approval of nothing has twice gone through unnoticed." A statement, not
  // a threshold: zero rules in force after this approval needs `rules: 0`.
  it('refuses EMPTY_RULESET_UNCONFIRMED when the approval would leave no rule in force and rules is not 0', async () => {
    pageWith({ draftSelectors: [] });
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'EMPTY_RULESET_UNCONFIRMED' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it('refuses EMPTY_RULESET_UNCONFIRMED on a page with no rule and an empty draft, without rules: 0', async () => {
    pageWith({ draftSelectors: [] });
    rulesFind.mockResolvedValue([]);
    decisionsFind.mockResolvedValue([]);
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'EMPTY_RULESET_UNCONFIRMED' });
  });

  // A7. Two researchers on one page serialise on the sequence; the one who
  // finds it moved re-reads.
  it('refuses STALE_SEQUENCE when the sequence moved under the write, and clears no draft', async () => {
    decisionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(approve()).resolves.toEqual({ error: expect.any(String), code: 'STALE_SEQUENCE' });
    expect(trackedUpdate).not.toHaveBeenCalled();
  });
});

describe('approve_article_rules — the promotion, in order', () => {
  it('turns a new selector into a Rule from this timestamp, created by the one RULESET_CORRECTED', async () => {
    pageWith({ draftSelectors: ['.ticker', '.share', '.related'] });
    await approve();
    const corrected = decisionsCreated().filter((d) => d['type'] === 'RULESET_CORRECTED');
    expect(corrected).toHaveLength(1);
    expect(rulesCreated()).toEqual([
      expect.objectContaining({ selector: '.share', validFrom: T14, validTo: null, createdById: RESEARCHER, createdByDecisionId: 'd3' }),
      expect.objectContaining({ selector: '.related', validFrom: T14, validTo: null, createdById: RESEARCHER, createdByDecisionId: 'd3' }),
    ]);
  });

  it('ends a rule the draft no longer carries, from this timestamp', async () => {
    pageWith({ draftSelectors: ['.share'] });
    await approve();
    expect(ruleUpdates()).toEqual([expect.objectContaining({ id: 'r1', validTo: T14 })]);
    expect(decisionsCreated().filter((d) => d['type'] === 'RULE_ENDED')).toEqual([
      expect.objectContaining({ ruleId: 'r1', waybackTimestamp: T14 }),
    ]);
  });

  it('trusts every selector the draft names, mapped to its live rule, one RULE_TRUSTED each', async () => {
    pageWith({ draftTrusted: ['.ticker'] });
    await approve();
    expect(decisionsCreated().filter((d) => d['type'] === 'RULE_TRUSTED')).toEqual([
      expect.objectContaining({ ruleId: 'r1', waybackTimestamp: T14 }),
    ]);
  });

  it('a selector created and trusted in one draft: the RULE_TRUSTED names the rule this approval created', async () => {
    pageWith({ draftSelectors: ['.ticker', '.share'], draftTrusted: ['.share'] });
    await approve();
    expect(rulesCreated()).toEqual([expect.objectContaining({ selector: '.share' })]);
    expect(decisionsCreated().filter((d) => d['type'] === 'RULE_TRUSTED')).toEqual([
      expect.objectContaining({ ruleId: 'rule-new-1', waybackTimestamp: T14 }),
    ]);
  });

  it('accepts the capture last, carrying the ruleset id in force at its timestamp AFTER the changes', async () => {
    pageWith({ draftSelectors: ['.ticker', '.share'] });
    await approve();
    const last = decisionsCreated().at(-1);
    expect(last).toEqual(expect.objectContaining({ type: 'CAPTURE_ACCEPTED', rulesetId: rulesetId(['.ticker', '.share']) }));
  });

  it('CONTINUE — an unchanged draft writes CAPTURE_ACCEPTED alone', async () => {
    await approve();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['CAPTURE_ACCEPTED']);
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(ruleUpdate).not.toHaveBeenCalled();
  });

  it('rules: 0 — an empty draft approved explicitly ends every rule and accepts under the empty ruleset', async () => {
    pageWith({ draftSelectors: [] });
    const result = await approve(0);
    expect(ruleUpdates()).toEqual([expect.objectContaining({ id: 'r1', validTo: T14 })]);
    expect(decisionsCreated().at(-1)).toEqual(expect.objectContaining({ type: 'CAPTURE_ACCEPTED', rulesetId: EMPTY_ID }));
    expect(result['changes']).toEqual({ added: [], ended: [{ ruleId: 'r1', selector: '.ticker' }], trusted: [], extended: [] });
    expect(result['rules']).toEqual([]);
  });
});

describe('approve_article_rules — the log', () => {
  /** r1 ended, '.share' created and trusted in the same draft. */
  const everything = () => pageWith({ draftSelectors: ['.share'], draftTrusted: ['.share'] });

  it('writes the decisions in the order RULESET_CORRECTED, RULE_ENDED, RULE_TRUSTED, CAPTURE_ACCEPTED', async () => {
    everything();
    await approve();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['RULESET_CORRECTED', 'RULE_ENDED', 'RULE_TRUSTED', 'CAPTURE_ACCEPTED']);
  });

  it('numbers them contiguously from the page’s last sequence', async () => {
    everything();
    await approve();
    expect(decisionsCreated().map((d) => d['sequence'])).toEqual([3, 4, 5, 6]);
  });

  it('attributes every decision and names the capture on every one', async () => {
    everything();
    await approve();
    for (const decision of decisionsCreated()) {
      expect(decision).toEqual(expect.objectContaining({ researcherId: RESEARCHER, waybackTimestamp: T14, trackedUrlId: TRACKED }));
    }
  });

  it('runs as one transaction', async () => {
    everything();
    await approve();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('approve_article_rules — one selector, one live rule', () => {
  it('extends an existing rule with a later validFrom back to this timestamp, RULE_EXTENDED, no second row', async () => {
    const later = rule('r2', '.x', T3, 'd3');
    rulesFind.mockResolvedValue([r1, later]);
    decisionsFind.mockResolvedValue(log([r1, later], [D.corrected(T09), D.accepted(T09), D.corrected(T3)]));
    pageWith({ draftSelectors: ['.ticker', '.x'] });
    await approve();
    expect(rulesCreated()).toEqual([]);
    expect(ruleUpdates()).toEqual([expect.objectContaining({ id: 'r2', validFrom: T14 })]);
    expect(decisionsCreated().filter((d) => d['type'] === 'RULE_EXTENDED')).toEqual([
      expect.objectContaining({ ruleId: 'r2', waybackTimestamp: T14 }),
    ]);
    expect(decisionsCreated().filter((d) => d['type'] === 'RULESET_CORRECTED')).toHaveLength(0);
  });

  // RULED 2026-09-05. A2 defines "live" PER t — not ended at t — and Flow 3
  // says a rule right in 2020 and wrong after a redesign keeps governing 2020.
  // So RULE_ENDED '.x' at T3 and a re-mark of '.x' at T5 leave the page holding
  // r_a [T09, T3) and r_b [T5, ∞): both LIVE at T14, and exactly one — r_a —
  // GOVERNING it. A2's invariant is one rule governing any t; two live rules
  // for one selector across disjoint spans is the page working as designed,
  // never a defect to throw on.
  // r_a governs [T2, T3); r_b governs [T5, ∞). At T2 r_a is in force; at T14
  // both are live and neither is in force — the gap-fill.
  const rA = rule('r_a', '.x', T2, 'd3', T3);
  const rB = rule('r_b', '.x', T5, 'd5');
  const disjoint = () => {
    rulesFind.mockResolvedValue([r1, rA, rB]);
    decisionsFind.mockResolvedValue(
      log([r1, rA, rB], [D.corrected(T09), D.accepted(T09), D.corrected(T2), D.accepted(T2), D.corrected(T5)]),
    );
  };

  it('a selector in force through one of two disjoint live rules is CONTINUE — no throw, no rule touched', async () => {
    disjoint();
    pageWith({ draftCapture: T2, draftSelectors: ['.ticker', '.x'] });
    rowFind.mockResolvedValue({ id: `row-${T2}`, trackedUrlId: TRACKED, waybackTimestamp: T2, status: 'ACQUIRED' });
    const result = await approve(undefined, T2);
    expect(result['code']).toBeUndefined();
    expect(decisionsCreated().map((d) => d['type'])).toEqual(['CAPTURE_ACCEPTED']);
    expect(rulesCreated()).toEqual([]);
    expect(ruleUpdates()).toEqual([]);
    expect(result['changes']).toEqual({ added: [], ended: [], trusted: [], extended: [] });
  });

  // At T14 neither governs; both are live. Only the one with the EARLIEST
  // validFrom can be extended without overlap — extending r_b to T14 would put
  // two rules in force at T2.
  it('a gap-fill before both extends the live rule with the earliest validFrom, and leaves the later one alone', async () => {
    disjoint();
    pageWith({ draftSelectors: ['.ticker', '.x'] });
    const result = await approve();
    expect(result['code']).toBeUndefined();
    expect(decisionsCreated().filter((d) => d['type'] === 'RULE_EXTENDED')).toEqual([
      expect.objectContaining({ ruleId: 'r_a', waybackTimestamp: T14 }),
    ]);
    expect(ruleUpdates()).toEqual([{ id: 'r_a', validFrom: T14 }]);
    expect(result['changes']).toEqual({ added: [], ended: [], trusted: [], extended: [{ ruleId: 'r_a', selector: '.x' }] });
  });
});

describe('approve_article_rules — what it leaves alone', () => {
  it('never writes the work-list row — acquisition is the walk’s retry', async () => {
    pageWith({ draftSelectors: ['.ticker', '.share'] });
    await approve();
    expect(rowUpdate).not.toHaveBeenCalled();
  });

  it('accepts a correction on an ACQUIRED capture the same way — Flow 3', async () => {
    pageWith({ draftSelectors: ['.ticker', '.share'] }, 'ACQUIRED');
    const result = await approve();
    expect(result['code']).toBeUndefined();
    expect(rulesCreated()).toEqual([expect.objectContaining({ selector: '.share', validFrom: T14 })]);
    expect(rowUpdate).not.toHaveBeenCalled();
  });
});

describe('approve_article_rules — the draft and the return', () => {
  it('clears the draft after the promotion', async () => {
    await approve();
    expect(trackedUpdate).toHaveBeenCalledWith({
      where: { id: TRACKED },
      data: { draftCapture: null, draftSelectors: [], draftTrusted: [], draftReturnedAt: null },
    });
  });

  // RULED: `rules` is what is IN FORCE at the capture's timestamp after the
  // approval — an ended rule is not — and `changes` names every rule touched,
  // by id and selector, under the decision that touched it.
  it('returns the rules in force after the approval, the changes by rule, and the sequence it reached', async () => {
    pageWith({ draftSelectors: ['.share'], draftTrusted: ['.share'] });
    const result = await approve();
    expect(Object.keys(result).sort()).toEqual(['changes', 'decisionSequence', 'rules']);
    expect(result['decisionSequence']).toBe(6);
    expect(result['rules']).toEqual([
      { ruleId: 'rule-new-1', selector: '.share', validFrom: T14, validTo: null, trusted: true },
    ]);
    expect(result['changes']).toEqual({
      added: [{ ruleId: 'rule-new-1', selector: '.share' }],
      ended: [{ ruleId: 'r1', selector: '.ticker' }],
      trusted: [{ ruleId: 'rule-new-1', selector: '.share' }],
      extended: [],
    });
  });

  it('names an extended rule under changes.extended', async () => {
    const later = rule('r2', '.x', T3, 'd3');
    rulesFind.mockResolvedValue([r1, later]);
    decisionsFind.mockResolvedValue(log([r1, later], [D.corrected(T09), D.accepted(T09), D.corrected(T3)]));
    pageWith({ draftSelectors: ['.ticker', '.x'] });
    const result = await approve();
    expect(result['changes']).toEqual({ added: [], ended: [], trusted: [], extended: [{ ruleId: 'r2', selector: '.x' }] });
    expect(result['rules']).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'r2', selector: '.x', validFrom: T14 })]),
    );
  });
});
