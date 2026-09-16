import type { ReactNode } from 'react';

/**
 * THE RESEARCHER'S VOICE — docs/gf-ui-flows.md §16 :517–:521. Their words, rendered as given: the statement, the
 * rationale, a call item, a request, the body's intake instruction. ONE component, so `three-voices` (UI-8) has a
 * single subject to hold, and `dir="auto"` so a Hebrew block reads right-to-left on an English page too
 * (§17 :533–:534).
 */
export function ResearcherWords({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-researcher-words dir="auto" className={className}>
      {children}
    </div>
  );
}
