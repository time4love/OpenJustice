import { built } from './built';
import type { DocumentOpeningDecisionRow, Opening } from './contract';
import { OPENING_ORDER } from './fixtures';

// ---------------------------------------------------------------------------
// §7 :754-:818, A3 :1377-:1380 — WHAT PUBLICATION OPENS.
//
// A DOCUMENT HAS NO PAGE, so what publication opens is a DECISION the researcher makes
// per document, having read it — the one judgement the platform cannot make for them
// (§7 :805-:809). What the platform enforces is that it IS made, explicitly, before
// publication, by the person who read the bytes, and recorded.
//
// OPENED IS THE WIDEST across every thesis whose PUBLISHED version cites the document,
// and PUBLIC(d) is per document — THERE IS NO PUBLIC_PAGE ANALOGUE and no "the sender's
// other documents" (A3 :1379-:1380).
// ---------------------------------------------------------------------------

interface Openings {
  opened: (
    commitment: string,
    decisions: readonly DocumentOpeningDecisionRow[],
    publishedTheses: readonly string[],
  ) => Opening | null;
  publicDocument: (
    commitment: string,
    decisions: readonly DocumentOpeningDecisionRow[],
    publishedTheses: readonly string[],
  ) => boolean;
}

const openings = (only: readonly string[]) => built<Openings>('services/documentPredicates', only);

const COMMITMENT = '0x' + 'c1'.repeat(32);

function decision(over: Partial<DocumentOpeningDecisionRow> = {}): DocumentOpeningDecisionRow {
  return {
    id: 'dod_1',
    thesisId: 'th_1',
    commitment: COMMITMENT,
    sequence: 1,
    opening: 'PASSAGE',
    researcherId: 'res_1',
    createdAt: new Date('2026-09-21T00:00:00.000Z'),
    ...over,
  };
}

describe('§7 :777-:789 — the three openings, and the ORDER that IS the widening rule', () => {
  it('PASSAGE < CONTENT < BYTES, compared by position and never by name', () => {
    expect(OPENING_ORDER).toEqual(['PASSAGE', 'CONTENT', 'BYTES']);
    // THE FLOOR: three openings, so a set that lost one cannot pass.
    expect(OPENING_ORDER).toHaveLength(3);
  });
});

describe('A3 :1377-:1378 — OPENED(d) is the WIDEST of the decisions in force', () => {
  it('one decision on one published thesis gives that opening', async () => {
    const { opened } = await openings(['opened']);
    expect(opened(COMMITMENT, [decision({ opening: 'CONTENT' })], ['th_1'])).toBe('CONTENT');
  });

  it('two theses give the WIDER of the two — what one reader may see, every reader may', async () => {
    const { opened } = await openings(['opened']);
    const narrow = decision({ thesisId: 'th_1', opening: 'PASSAGE' });
    const wide = decision({ id: 'dod_2', thesisId: 'th_2', opening: 'BYTES' });
    expect(opened(COMMITMENT, [narrow, wide], ['th_1', 'th_2'])).toBe('BYTES');
  });

  it('a decision by a thesis that is NOT PUBLISHED does not open anything (A3 :1377)', async () => {
    const { opened } = await openings(['opened']);
    expect(opened(COMMITMENT, [decision({ opening: 'BYTES', thesisId: 'th_draft' })], [])).toBeNull();
  });

  it('the LATEST decision per thesis is the one in force — sequence decides, not order of arrival', async () => {
    const { opened } = await openings(['opened']);
    const first = decision({ sequence: 1, opening: 'PASSAGE' });
    const later = decision({ id: 'dod_2', sequence: 2, opening: 'CONTENT' });
    expect(opened(COMMITMENT, [later, first], ['th_1'])).toBe('CONTENT');
  });

  it('none decided is NULL — and null is "not public", never a default of PASSAGE', async () => {
    const { opened } = await openings(['opened']);
    expect(opened(COMMITMENT, [], ['th_1'])).toBeNull();
  });
});

describe('A3 :1379-:1380 — PUBLIC(d) is PER DOCUMENT, and there is no PUBLIC_PAGE analogue', () => {
  it('public exactly when OPENED is defined', async () => {
    const { publicDocument } = await openings(['publicDocument']);
    expect(publicDocument(COMMITMENT, [decision()], ['th_1'])).toBe(true);
    expect(publicDocument(COMMITMENT, [], ['th_1'])).toBe(false);
  });

  it('ANOTHER document of the same arrival is NOT opened by this one (§7 :859-:860)', async () => {
    const { publicDocument } = await openings(['publicDocument']);
    const sibling = '0x' + 'c2'.repeat(32);
    expect(publicDocument(sibling, [decision({ commitment: COMMITMENT })], ['th_1'])).toBe(false);
  });
});
