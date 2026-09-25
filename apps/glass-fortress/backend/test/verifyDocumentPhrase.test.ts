jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/services/archiveVerification', () => ({ verifyClaimText: jest.fn() }));

import { verifyClaimTextHandler } from '../src/mcp/tools/verifyClaimText';
import { verifyClaimText } from '../src/services/archiveVerification';
import { asked, resetDouble, store, written } from './helpers/evidenceDouble';
import {
  COMMITMENT,
  HELD_BEFORE,
  HELD_NOW,
  OTHER_COMMITMENT,
  RECEIPT,
  documentRow,
  seedHeld,
  seedSealed,
  versionRow,
} from './document/citationWorld';

// ---------------------------------------------------------------------------
// verify_claim_text's DOCUMENT ARM — docs/gf-document-flows.md A4 :1470 (RULED 2026-09-23, in scope 2026-09-24, R81 Q3).
//
// "{ commitment, phrase } … the ONE verdict rule (A3 :1385) over CURRENT(d)'s computed text — PRESENT | ABSENT |
// UNCHECKED … with the surrounding lines of a PRESENT match; free, writes nothing … refuses NOT_A_DOCUMENT ·
// AWAITING_DERIVATION · SHED · NEITHER (a call naming both a capture and a commitment, or neither, decided from the input
// before any row is read)."
//
// The capture arm's service is mocked: this file holds that the document arm never reaches it, and that NEITHER is
// decided before ANY read — the archive's or the database's.
// ---------------------------------------------------------------------------

const TEXT = [
  'שורה ראשונה',
  'שורה שנייה',
  'שורה שלישית',
  'חלה על עובדי הבריאות ותלמידי',
  'מקצועות הבריאות, כמפורט בתדריך.',
  'שורה שישית',
  'שורה שביעית',
  'שורה שמינית',
].join('\n');

const call = async (input: Record<string, unknown>): Promise<Record<string, unknown>> =>
  JSON.parse(await verifyClaimTextHandler({ phrase: 'עובדי הבריאות', ...input } as Parameters<typeof verifyClaimTextHandler>[0])) as Record<
    string,
    unknown
  >;

function seedText(text: string | null): void {
  store.documents = [documentRow()];
  store.documentContentVersions = [versionRow(HELD_NOW, { text })];
}

beforeEach(() => {
  resetDouble();
  jest.mocked(verifyClaimText).mockReset();
});

describe('NEITHER — exactly one target, decided from the INPUT before any row is read (A4 :1470; thesis A4 :1521)', () => {
  it('a call naming BOTH a capture and a commitment refuses NEITHER, reading nothing', async () => {
    seedHeld();
    const out = await call({ url: 'https://www.gov.il/x', capture: '20220805000000', commitment: COMMITMENT });
    expect(out['code']).toBe('NEITHER');
    expect([asked, jest.mocked(verifyClaimText).mock.calls]).toEqual([[], []]);
  });

  it('a call naming NO target refuses NEITHER, reading nothing', async () => {
    const out = await call({});
    expect(out['code']).toBe('NEITHER');
    expect([asked, jest.mocked(verifyClaimText).mock.calls]).toEqual([[], []]);
  });

  // A HALF-NAMED CAPTURE (R81 chunk 3 round 1, REVIEW's MEDIUM): before this arm zod REQUIRED `url` and `capture`; both
  // are optional now, so the handler's own check is the only guard that a capture is named whole.
  it('a capture named by its PAGE alone refuses NEITHER, reading nothing — the archive not asked, no row loaded', async () => {
    const out = await call({ url: 'https://www.gov.il/x' });
    expect(out['code']).toBe('NEITHER');
    expect([asked, jest.mocked(verifyClaimText).mock.calls]).toEqual([[], []]);
  });

  it('a capture named by its TIMESTAMP alone refuses NEITHER, reading nothing — the archive not asked, no row loaded', async () => {
    const out = await call({ capture: '20220805000000' });
    expect(out['code']).toBe('NEITHER');
    expect([asked, jest.mocked(verifyClaimText).mock.calls]).toEqual([[], []]);
  });

  it('a commitment beside a capture timestamp alone is still both targets — NEITHER', async () => {
    const out = await call({ capture: '20220805000000', commitment: COMMITMENT });
    expect(out['code']).toBe('NEITHER');
  });

  it('the capture arm is reached for a capture alone, and never for a commitment', async () => {
    jest.mocked(verifyClaimText).mockResolvedValue({ status: 'NOT_IN_ARCHIVE' } as never);
    await call({ url: 'https://www.gov.il/x', capture: '20220805000000' });
    seedHeld();
    await call({ commitment: COMMITMENT });
    expect(jest.mocked(verifyClaimText).mock.calls).toEqual([[{ url: 'https://www.gov.il/x', capture: '20220805000000', phrase: 'עובדי הבריאות' }]]);
  });
});

