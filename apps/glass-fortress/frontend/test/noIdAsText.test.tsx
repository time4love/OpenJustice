jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { ancestorsOf, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';
import withdrawn from './fixtures/thesis/withdrawn.json';

// ---------------------------------------------------------------------------
// no-id-as-text — docs/gf-ui-flows.md §4 :167–:178 ("No hash and no id is shown as text"), §17 :530–:531, :559–:561,
// A5 :1079; UI plan :403–:406, §5 :913.
//
// A 64-hex name, a cuid or a 14-digit Wayback timestamp is not for a reader. Each has exactly TWO homes: a COPY
// control's value, and the VERIFY disclosure. Everywhere else a thing is named by what a person recognises — a page
// by its domain, a capture by its date, a thesis by its claim.
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he', 'en'];
const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');
const versionPage = () => import('../src/app/[locale]/theses/[id]/versions/[v]/page');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(name: string, rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error(`${name} answered the one 404, not a body`);
  return rendered.container;
}

async function everyPage(locale: Locale): Promise<{ name: string; container: HTMLElement }[]> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn },
  });
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const version = (await versionPage()).default;
  return [
    { name: 'thesis', container: containerOf('thesis', await renderPage(thesis, { locale, id: published.thesisId }, { locale })) },
    { name: 'call', container: containerOf('call', await renderPage(call, { locale, thesisId: published.thesisId }, { locale })) },
    {
      name: 'version',
      container: containerOf('version', await renderPage(version, { locale, id: published.thesisId, v: versionPrevious.versionId }, { locale })),
    },
    { name: 'notice', container: containerOf('notice', await renderPage(thesis, { locale, id: withdrawn.thesisId }, { locale })) },
  ];
}

/** The two homes an exact value may have: a COPY control's value, and the VERIFY disclosure (§4 :170–:176). */
function inAHome(node: Text): boolean {
  return ancestorsOf(node).some((element) => element.hasAttribute('data-copy-value') || element.hasAttribute('data-verify'));
}

describe('no-id-as-text', () => {
  it('no 64-hex, cuid or 14-digit timestamp is a text node outside VERIFY or a COPY value — on every public page, in both locales', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      for (const { name, container } of await everyPage(locale)) {
        const nodes = textNodes(container);
        requireSubjects(`text nodes of the ${name} page (${locale})`, nodes);
        problems.push(
          ...nodes
            .filter((node) => ID_SHAPES.some((shape) => shape.pattern.test(node.data)) && !inAHome(node))
            .map((node) => `${locale}/${name}: ${node.data.trim().slice(0, 40)}`),
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('the thesis COPY carries "thesis <id>" as its value, labelled by what it is FOR (§4 :172–:174)', async () => {
    const [thesis] = await everyPage('he');
    const control = thesis?.container.querySelector('[data-copy-value]');
    expect(control?.getAttribute('data-copy-value')).toEqual(`thesis ${published.thesisId}`);
    expect((control?.closest('[data-copy]')?.textContent ?? '').trim()).toEqual('העתקה לשיחה חדשה');
  });

  it('VERIFY is closed by default and holds the version hash and every citation’s name and pin (§17 :559–:560; A6 :1097)', async () => {
    const [thesis] = await everyPage('he');
    const verify = thesis?.container.querySelector('details[data-verify]');
    const values = [...(verify?.querySelectorAll('[data-copy-value]') ?? [])].map((node) => node.getAttribute('data-copy-value'));
    expect(verify?.hasAttribute('open')).toBe(false);
    expect(values).toEqual([
      published.version.contentHash,
      published.citations[0].name,
      published.citations[0].pin,
      published.citations[1].name,
      published.citations[1].pin,
      published.citations[2].name,
    ]);
  });

  // -------------------------------------------------------------------------
  // THE TWO THE RE-BRIEF ADDS (docs/gf-ui-refactor-plan.md §10 :1126, "`no-id-as-text` gains the tick
  // and the tabs"). A citation in the text is now a DATED TICK, and a record, the call page and a
  // previous version open as RIGHT-PANE TABS — two new places a 64-hex, a cuid or a 14-digit stamp
  // could reach a reader, and neither existed when the four cases above were written.
  // -------------------------------------------------------------------------

  it('every dated tick renders a DATE, an interval or a claim’s words — never a stamp, a name or a cuid', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      for (const { name, container } of await everyPage(locale)) {
        const ticks = [...container.querySelectorAll('[data-tick]')];
        // A page that cites something and renders no tick has not been read by this case at all.
        if (name === 'notice') continue;
        requireSubjects(`dated ticks on the ${name} page (${locale})`, ticks);
        problems.push(
          ...ticks
            .flatMap((tick) => textNodes(tick))
            .filter((node) => ID_SHAPES.some((shape) => shape.pattern.test(node.data)))
            .map((node) => `${locale}/${name}: ${node.data.trim().slice(0, 40)}`),
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('every right-pane tab LABEL is free of the three shapes — the label is the page’s to compose', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      setPublicBodies({
        [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
        [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
      });
      const page = (await thesisPage()).default;
      // Rendered INSIDE the shell's registry with the pane beside it, so the tabs read here are the
      // ones a reader would see — the page's own declaration, through the real `DeclareTabs` path.
      const rendered = await renderPage(page, { locale, id: published.thesisId }, {
        locale,
        wrapper: ({ children }) => (
          <TabsProvider>
            {children}
            <RightPane />
          </TabsProvider>
        ),
      });
      if (rendered.notFound) throw new Error('the thesis page answered the one 404, not a body');
      const labels = [...rendered.container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? '');
      requireSubjects(`right-pane tabs declared by the thesis page (${locale})`, labels);
      problems.push(
        ...labels
          .filter((label) => ID_SHAPES.some((shape) => shape.pattern.test(label)))
          .map((label) => `${locale}: ${label.trim().slice(0, 40)}`),
      );
    }
    expect(problems).toEqual([]);
  });

  it("a request's restsOn renders each record as its chip, never the name as text (§17 :541)", async () => {
    const [, call] = await everyPage('he');
    const rests = call?.container.querySelector('[data-rests-on]');
    const chips = [...(rests?.querySelectorAll('[data-chip]') ?? [])].map((chip) => chip.getAttribute('data-chip'));
    expect(chips).toEqual(callLive.requests[0].restsOn);
    expect((rests?.textContent ?? '').includes(callLive.requests[0].restsOn[0] ?? '')).toBe(false);
  });
});
