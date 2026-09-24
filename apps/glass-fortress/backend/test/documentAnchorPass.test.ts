jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});

import { ethers } from 'ethers';
import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { toBytes32 } from '../src/lib/bytes32';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';
import { readStanding } from '../src/services/anchorDocuments';
import { openRegistryWindow, type RegistryWindow } from '../src/services/anchorSnapshots';
import { documentsOwedNow } from '../src/services/commitmentsOwed';
import { formatAnchorPass, runAnchorPass } from '../src/services/documentAnchorPass';
import { Web3Service } from '../src/services/Web3Service';
import { resetWorld, seedDocument, seedSnapshot, seedTrackedUrl } from './document/world';

// ---------------------------------------------------------------------------
// THE STANDING PASS — `forensics:anchor-documents -- --env <env>`, docs/gf-document-refactor-plan.md :198–:200; relay
// item 8 as ruled 2026-09-24. Its input is `commitments-owed`'s list (beyond the 10-minute floor); it anchors each
// through the SAME document-anchoring function `add_document` uses; it reads chain state after. A FOREIGN_SUBMITTER in
// the list stops it BEFORE THE FIRST WRITE — a defect, never a debt; the first CHAIN_UNAVAILABLE stops it, as the
// walk's memoised rejection does. The script is a printer around `runAnchorPass`; what it decides is held here.
// ---------------------------------------------------------------------------

/**
 * THE ALLOW an INJECTED window states — `openRegistryWindow`'s guard has no default (REVIEW, chunk 2 round 1). A test
 * double sends nothing to any chain; the deployment guard is the environment window's and is tested there.
 */
const INJECTED_MAY_SEND = (): boolean => true;

const REGISTRAR = '0xus';
const NOW = new Date(Date.UTC(2026, 8, 24, 12, 0, 0));
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);
const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

interface Entry {
  fileHash: string;
  submitter: string;
  category: string;
}

function chain(entries: Entry[] = [{ fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME }]) {
  const held = [...entries];
  const registrar = {
    registryAddress: '0xregistry',
    registrarAddress: REGISTRAR,
    getTotalEvidence: jest.fn(() => Promise.resolve(BigInt(held.length))),
    readEvidenceRecord: jest.fn((index: bigint) => {
      const entry = held.at(Number(index));
      return entry === undefined
        ? Promise.reject(ethers.makeError('execution reverted', 'CALL_EXCEPTION', {
            action: 'call', data: null, reason: null, transaction: { to: '0xregistry', data: '0x' }, invocation: null,
            revert: { name: 'EvidenceNotFound', signature: 'EvidenceNotFound(uint256)', args: [index] },
          }))
        : Promise.resolve({ ...entry, timestamp: 1_700_000_000 });
    }),
    isHashRegistered: jest.fn((hash: string) => {
      const index = held.findIndex((e) => e.fileHash === hash.toLowerCase());
      return Promise.resolve(index === -1 ? { registered: false, evidenceId: BigInt(0) } : { registered: true, evidenceId: BigInt(index) });
    }),
    registerEvidenceHash: jest.fn((hash: string, _submitter: string, category: string) => {
      held.push({ fileHash: hash.toLowerCase(), submitter: REGISTRAR, category });
      return Promise.resolve('0xtx' + String(held.length));
    }),
  };
  const window: RegistryWindow = openRegistryWindow(() => registrar, INJECTED_MAY_SEND);
  return { registrar, held, window, read: (d: Parameters<typeof readStanding>[1]) => readStanding(window, d) };
}

/** A HELD document received at `receivedAt`; returns its commitment. */
function document(n: number, receivedAt: Date): { commitment: string; docId: string } {
  const docId = '0x' + n.toString(16).padStart(2, '0').repeat(32);
  const salt = Buffer.alloc(32, n);
  const commitment = commitmentOf(docId, salt);
  seedDocument({ docId, commitment, salt, bytes: docId, receivedAt });
  return { commitment, docId };
}

