// ---------------------------------------------------------------------------
// ONE SPELLING FOR `anchoredHash`, ACROSS THE WRITE PATH AND THE LOOKUP.
//
// MOVED HERE AT EVIDENCE STEP 11a from `anchoredHashOneSpelling.test.ts`, which
// went with `confirmAnchors` — the receipt-reading writer evidence flows §8
// retires in favour of chain state. Three of that file's five cases were about
// that writer and died with it; these are about the seam that outlives it, and
// they are moved as ASSERTIONS ABOUT THE SURVIVING CONTRACT rather than copied
// with their old fixtures (refactor plan §4, migrating assertions not files).
//
// WHAT REMAINS IS STILL A SEAM, WHICH IS WHY IT IS STILL A FILE. `anchorSnapshots`
// writes the column; `capturesAnchoredBy` in `src/lib/anchoredCaptureHash.ts`
// joins on it by SQL EQUALITY, and SQL cannot normalise the column side of a
// comparison. Each is internally consistent, each has its own suite, and the
// defect lived only between them: on 2026-08-30 the Level 3 positive control
// anchored seven captures correctly and then watched all seven audit STALE, with
// `VERIFIED` unreachable for every snapshot that has ever existed
// (`docs/gf-positive-control-2026-08-30.md`). A second writer is what made that
// possible; one writer is not what makes it impossible.
//
// THE THIRD CASE IS THE DECOY AND IS NOT OPTIONAL. Without it the two above
// could both pass against a lookup that matched anything and report a fixed
// codebase forever. It is carried over one case beyond the reviewer's list for
// that reason, and the reason is stated rather than assumed.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
  },
}));
const mockWeb3 = {
  isHashRegistered: jest.fn(),
  registerEvidenceHash: jest.fn(),
};
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));
jest.mock('../src/services/onChainVerification', () => ({
  recordOnChainCheckNeverThrowing: jest.fn().mockResolvedValue(undefined),
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  anchorAcquiredCapture,
  openRegistryWindow,
  type CaptureRegistrar,
} from '../src/services/anchorSnapshots';
import { capturesAnchoredBy, storedAnchorHash } from '../src/lib/anchoredCaptureHash';

/** The document hash a capture carries, as the database stores it: bare hex. */
const DOCUMENT = 'a'.repeat(64);

/** An EMPTY registry, so WRITES_ALLOWED passes and the write path reaches its one write. */
function emptyRegistrar(): CaptureRegistrar {
  return {
    registryAddress: '0xregistry',
    registrarAddress: '0xus',
    getTotalEvidence: jest.fn().mockResolvedValue(BigInt(0)),
    readEvidenceRecord: jest.fn(),
    isHashRegistered: mockWeb3.isHashRegistered,
    registerEvidenceHash: mockWeb3.registerEvidenceHash,
  };
}

beforeEach(() => jest.clearAllMocks());

/**
 * Does the `where` fragment `capturesAnchoredBy` builds match a row holding
 * `value` in `anchoredHash`?
 *
 * Evaluated here rather than by hitting Postgres, because the fragment is
 * data — and reading it is exactly what nobody did. The first arm is the one
 * that matters: it is the only arm an anchored row can satisfy, since the second
 * requires `anchoredHash: null`.
 */
function lookupMatches(where: Prisma.UrlSnapshotWhereInput, value: string): boolean {
  const arms = (where.OR ?? []) as { anchoredHash?: string | null; documentHash?: string }[];
  return arms.some((arm) => arm.anchoredHash === value);
}

/** What `anchorAcquiredCapture` actually wrote to `anchoredHash`. */
async function whatTheWritePathStored(): Promise<string> {
  mockWeb3.registerEvidenceHash.mockResolvedValue('0xtx');

  await anchorAcquiredCapture(openRegistryWindow(emptyRegistrar), 'snap-1', { documentHash: DOCUMENT });

  const call = (prisma.urlSnapshot.update as jest.Mock).mock.calls.at(0) as
    | [{ data: { anchoredHash: string } }]
    | undefined;
  if (!call) throw new Error('the write path stored nothing — the fixture is wrong, not the code');
  return call[0].data.anchoredHash;
}

describe('one spelling for anchoredHash, across the write path and the lookup', () => {
  it('the write path stores a value its own lookup finds', async () => {
    const storedValue = await whatTheWritePathStored();
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), storedValue)).toBe(true);
  });

  it('normalises every spelling the chain can hand us, including upper case', async () => {
    // MOVED OFF `confirmAnchors`, WHICH IS HOW THIS CASE USED TO REACH THE RULE.
    // The chain hands back `0x`-prefixed and sometimes upper-case hex, and the
    // normaliser is what every writer must pass through — `capturesAnchoredBy`
    // did not lower-case while `attestationOf` did, so the module built to end
    // duplicate implementations held two that disagreed. The rule is unchanged;
    // it is now asserted on the branded normaliser itself rather than through a
    // retired writer, which is the only thing that moved.
    const storedValue = storedAnchorHash(`0X${DOCUMENT.toUpperCase()}`);
    expect(storedValue).toBe(DOCUMENT);
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), storedValue)).toBe(true);
    expect(storedAnchorHash(`0x${DOCUMENT}`)).toBe(await whatTheWritePathStored());
  });

  it('DETECTS the defect it was written for — proven against the old behaviour', () => {
    // Without this, the assertions above could pass against a lookup that matched
    // anything and report a fixed codebase forever. This pins that the OLD stored
    // form — `0x`-prefixed, as the retired confirm path used to write it —
    // genuinely does NOT match, so the checks are load-bearing.
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), `0x${DOCUMENT}`)).toBe(false);
  });
});