describe('the refusals, in order: NOT_A_DOCUMENT · SHED · AWAITING_DERIVATION', () => {
  it('NOT_A_DOCUMENT for a commitment naming no document — the tools HANDED a commitment keep that word (A4 :1398)', async () => {
    seedHeld();
    expect((await call({ commitment: OTHER_COMMITMENT }))['code']).toBe('NOT_A_DOCUMENT');
  });

  it('SHED for a document whose content was taken back — never AWAITING (A3 :1371)', async () => {
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    const out = await call({ commitment: COMMITMENT });
    expect([out['code'], String(out['error']).includes('2026-09-21')]).toEqual(['SHED', true]);
  });

  it('AWAITING_DERIVATION for a HELD document with no version under the current extractor', async () => {
    store.documents = [documentRow()];
    store.documentContentVersions = [versionRow(HELD_BEFORE, { derivedUnder: ['v0-an-older-extractor'] })];
    expect((await call({ commitment: COMMITMENT }))['code']).toBe('AWAITING_DERIVATION');
  });
});

describe('the verdict — the ONE rule over CURRENT(d).text, advisory, writing nothing', () => {
  it('PRESENT carries the matching line and two either side, numbered from 1', async () => {
    seedText(TEXT);
    const out = await call({ commitment: COMMITMENT, phrase: 'שורה שנייה' });
    expect([out['verdict'], out['contentVersionHash'], out['context']]).toEqual([
      'PRESENT',
      HELD_NOW,
      { from: 1, lines: ['שורה ראשונה', 'שורה שנייה', 'שורה שלישית', 'חלה על עובדי הבריאות ותלמידי'] },
    ]);
  });

  it('a phrase SPANNING a line break is PRESENT (whitespace collapsed, the rule unchanged), and the context covers both lines', async () => {
    seedText(TEXT);
    const out = await call({ commitment: COMMITMENT, phrase: 'ותלמידי מקצועות הבריאות' });
    expect([out['verdict'], out['context']]).toEqual([
      'PRESENT',
      { from: 2, lines: ['שורה שנייה', 'שורה שלישית', 'חלה על עובדי הבריאות ותלמידי', 'מקצועות הבריאות, כמפורט בתדריך.', 'שורה שישית', 'שורה שביעית'] },
    ]);
  });

  it('ABSENT carries no context', async () => {
    seedText(TEXT);
    const out = await call({ commitment: COMMITMENT, phrase: 'משפט שאינו במסמך' });
    expect([out['verdict'], out['context'], out['reason']]).toEqual(['ABSENT', null, null]);
  });

  it('UNCHECKED where CURRENT(d) has no text — the content is its bytes — with the reason, never ABSENT', async () => {
    seedText(null);
    const out = await call({ commitment: COMMITMENT });
    expect([out['verdict'], out['context'], typeof out['reason']]).toEqual(['UNCHECKED', null, 'string']);
  });

  it('UNCHECKED names a FAILED read apart from bytes no reader was chosen for (A2 :1300 `readFailed`)', async () => {
    store.documents = [documentRow()];
    store.documentContentVersions = [versionRow(HELD_NOW, { text: null, readFailed: true })];
    const out = await call({ commitment: COMMITMENT });
    expect([out['verdict'], String(out['reason']).includes('FAILED')]).toEqual(['UNCHECKED', true]);
  });

  it('a SEALED document is checked against its AT_RECEIPT version', async () => {
    seedSealed();
    const out = await call({ commitment: COMMITMENT, phrase: 'הטקסט המחושב' });
    expect([out['verdict'], out['contentVersionHash']]).toEqual(['PRESENT', RECEIPT]);
  });

  it('writes NOTHING, and says it is advisory', async () => {
    seedText(TEXT);
    const out = await call({ commitment: COMMITMENT });
    expect([written, typeof out['advisory']]).toEqual([[], 'string']);
  });
});
