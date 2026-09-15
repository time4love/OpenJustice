import { z } from 'zod';
import {
  captureName,
  captureRow,
  diffName,
  diffRow,
  loadCaptures,
  loadDiffs,
  loadEvidenceLinkage,
  loadPage,
  type CaptureEntry,
  type DiffEntry,
} from '../../services/corpusReads';
import { currentVersionOf, storedAttributionFor } from '../../services/evidencePredicates';
import { answer, openPage, shared, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// list_findings({ url }) — PUBLIC — docs/gf-evidence-flows.md A4.
//
// THE PAGE'S TIMELINE, AND IT IS THE SAME LIST FOR EVERYONE. §4: "The triage
// list IS the page's public timeline. `list_findings` is `get_forensic_timeline`
// repaired — the pair by timestamps, the current version, the opinion labelled,
// linkage to published citations — and a researcher reads the same list an
// outsider does, with no parameter and no identity. What a researcher adds is a
// thesis in view, and that lives on the thesis side, not on the read."
//
// ORDERED BY DATE, ALWAYS. "Significance is a model's opinion and may be a
// FILTER the researcher applies by name … never the default order and never a
// hidden threshold. A list that sorts by an opinion presents the opinion as the
// ranking, which is the sentence Level 8 forbids."
//
// TWO REGISTERS, NEVER MIXED. `current.chunks` is computed from the two texts;
// `opinion` is a model's draw about them, in its own object, null when nothing
// classified this derivation. `test/opinionsNotFacts.test.ts` holds the shape as
// a property over the keys, so a field added to the opinion tomorrow cannot
// arrive at the top level of an entry.
//
// WHAT THIS READ REPLACED, AND WHY IT MATTERS THAT IT REFUSES BY NAME. Its
// predecessor read the legacy diff columns the walk had stopped writing and
// answered "nothing has been looked at" in the shape of a real negative, with no
// code and no way for the reader to tell (docs/gf-walk-corrective-pass-2026-09-08.md).
// Here every absence is named: `current: null` with `awaitingDerivation: true`,
// `opinion: null`, `evidence: null`, `attributed: null`.
// ---------------------------------------------------------------------------

export const listFindingsSchema = {
  url: z.url().describe('The page — exact URL, as it was surveyed'),
};

interface Findings {
  page: { url: string; public: boolean };
  /**
   * The sizes, counted here so no reader counts by hand (a live model miscounted 21 diffs as 19
   * and eight rows as seven, 2026-09-13). `captures` is what the platform HOLDS — the moments the
   * page moved — not the archive's total; `list_captures` carries every archived row.
   */
  counts: { captures: number; diffs: number; awaitingDerivation: number };
  captures: CaptureEntry[];
  diffs: DiffEntry[];
}

export async function listFindingsHandler(input: { url: string }): Promise<string> {
  return answer(async (): Promise<Findings | Refusal> => {
    const page = await loadPage(input.url);
    if (page === null) return shared.notSurveyed(input.url);

    const access = await openPage(page);
    if (access.refused !== null) return access.refused;

    const captures = await loadCaptures(page.id);
    const diffs = await loadDiffs(page.id);

    // ONE query for every capture's stored anchor verdict, and NO chain call:
    // a public timeline that asked the chain once per capture would be
    // unbounded work for an anonymous caller. `check_on_chain_status` is where
    // the chain is asked, bounded by one record.
    const attribution = await storedAttributionFor(captures.map((c) => c.id));

    const names = [
      ...captures.map((c) => captureName(page, c)),
      ...diffs.map((d) => diffName(page, d)),
    ];
    const linkage = await loadEvidenceLinkage(names);

    // The ACQUIRED captures are what NARROWED reads: a capture between two
    // endpoints narrows the pair only if the corpus holds its text (§7).
    const acquired = captures.map((c) => c.capture);

    const awaitingDerivation = diffs.filter(
      (diff) => !currentVersionOf({ kind: 'DIFF', before: diff.before, after: diff.after, versions: diff.versions }).defined,
    ).length;

    return {
      page: { url: page.url, public: access.public },
      counts: { captures: captures.length, diffs: diffs.length, awaitingDerivation },
      // THE ROWS ARE `corpusReads`' — one composition for this read and for `list_corpus` across pages (UI-2).
      captures: captures.map((capture) => captureRow(page, capture, attribution, linkage)),
      diffs: diffs.map((diff) => diffRow(page, diff, acquired, linkage)),
    };
  });
}
