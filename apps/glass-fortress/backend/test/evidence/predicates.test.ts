// ---------------------------------------------------------------------------
// THE ONE PREDICATE HERE THAT QUERIES. Every other case in this file is a pure
// function over fixtures; `publicPage` is a question about the database (A3's
// PUBLIC_PAGE), so the database is a double — a page whose only citation sits on
// a WITHDRAWN published version, which is the state T6's amendment is about.
// `withdrawal` is declared on the double so the arm has a delegate to call when
// thesis step 24 builds it.
// ---------------------------------------------------------------------------
const PAGE_ID = 'page-1';
const RECORD_ON_THE_PAGE = '0xrecord-of-this-page';

/** One mention, on a version that WAS published and was then withdrawn. */
const MENTIONS = [{ refId: RECORD_ON_THE_PAGE, isThePinNow: false, everPublished: true }];

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findMany: jest.fn(() => Promise.resolve([{ fileHash: '0xrecord-of-this-page' }])),
      findUnique: jest.fn(),
    },
    thesisMention: {
      // Applies the filter the PREDICATE actually sends, over the rows above. A
      // double that answered a fixed number would agree with any query, which is
      // how a case stops testing the predicate and starts testing itself.
      count: jest.fn((args: { where?: { thesisVersion?: { isPublished?: unknown } } }) => {
        const asksForThePinOnly = args.where?.thesisVersion?.isPublished !== undefined;
        return Promise.resolve(
          MENTIONS.filter((m) => (asksForThePinOnly ? m.isThePinNow : m.everPublished)).length,
        );
      }),
      findUnique: jest.fn(),
    },
    withdrawal: { count: jest.fn(() => Promise.resolve(1)) },
    integrityCheck: { findMany: jest.fn(() => Promise.resolve([])) },
  },
}));

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
    // ADDED AT STEP 12 so this file COMPILES: `RegistryWritability` is a union,
    // and only the refusing arm carries the category. `expect` narrows nothing
    // for the compiler, so the guard is what lets the assertion below be read.
    // Neither assertion is changed.
    if (verdict.allowed) throw new Error('the refusing arm was expected');
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
    const mod = (await import('../../src/services/evidencePredicates')) as unknown as {
      argued: (m: unknown) => boolean;
    };
    expect(typeof mod.argued).toBe('function');
  });
});

describe('VERIFIED — RECOMPUTABLE and every capture ATTRIBUTED on chain', () => {
  it('is one importable symbol, built at evidence step 15', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as unknown as {
      verified: (e: unknown) => Promise<boolean>;
    };
    expect(typeof mod.verified).toBe('function');
  });
});

describe('PUBLISHABLE — the six checks of A6, calling A3 and never re-deriving', () => {
  it('is one importable symbol, built at evidence step 15', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as unknown as {
      publishable: (m: unknown) => Promise<boolean>;
    };
    expect(typeof mod.publishable).toBe('function');
  });
});

describe('PUBLIC_PAGE — a page any published version ever cited a record of', () => {
  it('is one importable symbol, built at evidence step 12', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as unknown as {
      publicPage: (id: string) => Promise<boolean>;
    };
    expect(typeof mod.publicPage).toBe('function');
  });
});

