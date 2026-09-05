import { StaleSequenceError } from './pageLog';

// ---------------------------------------------------------------------------
// REFUSALS — docs/gf-interaction-flows.md A5: every refusal is a JSON
// `{ error, code }`, never a throw. One module holds the shape, the closed set
// of codes, and the one mapping the tools share: a StaleSequenceError thrown
// by the page log inside a tool's transaction becomes the STALE_SEQUENCE
// refusal HERE and nowhere else (pageLog.test.ts holds that the string lives
// in exactly one module). Any other error is not a refusal and propagates.
// ---------------------------------------------------------------------------

/**
 * Every code A5 names, transcribed whole — the survey's, this step's four
 * tools', the two reads' and scan_captures' — so step 5 adds nothing here and
 * the set cannot drift from the contract one tool at a time. A refusal with a
 * code the contract does not name fails to compile.
 */
export type RefusalCode =
  | 'NO_RESEARCHER'
  | 'NOT_SURVEYED'
  | 'ARCHIVE_UNAVAILABLE'
  | 'INVALID_MAX_CAPTURES'
  | 'REGISTRY_FROZEN'
  | 'STALE_SEQUENCE'
  | 'REASON_REQUIRED'
  | 'NO_DRAFT'
  | 'DRAFT_NOT_RETURNED'
  | 'DRAFT_FOR_OTHER_CAPTURE'
  | 'CAPTURE_NOT_MARKABLE'
  | 'EMPTY_RULESET_UNCONFIRMED'
  | 'NOT_PENDING'
  | 'INVALID_RESOLUTION'
  | 'NOTHING_TO_RETIRE'
  | 'INVALID_OUTCOME';

export interface Refusal {
  error: string;
  code: RefusalCode;
}

export function refusal(code: RefusalCode, error: string): Refusal {
  return { error, code };
}

/** The refusals every write tool shares, worded once. */
export const shared = {
  noResearcher: (act: string): Refusal =>
    refusal('NO_RESEARCHER', `${act} is attributed to a researcher. No researcher in context.`),
  notSurveyed: (url: string): Refusal =>
    refusal('NOT_SURVEYED', `${url} is not in the corpus. Survey it first: survey_wayback_captures url=${url}`),
  reasonRequired: (act: string): Refusal =>
    refusal('REASON_REQUIRED', `${act} requires a reason; a blank one is no reason.`),
};

/**
 * Run a tool's body and answer as the MCP text: the body's value as JSON, or
 * the STALE_SEQUENCE refusal when the page's sequence moved under the write.
 */
export async function answer<T>(body: () => Promise<T | Refusal>): Promise<string> {
  try {
    return JSON.stringify(await body());
  } catch (err) {
    if (err instanceof StaleSequenceError) return JSON.stringify(refusal('STALE_SEQUENCE', err.message));
    throw err;
  }
}
