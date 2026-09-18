import { ICONS } from '@/components/glyphs';

// ---------------------------------------------------------------------------
// THE ONE FOLD THE READ'S FOUR REGIONS SHARE — docs/gf-ui-refactor-plan.md §10 :1123, word for word:
// "the case, the history, the pages and VERIFY as folds, closed"; canvas page 2 board A's `.fold`
// (`build.mjs` :89), drawn CLOSED on the phone boards and opened only for the board's own sake.
//
// THE BUILD HAD ONE FOLD AND THREE OPEN SECTIONS. Measured on the deployed page:
// `detailsElementsInTheRead: 1` — „לבדיקת הערכים" was a real `<details>`, and „נימוקי הפרסום",
// „גרסאות שפורסמו" and „העמודים" were `<h2>` headings over open content. A reader met the whole page
// at once, and the page's own headings were LARGER than the researcher's (R59 · T2).
//
// `<details>` AND NOT A `useState` DISCLOSURE, for three reasons that are not style: it is closed by
// default with no state to initialise, its content stays IN THE DOCUMENT while closed — so a crawler,
// a screen reader and `statement-and-disclaimer-first` all still reach it — and the keyboard and the
// accessible name come from the element rather than from a prop nobody remembers to pass. It is also
// what VERIFY already was, so this component is the shape that was already right, given three more
// callers instead of being spelled four times.
//
// NO NEW STRING. Each region's heading was already approved and already landing; it moves from an
// `<h2>` to the `<summary>` and is the same value from the same key.
// ---------------------------------------------------------------------------

export interface FoldProps {
  /** The region's own approved label — the trigger's accessible name, and its only text. */
  summary: string;
  /** Marks the ONE fold that is also a home for exact values (`no-id-as-text`'s `data-verify`). */
  verify?: boolean;
  children: React.ReactNode;
}

export function Fold({ summary, verify, children }: FoldProps) {
  return (
    <details className="fold" {...(verify === true ? { 'data-verify': '' } : {})}>
      <summary className="fold-summary">
        {summary}
        <ICONS.chevron className="fold-chevron" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