beforeEach(() => {
  resetWorld();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the pass PAYS what is owed, through the one document-anchoring function, and reads chain state after', () => {
  it('two owed documents → two writes under DOCUMENT_COMMITMENT; the after-read owes nothing → exit 0', async () => {
    const a = document(1, hoursAgo(30));
    const b = document(2, hoursAgo(20));
    const { registrar, held, window, read } = chain();
    const result = await runAnchorPass(window, read, () => NOW);
    expect(result.before.owed.map((o) => o.commitment)).toEqual([a.commitment, b.commitment]);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(2);
    expect(held.filter((e) => e.category === DOCUMENT_COMMITMENT).map((e) => e.fileHash)).toEqual([a.commitment, b.commitment]);
    expect([result.after?.owed.length, result.exit]).toEqual([0, 0]);
  });

  it('a document YOUNGER than the floor is never listed and never paid — the receipt’s set and the pass’s are disjoint', async () => {
    const old = document(1, hoursAgo(2));
    const young = document(2, minutesAgo(3));
    const { registrar, window, read } = chain();
    const result = await runAnchorPass(window, read, () => NOW);
    expect(result.before.owed.map((o) => o.commitment)).toEqual([old.commitment]);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalledWith(young.commitment, expect.anything(), expect.anything());
    expect(result.before.younger).toBe(1);
  });

  it('a document ANCHORED by an equal attributed capture is not owed and not paid', async () => {
    const d = document(1, hoursAgo(2));
    seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), d.docId.slice(2), '20220805053301');
    const { registrar, window, read } = chain([{ fileHash: toBytes32(d.docId.slice(2)).toLowerCase(), submitter: REGISTRAR, category: ANCHOR_SCHEME }]);
    const result = await runAnchorPass(window, read, () => NOW);
    expect([result.before.owed.length, result.before.byCapture, result.exit]).toEqual([0, 1, 0]);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });
});

describe('the pass STOPS', () => {
  it('on a FOREIGN_SUBMITTER in its input — BEFORE THE FIRST WRITE, exit 1, naming the commitment (relay item 8)', async () => {
    document(1, hoursAgo(5));
    const foreign = document(2, hoursAgo(4));
    const { registrar, window, read } = chain([
      { fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME },
      { fileHash: foreign.commitment, submitter: '0xsomeoneelse', category: DOCUMENT_COMMITMENT },
    ]);
    const result = await runAnchorPass(window, read, () => NOW);
    expect(result.exit).toBe(1);
    expect(result.foreign.map((o) => o.commitment)).toEqual([foreign.commitment]);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('on the FIRST CHAIN_UNAVAILABLE — the second document is not attempted; still owed → exit 2', async () => {
    document(1, hoursAgo(5));
    document(2, hoursAgo(4));
    const { registrar, window, read } = chain();
    registrar.registerEvidenceHash.mockRejectedValueOnce(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    const result = await runAnchorPass(window, read, () => NOW);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(result.stopped?.reason).toMatch(/could not be written/);
    expect([result.after?.owed.length, result.exit]).toEqual([2, 2]);
  });
});

describe('the pass’s EXIT is its evidence (plan :210): 0 only when the AFTER-read says nothing is owed', () => {
  it('the after-read THROWS → exit 2, never 0, and the pass prints "after: not read" — REVIEW’s J8 (chunk 4 round 1)', async () => {
    document(1, hoursAgo(5));
    const { registrar, window, read } = chain();
    let wrote = false;
    const realWrite = registrar.registerEvidenceHash.getMockImplementation();
    registrar.registerEvidenceHash.mockImplementation((hash: string, submitter: string, category: string) => {
      wrote = true;
      return realWrite === undefined ? Promise.reject(new Error('no write')) : realWrite(hash, submitter, category);
    });
    const failingAfterTheWrite = (d: Parameters<typeof read>[0]): ReturnType<typeof read> =>
      wrote ? Promise.reject(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' })) : read(d);
    const result = await runAnchorPass(window, failingAfterTheWrite, () => NOW);
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(result.after).toBeNull();
    expect(result.exit).toBe(2);
    expect(formatAnchorPass(result)).toMatch(/^ {2}after: not read$/m);
  });
});

describe('get_environment’s documentsOwed — null, never 0, when the chain cannot be read (plan :201–:203)', () => {
  it('counts the owed documents beyond the floor', async () => {
    document(1, hoursAgo(5));
    document(2, minutesAgo(2));
    const { registrar } = chain();
    (Web3Service as unknown as jest.Mock).mockImplementation(() => registrar);
    expect(await documentsOwedNow(NOW)).toBe(1);
  });

  it('is NULL when the chain cannot be reached — a zero would read as "nothing owed"', async () => {
    document(1, hoursAgo(5));
    (Web3Service as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('RPC_URL environment variable is not set.');
    });
    expect(await documentsOwedNow(NOW)).toBeNull();
  });
});
