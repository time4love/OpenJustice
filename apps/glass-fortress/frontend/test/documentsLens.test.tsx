jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());
jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());

import { act, fireEvent } from '@testing-library/react';
import { parseDocuments } from '../src/lib/researchBody';
import { gatedFetchUrls, renderResearchCorpus } from './render';

// ---------------------------------------------------------------------------
// THE DOCUMENTS LENS — docs/gf-ui-flows.md §24 :719 (RULED 2026-09-22 at board י3) and :748 (the lens CONTROL, separate
// from the filter chips); document flows A4 :1432–:1434, the ENVELOPE AS RULED 2026-09-23 (batch item 15). The type and
// parser are written to :1434's words, never to the service's types. Board י3's words are PINNED AS LITERALS (R63).
// ---------------------------------------------------------------------------

const PAGE = 'https://doi.org/10.17179/excli2026-9596';
const ENVELOPE = {
  documents: [
    {
      commitment: '0x' + 'c1'.repeat(32),
      title: 'מערך הנתונים המשלים למאמר על תקשורת סיכון לבבי, 2026',
      custody: 'HELD',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteLength: 1200000,
      // Received on a day whose drawing („25.9.2026") does not CONTAIN the asserted one („3.9.2026") — a date read off
      // the wrong field must not pass by substring.
      receivedAt: '2026-09-25T10:00:00.000Z',
      assertions: { assertedUrl: PAGE, assertedAt: '2026-09-03', derivedFrom: null },
      current: { contentVersionHash: '0x' + 'e1'.repeat(32) },
      anchored: false,
      citedBy: [],
      opening: null,
      by: { handle: 'researcher-one', mine: true },
    },
    {
      commitment: '0x' + 'c2'.repeat(32),
      title: 'תמליל הריאיון עם מנכ״ל המשרד, 12.9.2026',
      custody: 'HELD',
      mimeType: 'application/pdf',
      byteLength: 14000,
      receivedAt: '2026-09-23T11:00:00.000Z',
      assertions: { assertedUrl: 'https://www.youtube.com/watch', assertedAt: '2026-09-12', derivedFrom: { commitment: '0x' + 'c9'.repeat(32), title: 'הריאיון עם מנכ״ל המשרד' } },
      current: { awaiting: 'AWAITING_DERIVATION' },
      anchored: false,
      citedBy: [{ thesisId: 'thesis-1', published: false }],
      opening: null,
      by: { handle: 'researcher-two', mine: false },
    },
  ],
  uploadUrl: 'http://localhost:3011/he/upload',
};

const DOCUMENTS = '/api/research/documents';
const lens = (body: unknown = ENVELOPE) =>
  renderResearchCorpus('he', { searchParams: { lens: 'documents' }, answers: { [DOCUMENTS]: { status: 200, body } } });

afterEach(() => {
  window.localStorage.clear();
});

describe('the envelope parser — A4 :1434 as ruled, field by field', () => {
  it('parses the ruled shape', () => {
    expect(parseDocuments(ENVELOPE).documents).toHaveLength(2);
  });

  it.each([
    ['`anchored` that is not a boolean', { anchored: 'false' }],
    ['a `by` that is neither null nor { handle, mine }', { by: { handle: 'x' } }],
    ['a custody outside HELD · SEALED · NONE', { custody: 'LOST' }],
    // A4 :1434 as ruled 2026-09-23 (#582): `current` is ONE shape with read_document's — the bare-hash spelling is drift.
    ['a `current` spelled as a bare hash', { current: '0x' + 'e1'.repeat(32) }],
    ['a `current` that is null', { current: null }],
    ['an `awaiting` that is not AWAITING_DERIVATION', { current: { awaiting: 'LATER' } }],
    ['a derivedFrom without its commitment', { assertions: { assertedUrl: null, assertedAt: null, derivedFrom: { title: 't' } } }],
  ])('REFUSES %s — naming the field, never a region silently empty', (_name, patch) => {
    const drifted = { ...ENVELOPE, documents: [{ ...ENVELOPE.documents[0], ...patch }] };
    expect(() => parseDocuments(drifted)).toThrow(/documents/);
  });
});

