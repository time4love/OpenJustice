'use client';

import { useId, useState } from 'react';
import { ICONS } from '@/components/glyphs';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { ResearcherProse } from './ResearcherProse';

// ---------------------------------------------------------------------------
// THE FOLDED PREFACE — docs/gf-ui-design-session-2026-09-16.md §1.5; docs/gf-ui-refactor-plan.md
// §10 :1120–:1121 and :1126; canvas page 2, boards B and C, board C being the ruling.
//
// ONE ELEMENT THAT GROWS, ruled by the researcher 2026-09-17 („אפשרות ב”) after seeing both options
// rendered side by side. `<main>` sees FIVE children and `children[1]` is THE CLAIM.
//
// CLOSED AND OPEN HOLD THE SAME DOM, and that is the whole of how a fold keeps document order:
//   · the statement is rendered WHOLE and VERBATIM and shortened in CSS — `text-overflow: ellipsis`
//     over the full string, exactly as the board's `.prefold .one` does it. No `.slice()`, no
//     paraphrase, no second copy of the text.
//   · the disclaimer is IN THE DOCUMENT when collapsed — hidden with a class, never `{open && …}`.
//     Find-in-page reaches it, `textContent` reads it, and "the first two elements of `<main>` in
//     document order" is true of the bytes and not only of the picture.
//
// `<details>` IS NOT USED. Its `<summary>` would be a THIRD copy of the statement's opening words, and
// its disclosure triangle is a glyph nobody chose.
//
// THE TRIGGER'S ACCESSIBLE NAME IS THE STATEMENT ITSELF, which is why this fold adds NO new string:
// the control opens the very words it shows, so naming it anything else would be naming it twice.
//
// A THESIS WITH NO STATEMENT renders the disclaimer FIRST and nothing above it (§23 :639–:640) — there
// is nothing to fold, so there is no trigger.
// ---------------------------------------------------------------------------

export function PrefaceFold({ statement }: { statement: string | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hasStatement = statement !== null && statement.trim() !== '';

  if (!hasStatement) {
    return (
      <div data-preface>
        <LegalDisclaimer form="full" />
      </div>
    );
  }

  return (
    <div data-preface data-preface-open={open ? 'true' : undefined} className="preface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((was) => !was);
        }}
        className="preface-trigger"
      >
        {/* THE TRIGGER HOLDS THE RENDERED BLOCKS (§16 :521): a block inside a `<button>` re-parses
            byte-identical, unlike a block inside a `<p>`. `links="text"` is the one constraint that
            survives — a `<button>` may hold NO interactive descendant, and `<https://…>` is a CommonMark
            autolink the researcher may well write.

            THE CLAMP READS `flow-root` IN THE BROWSER AND THE RULE IS STILL THE ONE RUNNING. Measured on
            the real body: the served stylesheet carries `display: -webkit-box`, and Chromium reports the
            COMPUTED display of a `-webkit-box` under `-webkit-line-clamp` as `flow-root`. A wrapper was
            written here first, on the theory that the flex container was blockifying it away; the numbers
            before and after were identical — 62px shown of 166px, three lines — so the wrapper was
            removed. A fix that changes no measurement was a fix for a defect that was not there. */}
        <ResearcherProse
          text={statement}
          links="text"
          className={`preface-statement ${open ? '' : 'preface-clamped'}`.trim()}
        />
        <ICONS.chevron className="preface-chevron" />
      </button>
      <div id={id} className={`preface-panel ${open ? '' : 'preface-shut'}`.trim()}>
        <LegalDisclaimer form="full" />
      </div>
    </div>
  );
}