describe('FLAGGED — what a published page shows beside a citation', () => {
  it('is one importable symbol, built at evidence step 14', async () => {
    const mod = (await import('../../src/services/evidencePredicates')) as unknown as {
      flagged: (m: unknown) => Promise<boolean>;
    };
    expect(typeof mod.flagged).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// BUILT AT EVIDENCE STEP 12 — A3's PURE predicates, as pure functions over
// fixtures, which is what this file exists to hold them to.
//
// Each of these is a function the step-12 READS call and the step-15 GATE will
// call: "the checks CALL the predicates of A3 and never re-derive them — a
// second spelling of VERIFIED inside the gate is the copy that drifts". The
// scans file holds the second half of that rule; this half is the behaviour.
// ---------------------------------------------------------------------------

import { DIFF_VERSION } from '../../src/lib/diffVersion';
import {
  argued,
  citationCurrent,
  currentVersionOf,
  intervening,
  narrowed,
  needsReview,
  recomputable,
} from '../../src/services/evidencePredicates';

const BEFORE_TEXT = { textHash: 'text-before', textExtractionVersion: 'v3' };
const AFTER_TEXT = { textHash: 'text-after', textExtractionVersion: 'v3' };

/** A stored content version of the pair, at the version its provenance names. */
function version(over: Partial<{ before: string; after: string; diff: string; hash: string }> = {}) {
  return {
    contentVersionHash: over.hash ?? 'content-1',
    beforeTextHash: over.before ?? BEFORE_TEXT.textHash,
    afterTextHash: over.after ?? AFTER_TEXT.textHash,
    diffVersion: over.diff ?? DIFF_VERSION,
  };
}

describe('CURRENT(record) — derived from the record\'s current inputs, never stored', () => {
  it('CURRENT(capture) is the snapshot\'s own current text version', () => {
    const current = currentVersionOf({ kind: 'CAPTURE', capture: BEFORE_TEXT });
    expect(current).toEqual({
      defined: true,
      kind: 'CAPTURE',
      contentVersionHash: 'text-before',
    });
  });

  it('CURRENT(diff) is the version derived from BOTH endpoints under the current DIFF_VERSION', () => {
    const current = currentVersionOf({
      kind: 'DIFF',
      before: BEFORE_TEXT,
      after: AFTER_TEXT,
      versions: [version({ hash: 'stale', diff: 'older-differ' }), version()],
    });
    expect(current.defined).toBe(true);
    expect(current.defined && current.contentVersionHash).toBe('content-1');
  });

  it('AWAITING_DERIVATION when an ENDPOINT\'S TEXT has moved — the walk owes a version', () => {
    // The re-walk supersedes a text version and Level 5 re-derives every diff
    // spanning it. Between the two, CURRENT is undefined — and "awaiting is not
    // review: the human is not asked to judge a version that does not exist".
    const current = currentVersionOf({
      kind: 'DIFF',
      before: { textHash: 'text-before-v4', textExtractionVersion: 'v4' },
      after: AFTER_TEXT,
      versions: [version()],
    });
    expect(current).toEqual({ defined: false, reason: 'AWAITING_DERIVATION' });
  });

  it('AWAITING_DERIVATION when DIFF_VERSION has moved, though both texts are unchanged', () => {
    // "`DIFF_VERSION` moves → every diff gains a version … the price of a better
    // differ, paid by a human once per record, and stated here so nobody pays it
    // by surprise."
    const current = currentVersionOf({
      kind: 'DIFF',
      before: BEFORE_TEXT,
      after: AFTER_TEXT,
      versions: [version({ diff: 'v2-old-differ+v1-old-classifier' })],
    });
    expect(current.defined).toBe(false);
  });

  it('asks ONE equality for the differ and the classifier together, never two', () => {
    // src/lib/diffVersion.ts composes them for exactly this reason. A version
    // stored under either half alone is not CURRENT.
    const composed = version({ diff: DIFF_VERSION });
    expect(composed.diffVersion).toContain('+');
    expect(
      currentVersionOf({ kind: 'DIFF', before: BEFORE_TEXT, after: AFTER_TEXT, versions: [composed] })
        .defined,
    ).toBe(true);
  });
});

describe('NEEDS_REVIEW — content moved under an argument, and a human owes a decision', () => {
  const current = currentVersionOf({ kind: 'CAPTURE', capture: BEFORE_TEXT });

  it('a PROMOTED record whose CURRENT is not what a human affirmed', () => {
    const owed = needsReview({ status: 'PROMOTED', affirmedContentVersionHash: 'older' }, current);
    expect(owed).toEqual({ evaluable: true, value: true });
  });

  it('is FALSE while the affirmed version IS the current one', () => {
    const owed = needsReview({ status: 'PROMOTED', affirmedContentVersionHash: 'text-before' }, current);
    expect(owed.evaluable && owed.value).toBe(false);
  });

  it('a WITHDRAWN record is never owed a review — there is nothing to re-affirm', () => {
    const owed = needsReview({ status: 'WITHDRAWN', affirmedContentVersionHash: 'older' }, current);
    expect(owed.evaluable && owed.value).toBe(false);
  });

  it('does not evaluate at all where CURRENT is undefined, and says which', () => {
    const owed = needsReview(
      { status: 'PROMOTED', affirmedContentVersionHash: 'older' },
      { defined: false, reason: 'AWAITING_DERIVATION' },
    );
    expect(owed).toEqual({ evaluable: false, reason: 'AWAITING_DERIVATION' });
  });
});

describe('CITATION_CURRENT — the pin names the version CURRENT resolves to', () => {
  const current = currentVersionOf({
    kind: 'DIFF',
    before: BEFORE_TEXT,
    after: AFTER_TEXT,
    versions: [version()],
  });

  it('holds when the mention pins the current content version', () => {
    expect(citationCurrent({ contentVersionHash: 'content-1' }, current)).toEqual({
      evaluable: true,
      value: true,
    });
  });

  it('fails when the record moved under the citation — the flag a public page shows', () => {
    const stale = citationCurrent({ contentVersionHash: 'content-0' }, current);
    expect(stale.evaluable && stale.value).toBe(false);
  });

  it('a mention with no pin is not current — a citation pins a version or it cites nothing', () => {
    const unpinned = citationCurrent({ contentVersionHash: null }, current);
    expect(unpinned.evaluable && unpinned.value).toBe(false);
  });
});

describe('NARROWED and INTERVENING — material, never a flow (§7)', () => {
  const pair = { before: '20201209134003', after: '20210612183110' };

  it('a pair with an ACQUIRED capture between its endpoints is NARROWED', () => {
    expect(narrowed(pair, ['20201209134003', '20210101000000', '20210612183110'])).toBe(true);
  });

  it('is FALSE when the corpus holds nothing between them', () => {
    expect(narrowed(pair, ['20201209134003', '20210612183110'])).toBe(false);
  });

  it('the ENDPOINTS THEMSELVES never narrow their own pair', () => {
    expect(intervening(pair, [pair.before, pair.after])).toEqual([]);
  });

  it('INTERVENING names the captures, in timestamp order', () => {
    expect(intervening(pair, ['20210301000000', '20210101000000', '20210612183110'])).toEqual([
      '20210101000000',
      '20210301000000',
    ]);
  });

  it('is COMPUTED, never stored: it moves the moment the corpus gains a capture', () => {
    // "PREDECESSOR is derived, and that is where 'new' comes from." The same set
    // of endpoints answers differently as the corpus learns more, which is why
    // nothing writes NARROWED anywhere.
    const before = narrowed(pair, [pair.before, pair.after]);
    const after = narrowed(pair, [pair.before, '20210101000000', pair.after]);
    expect([before, after]).toEqual([false, true]);
  });
});

describe('RECOMPUTABLE — and it returns the name the record actually has', () => {
  const record = { kind: 'CAPTURE' as const, url: URL, capture: BEFORE };

  it('holds for a fileHash that IS the record\'s name', () => {
    const name = recordId(record);
    expect(recomputable(name, record)).toEqual({ recomputable: true, expected: name });
  });

  it('fails for any other name, and says what the record is called', () => {
    const verdict = recomputable('0xdeadbeef', record);
    expect(verdict.recomputable).toBe(false);
    expect(verdict.expected).toBe(recordId(record));
  });

  it('is the ONE function the audit and the reads share', async () => {
    // The instrument reports a malformed row and the read resolves a name; both
    // ask this. A second spelling is what the one-symbol scan forbids.
    const mod = await import('../../src/services/evidencePredicates');
    expect(typeof mod.recomputable).toBe('function');
  });
});

describe('ARGUED — three clauses, and each one removes a different way of being wrong', () => {
  // A3: "DebateSession(m.debateSessionId).status = PROMOTED AND that session's
  // recordFileHash = m.fileHash AND thesisId = m's thesis." The `typeof` case
  // above holds that the symbol EXISTS; these hold what it says. A predicate
  // whose clauses no case exercises is a predicate that can lose one silently —
  // the third clause was verifiably droppable with every suite still green.
  const debate = { status: 'PROMOTED', recordFileHash: '0xrecord', thesisId: 'thesis-1' };
  const mention = { name: '0xrecord', thesisId: 'thesis-1', debate };

  it('PROMOTED, for this record and this thesis', () => {
    expect(argued(mention)).toBe(true);
  });

  it('the SAME debate, for ANOTHER thesis, does not argue this citation', () => {
    // "Importance is a relation, and the relation is the thesis's" (§1). A second
    // thesis citing the same record argues its own (T3); inheriting the first's
    // argument is exactly what the pair-scoped debate exists to prevent.
    expect(argued({ ...mention, thesisId: 'thesis-2' })).toBe(false);
  });

  it('a debate PROMOTED for ANOTHER record does not argue this one', () => {
    expect(argued({ ...mention, name: '0xanother-record' })).toBe(false);
  });

  it('an OPEN debate has not cleared — an argument that never finished argues nothing', () => {
    expect(argued({ ...mention, debate: { ...debate, status: 'OPEN' } })).toBe(false);
  });

  it('an ABANDONED debate argues nothing either', () => {
    expect(argued({ ...mention, debate: { ...debate, status: 'ABANDONED' } })).toBe(false);
  });

  it('a mention with NO debate is a citation nobody has argued for', () => {
    // Legal in a draft's head version (T2), refused by PUBLISHABLE at the gate.
    expect(argued({ ...mention, debate: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RED BY NAME — THE ARM THIS TREE CANNOT YET EVALUATE.
// ---------------------------------------------------------------------------

describe('PUBLIC_PAGE — the EVER PUBLISHED arm, owed to thesis step 24', () => {
  it('a page cited by a WITHDRAWN published version stays PUBLIC — opened pages stay open', async () => {
    // Evidence A3 as AMENDED BY THESIS T6: PUBLIC_PAGE holds for a page that any
    // version EVER published cited — "v = PUBLISHED(t) now, or v names a
    // Withdrawal or is superseded by a later publication" — because "a public
    // record retracted is the state this design keeps nowhere, and a reader who
    // checked the corpus behind a thesis must still find it there after the
    // thesis is gone".
    //
    // RED ON THE BEHAVIOUR, NOT ON A MIGRATION. The fixture below is a thesis
    // with NO current pin whose withdrawn version carries an EVIDENCE mention of
    // a record of this page: exactly the state T6 says keeps the page open.
    // `publicPage` asks only for versions that ARE the pin, so it answers false
    // and this case fails BY NAME. It goes green when the predicate consults the
    // withdrawal — never when a table merely appears in the schema, which is a
    // migration landing rather than the arm being built.
    const mod = await import('../../src/services/evidencePredicates');
    await expect(mod.publicPage(PAGE_ID)).resolves.toBe(true);
  });
});
