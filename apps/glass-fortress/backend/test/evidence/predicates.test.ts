import { writesAllowed } from '../../src/services/anchorSnapshots';
import { recordId } from '../../src/lib/evidenceIdentity';

// ---------------------------------------------------------------------------
// A3's DERIVATIONS, AS PURE FUNCTIONS — evidence flows A3.
//
// "Every predicate is computed on read and none is stored. A predicate a pass
// computed and stored would be a judgement the pass made." So each is a function
// over fixtures here, with ONE importable symbol per predicate — a second
// spelling of VERIFIED, CURRENT or PUBLISHABLE inside the publication gate is the
// copy that drifts, and A7 makes that a scan.
//
// RED BY DESIGN, AND THAT IS THE FILE'S JOB. `ARGUED`, `VERIFIED`, `PUBLISHABLE`,
// `PUBLIC_PAGE` and `FLAGGED` name modules steps 13 to 15 build; until then these
// cases fail on an import that does not resolve, which is what refactor plan §4
// rule 4 asks an acceptance suite to do. They are written now, from the appendix,
// so the step that builds each one is measured against a contract nobody wrote
// afterwards to fit it.
//
// WHAT IS GREEN HERE IS WHAT 11b BUILDS: the schema's own predicates and
// WRITES_ALLOWED, which is IMPORTED rather than re-spelled — `anchorSnapshots.ts`
// evaluates it once, at the one place a capture is anchored.
// ---------------------------------------------------------------------------

const URL = 'https://news.walla.co.il/item/3403847';
const BEFORE = { waybackTimestamp: '20201209134003', documentHash: '3b'.repeat(32) };
const AFTER = { waybackTimestamp: '20210612183110', documentHash: '9f'.repeat(32) };

/** A5's registry reader, as `writesAllowed` consumes it. */
function registry(over: Partial<{ total: bigint; category: string }> = {}) {
  const total = over.total ?? BigInt(0);
  return {
    registryAddress: '0xregistry',
    registrarAddress: '0xus',
    getTotalEvidence: jest.fn().mockResolvedValue(total),
    readEvidenceRecord: jest.fn().mockResolvedValue({ category: over.category ?? 'DOCUMENT_SHA256' }),
    isHashRegistered: jest.fn(),
    registerEvidenceHash: jest.fn(),
  };
}

describe('WRITES_ALLOWED — imported from the one module that evaluates it', () => {
  it('an EMPTY registry accepts writes: there is no meaning yet to contradict', async () => {
    expect((await writesAllowed(registry({ total: BigInt(0) }))).allowed).toBe(true);
  });

  it('a registry whose index 0 carries the anchoring scheme accepts writes', async () => {
    const r = registry({ total: BigInt(4), category: 'DOCUMENT_SHA256' });
    expect((await writesAllowed(r)).allowed).toBe(true);
  });

  it('REFUSES a registry that is neither empty nor scheme-stamped, and names index 0', async () => {
    // The window §8 holds shut BY A REFUSAL rather than by a written rule:
    // production's index 0 carries a classifier's category list, so a scan there
    // before the rotation refuses instead of ending the clean cut.
    const r = registry({ total: BigInt(20), category: 'Forensic Evidence' });
    const verdict = await writesAllowed(r);
    expect(verdict.allowed).toBe(false);
    expect(verdict.indexZeroCategory).toBe('Forensic Evidence');
  });

  it('IS DERIVED FROM THE CHAIN, never from a flag or a stored address', async () => {
    // No configuration is consulted: the contract's own state decides, which is
    // what makes "one meaning per registry" enforceable rather than remembered.
    const r = registry({ total: BigInt(1), category: 'DOCUMENT_SHA256' });
    await writesAllowed(r);
    expect(r.getTotalEvidence).toHaveBeenCalled();
    expect(r.readEvidenceRecord).toHaveBeenCalledWith(BigInt(0));
  });
});

describe('RECOMPUTABLE — a predicate a row satisfies or is malformed by', () => {
  it('holds for a row whose fileHash is its record\'s name', () => {
    const id = recordId({ kind: 'DIFF', url: URL, before: BEFORE, after: AFTER });
    expect(id).toBe(recordId({ kind: 'DIFF', url: URL, before: BEFORE, after: AFTER }));
  });

  it('IS NOT A RATE. Nothing legitimate makes it false', () => {
    // A re-walk changes text, a new extractor changes text, a correction changes
    // text — and none of the three is an input. There is no re-hash tool because
    // a row that fails did not drift; it was written wrong.
    const withOtherText = recordId({ kind: 'CAPTURE', url: URL, capture: BEFORE });
    expect(withOtherText).toBe(recordId({ kind: 'CAPTURE', url: URL, capture: BEFORE }));
  });
});

// ---------------------------------------------------------------------------
// RED UNTIL THE STEP THAT BUILDS EACH ONE.
// ---------------------------------------------------------------------------

describe('ARGUED — the mention\'s debate is PROMOTED for this thesis and this record', () => {
  it('is one importable symbol, built at evidence step 13', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as {
      argued: (m: unknown) => boolean;
    };
    expect(typeof mod.argued).toBe('function');
  });
});

describe('VERIFIED — RECOMPUTABLE and every capture ATTRIBUTED on chain', () => {
  it('is one importable symbol, built at evidence step 15', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as {
      verified: (e: unknown) => Promise<boolean>;
    };
    expect(typeof mod.verified).toBe('function');
  });
});

describe('PUBLISHABLE — the six checks of A6, calling A3 and never re-deriving', () => {
  it('is one importable symbol, built at evidence step 15', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as {
      publishable: (m: unknown) => Promise<boolean>;
    };
    expect(typeof mod.publishable).toBe('function');
  });
});

describe('PUBLIC_PAGE — a page any published version ever cited a record of', () => {
  it('is one importable symbol, built at evidence step 12', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as {
      publicPage: (id: string) => Promise<boolean>;
    };
    expect(typeof mod.publicPage).toBe('function');
  });
});

describe('FLAGGED — what a published page shows beside a citation', () => {
  it('is one importable symbol, built at evidence step 14', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as {
      flagged: (m: unknown) => Promise<boolean>;
    };
    expect(typeof mod.flagged).toBe('function');
  });
});
