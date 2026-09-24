// ---------------------------------------------------------------------------
// THE REGISTRY, READ FROM STATE — evidence flows §8, the rebuild's step 1(b)
// and the input to step 2's ledger.
//
// Three properties, each of which a reading of the chain could silently lack:
//
//   1. COMPLETE OR NOTHING. Every index below totalEvidence() is read, and the
//      total is read AGAIN afterwards. An index that cannot be read, or a total
//      that moved while reading, is a refusal — never a shorter list. A ledger
//      emitted from a partial read would explain N-1 entries and look finished.
//
//   2. ATTRIBUTION IS BY STATE, NEVER BY RECEIPT. ATTRIBUTED(hash) holds iff
//      isRegistered(hash) AND the entry at that index was submitted by our
//      registrar. A receipt is readable only inside the RPC's retention horizon;
//      state is readable forever, and the design replaces the former with the
//      latter here.
//
//   3. A LIVE REGISTRY'S ENTRY IS A CAPTURE'S documentHash, or it is UNEXPLAINED
//      (evidence flows A7 :1268–:1273). The extraction anchors over `contentHash`
//      and the evidence names over `fileHash` are a FROZEN registry's, explained by
//      its committed ledger file; the columns that once explained them left the
//      schema (evidence step 11b, R45-B). A hash no capture holds is a finding,
//      and the one state step 2 refuses on.
// ---------------------------------------------------------------------------

import {
  attributeClaim,
  entriesAlreadyRead,
  entryFromChain,
  classifyEntry,
  readRegistryState,
  RegistryReadError,
  type CorpusHashes,
  type RegistryEntry,
  type RegistryReader,
} from '../src/services/registryState';
import { countByVerdict, type CorpusClaim } from '../src/services/registryState';
import type { OnChainEvidenceRecord } from '../src/services/Web3Service';
import { DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';

const REGISTRAR = '0x9DE2e74b3C5dAc4C3E2a0d18A5b76EEAc8989A28';
const STRANGER = '0x000000000000000000000000000000000000dEaD';
const REGISTRY = '0x65b9a7acb45Aa05e7Ed207844F93a2b308373853';

function hash(n: number): string {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

function reader(overrides: Partial<RegistryReader> & { records?: RegistryEntry[] }): RegistryReader {
  const records = overrides.records ?? [];
  return {
    registryAddress: REGISTRY,
    registrarAddress: REGISTRAR,
    getTotalEvidence: jest.fn().mockResolvedValue(BigInt(records.length)),
    readEvidenceRecord: jest.fn((index: bigint): Promise<OnChainEvidenceRecord> => {
      const r = records.at(Number(index));
      if (r === undefined) return Promise.reject(new Error(`EvidenceNotFound(${String(index)})`));
      const { index: _index, ...record } = r;
      return Promise.resolve(record);
    }),
    isHashRegistered: jest.fn(),
    ...overrides,
  };
}

function entry(index: number, extra: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    index,
    fileHash: hash(index + 1),
    submitter: REGISTRAR.toLowerCase(),
    timestamp: 1_756_000_000 + index,
    category: 'snapshot-anchor',
    ...extra,
  };
}

describe('readRegistryState reads every index, or nothing', () => {
  it('returns one entry per index, in order, and the registrar lower-cased', async () => {
    // Hash and submitter arrive lower-cased from the reader — that normalisation
    // is Web3Service's boundary job (web3ReadEvidenceRecord.test.ts) and is not
    // repeated here. The registrar comes from a wallet, checksummed, and IS
    // lower-cased here so that the comparison in attributeClaim cannot miss.
    const records = [entry(0), entry(1), entry(2)];
    const state = await readRegistryState(reader({ records }));

    expect(state.totalEvidence).toBe(3);
    expect(state.entries.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(state.entries.at(0)?.submitter).toBe(REGISTRAR.toLowerCase());
    expect(state.entries.every((e) => e.fileHash === e.fileHash.toLowerCase())).toBe(true);
    expect(state.registryAddress).toBe(REGISTRY);
    expect(state.registrarAddress).toBe(REGISTRAR.toLowerCase());
  });

  it('an empty registry is a state, not a refusal — the new contract starts there', async () => {
    const state = await readRegistryState(reader({ records: [] }));
    expect(state.totalEvidence).toBe(0);
    expect(state.entries).toEqual([]);
  });

  it('refuses when an index cannot be read, rather than returning the rest', async () => {
    const records = [entry(0), entry(1), entry(2)];
    const r = reader({ records });
    (r.readEvidenceRecord as jest.Mock).mockImplementation((index: bigint): Promise<OnChainEvidenceRecord> =>
      index === 1n
        ? Promise.reject(new Error('rate limited'))
        : Promise.resolve({
            fileHash: hash(Number(index) + 1),
            submitter: REGISTRAR.toLowerCase(),
            timestamp: 1,
            category: 'c',
          }),
    );

    await expect(readRegistryState(r)).rejects.toBeInstanceOf(RegistryReadError);
    await expect(readRegistryState(r)).rejects.toThrow(/index 1/);
  });

  it('refuses when totalEvidence() moved during the read', async () => {
    const records = [entry(0), entry(1)];
    const r = reader({ records });
    (r.getTotalEvidence as jest.Mock).mockResolvedValueOnce(2n).mockResolvedValueOnce(3n);

    await expect(readRegistryState(r)).rejects.toThrow(/2 before, 3 after/);
  });
});

describe('attributeClaim: by state, against our registrar', () => {
  const entries = [entry(0), entry(1, { submitter: STRANGER.toLowerCase() })];

  it('ATTRIBUTED when registered and submitted by our registrar', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 0n });

    const verdict = await attributeClaim(r, entriesAlreadyRead(entries), hash(1).slice(2));
    expect(verdict).toEqual({ hash: hash(1), verdict: 'ATTRIBUTED', index: 0, submitter: REGISTRAR.toLowerCase() });
  });

  it('FOREIGN_SUBMITTER when registered by another account', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 1n });

    const verdict = await attributeClaim(r, entriesAlreadyRead(entries), hash(2));
    expect(verdict.verdict).toBe('FOREIGN_SUBMITTER');
    expect(verdict.submitter).toBe(STRANGER.toLowerCase());
  });

  it('UNREGISTERED when the registry does not hold the hash', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });

    const verdict = await attributeClaim(r, entriesAlreadyRead(entries), hash(9));
    expect(verdict).toEqual({ hash: hash(9), verdict: 'UNREGISTERED', index: null, submitter: null });
  });

  it('passes the hash to the chain as bytes32, whichever spelling the column stores', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });

    await attributeClaim(r, entriesAlreadyRead(entries), 'ab'.repeat(32));
    expect(r.isHashRegistered).toHaveBeenCalledWith(`0x${'ab'.repeat(32)}`);
  });

  it('refuses when isRegistered and getEvidence disagree about what sits at the index', async () => {
    // Two reads of one state that contradict each other are not a verdict.
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 0n });

    await expect(attributeClaim(r, entriesAlreadyRead(entries), hash(2))).rejects.toBeInstanceOf(RegistryReadError);
  });
});

