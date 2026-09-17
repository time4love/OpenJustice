jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { messagesFor, renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import { CALL_TAB_ID, recordTabId } from '../src/components/thesis/PaneTabs';
import { parseThesisBody, parseVersionBody } from '../src/lib/thesisBody';
import published from './fixtures/thesis/published.json';
import publishedNoAppeals from './fixtures/thesis/published-no-appeals.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// pane-tabs-declared — WHAT EACH PUBLIC PAGE DECLARES INTO THE RIGHT PANE.
//
// docs/gf-ui-refactor-plan.md §10 :1124 ("the citation record, THE CALL PAGE and a previous version open
// as RIGHT-PANE TABS at width and full-screen on the phone"); docs/gf-ui-flows.md §20 as amended 2026-09-17
// (the call is "also a right-pane tab beside the thesis"; the TAB is board 3A minus the folded preface and
// the full disclaimer) and §22 as amended ("at width the record is a right-pane tab"); §17 :549 (a thesis
// with no CALLED and no REQUESTED gap shows no appeals section); UI plan §4 :876 ("every scan takes its
// subject set as a value, carries a decoy, and fails on an empty set").
//
// WHY THIS IS ITS OWN FILE AND NOT A CASE ADDED TO `no-id-as-text`. That instrument holds that a tab's
// LABEL carries no id shape, and it reads every `[role="tab"]` it finds — so a tab that is MISSING
// contributes no offender and the case is green over the defect. Re-spelling it into a set assertion would
// make one case hold two properties and would edit a UI-5 instrument under refactor plan §4 rule 2. The
// declaration is a different property and gets a different file.
//
// THE FLOOR, AND IT IS THE POINT OF THE FILE. Declaring ZERO tabs already reddens two cases —
// `no-model-voice-public`'s record-pane case and `no-id-as-text`'s tab case — but BOTH fire through
// `requireSubjects`, a vacuity guard. So a declaration that is wrong in CONTENT rather than in count (the
// right number of tabs, one of them the wrong member) is held by nothing at all. Every case below asserts
// the EXPECTED SET, derived from the fixture's own citations through the page's own `recordTabId`, and
// PRINTS it; and the fixture's citation count is asserted to be plural, so "one tab per citation" is a
// real claim and not a statement about one.
//
// THE EXPECTATION IS DERIVED, NEVER RE-SPELLED. `recordTabId` and `CALL_TAB_ID` are the page's own, called
// here; the citations are read through `parseThesisBody`, the same parser the page reads its body with. A
// test that spelled `record:EVIDENCE:<name>` itself would agree with a page that had stopped agreeing
// with the shell.
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

/** The citations a page's tabs are built from, through the page's own parser. */
function citationsOf(fixture: unknown, name: string) {
  const body = parseThesisBody(fixture);
  if ('withdrawn' in body) throw new Error(`${name} parsed as a withdrawal notice, which declares no tabs`);
  // THE FLOOR: "one tab per citation" is only a claim about a set if the set has more than one member.
  const citations = [...requireSubjects(`citations of ${name}`, body.citations)];
  expect(citations.length).toBeGreaterThanOrEqual(2);
  return { citations, appeals: body.appeals };
}

/** The label a person recognises the call tab by — the page's own approved string, read from the catalog. */
function callLabel(locale: Locale): string {
  const messages = messagesFor(locale) as { theses: { appeals: { heading: string } } };
  return messages.theses.appeals.heading;
}

/**
 * Every tab a page declared, in the order it declared them, read from the pane the shell renders.
 * The id is `RightPane`'s own `pane-tab-<id>`, so this reads what a reader's browser would.
 */
function declaredBy(name: string, rendered: PageRender): { id: string; label: string }[] {
  if (rendered.notFound) throw new Error(`${name} answered the one 404, not a body`);
  // A page that rendered no `<main>` declared nothing because it drew nothing — a different failure, named.
  if (rendered.container.querySelector('main') === null) throw new Error(`${name} rendered no <main>`);
  return [...rendered.container.querySelectorAll('[role="tab"]')].map((tab) => ({
    id: (tab.getAttribute('id') ?? '').replace(/^pane-tab-/, ''),
    label: (tab.textContent ?? '').trim(),
  }));
}

/** The shell around the page, with the pane beside it — the tabs read here are the ones a reader sees. */
const inTheShell = ({ children }: { children: React.ReactNode }) => (
  <TabsProvider>
    {children}
    <RightPane />
  </TabsProvider>
);

describe('pane-tabs-declared', () => {
  it('THE THESIS PAGE declares one tab per citation AND the call, labelled by the approved heading (§10 :1124; §20 as amended)', async () => {
    const { citations, appeals } = citationsOf(published, 'published.json');
    for (const locale of LOCALES) {
      setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
      const page = (await thesisPage()).default;
      const declared = declaredBy(
        'thesis',
        await renderPage(page, { locale, id: published.thesisId }, { locale, wrapper: inTheShell }),
      );
      const expected = [...citations.map((citation) => recordTabId(citation)), CALL_TAB_ID];
      if (locale === 'he') {
        console.log(
          `pane-tabs-declared: published.json carries ${String(citations.length)} citations and ` +
            `${String(appeals.call.length)} called + ${String(appeals.requests.length)} requested gaps ` +
            `→ the thesis page must declare ${String(expected.length)} tabs: ${expected.join(' · ')}`,
        );
      }
      // The ids AND the call's label in one assertion: a tab declared under the right id with an invented
      // label is the half a set comparison alone would miss, and the label is the page's to compose.
      expect({ locale, ids: declared.map((tab) => tab.id), call: declared.at(-1)?.label }).toEqual({
        locale,
        ids: expected,
        call: callLabel(locale),
      });
    }
  });

  it('THE VERSION PAGE declares a tab per record THIS VERSION cites — the INTERSECTION, and NO call', async () => {
    // THE SET IS THE INTERSECTION AND NOT THE THESIS'S (R59 · M5). A version page reads two bodies: the
    // THESIS, which resolves each record's facts and marks (A5 :1569), and the VERSION, whose own
    // `citations` are what THIS text cited (A5 :1570). Declaring the thesis's set would open a tab for a
    // record this version's text never names, and none for one it does.
    //
    // THE TEXT ALREADY KNOWS, AND THE PANE MUST AGREE WITH IT. A record the version cites that the CURRENT
    // body no longer carries renders as a `not-current` chip (`ThesisText.tsx` :27) — it has no resolved
    // record to open, so it correctly gets no tab and stays a chip. The intersection is exactly the set
    // that has both: a ref in this version AND a resolved record in the thesis.
    const { citations } = citationsOf(published, 'published.json');
    const version = parseVersionBody(versionPrevious);
    if ('withdrawn' in version) throw new Error('version-previous.json parsed as a withdrawal, which cites nothing');
    const cited = citations.filter((citation) =>
      version.citations.some((ref) => ref.kind === citation.kind && ref.name === citation.name),
    );
    // THE FLOOR, and it is NOT lowered for the intersection: "a tab per record this version cites" is only
    // a claim about a set if the set has more than one member. If this ever drops below 2 the fixtures have
    // stopped exercising the property and the case must be re-grounded, never the bound relaxed.
    expect(cited.length).toBeGreaterThanOrEqual(2);
    console.log(
      `pane-tabs-declared: published.json cites ${String(citations.length)} records and ` +
        `version-previous.json cites ${String(version.citations.length)} → the INTERSECTION is ` +
        `${String(cited.length)}: ${cited.map((citation) => recordTabId(citation)).join(' · ')}`,
    );
    for (const locale of LOCALES) {
      setPublicBodies({
        [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
        [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
      });
      const page = (await versionPage()).default;
      const declared = declaredBy(
        'version',
        await renderPage(page, { locale, id: published.thesisId, v: versionPrevious.versionId }, { locale, wrapper: inTheShell }),
      );
      expect({ locale, ids: declared.map((tab) => tab.id) }).toEqual({
        locale,
        ids: cited.map((citation) => recordTabId(citation)),
      });
    }
  });

  it('THE CALL PAGE declares NONE — it IS the centre there, and the pane collapses to nothing (§9 :1068–:1069)', async () => {
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    });
    const page = (await callPage()).default;
    const declared = declaredBy(
      'call',
      await renderPage(page, { locale: 'he', thesisId: published.thesisId }, { locale: 'he', wrapper: inTheShell }),
    );
    expect(declared).toEqual([]);
  });

  it('A THESIS WITH NO CALLED AND NO REQUESTED GAP declares NO call tab — the presence is the COUNTS, never the element (§17 :549)', async () => {
    // THE TRAP THIS CASE EXISTS FOR. `Appeals` returns `null` when both lists are empty, but a React
    // element is never `undefined` — so a page that passed `<Appeals/>` unconditionally would declare a
    // tab that draws nothing. The tab's presence is decided by `appeals.call.length +
    // appeals.requests.length`, and this is the case that says so out loud.
    const { citations, appeals } = citationsOf(publishedNoAppeals, 'published-no-appeals.json');
    expect([appeals.call.length, appeals.requests.length]).toEqual([0, 0]);
    setPublicBodies({ [`/api/thesis/${publishedNoAppeals.thesisId}`]: { status: 200, body: publishedNoAppeals } });
    const page = (await thesisPage()).default;
    const declared = declaredBy(
      'thesis/no-appeals',
      await renderPage(page, { locale: 'he', id: publishedNoAppeals.thesisId }, { locale: 'he', wrapper: inTheShell }),
    );
    expect(declared.map((tab) => tab.id)).toEqual(citations.map((citation) => recordTabId(citation)));
  });
});
