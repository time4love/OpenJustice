jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});

import { ethers } from 'ethers';
import type { Document } from '@prisma/client';
import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { toBytes32 } from '../src/lib/bytes32';
import { addDocument, type AddDocumentAnswer } from '../src/services/addDocument';
import { anchoredOf } from '../src/services/anchorDocuments';
import { openDocumentRegistryWindow } from '../src/services/anchorSnapshots';
import { verifiedDocument } from '../src/services/documentPredicates';
import { listDocuments, readDocument } from '../src/services/readDocument';
import { DuplicateEvidenceError, Web3Service } from '../src/services/Web3Service';
import { fixture, nameOf, resetWorld, seedObject, seedResearcher, seedSnapshot, seedTrackedUrl, store } from './document/world';

// ---------------------------------------------------------------------------
// DOCUMENT STEP 31, CHUNK 3 — ANCHORED(d) ON EVERY READ, BOTH ARMS, AND `add_document` ANCHORING AT RECEIPT.
// docs/gf-document-refactor-plan.md :195–:197, :208–:209; docs/gf-document-flows.md §4 :440–:450, A3 :1366 as ruled
// 2026-09-24 (the capture arm); sketch (b), (b′), (c), C3; relay items [1], [7], [8].
//
// "A receipt is never refused for the chain" (plan :196): every failure below completes the receipt OWED. Each case
// ALSO asserts the chain was ASKED — so a receipt that never tried (the step-30 code) cannot pass as one that tried and
// owed. The double is the real contract's answers (R80-state §8): `isRegistered` absent → (false, 0); ethers' own error
// shapes via `ethers.makeError`; `DuplicateEvidenceError` as Web3Service throws it.
// ---------------------------------------------------------------------------

const REGISTRAR = '0xus';
const PDF = fixture('PDF_TEXT_LAYER');
const DOC_ID = nameOf(PDF.bytes);
const TITLE = 'the circular';

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
      if (entry === undefined) {
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
  };
  (Web3Service as unknown as jest.Mock).mockImplementation(() => registrar);
  return { registrar, held };
}

const isAnswer = (a: unknown): a is AddDocumentAnswer => typeof (a as AddDocumentAnswer).commitment === 'string';