// ---------------------------------------------------------------------------
// THE ENTRY LOOKUP — added at evidence step 12 so ATTRIBUTED keeps ONE spelling.
//
// The ledger and the audits have already read the whole registry; the
// anchor-time check and the per-capture reads have one hash in hand and must not
// walk the contract to answer about it. Those are two ways to FETCH AN ENTRY,
// not two definitions of attribution — so the definition stayed put and the
// fetch became the parameter. These cases hold that the two lookups agree about
// the same state and differ only in what they cost.
// ---------------------------------------------------------------------------
describe('the entry lookup: one predicate, two ways to reach an entry', () => {
  const entries = [entry(0), entry(1, { submitter: STRANGER.toLowerCase() })];

  it('entryFromChain reads ONE entry, at the index isRegistered named', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 0n });

    const verdict = await attributeClaim(r, entryFromChain(r), hash(1));

    expect(verdict.verdict).toBe('ATTRIBUTED');
    expect(r.readEvidenceRecord).toHaveBeenCalledTimes(1);
    expect(r.readEvidenceRecord).toHaveBeenCalledWith(0n);
    // The whole point of the second lookup: a per-capture question must not
    // become a walk of the registry.
    expect(r.getTotalEvidence).not.toHaveBeenCalled();
  });

  it('entriesAlreadyRead reads NOTHING from the chain beyond isRegistered', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 0n });

    await attributeClaim(r, entriesAlreadyRead(entries), hash(1));

    expect(r.readEvidenceRecord).not.toHaveBeenCalled();
  });

  it('the two lookups reach the SAME verdict for the same state', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 1n });

    const fromChain = await attributeClaim(r, entryFromChain(r), hash(2));
    const fromState = await attributeClaim(r, entriesAlreadyRead(entries), hash(2));

    expect(fromChain).toEqual(fromState);
    expect(fromChain.verdict).toBe('FOREIGN_SUBMITTER');
  });

  it('a lookup that cannot produce the entry is a REFUSAL, never an answer', async () => {
    // An index the chain names and the lookup cannot return is the same
    // contradiction as an entry holding another hash: no verdict.
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 9n });

    await expect(attributeClaim(r, entriesAlreadyRead(entries), hash(1))).rejects.toBeInstanceOf(
      RegistryReadError,
    );
  });
});

