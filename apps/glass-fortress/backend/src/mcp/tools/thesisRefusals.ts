// ---------------------------------------------------------------------------
// THE THESIS LAYER'S REFUSALS — docs/gf-thesis-flows.md A4's conventions.
//
// "Every refusal is a JSON `{ error, code }`, never a throw." One module holds
// the shape and the CLOSED SET of codes the thesis tools may return, so a refusal
// with a code the contract does not name fails to COMPILE rather than reaching a
// caller as a new word — which is what `test/thesis/tools.ts`' code-set equality
// then holds from the other side.
//
// A THIRD MODULE, ONE PER LAYER, and for the reason `mcp/tools/evidenceRefusals.ts`
// states in its own header: `src/walk/refusals.ts` holds this property for the
// walk and `evidenceRefusals.ts` for the evidence layer, "two modules, one per
// layer, each closed over its own contract's codes — rather than one module edited
// across a boundary the refactor plan draws". Widening the evidence set to admit
// `NO_FRAMING` would make it refusable by four tools whose contract never names it.
// ---------------------------------------------------------------------------

/**
 * Every code thesis A4 names for the thesis tools built so far, transcribed whole — the four FRAMING tools
 * (step 19): `open_framing` :1434–:1440 · `assess_framing` :1442–:1450 · `choose_framing` :1452–:1456 ·
 * `get_framing` :1458–:1459 — the VERSION WRITE and its reads (step 20): `create_thesis` :1461–:1466 ·
 * `add_thesis_version` :1468–:1474 · `get_thesis_context` :1476–:1479 · `add_note` :1520–:1521 — and ANALYSIS AND
 * GAPS (step 22): `run_analysis` :1481–:1486 · `decide_gap` :1488–:1494 · `draft_foia_request` :1496–:1499, with
 * NO_HEAD the flows' (T4 :583, :626, :665) and NO_SUCH_GAP on `decide_gap` the researcher's (2026-09-14) — and
 * PUBLICATION (step 23): `check_publication_readiness` :1506–:1508 · `publish_thesis` :1510–:1514 · `unpublish_thesis`
 * :1516–:1518. NAMES_PERSON is in NO set: the researcher ruled (2026-09-14) that a person named in an appeal fails check
 * 16 at publication, over the appeals that publish, so no tool refuses it.
 *
 * `NO_FRAMING` is COINED — ruled at thesis step 17: `NOT_YOURS` would call a framing that does not exist
 * someone else's, which is a false statement to a researcher. `NO_THESIS` for a `thesisId` naming none is
 * step 17's Q2. The A4 amendments naming them are owed with the others (`test/thesis/contract.ts` TOOLS).
 */
export type ThesisToolCode =
  | 'NO_RESEARCHER'
  | 'NO_THESIS'
  | 'NO_FRAMING'
  | 'NOT_AUTHOR'
  | 'NOT_YOURS'
  | 'NO_PROVISION_SHAPE'
  | 'PUBLISHED'
  | 'NO_SUCH_RUN'
  | 'NO_RECORDS'
  | 'NOT_A_RECORD'
  | 'NOT_ACQUIRED'
  | 'AWAITING_DERIVATION'
  // DOCUMENT PLAN STEP 33 (document flows A4 :1452–:1453, as conformed 2026-09-24): a `#doc_` citation of a document
  // whose content was taken back — never AWAITING, because nothing is owed (A3 :1371). The version write's arm.
  | 'SHED'
  | 'UNKNOWN_TRAJECTORY_ID'
  | 'NOT_ASSESSED'
  | 'PROVISION_MISMATCH'
  | 'STALE_HEAD'
  | 'STALE_PIN'
  | 'CLAIM_MISMATCH'
  | 'FRAMING_ATTACHED'
  | 'EMPTY'
  | 'NEITHER'
  | 'NO_HEAD'
  | 'ANALYSIS_CURRENT'
  | 'NO_SUCH_GAP'
  | 'NOT_CITED'
  | 'REASON_REQUIRED'
  | 'REQUEST_REQUIRED'
  | 'CALL_ITEM_REQUIRED'
  | 'STALE_SEQUENCE'
  | 'NOTHING_NEW'
  | 'NOT_PUBLISHABLE'
  | 'NOT_PUBLISHED';

export interface Refusal<C extends ThesisToolCode = ThesisToolCode> {
  error: string;
  code: C;
}

export function refusal<C extends ThesisToolCode>(code: C, error: string): Refusal<C> {
  return { error, code };
}

/** A value that is a refusal rather than an answer — the one discriminant every handler reads. */
export function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && 'error' in value && 'code' in value;
}

/** Every handler's envelope: the answer or the refusal, as JSON, never a throw. */
export async function answer<T>(body: () => Promise<T>): Promise<string> {
  return JSON.stringify(await body());
}
