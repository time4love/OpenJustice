const mockPushed: string[] = [];
jest.mock('../src/i18n/navigation', () => {
  const real = jest.requireActual<typeof import('../src/i18n/navigation')>('../src/i18n/navigation');
  return { ...real, useRouter: () => ({ push: (href: string) => mockPushed.push(href) }) };
});
jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());

import { webcrypto } from 'node:crypto';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { UploadDialog } from '@/components/upload/UploadDialog';
import { readUploadLink } from '@/lib/uploadLink';
import { globalFetchDouble, renderWithIntl, setAuthState, type FetchDouble } from './render';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG — boards י1 · י1ב · י2 of `docs/boards/gf-ui-boards-2026-09-22.html`; document flows §9 :998;
// ui §1 :39 (a DIALOG); ui A1 :1129 (its one route); ui A2 :1150–:1151 (401, 403); R76 chunk-2 prompt §1 (MEDIUM 1:
// storage's "already exists" IS uploaded; MEDIUM 2: the gate); R78 chunk-3 prompt amendments 1, 2, 4, 5.
//
// THE BOARD'S WORDS ARE PINNED AS LITERALS, never read from the catalogue (R63's ruling): a case that reads the
// catalogue drifts with it. The route and the storage are `global.fetch`, answering by URL.
// ---------------------------------------------------------------------------

const SENTENCE = 'הקובץ עולה מהדפדפן שלכם אל המחסן, תחת שם שחושב ממנו כאן. הוא נעשה מסמך רק כשהפקודה שלמטה נשלחת בשיחה.';
const STRIP = 'קובץ אחד · PDF · XLSX · CSV · תמונה · שמע · וידאו · עד 50 MB';
const UPLOADED = 'הועלה · ממתין לפקודה';
/** The researcher's own words for bytes already in the store (D doc §5, F2) — drawn by no board, printed at the page. */
const STORED = 'כבר במחסן · ממתין לפקודה';
/** STORAGE_UNAVAILABLE's sentence — PROPOSED, printed at the page for the researcher's approval. */
const STORAGE_UNAVAILABLE = 'המחסן לא ענה, ושום דבר לא הועלה. נסו שוב.';
const CLOSING = 'אחרי שהפקודה תרוץ, המסמך יופיע במסמכים שלכם וניתן לצטט אותו בגרסה.';
const FORBIDDEN = 'החשבון הזה אינו חוקר מאושר.';

const TITLE = 'מערך הנתונים המשלים למאמר על תקשורת סיכון לבבי, 2026';
const PAGE = 'https://doi.org/10.17179/excli2026-9596';
const BYTES = new Uint8Array(Buffer.from('document-identity-vector-v1', 'ascii'));
/** `documentIdentity.ts` :152's pin for those bytes — the browser half computes it in `documentHashVector.test.ts`. */
const DOC_ID = '0xf33b465ef60084f3e81652a0d758129db9384af8d1d382167b44b9ef2cd65e8f';
const SIGNED = `https://storage.test/storage/v1/object/upload/sign/documents/${DOC_ID}?token=t`;
const ROUTE = '/api/document-upload';

const LINK = new URLSearchParams({ url: PAGE, at: '2026-09-03', title: TITLE });

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

let fetching: FetchDouble | null = null;

beforeEach(() => {
  mockPushed.length = 0;
  window.history.pushState({}, '', `/he/upload?${LINK.toString()}`);
});

afterEach(() => {
  fetching?.restore();
  fetching = null;
  setAuthState(undefined);
});

function render(link: URLSearchParams = LINK, auth: Parameters<typeof setAuthState>[0] = 'approved-researcher') {
  setAuthState(auth);
  return renderWithIntl(<UploadDialog link={readUploadLink(link)} />, { locale: 'he' });
}

