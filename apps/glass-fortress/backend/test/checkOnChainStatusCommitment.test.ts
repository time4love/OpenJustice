jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});
const mockResearcher = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: () => mockResearcher() }));
jest.mock('../src/lib/chainIdentity', () => ({
  ...jest.requireActual<typeof import('../src/lib/chainIdentity')>('../src/lib/chainIdentity'),
  readChainIdentity: () => Promise.resolve({ reachable: true, chainId: 84532, registryAddress: '0xDA3B', registryDeployed: true }),
}));

import { ethers } from 'ethers';
import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { toBytes32 } from '../src/lib/bytes32';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';
import { commitmentOnChain } from '../src/services/checkOnChainStatus';
import { Web3Service } from '../src/services/Web3Service';
import { resetWorld, seedDocument, seedSnapshot, seedTrackedUrl, store } from './document/world';

// ---------------------------------------------------------------------------
// check_on_chain_status({ commitment }) — docs/gf-document-flows.md A4 :1468–:1469 as ruled 2026-09-24 (R80 Q4):
// "asked about a commitment, answers about its entry: registered · ATTRIBUTED · block time · category — a document
// ANCHORED by A3 :1366's capture arm is answered as attested by that capture, with its index, never as unregistered;
// NOT_PUBLIC unless PUBLIC(d) (A3 :1379), the gate resolve_record carries at :1466–:1467."
//
// THE GATE: `openPage`'s shape (`evidenceRefusals.ts` :224–:228) — refused iff NOT PUBLIC(d) AND no researcher; ONE
// refusal body for a commitment nobody holds and one nobody opened, so the answer never says which. PUBLIC(d) is
// OPENED(d), step 34's; before it no document is public.
//
// THE COMMITMENT'S OWN ENTRY IS ANSWERED FIRST (REVIEW, chunk 4): "a commitment written before the equality appeared
// stands" — a world with BOTH entries answers the commitment's.
// ---------------------------------------------------------------------------

const REGISTRAR = '0xus';
const docId = '0x' + '5a'.repeat(32);
const salt = Buffer.alloc(32, 4);
const name = commitmentOf(docId, salt);
const captureHash = toBytes32(docId.slice(2)).toLowerCase();

interface Entry {
  fileHash: string;
  submitter: string;
  category: string;
}

function chain(entries: Entry[]) {
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
        : Promise.resolve({ ...entry, timestamp: 1_758_000_000 + Number(index) });
    }),
    isHashRegistered: jest.fn((hash: string) => {
      const index = held.findIndex((e) => e.fileHash === hash.toLowerCase());
      return Promise.resolve(index === -1 ? { registered: false, evidenceId: BigInt(0) } : { registered: true, evidenceId: BigInt(index) });
    }),
    registerEvidenceHash: jest.fn(),
  };
  (Web3Service as unknown as jest.Mock).mockImplementation(() => registrar);
  return registrar;
}

const FILLER: Entry = { fileHash: '0x' + 'ab'.repeat(32), submitter: REGISTRAR, category: ANCHOR_SCHEME };
const COMMITMENT_ENTRY: Entry = { fileHash: name, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT };
const CAPTURE_ENTRY: Entry = { fileHash: captureHash, submitter: REGISTRAR, category: ANCHOR_SCHEME };

function heldDocument(): void {
  seedDocument({ docId, commitment: name, salt, bytes: docId });
}
function equalCapture(): void {
  seedSnapshot(seedTrackedUrl('https://example.gov.il/p'), docId.slice(2), '20220805053301');
}

const bodyOf = (answer: unknown): unknown => (answer as { error?: unknown }).error;

beforeEach(() => {
  resetWorld();
  jest.clearAllMocks();
  mockResearcher.mockReturnValue('res_1');
});

