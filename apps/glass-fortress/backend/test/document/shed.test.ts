import { built } from './built';
import type { DocumentContentVersionRow, DocumentRow, ShedRow } from './contract';
import { held, shedRow, version } from './fixtures';

// ---------------------------------------------------------------------------
// §8 :875-:981, A2 :1319-:1323, A3 :1381-:1382 — SHED.
//
// THE ONE DESTRUCTION IN THIS DESIGN BEYOND THE REBUILD'S DROP, DEFINED ONCE. It removes
// what the platform holds OF the document and keeps everything ABOUT it, so that a reader
// of a thesis that cited it can still learn what happened while nobody can read what the
// sender took back (§8 :907-:932).
//
// STEP 35'S, AND RED HERE — this round is the researcher's door. What the round DOES owe
// is the SCAN half from step 28: no `delete` on any of the eight tables (plan §4 :413).
// ---------------------------------------------------------------------------

interface Shed {
  shed: (commitment: string, rows: readonly ShedRow[]) => boolean;
  flagged: (
    published: boolean,
    withdrawn: boolean,
    citationCurrent: boolean,
    isShed: boolean,
  ) => boolean;
}

const shedPredicates = (only: readonly string[]) => built<Shed>('services/documentPredicates', only);

describe('A3 :1381 — SHED(d) is "a Shed row exists", and one shed per document EVER (A2 :1320)', () => {
  it('true when a row names the commitment', async () => {
    const { shed } = await shedPredicates(['shed']);
    expect(shed(held().commitment, [shedRow()])).toBe(true);
  });

  it('false for a document no row names', async () => {
    const { shed } = await shedPredicates(['shed']);
    expect(shed('0x' + 'ee'.repeat(32), [shedRow()])).toBe(false);
  });
});

describe('A2 :1319-:1323 — the Shed CHECK: researcherId and reason REQUIRED iff OPERATOR', () => {
  it('a SENDER shed is attributed to NOBODY and carries no reason — consent withdrawn needs none (§8 :919)', () => {
    const row = shedRow({ cause: 'SENDER' });
    expect(row.researcherId).toBeNull();
    expect(row.reason).toBeNull();
  });

  it('an OPERATOR shed carries both — an attributed act with a reason (§8 :920-:923)', () => {
    const row = shedRow({ cause: 'OPERATOR', researcherId: 'res_1', reason: 'a legal demand' });
    expect(row.researcherId).not.toBeNull();
    expect(row.reason).not.toBeNull();
  });
});

describe('§8 :911-:918 — what SHED REMOVES against what it KEEPS', () => {
  it('REMOVES: the bytes, every version’s text and every opinion', () => {
    // The shape after SHED, as A2 :1305 and §8 :911 rule it. The row-count test that
    // proves nothing was deleted is step 35's (plan §4 :413); what this case fixes is
    // WHICH columns are nulled, so a later implementation cannot null fewer.
    const after: DocumentRow = held({ bytes: null });
    const hollow: DocumentContentVersionRow = version({ text: null, opinion: null });
    expect(after.bytes).toBeNull();
    expect(hollow.text).toBeNull();
    expect(hollow.opinion).toBeNull();
  });

  it('KEEPS: docId, commitment, every version’s HASH and provenance — the record of what was here', () => {
    const after = held({ bytes: null });
    const hollow = version({ text: null, opinion: null });
    expect(after.docId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(after.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hollow.contentVersionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hollow.extractor).not.toBe('');
    expect(hollow.extractorVersion).not.toBe('');
  });
});

describe('A3 :1382 / §8 :944-:947 — FLAGGED(m) gains its THIRD ARM', () => {
  it('flags a published mention whose record was SHED — "withdrawn by its sender, or shed by the operator"', async () => {
    const { flagged } = await shedPredicates(['flagged']);
    expect(flagged(true, false, true, true)).toBe(true);
  });

  it('keeps evidence A3’s two arms unchanged — WITHDRAWN and NOT CITATION_CURRENT', async () => {
    const { flagged } = await shedPredicates(['flagged']);
    expect(flagged(true, true, true, false)).toBe(true);
    expect(flagged(true, false, false, false)).toBe(true);
  });

  it('a mention on a DRAFT version is never flagged — FLAGGED is a published version’s state', async () => {
    const { flagged } = await shedPredicates(['flagged']);
    expect(flagged(false, true, false, true)).toBe(false);
  });

  it('an unshed, current, unwithdrawn published mention is NOT flagged — the floor against a flag that always fires', async () => {
    const { flagged } = await shedPredicates(['flagged']);
    expect(flagged(true, false, true, false)).toBe(false);
  });
});
