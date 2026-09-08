import { getResearcherId } from '../../context/researcherContext';
import { publicPage } from '../../services/evidencePredicates';
import type { Page } from '../../services/corpusReads';

// ---------------------------------------------------------------------------
// THE EVIDENCE READS' REFUSALS — docs/gf-evidence-flows.md A4's conventions.
//
// "Every refusal is a JSON `{ error, code }`, never a throw." One module holds
// the shape and the CLOSED SET of codes these four reads may return, so a
// refusal with a code the contract does not name fails to compile rather than
// reaching a caller as a new word.
//
// WHY THIS IS NOT `src/walk/refusals.ts`. That module holds the same property
// for the walk's tools and lives under `src/walk`, which this step must leave
// byte-identical (`git diff staging -- src/walk` empty). Two modules, one per
// layer, each closed over its own contract's codes — rather than one module
// edited across a boundary the refactor plan draws. If the two ever need to be
// one, that is a change to the walk's files and belongs to a step that may make
// it.
//
// THE ONE GATE. A4: "PUBLIC reads take no identity and answer identically for
// everyone. Access to a page's timeline is gated by PUBLIC_PAGE for a caller
// without identity — THAT IS ACCESS, NOT A SECOND BEHAVIOUR: the output never
// depends on who asks."
// ---------------------------------------------------------------------------

/**
 * Every code A4 names for `list_findings`, `get_diff_input`, `resolve_record`
 * and `check_on_chain_status`, transcribed whole. Nothing else may be returned.
 */
export type EvidenceReadCode =
  | 'NOT_SURVEYED'
  | 'NOT_PUBLIC'
  | 'NOT_A_CAPTURE'
  | 'NO_SUCH_DIFF'
  | 'AWAITING_DERIVATION'
  | 'NOT_A_RECORD'
  | 'CHAIN_UNAVAILABLE';

export interface Refusal {
  error: string;
  code: EvidenceReadCode;
}

export function refusal(code: EvidenceReadCode, error: string): Refusal {
  return { error, code };
}

/** The refusals these reads share, worded once. */
export const shared = {
  notSurveyed: (url: string): Refusal =>
    refusal(
      'NOT_SURVEYED',
      `${url} is not in the corpus. Survey it first: survey_wayback_captures url=${url}`,
    ),
  notPublic: (url: string): Refusal =>
    refusal(
      'NOT_PUBLIC',
      `${url} is a researcher's working corpus: no published thesis cites any record of it, so ` +
        'its timeline is not public. A page becomes public in full — every capture and every diff — ' +
        'the moment a published thesis cites any record of it.',
    ),
};

/**
 * The PUBLIC_PAGE gate — asked ONCE per call, answering both questions it
 * decides: may this caller read the page, and is the page public.
 *
 * A caller WITH an identity reads every page; a caller without one reads a page
 * a published thesis has opened. What comes back after the gate is the same
 * bytes either way — the gate decides ACCESS and never CONTENT, which is why
 * `citedBy` lists published citations for a researcher too, and why a
 * researcher reading a private page is told `public: false` rather than shown
 * something an outsider would not see.
 */
export type PageAccess = { refused: Refusal } | { refused: null; public: boolean };

export async function openPage(page: Page): Promise<PageAccess> {
  const isPublic = await publicPage(page.id);
  if (!isPublic && getResearcherId() === null) return { refused: shared.notPublic(page.url) };
  return { refused: null, public: isPublic };
}

/** A tool's answer as the MCP text: the value, or the refusal, as JSON. */
export async function answer<T>(body: () => Promise<T | Refusal>): Promise<string> {
  return JSON.stringify(await body());
}
