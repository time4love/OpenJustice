jest.mock('../src/lib/api', () => {
  const real = jest.requireActual<typeof import('./render')>('./render').apiDouble();
  const answer = real.fetchJson as (path: string, init?: RequestInit) => unknown;
  return {
    ...real,
    // A READ THAT NEVER SETTLES, for the paths a case names — the only way to observe a sheet WHILE its
    // read is in flight rather than inferring the state from a race. Every other path is the double's.
    fetchJson: (path: string, init?: RequestInit): unknown => (pending.has(path) ? new Promise(() => undefined) : answer(path, init)),
  };
});

/** Paths whose read never resolves. A case that forgets to clear it cannot leak: `afterEach` empties it. */
const pending = new Set<string>();

import { act } from 'react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { apiCallsMade, DeclareRecordTab, messagesFor, renderWithIntl, setPublicBodies, textNodes, type Locale } from './render';
import { messageCatalogs, requireSubjects } from './scan';
import { CaptureSheet, recordIdOf } from '../src/components/corpus/RecordSheet';
import { RecordContent } from '../src/components/record/RecordContent';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import { corpusStream } from './fixtures/corpus/stream';
import type { CaptureEntry, CorpusEntry, DiffEntry } from '../src/types/corpus';

// ---------------------------------------------------------------------------
// sheet-reads-on-open — docs/gf-ui-flows.md §26 clause (2) as replaced 2026-09-19, and evidence A4 :1082.
//
// THE SHEET READS FOR ITSELF WHEN IT OPENS; THE THESIS PAGE DOES NOT — AND THE REASON IS THE PIN. A
// citation's text is the text AT ITS PIN (`heldTextsFor` reads a superseded `textVersion`); a capture read
// by `(page, capture)` is the CURRENT extraction. So the two surfaces are not inconsistent: they are
// answering different questions, and the thesis page cannot move to reading on open without changing what
// it shows until it reads by `textHash`. This instrument therefore holds BOTH halves — that the corpus
// sheet reads, and that opening it issues NOTHING for a diff, whose chunks are already in the row.
//
// A READ ON OPEN IS A READER'S ACT AND NOT A FILTER, so §8's "a filter is a query on one read, never a
// second read" is not offended: nothing about the stream's query changed, and no second read answers the
// list. It is the same shape as the thesis page's history diff, which reads on the reader's press.
//
// IT GOES THROUGH `fetchJson`, THE FRONTEND'S ONE DOOR FOR A BROWSER-SIDE READ — not `readPublic`, which is
// the server's, and not a second spelling of either. `test/render.tsx`' `apiDouble` already doubles both and
// records which door each call used, so the door itself is ASSERTED here rather than assumed.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';

/** The fixture's first capture row, and the path its sheet must read. */
function captureRow(): CaptureEntry {
  const rows = [...requireSubjects('entries of the corpus stream fixture', corpusStream.entries)];
  const one = rows.find((entry): entry is CaptureEntry => entry.kind === 'CAPTURE');
  if (one === undefined) throw new Error('the corpus fixture holds no capture row — nothing to open');
  return one;
}

function diffRow(): DiffEntry {
  const rows = [...requireSubjects('entries of the corpus stream fixture', corpusStream.entries)];
  const one = rows.find((entry): entry is DiffEntry => entry.kind === 'DIFF' && entry.current !== null);
  if (one === undefined) throw new Error('the corpus fixture holds no derived diff row');
  return one;
}

const pathOf = (entry: CaptureEntry): string => `/api/pages/${entry.page.trackedUrlId}/captures/${entry.capture}`;

const TEXT = 'העמוד כפי שנשמר בארכיון, במלואו.\nשורה שנייה של הצילום.';

async function openSheet(entry: CorpusEntry): Promise<HTMLElement> {
  const entries: readonly CorpusEntry[] = [entry];
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = renderWithIntl(
      <TabsProvider>
        <DeclareRecordTab entries={entries} openId={recordIdOf(entry)} />
        <RightPane />
      </TabsProvider>,
      { locale: LOCALE },
    ));
  });
  const panel = container.querySelector('[role="tabpanel"]');
  if (panel === null) throw new Error('the sheet declared no tab panel — nothing was drawn to read');
  return panel as HTMLElement;
}

afterEach(() => {
  setPublicBodies(undefined);
  pending.clear();
});