async function receive(): Promise<AddDocumentAnswer> {
  const answer = await addDocument({ docId: DOC_ID, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
  if (!isAnswer(answer)) throw new Error(`add_document refused: ${JSON.stringify(answer)}`);
  return answer;
}

/** The receipt completed: its Document row and its arrival are stored whatever the chain did. */
function receiptStored(answer: AddDocumentAnswer, arrivals = 1): void {
  expect(store.documents.filter((d) => d['commitment'] === answer.commitment)).toHaveLength(1);
  expect(store.arrivalDocuments.filter((a) => a['commitment'] === answer.commitment)).toHaveLength(arrivals);
}

const saved = process.env['RAILWAY_DEPLOYMENT_ID'];
beforeEach(() => {
  resetWorld();
  jest.clearAllMocks();
  (Web3Service as unknown as jest.Mock).mockReset();
  seedResearcher('res_1', 'researcher-one');
  seedObject(DOC_ID, PDF.bytes);
  process.env['RAILWAY_DEPLOYMENT_ID'] = 'dep-1';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  if (saved === undefined) delete process.env['RAILWAY_DEPLOYMENT_ID'];
  else process.env['RAILWAY_DEPLOYMENT_ID'] = saved;
  jest.restoreAllMocks();
});

describe('add_document anchors on the FIRST arrival, after the receipt commits (plan :195; relay item 8)', () => {
  it('the first arrival submits ONCE, under DOCUMENT_COMMITMENT, and answers ANCHORED read back from the chain', async () => {
    const { registrar, held } = chain();
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(held.at(-1)).toEqual({ fileHash: answer.commitment, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT });
    expect(answer.anchored).toBe(true);
    receiptStored(answer);
  });

  it('a SECOND arrival of a still-OWED document writes NOTHING to the chain — the pass pays it', async () => {
    delete process.env['RAILWAY_DEPLOYMENT_ID'];
    const { registrar } = chain();
    await receive();
    process.env['RAILWAY_DEPLOYMENT_ID'] = 'dep-1';
    registrar.registerEvidenceHash.mockClear();
    const second = await receive();
    expect(second.existed).toBe(true);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
    expect(second.anchored).toBe(false);
    expect(registrar.isHashRegistered).toHaveBeenCalledWith(second.commitment);
    receiptStored(second, 2);
  });
});

describe('[7] — a receipt OUTSIDE a deployment completes OWED (the deployment guard, Q8 as ruled)', () => {
  it('no RAILWAY_DEPLOYMENT_ID: the receipt completes, nothing is sent, the chain was read, ANCHORED is false', async () => {
    delete process.env['RAILWAY_DEPLOYMENT_ID'];
    const { registrar } = chain();
    const answer = await receive();
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
    expect(registrar.getTotalEvidence).toHaveBeenCalled();
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });
});

describe('C2 — every chain failure completes the receipt OWED, and the chain WAS asked (plan :196, §4 :444)', () => {
  it('CONNECT: the registrar cannot be constructed — a plain Error from Web3Service’s constructor', async () => {
    (Web3Service as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('RPC_URL environment variable is not set.');
    });
    const answer = await receive();
    expect(Web3Service).toHaveBeenCalled();
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('READ: the registry cannot be read — ethers NETWORK_ERROR on totalEvidence()', async () => {
    const { registrar } = chain();
    registrar.getTotalEvidence.mockRejectedValue(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    const answer = await receive();
    expect(registrar.getTotalEvidence).toHaveBeenCalled();
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('WRITE: ethers TIMEOUT on the send', async () => {
    const { registrar } = chain();
    registrar.registerEvidenceHash.mockRejectedValue(ethers.makeError('request timeout', 'TIMEOUT', { operation: 'send' }));
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('WRITE: ethers NETWORK_ERROR on the send', async () => {
    const { registrar } = chain();
    registrar.registerEvidenceHash.mockRejectedValue(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('CODELESS ADDRESS: the plain Error assertRegistryDeployed throws — not an ethers error, still owed', async () => {
    const { registrar } = chain();
    registrar.registerEvidenceHash.mockRejectedValue(new Error('No contract at EVIDENCE_REGISTRY_ADDRESS 0xregistry on chain 84532.'));
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('DUPLICATE: DuplicateEvidenceError on the send — unreachable at a fresh salt, owed and logged', async () => {
    const { registrar } = chain();
    registrar.registerEvidenceHash.mockRejectedValue(new DuplicateEvidenceError('0x' + 'ee'.repeat(32)));
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('FROZEN: index 0 carries a classifier’s category list — nothing is sent, owed', async () => {
    const { registrar } = chain([{ fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: 'Public Health,Vaccine Safety' }]);
    const answer = await receive();
    expect(registrar.readEvidenceRecord).toHaveBeenCalledWith(BigInt(0));
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });

  it('ATTRIBUTION DISAGREEMENT: isRegistered names an index whose entry is another hash — no verdict, owed', async () => {
    const { registrar } = chain();
    registrar.isHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(0) });
    const answer = await receive();
    expect(registrar.isHashRegistered).toHaveBeenCalled();
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
    expect(answer.anchored).toBe(false);
    receiptStored(answer);
  });
});

describe('[1] — THE CAPTURE ARM: a HELD document equal to an ATTRIBUTED capture (A3 :1366 as ruled 2026-09-24)', () => {
  /** The capture's documentHash as the walk anchored it: bytes32 of the bare digest, by our registrar. */
  const captureEntry = (): Entry => ({ fileHash: toBytes32(DOC_ID.slice(2)).toLowerCase(), submitter: REGISTRAR, category: ANCHOR_SCHEME });

  it('(i) is ANCHORED and NOT owed, and NOTHING is written for it — no entry of its own', async () => {
    seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), DOC_ID.slice(2), '20220805053301');
    const { registrar, held } = chain([captureEntry()]);
    const answer = await receive();
    expect(answer.anchored).toBe(true);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
    expect(held.map((e) => e.fileHash)).not.toContain(answer.commitment);
  });

  it('(ii) a commitment written BEFORE the equality appeared STANDS, and the document is ANCHORED', async () => {
    const { registrar, held } = chain();
    const answer = await receive();
    expect(held.at(-1)?.fileHash).toBe(answer.commitment);
    seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), DOC_ID.slice(2), '20220805053301');
    held.push(captureEntry());
    registrar.registerEvidenceHash.mockClear();
    const read = await readDocument(answer.commitment, 'res_1');
    expect('anchored' in read && read.anchored).toBe(true);
    expect(held.filter((e) => e.fileHash === answer.commitment)).toHaveLength(1);
    expect(registrar.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('a capture that is equal but NOT attributed anchors nothing — the commitment is written', async () => {
    seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), DOC_ID.slice(2), '20220805053301');
    const { registrar } = chain();
    const answer = await receive();
    expect(registrar.registerEvidenceHash).toHaveBeenCalledWith(answer.commitment, expect.any(String), DOCUMENT_COMMITMENT);
    expect(answer.anchored).toBe(true);
  });
});

describe('[1] — a SEALED document NEVER takes the capture arm (§4 :441, "a HELD document")', () => {
  const SEALED = { commitment: '0x' + 'c5'.repeat(32), docId: DOC_ID, bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: new Date() } as unknown as Document;
  const captureHash = toBytes32(DOC_ID.slice(2)).toLowerCase();
  const onlyTheCapture = (hash: string): boolean => hash.toLowerCase() === captureHash;

  it('VERIFIED(d) ignores an equal attributed capture for a SEALED document — the predicate', () => {
    expect(verifiedDocument(SEALED, null, null, onlyTheCapture, captureHash)).toBe(false);
  });

  it('anchoredOf asks no capture for a SEALED document — the read', async () => {
    seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), DOC_ID.slice(2), '20220805053301');
    const { registrar } = chain([{ fileHash: captureHash, submitter: REGISTRAR, category: ANCHOR_SCHEME }]);
    const standing = await anchoredOf(openDocumentRegistryWindow(), [{ commitment: SEALED.commitment, docId: DOC_ID, held: false }]);
    expect(standing.get(SEALED.commitment)).toEqual({ anchored: false, by: null });
    expect(registrar.isHashRegistered).not.toHaveBeenCalledWith(captureHash);
  });
});

describe('ANCHORED(d) on every read — read_document and list_documents (plan :196–:197)', () => {
  it('list_documents reads each document’s ANCHORED from the chain — owed, then anchored after the chain holds it', async () => {
    delete process.env['RAILWAY_DEPLOYMENT_ID'];
    const { held } = chain();
    const answer = await receive();
    const before = await listDocuments({ scope: 'all' }, 'res_1');
    expect('documents' in before && before.documents.map((d) => d.anchored)).toEqual([false]);
    held.push({ fileHash: answer.commitment, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT });
    const after = await listDocuments({ scope: 'all' }, 'res_1');
    expect('documents' in after && after.documents.map((d) => d.anchored)).toEqual([true]);
  });

  it('a chain READ failure reads FALSE, never a refusal of the read', async () => {
    const { registrar } = chain();
    const answer = await receive();
    registrar.isHashRegistered.mockRejectedValue(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    const read = await readDocument(answer.commitment, 'res_1');
    expect('anchored' in read && read.anchored).toBe(false);
    expect('custody' in read && read.custody).toBe('HELD');
  });
});
