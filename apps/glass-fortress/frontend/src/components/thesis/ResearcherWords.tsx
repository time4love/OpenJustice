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
 * `as` IS GONE, AND THE RULING IS WHY. It existed for exactly one caller: the folded preface's trigger is a
 * `<button>`, so the statement went in as a `<span>` to keep the markup valid. §16 :521 (the researcher,
 * 2026-09-18) now has that trigger hold the RENDERED BLOCKS — a block inside a `<button>` re-parses
 * byte-identical, unlike a block inside a `<p>`, measured with `DOMParser` — so the one caller that needed a
 * span no longer does, and a prop with no caller is dead code.
 *
 * IT IS THE FACE AND NOT THE RENDERING. `ResearcherProse` is what renders the researcher's Markdown; this
 * component is the element that carries their serif wherever their voice appears.
 */
export function ResearcherWords({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-researcher-words dir="auto" className={className}>
      {children}
    </div>
  );
}
