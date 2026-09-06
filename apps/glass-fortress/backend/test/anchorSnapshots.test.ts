import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// ---------------------------------------------------------------------------
// The anchoring module: ANCHORED AS IT IS STORED, on a registry with one meaning.
//
// docs/gf-interaction-flows.md Phase 2 ("ANCHORED AS IT IS STORED. Ruled
// 2026-09-02"), docs/gf-evidence-flows.md §8 (WRITES_ALLOWED — the window held
// shut by a refusal, not a rule) and A7 (the registry's submit has ONE caller,
// and WRITES_ALLOWED is evaluated in it). This file is the successor of the
// repair pass's suite (as-built §8, amended 2026-09-06): the twin copy, the log
// recovery, copy-only and 'Wayback Snapshot' are retired with the code they
// tested. On a registry that starts at zero there is nothing to recover and a
// duplicate is a walk defect.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { urlSnapshot: { update: jest.fn(), count: jest.fn() } },
}));
jest.mock('../src/services/onChainVerification', () => ({
  recordOnChainCheckNeverThrowing: jest.fn().mockResolvedValue(undefined),
}));

import { IntegrityCheckSubject } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ANCHOR_SCHEME } from '../src/lib/anchoredCaptureHash';
import { recordOnChainCheckNeverThrowing } from '../src/services/onChainVerification';
import { ethers } from 'ethers';
import {
  anchorAcquiredCapture,
  ChainUnavailableError,
  countUnanchoredSnapshots,
  openRegistryWindow,
  RegistryFrozenError,
  writesAllowed,
  type CaptureRegistrar,
} from '../src/services/anchorSnapshots';
import { DuplicateEvidenceError } from '../src/services/Web3Service';
import { stripComments } from './detectionVersionPinned.test';
import { tsFiles } from './walk/scan';

const DOCUMENT = 'a'.repeat(64);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
/** What an old contract's index 0 carries: a classifier's category list, written as the public label. */
const CLASSIFIER_CATEGORIES = 'Public Health,Vaccine Safety';

const update = prisma.urlSnapshot.update as jest.Mock;
const verdict = recordOnChainCheckNeverThrowing as jest.Mock;

/**
 * A registry as the module reads it, from STATE: how many entries, and what
 * index 0 carries. Every chain call is a jest.fn so the test can say which were
 * made — and, for the refusal, which were not.
 */