async function chooseFile(container: HTMLElement, name = 'excli2026-9596-supplementary.xlsx', type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const input = container.querySelector('input[type="file"]');
  if (input === null) throw new Error('the dialog draws no file input');
  const file = new File([BYTES], name, { type });
  // jsdom's Blob has no `arrayBuffer()` (every current browser's does — `Blob.prototype.arrayBuffer`), so the
  // fixture supplies it from its own bytes; the dialog reads the file exactly as a browser would let it.
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(BYTES.slice().buffer) });
  // A `FileList`'s own shape — indexed, with `length` and `item()` — which is what a browser hands `change`. jsdom
  // cannot build one and `@testing-library/user-event` is not installed; a bare array would be a world no browser makes.
  const files = { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) };
  await act(async () => {
    fireEvent.change(input, { target: { files } });
    await Promise.resolve();
  });
}

describe('the dialog as drawn — the link’s facts are LABELS, the file is the ONE input (boards י1, י2)', () => {
  it('heading, the one sentence, the labels the link brought, the drop zone and its strip', () => {
    const { container } = render();
    expect(screen.getByRole('heading', { name: 'העלאת מסמך' })).toBeTruthy();
    expect(container.textContent).toContain(SENTENCE);
    for (const [label, value] of [['שם המסמך', TITLE], ['הדף', PAGE], ['התאריך', '3.9.2026']]) {
      expect(container.textContent).toContain(label);
      expect(container.textContent).toContain(value);
    }
    expect(container.textContent).toContain('גרור ושחרר קובץ כאן, או לחץ לבחירה');
    expect(container.textContent).toContain(STRIP);
  });

  it('EXACTLY ONE input, and it is the file — no fact is a field (§9 :998, "labels, never fields")', () => {
    const { container } = render();
    const inputs = [...container.querySelectorAll('input, textarea, select')];
    expect(inputs.map((input) => input.getAttribute('type'))).toEqual(['file']);
    expect(inputs.at(0)?.hasAttribute('multiple')).toBe(false);
  });

  it('a label the link did not bring is NOT drawn — no page, no date, no derived-from', () => {
    const { container } = render(new URLSearchParams({ title: TITLE }));
    expect(container.textContent).toContain('שם המסמך');
    expect(container.textContent).not.toContain('הדף');
    expect(container.textContent).not.toContain('התאריך');
    expect(container.textContent).not.toContain('נגזר מ־');
  });

  it('derived-from is drawn with the document’s title the link carried (board י1ב)', () => {
    const { container } = render(new URLSearchParams({ title: 'תמליל הריאיון', derivedFrom: '0x' + 'c1'.repeat(32), derivedFromTitle: 'הריאיון עם מנכ״ל המשרד' }));
    expect(container.textContent).toContain('נגזר מ־');
    expect(container.textContent).toContain('הריאיון עם מנכ״ל המשרד');
    // The commitment is a name, never text (ui §4 :168): only the command may carry it.
    expect(container.textContent).not.toContain('0x' + 'c1'.repeat(32));
  });

  it('derived-from carries its KIND after the title, in the strip’s word — „… (וידאו)" (board י1ב)', () => {
    const { container } = render(new URLSearchParams({ title: 'תמליל הריאיון', derivedFrom: '0x' + 'c1'.repeat(32), derivedFromTitle: 'הריאיון עם מנכ״ל המשרד, 12.9.2026', derivedFromFamily: 'VIDEO' }));
    const row = [...container.querySelectorAll('dd')].find((dd) => dd.textContent.includes('הריאיון עם מנכ״ל המשרד'));
    expect(row?.textContent).toBe('הריאיון עם מנכ״ל המשרד, 12.9.2026 (וידאו)');
  });

  it('no ☰ and no navigation of its own — a DIALOG (ui §1 :39)', () => {
    const { container } = render();
    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByRole('button', { name: /תפריט|menu/i })).toBeNull();
  });
});

