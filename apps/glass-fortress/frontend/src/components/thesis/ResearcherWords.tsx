import type { ReactNode } from 'react';

/**
 * THE RESEARCHER'S VOICE — docs/gf-ui-flows.md §16 :517–:521. Their words, rendered as given: the
 * statement, the rationale, a call item, a request, the body's intake instruction. ONE component, so
 * `three-voices` (UI-8) has a single subject to hold, and `dir="auto"` so a Hebrew block reads
 * right-to-left on an English page too (§17 :533–:534).
 *
 * IT CARRIES THE SERIF, and from UI-5 that is the point rather than a detail: `[data-researcher-words]`
 * is the selector that applies `--font-serif` to the researcher's words wherever they appear — F8's
 * repair, and the first of §1.8's two voices to be spelled in CSS at all.
 *
 * `as` EXISTS FOR EXACTLY ONE CALLER. The folded preface's trigger is a `<button>`, whose content model
 * is phrasing content, and a `<div>` inside it is invalid HTML. The statement has to sit inside the
 * trigger — it IS the trigger's accessible name, which is why the fold needs no new string — so the one
 * caller that needs a `<span>` asks for one. Everything else keeps the block.
 */
export function ResearcherWords({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'span' }) {
  const Tag = as;
  return (
    <Tag data-researcher-words dir="auto" className={className}>
      {children}
    </Tag>
  );
}
