jest.mock('../src/lib/prisma', () => ({
  prisma: { urlSnapshot: { update: jest.fn(), count: jest.fn() } },
}));
jest.mock('../src/services/onChainVerification', () => ({
  recordOnChainCheckNeverThrowing: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});

import { ethers } from 'ethers';
import { prisma } from '../src/lib/prisma';
import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { inADeployment } from '../src/lib/inADeployment';
import {
  anchorDocumentCommitment,
  ChainUnavailableError,
  NotInADeploymentError,
  openRegistryWindow,
  openWalkRegistryWindow,
  RegistryFrozenError,
  type CaptureRegistrar,
} from '../src/services/anchorSnapshots';
import { anchorDocument } from '../src/services/anchorDocuments';
import { DuplicateEvidenceError, Web3Service } from '../src/services/Web3Service';
import { recordOnChainCheckNeverThrowing } from '../src/services/onChainVerification';

// ---------------------------------------------------------------------------
// DOCUMENT STEP 31, CHUNK 2 — the anchoring module's SECOND CALLER, the document-anchoring function over it, and the
// deployment guard on the window the module builds from the environment.
// docs/gf-document-refactor-plan.md :193–:200; docs/gf-document-flows.md §4 :410–:427, :444–:450; sketch (b), (b′).
//
// THE DOUBLE ANSWERS WHAT THE REAL CONTRACT ANSWERS (R80-state §8): `isRegistered` of an absent hash is `(false, 0)`
// and index 0 is ALSO a real index (EvidenceRegistry.sol :150–:153); failures are ethers' own error shapes, built with
// `ethers.makeError`, so `ethers.isError` sees them exactly as it sees the real client's.
// ---------------------------------------------------------------------------

const REGISTRAR = '0xus';
const COMMITMENT = '0x' + 'c0'.repeat(32);
const OTHER = '0x' + 'd1'.repeat(32);
/** A document the capture arm is never asked about — the commitment arm alone, as chunk 2 built it (`held: false`). */
const unheld = (commitment: string) => ({ commitment, docId: '0x' + 'e7'.repeat(32), held: false });

interface Entry {
  fileHash: string;
  submitter: string;
  category: string;
}

/** A registry as the contract holds it: entries in order, a hash → index map, and the ONE write. */
function chain(entries: Entry[] = [{ fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME }]) {
  const held = [...entries];
  const registrar = {
    registryAddress: '0xregistry',
    registrarAddress: REGISTRAR,
    getTotalEvidence: jest.fn(() => Promise.resolve(BigInt(held.length))),
    readEvidenceRecord: jest.fn((index: bigint) => {
      const entry = held.at(Number(index));
      if (entry === undefined || Number(index) < 0) {
        return Promise.reject(ethers.makeError('execution reverted', 'CALL_EXCEPTION', {
          action: 'call', data: null, reason: null, transaction: { to: '0xregistry', data: '0x' }, invocation: null,
          revert: { name: 'EvidenceNotFound', signature: 'EvidenceNotFound(uint256)', args: [index] },
        }));
      }
      return Promise.resolve({ ...entry, timestamp: 1_700_000_000 });
    }),
    isHashRegistered: jest.fn((hash: string) => {
      const index = held.findIndex((e) => e.fileHash === hash.toLowerCase());
      return Promise.resolve(index === -1 ? { registered: false, evidenceId: BigInt(0) } : { registered: true, evidenceId: BigInt(index) });
    }),
    registerEvidenceHash: jest.fn((hash: string, _submitter: string, category: string) => {
      if (held.some((e) => e.fileHash === hash.toLowerCase())) return Promise.reject(new DuplicateEvidenceError(hash));
      held.push({ fileHash: hash.toLowerCase(), submitter: REGISTRAR, category });
      return Promise.resolve('0xtx' + String(held.length));
    }),
  } satisfies CaptureRegistrar;
  return { registrar, held };
}

/**
 * THE ALLOW an INJECTED window states — `openRegistryWindow`'s guard has no default (document step 31, REVIEW
 * chunk 2 round 1), so every window this file builds over a double names what it allows. A test double sends
 * nothing to any chain; the deployment guard is the environment window's and is tested there.
 */
const INJECTED_MAY_SEND = (): boolean => true;

beforeEach(() => jest.clearAllMocks());

describe('anchorDocumentCommitment — the module’s second caller, BY ADDITION (plan :193–:194)', () => {
  it('registers the commitment under DOCUMENT_COMMITMENT, as bytes32, through the module’s one write', async () => {
    const { registrar, held } = chain();
    await anchorDocumentCommitment(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), COMMITMENT);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledWith(COMMITMENT, '0x0000000000000000000000000000000000000000', DOCUMENT_COMMITMENT);
    expect(held.at(-1)).toEqual({ fileHash: COMMITMENT, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT });
  });

  it('STORES NOTHING — ANCHORED(d) is read from chain state, never written to a row (A3 :1366, :1389)', async () => {
    const { registrar } = chain();
    await anchorDocumentCommitment(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), COMMITMENT);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
    expect(recordOnChainCheckNeverThrowing).not.toHaveBeenCalled();
  });

  it('WRITES_ALLOWED is evaluated IN THE MODULE: a frozen registry refuses and nothing is written', async () => {
    const { registrar } = chain([{ fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: 'Public Health,Vaccine Safety' }]);
    await expect(anchorDocumentCommitment(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), COMMITMENT)).rejects.toBeInstanceOf(RegistryFrozenError);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('a network failure on the write is CHAIN_UNAVAILABLE, phase WRITE — the walk’s own mapping, one spelling', async () => {
    const { registrar } = chain();
    registrar.registerEvidenceHash.mockRejectedValueOnce(ethers.makeError('request timeout', 'TIMEOUT', { operation: 'send' }));
    const attempt = anchorDocumentCommitment(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), COMMITMENT);
    await expect(attempt).rejects.toBeInstanceOf(ChainUnavailableError);
    await expect(attempt).rejects.toMatchObject({ phase: 'WRITE' });
  });
});

