import { z } from 'zod';
import {
  captureName,
  captureRow,
  heldTextKey,
  heldTextsFor,
  loadEvidenceLinkage,
  lookupCapture,
  type CaptureEntry,
  type PageRef,
} from '../../services/corpusReads';
import { storedAttributionFor } from '../../services/evidencePredicates';
import { answer, refusal, notACapture, openPage, pageByUrl, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// get_capture({ url, capture, textHash? }) — PUBLIC — docs/gf-evidence-flows.md A4, the clause ruled
// 2026-09-19 on the cold design review the researcher commissioned and accepted whole; docs/gf-ui-flows.md
// §26 clause (3); docs/gf-ui-refactor-plan.md :555, this step's ONE declared exception to "frontend only".
//
// ONE CAPTURE: the row `list_findings` already returns for it, PLUS its `text`.
//
// WHY A RESOURCE AND NOT AN ARGUMENT ON `list_findings`, in the design's own terms, because the alternative
// was ruled on and rejected rather than never considered. A list tool with a single-item mode makes its
// RETURN TYPE depend on its argument — one row in a `captures` array whose `counts` then lie; it runs the
// WHOLE page's timeline to answer one row, since `findingsOf` loads every capture, every diff, the
// attribution and the linkage; it makes `list_findings` a conditional superset of `list_corpus` against
// `listCorpus.ts`' own parity clause; and as an MCP tool it becomes a list that sometimes returns a whole
// document into a model's context, keyed on an optional argument.
//
// IT IS THE SIBLING OF THE MOUNTED CHAIN ROUTE, and that is the precedent the shape follows:
// `GET /api/pages/:trackedUrlId/captures/:capture` beside `…/captures/:capture/chain`.
//
// `textHash` IS THE CLAUSE THAT MATTERS LATER, and it is built now although nothing calls it yet. A
// CITATION's text is the text AT ITS PIN — `heldTextsFor` reads a superseded `textVersion` — while a capture
// read by `(page, capture)` is the CURRENT extraction. After a re-extraction the thesis pane and the corpus
// sheet therefore show different bytes for what a reader calls one record, correctly. Without `textHash` the
// thesis page could never move to reading on open WITHOUT CHANGING WHAT IT SHOWS, so the argument is the
// difference between a read this platform can grow into and one it would have to replace.
//
// NO CHAIN CALL AND NO SECOND QUERY. The anchor verdict is the STORED one, exactly as the timeline's row
// carries it; `check_on_chain_status` remains the one place the chain is asked, bounded by one record.
// ---------------------------------------------------------------------------

export const getCaptureSchema = {
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  capture: z
    .string()
    .describe('The capture, by its 14-digit wayback timestamp — never a date'),
  textHash: z
    .string()
    .optional()
    .describe('The extraction to read, by its text hash. Omitted, the answer is the capture CURRENT text.'),
};

interface CaptureRead {
  page: { url: string; public: boolean };
  /** The timeline's own row for this capture — one composition, never a second spelling of it. */
  capture: CaptureEntry;
  /** The bytes: the extraction `textHash` names, or the current one. */
  text: string;
  /**
   * WHICH extraction the `text` is, always stated — never left for the caller to assume it got what it
   * asked for. A reader comparing a thesis citation's bytes against this read's needs to see, in the
   * answer, whether the two are the same extraction; the alternative is two texts that differ for a reason
   * nothing on the page explains.
   */
  textHash: string;
  /** True when no `textHash` was asked for, so the bytes are the capture's CURRENT extraction. */
  current: boolean;
}

/**
 * THE ONE FUNCTION behind the tool and `GET /api/pages/:trackedUrlId/captures/:capture`.
 *
 * The three refusals are A4's, and no fourth is invented here — including for a `textHash` naming an
 * extraction this capture does not hold, which A4 :1082 rules is `NOT_A_CAPTURE` in that code's
 * malformed-argument voice.
 *
 * `capture` IS REQUIRED IN THE TYPE, not checked at run time. Both callers supply it — the MCP handler
 * through its schema, the route through its path segment — so an absent one is unrepresentable rather than
 * refused. The earlier draft carried a refusal for it, and `@typescript-eslint/no-unnecessary-condition`
 * named the comparison as having no overlap the moment the parameter stopped being optional: a branch no
 * input can reach is not a guard, it is a message nobody will ever read and a case nobody can ever write.
 */
export async function captureAt(
  ref: PageRef,
  value: string,
  textHash: string | undefined,
): Promise<CaptureRead | Refusal<'NOT_SURVEYED' | 'NOT_PUBLIC' | 'NOT_A_CAPTURE'>> {
  const page = await ref.load();
  if (page === null) return ref.missing();

  const access = await openPage(page);
  if (access.refused !== null) return access.refused;

  const lookup = await lookupCapture(page, value);
  if (lookup.state !== 'ACQUIRED') return notACapture(page, 'capture', value, lookup);
  const { capture } = lookup;

  // THE ROW IS `corpusReads`', the same composition `list_findings` uses — the design says "the row this
  // clause already returns for it", so re-spelling the fields here would be a second answer to one question.
  // Both reads are by this capture's id alone, so neither walks the page's timeline.
  const attribution = await storedAttributionFor([capture.id]);
  const linkage = await loadEvidenceLinkage([captureName(page, capture)]);
  const row = captureRow(page, capture, attribution, linkage);

  const wanted = textHash ?? capture.textHash;
  const texts = await heldTextsFor([{ snapshotId: capture.id, textHash: wanted }]);
  const text = texts.get(heldTextKey(capture.id, wanted));
  if (text === undefined) {
    // A `textHash` naming an extraction this capture does not hold is a MALFORMED ARGUMENT about the
    // capture, and it takes NOT_A_CAPTURE's own MALFORMED voice rather than a fourth code A4 does not name.
    // It is NEVER answered with the current text: silently returning bytes other than the ones asked for is
    // the fabrication class this platform exists to refuse.
    return refusal(
      'NOT_A_CAPTURE',
      `capture=${value} holds no extraction with textHash=${wanted}. A capture's text is named by the ` +
        'extraction that produced it; omit textHash to read the capture CURRENT text, which ' +
        `list_findings url=${page.url} reports for every capture it holds.`,
    );
  }

  return { page: { url: page.url, public: access.public }, capture: row, text, textHash: wanted, current: textHash === undefined };
}

export async function getCaptureHandler(input: { url: string; capture: string; textHash?: string }): Promise<string> {
  return answer(() => captureAt(pageByUrl(input.url), input.capture, input.textHash));
}
