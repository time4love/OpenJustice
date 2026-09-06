// ---------------------------------------------------------------------------
// THE REGISTRY LEDGER — evidence flows §8, the rebuild's step 2.
//
// "Every old entry is explained in git, not in a table": for every index on the
// frozen registry — hash, what formula produced it from which inputs, what it
// attested, and what replaces it — verified complete against totalEvidence()
// and committed to this public repository with the old address. An unexplained
// entry is indistinguishable from a tampered one, so the emitter REFUSES rather
// than emits when one exists.
//
// THE RESEARCHER'S RULING OF 2026-09-06 (docs/gf-rebuild-staging-measure-2026-09-06.md §2),
// which this file holds:
//   PRE_WIPE  — block time before 2026-08-21, staging only, derived.
//   ORPHANED  — a committed per-index list (29, 30, 31, 32, 36 on staging's
//               registry); no current or superseded row holds the hash.
//   Any unexplained index NOT on the list refuses; count ≠ totalEvidence()
//   refuses; a listed one passes with its kind.
// ---------------------------------------------------------------------------

import {
  buildRegistryLedger,
  LedgerRefusal,
  ORPHANED_BY_REGISTRY,
  type LedgerInput,
} from '../src/services/registryLedger';
import type { CorpusHashes, RegistryEntry, RegistryState } from '../src/services/registryState';

const REGISTRY = '0x65b9a7acb45Aa05e7Ed207844F93a2b308373853';
const REGISTRAR = '0x9de2e74b3c5dac4c3e2a0d18a5b76eeac8989a28';
const BASE_SEPOLIA = 84532;
const BASE_MAINNET = 8453;

