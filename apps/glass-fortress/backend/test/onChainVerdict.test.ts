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
  return { inVault: false, status: null, snapshots: 0, ...over };
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
    // THE FIVE EVIDENCE-STATUS ROWS LEFT THIS TABLE AT EVIDENCE STEP 11b, with
    // the statuses and the column they named. They asked what a CONFIRMED or
    // PENDING_REVIEW row deserves given a registration and a recorded
    // transaction; there is no CONFIRMED, no PENDING_REVIEW and no
    // `onChainTxHash`, because nothing above the corpus is anchored (evidence
    // §5) — so an evidence row has no registration to be consistent with.
    //
    // WHAT REPLACES THEM IS THE HONEST PAIR: a hash a registry holds that the
    // corpus explains as NOTHING is an ORPHANED_ANCHOR, and a promoted record the
    // registry has never seen is the NORMAL state rather than a defect. The
    // capture rows below are untouched and are what this check is about now.
    {
      name: 'an evidence row the registry also holds a hash for — an orphan, not a confirmation',
      claim: claim({ inVault: true, status: 'PROMOTED' }),
      registered: true,
      expected: ON_CHAIN_VERDICTS.ORPHANED_ANCHOR,
    },
    {
      name: 'a promoted record the registry has never seen — the normal state, not a defect',
      claim: claim({ inVault: true, status: 'PROMOTED' }),
      registered: false,
      expected: ON_CHAIN_VERDICTS.NOT_IN_VAULT,
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

  // A STORED VERDICT MAKES A CLAIM, and a false one is not archaeology
  // (CLAUDE.md). Found 2026-09-06 in the first anchor's stored explanation:
  // "anchored by its TEXT" — the anchor is over the BYTES (documentHash, the
  // scheme DOCUMENT_SHA256) — and two retired tools named as the way on.
  it('the capture explanations name the bytes, not the text, and no retired tool', () => {
    const anchored = ON_CHAIN_EXPLANATIONS[ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR];
    const owed = ON_CHAIN_EXPLANATIONS[ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED];
    expect(anchored).toMatch(/bytes/i);
    expect(anchored).not.toMatch(/by its TEXT|get_scan_findings|search_evidence/);
    expect(owed).not.toMatch(/forensics:anchor-snapshots/);
    expect(owed).toMatch(/scan_captures/);
  });

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
    // The three evidence-registration disagreements left the vocabulary at
    // evidence step 11b — an evidence row has no registration to disagree with —
    // so the list is the two the corpus can still produce. The property is
    // unchanged and is why it was written as a property: a verdict added later
    // has to be admitted to the consistent set deliberately.
    for (const verdict of [
      ON_CHAIN_VERDICTS.ORPHANED_ANCHOR,
      ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED,
    ]) {
      expect(CONSISTENT_VERDICTS.has(verdict)).toBe(false);
    }
  });
});

describe('onChainSourceStateHash', () => {
  const base = { fileHash: HASH, claim: claim({ inVault: true, status: 'PROMOTED' }) };

  it('is stable for an unchanged claim', () => {
    expect(onChainSourceStateHash(base)).toBe(onChainSourceStateHash(base));
  });

  // EVERY INPUT MOVES IT. The lesson from one level up: a source-state hash
  // that covers only some of what a verdict was derived from certifies
  // freshness it cannot see. Each field is asserted separately so that dropping
  // one from the hash fails a named test rather than silently narrowing it.
  const moves: { field: string; claim: OnChainClaim }[] = [
    { field: 'inVault', claim: claim({ inVault: false, status: 'PROMOTED' }) },
    { field: 'status', claim: claim({ inVault: true, status: 'WITHDRAWN' }) },
    { field: 'snapshots', claim: claim({ inVault: true, status: 'PROMOTED', snapshots: 1 }) },
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


  // THE FIVE EVIDENCE-STATUS CASES AND THE txHash SOURCE-STATE CASE WENT AT
  // EVIDENCE STEP 11b, WITH THE COLUMNS AND STATUSES THEY NAMED.
  //
  // They asked what verdict a CONFIRMED or PENDING_REVIEW evidence row deserves
  // given a registration and a recorded transaction. There is no CONFIRMED
  // status, no PENDING_REVIEW, and no transaction column: nothing above the
  // corpus is anchored (evidence §5), so an evidence row has no registration to
  // be consistent with. What survives is the branch that matters — a hash a
  // registry holds that the corpus explains as a CAPTURE is a SNAPSHOT_ANCHOR,
  // and one it explains as nothing is an ORPHANED_ANCHOR — and those cases are
  // above, untouched.
  //
  // THE VERDICT VALUES THEMSELVES STAY, with their explanations: stored check
  // rows carry them, and `check_on_chain_status` is rebuilt at step 12 re-scoped
  // to captures. `onChainVerdictExplanations.test.ts` holds that none of them
  // promises citability.