describe('the gate — NOT_PUBLIC unless PUBLIC(d); a researcher reads through; ONE body', () => {
  it('a stranger asking about an UNOPENED document is refused NOT_PUBLIC', async () => {
    heldDocument();
    chain([FILLER, COMMITMENT_ENTRY]);
    mockResearcher.mockReturnValue(null);
    expect(await commitmentOnChain(name)).toMatchObject({ code: 'NOT_PUBLIC' });
  });

  it('ONE refusal body for a commitment nobody holds and one nobody opened — the answer never says which', async () => {
    heldDocument();
    chain([FILLER, COMMITMENT_ENTRY]);
    mockResearcher.mockReturnValue(null);
    const unopened = await commitmentOnChain(name);
    const unknown = await commitmentOnChain('0x' + '77'.repeat(32));
    expect(unknown).toMatchObject({ code: 'NOT_PUBLIC' });
    expect(bodyOf(unknown)).toBe(bodyOf(unopened));
    expect(typeof bodyOf(unknown)).toBe('string');
  });

  it('a researcher asking about an unknown commitment gets the SAME body', async () => {
    chain([FILLER]);
    expect(await commitmentOnChain('0x' + '77'.repeat(32))).toMatchObject({ code: 'NOT_PUBLIC' });
  });

  // DECLARED EDIT, document step 34 (R84 chunk 2): the step-31 guard this case held — an opening row THROWS, "PUBLIC(d) is
  // step 34's" — is replaced by PUBLIC(d) itself (A3 :1379; A4 :1469): an anonymous caller is answered once a publication
  // has put an opening in force, and refused NOT_PUBLIC while none has.
  it('PUBLIC(d) — an anonymous caller is refused while the decision waits for a publication, and answered once one puts it in force', async () => {
    heldDocument();
    chain([FILLER, COMMITMENT_ENTRY]);
    mockResearcher.mockReturnValue(null);
    store.openings.push({ thesisId: 'thesis-1', commitment: name, sequence: 1, opening: 'BYTES', createdAt: new Date(Date.UTC(2026, 8, 21)) });
    store.mentions.push({ versionId: 'version-1', kind: 'DOCUMENT', name, thesisVersion: { thesisId: 'thesis-1' } });
    expect(await commitmentOnChain(name)).toMatchObject({ code: 'NOT_PUBLIC' });

    store.attempts.push({ id: 'attempt-1', thesisId: 'thesis-1', versionId: 'version-1', outcome: 'PUBLISHED', createdAt: new Date(Date.UTC(2026, 8, 22)) });
    expect(await commitmentOnChain(name)).toMatchObject({ attestedBy: 'COMMITMENT', entry: { hash: name, isRegistered: true } });
  });
});

describe('the answer — the entry: registered · ATTRIBUTED · block time · category (A4 :1469)', () => {
  it('a commitment ATTRIBUTED to our registrar is answered as attested by the COMMITMENT, with its index and category', async () => {
    heldDocument();
    chain([FILLER, COMMITMENT_ENTRY]);
    expect(await commitmentOnChain(name)).toMatchObject({
      commitment: name,
      attestedBy: 'COMMITMENT',
      entry: { hash: name, isRegistered: true, registryIndex: 1, attributed: true, category: DOCUMENT_COMMITMENT, blockTime: new Date(1_758_000_001_000).toISOString() },
      capture: null,
      registry: { chainId: 84532 },
    });
  });

  it('a document anchored by the CAPTURE arm is answered as attested by that capture, with ITS index — never as unregistered', async () => {
    heldDocument();
    equalCapture();
    chain([FILLER, CAPTURE_ENTRY]);
    expect(await commitmentOnChain(name)).toMatchObject({
      attestedBy: 'CAPTURE',
      entry: { hash: captureHash, isRegistered: true, registryIndex: 1, attributed: true, category: ANCHOR_SCHEME },
      capture: { url: 'https://example.gov.il/p', capture: '20220805053301' },
    });
  });

  it('BOTH entries exist — the COMMITMENT’s own entry is answered FIRST: a commitment written before the equality stands', async () => {
    heldDocument();
    equalCapture();
    chain([FILLER, CAPTURE_ENTRY, COMMITMENT_ENTRY]);
    expect(await commitmentOnChain(name)).toMatchObject({ attestedBy: 'COMMITMENT', entry: { hash: name, registryIndex: 2 }, capture: null });
  });

  it('a SEALED document NEVER takes the capture arm — its DOC_ID never leaves the platform (§4 :436–:438; A3 :1366 is HELD only)', async () => {
    // REACHABILITY: no SEALED row exists before the intake receipt, which is document step 32's; this arm is live code
    // from then on, and the world is built here by seeding the row as the receipt will write it (bytes null, a cid,
    // verifiedAtReceipt set). Answering "attested by capture" for it would disclose that its plaintext equals a public
    // capture — the one thing a sealed document's name exists to withhold. REVIEW's J4 (chunk 4 round 1).
    seedDocument({ docId, commitment: name, salt, bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: new Date(Date.UTC(2026, 8, 20)) });
    equalCapture();
    const registrar = chain([FILLER, CAPTURE_ENTRY]);
    const answer = await commitmentOnChain(name);
    expect(answer).toMatchObject({ attestedBy: null, capture: null, entry: { hash: name, isRegistered: false } });
    expect(registrar.isHashRegistered).not.toHaveBeenCalledWith(captureHash);
  });

  it('an OWED document: the commitment’s entry, unregistered, attested by nothing', async () => {
    heldDocument();
    chain([FILLER]);
    expect(await commitmentOnChain(name)).toMatchObject({
      attestedBy: null,
      entry: { hash: name, isRegistered: false, registryIndex: null, attributed: false, blockTime: null, category: null },
    });
  });

  it('a chain that cannot be read is CHAIN_UNAVAILABLE — a verdict about the CHECK, never "unregistered"', async () => {
    heldDocument();
    const registrar = chain([FILLER]);
    registrar.isHashRegistered.mockRejectedValue(ethers.makeError('could not detect network', 'NETWORK_ERROR', { event: 'noNetwork' }));
    expect(await commitmentOnChain(name)).toMatchObject({ code: 'CHAIN_UNAVAILABLE' });
  });
});
