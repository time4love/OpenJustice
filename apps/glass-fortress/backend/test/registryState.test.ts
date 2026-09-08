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
//   3. AN ENTRY IS EXPLAINED BY WHICH COLUMN PRODUCED IT, or it is UNEXPLAINED.
//      The three kinds the design names — extraction anchors over contentHash,
//      payload anchors over documentHash, evidence names over fileHash — are
//      found by joining the chain's hash against the corpus's hash columns.
//      A hash matching none is a finding, and the one state step 2 refuses on.
// ---------------------------------------------------------------------------

import {
  attributeClaim,
  classifyEntry,
  readRegistryState,
  RegistryReadError,
  type CorpusHashes,
  type RegistryEntry,
  type RegistryReader,
} from '../src/services/registryState';
import {
  countByVerdict,
  rollUpBySubject,
  type CorpusClaim,
} from '../src/services/registryState';
import type { OnChainEvidenceRecord } from '../src/services/Web3Service';

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

    const verdict = await attributeClaim(r, entries, hash(1).slice(2));
    expect(verdict).toEqual({ hash: hash(1), verdict: 'ATTRIBUTED', index: 0, submitter: REGISTRAR.toLowerCase() });
  });

  it('FOREIGN_SUBMITTER when registered by another account', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 1n });

    const verdict = await attributeClaim(r, entries, hash(2));
    expect(verdict.verdict).toBe('FOREIGN_SUBMITTER');
    expect(verdict.submitter).toBe(STRANGER.toLowerCase());
  });

  it('UNREGISTERED when the registry does not hold the hash', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });

    const verdict = await attributeClaim(r, entries, hash(9));
    expect(verdict).toEqual({ hash: hash(9), verdict: 'UNREGISTERED', index: null, submitter: null });
  });

  it('passes the hash to the chain as bytes32, whichever spelling the column stores', async () => {
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });

    await attributeClaim(r, entries, 'ab'.repeat(32));
    expect(r.isHashRegistered).toHaveBeenCalledWith(`0x${'ab'.repeat(32)}`);
  });

  it('refuses when isRegistered and getEvidence disagree about what sits at the index', async () => {
    // Two reads of one state that contradict each other are not a verdict.
    const r = reader({ records: entries });
    (r.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 0n });

    await expect(attributeClaim(r, entries, hash(2))).rejects.toBeInstanceOf(RegistryReadError);
  });
});

