import { ResearcherWords } from './ResearcherWords';

/**
 * FIRST, ALWAYS — COMPLIANCE.md rule 5 :82–:84; docs/gf-ui-flows.md §17 :526–:528, §20 :607. The researcher's
 * own sentence anchoring the investigation in the public interest. A thesis without one renders nothing here,
 * and the disclaimer becomes the page's first element (§23 :639–:640).
 */
export function PublicInterestStatement({ statement }: { statement: string | null }) {
  if (statement === null || statement.trim() === '') return null;
  return <ResearcherWords className="text-base leading-relaxed text-slate-800">{statement}</ResearcherWords>;
}
