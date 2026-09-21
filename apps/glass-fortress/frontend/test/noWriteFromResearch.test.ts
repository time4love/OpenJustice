import { join, relative } from 'node:path';
import { FRONTEND, SRC, importClosureOf, jsxTagsIn, propertiesNamed, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// no-write-from-research — docs/gf-ui-flows.md §12 :456–:462 and §15 :500–:501; UI plan UI-8 :784–:786.
//
// "No write control. No publish, no save, no editor, no 'resolve', no 're-run': every act is the chat's." The
// one actionable element is the COPY of a command the owed list names, and a clipboard write is not a request.
//
// A SOURCE SCAN AND NOT A RENDER, because a write behind a condition no fixture reaches would pass a render
// and ship. Three shapes are held: a request with a method other than GET, a `<form>`, and an `action`
// attribute on anything.
//
// THE CLOSURE, NOT JUST THE TWO DIRECTORIES. A page that imports a helper which posts is a page that posts;
// §12's rule is about what the page can DO, not about where the line sits. So the subject set is the research
// pages and components PLUS every local module they reach — which is how `lib/researchFetch.ts` comes under it.
// ---------------------------------------------------------------------------

const ROOTS = ['src/app/[locale]/research', 'src/components/research'] as const;

/**
 * THE ONE EXCEPTION, NAMED AND EXPLAINED — and asserted to be exactly one.
 *
 * `lib/session.ts` :160 POSTs to Supabase's token endpoint to refresh an access token, and the read view
 * reaches it because `authedFetch` retries once after a refresh (`lib/api.ts` :64). That is the AUTH chain,
 * not a research act: it writes no row of the corpus, the evidence, the thesis or the document designs, which
 * is what §39 :1059 forbids a page of this design to write. It is a KEEP file and this step does not touch it.
 *
 * The exception is a PAIR — the module AND the verb — so a second POST in the same file, or this verb in any
 * other, still fails. And the list is asserted to have exactly one member, so it cannot quietly grow.
 */
const ALLOWED = ["src/lib/session.ts:160 method: 'POST'"] as const;

/** The research tree's own files, and every local module they import, transitively. */
function subjects(): string[] {
  const own = ROOTS.flatMap((root) => sourceFiles(join(FRONTEND, root), ['.ts', '.tsx'])).map((file) => relative(FRONTEND, file));
  const reached = own.flatMap((file) => importClosureOf(join(FRONTEND, file))).filter((module) => module.endsWith('.ts') || module.endsWith('.tsx'));
  return [...requireSubjects('the research tree and its import closure', [...new Set([...own, ...reached])])].sort();
}

describe('no-write-from-research', () => {
  it('the subject set is the research tree AND its closure — the pages, the components, and the reader they reach', () => {
    const files = subjects();
    // THE FLOOR: the four regions' components and the page are really in it, and the closure really ran —
    // a subject builder that returned only the two directories would pass the rules below over a set that
    // cannot contain a write, which is the vacuity this repository names as its own.
    expect(files).toContain('src/app/[locale]/research/page.tsx');
    // UI-8 chunk 7a: the working view and its body — the page that reads a thesis is under the rule that says
    // a research page never writes one.
    expect(files).toContain('src/app/[locale]/research/theses/[thesisId]/page.tsx');
    expect(files).toContain('src/components/research/ResearchThesis.tsx');
    expect(files).toContain('src/components/research/ResearchDashboard.tsx');
    expect(files).toContain('src/lib/researchFetch.ts');
    expect(files).toContain('src/lib/researchBody.ts');
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('no request under the research pages carries a method other than GET', () => {
    const offenders = requireSubjects('the research tree and its closure', subjects()).flatMap((file) =>
      propertiesNamed(join(FRONTEND, file), 'method')
        .filter((property) => property.source !== "'GET'")
        .map((property) => `${file}:${String(property.line)} method: ${property.source}`),
    );
    expect(ALLOWED.length).toBe(1);
    expect(offenders).toEqual([...ALLOWED]);
  });

  it('nothing under the research pages renders a form, and nothing carries an action attribute', () => {
    const offenders = requireSubjects('the research tree and its closure', subjects()).flatMap((file) =>
      jsxTagsIn(join(FRONTEND, file))
        .filter((tag) => tag.tag === 'form' || 'action' in tag.attributes)
        .map((tag) => `${file}:${String(tag.line)} <${tag.tag}>`),
    );
    expect(offenders).toEqual([]);
  });

  it('the `method` reader really reads properties — the control, over the file that HAS one', () => {
    // WITHOUT THIS THE CASES ABOVE ARE SATISFIED BY A READER THAT FINDS NOTHING. The allowed POST is also the
    // control: the detector is shown to SEE a write before it is trusted to report that there are no others.
    const found = propertiesNamed(join(SRC, 'lib/session.ts'), 'method');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((property) => property.source === "'POST'")).toBe(true);
  });
});