function registrar(state: { total: number; indexZeroCategory?: string }): CaptureRegistrar {
  return {
    registryAddress: '0xregistry',
    registrarAddress: '0xus',
    getTotalEvidence: jest.fn().mockResolvedValue(BigInt(state.total)),
    readEvidenceRecord: jest.fn().mockResolvedValue({
      fileHash: `0x${'f'.repeat(64)}`,
      submitter: '0xus',
      timestamp: 1_700_000_000,
      category: state.indexZeroCategory ?? ANCHOR_SCHEME,
    }),
    isHashRegistered: jest.fn(),
    registerEvidenceHash: jest.fn().mockResolvedValue('0xtx'),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('WRITES_ALLOWED(registry) — evidence flows §8, A3', () => {
  it('an EMPTY registry allows writes, without reading an entry that does not exist', async () => {
    const reader = registrar({ total: 0 });
    await expect(writesAllowed(reader)).resolves.toEqual({ allowed: true });
    expect(reader.readEvidenceRecord).not.toHaveBeenCalled();
  });

  it('index 0 carrying ANCHOR_SCHEME allows writes', async () => {
    const reader = registrar({ total: 5, indexZeroCategory: ANCHOR_SCHEME });
    await expect(writesAllowed(reader)).resolves.toEqual({ allowed: true });
    expect(reader.readEvidenceRecord).toHaveBeenCalledWith(BigInt(0));
  });

  it("index 0 carrying a classifier's category list REFUSES, naming that category", async () => {
    // The old contracts, exactly: evidence names were registered with the
    // classifier's categories as their public label, so index 0 is a category
    // list and every write refuses. The message names it so the operator knows
    // which contract the configuration points at.
    const reader = registrar({ total: 20, indexZeroCategory: CLASSIFIER_CATEGORIES });
    await expect(writesAllowed(reader)).resolves.toEqual({
      allowed: false,
      indexZeroCategory: CLASSIFIER_CATEGORIES,
    });
  });

  it('the scheme is one importable symbol, and it is the document hash', () => {
    // Evidence A1: one constant, read by WRITES_ALLOWED and written on every
    // entry. A second spelling anywhere would let a registry stamp itself with
    // one string and refuse itself against another.
    expect(ANCHOR_SCHEME).toBe('DOCUMENT_SHA256');
  });

  it('a window reads the registry ONCE for a whole walk call', async () => {
    // "Evaluated once per call before the first anchor" (flows A5). The walk
    // opens one window per call; every anchor in that call asks the window, and
    // the window asks the chain the first time only.
    const reader = registrar({ total: 0 });
    const window = openRegistryWindow(() => reader);

    await window.writable();
    await anchorAcquiredCapture(window, 'snap-1', { documentHash: DOCUMENT });
    await anchorAcquiredCapture(window, 'snap-2', { documentHash: 'b'.repeat(64) });

    expect(reader.getTotalEvidence).toHaveBeenCalledTimes(1);
    expect(reader.registerEvidenceHash).toHaveBeenCalledTimes(2);
  });
});

describe('anchorAcquiredCapture — anchored as it is stored, awaited', () => {
  it("registers the capture's hash under ANCHOR_SCHEME and claims the anchor: tx and hash together", async () => {
    const reader = registrar({ total: 0 });

    await anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });

    expect(reader.registerEvidenceHash).toHaveBeenCalledWith(`0x${DOCUMENT}`, ZERO_ADDRESS, ANCHOR_SCHEME);
    // The transaction AND the hash it registered, written together. Writing
    // onChainTxHash alone is the gap anchoredHash exists to close; BARE is the
    // one spelling the column is stored in (anchoredHashOneSpelling.test.ts).
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { onChainTxHash: '0xtx', anchoredHash: DOCUMENT },
    });
  });

  it('0x-prefixes the bare stored hash for the chain call, and stores it bare', async () => {
    // Passing the bare form where bytes32 was required is what made 83 snapshot
    // anchorings silently no-op. The boundary converts; the column does not.
    const bare = 'abc123'.repeat(10) + 'abcd';
    const reader = registrar({ total: 0 });

    await anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-bare', { documentHash: bare });

    expect(reader.registerEvidenceHash).toHaveBeenCalledWith(`0x${bare}`, expect.any(String), ANCHOR_SCHEME);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ anchoredHash: bare }) }));
  });

  it('the registration is AWAITED: the row is claimed only after the transaction returns', async () => {
    let settle: (txHash: string) => void = () => undefined;
    const reader = registrar({ total: 0 });
    (reader.registerEvidenceHash as jest.Mock).mockReturnValue(
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
    );

    const anchoring = anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });
    await new Promise((r) => setImmediate(r));
    expect(update).not.toHaveBeenCalled();

    settle('0xlate');
    await anchoring;
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ onChainTxHash: '0xlate' }) }));
  });

  it('records the verdict AFTER the claim, against the bytes32 form of the anchored hash', async () => {
    // LEVEL 3a: every write that leaves a row asserting an anchor is checked
    // against the chain and the verdict stored — with the receipt read seconds
    // after the write, which is the property the receipt-horizon lesson wanted.
    const reader = registrar({ total: 0 });

    await anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });

    expect(verdict).toHaveBeenCalledWith({
      subjectType: IntegrityCheckSubject.URL_SNAPSHOT,
      subjectId: 'snap-1',
      fileHash: `0x${DOCUMENT}`,
    });
    const claimedAt = update.mock.invocationCallOrder.at(0);
    const checkedAt = verdict.mock.invocationCallOrder.at(0);
    expect(claimedAt).toBeDefined();
    expect(checkedAt).toBeDefined();
    expect(Number(checkedAt)).toBeGreaterThan(Number(claimedAt));
  });

  it("REFUSES a frozen registry with RegistryFrozenError naming index 0's category — and touches neither the chain nor the row", async () => {
    // Evidence A7: "a test that breaks it by pointing the configuration at a
    // contract whose index 0 is not the scheme". This is that test: the old
    // production contract's shape, and the write that would end the clean cut.
    const reader = registrar({ total: 20, indexZeroCategory: CLASSIFIER_CATEGORIES });

    const attempt = anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });

    await expect(attempt).rejects.toBeInstanceOf(RegistryFrozenError);
    await expect(attempt).rejects.toMatchObject({
      indexZeroCategory: CLASSIFIER_CATEGORIES,
      registryAddress: '0xregistry',
    });
    await expect(attempt).rejects.toThrow(CLASSIFIER_CATEGORIES);
    await expect(attempt).rejects.toThrow(ANCHOR_SCHEME);
    expect(reader.registerEvidenceHash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(verdict).not.toHaveBeenCalled();
  });

  it('a DUPLICATE on a registry that starts at zero is a walk defect: it throws and claims nothing', async () => {
    // The repair pass used to recover the registering transaction by log scan
    // and copy it. On a fresh registry every entry is ours and every capture is
    // one entry, so a duplicate means the walk anchored the same bytes twice —
    // a defect to surface, never a pointer to recover.
    const reader = registrar({ total: 3 });
    (reader.registerEvidenceHash as jest.Mock).mockRejectedValue(new DuplicateEvidenceError(`0x${DOCUMENT}`));

    await expect(
      anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT }),
    ).rejects.toBeInstanceOf(DuplicateEvidenceError);
    expect(update).not.toHaveBeenCalled();
    expect(verdict).not.toHaveBeenCalled();
  });

  it('the failure reason surfaces — nothing is swallowed, nothing is claimed', async () => {
    // The old path logged the rejection and returned null, so a permanent
    // defect (bare hex where bytes32 was required) was indistinguishable from a
    // chain that was down. Awaited and thrown, the walk halts with the reason.
    const reader = registrar({ total: 0 });
    (reader.registerEvidenceHash as jest.Mock).mockRejectedValue(new Error('invalid BytesLike value'));

    await expect(
      anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT }),
    ).rejects.toThrow('invalid BytesLike value');
    expect(update).not.toHaveBeenCalled();
  });

  // THE CHAIN NOT ANSWERING IS ONE ERROR, ChainUnavailableError, whichever step
  // could not be taken (ruled 2026-09-06, Q8): the walk answers it as the
  // CHAIN_UNAVAILABLE refusal. The chain ANSWERING — a duplicate, a revert, a
  // rejected argument — is never this error.
  it('a registry that cannot be read refuses every anchor of the window with the same reason, as CHAIN UNAVAILABLE', async () => {
    // The window memoises the READ, rejection included: a call whose registry
    // read failed halts at its first anchor and does not retry the chain per
    // capture. The next walk call opens a new window and asks again.
    const reader = registrar({ total: 0 });
    (reader.getTotalEvidence as jest.Mock).mockRejectedValue(new Error('no backend is currently healthy'));
    const window = openRegistryWindow(() => reader);

    const first = anchorAcquiredCapture(window, 'snap-1', { documentHash: DOCUMENT });
    await expect(first).rejects.toBeInstanceOf(ChainUnavailableError);
    await expect(first).rejects.toThrow('no backend is currently healthy');
    await expect(first).rejects.toMatchObject({ phase: 'READ' });
    await expect(anchorAcquiredCapture(window, 'snap-2', { documentHash: DOCUMENT })).rejects.toThrow(
      'no backend is currently healthy',
    );
    expect(reader.getTotalEvidence).toHaveBeenCalledTimes(1);
    expect(reader.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('a registrar that cannot be CONSTRUCTED — the deployment did not configure a chain — is CHAIN UNAVAILABLE, connected once', async () => {
    // What `new Web3Service()` does without RPC_URL, REGISTRAR_PRIVATE_KEY or
    // EVIDENCE_REGISTRY_ADDRESS: an unconfigured chain is an outage, never a
    // fact about the capture, and it is asked once per window.
    const connect = jest.fn(() => {
      throw new Error('RPC_URL environment variable is not set.');
    });
    const window = openRegistryWindow(connect);

    const attempt = anchorAcquiredCapture(window, 'snap-1', { documentHash: DOCUMENT });
    await expect(attempt).rejects.toBeInstanceOf(ChainUnavailableError);
    await expect(attempt).rejects.toThrow('RPC_URL environment variable is not set.');
    await expect(attempt).rejects.toMatchObject({ phase: 'CONNECT' });
    await expect(window.writable()).rejects.toBeInstanceOf(ChainUnavailableError);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('the registrar is connected on first need, never when the window is opened', async () => {
    // A call that acquires nothing never touches the chain's configuration.
    const connect = jest.fn(() => registrar({ total: 0 }));
    openRegistryWindow(connect);
    expect(connect).not.toHaveBeenCalled();
  });

  it('a network failure on the WRITE is CHAIN UNAVAILABLE and claims nothing; a contract answer is not', async () => {
    const reader = registrar({ total: 0 });
    (reader.registerEvidenceHash as jest.Mock).mockRejectedValueOnce(
      ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }),
    );

    const outage = anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });
    await expect(outage).rejects.toBeInstanceOf(ChainUnavailableError);
    await expect(outage).rejects.toMatchObject({ phase: 'WRITE' });
    expect(update).not.toHaveBeenCalled();

    // The chain ANSWERED: a revert is the contract's verdict on the write, a defect
    // to surface as itself — the CALL_EXCEPTION the registrar maps and rethrows.
    (reader.registerEvidenceHash as jest.Mock).mockRejectedValueOnce(
      ethers.makeError('execution reverted', 'CALL_EXCEPTION', {
        action: 'estimateGas',
        data: null,
        reason: null,
        transaction: { to: '0xregistry', data: '0x' },
        invocation: null,
        revert: null,
      }),
    );
    const answered = anchorAcquiredCapture(openRegistryWindow(() => reader), 'snap-1', { documentHash: DOCUMENT });
    await expect(answered).rejects.not.toBeInstanceOf(ChainUnavailableError);
    await expect(answered).rejects.toThrow('execution reverted');
  });
});