describe('a link the dialog REFUSES — one sentence, and no file is accepted (amendment 2; §9 :998)', () => {
  it('a REPEATED key is a malformed link, said so — the dialog never picks the first or the last', () => {
    const repeated = new URLSearchParams(LINK);
    repeated.append('at', '2026-09-04');
    const { container } = render(repeated);
    expect(container.textContent).toContain('הקישור פגום');
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('a link with no title sends the researcher back to the conversation for one', () => {
    const { container } = render(new URLSearchParams({ url: PAGE }));
    expect(container.textContent).toContain('חזרו לשיחה');
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('the gate — ui A2 :1150–:1151 (amendment 5)', () => {
  it('signed out: sent to /login?returnTo= this dialog, BARE and with its link, and nothing is drawn on the way', () => {
    const { container } = render(LINK, 'anonymous');
    expect(mockPushed).toEqual([`/login?returnTo=${encodeURIComponent(`/upload?${LINK.toString()}`)}`]);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('the route answers 403: the ONE ruled sentence, with /researchers linked', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 403, body: { error: 'Forbidden', message: 'No researcher account for this login. Register first.' } } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain(FORBIDDEN);
    });
    expect(screen.getByRole('link', { name: 'בקשת גישת מחקר' }).getAttribute('href')).toBe('/he/researchers');
  });

  it('the route answers 401 mid-flow: sent to login too', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 401, body: { error: 'Unauthorized' } } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(mockPushed.length).toBe(1);
    });
  });
});

describe('the upload — hash here, sign there, PUT, then the command (ui A1 :1129; MEDIUM 1)', () => {
  it('the route is asked for THIS file’s name, type and size, computed in the browser', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 200, body: { uploadUrl: SIGNED, expiresAt: '2026-09-23T14:00:00.000Z' } }, [SIGNED]: { status: 200, body: {} } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(fetching?.calls.length).toBe(2);
    });
    const post = fetching?.calls.at(0);
    expect(post?.init?.method).toBe('POST');
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      docId: DOC_ID,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteLength: BYTES.length,
    });
    const put = fetching?.calls.at(1);
    expect(put?.url).toBe(SIGNED);
    expect(put?.init?.method).toBe('PUT');
  });

  it('uploaded: the pill, the command in the board’s order with the title isolated, its copy, the closing line', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 200, body: { uploadUrl: SIGNED, expiresAt: '2026-09-23T14:00:00.000Z' } }, [SIGNED]: { status: 200, body: {} } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain(UPLOADED);
    });
    const command = container.querySelector('[data-upload-command]');
    expect(command?.textContent).toBe(
      `add_document docId=${DOC_ID} mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet title="${TITLE}" assertedUrl=${PAGE} assertedAt=2026-09-03`,
    );
    expect(command?.querySelector('bdi')?.textContent).toBe(TITLE);
    expect(container.textContent).toContain('הפקודה לשיחה');
    expect(container.querySelector('[data-copy]')).not.toBeNull();
    expect(container.textContent).toContain(CLOSING);
    // The file row: its name and its size.
    expect(container.textContent).toContain('excli2026-9596-supplementary.xlsx');
  });

  it('storage says the object ALREADY EXISTS: that is uploaded too — the same bytes under the same name (MEDIUM 1)', async () => {
    fetching = globalFetchDouble({
      [ROUTE]: { status: 200, body: { uploadUrl: SIGNED, expiresAt: '2026-09-23T14:00:00.000Z' } },
      [SIGNED]: { status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } },
    });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain(UPLOADED);
    });
    expect(container.querySelector('[data-upload-command]')).not.toBeNull();
  });

  it('the route answers { stored: true }: NO upload — the pill says the bytes are ALREADY in the store, and the command is printed (F2)', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 200, body: { stored: true } } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain(STORED);
    });
    // NOTHING IS RE-SENT: the one request is the route's POST.
    expect(fetching.calls).toHaveLength(1);
    expect(container.textContent).not.toContain(UPLOADED);
    expect(container.querySelector('[data-upload-command]')?.textContent).toBe(
      `add_document docId=${DOC_ID} mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet title="${TITLE}" assertedUrl=${PAGE} assertedAt=2026-09-03`,
    );
    expect(container.textContent).toContain(CLOSING);
  });

  it('STORAGE_UNAVAILABLE (503) is NAMED — never the unnamed failure, never a command (F2: every storage error a code)', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 503, body: { code: 'STORAGE_UNAVAILABLE', error: 'The storage did not answer' } } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain(STORAGE_UNAVAILABLE);
    });
    expect(container.querySelector('[data-upload-command]')).toBeNull();
    expect(container.textContent).not.toContain('ההעלאה נכשלה');
    expect(fetching.calls).toHaveLength(1);
  });

  it('BUCKET_ABSENT (503) is SAID — until the migration lands, this is the page (amendment 4)', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 503, body: { code: 'BUCKET_ABSENT', error: 'The documents bucket does not exist in this environment' } } });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain('המחסן עוד לא קיים');
    });
    expect(container.querySelector('[data-upload-command]')).toBeNull();
    expect(fetching.calls).toHaveLength(1);
  });

  it('a storage failure that is NOT "exists" is a failure, said — never a command for bytes that are not there', async () => {
    fetching = globalFetchDouble({
      [ROUTE]: { status: 200, body: { uploadUrl: SIGNED, expiresAt: '2026-09-23T14:00:00.000Z' } },
      [SIGNED]: { status: 400, body: { statusCode: '413', error: 'Payload too large' } },
    });
    const { container } = render();
    await chooseFile(container);
    await waitFor(() => {
      expect(container.textContent).toContain('ההעלאה נכשלה');
    });
    expect(container.querySelector('[data-upload-command]')).toBeNull();
  });
});

