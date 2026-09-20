// THE `api` DOUBLE, WITH THE REAL `fetchJson` — deliberately not the plain `apiDouble()`. That double throws
// on every non-200, which is the ONE behaviour W-3 exists to disprove: the 503 must arrive as a BODY through
// `answers`, be narrowed by `parseChainAnswer` and render as a statement. Doubling `fetchJson` would test the
// double. The page's own read stays doubled, so the render needs no backend.
jest.mock('../src/lib/api', () => {
  const harness = jest.requireActual<typeof import('./render')>('./render');
  const real = jest.requireActual<typeof import('../src/lib/api')>('../src/lib/api');
  return { ...harness.apiDouble(), fetchJson: real.fetchJson };
});
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { fireEvent, screen } from '@testing-library/react';
import { DiffRuns } from '@/components/record/DiffRuns';
import { archiveUrl, rawArchiveUrl } from '@/lib/archiveUrl';
import { apiCallsMade, globalFetchDouble, renderPage, setPublicBodies, type Locale, type PageRender } from './render';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FRONTEND, requireSubjects, SRC, sourceFiles } from './scan';
import { renderWithIntl, textNodes } from './render';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord, resolvedDiffRecord, resolvedDiffVerifiedRecord } from './fixtures/corpus/record';
import { corpusStream } from './fixtures/corpus/stream';
import { CaptureSheet } from '@/components/corpus/RecordSheet';
import { textDiff } from '@/lib/textDiff';
import { domainOf } from '@/lib/format';
import { chainAnswer } from './fixtures/corpus/chain';
import { chainUnavailableWire } from './fixtures/corpus/chainUnavailable';

// ---------------------------------------------------------------------------
// THE RECORD PAGES' WITNESSES — docs/gf-ui-flows.md §26 :827–:834, §21 :629, A4 :1111–:1115; UI plan :634–:640,
// :678.
//
// THREE THINGS NO OTHER INSTRUMENT HOLDS, and each is a property a reader's trust rests on:
//
// (1) THE ARCHIVE LINK IS THE COMPOSED VIEWER FORM. It is the SECOND WITNESS — the one address on the page
//     that is not this platform's word — so a link that went anywhere else, or that carried the RAW form a
//     reader was never meant to open, would be the platform standing between the reader and the archive.
//     The case composes the expected href from `lib/archiveUrl.ts`' own function AND pins the literal shape,
//     because a case that only compared the page to the composer would pass with both of them wrong.
//
// (2) NOTHING REACHES THE CHAIN ON RENDER. The press is "one button whose moment is defined by the reader's
//     doubt"; a fetch on mount is a request per READER rather than per doubt, and it is exactly the edit a
//     refactor makes by accident. A spy over `global.fetch` is the only witness that can tell the two apart —
//     the rendered output of a page that fetched eagerly and one that did not is identical until the answer
//     lands.
//
// (3) CHAIN_UNAVAILABLE IS A STATEMENT ABOUT THE CHECK. Rendered as a failed RECORD it would tell a reader
//     the evidence is bad when the only thing that failed was reaching a registry (A4 :1115). The case feeds
//     the WIRE's own 503 body, not the frontend's discriminant, so a component that recognised a field no
//     route sends could not pass.
//
// THE STRINGS ARE PINNED AS LITERALS, RC-5's shape: a case that read the catalogue and compared the render to
// it would drift WITH the catalogue and hold only catalogue ≡ render. These are the frozen words.
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he'];
const TRACKED = 'page-one';
const CAPTURE = '20211223211940';
const CAPTURE_PATH = `/api/pages/${TRACKED}/captures/${CAPTURE}`;
const CHAIN_URL = `${CAPTURE_PATH}/chain`;

/** The approved words this page renders, frozen at `handoffs/R63-approved-copy-5bc.md`. */
const FROZEN = {
  press: 'בדיקת הרישום בשרשרת',
  registered: 'הגיבוב רשום',
  unavailable: 'לא ניתן היה להגיע לרישום',
  archiveLine: 'הארכיון מחזיק את העמוד הזה בתאריך הזה, והקישור פותח אותו.',
  archiveLink: 'פתיחת העמוד בארכיון',
  documentHash: 'גיבוב המסמך',
  rawArchive: 'כתובת הבתים הגולמיים בארכיון',
  extraction: 'גרסת החילוץ',
  inline: 'הטקסט לפני ואחרי',
  chunksLabel: 'הקטעים שהשתנו',
  openBefore: 'הצילום שלפני',
  openAfter: 'הצילום שאחרי',
  awaiting: 'ההפרש טרם חושב',
  kindCapture: 'צילום',
  kindDiff: 'שינוי',
  notVerified: 'אינו מאומת מול העוגן',
  documentReserved: 'התחייבות למסמך — שמור לשלב מאוחר יותר.',
  recordHeading: 'הרשומה שהשם הזה מצביע עליה',
  narrowed: 'צומצם',
  narrowedWith: 'צילומים שהתווספו בין השניים',
  cited: 'מצוטט בתזה שפורסמה',
  attributed: 'מעוגן',
  notYet: 'טרם עוגן',
  registryIndex: 'המספר הסידורי ברישום',
  copyToken: 'העתקת מזהה הציטוט',
  openRecord: 'עמוד הרשומה',
} as const;

const capturePage = async () => import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page');

function body(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('the capture page answered the one 404, not a body');
  return rendered.container;
}

async function renderCapture(locale: Locale): Promise<HTMLElement> {
  setPublicBodies({ [CAPTURE_PATH]: { status: 200, body: captureRead } });
  const page = (await capturePage()).default;
  return body(await renderPage(page, { locale, trackedUrlId: TRACKED, capture: CAPTURE }, { locale }));
}

afterEach(() => {
  setPublicBodies(undefined);
});

