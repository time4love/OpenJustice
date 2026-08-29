// ---------------------------------------------------------------------------
// LEVEL 3a — the rule that decides whether an anchoring claim is true.
//
// Pure, so every combination is reachable without a chain. That matters more
// here than usual: the states this rule distinguishes are the difference
// between a citable record and a fabricated one, and the only two ways they
// have ever been caught are a hand-run MCP tool and an audit two months late.
// ---------------------------------------------------------------------------

import {
  CONSISTENT_VERDICTS,
  ON_CHAIN_EXPLANATIONS,
  ON_CHAIN_VERDICTS,
  decideOnChainVerdict,
  onChainSourceStateHash,
  type OnChainClaim,
  type OnChainVerdict,
} from '../src/lib/onChainVerdict';

const HASH = `0x${'a'.repeat(64)}`;

function claim(over: Partial<OnChainClaim> = {}): OnChainClaim {
  return { inVault: false, status: null, txHash: null, snapshots: 0, ...over };
}

describe('decideOnChainVerdict', () => {
  // The full truth table, as a table. Written this way so that adding a branch
  // to the rule without adding a row here is visible as an untested member in
  // the exhaustiveness check below, rather than as a branch nobody noticed.
  const cases: {
    name: string;
    claim: OnChainClaim;
    registered: boolean;
    expected: OnChainVerdict;
  }[] = [
    {
      name: 'CONFIRMED, registered, tx recorded',
      claim: claim({ inVault: true, status: 'CONFIRMED', txHash: '0xtx' }),
      registered: true,
      expected: ON_CHAIN_VERDICTS.CONSISTENT,
    },
    {
      name: 'CONFIRMED with no registration — the fake-CONFIRMED class',
      claim: claim({ inVault: true, status: 'CONFIRMED', txHash: '0xtx' }),
      registered: false,
      expected: ON_CHAIN_VERDICTS.UNANCHORED_CONFIRMED,
    },
    {
      name: 'CONFIRMED and registered but the transaction is not recorded',
      claim: claim({ inVault: true, status: 'CONFIRMED', txHash: null }),
      registered: true,
      expected: ON_CHAIN_VERDICTS.MISSING_TX_HASH,
    },
    {
      name: 'PENDING_REVIEW and unregistered — the normal pre-promotion state',
      claim: claim({ inVault: true, status: 'PENDING_REVIEW' }),
      registered: false,
      expected: ON_CHAIN_VERDICTS.PENDING_UNREGISTERED,
    },
    {
      name: 'PENDING_REVIEW while the contract already holds the hash',
      claim: claim({ inVault: true, status: 'PENDING_REVIEW' }),
      registered: true,
      expected: ON_CHAIN_VERDICTS.PENDING_BUT_ANCHORED,
    },
    {
      name: 'nothing anywhere',
      claim: claim(),
      registered: false,
      expected: ON_CHAIN_VERDICTS.NOT_IN_VAULT,
    },
    {
      name: 'registered with nothing behind it',
      claim: claim(),
      registered: true,
      expected: ON_CHAIN_VERDICTS.ORPHANED_ANCHOR,
    },
    {
      name: 'captures hold the text and it is registered',
      claim: claim({ snapshots: 3 }),
      registered: true,
      expected: ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR,
    },
    {
      name: 'captures hold the text and the registry has never seen it',
      claim: claim({ snapshots: 3 }),
      registered: false,
      expected: ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(decideOnChainVerdict(c.claim, c.registered)).toBe(c.expected);
    });
  }

  it('every verdict the rule can name is reachable and explained', () => {
    // VACUITY GUARD. A table of cases proves the rows it contains and nothing
    // about the ones it lacks — and this rule's failure mode is a verdict that
    // exists, is never produced, and is therefore never questioned.
    const produced = new Set(cases.map((c) => c.expected));
    for (const verdict of Object.values(ON_CHAIN_VERDICTS)) {
      expect(produced.has(verdict)).toBe(true);
      expect(ON_CHAIN_EXPLANATIONS[verdict].length).toBeGreaterThan(0);
    }
    expect(produced.size).toBe(Object.values(ON_CHAIN_VERDICTS).length);
  });

  it('an unanchored capture is NOT consistent, and an unanchored nothing is', () => {
    // The distinction the old MCP tool could not draw. Both are "no Evidence
    // row and no registration"; only one of them is a chain-of-custody gap.
    expect(CONSISTENT_VERDICTS.has(ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED)).toBe(false);
    expect(CONSISTENT_VERDICTS.has(ON_CHAIN_VERDICTS.NOT_IN_VAULT)).toBe(true);
  });

  it('no verdict naming a disagreement is ever consistent', () => {
    // Stated as a property rather than a list, so a verdict added later has to
    // be admitted to the consistent set deliberately rather than by default.
    for (const verdict of [
      ON_CHAIN_VERDICTS.UNANCHORED_CONFIRMED,
      ON_CHAIN_VERDICTS.MISSING_TX_HASH,
      ON_CHAIN_VERDICTS.PENDING_BUT_ANCHORED,
      ON_CHAIN_VERDICTS.ORPHANED_ANCHOR,
      ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED,
    ]) {
      expect(CONSISTENT_VERDICTS.has(verdict)).toBe(false);
    }
  });
});

describe('onChainSourceStateHash', () => {
  const base = { fileHash: HASH, claim: claim({ inVault: true, status: 'CONFIRMED' }) };

  it('is stable for an unchanged claim', () => {
    expect(onChainSourceStateHash(base)).toBe(onChainSourceStateHash(base));
  });

  // EVERY INPUT MOVES IT. The lesson from one level up: a source-state hash
  // that covers only some of what a verdict was derived from certifies
  // freshness it cannot see. Each field is asserted separately so that dropping
  // one from the hash fails a named test rather than silently narrowing it.
  const moves: { field: string; claim: OnChainClaim }[] = [
    { field: 'inVault', claim: claim({ inVault: false, status: 'CONFIRMED' }) },
    { field: 'status', claim: claim({ inVault: true, status: 'PENDING_REVIEW' }) },
    { field: 'txHash', claim: claim({ inVault: true, status: 'CONFIRMED', txHash: '0xtx' }) },
    { field: 'snapshots', claim: claim({ inVault: true, status: 'CONFIRMED', snapshots: 1 }) },
  ];
  for (const m of moves) {
    it(`moves when ${m.field} changes`, () => {
      expect(onChainSourceStateHash({ fileHash: HASH, claim: m.claim })).not.toBe(
        onChainSourceStateHash(base),
      );
    });
  }

  it('moves when the hash itself changes', () => {
    expect(onChainSourceStateHash({ ...base, fileHash: `0x${'b'.repeat(64)}` })).not.toBe(
      onChainSourceStateHash(base),
    );
  });

  it('cannot be forged by content that contains the separator', () => {
    // Every component is hashed or a decimal count before joining, so no value
    // can shift the framing. `status` is the only free-text field, and this is
    // the pair that would collide under a raw join.
    const a = onChainSourceStateHash({ fileHash: HASH, claim: claim({ status: 'A|B' }) });
    const b = onChainSourceStateHash({ fileHash: HASH, claim: claim({ status: 'A' }) });
    expect(a).not.toBe(b);
  });

  it('does not commit to the chain answer, so it cannot certify what it never re-reads', () => {
    // §3's middle row, asserted rather than described. The hash exists to answer
    // "has OUR claim changed" — folding the chain observation in would make it
    // agree with itself forever, since recomputing it would re-read the chain.
    // Written as a signature test: the function takes no `registered` argument.
    expect(onChainSourceStateHash.length).toBe(1);
  });
});