describe('the lens control — a THIRD lens at the GATED door only (ui §24 :719, :748)', () => {
  it('`/research/corpus` offers PAGES · CITED · DOCUMENTS, and the documents lens is current on `?lens=documents`', async () => {
    const container = await lens();
    const lenses = [...container.querySelectorAll('[data-lens]')];
    expect(lenses.map((one) => one.getAttribute('data-lens'))).toEqual(['pages', 'cited', 'documents']);
    expect(container.querySelector('[data-lens="documents"]')?.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('[data-lens="documents"]')?.textContent).toBe('מסמכים');
  });

  it('the lens makes ONE read, the documents route — no corpus read beside it (§8)', async () => {
    await lens();
    expect(gatedFetchUrls()).toEqual([DOCUMENTS]);
  });
});

describe('the rows as board י3 draws them — date, title, page, custody, anchoring, cited-by, derived-from', () => {
  it('„המסמכים שלי" by default, the caller’s own rows only, each row the board’s facts', async () => {
    const container = await lens();
    expect(container.querySelector('[data-documents-heading]')?.textContent).toBe('המסמכים שלי');
    const rows = [...container.querySelectorAll('[data-document-row]')];
    expect(rows).toHaveLength(1);
    const text = rows.at(0)?.textContent ?? '';
    // THE DATE CELL, EXACTLY: the ASSERTED day, as board י3 draws it — never the day received (25.9.2026).
    expect(rows.at(0)?.firstElementChild?.textContent).toBe('3.9.2026');
    for (const fact of ['מערך הנתונים המשלים למאמר על תקשורת סיכון לבבי, 2026', 'doi.org/10.17179/excli2026-9596', 'מוחזק', 'ממתין לעיגון']) {
      expect(text).toContain(fact);
    }
    // The page is domain + path, never the scheme; the commitment is a name, never text (ui §4 :168).
    expect(text).not.toContain('https://');
    expect(text).not.toContain('0x' + 'c1'.repeat(32));
  });

  it('„של כולם" adds every researcher’s rows; a derived document carries its tick, a cited one „מצוטט בתזה"', async () => {
    const container = await lens();
    const everyone = container.querySelector('[data-scope-option="all"]');
    if (everyone === null) throw new Error('the lens draws no scope switch');
    await act(async () => {
      fireEvent.click(everyone);
      await Promise.resolve();
    });
    const rows = [...container.querySelectorAll('[data-document-row]')];
    expect(rows).toHaveLength(2);
    const derived = rows.at(1)?.textContent ?? '';
    expect(derived).toContain('נגזר מ־');
    expect(derived).toContain('הריאיון עם מנכ״ל המשרד');
    expect(derived).toContain('מצוטט בתזה');
    expect(rows.at(0)?.textContent).not.toContain('מצוטט בתזה');
  });

  it('a row with NO asserted day draws the day it was RECEIVED — the date cell, exactly', async () => {
    const unasserted = {
      ...ENVELOPE.documents[0],
      commitment: '0x' + 'c3'.repeat(32),
      receivedAt: '2026-09-14T08:00:00.000Z',
      assertions: { assertedUrl: null, assertedAt: null, derivedFrom: null },
    };
    const container = await lens({ ...ENVELOPE, documents: [unasserted] });
    const rows = [...container.querySelectorAll('[data-document-row]')];
    expect(rows).toHaveLength(1);
    expect(rows.at(0)?.firstElementChild?.textContent).toBe('14.9.2026');
  });

  it('the dialog is NOT reachable from here — one line says so, and nothing links to /upload (§24 :719; ui §1 :36–:39)', async () => {
    const container = await lens();
    expect(container.textContent).toContain('מסמך נוסף? בקשו בשיחה את הקישור להעלאה — הדלת אינה בניווט.');
    expect([...container.querySelectorAll('a')].filter((a) => (a.getAttribute('href') ?? '').includes('/upload'))).toEqual([]);
  });

  it('an EMPTY lens renders its one sentence (ui A2 :1148)', async () => {
    const container = await lens({ documents: [], uploadUrl: 'http://localhost:3011/he/upload' });
    expect(container.querySelector('[data-documents-empty]')).not.toBeNull();
    expect(container.querySelectorAll('[data-document-row]')).toHaveLength(0);
  });
});