describe('classifyEntry: which column produced the hash', () => {
  const corpus: CorpusHashes = {
    snapshots: [
      { id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/', documentHash: hash(1).slice(2), contentHash: hash(2).slice(2) },
      { id: 's2', waybackTimestamp: '20220805053301', url: 'https://x/', documentHash: hash(3).slice(2), contentHash: hash(2).slice(2) },
    ],
  };

  it('DOCUMENT_HASH — the payload anchor, the target scheme', () => {
    expect(classifyEntry(entry(0, { fileHash: hash(1) }), corpus)).toEqual({
      kind: 'DOCUMENT_HASH',
      snapshots: [{ id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/' }],
      evidence: [],
    });
  });

  it('CONTENT_HASH — one extraction anchor covering every twin', () => {
    const c = classifyEntry(entry(0, { fileHash: hash(2) }), corpus);
    expect(c.kind).toBe('CONTENT_HASH');
    expect(c.snapshots.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  // THE TWO EVIDENCE KINDS WENT WITH THE ARM AT EVIDENCE STEP 11b. They were
  // classified from `Evidence.fileHash` and `previousFileHash`; identity never
  // moves under the target and no evidence row is registered, so no live entry
  // is classified that way. A frozen registry's are ORPHANED and explained by the
  // committed ledger file — `registryLedgerCommitted.test.ts` holds it complete.

  it('UNEXPLAINED when no column holds the hash — the state the ledger refuses on', () => {
    expect(classifyEntry(entry(0, { fileHash: hash(77) }), corpus)).toEqual({
      kind: 'UNEXPLAINED',
      snapshots: [],
      evidence: [],
    });
  });

  it('AMBIGUOUS when two different columns hold the same hash', () => {
    // One capture's `documentHash` equal to another's `contentHash` makes "which
    // formula produced this entry" unanswerable from the join alone. Not
    // expected; reported rather than resolved by picking the first match.
    //
    // RE-POINTED AT THE TWO CAPTURE COLUMNS AT EVIDENCE STEP 11b: the collision
    // used to be between a `documentHash` and an evidence `fileHash`, and evidence
    // has no hash columns left. The property is unchanged — two columns, one hash,
    // a refusal — and it now has the only two columns that can still collide.
    const collided: CorpusHashes = {
      snapshots: [
        corpus.snapshots[0]!,
        { ...corpus.snapshots[0]!, id: 's9', contentHash: corpus.snapshots[0]!.documentHash },
      ],
    };
    expect(classifyEntry(entry(0, { fileHash: hash(1) }), collided).kind).toBe('AMBIGUOUS');
  });
});

describe('rollUpBySubject: the number a reader acts on is per subject, not per claim', () => {
  const claim = (
    subject: CorpusClaim['subject'],
    subjectId: string,
    column: CorpusClaim['column'],
    verdict: CorpusClaim['attribution']['verdict'],
  ): CorpusClaim => ({
    subject,
    subjectId,
    column,
    attribution: { hash: hash(1), verdict, index: verdict === 'UNREGISTERED' ? null : 0, submitter: null },
  });

  it('two snapshots, one anchored by documentHash and one by contentHash, roll up to one each', () => {
    // Every snapshot is asked twice and a legacy row is registered on exactly
    // one column, so byVerdict reads UNREGISTERED 2 here — true, and the wrong
    // number to act on. The roll-up is what the dated doc records.
    const claims: CorpusClaim[] = [
      claim('UrlSnapshot', 's1', 'documentHash', 'ATTRIBUTED'),
      claim('UrlSnapshot', 's1', 'contentHash', 'UNREGISTERED'),
      claim('UrlSnapshot', 's2', 'documentHash', 'UNREGISTERED'),
      claim('UrlSnapshot', 's2', 'contentHash', 'ATTRIBUTED'),
    ];
    expect(countByVerdict(claims).UNREGISTERED).toBe(2);
    expect(rollUpBySubject(claims)).toEqual({
      snapshots: {
        ATTRIBUTED_BY_DOCUMENT_HASH: 1,
        ATTRIBUTED_BY_CONTENT_HASH: 1,
        BOTH: 0,
        FOREIGN: 0,
        NEITHER: 0,
      },
      evidence: { BY_FILE_HASH: 0, BY_PREVIOUS_FILE_HASH: 0, BOTH: 0, FOREIGN: 0, NEITHER: 0 },
    });
  });

  it('BOTH, FOREIGN and NEITHER for snapshots; the evidence columns likewise', () => {
    const claims: CorpusClaim[] = [
      claim('UrlSnapshot', 's1', 'documentHash', 'ATTRIBUTED'),
      claim('UrlSnapshot', 's1', 'contentHash', 'ATTRIBUTED'),
      claim('UrlSnapshot', 's2', 'documentHash', 'FOREIGN_SUBMITTER'),
      claim('UrlSnapshot', 's2', 'contentHash', 'UNREGISTERED'),
      claim('UrlSnapshot', 's3', 'documentHash', 'UNREGISTERED'),
      claim('UrlSnapshot', 's3', 'contentHash', 'UNREGISTERED'),
      claim('Evidence', 'e1', 'fileHash', 'ATTRIBUTED'),
      claim('Evidence', 'e2', 'fileHash', 'UNREGISTERED'),
      claim('Evidence', 'e2', 'previousFileHash', 'ATTRIBUTED'),
      claim('Evidence', 'e3', 'fileHash', 'ATTRIBUTED'),
      claim('Evidence', 'e3', 'previousFileHash', 'ATTRIBUTED'),
      claim('Evidence', 'e4', 'fileHash', 'FOREIGN_SUBMITTER'),
      claim('Evidence', 'e5', 'fileHash', 'UNREGISTERED'),
    ];
    expect(rollUpBySubject(claims)).toEqual({
      snapshots: { ATTRIBUTED_BY_DOCUMENT_HASH: 0, ATTRIBUTED_BY_CONTENT_HASH: 0, BOTH: 1, FOREIGN: 1, NEITHER: 1 },
      evidence: { BY_FILE_HASH: 1, BY_PREVIOUS_FILE_HASH: 1, BOTH: 1, FOREIGN: 1, NEITHER: 1 },
    });
  });

  it('a subject attributed on one column and foreign on the other counts as attributed', () => {
    // The foreign registration is still visible in byVerdict; the subject's own
    // custody is answered by the column that is ours.
    const claims: CorpusClaim[] = [
      claim('UrlSnapshot', 's1', 'documentHash', 'ATTRIBUTED'),
      claim('UrlSnapshot', 's1', 'contentHash', 'FOREIGN_SUBMITTER'),
    ];
    const r = rollUpBySubject(claims).snapshots;
    expect(r.ATTRIBUTED_BY_DOCUMENT_HASH).toBe(1);
    expect(r.FOREIGN).toBe(0);
  });
});