describe('countUnanchoredSnapshots', () => {
  it('counts from state, not from a write-time tally', async () => {
    // A counter incremented where the write happens reports zero failures for a
    // run whose every attempt was swallowed. This asks the database instead.
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(83);

    expect(await countUnanchoredSnapshots()).toBe(83);
    expect((prisma.urlSnapshot.count as jest.Mock).mock.calls[0][0].where).toMatchObject({
      onChainTxHash: null,
    });
  });
});

// ---------------------------------------------------------------------------
// THE REGISTRY'S SUBMIT HAS ONE CALLER — evidence A7, architecture §9.8.
//
// SCOPED TO THE WALK AND THE STORE, deliberately. The legacy evidence writers —
// promoteForensicDiff (evidenceOnChain.ts), the public /confirm route
// (evidenceRoutes.ts) and forensics:rehash-evidence — still call
// registerEvidenceHash directly until the evidence steps retire them (refactor
// plan §3b, step 16); the freeze rule covers them on staging and nothing calls
// them. So the invariant this file can hold TODAY is the one the walk's
// acquisition path depends on: under src/walk and in the store, the chain is
// reached only through anchorAcquiredCapture, and the module that owns it is
// the only one that spells the submit. Widening the scope to all of src/ is
// step 16's, in the same commit that deletes the writers.
//
// A behavioural test cannot catch a re-inlined call — it would pass every test
// the day it was written and rot afterwards. So this reads the source.
// ---------------------------------------------------------------------------
describe('the registry’s submit has one caller under the walk and the store', () => {
  const SRC = join(__dirname, '..', 'src');
  const ANCHORING_MODULE = join(SRC, 'services', 'anchorSnapshots.ts');
  const STORE = join(SRC, 'services', 'recordCapture.ts');
  const SUBMIT = /registerEvidenceHash\s*\(/g;
  /** A call handing the anchoring module a hash rather than the capture. */
  const HASH_PICKED_BY_CALLER = /anchorAcquiredCapture\([^)]*Hash\b[^)]*\)/;

  const scope = [...tsFiles(join(SRC, 'walk')), STORE, ANCHORING_MODULE];
  const codeOf = (file: string) => stripComments(readFileSync(file, 'utf8'));
  const rel = (file: string) => file.slice(SRC.length + 1);

  it('scans the walk at all — a silent zero would make this vacuous', () => {
    expect(tsFiles(join(SRC, 'walk')).length).toBeGreaterThan(0);
  });

  it('exactly one module in scope calls the submit, and it calls it once', () => {
    const callers = scope
      .map((file) => ({ file: rel(file), calls: [...codeOf(file).matchAll(SUBMIT)].length }))
      .filter((f) => f.calls > 0);
    expect(callers).toEqual([{ file: 'services/anchorSnapshots.ts', calls: 1 }]);
  });

  it('the store reaches the chain only through anchorAcquiredCapture, awaited', () => {
    const store = codeOf(STORE);
    // The SYMBOL in an import from the anchoring module, not one exact import
    // line — the earlier form pinned the whole clause and broke on an unrelated
    // second symbol.
    expect(store).toMatch(/import\s*\{[^}]*\banchorAcquiredCapture\b[^}]*\}\s*from\s*'\.\/anchorSnapshots'/);
    expect(store).toMatch(/await anchorAcquiredCapture\(/);
    // Anchoring a CAPTURE, never a hash the store chose itself: which hash the
    // chain attests to is `anchoredCaptureHash`'s one rule, read in the module.
    expect(store).not.toMatch(HASH_PICKED_BY_CALLER);
  });

  it('DETECTS a caller that picks the hash itself — proven against a decoy', () => {
    // The negative assertion above would pass forever if its pattern stopped
    // matching; this is the call it must see (M3, 2026-09-06).
    expect(stripComments('await anchorAcquiredCapture(window, id, row.documentHash)')).toMatch(HASH_PICKED_BY_CALLER);
    expect(stripComments('await anchorAcquiredCapture(window, created.id, created)')).not.toMatch(HASH_PICKED_BY_CALLER);
  });

  it('WRITES_ALLOWED is evaluated inside the anchoring module, before its one chain write', () => {
    const code = codeOf(ANCHORING_MODULE);
    const evaluated = code.search(/\.writable\(\)/);
    const submitted = code.search(SUBMIT);
    expect(evaluated).toBeGreaterThan(-1);
    expect(submitted).toBeGreaterThan(evaluated);
  });

  // THE ANCHORING MODULE HAS ONE CALLER TODAY — the store, on ACQUIRED (M4,
  // 2026-09-06; evidence A7: "a test that breaks it with a third caller"). Its
  // second, a document's receipt or its standing pass (document flows §4), is
  // not built; when it is, it is added HERE, deliberately, and the count moves
  // to two. Src-wide, because a caller anywhere else is a research act reaching
  // the chain by a side door.
  it('anchorAcquiredCapture is called from exactly one module under src — the store — at its two sites', () => {
    // Two calls in one module: the first anchor after the row is created, and
    // the retry on a held row whose anchor was owed. A third — anywhere — is
    // the third caller A7's test exists to break.
    const CALL = /(?<![\w.]|function\s)anchorAcquiredCapture\s*\(/g;
    const callers = tsFiles(SRC)
      .map((file) => ({ file: rel(file), calls: [...codeOf(file).matchAll(CALL)].length }))
      .filter((f) => f.calls > 0);
    expect(callers).toEqual([{ file: 'services/recordCapture.ts', calls: 2 }]);
  });

  it('DETECTS a third caller — proven against a decoy', () => {
    const CALL = /(?<![\w.]|function\s)anchorAcquiredCapture\s*\(/g;
    const decoy = stripComments(`
      export async function anchorAcquiredCapture(window, id, capture) {}   // the definition is not a call
      // anchorAcquiredCapture( in a comment must not count
      await anchorAcquiredCapture(window, row.snapshotId, row);
    `);
    expect([...decoy.matchAll(CALL)]).toHaveLength(1);
  });

  it('DETECTS a re-inlined registration — proven against a decoy', () => {
    // Without this, a pattern that silently stopped matching would report a
    // clean codebase forever.
    const decoy = stripComments(`
      // registerEvidenceHash( in a comment must NOT trip it
      const txHash = await web3.registerEvidenceHash(toBytes32(hash), ZERO, ANCHOR_SCHEME);
      await prisma.urlSnapshot.update({ where: { id }, data: { onChainTxHash: txHash } });
    `);
    expect([...decoy.matchAll(SUBMIT)]).toHaveLength(1);
  });
});