describe('ANY answer the dialog does not expect is its FAILED state — never a pill left spinning (R78 chunk-3 r2, MEDIUM 1)', () => {
  // `uploadApi` THROWS on an answer no approved state names — loud at its level, which is right. The dialog must
  // not let that throw escape `void choose(event)`: an unhandled rejection left „מעלה…" on the page forever and
  // told the researcher nothing. Each path below shows the one failure sentence, no command and no pill, and the
  // cause is still logged.
  const FAILED = 'ההעלאה נכשלה, ולא נוצרה פקודה. נסו שוב.';
  let logged: jest.SpyInstance;
  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logged.mockRestore();
  });

  async function failsQuietlyNever(container: HTMLElement): Promise<void> {
    await waitFor(() => {
      expect(container.textContent).toContain(FAILED);
    });
    expect(container.querySelector('[data-upload-command]')).toBeNull();
    for (const pill of ['מחשב את שם הקובץ…', 'מעלה…', UPLOADED]) expect(container.textContent).not.toContain(pill);
    expect(logged).toHaveBeenCalled();
  }

  it('the route answers 500 with no code — storage unreachable, or a "Bucket not found" of another shape', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 500, body: { error: 'documentBucket: could not read the bucket documents — fetch failed' } } });
    const { container } = render();
    await chooseFile(container);
    await failsQuietlyNever(container);
  });

  it('the route answers 200 WITHOUT an uploadUrl', async () => {
    fetching = globalFetchDouble({ [ROUTE]: { status: 200, body: { expiresAt: '2026-09-23T14:00:00.000Z' } } });
    const { container } = render();
    await chooseFile(container);
    await failsQuietlyNever(container);
  });

  it('hashing THROWS — the browser could not read the file', async () => {
    fetching = globalFetchDouble({});
    const { container } = render();
    const input = container.querySelector('input[type="file"]');
    if (input === null) throw new Error('the dialog draws no file input');
    const file = new File([BYTES], 'unreadable.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.reject(new Error('NotReadableError')) });
    const files = { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) };
    await act(async () => {
      fireEvent.change(input, { target: { files } });
      await Promise.resolve();
    });
    await failsQuietlyNever(container);
    expect(fetching.calls).toEqual([]);
  });
});
