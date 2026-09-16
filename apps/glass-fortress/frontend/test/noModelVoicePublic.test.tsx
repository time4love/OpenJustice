jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { join, relative } from 'node:path';
import { renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { FRONTEND, PUBLIC_THESIS_PAGES, importClosureOf, importsOf, publicThesisModules, requireSubjects, sourceFiles, SRC } from './scan';
import withAnalysis from './fixtures/thesis/published-with-analysis.json';
import callLive from './fixtures/thesis/call-live.json';

// ---------------------------------------------------------------------------
// no-model-voice-public — docs/gf-ui-flows.md §16 :517–:521, §21 :621, §23 :641–:642; thesis T5 :826–:834;
// docs/gf-ui-refactor-plan.md UI-5 :393–:395, :446–:447 and §5 :907.
//
// TWO VOICES, NOT THREE. The public page carries the researcher's words and the platform's marks; the MODEL's
// voice is absent by contract. So a body carrying a planted `analysis` renders NONE of it — not a summary, not a
// counter-argument, not a strength — and no module of the public thesis surface reaches the labelled opinion
// container (`components/opinion/LabelledOpinion.tsx`, UI-7's, plan :543), directly or through anything it imports.
// ---------------------------------------------------------------------------

const PLANTED = ['ANALYSIS-FIXTURE-OPINION', 'ANALYSIS-FIXTURE-COUNTER', 'ANALYSIS-FIXTURE-GAP', 'ANALYSIS-FIXTURE-STRENGTH', 'ANALYSIS-FIXTURE-SUMMARY'];
/** COMPLIANCE.md rule 3's label — it belongs to the labelled container, never to a public page (plan :431). */
const AI_LABEL = 'ניתוח AI';
const LABELLED_CONTAINER = 'src/components/opinion/';
const LOCALES: readonly Locale[] = ['he', 'en'];

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function renderedText(rendered: PageRender): string {
  if (rendered.notFound) throw new Error('the page answered the one 404, not a body');
  return textNodes(rendered.container).map((node) => node.data).join(' ');
}

async function pages(locale: Locale): Promise<string> {
  setPublicBodies({
    [`/api/thesis/${withAnalysis.thesisId}`]: { status: 200, body: withAnalysis },
    [`/api/thesis/${withAnalysis.thesisId}/call`]: { status: 200, body: callLive },
  });
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const onThesis = renderedText(await renderPage(thesis, { locale, id: withAnalysis.thesisId }, { locale }));
  const onCall = renderedText(await renderPage(call, { locale, thesisId: withAnalysis.thesisId }, { locale }));
  return `${onThesis} ${onCall}`;
}

describe('no-model-voice-public', () => {
  it('a planted analysis renders nothing — not one of its strings, on the thesis page or the call page, in either locale', async () => {
    for (const locale of LOCALES) {
      const text = await pages(locale);
      expect([locale, PLANTED.filter((planted) => text.includes(planted))]).toEqual([locale, []]);
    }
  });

  it("no public thesis page carries rule 3's AI label — the label belongs to the container UI-7 builds", async () => {
    for (const locale of LOCALES) {
      expect([locale, (await pages(locale)).includes(AI_LABEL)]).toEqual([locale, false]);
    }
  });

  it('no module of the public thesis surface imports the labelled opinion container, directly or transitively', () => {
    const subjects = requireSubjects('the public thesis modules', publicThesisModules());
    const offenders = subjects.flatMap((module) => {
      const file = join(FRONTEND, module);
      // A module that imports only packages reaches no local module — an answer, not an empty scan, so the
      // vacuity guard sits on the subject SET above rather than on each module's closure.
      if (!importsOf(file).some((found) => found.module !== null)) return [];
      return importClosureOf(file)
        .filter((reached) => reached.startsWith(LABELLED_CONTAINER))
        .map((reached) => `${module} reaches ${reached}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the subjects of that scan are the three pages and every file under components/thesis', () => {
    const subjects = publicThesisModules();
    const components = sourceFiles(join(SRC, 'components', 'thesis'), ['.ts', '.tsx']).map((file) => relative(FRONTEND, file));
    expect({
      pages: PUBLIC_THESIS_PAGES.filter((page) => subjects.includes(page)),
      components: components.every((file) => subjects.includes(file)) && components.length > 0,
    }).toEqual({ pages: [...PUBLIC_THESIS_PAGES], components: true });
  });
});