describe('sheet-reads-on-open', () => {
  it('SR-1 A CAPTURE SHEET FILLS: it reads its own capture and hands the bytes to RecordContent as a CAPTURE value', async () => {
    const row = captureRow();
    setPublicBodies({ [pathOf(row)]: { status: 200, body: { text: TEXT, textHash: row.textHash, current: true } } });

    const panel = await openSheet(row);
    const body = panel.querySelector('[data-record-body="CAPTURE"]');

    // THE BYTES, BY VALUE — not "a CAPTURE body exists". A sheet that drew an empty archive box would
    // satisfy the property name and tell a reader the capture held nothing.
    expect(body).not.toBeNull();
    expect((body?.textContent ?? '').trim()).toBe(TEXT);
    expect(textNodes(panel).map((node) => node.data)).toContain(TEXT);
    // AND THE LOADING STATE IS GONE once the read landed: a skeleton left beside the text would say the
    // page is still fetching something it already has.
    expect(panel.querySelector('[data-record-body="LOADING"]')).toBeNull();
    console.log(`sheet-reads-on-open: the capture sheet read ${pathOf(row)} and drew ${String(TEXT.length)} characters into the record's serif box`);
  });

  it('SR-2 IT READS THROUGH `fetchJson` — the browser door — and asks for EXACTLY ONE path, its own', async () => {
    const row = captureRow();
    setPublicBodies({ [pathOf(row)]: { status: 200, body: { text: TEXT, textHash: row.textHash, current: true } } });
    await openSheet(row);

    const calls = apiCallsMade();
    // A FLOOR AND A CEILING. The floor: a sheet that read nothing would pass any "every call was correct"
    // assertion vacuously. The ceiling: opening ONE record must not issue a second read, which is how a
    // reader's act turns into a fan-out nobody measured.
    expect(calls.length).toBe(1);
    expect(calls[0]?.via).toBe('fetchJson');
    expect(calls[0]?.path).toBe(pathOf(row));
  });

  it('SR-3 A DIFF SHEET READS NOTHING — its chunks are already in the row (§26 clause (2))', async () => {
    // The decisive half. If this instrument only held "a sheet reads", a component that read on EVERY open
    // would pass it — and every diff opened would issue a pointless request for bytes the page already has.
    setPublicBodies({});
    const panel = await openSheet(diffRow());

    expect(apiCallsMade()).toEqual([]);
    expect(panel.querySelector('[data-record-body="DIFF"]')).not.toBeNull();
    expect(panel.querySelector('[data-record-body="LOADING"]')).toBeNull();
  });

  it('SR-4 LOADING IS A SKELETON AND CARRIES NO TEXT (A2 :1144) — asserted on the state itself, not on a race', () => {
    // THE FIRST DRAFT OF THIS CASE WAS VACUOUS AND IS RECORDED SO IT IS NOT REWRITTEN THAT WAY. It tried to
    // catch the sheet mid-flight and wrapped its assertions in `if (skeleton !== null)`, so a sheet that
    // never drew a skeleton at all passed it silently. The state is a VALUE `RecordContent` is handed, so it
    // is asserted directly on that value and has no timing in it.
    const { container } = renderWithIntl(<RecordContent domain="example.gov.il" heading="23.12.2021" content={{ kind: 'LOADING' }} />, { locale: LOCALE });
    const skeleton = container.querySelector('[data-record-body="LOADING"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.textContent).toBe('');
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    // AND NO ARCHIVE BOX while loading: a serif box with nothing in it says the capture held nothing.
    expect(container.querySelector('[data-record-body="CAPTURE"]')).toBeNull();
  });

  it('SR-5 A FAILED READ DRAWS NEITHER THE BYTES NOR THE SKELETON, and keeps the record\'s marks', async () => {
    const row = captureRow();
    // The door answers the one 404 (A2: the same sentence for missing and not-public alike), which
    // `fetchJson` raises as a failure — the state the sheet must not paper over.
    setPublicBodies({ [pathOf(row)]: { status: 404 } });
    const panel = await openSheet(row);

    // NOT THE BYTES, and NOT the skeleton either: a skeleton after the read has ended says "still arriving"
    // about something that already failed, which is the one thing worse than saying nothing.
    expect(panel.querySelector('[data-record-body="CAPTURE"]')).toBeNull();
    expect(panel.querySelector('[data-record-body="LOADING"]')).toBeNull();

    // THE SHEET IS STILL A RECORD: the marks, the token and the heading survive.
    expect(panel.querySelector('[data-sheet-marks]')).not.toBeNull();
    expect(panel.querySelector('[data-anchor-mark]')).not.toBeNull();
    const shown = textNodes(panel).map((node) => node.data.trim());
    expect(shown.length).toBeGreaterThanOrEqual(3);

    // AND IT SAYS SO, BY VALUE, IN BOTH CATALOGUES — the sentences PINNED AS LITERALS here (approved
    // 2026-09-19, frozen verbatim), and the catalogue AND the render both asserted equal to them.
    //
    // WHY PIN THEM RATHER THAN READ THE CATALOGUE ALONE, which is what the first draft of this case did:
    // reading the catalogue and comparing the render to it asserts only that the two AGREE. Both would
    // still agree after someone edited the catalogue, so the approved wording would be free to drift with
    // the case green. A literal is the only thing in this repository that holds a string the researcher
    // approved; the catalogue is then checked against it, not consulted as the authority.
    const APPROVED: Record<Locale, string> = {
      he: 'הטקסט של הצילום לא נטען',
      en: "The capture's text could not be read",
    };
    for (const locale of ['he', 'en'] as const) {
      const catalog = messageCatalogs().find((candidate) => candidate.locale === locale);
      const sentence = (catalog?.messages as { corpus?: { textUnread?: unknown } }).corpus?.textUnread;
      expect(sentence).toBe(APPROVED[locale]);
    }
    // THE RENDER, in the locale this case rendered: what a reader actually sees equals the approved words.
    expect(panel.querySelector('[data-text-unread]')?.textContent).toBe(APPROVED[LOCALE]);
    expect(shown).toContain(APPROVED[LOCALE]);

    console.log(`sheet-reads-on-open: a failed read leaves ${String(shown.length)} text nodes — the marks, the token and the approved sentence — and no archive box`);
  });


  it('SR-6 A REUSED SHEET NEVER SHOWS THE PREVIOUS RECORD\'S BYTES — measured at the component, not through the pane', async () => {
    // WHY AT THE COMPONENT, AND WHY TWO EARLIER DRAFTS OF THIS CASE HELD NOTHING.
    //
    // Draft one drove the PANE. Three decoys — the element's key removed, `DeclareTabs`' cleanup removed, and
    // both — all left it green, because through that path the sheet does not survive a record change for an
    // unrelated reason: `DeclareTabs` re-registers whenever its tabs' `signature` (their ids and labels)
    // changes, its cleanup calls `declare([])` first, and `RightPane` early-returns `null` at zero tabs. The
    // pane therefore MASKS the property, and is the wrong place to assert it.
    //
    // Draft two rendered the component but let `rerender` replace a provider-wrapped tree with an unwrapped
    // one. Different STRUCTURES remount everything, so the key looked unnecessary again. Both renders below
    // are structurally identical, which is what puts React's reconciliation in the measured path.
    //
    // THE PROPERTY: a sheet handed a DIFFERENT record must not draw the previous record's archive bytes under
    // the new record's date. Red without the key on the element, green with it.
    const rows = [...requireSubjects('capture rows of the fixture', corpusStream.entries.filter((entry): entry is CaptureEntry => entry.kind === 'CAPTURE'))];
    // THE FLOOR: two DISTINCT captures, or "B does not show A's bytes" is a claim about one record.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const [a, b] = rows;
    if (a === undefined || b === undefined) throw new Error('the fixture holds fewer than two capture rows');
    expect(pathOf(a)).not.toBe(pathOf(b));

    const A_TEXT = 'הבתים של הצילום הראשון, שאסור שיופיעו תחת התאריך של השני.';
    setPublicBodies({
      [pathOf(a)]: { status: 200, body: { text: A_TEXT, textHash: a.textHash, current: true } },
      [pathOf(b)]: { status: 200, body: { text: 'הבתים של הצילום השני.', textHash: b.textHash, current: true } },
    });

    // RENDERED THROUGH RTL DIRECTLY, AND THAT IS LOAD-BEARING. `renderWithIntl` wraps its argument in a
    // provider, but the `rerender` it returns replaces the WHOLE tree with what is handed to it — so passing
    // an already-wrapped element the second time gives the two renders DIFFERENT structures, React unmounts
    // everything, and the case goes green whatever the key does. That is how the previous draft of this case
    // passed its own decoy. Both renders here are byte-identical in structure, so reconciliation — and
    // therefore the key — is what the case actually measures.
    const at = (entry: CaptureEntry) => (
      <NextIntlClientProvider locale={LOCALE} messages={messagesFor(LOCALE)} onError={(error) => { throw error; }}>
        <TabsProvider>
          <CaptureSheet key={recordIdOf(entry)} entry={entry} />
        </TabsProvider>
      </NextIntlClientProvider>
    );

    let rendered!: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(at(a));
    });
    // A's read LANDED — the state the defect needs, asserted rather than assumed.
    expect(rendered.container.querySelector('[data-record-body="CAPTURE"]')?.textContent).toBe(A_TEXT);

    // B takes the same position while ITS read is still in flight.
    pending.add(pathOf(b));
    await act(async () => {
      rendered.rerender(at(b));
    });

    expect(rendered.container.querySelector('[data-record-body="LOADING"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-record-body="CAPTURE"]')).toBeNull();
    expect(rendered.container.textContent ?? '').not.toContain(A_TEXT);
    console.log(`sheet-reads-on-open: a sheet re-rendered for ${recordIdOf(b)} while its read is pending draws LOADING and none of ${String(A_TEXT.length)} characters belonging to ${recordIdOf(a)}`);
  });
});
