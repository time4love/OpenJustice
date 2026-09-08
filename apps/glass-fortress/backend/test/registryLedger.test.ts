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
};

// THE EVIDENCE FIXTURE WENT WITH THE ARM AT EVIDENCE STEP 11b. `CorpusHashes`
// held evidence rows so an entry could be explained as a name under the retired
// formula, from `fileHash` and `previousFileHash`. Both columns left the row:
// identity never moves under the target, and no evidence row is registered at
// all — nothing above the corpus is anchored (evidence §5).
//
// THE ENTRIES ARE STILL EXPLAINED, in the place §8 puts them: "every old entry
// is explained in GIT, not in a table". Each frozen registry's ledger is emitted
// once, before its database is dropped, and committed —
// `registry-ledger/84532-0x65b9….json` for staging's, written at refactor step 9.
// `registryLedgerCommitted.test.ts` holds that file complete against
// `totalEvidence()`, and it is untouched by this change: the explanations
// outlive the rows that produced them, which is the whole reason the design put
// them in a file.

function input(overrides: Partial<LedgerInput> = {}): LedgerInput {
  return {
    state: state([
      entry(0, { fileHash: hash(1) }),
      entry(1, { fileHash: hash(2) }),
      // THE THREE EVIDENCE-NAME ENTRIES LEFT THIS FIXTURE AT EVIDENCE STEP 11b.
      // They were explained by `Evidence.fileHash` and `previousFileHash`, and
      // both columns are gone. On a real frozen registry such an entry is now
      // ORPHANED — unexplained by any column and carried on the committed list —
      // which the group below asserts against the list this repository ships.
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

    expect(ledger.entries.map((e) => e.index)).toEqual([0, 1]);
    expect(ledger.entries.map((e) => e.kind)).toEqual(['DOCUMENT_HASH', 'CONTENT_HASH']);
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

  // THE EVIDENCE-FORMULA CASE WENT WITH THE ARM AT EVIDENCE STEP 11b. It held
  // that an entry explained as an evidence name stated the formula BY THE ROW'S
  // TYPE — `url + "\n\n" + text.slice(0, 40000)` for a document, the four-input
  // diff formula for a forensic one — read from `Evidence.evidenceType`. The
  // column and both hash columns left the row, so no live registry classifies an
  // entry that way: the walk is the only chain writer, and it writes a capture's
  // `documentHash` under one scheme. A frozen registry's evidence entries are
  // ORPHANED and explained by the committed list, asserted below.

  // THE DOCUMENT-FORMULA CASE WENT WITH THE EVIDENCE ARM. It held that the
  // formula naming `url + "\n\n" + text.slice(0, 40000)` stated the 40,000-char
  // bound it claims to explain (reviewer finding 5, 2026-09-06) — a property of
  // a formula string only an evidence-name entry carries. `create_evidence_from_text`
  // and its identity were retired in 11a-document, and no live registry entry is
  // an evidence name. The bound itself is no longer computed anywhere.

  it('carries the registry, chain, registrar, total, readAt and commit at file level; testnet by chain id; successor null', () => {
    const ledger = buildRegistryLedger(input());
    expect(ledger.registry).toBe(REGISTRY.toLowerCase());
    expect(ledger.chainId).toBe(BASE_SEPOLIA);
    expect(ledger.registrar).toBe(REGISTRAR);
    expect(ledger.totalEvidence).toBe(2);
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
    // Collided between the two CAPTURE columns now that evidence has none: one
    // capture's `documentHash` equals another's `contentHash`, so the entry is
    // explained two ways and the emitter must refuse rather than pick.
    const collided: CorpusHashes = {
      snapshots: [
        corpus.snapshots[0]!,
        { id: 's9', waybackTimestamp: '20220901000000', url: 'https://x/', documentHash: hash(9).slice(2), contentHash: hash(1).slice(2) },
      ],
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
