// ---------------------------------------------------------------------------
// PROMOTING A REFUTED CHANGE IS REFUSED, AND REFUSED BEFORE THE CHAIN.
//
// `promoteForensicDiff` had no behaviour test of its own. It is the path that
// registers evidence on chain, so the assertion that matters is not merely that
// it returns an error — it is that NOTHING WAS WRITTEN AND NOTHING WAS ANCHORED.
// A chain write cannot be taken back, and six mainnet anchors already rest on
// contradicted diffs.
//
// Asserting the CALLER, not the checker: `promotionBlockFor` is covered in
// isolation elsewhere, and the mutation that mattered was whether this path
// reaches it.
// ---------------------------------------------------------------------------

const db = { diff: null as Record<string, unknown> | null };
const evidenceCreate = jest.fn();
const registerOnChain = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: { findUnique: jest.fn(async () => db.diff) },
    evidence: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: evidenceCreate,
    },
  },
}));

jest.mock('../src/services/evidenceOnChain', () => ({
  registerEvidenceOnChain: registerOnChain,
}));

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => ({})),
}));

import { createHash } from 'crypto';
import { promoteForensicDiff } from '../src/services/promoteForensicDiff';
import { survivalSourceStateHash } from '../src/lib/diffSurvival';
import { TEXT_VERSION } from './helpers/survivalFixture';

const DIFF_ID = 'diff-1';

/** Long enough to clear the presence floor, so a match is a finding not a coincidence. */
const SENTENCE =
  'The Ministry stated that side effects are mild and temporary in all reported cases.';

const BEFORE_HASH = 'a'.repeat(64);
const AFTER_HASH = 'b'.repeat(64);

function snapshotIdentity(textHash: string): Record<string, unknown> {
  return {
    waybackTimestamp: '20220905000000',
    contentHash: createHash('sha256').update(textHash).digest('hex'),
    textHash,
    textExtractionVersion: TEXT_VERSION,
  };
}

function diffRow(survival: Record<string, unknown>): Record<string, unknown> {
  return {
    id: DIFF_ID,
    trackedUrl: { url: 'https://corona.health.gov.il/vaccine-for-covid/' },
    beforeDate: '2022-09-05',
    afterDate: '2022-09-06',
    snapshotUrl: 'https://web.archive.org/web/20220906/x',
    aiSignificance: 'הוסרה טענה',
    investigativeCategories: [],
    deletedText: '[]',
    addedText: '[]',
    rawDeletedText: JSON.stringify([SENTENCE]),
    rawAddedText: '[]',
    beforeSnapshot: snapshotIdentity(BEFORE_HASH),
    afterSnapshot: snapshotIdentity(AFTER_HASH),
    ...survival,
  };
}

/** A stored verdict that `survivalStateOf` reads as CURRENT. */
function verdict(value: 'CONTRADICTED' | 'SURVIVES'): Record<string, unknown> {
  return {
    survivalVerdict: value,
    survivalTextVersion: TEXT_VERSION,
    survivalCheckedAt: new Date('2026-08-28'),
    survivalChunksChecked: 1,
    survivalContradicted: value === 'CONTRADICTED' ? [{ side: 'REMOVED', excerpt: 'x' }] : [],
    survivalSourceStateHash: survivalSourceStateHash({
      beforeTextHash: BEFORE_HASH,
      afterTextHash: AFTER_HASH,
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
    }),
  };
}

/** No verdict at all — the state that must not read as either a pass or a refusal. */
const UNCHECKED = {
  survivalVerdict: null,
  survivalSourceStateHash: null,
  survivalTextVersion: null,
  survivalCheckedAt: null,
  survivalChunksChecked: null,
  survivalContradicted: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  registerOnChain.mockResolvedValue({ txHash: '0xdeadbeef', confirmed: true });
  evidenceCreate.mockResolvedValue({ id: 'ev-1', fileHash: 'hash' });
});

describe('a CONTRADICTED diff is never promoted', () => {
  it('refuses, and names the reason rather than a bare outcome', async () => {
    db.diff = diffRow(verdict('CONTRADICTED'));

    const result = await promoteForensicDiff(DIFF_ID);

    expect(result.outcome).toBe('contradicted');
    expect('reason' in result && result.reason).toContain('CONTRADICTED');
  });

  it('writes NOTHING and anchors NOTHING — the refusal precedes the chain', async () => {
    // The assertion that matters. A chain write cannot be taken back, and an
    // anchored record built on a refuted change is the expensive version of this
    // mistake — six of them already exist on mainnet.
    db.diff = diffRow(verdict('CONTRADICTED'));

    await promoteForensicDiff(DIFF_ID);

    expect(registerOnChain).not.toHaveBeenCalled();
    expect(evidenceCreate).not.toHaveBeenCalled();
  });
});

describe('the refusal is narrow — it blocks refutation, not uncertainty', () => {
  it('promotes a SURVIVES diff normally', async () => {
    // Vacuity guard: if promotion were broken for every input, the tests above
    // would pass while proving nothing about the verdict.
    db.diff = diffRow(verdict('SURVIVES'));

    const result = await promoteForensicDiff(DIFF_ID);

    expect(result.outcome).toBe('promoted');
    expect(registerOnChain).toHaveBeenCalledTimes(1);
  });

  it('promotes an UNCHECKED diff — a question nobody asked is not a refutation', async () => {
    // UNCHECKED must not become a block. Refusing would halt work on the strength
    // of a check that has never run, and the corpus is full of such rows until a
    // backfill has been run. It is surfaced everywhere instead, so the researcher
    // decides knowing it was never checked.
    db.diff = diffRow(UNCHECKED);

    const result = await promoteForensicDiff(DIFF_ID);

    expect(result.outcome).toBe('promoted');
  });
});