describe('classifyEntry: a live entry is a capture\'s documentHash, or it is unexplained', () => {
  const corpus: CorpusHashes = {
    snapshots: [
      { id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/', documentHash: hash(1).slice(2) },
      { id: 's2', waybackTimestamp: '20220805053301', url: 'https://x/', documentHash: hash(3).slice(2) },
    ],
    documents: [],
  };

  it('DOCUMENT_HASH — the payload anchor, the target scheme', () => {
    expect(classifyEntry(entry(0, { fileHash: hash(1) }), corpus)).toEqual({
      kind: 'DOCUMENT_HASH',
      snapshots: [{ id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/' }],
    });
  });

  // CONTENT_HASH AND AMBIGUOUS LEFT AT R45-B, WITH THE COLUMN. An extraction anchor
  // was explained by a capture's `contentHash`, and a hash two columns held was
  // AMBIGUOUS; with `documentHash` the only hash a capture carries, neither answer
  // has a subject on a live registry. A frozen registry's extraction anchors are
  // explained by its committed ledger — `registryLedgerCommitted.test.ts` holds it.

  it('UNEXPLAINED when no capture holds the hash — the state the ledger refuses on', () => {
    expect(classifyEntry(entry(0, { fileHash: hash(77) }), corpus)).toEqual({
      kind: 'UNEXPLAINED',
      snapshots: [],
    });
  });
});

describe('classifyEntry reads the CATEGORY — a DOCUMENT_COMMITMENT entry is explained by ONE document row (document step 31)', () => {
  // docs/gf-document-flows.md A7 :1554–:1556: "every commitment entry is reproduced by one Document row's (docId,
  // salt)". The COMMITMENT is recomputed by `lib/documentIdentity`'s one formula, never compared to a stored column
  // alone — a wrong salt is a row that does NOT reproduce it. Every OTHER category keeps the documentHash arm
  // unchanged, so a frozen registry's entries (category = a retired label) classify exactly as before.
  const docId = hash(5);
  const salt = Buffer.alloc(32, 9);
  const name = commitmentOf(docId, salt);
  const capture = { id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/', documentHash: hash(1).slice(2) };

  it('explained by the row whose (docId, salt) REPRODUCES it', () => {
    const corpus: CorpusHashes = { snapshots: [capture], documents: [{ commitment: name, docId, salt }] };
    expect(classifyEntry(entry(0, { fileHash: name, category: DOCUMENT_COMMITMENT }), corpus)).toEqual({
      kind: 'DOCUMENT_COMMITMENT',
      snapshots: [],
      commitment: name,
    });
  });

  it('a WRONG salt leaves it UNEXPLAINED — the stored name alone is not the explanation', () => {
    const corpus: CorpusHashes = { snapshots: [capture], documents: [{ commitment: name, docId, salt: Buffer.alloc(32, 1) }] };
    expect(classifyEntry(entry(0, { fileHash: name, category: DOCUMENT_COMMITMENT }), corpus)).toEqual({ kind: 'UNEXPLAINED', snapshots: [] });
  });

  it('a DOCUMENT_COMMITMENT entry whose hash is a CAPTURE’s is not explained by the capture', () => {
    const corpus: CorpusHashes = { snapshots: [capture], documents: [] };
    expect(classifyEntry(entry(0, { fileHash: hash(1), category: DOCUMENT_COMMITMENT }), corpus)).toEqual({ kind: 'UNEXPLAINED', snapshots: [] });
  });

  it('EVERY OTHER category takes the documentHash arm, UNCHANGED — the frozen registry’s labels', () => {
    const corpus: CorpusHashes = { snapshots: [capture], documents: [{ commitment: name, docId, salt }] };
    expect(classifyEntry(entry(0, { fileHash: hash(1), category: 'Wayback Snapshot' }), corpus)).toEqual({
      kind: 'DOCUMENT_HASH',
      snapshots: [{ id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/' }],
    });
  });
});

describe('countByVerdict: one claim per capture', () => {
  // THE PER-SUBJECT ROLL-UP LEFT AT R45-B. It existed because every capture was asked
  // twice — `documentHash` and `contentHash` — and a legacy row was registered on one
  // of them, so a per-claim count over-read UNREGISTERED. With one column asked per
  // capture, the per-claim count IS the per-capture count, and a second function
  // computing it would be one rule with two implementations.
  const claim = (snapshotId: string, verdict: CorpusClaim['attribution']['verdict']): CorpusClaim => ({
    snapshotId,
    attribution: { hash: hash(1), verdict, index: verdict === 'UNREGISTERED' ? null : 0, submitter: null },
  });

  it('counts each capture once, by the verdict on its documentHash', () => {
    expect(
      countByVerdict([
        claim('s1', 'ATTRIBUTED'),
        claim('s2', 'ATTRIBUTED'),
        claim('s3', 'FOREIGN_SUBMITTER'),
        claim('s4', 'UNREGISTERED'),
      ]),
    ).toEqual({ ATTRIBUTED: 2, FOREIGN_SUBMITTER: 1, UNREGISTERED: 1 });
  });
});
