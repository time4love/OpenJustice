import type { DiffRun } from '@/lib/textDiff';

// ---------------------------------------------------------------------------
// THE INLINE DIFF'S RUNS — ONE RENDERER, TWO SURFACES. docs/gf-ui-flows.md §26 :825's clean-code ruling,
// the researcher's own words: „no duplicate code to produce same element" — the same ruling that produced
// `RecordContent`, applied to the other element these two surfaces share.
//
// THE TWO SURFACES ARE THE THESIS HISTORY AND THE DIFF PAGE. The history diffs two published VERSIONS of a
// researcher's text (T6 :900); the diff page diffs two CAPTURES of an archived page (§26 :852). Different
// subjects, different reads, one element: a run of text marked as unchanged, removed or added. Before this
// extraction each spelled its own `<span>`, its own `data-run` attribute and its own two token classes.
//
// WHY THAT MATTERS MORE THAN IT LOOKS. Two spellings of one mark is one spelling that can drift, and this
// drift would be INVISIBLE — both copies would still render the text, just one of them in the wrong colour
// or with the strike-through on the added side. A reader cannot tell a mislabelled run from a labelled one,
// which is the `RecordContent` defect exactly: „לפני"/„אחרי" drawn against words the backend never wrote.
//
// IT TAKES THE RUNS AS A VALUE and computes nothing. Which two texts were compared, and by what, is each
// surface's own business; `lib/textDiff.ts` is the one differ and this is the one renderer of its output.
//
// `test/recordPageWitnesses.test.tsx` W-11 holds that exactly ONE file under `src/` emits `data-run=`.
// ---------------------------------------------------------------------------

/** The token class for each side of a run — `same` carries none, being the page's own body colour. */
const RUN_CLASS = {
  same: undefined,
  removed: 'bg-seal-tint line-through',
  added: 'bg-olive-tint',
} as const satisfies Record<DiffRun['kind'], string | undefined>;

export function DiffRuns({ runs }: { runs: readonly DiffRun[] }) {
  return (
    <>
      {runs.map((run, index) => (
        <span key={`${run.kind}-${String(index)}`} data-run={run.kind} className={RUN_CLASS[run.kind]}>
          {run.text}
        </span>
      ))}
    </>
  );
}