describe('record-page-witnesses — the capture page', () => {
  it('W-1 THE ARCHIVE LINK IS THE VIEWER FORM, composed from the url and the timestamp, and the RAW form is only DISCLOSED', async () => {
    const container = await renderCapture('he');
    const expected = archiveUrl(captureRead.page.url, CAPTURE);
    // PINNED, not merely equal to the composer: both wrong together would otherwise pass.
    expect(expected).toBe('https://web.archive.org/web/20211223211940/https://example.gov/one/');

    const link = screen.getByRole('link', { name: FROZEN.archiveLink });
    expect(link).toHaveAttribute('href', expected);
    expect(container.textContent).toContain(FROZEN.archiveLine);

    // THE RAW FORM IS NEVER A LINK — a reader is never sent to it (§26 :849). It appears once, as TEXT,
    // inside the VERIFY fold, beside the hash it matches.
    const raw = rawArchiveUrl(captureRead.page.url, CAPTURE);
    expect(raw).toBe('https://web.archive.org/web/20211223211940id_/https://example.gov/one/');
    const hrefs = requireSubjects(
      'anchors on the capture page',
      [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    );
    expect(hrefs.filter((href) => href.includes('id_/'))).toEqual([]);

    const verify = container.querySelector('[data-verify]');
    if (verify === null) throw new Error('W-1: the capture page has no VERIFY disclosure to hold the raw form');
    expect(verify.textContent).toContain(raw);
    expect(verify.textContent).toContain(FROZEN.rawArchive);
    expect(verify.textContent).toContain(FROZEN.documentHash);
    // THE EXTRACTION VERSION, beside the two hashes (§26 :829). It was omitted in 2a because its key
    // collided; the key moved to `record.verify.extraction` and the row lands with it.
    expect(verify.textContent).toContain(FROZEN.extraction);
    expect(verify.textContent).toContain(captureRead.capture.textExtractionVersion);
    // AND NO INSTRUCTION TO HASH ANYTHING — the 2026-09-18 amendment, held as an absence.
    expect(container.textContent).not.toMatch(/לגבב|hash it yourself|fetch, hash/i);

    // EVERY MARK IS A PILL, which means every mark is a `<span>`. `globals.css`' rule is
    // `.record-marks > span` (2026-09-20), so a mark rendered as a bare TEXT NODE inside the row gets the
    // flex layout and NONE of the pill — no border, no radius, no `--text-mark`. It looks like prose that
    // happens to sit in a row, and it is the one element on this page whose whole job is to be read as a
    // MARK rather than as a sentence. Found on the real body the day the classes landed.
    const marks = requireSubjects('mark rows on the capture page', [...container.querySelectorAll('.record-marks')]);
    for (const row of marks) {
      expect(row.textContent?.trim()).not.toBe('');
      expect([...row.children].map((child) => child.tagName)).toEqual(
        [...row.children].map(() => 'SPAN'),
      );
      // AND THE ROW HAS NO LOOSE TEXT of its own — a text node beside the pills is a mark that missed.
      expect([...row.childNodes].filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '')).toEqual([]);
    }

    // THE COPY CONTROL IS LABELLED BY WHAT THE VALUE IS FOR (§4 :170–:176), and the stream and the sheet
    // already label theirs `corpus.copyToken`. One control, one word, three surfaces.
    expect(container.textContent).toContain(FROZEN.copyToken);
    // `record.openRecord` IS THE LINK ONWARD'S WORD and belongs to the sheet and the record page. On a
    // COPY button it tells a reader the press will open something, which it will not.
    expect(container.textContent).not.toContain(FROZEN.openRecord);
  });

  it('W-2 NOTHING FETCHES THE CHAIN ON RENDER, and the press does — a fetch spy, because the two renders look alike', async () => {
    const spy = globalFetchDouble({ [CHAIN_URL]: { status: 200, body: chainAnswer } });
    try {
      const container = await renderCapture('he');
      // THE FLOOR: the render must have read SOMETHING, or "no chain fetch" is satisfied by a dead page.
      expect(requireSubjects('reads the capture page made', apiCallsMade()).some((call) => call.path === CAPTURE_PATH)).toBe(true);
      expect(spy.calls.filter((call) => call.url.includes('/chain'))).toEqual([]);
      // THE REGISTRY INDEX HAS NO SOURCE ON RENDER — `get_capture`'s row does not carry it, so a page that
      // drew its label before the press would be drawing a value it cannot have. Absence FIRST, presence
      // after, in one case: asserting only the absence is satisfied by a page that never shows it at all.
      expect(container.textContent).not.toContain(FROZEN.registryIndex);

      fireEvent.click(screen.getByRole('button', { name: FROZEN.press }));
      await screen.findByText(FROZEN.registered);

      const chainCalls = spy.calls.filter((call) => call.url.includes('/chain'));
      expect(chainCalls).toHaveLength(1);
      expect(chainCalls.at(0)?.url).toBe(CHAIN_URL);
      // NEVER `/api/mcp` (§8 :342): a page speaking JSON-RPC would be a second client of the tool surface.
      expect(spy.calls.filter((call) => call.url.includes('/api/mcp'))).toEqual([]);
      expect(container.textContent).toContain(FROZEN.registered);
      expect(container.textContent).toContain(FROZEN.registryIndex);
      expect(container.textContent).toContain(String(chainAnswer.available && chainAnswer.captures[0]?.registryIndex));
    } finally {
      spy.restore();
    }
  });

  it('W-3 A 503 CHAIN_UNAVAILABLE RENDERS AS A STATEMENT ABOUT THE CHECK, from the WIRE body, and never as a failed record', async () => {
    const spy = globalFetchDouble({ [CHAIN_URL]: { status: 503, body: chainUnavailableWire } });
    try {
      // THE WIRE, not the frontend's discriminant: a component reading `available` off the body would be
      // reading a field no route sends.
      expect(chainUnavailableWire).toHaveProperty('code', 'CHAIN_UNAVAILABLE');
      expect(chainUnavailableWire).not.toHaveProperty('available');

      const container = await renderCapture('he');
      fireEvent.click(screen.getByRole('button', { name: FROZEN.press }));
      await screen.findByText(FROZEN.unavailable);

      expect(container.querySelector('[data-chain-unavailable]')?.textContent).toBe(FROZEN.unavailable);
      // THE RECORD IS STILL WHOLE: its bytes and its second witness are untouched by a failed check.
      expect(container.querySelector('[data-record-body="CAPTURE"]')?.textContent).toBe(captureRead.text);
      expect(screen.getByRole('link', { name: FROZEN.archiveLink })).toHaveAttribute('href', archiveUrl(captureRead.page.url, CAPTURE));
    } finally {
      spy.restore();
    }
  });

  it('W-5 A FAILED CHECK RENDERS THE FROZEN SENTENCE — never the backend\'s words and never a status code', async () => {
    // A STATUS THE CALLER DID NOT NAME. `answers: [503]` covers CHAIN_UNAVAILABLE; anything else makes
    // `fetchJson` THROW `body.message ?? \`Error ${status}\``, and a component that drew that message would
    // put the backend's own English — or a bare code — in front of a reader as if it were copy.
    const spy = globalFetchDouble({ [CHAIN_URL]: { status: 500, body: { error: 'boom' } } });
    try {
      const container = await renderCapture('he');
      fireEvent.click(screen.getByRole('button', { name: FROZEN.press }));
      await screen.findByText(FROZEN.unavailable);

      // EXACTLY THE FROZEN SENTENCE AND NOTHING ELSE under the statement's own hook.
      expect(container.querySelector('[data-chain-unavailable]')?.textContent).toBe(FROZEN.unavailable);
      expect(container.textContent).not.toContain('boom');
      expect(container.textContent).not.toContain('500');
      expect(container.textContent).not.toMatch(/Error/i);
      // AND IT IS STILL A STATEMENT ABOUT THE CHECK: the record's bytes are untouched by a failed one.
      expect(container.querySelector('[data-record-body="CAPTURE"]')?.textContent).toBe(captureRead.text);
    } finally {
      spy.restore();
    }
  });

  it('W-4 THE ONE 404 — a refusal renders the thesis segment\'s sentence and no second sentence of its own', async () => {
    for (const locale of LOCALES) {
      setPublicBodies({ [CAPTURE_PATH]: { status: 404 } });
      const page = (await capturePage()).default;
      const rendered = await renderPage(page, { locale, trackedUrlId: TRACKED, capture: CAPTURE }, { locale });
      // A STATUS, not only a sentence: `notFound()` terminates the segment, which the harness reports here.
      expect(rendered.notFound).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// THE DIFF PAGE'S ARMS (chunk 2b). Its two endpoint links and its 409 are the properties nothing else holds:
// the links are composed from the URL's own segments precisely so they survive the state where there is no
// BODY to read them from, and that is the one arrangement a case must prove rather than assume.
// ---------------------------------------------------------------------------

const BEFORE = '20211223211940';
const AFTER = '20220105090000';
const PAIR_PATH = `/api/pages/${TRACKED}/diffs/${BEFORE}/${AFTER}`;
const diffPage = async () => import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page');

async function renderPair(answer: { status: 200; body: unknown } | { status: 404 } | { status: 409 }): Promise<PageRender> {
  setPublicBodies({ [PAIR_PATH]: answer });
  const page = (await diffPage()).default;
  return renderPage(page, { locale: 'he', trackedUrlId: TRACKED, before: BEFORE, after: AFTER }, { locale: 'he' });
}

describe('record-page-witnesses — the diff page', () => {
  it('W-6 BOTH ENDPOINTS LINK TO THEIR CAPTURE PAGES, composed from the URL and not from the body', async () => {
    const rendered = await renderPair({ status: 200, body: diffInput });
    if (rendered.notFound) throw new Error('W-6: the diff page answered the one 404, not a body');
    // THE ENDPOINT LINKS, by their own container — not every anchor on the page. The page also links to the
    // citing theses (chunk 2c), and a case that claimed the whole anchor set would have to be edited every
    // time a legitimate region lands, which is how a strict case quietly becomes a list of whatever is there.
    const endpoints = rendered.container.querySelector('.record-links');
    if (endpoints === null) throw new Error('W-6: the diff page drew no endpoint links at all');
    const hrefs = requireSubjects(
      'the endpoint links on the diff page',
      [...endpoints.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    );
    // PINNED as literals: composing the expectation the way the page composes it would pass with both wrong.
    expect(hrefs).toEqual([`/he/pages/${TRACKED}/captures/${BEFORE}`, `/he/pages/${TRACKED}/captures/${AFTER}`]);
    expect(rendered.container.textContent).toContain(FROZEN.openBefore);
    expect(rendered.container.textContent).toContain(FROZEN.openAfter);
    // AND NO TIMESTAMP AS TEXT — the heading is two DATES (§4).
    expect(rendered.container.textContent).not.toContain(BEFORE);
    expect(rendered.container.textContent).not.toContain(AFTER);
  });

  it('W-7 THE 409 RENDERS THE FROZEN STATE WITH BOTH CAPTURE LINKS STILL LIVE — the pair is held, its content is owed', async () => {
    const rendered = await renderPair({ status: 409 });
    if (rendered.notFound) throw new Error('W-7: AWAITING_DERIVATION is a STATE, not the one 404');
    const container = rendered.container;
    // THE STATE IS A RECORD, DRAWN BY THE COMPONENT THAT DRAWS RECORDS. `RecordContent`'s AWAITING arm
    // exists for exactly this (`types/record.ts`: "AWAITING carries its statement from the surface"), and a
    // page that hand-drew a heading and a sentence beside it would be a second renderer of the same thing —
    // one that drifts, and one whose domain line a reader loses precisely when the bytes are missing.
    const awaitingBody = container.querySelector('[data-record-body="AWAITING"]');
    if (awaitingBody === null) throw new Error('W-7: the 409 did not render RecordContent`s AWAITING arm');
    expect(awaitingBody.textContent).toBe(FROZEN.awaiting);
    // THE HEADING IS THE SAME AS THE 200 BRANCH — a reader in this state still knows which PAIR they are on.
    expect(container.querySelector('.record-title')?.textContent).toContain('23.12.2021');
    // THE DOMAIN LINE IS ABSENT, AND THAT IS A FINDING RATHER THAN A CHOICE. The 409 answers with a status
    // and no body (ui §6 :267; `readPublic`'s member carries none by ruling), so there is no `page.url` to
    // compose a domain from, and §8 :344 forbids a second read to fetch one. The case pins the ABSENCE so
    // that a later page cannot quietly invent the line — and so the gap stays visible until it is ruled.
    expect(container.querySelector('.record-head')).toBeNull();
    // The 200 branch DOES carry it, so this is a statement about the STATE and not about the page.
    const shown = await renderPair({ status: 200, body: diffInput });
    if (shown.notFound) throw new Error('W-7: the 200 branch answered the one 404');
    expect(shown.container.querySelector('.record-head')?.textContent).toBe(domainOf(diffInput.page.url));
    expect(container.textContent).toContain(FROZEN.awaiting);
    // THE LINKS ARE THE POINT. There is no body in this state, so a page that read them off one would have
    // nothing to draw — and a reader would lose the two captures the pair is made of.
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs).toEqual([`/he/pages/${TRACKED}/captures/${BEFORE}`, `/he/pages/${TRACKED}/captures/${AFTER}`]);
    // AND NO BYTES ARE CLAIMED: nothing has been derived to look at yet.
    expect(container.querySelector('[data-record-body="DIFF"]')).toBeNull();
  });

  it('W-8 THE INLINE REGION IS UI-5`S `textDiff` OVER THE TWO TEXTS — one differ on this page, not a second answer', async () => {
    const rendered = await renderPair({ status: 200, body: diffInput });
    if (rendered.notFound) throw new Error('W-8: the diff page answered the one 404, not a body');
    const runs = [...rendered.container.querySelectorAll('[data-run]')];
    const expected = textDiff(diffInput.before.text, diffInput.after.text);
    // THE SAME FUNCTION'S OWN OUTPUT, run for run and kind for kind. A second differ would agree on the
    // easy cases and disagree somewhere, and "somewhere" in a forensic record is the whole problem.
    expect(runs.map((run) => ({ kind: run.getAttribute('data-run'), text: run.textContent }))).toEqual(
      expected.map((run) => ({ kind: run.kind, text: run.text })),
    );
    expect(requireSubjects('the inline runs', runs).length).toBeGreaterThanOrEqual(2);
    expect(rendered.container.textContent).toContain(FROZEN.inline);

    // AND THE STORED CHUNKS ARE BENEATH IT, through `RecordContent` in the serif class.
    const stored = rendered.container.querySelector('[data-record-body="DIFF"]');
    if (stored === null) throw new Error('W-8: the CURRENT chunks did not render');
    expect(stored.querySelectorAll('[data-chunk-side]')).toHaveLength(diffInput.current.chunks.length);
    expect(rendered.container.textContent).toContain(FROZEN.chunksLabel);
  });

  it('W-9 A REFUSED PAIR TERMINATES THE SEGMENT — NO_SUCH_DIFF is the one 404 and never a rendered empty diff', async () => {
    expect((await renderPair({ status: 404 })).notFound).toBe(true);
  });

  it('W-10 NO CHAIN CONTROL ON THE DIFF PAGE — the chain is a check on a CAPTURE (A4 :1111–:1114)', async () => {
    const rendered = await renderPair({ status: 200, body: diffInput });
    if (rendered.notFound) throw new Error('W-10: the diff page answered the one 404, not a body');
    expect(rendered.container.querySelector('[data-chain-press]')).toBeNull();
    expect(rendered.container.querySelector('[data-chain-check]')).toBeNull();
    expect(rendered.container.textContent).not.toContain(FROZEN.press);
  });
});

describe('record-page-witnesses — the record`s own classes', () => {
  /** Every `record-*` class NAMED as a className under `src/` — not `data-record-*`, which are attributes. */
  function namedClasses(): Map<string, string[]> {
    const named = new Map<string, string[]>();
    for (const file of sourceFiles(SRC, ['.ts', '.tsx'])) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
        const blob = match[1] ?? match[2] ?? match[3] ?? '';
        for (const found of blob.match(/record-[a-z-]+/g) ?? []) {
          named.set(found, [...new Set([...(named.get(found) ?? []), relative(FRONTEND, file)])].sort());
        }
      }
    }
    return named;
  }

  function undefinedClasses(): string[] {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
    const defined = new Set([...css.matchAll(/\.(record-[a-z-]+)/g)].map((match) => match[1]));
    return [...requireSubjects('record-* classes named under src/', [...namedClasses().keys()])]
      .filter((name) => !defined.has(name))
      .sort();
  }

  // A PLAIN `it` FROM 2026-09-20, the day the researcher approved the six values from a rendered mockup.
  // It was `it.failing` for one round: the property genuinely did not hold — six classes were named and
  // never declared, so every element carrying one was styled by its Tailwind siblings alone, and the
  // record pages had no hierarchy (title, meta and a cited <h2> all 16px/28px, measured). Marking it
  // failing recorded that honestly rather than softening the assertion to match the tree, and the marker
  // came off in the same change that made the property true — which is the only honest way for it to go.
  it('W-22 EVERY `record-*` CLASS NAMED UNDER src/ IS DEFINED IN globals.css — a class that resolves to nothing styles nothing', () => {
    expect(undefinedClasses()).toEqual([]);
  });

  it('W-23 EVERY `record-*` CLASS NAMED IS ALSO CALLED, and the owed set is empty — no dead names, no silent debt', () => {
    // The companion to W-22, RETITLED on 2026-09-20 to what it now asserts: the debt was six and is zero,
    // and a case still calling itself "the owed set is exactly the six" would be a title outliving its
    // assertion. What it holds from here is the OTHER direction — that a class DECLARED in `globals.css`
    // under this prefix is one some element actually wears, because a name nothing renders is not a debt,
    // it is dead code.
    const named = namedClasses();
    expect(undefinedClasses()).toEqual([]);
    // THE FLOOR AND THE FULL SET, pinned: seven classes are named under `src/`, and each has a call site.
    const all = [...named.keys()].sort();
    expect(all).toEqual([
      'record-captured',
      'record-head',
      'record-links',
      'record-marks',
      'record-meta',
      'record-register',
      'record-title',
    ]);
    for (const name of requireSubjects('the record classes', all)) {
      expect((named.get(name) ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('record-page-witnesses — the reading region', () => {
  /** The components that put a READ in front of someone: the researcher's prose, or the archive's bytes. */
  const READ_COMPONENTS = ['ThesisText', 'ResearcherProse', 'RecordContent'] as const;

  /**
   * DECLARED AND OWED, not excused. `/theses/[id]/versions/[v]` renders the SAME `ThesisText` as the
   * thesis page and does NOT carry `reading` — a pre-existing omission found by writing this scan, not
   * introduced by it. It is a published page's typography, so it is the RESEARCHER's to rule, and it is
   * named here rather than silently fixed or silently skipped.
   *
   * IT IS A TRIPWIRE. The set is asserted to be EXACTLY this one entry, so the day the page gains
   * `reading` this case reddens and the entry must be removed — an allow-list that stops offending is an
   * allow-list nobody is maintaining.
   */
  const OWED = ['src/app/[locale]/theses/[id]/versions/[v]/page.tsx'] as const;

  /** The pages whose EVERY return is a read — this chunk's three, asserted per branch. */
  const RECORD_PAGES = [
    'src/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page.tsx',
    'src/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page.tsx',
    'src/app/[locale]/records/[fileHash]/page.tsx',
  ] as const;

  it('W-21 EVERY PAGE THAT RENDERS A READ CARRIES `reading` — the region opts in once, and the chrome does not', () => {
    const pages = requireSubjects(
      'page files under src/app/[locale]',
      sourceFiles(join(SRC, 'app'), ['.tsx'])
        .map((file) => relative(FRONTEND, file))
        .filter((file) => file.endsWith('page.tsx')),
    );
    const reads = pages.filter((file) => {
      const source = readFileSync(join(FRONTEND, file), 'utf8');
      return READ_COMPONENTS.some((component) => source.includes(`<${component}`));
    });
    // THE FLOOR: the detector really found the read pages. A predicate that matched nothing would make
    // "every read page carries `reading`" true of an empty set.
    expect(reads.length).toBeGreaterThanOrEqual(4);

    // TWO ASSERTIONS, BECAUSE "a return" AND "a read" ARE NOT THE SAME THING — and four detectors were
    // wrong before this one, each found by a decoy going blind or by a page the case had no business
    // failing:
    //   · a substring search over the FILE matched „the reading column" in a docblock, so a page that
    //     DROPPED the opt-in but still mentioned it read as compliant;
    //   · className TOKENS satisfied by ANY one of them passed a page that lost the class from the branch
    //     a reader actually lands on — the records and diff pages have TWO `<main>`s each;
    //   · requiring the class ON each `<main>` failed `/theses/[id]`, whose read region is the `<article>`
    //     INSIDE its main (:143) — that page is right and the detector was wrong;
    //   · counting opt-ins against `<main>` tags failed it again, for a better reason: it has THREE
    //     returns and only one is a read. The others are the WITHDRAWAL NOTICE, which T6 :915–:918 makes
    //     deliberately not a read — "a page that says withdrawn on a date, and nothing else".
    //
    // So: EVERY RETURN of a page whose returns are ALL reads must opt in (the three record pages, named
    // as a value), and every detected read page must opt in AT LEAST ONCE (the broad set, which cannot
    // know which of a mixed page's returns is the read).
    const readingCount = (source: string): number =>
      [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)].filter((match) =>
        (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/).includes('reading'),
      ).length;
    const returns = (source: string): number => [...source.matchAll(/<main\b[^>]*>/g)].length;

    // (a) THE RECORD PAGES, PER RETURN. Every branch of each is a read — the 409 state and the `#doc_`
    // sentence are records with something owed, not notices — so each must carry the opt-in.
    let branches = 0;
    const underOptedIn = requireSubjects('the record pages', RECORD_PAGES).filter((file) => {
      const source = readFileSync(join(FRONTEND, file), 'utf8');
      const mains = returns(source);
      if (mains === 0) throw new Error(`W-21: ${file} renders a read and declares no <main>`);
      branches += mains;
      return readingCount(source) < mains;
    });
    expect(underOptedIn).toEqual([]);
    // THE FLOOR: the five record-page branches were really counted (1 + 2 + 2).
    expect(branches).toBe(5);

    // (b) EVERY READ PAGE, AT LEAST ONCE — the broad set, where a page may mix reads and notices.
    const missing = reads.filter((file) => readingCount(readFileSync(join(FRONTEND, file), 'utf8')) === 0);
    expect(missing).toEqual([...OWED]);
    // AND THE THREE RECORD PAGES ARE IN THE EXAMINED SET — a scan that skipped them would pass over the
    // very pages this chunk added.
    for (const page of requireSubjects('the record pages', RECORD_PAGES)) {
      expect(reads).toContain(page);
    }
  });
});

describe('record-page-witnesses — one inline-diff renderer', () => {
  it('W-11 EXACTLY ONE FILE UNDER src/ EMITS `data-run=` — the runs have ONE renderer, called by both surfaces', () => {
    // §26 :825's clean-code ruling, the same one that produced `RecordContent`: „no duplicate code to produce
    // same element". The thesis history and the diff page draw the SAME element — a run of text marked as
    // same, removed or added — and before this extraction each spelled its own `<span>`, its own
    // `data-run`, and its own two token classes. Two spellings of one mark is one spelling that can drift,
    // and the drift would be invisible: both would still render text.
    //
    // A SOURCE SCAN AND NOT A RENDER CASE, because what is being held is that there is exactly ONE
    // implementation — a property of the tree, which no amount of rendering can see.
    const files = requireSubjects('source files under src/', sourceFiles(SRC, ['.ts', '.tsx']));
    const emitters = files
      .filter((file) => readFileSync(file, 'utf8').includes('data-run='))
      .map((file) => relative(FRONTEND, file));
    expect(emitters).toEqual(['src/components/record/DiffRuns.tsx']);
  });
});

describe('record-page-witnesses — the runs` own marks', () => {
  it('W-12 EACH KIND CARRIES ITS OWN TOKENS — removed struck through, added tinted, same unmarked', () => {
    // W-11 holds that there is ONE renderer; this holds that the one renderer MARKS CORRECTLY. They are
    // different failures and only one file can now produce either: a single emitter that labelled `added`
    // with the removal's tokens would satisfy W-11 completely and show every reader an addition struck
    // through, which is the `RecordContent` defect's exact shape („לפני"/„אחרי" drawn against the wrong side)
    // in the other element these two surfaces share.
    //
    // THE CLASSES ARE PINNED AS LITERALS, not read back from `RUN_CLASS`. A case that imported the lookup
    // and compared the render to it would hold only lookup ≡ render, and would stay green through exactly
    // the swap this case exists to catch — RC-5's rule, applied to tokens instead of copy.
    const { container } = renderWithIntl(
      <DiffRuns
        runs={[
          { kind: 'same', text: 'נשאר' },
          { kind: 'removed', text: 'נגרע' },
          { kind: 'added', text: 'נוסף' },
        ]}
      />,
      { locale: 'he' },
    );

    const runs = requireSubjects(
      'the rendered runs',
      [...container.querySelectorAll('[data-run]')].map((run) => ({
        kind: run.getAttribute('data-run'),
        className: run.getAttribute('class'),
        text: run.textContent,
      })),
    );
    expect(runs).toEqual([
      { kind: 'same', className: null, text: 'נשאר' },
      { kind: 'removed', className: 'bg-seal-tint line-through', text: 'נגרע' },
      { kind: 'added', className: 'bg-olive-tint', text: 'נוסף' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// THE RECORDS PAGE'S ARMS (chunk 2c). The reader arrived by a NAME and holds nothing else, so the ONE LINK
// ONWARD is the whole point of the page — and it has no source but `page.trackedUrlId`, ruled onto this
// envelope on 2026-09-20 for exactly that reason (A4 :1106).
// ---------------------------------------------------------------------------

const recordsPage = async () => import('@/app/[locale]/records/[fileHash]/page');

async function renderRecord(fileHash: string, answer: { status: 200; body: unknown } | { status: 404 }): Promise<PageRender> {
  setPublicBodies({ [`/api/records/${fileHash}`]: answer });
  const page = (await recordsPage()).default;
  return renderPage(page, { locale: 'he', fileHash }, { locale: 'he' });
}

describe('record-page-witnesses — the diff page`s three row regions', () => {
  it('W-18 THE OPINION IS INSIDE ITS LABEL OR IT IS NOT DRAWN — the third voice never loose on the page', async () => {
    // §10 :384, "Never outside one". The model's `significance` rendered as a bare paragraph reads as the
    // PLATFORM's sentence about a change, which is the one thing COMPLIANCE rule 3 exists to prevent — and
    // it looks identical to a correct render until you ask WHICH element the words are in.
    const rendered = await renderPair({ status: 200, body: diffInput });
    if (rendered.notFound) throw new Error('W-18: the diff page answered the one 404');
    const container = rendered.container;
    const label = container.querySelector('[data-labelled-opinion]');
    if (label === null) throw new Error('W-18: the diff page drew no labelled opinion for a body that carries one');
    expect(container.querySelectorAll('[data-labelled-opinion]')).toHaveLength(1);
    // THE VERSION TRAVELS WITH THE LABEL, not beside it in the page's own words.
    expect(label.querySelector('[data-opinion-version]')?.textContent).toBe(diffInput.opinion?.classifierVersion);
    // AND THE SIGNIFICANCE APPEARS NOWHERE ELSE. Every node carrying the model's words must be INSIDE the
    // container — the assertion a "does the page contain it" check cannot make.
    const significance = diffInput.opinion?.significance ?? '';
    expect(significance.length).toBeGreaterThan(40);
    const loose = textNodes(container)
      .filter((node) => node.data.includes(significance.slice(0, 40)))
      .filter((node) => !label.contains(node));
    expect(loose.map((node) => node.data.slice(0, 40))).toEqual([]);
  });

  it('W-19 THE NARROWED MARK IS DRAWN ONLY WHERE THE BODY SAYS SO — and the intervening captures are not drawn at all', async () => {
    // BOTH DIRECTIONS IN ONE CASE. A mark drawn always is a mark that means nothing, and it would tell a
    // reader captures intervened in a pair where none did — a false statement about the archive, in the
    // platform's own register.
    const without = await renderPair({ status: 200, body: diffInput });
    if (without.notFound) throw new Error('W-19: the diff page answered the one 404');
    expect(diffInput.narrowed).toBe(false);
    expect(without.container.querySelector('[data-narrowed-mark]')).toBeNull();

    const withMark = await renderPair({ status: 200, body: { ...diffInput, narrowed: true } });
    if (withMark.notFound) throw new Error('W-19: the narrowed body answered the one 404');
    expect(withMark.container.querySelector('[data-narrowed-mark]')?.textContent).toBe(FROZEN.narrowed);
    // THE INTERVENING CAPTURES ARE NOT DRAWN — no read serves them (A4 :1096's own ruling), so the page
    // shows the MARK and not the list, and `record.pair.narrowedWith` stays unused. A heading over an
    // empty list would say the opposite of what the mark says.
    expect(withMark.container.textContent).not.toContain(FROZEN.narrowedWith);
  });

  it('W-20 THE CITING PUBLISHED THESES ARE LINKS, from `evidence.citedBy` and through the sheet`s own component', async () => {
    const rendered = await renderPair({ status: 200, body: diffInput });
    if (rendered.notFound) throw new Error('W-20: the diff page answered the one 404');
    const list = rendered.container.querySelector('[data-citing-theses]');
    if (list === null) throw new Error('W-20: the diff page drew no citing theses for a body that carries one');
    const links = requireSubjects('the citing-thesis links', [...list.querySelectorAll('a')]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      (diffInput.evidence?.citedBy ?? []).map((cite) => `/theses/${cite.thesisId}`),
    );
    // A THESIS IS NAMED BY ITS CLAIM AND NEVER BY ITS ID (§4); the body carries no claim, so the link's
    // words are the CITED mark's and the id stays in the href.
    expect(links.map((a) => a.textContent)).toEqual([FROZEN.cited]);

    // AND NO LIST AT ALL when the record was never promoted — an empty section under a heading would say
    // "nobody cites this" where the truth is "there is no evidence row to ask".
    const bare = await renderPair({ status: 200, body: { ...diffInput, evidence: null } });
    if (bare.notFound) throw new Error('W-20: the bare body answered the one 404');
    expect(bare.container.querySelector('[data-citing-theses]')).toBeNull();
  });
});

describe('record-page-witnesses — the records page', () => {
  it('W-13 THE ONE LINK ONWARD IS THE RECORD`S OWN PAGE, for BOTH kinds, composed from the page id and the endpoints', async () => {
    // BOTH KINDS IN ONE CASE, because the composition BRANCHES on kind and a case covering one arm would
    // pass while the other sent every stranger to a URL that does not exist.
    const capture = await renderRecord(resolvedCaptureRecord.fileHash, { status: 200, body: resolvedCaptureRecord });
    if (capture.notFound) throw new Error('W-13: the CAPTURE record answered the one 404');
    const captureLinks = requireSubjects(
      'links on the capture record page',
      [...capture.container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    );
    expect(captureLinks).toEqual(['/he/pages/page-one/captures/20211223211940']);
    expect(capture.container.textContent).toContain(FROZEN.openRecord);

    const diff = await renderRecord(resolvedDiffRecord.fileHash, { status: 200, body: resolvedDiffRecord });
    if (diff.notFound) throw new Error('W-13: the DIFF record answered the one 404');
    expect([...diff.container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/he/pages/page-one/diffs/20211223211940/20220105090000',
    ]);
    // AND THE ENDPOINTS READ AS DATES, never as the 14-digit names they are composed from (§4).
    expect(diff.container.textContent).not.toContain('20211223211940');
    expect(diff.container.textContent).toContain('23.12.2021');
  });

  it('W-14 `notEvaluable` RENDERS ITS REASON AND NEVER A FAILURE — "not asked" is not "asked and failed"', async () => {
    const diff = await renderRecord(resolvedDiffRecord.fileHash, { status: 200, body: resolvedDiffRecord });
    if (diff.notFound) throw new Error('W-14: the DIFF record answered the one 404');
    // THE REASON IS CARRIED, so a reader (and this case) can tell WHICH of the three it was.
    // THE ATTRIBUTE IS ON THE MARKS ROW ITSELF — no child span, because `.record-marks > span` is a pill
    // and an empty pill is a visible border around nothing (W-24, found on staging).
    const reason = diff.container.querySelector('.record-marks[data-not-evaluable]');
    if (reason === null) throw new Error('W-14: the notEvaluable arm rendered no reason on the marks row');
    expect(reason.getAttribute('data-not-evaluable')).toBe('NOT_PROMOTED');
    expect(reason.children).toHaveLength(0);
    // AND IT RENDERS NO WORDS AT ALL. „אינו מאומת מול העוגן" is a VERDICT — "not verified against the
    // anchor" — and this arm is the one case where the platform did not ask. Borrowing that sentence here
    // says the check ran and failed. There is no approved sentence for "not evaluable" yet, so the arm
    // carries the machine-readable reason and stays SILENT until one is frozen: copy lands approved or not
    // at all, and a wrong approved sentence is worse than none.
    expect(reason.textContent?.trim()).toBe('');
    expect(diff.container.textContent).not.toContain(FROZEN.notVerified);
    // IT IS THE MARKS REGION, where the record's other one-word facts are — and it draws nothing.
    expect(reason.classList.contains('record-marks')).toBe(true);
    // AND NO VERIFIED VERDICT IS DRAWN: the platform did not check, so it says nothing about the check.
    expect(diff.container.querySelector('[data-verified]')).toBeNull();
    // The EVALUABLE arm, by contrast, does draw one — so this is a statement about the ARM, not the page.
    const capture = await renderRecord(resolvedCaptureRecord.fileHash, { status: 200, body: resolvedCaptureRecord });
    if (capture.notFound) throw new Error('W-14: the CAPTURE record answered the one 404');
    expect(capture.container.querySelector('[data-verified]')?.getAttribute('data-verified')).toBe('true');
    expect(capture.container.querySelector('[data-not-evaluable]')).toBeNull();

    // ONE ROW PER CAPTURE, AND THE ANCHOR WORD ITS OWN `attributed` FIXES. "Per-capture attribution" is
    // §26 :859's phrase and A4 :1106's shape; a page that drew ONE verdict over the whole record would
    // hide a capture whose anchor was never attributed behind a sibling that was. The COUNT is pinned to
    // the fixture's, so a list silently emptied — or one row drawn for many — is a red case and not a
    // quieter page.
    // READ OVER THE *DIFF* RECORD, because only a DIFF has more than one capture beneath it (A4 :1114) and
    // a one-row fixture makes a per-row assertion vacuous — measured: a decoy slicing the list to its first
    // entry reddened NOTHING against the CAPTURE record.
    const many = await renderRecord(resolvedDiffVerifiedRecord.fileHash, { status: 200, body: resolvedDiffVerifiedRecord });
    if (many.notFound) throw new Error('W-14: the two-capture record answered the one 404');
    const evaluable = resolvedDiffVerifiedRecord.verified;
    if (!('captures' in evaluable)) throw new Error('W-14: the two-capture fixture must carry the evaluable arm');
    // THE FLOOR: more than one, or this asserts nothing about a LIST.
    expect(evaluable.captures.length).toBeGreaterThanOrEqual(2);
    const rows = requireSubjects(
      'the per-capture rows',
      [...(many.container.querySelector('[data-verified]')?.querySelectorAll('[data-capture-row]') ?? [])],
    );
    expect(rows).toHaveLength(evaluable.captures.length);
    // AND EACH ROW CARRIES THE ANCHOR WORD ITS OWN `attributed` FIXES — the two disagree in this fixture,
    // so a page drawing one verdict over the record cannot produce this sequence.
    expect(rows.map((row) => ((row.textContent ?? '').includes(FROZEN.attributed) ? 'attributed' : 'notYet'))).toEqual(
      evaluable.captures.map((one) => (one.attributed === true ? 'attributed' : 'notYet')),
    );
  });

  it('W-15 A `#doc_` NAME RENDERS THE RESERVED SENTENCE ALONE — no record, no marks, and no read at all', async () => {
    setPublicBodies({});
    const page = (await recordsPage()).default;
    const rendered = await renderPage(page, { locale: 'he', fileHash: 'doc_0123456789abcdef' }, { locale: 'he' });
    if (rendered.notFound) throw new Error('W-15: a document name answered the one 404 instead of the reserved sentence');
    expect(rendered.container.querySelector('[data-document-reserved]')?.textContent).toBe(FROZEN.documentReserved);
    // NOTHING WAS READ. The commitment has no record to resolve to, so a read would be a request for a
    // body that cannot exist — and the api double would refuse a path the case did not stage, which is
    // what makes this assertion meaningful rather than decorative.
    expect(apiCallsMade()).toEqual([]);
    // AND NO MARKS ARE DRAWN beside it.
    expect(rendered.container.querySelector('[data-recomputable-mark]')).toBeNull();
    expect(rendered.container.querySelectorAll('a')).toHaveLength(0);
  });

  it('W-16 A REFUSED NAME TERMINATES THE SEGMENT — NOT_A_RECORD and NOT_PUBLIC alike', async () => {
    expect((await renderRecord(`0x${'f'.repeat(64)}`, { status: 404 })).notFound).toBe(true);
  });
});

describe('record-page-witnesses — the sheet`s link onward', () => {
  it('W-17 THE SHEET LINKS TO THE RECORD`S OWN PAGE — the absence it declared since chunk 5b is closed', async () => {
    // §26 :824 gives the sheet "ONE link onward to the record's own page", and `RecordSheet.tsx`'s own
    // header carried that as a DECLARED absence while the pages did not exist — an anchor to an unbuilt
    // route being what `no-door-before-it-exists` catches. This case is what closes the declaration.
    const capture = requireSubjects('capture entries of the stream fixture', corpusStream.entries).find(
      (entry) => entry.kind === 'CAPTURE',
    );
    if (capture === undefined || capture.kind !== 'CAPTURE') throw new Error('W-17: the stream fixture holds no CAPTURE row');

    const { container } = renderWithIntl(<CaptureSheet entry={capture} />, { locale: 'he' });
    const link = container.querySelector('[data-open-record] a');
    if (link === null) throw new Error('W-17: the sheet drew no link onward');
    expect(link.getAttribute('href')).toBe(`/pages/${capture.page.trackedUrlId}/captures/${capture.capture}`);
    expect(link.textContent).toBe(FROZEN.openRecord);
  });
});

describe('record-page-witnesses — no mark is an empty capsule', () => {
  it('W-24 NO `.record-marks > span` IS EMPTY, on all three record pages and every fixture arm', async () => {
    // FOUND ON STAGING, 2026-09-20, and it is two rulings MEETING rather than either being wrong. M4 made
    // the `notEvaluable` arm render NO WORDS — the attribute alone, for an instrument to read — and M8
    // then made `.record-marks > span` a PILL: 1px border, full radius, 2px 8px padding. Together they
    // drew an EMPTY CAPSULE: measured on the live record, an 18 × 6 px box with a visible border around no
    // content, floating beneath „ניתן לחישוב מחדש". That reads as a rendering GLITCH, which is worse than
    // silence — the platform meant to say nothing and showed something broken instead.
    //
    // THE SWEEP IS OVER EVERY ARM, not over the page that had the defect. A mark is drawn on all three
    // record pages, and the next empty one will be somewhere else; a case pinned to the records page would
    // have to be rewritten to catch it, which means it would not catch it.
    const arms: { name: string; container: HTMLElement }[] = [];
    const add = (name: string, rendered: PageRender): void => {
      if (rendered.notFound) throw new Error(`W-24: ${name} answered the one 404, not a body`);
      arms.push({ name, container: rendered.container });
    };

    arms.push({ name: 'capture', container: await renderCapture('he') });
    add('diff 200', await renderPair({ status: 200, body: diffInput }));
    add('diff 200 narrowed', await renderPair({ status: 200, body: { ...diffInput, narrowed: true } }));
    add('diff 409', await renderPair({ status: 409 }));
    add('record CAPTURE evaluable', await renderRecord(resolvedCaptureRecord.fileHash, { status: 200, body: resolvedCaptureRecord }));
    add('record DIFF notEvaluable', await renderRecord(resolvedDiffRecord.fileHash, { status: 200, body: resolvedDiffRecord }));
    add('record DIFF evaluable', await renderRecord(resolvedDiffVerifiedRecord.fileHash, { status: 200, body: resolvedDiffVerifiedRecord }));
    setPublicBodies({});
    add('record #doc_', await renderPage((await recordsPage()).default, { locale: 'he', fileHash: 'doc_0123456789abcdef' }, { locale: 'he' }));

    // `trim()` IS NOT ENOUGH, and a decoy proved it: U+200B ZERO WIDTH SPACE is a FORMAT character and not
    // White_Space, so `'\u200b'.trim()` returns it unchanged — a pill holding only a zero-width space
    // reads as non-empty to `trim()` and renders as exactly the capsule this case exists to refuse. The
    // invisible ones are stripped too.
    const visibleText = (node: Element): string => (node.textContent ?? '').replace(/[\s\u200b-\u200d\u2060\ufeff]/g, '');
    const empties = requireSubjects('the rendered arms', arms).flatMap(({ name, container }) =>
      [...container.querySelectorAll('.record-marks > span')]
        .filter((span) => visibleText(span) === '')
        .map((span) => `${name}: <span ${span.getAttributeNames().join(' ')}>`),
    );
    expect(empties).toEqual([]);

    // THE FLOOR: the sweep really saw marks. An arm set that rendered none would make "no empty span"
    // true of nothing at all — and the `notEvaluable` arm in particular must be among them, since it is
    // the one that had no words to begin with.
    const marksSeen = arms.reduce((total, arm) => total + arm.container.querySelectorAll('.record-marks').length, 0);
    expect(marksSeen).toBeGreaterThanOrEqual(5);
    const notEvaluableArm = arms.find((arm) => arm.name === 'record DIFF notEvaluable');
    expect(notEvaluableArm?.container.querySelector('[data-not-evaluable]')).not.toBeNull();
  });
});