function hash(n: number): string {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

/** Seconds since the epoch for an ISO date. */
function at(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function entry(index: number, extra: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    index,
    fileHash: hash(100 + index),
    submitter: REGISTRAR,
    timestamp: at('2026-08-25T12:00:00Z'),
    category: 'Wayback Snapshot',
    ...extra,
  };
}

function state(entries: RegistryEntry[], totalEvidence = entries.length): RegistryState {
  return {
    registryAddress: REGISTRY,
    registrarAddress: REGISTRAR,
    totalEvidence,
    entries,
    readAt: '2026-09-06T08:00:00.000Z',
  };
}

const corpus: CorpusHashes = {
  snapshots: [
    { id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/', documentHash: hash(1).slice(2), contentHash: hash(2).slice(2) },
    { id: 's2', waybackTimestamp: '20220805053301', url: 'https://x/', documentHash: hash(3).slice(2), contentHash: hash(2).slice(2) },
  ],
  evidence: [
    { id: 'e1', fileHash: hash(4), previousFileHash: hash(5), evidenceType: 'FORENSIC_DIFF' },
    { id: 'e2', fileHash: hash(6), previousFileHash: null, evidenceType: 'DOCUMENT' },
  ],
};

function input(overrides: Partial<LedgerInput> = {}): LedgerInput {
  return {
    state: state([
      entry(0, { fileHash: hash(1) }),
      entry(1, { fileHash: hash(2) }),
      entry(2, { fileHash: hash(4), category: 'Forensic Evidence' }),
      entry(3, { fileHash: hash(5), category: 'A,B' }),
      entry(4, { fileHash: hash(6), category: 'C' }),
    ]),
    corpus,
    chainId: BASE_SEPOLIA,
    commit: 'abc1234',
    ...overrides,
  };
}

describe('the ledger explains every entry by the column that produced it', () => {
  it('one line per index, with kind, formula, inputs, attested and replacedBy', () => {
    const ledger = buildRegistryLedger(input());

    expect(ledger.entries.map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(ledger.entries.map((e) => e.kind)).toEqual([
      'DOCUMENT_HASH',
      'CONTENT_HASH',
      'EVIDENCE_FILE_HASH',
      'EVIDENCE_PREVIOUS_FILE_HASH',
      'EVIDENCE_FILE_HASH',
    ]);
    for (const e of ledger.entries) {
      expect(e.formula.length).toBeGreaterThan(0);
      expect(e.attested.length).toBeGreaterThan(0);
      expect(e.replacedBy.length).toBeGreaterThan(0);
      expect(e.blockTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(e.submitter).toBe(REGISTRAR);
    }
  });

  it('a CONTENT_HASH entry lists every twin capture it covers; a DOCUMENT_HASH entry the one', () => {
    const ledger = buildRegistryLedger(input());
    expect(ledger.entries.at(1)?.inputs).toEqual([
      { snapshotId: 's1', url: 'https://x/', waybackTimestamp: '20220724130104' },
      { snapshotId: 's2', url: 'https://x/', waybackTimestamp: '20220805053301' },
    ]);
    expect(ledger.entries.at(0)?.inputs).toEqual([
      { snapshotId: 's1', url: 'https://x/', waybackTimestamp: '20220724130104' },
    ]);
  });

  it('an evidence name states the formula by the row’s type, and its inputs name the row', () => {
    const ledger = buildRegistryLedger(input());
    const forensic = ledger.entries.at(2);
    const document = ledger.entries.at(4);
    expect(forensic?.formula).toMatch(/forensicEvidenceFileHash/);
    expect(document?.formula).toMatch(/sha256/);
    expect(document?.formula).not.toMatch(/forensicEvidenceFileHash/);
    expect(forensic?.inputs).toEqual([{ evidenceId: 'e1', evidenceType: 'FORENSIC_DIFF' }]);
    expect(ledger.entries.at(3)?.inputs).toEqual([{ evidenceId: 'e1', evidenceType: 'FORENSIC_DIFF' }]);
  });

  it('carries the registry, chain, registrar, total, readAt and commit at file level; testnet by chain id; successor null', () => {
    const ledger = buildRegistryLedger(input());
    expect(ledger.registry).toBe(REGISTRY.toLowerCase());
    expect(ledger.chainId).toBe(BASE_SEPOLIA);
    expect(ledger.registrar).toBe(REGISTRAR);
    expect(ledger.totalEvidence).toBe(5);
    expect(ledger.readAt).toBe('2026-09-06T08:00:00.000Z');
    expect(ledger.commit).toBe('abc1234');
    expect(ledger.testnet).toBe(true);
    expect(ledger.successor).toBeNull();

  });

  it('testnet is false on Base mainnet — derived from the chain id, never a flag', () => {
    const ledger = buildRegistryLedger(input({ chainId: BASE_MAINNET, state: state([entry(0, { fileHash: hash(1) })]) }));
    expect(ledger.testnet).toBe(false);
  });
});

describe('the ruled kinds for entries no column explains', () => {
  it('PRE_WIPE: block time before 2026-08-21 on the testnet chain, derived', () => {
    const ledger = buildRegistryLedger(
      input({
        state: state([
          entry(0, { fileHash: hash(77), timestamp: at('2026-08-16T17:10:34Z'), category: 'A,B,C' }),
          entry(1, { fileHash: hash(1) }),
        ]),
      }),
    );
    expect(ledger.entries.at(0)?.kind).toBe('PRE_WIPE');
    expect(ledger.entries.at(0)?.inputs).toEqual([]);
    expect(ledger.entries.at(0)?.attested).toMatch(/2026-08-21/);
  });

  it('PRE_WIPE is staging’s only: on mainnet an early unexplained entry refuses', () => {
    expect(() =>
      buildRegistryLedger(
        input({
          chainId: BASE_MAINNET,
          state: state([entry(0, { fileHash: hash(77), timestamp: at('2026-08-16T17:10:34Z') })]),
        }),
      ),
    ).toThrow(LedgerRefusal);
  });

  it('ORPHANED: an unexplained index on the committed list for this registry passes with its kind', () => {
    const listed = ORPHANED_BY_REGISTRY[REGISTRY.toLowerCase()];
    expect(listed).toEqual([29, 30, 31, 32, 36]);

    const entries = Array.from({ length: 37 }, (_, i) =>
      entry(i, {
        fileHash: listed?.includes(i) === true ? hash(500 + i) : hash(1),
        timestamp: at('2026-08-27T09:19:00Z'),
      }),
    );
    const ledger = buildRegistryLedger(input({ state: state(entries) }));
    expect(ledger.entries.filter((e) => e.kind === 'ORPHANED').map((e) => e.index)).toEqual([29, 30, 31, 32, 36]);
    expect(ledger.entries.at(29)?.replacedBy).toMatch(/nothing/i);
  });

  it('an unexplained index NOT on the list refuses, naming the index', () => {
    const entries = [entry(0, { fileHash: hash(1) }), entry(1, { fileHash: hash(999), timestamp: at('2026-08-27T09:19:00Z') })];
    expect(() => buildRegistryLedger(input({ state: state(entries) }))).toThrow(LedgerRefusal);
    expect(() => buildRegistryLedger(input({ state: state(entries) }))).toThrow(/index 1/);
  });

  it('a listed index that a column DOES explain is not ORPHANED — the list never overrides the join', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(i, { fileHash: hash(1) }));
    const ledger = buildRegistryLedger(input({ state: state(entries) }));
    expect(ledger.entries.at(29)?.kind).toBe('DOCUMENT_HASH');
  });
});

describe('the ledger refuses rather than emits', () => {
  it('when the entry count is not totalEvidence()', () => {
    expect(() => buildRegistryLedger(input({ state: state([entry(0, { fileHash: hash(1) })], 2) }))).toThrow(
      /1 entries.*totalEvidence\(\) 2/,
    );
  });

  it('when an entry is AMBIGUOUS', () => {
    const collided: CorpusHashes = {
      snapshots: corpus.snapshots,
      evidence: [{ id: 'e9', fileHash: hash(1), previousFileHash: null, evidenceType: 'DOCUMENT' }],
    };
    expect(() =>
      buildRegistryLedger(input({ corpus: collided, state: state([entry(0, { fileHash: hash(1) })]) })),
    ).toThrow(/AMBIGUOUS/);
  });

  it('a ledger of nothing: an empty registry has no history to explain', () => {
    expect(() => buildRegistryLedger(input({ state: state([]) }))).toThrow(/nothing to explain/);
  });

  it('a refusal names every offending index, not the first', () => {
    const entries = [
      entry(0, { fileHash: hash(998), timestamp: at('2026-08-27T09:19:00Z') }),
      entry(1, { fileHash: hash(1) }),
      entry(2, { fileHash: hash(999), timestamp: at('2026-08-27T09:19:00Z') }),
    ];
    expect(() => buildRegistryLedger(input({ state: state(entries) }))).toThrow(/index 0[\s\S]*index 2/);
  });
});
