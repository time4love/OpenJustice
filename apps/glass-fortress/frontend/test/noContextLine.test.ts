import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FRONTEND, declarationsOf, importsOf, jsxTagsIn, publicThesisModules, requireSubjects, stringsIn } from './scan';

// ---------------------------------------------------------------------------
// no-context-line — docs/gf-ui-flows.md §4 :159 and §17 :531, both as amended 2026-09-18;
// docs/gf-thesis-flows.md A2 :1268 (`title` is REMOVED — "the claim is the heading").
//
// THE STICKY CONTEXT LINE IS RETIRED, AND NOT AS A DISPLAY DECISION. The pattern is real — a short title
// bar once the heading scrolls past — and it has ONE precondition: A SHORT NAME. This platform has none,
// so the line was handed the CLAIM and showed 640px of 3,497 (18% of a 558-character sentence, cut
// mid-clause), identifying nothing. It also MOUNTED on scroll rather than rendering and sticking, so it
// inserted 29px into the flow under a reader's eye. It returns when a thesis has a name; until then
// nothing may re-add it, and before this file NOTHING HELD THAT.
//
// WHY THERE IS NO RENDER ARM, and it is the whole reason this is a SOURCE scan. The component returned
// `null` until an `IntersectionObserver` reported the heading gone — and jsdom has no
// `IntersectionObserver`, so it rendered nothing here even while it was landed. A render case asserting
// "no [data-context-line] in the tree" would have been GREEN on the code that still shipped the line:
// the exact "green over an unexercised property" shape `test/render.tsx` :148–:151 names, and a red-first
// claim it could never honour. The SOURCE is where the retirement is observable, so the source is what
// this reads.
//
// EVERY CASE CARRIES ITS OWN POSITIVE CONTROL. An absence case is satisfied by a reader that sees
// nothing at all, so each one below asserts, with the SAME reader, something the tree genuinely holds:
// a file that does exist, markers that are there, a rule that is declared. A reader blinded by a bad
// path or a changed helper then fails here rather than passing everywhere.
// ---------------------------------------------------------------------------

/** What the retired element was called, in each spelling a re-addition could use. */
const RETIRED_COMPONENT = 'ContextLine';
const RETIRED_MARKER = 'data-context-line';
const RETIRED_RULE = '.sticky-line';

/** Markers the public thesis surface genuinely draws — the positive control for the two node readers. */
const MARKERS_THAT_ARE_THERE = ['data-thesis-text', 'data-intake', 'data-preface'];

const modules = (): string[] => [...requireSubjects('public thesis modules', publicThesisModules())];

describe('no-context-line', () => {
  it('the component file is gone — and the reader can see a file of the same surface that is not', () => {
    const componentDir = 'src/components/thesis';
    expect({
      retired: existsSync(join(FRONTEND, componentDir, `${RETIRED_COMPONENT}.tsx`)),
      // The control: a sibling that MUST exist, so a wrong directory fails here instead of reading as absence.
      control: existsSync(join(FRONTEND, componentDir, 'Appeals.tsx')),
    }).toEqual({ retired: false, control: true });
  });

  it('no module of the public thesis surface imports a context line', () => {
    const offenders = modules().flatMap((moduleName) =>
      importsOf(join(FRONTEND, moduleName))
        .filter(({ specifier, module: resolved }) => (resolved ?? specifier).includes(RETIRED_COMPONENT))
        .map(({ specifier }) => `${moduleName} imports '${specifier}'`),
    );
    expect(offenders).toEqual([]);
  });

  it('no source of the public thesis surface draws the marker or names the rule — and the same readers find markers that ARE drawn', () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const moduleName of modules()) {
      const file = join(FRONTEND, moduleName);
      for (const tag of jsxTagsIn(file)) {
        for (const attribute of Object.keys(tag.attributes)) {
          if (attribute === RETIRED_MARKER) offenders.push(`${moduleName}:${String(tag.line)} <${tag.tag} ${attribute}>`);
          if (MARKERS_THAT_ARE_THERE.includes(attribute)) seen.add(attribute);
        }
        const className = tag.attributes['className'] ?? '';
        if (className.includes(RETIRED_RULE.slice(1))) offenders.push(`${moduleName}:${String(tag.line)} className names ${RETIRED_RULE}`);
      }
      for (const found of stringsIn(file)) {
        if (found.text.includes(RETIRED_MARKER) || found.text.includes(RETIRED_RULE.slice(1))) {
          offenders.push(`${moduleName}:${String(found.line)} '${found.text.trim().slice(0, 48)}'`);
        }
      }
    }
    // The control is asserted in the SAME expect as the offences: a reader that found no marker at all
    // has not proved an absence, and reporting that separately is how a blinded scan reads as a pass.
    expect({ offenders, controlsSeen: [...seen].sort() }).toEqual({ offenders: [], controlsSeen: [...MARKERS_THAT_ARE_THERE].sort() });
  });

  it('globals.css declares no sticky-line rule — and the reader is not blind: it still reads a rule that IS declared', () => {
    expect(() => declarationsOf(RETIRED_RULE)).toThrow(`globals.css declares no \`${RETIRED_RULE}\` rule at all`);
    expect(declarationsOf('.sheet').get('position')).toBe('fixed');
  });

  it("THE SCROLLER SURVIVES ITS REASON: `html, body` still declares all three values, though the line that justified them is gone", () => {
    // The retirement's one real hazard. `html, body { overflow: hidden }` was written for TWO bugs
    // (globals.css :145–:165): the sidebar riding up over a band of empty paper, and the sticky line
    // resolving against a scrollport that slid off the top. Only the SECOND subject was retired. With
    // its comment now saying so, a later reader could take the whole rule for the retired line's
    // leftover — so the values are held BY VALUE here, not merely declared (R59 · chunk 3: a stated
    // limit on a value the board fixes is a debt, not a note).
    const declared = declarationsOf('html, body');
    expect({
      overflow: declared.get('overflow'),
      maxWidth: declared.get('max-width'),
      height: declared.get('height'),
    }).toEqual({ overflow: 'hidden', maxWidth: '100vw', height: '100%' });
  });
});
