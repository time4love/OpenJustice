import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { FRONTEND, SRC, importClosureOf, jsxTagsIn, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// one-stream-two-doors — docs/gf-ui-flows.md §31 :919–:920 ("`/corpus` and `/research/corpus` render from one
// component and differ only by scope, the NOT PUBLIC mark and the extraction sheet; a decoy second stream
// component fails it"), §24 :656–:657, §27; UI plan UI-8 :753, :787, :776 ("the same component, no second
// stream").
//
// TWO HALVES, AND NEITHER IS ENOUGH ALONE.
//
// (1) IDENTITY BY IMPORT CLOSURE. Both doors must REACH the same module file for the stream, the rows, the
// page card, the context line, the claims rows and the record sheet. A scan that only checked the gated page
// imported *something* called `Stream` would be satisfied by a copy under another name.
//
// (2) ONE EMITTER PER ELEMENT. The closure says both doors reach the shared module; it does not say nobody
// ALSO wrote a second one. A `ResearchStream.tsx` that emits its own `data-stream` would sit in the gated
// page's closure beside the real one and half (1) would still pass — so the second half counts, across the
// WHOLE of `src/`, how many files emit each of the stream's own elements. One each, by file.
//
// WHAT THE DOORS ARE ALLOWED TO DIFFER BY is named in the clause and is not this instrument's to check: the
// scope prop, the mark and the sheet. `researchCorpus.test.tsx` holds each of those by value.
// ---------------------------------------------------------------------------

const PUBLIC_DOOR = 'src/app/[locale]/corpus/page.tsx';
const GATED_DOOR = 'src/app/[locale]/research/corpus/page.tsx';
const PUBLIC_CLAIMS = 'src/app/[locale]/corpus/claims/page.tsx';
const GATED_CLAIMS = 'src/app/[locale]/research/corpus/claims/page.tsx';

/** The modules the clause says are ONE, not two. */
const SHARED = [
  'src/components/corpus/Stream.tsx',
  'src/components/corpus/PagesList.tsx',
  'src/components/corpus/PageCard.tsx',
  'src/components/corpus/CorpusContextLine.tsx',
  'src/components/corpus/RecordSheet.tsx',
] as const;

const SHARED_CLAIMS = ['src/components/corpus/Claims.tsx', 'src/components/corpus/CorpusContextLine.tsx'] as const;

/** Every element the stream and its rows own — the things a SECOND stream would have to draw too. */
const ONE_EMITTER = ['data-stream', 'data-pages-list', 'data-capture-row', 'data-diff-card', 'data-record-sheet', 'data-claims', 'data-claim-sheet'] as const;

function closureOf(page: string): string[] {
  return importClosureOf(join(FRONTEND, page)).map((module) => relative(FRONTEND, module));
}

describe('one-stream-two-doors', () => {
  it('the four doors exist and each reaches a non-empty import closure — the floor, before anything is compared', () => {
    const closures = [PUBLIC_DOOR, GATED_DOOR, PUBLIC_CLAIMS, GATED_CLAIMS].map((page) => ({ page, reached: closureOf(page).length }));
    // A page whose closure is empty is a path that stopped resolving, and every comparison below it would be
    // a comparison of two empty sets — the vacuity this repository names as its own.
    expect(closures).toEqual([
      { page: PUBLIC_DOOR, reached: expect.any(Number) as number },
      { page: GATED_DOOR, reached: expect.any(Number) as number },
      { page: PUBLIC_CLAIMS, reached: expect.any(Number) as number },
      { page: GATED_CLAIMS, reached: expect.any(Number) as number },
    ]);
    for (const { page, reached } of closures) expect({ page, atLeast: reached >= 5 }).toEqual({ page, atLeast: true });
  });

  it('BOTH STREAM DOORS REACH THE SAME MODULE FILE for the stream, the rows, the card, the context line and the record sheet', () => {
    const openDoor = closureOf(PUBLIC_DOOR);
    const gatedDoor = closureOf(GATED_DOOR);
    const missing = requireSubjects('the shared corpus modules', [...SHARED]).flatMap((module) => [
      ...(openDoor.includes(module) ? [] : [`${PUBLIC_DOOR} does not reach ${module}`]),
      ...(gatedDoor.includes(module) ? [] : [`${GATED_DOOR} does not reach ${module}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('BOTH CLAIMS DOORS REACH THE SAME MODULE FILE for the claims rows and the context line', () => {
    const openDoor = closureOf(PUBLIC_CLAIMS);
    const gatedDoor = closureOf(GATED_CLAIMS);
    const missing = requireSubjects('the shared claims modules', [...SHARED_CLAIMS]).flatMap((module) => [
      ...(openDoor.includes(module) ? [] : [`${PUBLIC_CLAIMS} does not reach ${module}`]),
      ...(gatedDoor.includes(module) ? [] : [`${GATED_CLAIMS} does not reach ${module}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('EXACTLY ONE FILE UNDER src/ EMITS EACH OF THE STREAM`S OWN ELEMENTS — a second stream has nowhere to hide', () => {
    const files = requireSubjects('source files under src/', sourceFiles(SRC, ['.ts', '.tsx']));
    const emitters = Object.fromEntries(
      ONE_EMITTER.map((attribute) => [
        attribute,
        // SORTED, so the assertion is about the SET of emitters and not about the order `sourceFiles` walks.
        files.filter((file) => jsxTagsIn(file).some((tag) => attribute in tag.attributes)).map((file) => relative(FRONTEND, file)).sort(),
      ]),
    );
    expect(emitters).toEqual({
      'data-stream': ['src/components/corpus/Stream.tsx'],
      'data-pages-list': ['src/components/corpus/PagesList.tsx'],
      // TWO EMITTERS, BOTH NAMED, AND THE SECOND IS NOT A COPY OF THE FIRST. `/records/[fileHash]` is the
      // OUTSIDER'S landing page (UI-7 chunk (c)): it lists the captures that hold ONE record's bytes, keyed by
      // their instant (`data-capture-row={capture.capture}`), which is a different element with the same name
      // rather than a second stream row. Pinning the SET rather than the count keeps a third emitter red while
      // stating why the second is allowed to exist.
      'data-capture-row': ['src/app/[locale]/records/[fileHash]/page.tsx', 'src/components/corpus/Stream.tsx'],
      'data-diff-card': ['src/components/corpus/Stream.tsx'],
      'data-record-sheet': ['src/components/corpus/RecordSheet.tsx'],
      'data-claims': ['src/components/corpus/Claims.tsx'],
      'data-claim-sheet': ['src/components/corpus/Claims.tsx'],
    });
  });

  it('THE DETECTOR REALLY SEES AN ATTRIBUTE — the control, over a file that HAS one', () => {
    // Without this the case above is satisfied by a reader that finds nothing anywhere: every list would be
    // empty, and `toEqual` would fail — but on a WRONG reading of the tree rather than on a second stream.
    const found = jsxTagsIn(join(SRC, 'components/corpus/Stream.tsx')).filter((tag) => 'data-stream' in tag.attributes);
    expect(found.length).toBe(1);
    // And the element really is in the file's own bytes, so the parser and the text agree.
    expect(readFileSync(join(SRC, 'components/corpus/Stream.tsx'), 'utf8')).toContain('data-stream');
  });
});
