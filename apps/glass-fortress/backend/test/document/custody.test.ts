import { built } from './built';
import type { Custody, DocumentRow, ShedRow } from './contract';
import { CUSTODY_VALUES, held, sealed, shedRow } from './fixtures';

// ---------------------------------------------------------------------------
// A2 :1274-:1275, A3 :1360-:1363 — CUSTODY IS DERIVED, NEVER A COLUMN, and
// RECOMPUTABLE differs by mode because what the platform can re-check differs by mode.
//
// THE POINT OF THE SEALED ARM: the platform verified the name ONCE, in memory, at receipt,
// and says so rather than pretending a standing audit (§2 :219-:221). A test that let the
// sealed arm recompute would be asserting the thing the design refuses to claim.
// ---------------------------------------------------------------------------

interface Predicates {
  custody: (document: DocumentRow, shed: ShedRow | null) => Custody;
  recomputableDocument: (document: DocumentRow, shed: ShedRow | null, bytes: Uint8Array | null) => boolean;
}

const predicates = (only: readonly string[]) => built<Predicates>('services/documentPredicates', only);

describe('A2 :1274-:1275 — CUSTODY(d), derived from what the platform holds', () => {
  it('HELD iff bytes present', async () => {
    const { custody } = await predicates(['custody']);
    expect(custody(held(), null)).toBe('HELD');
  });

  it('SEALED iff cid present and bytes absent', async () => {
    const { custody } = await predicates(['custody']);
    expect(custody(sealed(), null)).toBe('SEALED');
  });

  it('NONE iff a Shed row exists — and it wins over bytes, because SHED nulled them (§8 :911, A3 :1363)', async () => {
    const { custody } = await predicates(['custody']);
    expect(custody(held({ bytes: null }), shedRow())).toBe('NONE');
  });

  it('the three values are EXHAUSTIVE — a fourth would be a state no clause defines', async () => {
    const { custody } = await predicates(['custody']);
    const seen = new Set<string>([
      custody(held(), null),
      custody(sealed(), null),
      custody(held({ bytes: null }), shedRow()),
    ]);
    // THE FLOOR: three distinct answers, not "at least one".
    expect(seen.size).toBe(3);
    for (const value of seen) expect(CUSTODY_VALUES).toContain(value as Custody);
  });

  it('CUSTODY IS NOT READ FROM A COLUMN — a row carrying a contradictory one is ignored', async () => {
    const { custody } = await predicates(['custody']);
    const row = { ...held(), custody: 'SEALED' } as DocumentRow;
    expect(custody(row, null)).toBe('HELD');
  });
});

describe('A3 :1360-:1363 — RECOMPUTABLE(d), by mode', () => {
  it('HELD recomputes from storage, forever: sha256(bytes) = docId', async () => {
    const { recomputableDocument } = await predicates(['recomputableDocument']);
    const bytes = new Uint8Array([1, 2, 3]);
    const { createHash } = await import('node:crypto');
    const name = '0x' + createHash('sha256').update(bytes).digest('hex');
    expect(recomputableDocument(held({ docId: name }), null, bytes)).toBe(true);
  });

  it('HELD whose bytes do not hash to its name is MALFORMED, never "stale" (§2 :216-:218)', async () => {
    const { recomputableDocument } = await predicates(['recomputableDocument']);
    expect(recomputableDocument(held(), null, new Uint8Array([9, 9, 9]))).toBe(false);
  });

  it('SEALED is verifiedAtReceipt being SET — an observation, never re-evaluated', async () => {
    const { recomputableDocument } = await predicates(['recomputableDocument']);
    expect(recomputableDocument(sealed(), null, null)).toBe(true);
    expect(recomputableDocument(sealed({ verifiedAtReceipt: null }), null, null)).toBe(false);
  });

  it('SEALED does NOT recompute even when bytes are handed to it — the platform cannot repeat that check', async () => {
    const { recomputableDocument } = await predicates(['recomputableDocument']);
    // Bytes that hash to something else entirely. The sealed arm must still answer from
    // the stamp, because "the platform cannot repeat it, and says so rather than
    // pretending a standing audit" (§2 :220-:221).
    expect(recomputableDocument(sealed(), null, new Uint8Array([4, 5, 6]))).toBe(true);
  });

  it('NONE answers what was LAST RECORDED, as recorded (A3 :1363)', async () => {
    const { recomputableDocument } = await predicates(['recomputableDocument']);
    expect(recomputableDocument(sealed(), shedRow(), null)).toBe(true);
    expect(recomputableDocument(held({ bytes: null }), shedRow(), null)).toBe(false);
  });
});