describe('anchorDocument — the ONE document-anchoring function (§4 :408): chain state before every write, and after', () => {
  it('UNREGISTERED → one write, then read back ATTRIBUTED', async () => {
    const { registrar } = chain();
    const outcome = await anchorDocument(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), unheld(COMMITMENT));
    expect(outcome).toEqual({ anchored: true, by: 'COMMITMENT', wrote: true });
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
  });

  it('already ATTRIBUTED → NO write: the before-read answers it (the timeout-after-send world, sketch C3)', async () => {
    const { registrar } = chain([
      { fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME },
      { fileHash: COMMITMENT, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT },
    ]);
    expect(await anchorDocument(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), unheld(COMMITMENT))).toEqual({ anchored: true, by: 'COMMITMENT', wrote: false });
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('a commitment at INDEX 0 is registered — `(true, 0)` is an answer, never "absent"', async () => {
    const { registrar } = chain([{ fileHash: COMMITMENT, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT }]);
    expect(await anchorDocument(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), unheld(COMMITMENT))).toEqual({ anchored: true, by: 'COMMITMENT', wrote: false });
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('FOREIGN_SUBMITTER THROWS, naming the commitment — a defect, never a debt (§4 :440, relay item 8)', async () => {
    const { registrar } = chain([
      { fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME },
      { fileHash: COMMITMENT, submitter: '0xsomeoneelse', category: DOCUMENT_COMMITMENT },
    ]);
    await expect(anchorDocument(openRegistryWindow(() => registrar, INJECTED_MAY_SEND), unheld(COMMITMENT))).rejects.toThrow(COMMITMENT);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('TWO CONCURRENT first sends of one commitment produce ONE submit — the in-process lock (relay item 8)', async () => {
    const { registrar } = chain();
    const window = openRegistryWindow(() => registrar, INJECTED_MAY_SEND);
    const [a, b] = await Promise.all([anchorDocument(window, unheld(COMMITMENT)), anchorDocument(window, unheld(COMMITMENT))]);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect([a.anchored, b.anchored]).toEqual([true, true]);
  });

  it('the lock is PER COMMITMENT — two different commitments each write', async () => {
    const { registrar } = chain();
    const window = openRegistryWindow(() => registrar, INJECTED_MAY_SEND);
    await Promise.all([anchorDocument(window, unheld(COMMITMENT)), anchorDocument(window, unheld(OTHER))]);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(2);
  });

  it('the lock is RELEASED on failure — the next attempt asks the chain again', async () => {
    const { registrar } = chain();
    const window = openRegistryWindow(() => registrar, INJECTED_MAY_SEND);
    registrar.registerEvidenceHash.mockRejectedValueOnce(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    await expect(anchorDocument(window, unheld(COMMITMENT))).rejects.toBeInstanceOf(ChainUnavailableError);
    expect(await anchorDocument(window, unheld(COMMITMENT))).toEqual({ anchored: true, by: 'COMMITMENT', wrote: true });
  });
});

describe('the deployment guard — Q8 RULED: the window the module builds FROM THE ENVIRONMENT refuses a write outside one', () => {
  const Web3 = Web3Service as unknown as jest.Mock;
  const saved = process.env['RAILWAY_DEPLOYMENT_ID'];
  afterEach(() => {
    if (saved === undefined) delete process.env['RAILWAY_DEPLOYMENT_ID'];
    else process.env['RAILWAY_DEPLOYMENT_ID'] = saved;
  });

  it('inADeployment is RAILWAY_DEPLOYMENT_ID set and non-empty — a pure read of the environment it is handed', () => {
    expect([inADeployment({}), inADeployment({ RAILWAY_DEPLOYMENT_ID: '' }), inADeployment({ RAILWAY_DEPLOYMENT_ID: 'dep-1' })]).toEqual([false, false, true]);
  });

  it('REFUSES A WRITE without the variable: CHAIN_UNAVAILABLE, its cause NotInADeploymentError, and Web3Service is never asked to write', async () => {
    delete process.env['RAILWAY_DEPLOYMENT_ID'];
    const { registrar } = chain();
    Web3.mockImplementation(() => registrar);
    const attempt = anchorDocumentCommitment(openWalkRegistryWindow(), COMMITMENT);
    await expect(attempt).rejects.toBeInstanceOf(ChainUnavailableError);
    await expect(attempt).rejects.toMatchObject({ phase: 'WRITE', cause: expect.any(NotInADeploymentError) as unknown });
    await expect(attempt).rejects.toThrow('only inside a deployment');
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('a READ passes without the variable — WRITES_ALLOWED and attribution are still read from the chain', async () => {
    delete process.env['RAILWAY_DEPLOYMENT_ID'];
    const { registrar } = chain();
    Web3.mockImplementation(() => registrar);
    const window = openWalkRegistryWindow();
    await expect(window.writable()).resolves.toEqual({ allowed: true });
    const client = await window.registrar();
    await expect(client.isHashRegistered(COMMITMENT)).resolves.toEqual({ registered: false, evidenceId: BigInt(0) });
    expect(registrar.getTotalEvidence).toHaveBeenCalled();
  });

  it('inside a deployment the write goes through to the registrar', async () => {
    process.env['RAILWAY_DEPLOYMENT_ID'] = 'dep-1';
    const { registrar } = chain();
    Web3.mockImplementation(() => registrar);
    await anchorDocumentCommitment(openWalkRegistryWindow(), COMMITMENT);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
  });
});
